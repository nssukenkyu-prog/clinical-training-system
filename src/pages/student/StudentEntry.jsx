import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../../lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, orderBy } from 'firebase/firestore';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { User, ArrowRight, Activity, ShieldCheck, GraduationCap, Lock, Key } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function StudentEntry() {
    const [step, setStep] = useState('check'); // 'check', 'login', 'register'
    const [students, setStudents] = useState([]);
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [studentData, setStudentData] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

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

                // Sort client-side to avoid Firestore index requirements
                studentsData.sort((a, b) => {
                    if (a.grade !== b.grade) return a.grade - b.grade;
                    return a.student_number.localeCompare(b.student_number);
                });

                setStudents(studentsData);
            } catch (err) {
                console.error("Error fetching students:", err);
                setError('学生リストの読み込みに失敗しました。');
            }
        };
        fetchStudents();
    }, []);

    const handleStudentSelect = (e) => {
        const studentId = e.target.value;
        setSelectedStudentId(studentId);
        setError('');

        if (studentId) {
            const student = students.find(s => s.id === studentId);
            if (student) {
                setStudentData(student);
                setName(student.name); // Keep for display
            }
        } else {
            setStudentData(null);
            setName('');
        }
    };

    const handleNext = (e) => {
        e.preventDefault();
        if (!studentData) {
            setError('学生を選択してください。');
            return;
        }

        // 3. パスワード設定状況で分岐
        // 変更: 初期パスワードがある場合はログイン画面へ
        if (studentData.password_set || studentData.initial_password) {
            setStep('login');
        } else {
            setStep('register');
        }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        console.log("Attempting login for:", studentData.email);

        try {
            if (studentData.password_set) {
                // Firebase Auth Login
                await signInWithEmailAndPassword(auth, studentData.email, password);
                console.log("Login successful (Auth)");
            } else if (studentData.initial_password) {
                // Initial Password Login (Local)
                if (password !== studentData.initial_password) {
                    throw new Error("初期パスワードが違います。");
                }
                console.log("Login successful (Initial Password)");
            } else {
                throw new Error("認証情報がありません。管理者に連絡してください。");
            }

            // セッション保存 (共通)
            sessionStorage.setItem('clinical_student_id', studentData.id);
            sessionStorage.setItem('clinical_student_name', studentData.name);

            navigate('/student/dashboard');
        } catch (err) {
            console.error("Login failed:", err);
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
                setError('パスワードが正しくありません。');
            } else if (err.code === 'auth/user-not-found') {
                setError('認証情報が見つかりません。管理者に連絡してください (Auth User Missing)。');
            } else if (err.code === 'auth/too-many-requests') {
                setError('試行回数が多すぎます。しばらく待ってから再試行してください。');
            } else {
                setError(err.message || 'ログインに失敗しました。');
            }
        } finally {
            setLoading(false);
        }
    };

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
            // Firebase Auth作成
            const userCredential = await createUserWithEmailAndPassword(auth, studentData.email, password);

            // Firestore更新
            await updateDoc(doc(db, 'students', studentData.id), {
                password_set: true,
                auth_user_id: userCredential.user.uid
            });

            // セッション保存
            sessionStorage.setItem('clinical_student_id', studentData.id);
            sessionStorage.setItem('clinical_student_name', studentData.name);

            navigate('/student/dashboard');
        } catch (err) {
            console.error(err);
            if (err.code === 'auth/email-already-in-use') {
                setError('このメールアドレスは既に使用されています。管理者にお問い合わせください。');
            } else {
                setError('アカウント作成に失敗しました。');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex bg-white">
            {/* Left Side - Hero / Branding (Desktop only) */}
            <div className="hidden lg:flex lg:w-1/2 bg-secondary relative overflow-hidden flex-col justify-between p-12 text-white">
                <div className="absolute inset-0 z-0">
                    <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] bg-primary/20 rounded-full blur-[120px]" />
                    <div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] bg-accent/20 rounded-full blur-[120px]" />
                    <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80')] bg-cover bg-center opacity-10 mix-blend-overlay"></div>
                </div>

                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="p-2 bg-white/10 backdrop-blur-md rounded-lg border border-white/10">
                            <Activity className="w-6 h-6 text-accent" />
                        </div>
                        <span className="font-bold text-lg tracking-wide opacity-90">NSSU CLINICAL TRAINING</span>
                    </div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                    >
                        <h1 className="text-5xl font-bold leading-tight mb-6">
                            未来の医療を担う<br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
                                プロフェッショナルへ
                            </span>
                        </h1>
                        <p className="text-lg text-slate-300 max-w-md leading-relaxed">
                            令和8年度 臨床実習管理システムへようこそ。<br />
                            実習スケジュールの管理、実績の記録をここから始めましょう。
                        </p>
                    </motion.div>
                </div>

                <div className="relative z-10 flex gap-8 text-sm font-medium text-slate-400">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-accent" />
                        <span>Secure Access</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <GraduationCap className="w-4 h-4 text-primary" />
                        <span>Student Portal</span>
                    </div>
                </div>
            </div>

            {/* Right Side - Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12 relative">
                <div className="w-full max-w-md">
                    <AnimatePresence mode="wait">
                        {step === 'check' && (
                            <motion.div
                                key="check"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                            >
                                <div className="mb-10">
                                    <h2 className="text-3xl font-bold text-secondary mb-2">ログイン</h2>
                                    <p className="text-slate-500">リストから自分の氏名を選択してください</p>
                                </div>

                                {error && (
                                    <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                                        {error}
                                    </div>
                                )}

                                <form onSubmit={handleNext} className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700">氏名選択</label>
                                        <div className="relative">
                                            <select
                                                className="w-full pl-4 pr-10 py-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:outline-none focus:border-primary focus:bg-white text-slate-900 font-bold transition-all duration-200 appearance-none"
                                                value={selectedStudentId}
                                                onChange={handleStudentSelect}
                                                required
                                            >
                                                <option value="">選択してください</option>
                                                {students.map(student => (
                                                    <option key={student.id} value={student.id}>
                                                        {student.grade}年 {student.student_number} {student.name}
                                                    </option>
                                                ))}
                                            </select>
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={loading || !selectedStudentId}
                                        className="w-full py-4 bg-secondary text-white rounded-xl font-bold hover:bg-secondary/90 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><span>次へ</span><ArrowRight className="w-4 h-4" /></>}
                                    </button>
                                </form>
                            </motion.div>
                        )}

                        {step === 'login' && (
                            <motion.div
                                key="login"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                            >
                                <div className="mb-10">
                                    <button onClick={() => setStep('check')} className="text-sm text-slate-400 hover:text-slate-600 mb-4 flex items-center gap-1">← 戻る</button>
                                    <h2 className="text-3xl font-bold text-secondary mb-2">パスワード入力</h2>
                                    <p className="text-slate-500">おかえりなさい、{name}さん</p>
                                </div>

                                {error && (
                                    <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                                        {error}
                                    </div>
                                )}

                                <form onSubmit={handleLogin} className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700">パスワード</label>
                                        <div className="relative">
                                            <Lock className="absolute left-4 top-4 w-5 h-5 text-slate-400" />
                                            <input
                                                type="password"
                                                className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:outline-none focus:border-primary focus:bg-white text-slate-900 transition-all duration-200"
                                                placeholder="••••••••"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full py-4 bg-secondary text-white rounded-xl font-bold hover:bg-secondary/90 transition-all duration-200 disabled:opacity-70 flex items-center justify-center gap-2"
                                    >
                                        {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <span>ログイン</span>}
                                    </button>
                                </form>
                            </motion.div>
                        )}

                        {step === 'register' && (
                            <motion.div
                                key="register"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                            >
                                <div className="mb-10">
                                    <button onClick={() => setStep('check')} className="text-sm text-slate-400 hover:text-slate-600 mb-4 flex items-center gap-1">← 戻る</button>
                                    <h2 className="text-3xl font-bold text-secondary mb-2">パスワード設定</h2>
                                    <p className="text-slate-500">初回ログインのため、パスワードを設定してください</p>
                                </div>

                                {error && (
                                    <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                                        {error}
                                    </div>
                                )}

                                <form onSubmit={handleRegister} className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700">新しいパスワード</label>
                                        <div className="relative">
                                            <Key className="absolute left-4 top-4 w-5 h-5 text-slate-400" />
                                            <input
                                                type="password"
                                                className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:outline-none focus:border-primary focus:bg-white text-slate-900 transition-all duration-200"
                                                placeholder="6文字以上"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                required
                                                minLength={6}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700">パスワード（確認）</label>
                                        <div className="relative">
                                            <Key className="absolute left-4 top-4 w-5 h-5 text-slate-400" />
                                            <input
                                                type="password"
                                                className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:outline-none focus:border-primary focus:bg-white text-slate-900 transition-all duration-200"
                                                placeholder="もう一度入力"
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                required
                                                minLength={6}
                                            />
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full py-4 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all duration-200 disabled:opacity-70 flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                                    >
                                        {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <span>設定して開始</span>}
                                    </button>
                                </form>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="mt-12 pt-6 border-t border-slate-100 text-center">
                        <p className="text-xs text-slate-400 mb-4">管理者の方はこちら</p>
                        <a
                            href="/admin/login"
                            className="inline-flex items-center justify-center px-6 py-2 rounded-lg bg-slate-50 text-slate-600 text-sm font-medium hover:bg-slate-100 transition-colors"
                        >
                            管理者ログイン
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}
