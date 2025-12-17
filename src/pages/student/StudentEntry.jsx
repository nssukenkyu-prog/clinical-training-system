import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../../lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, orderBy } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { User, ArrowRight, Activity, ShieldCheck, GraduationCap, Lock, Key, LogIn } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function StudentEntry() {
    const [loginMode, setLoginMode] = useState('password'); // 'password' (Default) or 'initial' (Name)
    const [step, setStep] = useState('grade'); // 'grade', 'number', 'input'
    const [selectedGrade, setSelectedGrade] = useState('');
    const [studentNumber, setStudentNumber] = useState('');
    const [studentName, setStudentName] = useState(''); // Only for Initial Mode
    const [inputPassword, setInputPassword] = useState(''); // Only for Password Mode
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    // Available grades (Not fetching list anymore)
    const availableGrades = [2, 3, 4];

    const handleGradeSelect = (grade) => {
        setSelectedGrade(grade);
        setStep('number');
        setError('');
    };

    const handleBack = () => {
        if (step === 'input') {
            setStep('number');
            setStudentName('');
            setInputPassword('');
        } else if (step === 'number') {
            setStep('grade');
            setStudentNumber('');
            setSelectedGrade('');
        }
        setError('');
    };

    const handleNumberSubmit = (e) => {
        e.preventDefault();
        if (!studentNumber.trim()) {
            setError('学籍番号を入力してください');
            return;
        }
        if (!/^[a-zA-Z0-9]+$/.test(studentNumber)) {
            setError('学籍番号は半角英数字で入力してください');
            return;
        }
        setStep('input'); // Move to Name or Password input
        setError('');
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const shadowEmail = `${studentNumber.toLowerCase()}@clinical-system.local`;
            let passwordToUse = '';

            if (loginMode === 'password') {
                if (!inputPassword) {
                    setError('パスワードを入力してください');
                    setLoading(false);
                    return;
                }
                passwordToUse = inputPassword;
            } else {
                // Initial Mode (Name-based)
                const normalizedName = studentName.replace(/\s+/g, '');
                if (normalizedName.length < 1) {
                    setError('氏名を入力してください');
                    setLoading(false);
                    return;
                }
                // Generate default password: s{ID}-{Name}
                passwordToUse = `s${studentNumber.toLowerCase()}-${normalizedName}`;
            }

            // 1. Attempt Sign In
            const userCred = await signInWithEmailAndPassword(auth, shadowEmail, passwordToUse);
            const user = userCred.user;

            // 2. Check 'password_changed' status in Firestore
            // We need to find the student doc to check the flag.
            // Using auth_user_id (preferred) or email fallback.
            let studentDoc = null;
            const q = query(collection(db, 'students'), where('auth_user_id', '==', user.uid));
            const snap = await getDocs(q);

            if (!snap.empty) {
                studentDoc = snap.docs[0];
            } else {
                // Fallback email query if auth_user_id missing (legacy)
                const q2 = query(collection(db, 'students'), where('email', '==', shadowEmail)); // shadowEmail matching might fail if real email stored
                // Actually, let's just stick to Auth UID. If missing, we have a bigger problem.
                // But for safety, we can try matching by student_number?
                const q3 = query(collection(db, 'students'), where('student_number', '==', studentNumber)); // Assuming studentNumber is unique
                const snap3 = await getDocs(q3);
                if (!snap3.empty) studentDoc = snap3.docs[0];
            }

            // Session Storage Setup
            sessionStorage.setItem('clinical_student_id', studentDoc ? studentDoc.id : 'auth-session');
            sessionStorage.setItem('clinical_student_name', user.displayName || studentName || 'Student');

            // 3. Routing Logic
            const isPasswordChanged = studentDoc?.data()?.password_changed === true;

            if (loginMode === 'initial') {
                if (isPasswordChanged) {
                    // IF user already changed password but tried to use Name login
                    // Security choice: Allow it? Or Force Password?
                    // "The user requested: 2回目以降のログインは，その設定したパスワードを持ってログインできるようにしたい"
                    // Usually this implies disabling the "Name" login.
                    // Let's warn them and force them to use Password Login?
                    // OR, if the algorithm matches, maybe they just typed the "initial password" manually?
                    // Wait, in 'initial' mode we GENERATED the password.
                    // If they CHANGED it, the generated password `s{ID}-{Name}` WON'T WORK against Auth!
                    // So `signInWithEmailAndPassword` would have FAILED above if the password changed!
                    // EXCEPTION: Unless they changed it TO the same thing (unlikely).

                    // So if we are here, it means the password IS STILL `s{ID}-{Name}` (or consistent with it).
                    // So actually, `password_changed` must be false (or they reset it).
                    // But if `password_changed` is true in DB, but Auth worked with default password...
                    // That means they changed it back? Or logic error.
                    // Anyway, if we are here, Auth SUCCEEDED.

                    // Logic:
                    // If (Initial Mode) AND (Auth Success) AND (PasswordChanged == True) -> Strange state.
                    // If (Initial Mode) AND (Auth Success) AND (PasswordChanged == False) -> Redirect to SetPassword.

                    if (isPasswordChanged) {
                        // They somehow logged in with default password even though flagged as changed.
                        navigate('/student/dashboard');
                    } else {
                        // Force Password Change
                        navigate('/student/set-password');
                    }
                } else {
                    // Normal Initial Login -> Set Password
                    navigate('/student/set-password');
                }
            } else {
                // Password Mode
                // If they haven't changed it yet, but use Password Mode (maybe they knew the default pw?)
                // We should still force them if flag is false.
                if (!isPasswordChanged) {
                    navigate('/student/set-password');
                } else {
                    navigate('/student/dashboard');
                }
            }

        } catch (err) {
            console.error("Login failed:", err);
            // Error handling
            if (loginMode === 'initial') {
                // If default password failed, it likely means they CHANGED it.
                if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                    setError('初回ログインに失敗しました。既にパスワードを変更済みの場合は「通常ログイン」をご利用ください。');
                } else {
                    setError('ログインできませんでした。入力内容を確認してください。');
                }
            } else {
                setError('認証に失敗しました。正しいパスワードを入力してください。');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-slate-50">
            {/* Background Gradients */}
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
                        {loginMode === 'password' ? '通常ログイン' : '初回ログイン (パスワード設定)'}
                    </p>
                </div>

                <div className="glass-panel p-8 rounded-2xl shadow-2xl bg-white/80 transition-all duration-300">

                    {/* Mode Toggle Tabs */}
                    {step === 'grade' && (
                        <div className="flex p-1 bg-slate-100 rounded-xl mb-6">
                            <button
                                onClick={() => setLoginMode('password')}
                                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${loginMode === 'password'
                                        ? 'bg-white text-primary shadow-sm'
                                        : 'text-slate-400 hover:text-slate-600'
                                    }`}
                            >
                                パスワード
                            </button>
                            <button
                                onClick={() => setLoginMode('initial')}
                                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${loginMode === 'initial'
                                        ? 'bg-white text-primary shadow-sm'
                                        : 'text-slate-400 hover:text-slate-600'
                                    }`}
                            >
                                初回 (氏名)
                            </button>
                        </div>
                    )}

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
                                <button onClick={handleBack} className="text-sm text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-2">← 学年選択へ</button>

                                <h2 className="text-lg font-bold text-slate-700 text-center mb-4">{selectedGrade}年生 ログイン</h2>

                                {error && (
                                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-100 text-rose-600 text-sm flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                                        {error}
                                    </div>
                                )}

                                <form onSubmit={handleNumberSubmit} className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700 ml-1">学籍番号</label>
                                        <div className="relative group">
                                            <User className="absolute left-4 top-3.5 w-5 h-5 text-slate-400 group-focus-within:text-primary transition-colors" />
                                            <input
                                                type="text"
                                                className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium shadow-sm font-mono"
                                                value={studentNumber}
                                                onChange={(e) => setStudentNumber(e.target.value)}
                                                placeholder="24ca000"
                                                required
                                                autoFocus
                                            />
                                        </div>
                                    </div>
                                    <button
                                        type="submit"
                                        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold hover:shadow-lg hover:shadow-blue-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group shadow-md"
                                    >
                                        次へ
                                        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                                    </button>
                                </form>
                            </motion.div>
                        )}

                        {step === 'input' && (
                            <motion.div
                                key="input"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                <button onClick={handleBack} className="text-sm text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-2">← 学籍番号入力へ</button>

                                <div className="text-center mb-6">
                                    <div className="text-sm text-slate-500 font-mono mb-1">{studentNumber}</div>
                                    <h2 className="text-xl font-bold text-slate-900">
                                        {loginMode === 'password' ? 'パスワードを入力' : '氏名を入力'}
                                    </h2>
                                </div>

                                {error && (
                                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-100 text-rose-600 text-sm flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                                        {error}
                                    </div>
                                )}

                                <form onSubmit={handleLogin} className="space-y-4">
                                    {loginMode === 'password' ? (
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-700 ml-1">パスワード</label>
                                            <div className="relative group">
                                                <Key className="absolute left-4 top-3.5 w-5 h-5 text-slate-400 group-focus-within:text-primary transition-colors" />
                                                <input
                                                    type="password"
                                                    className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium shadow-sm transition-caret"
                                                    value={inputPassword}
                                                    onChange={(e) => setInputPassword(e.target.value)}
                                                    placeholder="••••••••"
                                                    required
                                                    autoFocus
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-700 ml-1">氏名</label>
                                            <div className="relative group">
                                                <User className="absolute left-4 top-3.5 w-5 h-5 text-slate-400 group-focus-within:text-primary transition-colors" />
                                                <input
                                                    type="text"
                                                    className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium shadow-sm"
                                                    value={studentName}
                                                    onChange={(e) => setStudentName(e.target.value)}
                                                    placeholder="山田 太郎"
                                                    required
                                                    autoFocus
                                                />
                                            </div>
                                            <p className="text-xs text-slate-400 ml-1">※スペースはあってもなくても構いません</p>
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
                                                {loginMode === 'password' ? 'ログイン' : '次へ（パスワード設定）'}
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
