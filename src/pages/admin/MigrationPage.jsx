import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, doc, setDoc, writeBatch } from 'firebase/firestore';
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { ShieldCheck, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';

// Secondary App for creating users without logging out Admin
const secondaryApp = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
}, "SecondaryApp");

const secondaryAuth = getAuth(secondaryApp);

export default function MigrationPage() {
    const [students, setStudents] = useState([]);
    const [status, setStatus] = useState('idle'); // idle, loading, processing, completed
    const [logs, setLogs] = useState([]);
    const [progress, setProgress] = useState({ current: 0, total: 0, success: 0, fail: 0 });

    useEffect(() => {
        loadStudents();
    }, []);

    const addLog = (msg, type = 'info') => {
        setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${type.toUpperCase()}: ${msg}`, ...prev]);
    };

    const loadStudents = async () => {
        setStatus('loading');
        try {
            const snap = await getDocs(collection(db, 'students'));
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setStudents(data);
            addLog(`Loaded ${data.length} students.`, 'success');
            setStatus('idle');
        } catch (err) {
            addLog(`Error loading students: ${err.message}`, 'error');
        }
    };

    const runMigration = async () => {
        if (!window.confirm('Start migration? This will create Auth users for all students.')) return;

        setStatus('processing');
        setProgress({ current: 0, total: students.length, success: 0, fail: 0 });

        for (let i = 0; i < students.length; i++) {
            const student = students[i];
            setProgress(prev => ({ ...prev, current: i + 1 }));

            try {
                // 1. Shadow Email & Password (Name-based)
                const shadowEmail = `${student.student_number.toLowerCase()}@clinical-system.local`;

                // Flexible Match Password Generation: s{ID}-{Name} (No Spaces)
                // Remove all whitespace (half/full width)
                const normalizedName = student.name.replace(/\s+/g, '');
                if (normalizedName.length < 1) {
                    addLog(`Skipping ${student.student_number}: Name invalid`, 'error');
                    continue;
                }
                const password = `s${student.student_number}-${normalizedName}`;

                // 2. Create/Update Auth User
                let uid = student.auth_user_id;

                if (!uid) {
                    // Create New
                    try {
                        addLog(`Creating Auth for ${student.name}...`);
                        const userCred = await createUserWithEmailAndPassword(secondaryAuth, shadowEmail, password);
                        uid = userCred.user.uid;
                        await updateProfile(userCred.user, { displayName: student.name });
                        addLog(`Auth Created: ${uid}`, 'success');
                    } catch (authErr) {
                        if (authErr.code === 'auth/email-already-in-use') {
                            addLog(`Auth exists for ${student.name}, NOT UPDATING Password. (Manual Reset might be needed if mismatched)`, 'warning');
                            // We can't update password without Admin SDK or logic.
                            // If user is already migrated, we assume it's fine. 
                            // IF we want to FORCE update, we'd need to delete and recreate OR sign-in and update.
                            // Deleting via Client SDK blocked? No, we don't have delete permission usually.
                        } else {
                            throw authErr;
                        }
                    }
                } else {
                    // If UID known, we assume mapped. 
                }

                // 3. Update Firestore (Private Profile Only)
                const batch = writeBatch(db);

                // Private Profile Link
                const privateRef = doc(db, 'students', student.id);
                // We do NOT store the password pattern in plaintext, but we might mark it as "name_auth_v1"
                batch.update(privateRef, {
                    auth_user_id: uid,
                    email: student.email,
                    shadow_email: shadowEmail,
                    auth_mode: 'name_match_v1',
                    migration_status: 'migrated_name_auth'
                });

                // Clean up Public Directory if exists (we are removing this feature)
                const publicRef = doc(db, 'public_student_directory', student.id);
                batch.delete(publicRef);

                await batch.commit();

                addLog(`Migrated ${student.name}`, 'success');
                setProgress(prev => ({ ...prev, success: prev.success + 1 }));

            } catch (err) {
                console.error(err);
                addLog(`Failed ${student.name}: ${err.message}`, 'error');
                setProgress(prev => ({ ...prev, fail: prev.fail + 1 }));
            }

            // Sleep to avoid rate limits
            await new Promise(r => setTimeout(r, 500));
        }

        setStatus('completed');
        addLog('Migration Check Completed.', 'success');
    };

    const fixAdminAccount = async () => {
        const currentUser = getAuth().currentUser;
        if (!currentUser) {
            addLog('Not logged in!', 'error');
            return;
        }

        try {
            addLog(`Checking Admin Account for ${currentUser.email}...`);
            const adminsRef = collection(db, 'admins');
            const q = query(adminsRef, where('email', '==', currentUser.email));
            const snap = await getDocs(q);

            if (snap.empty) {
                addLog('Admin document not found?', 'error');
                return;
            }

            const oldDoc = snap.docs[0];
            if (oldDoc.id === currentUser.uid) {
                addLog('Admin account already fixed (ID matches UID).', 'success');
                return;
            }

            const data = oldDoc.data();

            // Create new doc with UID
            await setDoc(doc(db, 'admins', currentUser.uid), {
                ...data,
                uid: currentUser.uid,
                fixed_at: new Date().toISOString()
            });

            // Delete old doc
            await deleteDoc(doc(db, 'admins', oldDoc.id));
            addLog('Admin account migrated to UID-based key.', 'success');

        } catch (err) {
            console.error(err);
            addLog(`Admin fix failed: ${err.message}`, 'error');
        }
    };

    const rebuildAvailabilityCache = async () => {
        if (!window.confirm('Rebuild availability cache for ALL slots?')) return;
        setStatus('processing');
        addLog('Starting Cache Rebuild...', 'info');

        try {
            // 1. Fetch ALL Reservations
            addLog('Fetching all reservations...', 'info');
            const resSnap = await getDocs(collection(db, 'reservations'));
            const reservations = resSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            addLog(`Found ${reservations.length} total reservations.`, 'info');

            // 2. Group by Slot
            const slotMap = {}; // slotId -> [reservations]
            reservations.forEach(r => {
                if (!slotMap[r.slot_id]) slotMap[r.slot_id] = [];
                slotMap[r.slot_id].push(r);
            });

            // 3. Update Slots
            const slotsToUpdate = Object.keys(slotMap);
            setProgress({ current: 0, total: slotsToUpdate.length, success: 0, fail: 0 });

            // We iterate slots that HAVE reservations. Slots without reservations have empty cache (default) or need clearing?
            // Ideally we should also clear slots that HAVE a cache but NO reservations now. 
            // But for now, let's just fix the active ones. 
            // Ideally: Fetch ALL slots, and for each slot, find matching reservations (or use the map).

            // Let's Fetch ALL Slots to be robust (clearing old cache if reservation deleted)
            addLog('Fetching all slots...', 'info');
            const slotsSnap = await getDocs(collection(db, 'slots'));
            const allSlots = slotsSnap.docs;

            for (let i = 0; i < allSlots.length; i++) {
                const slotDoc = allSlots[i];
                const slotId = slotDoc.id;
                const slotReservations = slotMap[slotId] || []; // List or empty

                // Build Cache
                const cache = slotReservations
                    .filter(r => r.status !== 'cancelled')
                    .map(r => ({
                        start: r.custom_start_time || r.slot_start_time,
                        end: r.custom_end_time || r.slot_end_time,
                        status: r.status,
                        reservation_id: r.id
                    }));

                // Update
                try {
                    await updateDoc(doc(db, 'slots', slotId), {
                        availability_cache: cache
                    });
                    setProgress(prev => ({ ...prev, success: prev.success + 1, current: i + 1 }));
                } catch (e) {
                    console.error(e);
                    addLog(`Failed to update slot ${slotId}`, 'error');
                    setProgress(prev => ({ ...prev, fail: prev.fail + 1 }));
                }
            }

            addLog('Cache Rebuild Complete.', 'success');

        } catch (e) {
            console.error(e);
            addLog(`Fatal Error: ${e.message}`, 'error');
        } finally {
            setStatus('completed');
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold flex items-center gap-2">
                <ShieldCheck className="text-emerald-500" />
                Security Migration Tool
            </h1>

            <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 text-amber-800 flex items-start gap-3">
                <AlertTriangle className="shrink-0 mt-0.5" />
                <div>
                    <p className="font-bold">Warning: Database Modification</p>
                    <p className="text-sm">
                        This tool will create "Shadow Auth" accounts for all students found in the `students` collection.
                        It will also populate `public_student_directory`.
                        Ensure you are logged in as Admin.
                    </p>
                </div>
            </div>

            <div className="glass-panel p-6 bg-white rounded-xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="font-bold text-lg">Migration Status</h2>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                        status === 'processing' ? 'bg-blue-100 text-blue-700' :
                            'bg-slate-100 text-slate-600'
                        }`}>
                        {status.toUpperCase()}
                    </span>
                </div>

                <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                        <span>Progress</span>
                        <span>{progress.current} / {progress.total}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-indigo-500 transition-all duration-300"
                            style={{ width: `${(progress.current / Math.max(progress.total, 1)) * 100}%` }}
                        />
                    </div>
                    <div className="flex gap-4 mt-2 text-xs font-mono">
                        <span className="text-emerald-600">Success: {progress.success}</span>
                        <span className="text-rose-600">Fail: {progress.fail}</span>
                    </div>
                </div>

                <button
                    onClick={runMigration}
                    disabled={status === 'processing' || students.length === 0}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                >
                    {status === 'processing' ? <RefreshCw className="animate-spin w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                    Start Student Migration
                </button>

                <div className="mt-4 pt-4 border-t border-slate-100 flex gap-4">
                    <button
                        onClick={fixAdminAccount}
                        className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                        <ShieldCheck className="w-4 h-4" />
                        Fix My Admin Account
                    </button>

                    <button
                        onClick={rebuildAvailabilityCache}
                        className="flex-1 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Rebuild Slot Cache
                    </button>
                </div>
            </div>

            <div className="glass-panel p-4 bg-slate-900 text-slate-300 rounded-xl font-mono text-xs h-64 overflow-y-auto custom-scrollbar">
                {logs.map((log, i) => (
                    <div key={i} className={log.includes('ERROR') ? 'text-rose-400' : log.includes('SUCCESS') ? 'text-emerald-400' : ''}>
                        {log}
                    </div>
                ))}
                {logs.length === 0 && <span className="opacity-50">Waiting to start...</span>}
            </div>
        </div>
    );
}
