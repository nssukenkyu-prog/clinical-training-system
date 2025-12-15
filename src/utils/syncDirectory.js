import { collection, getDocs, doc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * Normalizes a name string by removing all whitespace
 */
export const normalizeName = (name) => {
    return name.replace(/[\s\u3000]+/g, '');
};

/**
 * Syncs all students to the public_student_directory collection
 * This allows unauthenticated users to look up their profile by Student ID to log in.
 */
export const syncStudentDirectory = async () => {
    try {
        const studentsRef = collection(db, 'students');
        const snapshot = await getDocs(studentsRef);

        // Batch writes (max 500 per batch)
        const batchSize = 450;
        const chunks = [];
        const docs = snapshot.docs;

        for (let i = 0; i < docs.length; i += batchSize) {
            chunks.push(docs.slice(i, i + batchSize));
        }

        let syncedCount = 0;

        for (const chunk of chunks) {
            const batch = writeBatch(db);

            chunk.forEach(studentDoc => {
                const data = studentDoc.data();
                if (!data.student_number) return;

                const publicDocRef = doc(db, 'public_student_directory', data.student_number.toString());

                batch.set(publicDocRef, {
                    // Minimized public data
                    student_id: data.student_number.toString(),
                    grade: data.grade,
                    name: data.name,
                    search_name: normalizeName(data.name),
                    email: data.email,
                    password_set: data.password_set || false,
                    // We need initial_password for local verification if Auth not set
                    initial_password: data.initial_password || null,
                    original_doc_id: studentDoc.id,
                    updated_at: new Date().toISOString()
                });
                syncedCount++;
            });

            await batch.commit();
        }

        console.log(`Synced ${syncedCount} students to public directory`);
        return { success: true, count: syncedCount };
    } catch (error) {
        console.error('Directory sync failed:', error);
        return { success: false, error };
    }
};
