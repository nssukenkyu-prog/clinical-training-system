import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../../lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, orderBy } from 'firebase/firestore';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { User, ArrowRight, Activity, ShieldCheck, GraduationCap, Lock, Key } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function StudentEntry() {
    const [step, setStep] = useState('grade'); // 'grade', 'number', 'password'
    const [students, setStudents] = useState([]);
    const [selectedGrade, setSelectedGrade] = useState('');
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [studentData, setStudentData] = useState(null);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    // Verification mode (Registering new password)
    const [isRegistering, setIsRegistering] = useState(false);

    useEffect(() => {
        const fetchStudents = async () => {
            try {
                const studentsRef = collection(db, 'students');
                const q = query(studentsRef);
                const querySnapshot = await getDocs(q);
                let studentsData = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setStudents(studentsData);
            } catch (err) {
                console.error("Error fetching students:", err);
                setError('学生リストの読み込みに失敗しました。');
            }
        };
        fetchStudents();
    }, []);

    // Filtered lists
    const availableGrades = [2, 3, 4];
    const filteredStudents = students.filter(s => s.grade === parseInt(selectedGrade)).sort((a, b) => a.student_number.localeCompare(b.student_number));

    const handleGradeSelect = (grade) => {
        setSelectedGrade(grade);
        setStep('number');
        setError('');
    };

    const handleStudentSelect = (studentId) => {
        const student = students.find(s => s.id === studentId);
        if (student) {
            setStudentData(student);
            setSelectedStudentId(studentId);
            setStep('password');
            setError('');

            // Determine if registration is needed
            if (student.password_set || student.initial_password) {
                setIsRegistering(!student.password_set && !student.initial_password); // Should generally be false here if logic covers it
            }
        }
    };

    const handleBack = () => {
        if (step === 'password') {
            setStep('number');
            setStudentData(null);
            setSelectedStudentId('');
            setPassword('');
            setConfirmPassword('');
        } else if (step === 'number') {
            setStep('grade');
            setSelectedGrade('');
        }
        setError('');
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // Case 1: Already Registered (Firebase Auth)
            if (studentData.password_set) {
                await signInWithEmailAndPassword(auth, studentData.email, password);
            }
            // Case 2: Initial Password (Local Auth)
            else if (studentData.initial_password) {
                if (password !== studentData.initial_password) {
                    throw new Error("初期パスワードが違います。");
                }
                // If initial password matches, redirect to registration (setting their own password)
                // BUT user requested "Login", so we might just log them in? 
                // The implementation plan implies maintaining "First-time vs Returning".
                // If using initial password, they should probably SET a new password immediately?
                // For simplicity and matching user request "Password Input -> Login",
                // if they are NOT registered, we treat this as the "First Time Login" which might prompt registration?
                // Let's stick to the previous logic: if initial password works, they log in. 
                // Wait, request said "Student Login: Change Flow". 
                // Let's implement: If password_set is false, show "Set Password" fields?
                // Or just use the input password.

                // Let's check logic from previous version: 
                // If password_set false -> "Register".

                // New Flow Requirement: Grade -> Number -> Name (Auto) -> Password -> Login.
                // This implies a single password field.

                // If user enters 'Initial Password' correctly, we should probably let them in OR ask to change.
                // Let's assume for now:
                // If password_set is TRUE: Login with Auth.
                // If password_set is FALSE: Login with Initial Password -> THEN maybe prompt change? 
                // Or, if they enter a NEW password?

                // Let's follow standard simplified flow:
                // If !password_set, we need them to Register.
                // But the UI shows "Name -> Password". 
                // If we want to support Registration in this flow, we need to know if we are registering.

            } else {
                throw new Error("認証情報がありません。");
            }

            // Perform Session Set
            sessionStorage.setItem('clinical_student_id', studentData.id);
            sessionStorage.setItem('clinical_student_name', studentData.name);
            navigate('/student/dashboard');

        } catch (err) {
            console.error("Login failed:", err);
            // Error handling
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
                setError('パスワードが正しくありません。');
            } else if (err.message) {
                setError(err.message);
            } else {
                setError('ログインに失敗しました。');
            }
        } finally {
            setLoading(false);
        }
    };

    // Split logic: If not password_set, force Registration Flow *after* verifying initial password?
    // OR: Just simplify.
    // Let's stick to: 
    // If student.password_set is FALSE: 
    //    Show "Initial Password" field. 
    //    Verify Initial Password. 
    //    Show "New Password" & "Confirm" fields.
    // It's safer to keep the existing logic but wrapped in the new UI.

    const isRegistrationNeeded = studentData && !studentData.password_set;

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');

        if (password.length < 6) {
            setError('パスワードは6文字以上で設定してください。');
            return;
        }
        if (password !== confirmPassword) {
            setError('パスワードが一致しません。');
            return;
        }

        setLoading(true);

        try {
            // Create Auth User
            const userCredential = await createUserWithEmailAndPassword(auth, studentData.email, password);

            // Update Firestore
            await updateDoc(doc(db, 'students', studentData.id), {
                password_set: true,
                auth_user_id: userCredential.user.uid
            });

            // Session
            sessionStorage.setItem('clinical_student_id', studentData.id);
            sessionStorage.setItem('clinical_student_name', studentData.name);
            navigate('/student/dashboard');
        } catch (err) {
            console.error(err);
            if (err.code === 'auth/email-already-in-use') {
                setError('既に登録されています。管理者にお問い合わせください。');
            } else {
                setError('登録に失敗しました。');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-slate-50">
            {/* Background Gradients (Same as Admin Login) */}
            <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-blue-200/40 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-indigo-200/40 rounded-full blur-[100px] pointer-events-none" />

            <div className="w-full max-w-md relative z-10">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 shadow-xl shadow-blue-500/20 mb-4">
                        <GraduationCap className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900 mb-2">
                        学生ログイン
                    </h1>
                    <p className="text-slate-500">
                        臨床実習ポータル
                    </p>
                </div>

                <div className="glass-panel p-8 rounded-2xl shadow-2xl bg-white/80">
                    <AnimatePresence mode="wait">
                        {step === 'grade' && (
                            <motion.div
                                key="grade"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                <h2 className="text-lg font-bold text-slate-700 text-center mb-4">学年を選択してください</h2>
                                <div className="grid grid-cols-1 gap-3">
                                    {availableGrades.map(grade => (
                                        <button
                                            key={grade}
                                            onClick={() => handleGradeSelect(grade)}
                                            className="w-full py-4 px-6 rounded-xl bg-white border-2 border-slate-100 hover:border-primary hover:bg-slate-50 text-slate-700 hover:text-primary font-bold text-lg transition-all shadow-sm flex items-center justify-between group"
                                        >
                                            <span>{grade}年生</span>
                                            <ArrowRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {step === 'number' && (
                            <motion.div
                                key="number"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <button onClick={handleBack} className="text-sm text-slate-400 hover:text-slate-600 flex items-center gap-1">← 学年選択へ</button>
                                    <span className="text-sm font-bold text-primary bg-primary/10 px-2 py-1 rounded">{selectedGrade}年生</span>
                                </div>

                                <h2 className="text-lg font-bold text-slate-700 text-center mb-4">学籍番号を選択してください</h2>

                                <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                    {filteredStudents.map(student => (
                                        <button
                                            key={student.id}
                                            onClick={() => handleStudentSelect(student.id)}
                                            className="py-3 px-2 rounded-xl bg-white border border-slate-100 hover:border-primary/50 hover:bg-slate-50 text-slate-700 hover:text-primary font-mono font-medium transition-all text-center text-sm"
                                        >
                                            {student.student_number}
                                        </button>
                                    ))}
                                </div>
                                {filteredStudents.length === 0 && (
                                    <div className="text-center text-slate-400 py-8">
                                        該当する学生がいません
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {step === 'password' && studentData && (
                            <motion.div
                                key="password"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                <button onClick={handleBack} className="text-sm text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-2">← 学籍番号選択へ</button>

                                <div className="text-center mb-6">
                                    <div className="text-sm text-slate-500 font-mono mb-1">{studentData.student_number}</div>
                                    <h2 className="text-2xl font-bold text-slate-900">{studentData.name} <span className="text-base font-normal text-slate-500">さん</span></h2>
                                    {isRegistrationNeeded && (
                                        <p className="text-xs text-amber-600 mt-2 bg-amber-50 inline-block px-2 py-1 rounded">初回パスワード設定が必要です</p>
                                    )}
                                </div>

                                {error && (
                                    <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                                        {error}
                                    </div>
                                )}

                                <form onSubmit={isRegistrationNeeded ? handleRegister : handleLogin} className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700 ml-1">
                                            {isRegistrationNeeded ? '新しいパスワードを設定' : 'パスワード'}
                                        </label>
                                        <div className="relative group">
                                            <Lock className="absolute left-4 top-3.5 w-5 h-5 text-slate-400 group-focus-within:text-primary transition-colors" />
                                            <input
                                                type="password"
                                                className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium shadow-sm"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="••••••••"
                                                required
                                                autoFocus
                                            />
                                        </div>
                                    </div>

                                    {isRegistrationNeeded && (
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-700 ml-1">パスワード（確認）</label>
                                            <div className="relative group">
                                                <Key className="absolute left-4 top-3.5 w-5 h-5 text-slate-400 group-focus-within:text-primary transition-colors" />
                                                <input
                                                    type="password"
                                                    className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium shadow-sm"
                                                    value={confirmPassword}
                                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                                    placeholder="確認のため再入力"
                                                    required
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold hover:shadow-lg hover:shadow-blue-500/25 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group shadow-md"
                                    >
                                        {loading ? (
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                {isRegistrationNeeded ? '設定して開始' : 'ログイン'}
                                                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                                            </>
                                        )}
                                    </button>
                                </form>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className="mt-8 text-center">
                    <a
                        href="/admin/login"
                        className="text-xs text-slate-400 hover:text-primary transition-colors"
                    >
                        管理者はこちら
                    </a>
                </div>
            </div>
        </div>
    );
}
