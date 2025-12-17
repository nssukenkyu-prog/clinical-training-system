import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, getDocs, addDoc, writeBatch, doc, where, orderBy, deleteDoc, updateDoc, setDoc } from 'firebase/firestore';
import { Users, Search, Plus, Upload, Mail, Check, X, Filter, Trash2, Pencil, Clock, Eye, EyeOff, RefreshCw, Key } from 'lucide-react';
import { clsx } from 'clsx';

export default function StudentManagement() {
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedStudentForDetail, setSelectedStudentForDetail] = useState(null);
    const [formData, setFormData] = useState({
        studentNumber: '',
        email: '',
        name: '',
        grade: 2,
        trainingType: 'I'
    });
    const [editingStudent, setEditingStudent] = useState(null);
    const [csvData, setCsvData] = useState('');
    const [filter, setFilter] = useState({ grade: 'all', trainingType: 'all' });
    const [sending, setSending] = useState(false);
    const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());
    const [visiblePasswords, setVisiblePasswords] = useState(new Set());
    const [resetRegistration, setResetRegistration] = useState(false);
    const [inputPassword, setInputPassword] = useState('');

    useEffect(() => {
        loadStudents();
    }, []);

    const loadStudents = async () => {
        try {
            // Fetch all students
            const studentsRef = collection(db, 'students');
            const qStudents = query(studentsRef, orderBy('student_number'));
            const studentsSnapshot = await getDocs(qStudents);
            const studentsData = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Fetch all completed reservations to calculate total minutes
            const reservationsRef = collection(db, 'reservations');
            const qReservations = query(reservationsRef, where('status', '==', 'completed'));
            const reservationsSnapshot = await getDocs(qReservations);
            const reservationsData = reservationsSnapshot.docs.map(doc => doc.data());

            // Merge reservations into students
            const studentsWithStats = studentsData.map(student => {
                const studentReservations = reservationsData.filter(r => r.student_id === student.id);
                return {
                    ...student,
                    reservations: studentReservations
                };
            });

            setStudents(studentsWithStats);
        } catch (error) {
            console.error("Error loading students:", error);
        } finally {
            setLoading(false);
        }
    };

    // Helper to generate random 8 char password
    const generatePassword = () => {
        const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
        let pass = "";
        for (let i = 0; i < 8; i++) {
            pass += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return pass;
    };

    const getFilteredStudents = () => {
        return students.filter(s => {
            if (filter.grade !== 'all' && s.grade !== parseInt(filter.grade)) return false;
            if (filter.trainingType !== 'all' && s.training_type !== filter.trainingType) return false;
            return true;
        });
    };

    // Secondary Auth for administrative creation
    const [secondaryAuth, setSecondaryAuth] = useState(null);

    useEffect(() => {
        // Initialize secondary app for creating users without signing out admin
        import('firebase/app').then(({ initializeApp }) => {
            import('firebase/auth').then(({ getAuth }) => {
                const config = {
                    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
                    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
                    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
                    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
                    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
                    appId: import.meta.env.VITE_FIREBASE_APP_ID
                };
                // Avoid dup name error by checking if already exists? 
                // Simple workaround: Try/Catch or unique name
                try {
                    const secApp = initializeApp(config, "AdminWorkerApp");
                    setSecondaryAuth(getAuth(secApp));
                } catch (e) {
                    // If already exists, get it (difficult without exposing app in global). 
                    // Ideally we move this to a lib.
                    // For now, assume single mount or ignore re-init error if we can access the instance?
                    // Actually, re-render might cause issue.
                    // Let's rely on standard flow.
                }
            });
        });
    }, []);

    // Helper: Create Shadow User
    const createShadowUser = async (studentNumber, name, password) => {
        if (!secondaryAuth) return null;
        try {
            const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
            const shadowEmail = `${studentNumber.toLowerCase()}@clinical-system.local`;
            const userCred = await createUserWithEmailAndPassword(secondaryAuth, shadowEmail, password);
            await updateProfile(userCred.user, { displayName: name });
            return { uid: userCred.user.uid, shadowEmail };
        } catch (e) {
            console.error("Shadow Auth Creation Failed:", e);
            return null;
        }
    };

    // Helper functions for random password
    const generateRandomPassword = () => {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let pass = '';
        for (let i = 0; i < 8; i++) {
            pass += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return pass;
    };

    const handleAddStudent = async (e) => {
        e.preventDefault();

        if (!inputPassword) {
            alert('パスワードを入力してください');
            return;
        }

        try {
            // 1. Create Shadow Auth using Input Password
            const shadowEmail = `${formData.studentNumber.toLowerCase()}@clinical-system.local`;

            const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
            const userCred = await createUserWithEmailAndPassword(secondaryAuth, shadowEmail, inputPassword);
            const uid = userCred.user.uid;

            await updateProfile(userCred.user, { displayName: formData.name });

            // 2. Create in Firestore
            await setDoc(doc(db, 'students', uid), {
                student_number: formData.studentNumber,
                email: formData.email,
                name: formData.name,
                grade: parseInt(formData.grade),
                training_type: formData.trainingType,
                auth_user_id: uid,
                shadow_email: shadowEmail,
                auth_mode: 'admin_managed',
                password_changed: false,
                current_password_plaintext: inputPassword,
                created_at: new Date().toISOString()
            });

            setShowModal(false);
            setFormData({ studentNumber: '', email: '', name: '', grade: 2, trainingType: 'I' });
            setInputPassword('');
            loadStudents();
            alert('学生を登録しました。');

        } catch (error) {
            console.error(error);
            if (error.code === 'auth/email-already-in-use') {
                alert(`学籍番号 ${formData.studentNumber} は既に登録されています。`);
            } else {
                alert('学生登録に失敗しました: ' + error.message);
            }
        }
    };

    const handleBulkImport = async () => {
        if (!csvData.trim()) {
            alert('CSVデータを入力してください');
            return;
        }
        if (!secondaryAuth) {
            alert('システム初期化中です。少々お待ちください。');
            return;
        }

        const lines = csvData.trim().split('\n');

        setSending(true);

        try {
            // We process one by one to create Auth users serially
            // Limiting for large batches might be needed, but assuming small operation for now.
            let successCount = 0;
            const batch = writeBatch(db);
            const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');

            // Limit batch size? Firestore limit is 500.
            // Loop
            for (const line of lines) {
                const [studentNumber, email, name, grade, trainingType, csvPassword] = line.split(',').map(s => s.trim());
                if (!studentNumber) continue;

                // 1. Auth (Name-Based)
                const shadowEmail = `${studentNumber.toLowerCase()}@clinical-system.local`;
                // Generate Pw
                const normalizedName = name.replace(/\s+/g, '');
                // Default: s{ID}-{Name} if no password provided
                const password = csvPassword || `s${studentNumber.toLowerCase()}-${normalizedName}`;

                let uid = null;

                try {
                    const userCred = await createUserWithEmailAndPassword(secondaryAuth, shadowEmail, password);
                    await updateProfile(userCred.user, { displayName: name });
                    uid = userCred.user.uid;
                } catch (e) {
                    console.warn(`Auth failed for ${name}:`, e.code);
                    // For bulk, if auth fails (e.g. email exists), we might skip or continue.
                    // If we can't get UID, we can't link effectively for strict rules.
                    // But maybe the user already exists in Auth?
                    // Let's assume for now we skip DB creation if Auth fails to avoid misalignment.
                    continue;
                }

                // 2. DB Refs
                // Use UID as Doc ID for consistency with Single Add
                const newDocRef = doc(db, 'students', uid);

                // Private
                batch.set(newDocRef, {
                    student_number: studentNumber,
                    email,
                    name,
                    grade: parseInt(grade) || 2,
                    training_type: trainingType || 'I',
                    password_set: true,
                    initial_password: null,
                    auth_user_id: uid,
                    shadow_email: shadowEmail,
                    password_changed: false,
                    current_password_plaintext: password,
                    created_at: new Date().toISOString()
                });

                // Public
                const publicRef = doc(db, 'public_student_directory', uid);
                batch.set(publicRef, {
                    name,
                    student_number: studentNumber,
                    grade: parseInt(grade) || 2,
                    training_type: trainingType || 'I'
                });

                successCount++;
            }

            await batch.commit();

            setShowBulkModal(false);
            setCsvData('');
            loadStudents();
            alert(`${successCount}名の学生を登録しました\n※各学生へのパスワード通知を忘れずに行ってください。`);

        } catch (error) {
            console.error(error);
            alert('一括登録中にエラーが発生しました');
        } finally {
            setSending(false);
        }
    };

    const handleResendInvite = async (student) => {
        if (!window.confirm(`${student.name}さんに招待メールを再送信しますか？`)) return;

        // Placeholder for Worker call
        alert('招待メール再送信機能はCloudflare Worker実装後に利用可能です');
    };

    const getTrainingTypeLabel = (type) => {
        const labels = { 'I': '実習Ⅰ', 'II': '実習Ⅱ', 'IV': '実習Ⅳ' };
        return labels[type] || type;
    };

    const getTotalMinutes = (student) => {
        const completed = (student.reservations || []); // Already filtered for completed in loadStudents
        return completed.reduce((sum, r) => sum + (r.actual_minutes || 0), 0);
    };

    const formatTime = (minutes) => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours}h${mins}m`;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-primary border-t-white/0 rounded-full animate-spin"></div>
            </div>
        );
    }

    const filteredStudents = getFilteredStudents();

    const handleDeleteStudent = async (student) => {
        if (!window.confirm(`「${student.name}」を削除しますか？\n※この操作は取り消せません。`)) return;

        try {
            await deleteDoc(doc(db, 'students', student.id));
            alert('削除しました');
            loadStudents();
        } catch (error) {
            console.error("Error deleting student:", error);
            alert('削除に失敗しました');
        }
    };

    const handleEditClick = (student) => {
        setEditingStudent({ ...student });
        // Use the same form data structure for editing
        setFormData({
            studentNumber: student.student_number,
            email: student.email,
            name: student.name,
            grade: student.grade,
            trainingType: student.training_type
        });
        setInputPassword(student.initial_password || '');
        setResetRegistration(false);
        setShowModal(true);
    };

    const handleUpdateStudent = async (e) => {
        e.preventDefault();
        if (!editingStudent) return;

        try {
            const updates = {
                student_number: formData.studentNumber,
                email: formData.email,
                name: formData.name,
                grade: formData.grade,
                training_type: formData.trainingType,
            };

            // Password update logic
            if (inputPassword !== editingStudent.initial_password || resetRegistration) {
                updates.initial_password = inputPassword;
                if (resetRegistration || !editingStudent.password_set) {
                    updates.password_set = false;
                    updates.auth_user_id = null; // Reset auth link
                }
            }

            await updateDoc(doc(db, 'students', editingStudent.id), updates);

            alert('更新しました');
            setShowModal(false);
            setEditingStudent(null);
            setFormData({ studentNumber: '', email: '', name: '', grade: 2, trainingType: 'I' });
            loadStudents();
        } catch (error) {
            console.error("Error updating student:", error);
            alert('更新に失敗しました');
        }
    };

    const handleRowClick = (student, e) => {
        // Prevent modal open if checkbox or action buttons are clicked
        if (e.target.closest('button') || e.target.closest('input[type="checkbox"]')) return;

        setSelectedStudentForDetail(student);
        setShowDetailModal(true);
    };

    // Modify handleAddStudent to verify if we are editing or adding
    const handleSaveStudent = async (e) => {
        if (editingStudent) {
            handleUpdateStudent(e);
        } else {
            handleAddStudent(e);
        }
    };



    const handleToggleSelect = (studentId) => {
        const newSelected = new Set(selectedStudentIds);
        if (newSelected.has(studentId)) {
            newSelected.delete(studentId);
        } else {
            newSelected.add(studentId);
        }
        setSelectedStudentIds(newSelected);
    };

    const togglePasswordVisibility = (studentId) => {
        const newVisible = new Set(visiblePasswords);
        if (newVisible.has(studentId)) {
            newVisible.delete(studentId);
        } else {
            newVisible.add(studentId);
        }
        setVisiblePasswords(newVisible);
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedStudentIds(new Set(filteredStudents.map(s => s.id)));
        } else {
            setSelectedStudentIds(new Set());
        }
    };

    const handleBulkDelete = async () => {
        if (selectedStudentIds.size === 0) return;
        if (!window.confirm(`選択した ${selectedStudentIds.size} 名の学生を削除しますか？\n※この操作は取り消せません。`)) return;

        try {
            const batch = writeBatch(db);
            selectedStudentIds.forEach(id => {
                batch.delete(doc(db, 'students', id));
            });
            await batch.commit();
            alert('削除しました');
            setSelectedStudentIds(new Set());
            loadStudents();
        } catch (error) {
            console.error("Error bulk deleting students:", error);
            alert('一括削除に失敗しました');
        }
    };

    const handleExportCSV = () => {
        if (filteredStudents.length === 0) {
            alert('出力するデータがありません');
            return;
        }

        const headers = ['学籍番号', '氏名', 'メールアドレス', '学年', '実習区分', 'パスワード', '累積時間(分)'];
        const rows = filteredStudents.map(s => [
            s.student_number,
            s.name,
            s.email,
            s.grade,
            s.training_type,
            s.current_password_plaintext || 'N/A',
            getTotalMinutes(s)
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `学生一覧_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
    };

    const isAllSelected = filteredStudents.length > 0 && selectedStudentIds.size === filteredStudents.length;

    return (
        <div className="space-y-8 pt-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">学生管理</h1>
                    <p className="text-slate-500 mt-1">学生の登録・編集・進捗確認を行います</p>
                </div >
                <div className="flex gap-3">
                    {selectedStudentIds.size > 0 && (
                        <button
                            onClick={handleBulkDelete}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 transition-colors shadow-sm font-bold"
                        >
                            <Trash2 className="w-4 h-4" />
                            <span>{selectedStudentIds.size}件を削除</span>
                        </button>
                    )}
                    <button
                        onClick={() => {
                            setEditingStudent(null);
                            setFormData({ studentNumber: '', email: '', name: '', grade: 2, trainingType: 'I' });
                            setInputPassword(generatePassword());
                            setShowModal(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                    >
                        <Plus className="w-4 h-4" />
                        <span>学生を追加</span>
                    </button>
                    {/* ... CSV Button ... */}
                    <button
                        onClick={() => setShowBulkModal(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
                    >
                        <Upload className="w-4 h-4" />
                        <span>CSV一括登録</span>
                    </button>
                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
                    >
                        <Upload className="w-4 h-4 rotate-180" />
                        <span>CSV出力</span>
                    </button>
                </div>
            </div >

            {/* Filters */}
            <div className="glass-panel p-4 rounded-xl flex flex-wrap items-center gap-4 bg-white shadow-sm border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500">
                    <Filter className="w-4 h-4" />
                    <span className="text-sm font-medium">フィルター:</span>
                </div>
                <select
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-700 transition-colors"
                    value={filter.grade}
                    onChange={e => setFilter({ ...filter, grade: e.target.value })}
                >
                    <option value="all">全学年</option>
                    <option value="2">2年生</option>
                    <option value="3">3年生</option>
                    <option value="4">4年生</option>
                </select>
                <select
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-700 transition-colors"
                    value={filter.trainingType}
                    onChange={e => setFilter({ ...filter, trainingType: e.target.value })}
                >
                    <option value="all">全実習</option>
                    <option value="I">実習Ⅰ</option>
                    <option value="II">実習Ⅱ</option>
                    <option value="IV">実習Ⅳ</option>
                </select>
                <div className="ml-auto text-sm text-slate-500">
                    {filteredStudents.length}名 表示中
                </div>
            </div >

            {/* Student List */}
            < div className="glass-panel rounded-2xl overflow-hidden bg-white shadow-lg border-slate-100" >
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50">
                                <th className="px-6 py-4 text-left">
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-300 text-primary focus:ring-primary"
                                        checked={isAllSelected}
                                        onChange={handleSelectAll}
                                    />
                                </th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500">学籍番号</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500">氏名</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500">学年</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500">実習区分</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500">パスワード</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500">累積時間</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredStudents.map(student => (
                                <tr
                                    key={student.id}
                                    className={`hover:bg-slate-50 transition-colors cursor-pointer ${selectedStudentIds.has(student.id) ? 'bg-slate-50' : ''}`}
                                    onClick={(e) => handleRowClick(student, e)}
                                >
                                    <td className="px-6 py-4">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-300 text-primary focus:ring-primary"
                                            checked={selectedStudentIds.has(student.id)}
                                            onChange={() => handleToggleSelect(student.id)}
                                        />
                                    </td>
                                    <td className="px-6 py-4 text-sm font-mono text-slate-600">{student.student_number}</td>
                                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{student.name}</td>
                                    <td className="px-6 py-4 text-sm text-slate-500">{student.grade}年</td>
                                    <td className="px-6 py-4 text-sm">
                                        <span className="px-2 py-1 rounded text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                            {getTrainingTypeLabel(student.training_type)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-mono text-slate-600">
                                        <div className="flex items-center gap-2">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-1">
                                                    <span className="bg-slate-100 px-2 py-1 rounded border border-slate-200 min-w-[80px] text-center font-mono text-xs">
                                                        {visiblePasswords.has(student.id) ? (
                                                            student.current_password_plaintext ||
                                                            student.initial_password || 'N/A'
                                                        ) : '••••••••'}
                                                    </span>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            togglePasswordVisibility(student.id);
                                                        }}
                                                        className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                                                    >
                                                        {visiblePasswords.has(student.id) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-mono text-primary font-bold">{formatTime(getTotalMinutes(student))}</td>
                                    <td className="px-6 py-4 flex items-center gap-3">
                                        <button
                                            onClick={() => handleEditClick(student)}
                                            className="text-slate-400 hover:text-indigo-600 transition-colors p-1"
                                            title="編集"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteStudent(student)}
                                            className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                                            title="削除"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>


            {/* Add/Edit Student Modal */}
            {
                showModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)}>
                        <div className="glass-panel p-6 rounded-2xl w-full max-w-md bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold text-slate-900">{editingStudent ? '学生情報を編集' : '学生を追加'}</h3>
                                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <form onSubmit={handleSaveStudent} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">学籍番号</label>
                                    <input
                                        type="text"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:border-primary text-slate-900 transition-colors"
                                        value={formData.studentNumber}
                                        onChange={e => setFormData({ ...formData, studentNumber: e.target.value })}
                                        placeholder="24ca000"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">メールアドレス</label>
                                    <input
                                        type="email"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:border-primary text-slate-900 transition-colors"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="student@example.com"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">氏名</label>
                                    <input
                                        type="text"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:border-primary text-slate-900 transition-colors"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="山田 太郎"
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">学年</label>
                                        <select
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:border-primary text-slate-900 transition-colors"
                                            value={formData.grade}
                                            onChange={e => setFormData({ ...formData, grade: parseInt(e.target.value) })}
                                        >
                                            <option value={2}>2年生</option>
                                            <option value={3}>3年生</option>
                                            <option value={4}>4年生</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">実習区分</label>
                                        <select
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:border-primary text-slate-900 transition-colors"
                                            value={formData.trainingType}
                                            onChange={e => setFormData({ ...formData, trainingType: e.target.value })}
                                        >
                                            <option value="I">実習Ⅰ</option>
                                            <option value="II">実習Ⅱ</option>
                                            <option value="IV">実習Ⅳ</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="border-t border-slate-100 pt-4 mt-2">
                                    <label className="block text-sm font-medium text-slate-700 mb-2">パスワード設定</label>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-xs text-slate-500 mb-1 block">初期パスワード</label>
                                            <div className="flex items-center gap-2">
                                                <div className="relative flex-1">
                                                    <Key className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                                    <input
                                                        type="text"
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:border-primary text-slate-900 transition-colors font-mono"
                                                        value={inputPassword}
                                                        onChange={e => setInputPassword(e.target.value)}
                                                        placeholder="パスワード"
                                                        required
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setInputPassword(generatePassword())}
                                                    className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                                                    title="新しいパスワードを生成"
                                                >
                                                    <RefreshCw className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>

                                        {editingStudent && editingStudent.password_set && (
                                            <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                                                <input
                                                    type="checkbox"
                                                    id="resetRegistration"
                                                    className="mt-1 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                                    checked={resetRegistration}
                                                    onChange={e => setResetRegistration(e.target.checked)}
                                                />
                                                <label htmlFor="resetRegistration" className="text-sm text-amber-800 cursor-pointer">
                                                    <span className="font-bold block text-xs mb-0.5">登録状態をリセットする</span>
                                                    学生は次回ログイン時に、この初期パスワードを使って再度パスワードを設定する必要があります。
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="pt-4">
                                    <button
                                        type="submit"
                                        className="w-full px-4 py-3 rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 font-bold"
                                    >
                                        {editingStudent ? '更新' : '登録'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* CSV Bulk Import Modal */}
            {
                showBulkModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowBulkModal(false)}>
                        <div className="glass-panel p-6 rounded-2xl w-full max-w-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold text-slate-900">CSV一括登録</h3>
                                <button onClick={() => setShowBulkModal(false)} className="text-slate-400 hover:text-slate-600">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="mb-6 p-4 rounded-xl bg-blue-50 border border-blue-100 text-blue-700 text-sm">
                                <strong className="block mb-1">CSV形式:</strong> 学籍番号,メールアドレス,氏名,学年,実習区分<br />
                                <span className="text-blue-500">例: 24ca000,yamada@example.com,山田太郎,2,I</span>
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-medium text-slate-700 mb-2">CSVデータ</label>
                                <textarea
                                    className="w-full h-64 bg-slate-50 border border-slate-200 rounded-xl p-4 font-mono text-sm focus:outline-none focus:border-primary text-slate-900 transition-colors resize-none"
                                    value={csvData}
                                    onChange={e => setCsvData(e.target.value)}
                                    placeholder={`24ca000,yamada@example.com,山田太郎,2,I\n24ca001,tanaka@example.com,田中花子,2,I`}
                                />
                            </div>

                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors font-medium"
                                    onClick={() => setShowBulkModal(false)}
                                >
                                    キャンセル
                                </button>
                                <button
                                    type="button"
                                    className="px-6 py-2 rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed font-bold"
                                    onClick={handleBulkImport}
                                    disabled={sending}
                                >
                                    {sending ? '登録中...' : '一括登録'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Student Detail Modal */}
            {
                showDetailModal && selectedStudentForDetail && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowDetailModal(false)}>
                        <div className="glass-panel p-6 rounded-2xl w-full max-w-lg bg-white shadow-2xl overflow-y-auto max-h-[80vh]" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                        {selectedStudentForDetail.name}
                                        <span className="text-sm font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-mono">{selectedStudentForDetail.student_number}</span>
                                    </h3>
                                    <p className="text-slate-500 text-sm">{selectedStudentForDetail.grade}年 / 実習{selectedStudentForDetail.training_type}</p>
                                </div>
                                <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-600">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="space-y-6">
                                {/* Stats Cards */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100">
                                        <div className="text-xs text-indigo-600 font-bold mb-1 uppercase tracking-wider">現在の累積時間</div>
                                        <div className="text-2xl font-bold text-indigo-900">
                                            {formatTime(getTotalMinutes(selectedStudentForDetail))}
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                                        <div className="text-xs text-emerald-600 font-bold mb-1 uppercase tracking-wider">予約数</div>
                                        <div className="text-2xl font-bold text-emerald-900">
                                            {selectedStudentForDetail.reservations?.length || 0}
                                            <span className="text-sm font-medium text-emerald-600 ml-1">件</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Reservations List */}
                                <div>
                                    <h4 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-slate-400" />
                                        実習履歴
                                    </h4>
                                    {(selectedStudentForDetail.reservations || []).length === 0 ? (
                                        <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-sm">
                                            履歴はありません
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {[...selectedStudentForDetail.reservations].sort((a, b) => new Date(b.slot_date) - new Date(a.slot_date)).map((r, i) => (
                                                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                                                    <div>
                                                        <div className="font-bold text-slate-700 text-sm">
                                                            {r.slot_date} {r.slot_start_time.slice(0, 5)}-{r.slot_end_time.slice(0, 5)}
                                                        </div>
                                                        <div className="text-xs text-slate-500">
                                                            実習{r.slot_training_type}
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1">
                                                        <span className={clsx(
                                                            "text-[10px] px-2 py-0.5 rounded-full font-bold",
                                                            r.status === 'completed' ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                                                        )}>
                                                            {r.status === 'completed' ? '承認済' : '予約中'}
                                                        </span>
                                                        {(r.check_in_time || r.check_out_time) && (
                                                            <div className="text-[10px] text-slate-400 font-mono">
                                                                {r.check_in_time?.slice(0, 5) || '--:--'} - {r.check_out_time?.slice(0, 5) || '--:--'}
                                                            </div>
                                                        )}
                                                        {r.actual_minutes && (
                                                            <span className="text-xs font-mono font-bold text-slate-600">
                                                                {Math.floor(r.actual_minutes / 60)}h{r.actual_minutes % 60}m
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="pt-4 border-t border-slate-100">
                                    <button
                                        onClick={() => setShowDetailModal(false)}
                                        className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold transition-colors"
                                    >
                                        閉じる
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
