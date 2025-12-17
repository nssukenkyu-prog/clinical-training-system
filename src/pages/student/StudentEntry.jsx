import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../../lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, orderBy } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { User, ArrowRight, Activity, ShieldCheck, GraduationCap, Lock, Key, LogIn, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function StudentEntry() {
    const [step, setStep] = useState('grade'); // 'grade', 'number', 'input'
    const [loginMode, setLoginMode] = useState('standard'); // 'standard' (Password) or 'first_time' (Name)
    const [selectedGrade, setSelectedGrade] = useState('');
    const [studentNumber, setStudentNumber] = useState('');
    const [credential, setCredential] = useState(''); // Password OR Name
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    // Available grades
    const availableGrades = [2, 3, 4];

    const handleGradeSelect = (grade) => {
        setSelectedGrade(grade);
        setStep('number');
        setError('');
    };
    const handleBack = () => {
        if (step === 'input') {
            setStep('number');
            setCredential('');
            // Reset mode to standard when going back, or keep it? Keep it for better UX.
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
        setStep('input');
        setError('');
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const shadowEmail = `${studentNumber.toLowerCase()}@clinical-system.local`;
        let user = null;

        try {
            if (loginMode === 'first_time') {
                // First Time Mode: Input is NAME
                // Logic: Construct derived password `s{ID}-{NormalizedName}`
                const normalizedNameInput = credential.replace(/\s+/g, '');
                const derivedPassword = `s${studentNumber.toLowerCase()}-${normalizedNameInput}`;

                try {
                    const userCred = await signInWithEmailAndPassword(auth, shadowEmail, derivedPassword);
                    user = userCred.user;
                } catch (authErr) {
                    // Logic failed -> Likely name mismatch OR ID mismatch
                    console.error(authErr);
                    throw new Error('氏名での認証に失敗しました。正しい氏名（登録時の表記）を入力しているか確認してください。');
                }
            } else {
                // Standard Mode: Input is PASSWORD
                const userCred = await signInWithEmailAndPassword(auth, shadowEmail, credential);
                user = userCred.user;
            }

            // --- Authentication Successful ---

            // Firestore Check (for password_changed flag)
            // Use auth_user_id (safest)
            const q = query(collection(db, 'students'), where('auth_user_id', '==', user.uid));
            const snap = await getDocs(q);

            let studentDoc = null;
            if (!snap.empty) {
                studentDoc = snap.docs[0];
            } else {
                const q2 = query(collection(db, 'students'), where('student_number', '==', studentNumber));
                const snap2 = await getDocs(q2);
                if (!snap2.empty) studentDoc = snap2.docs[0];
            }

            // Session Setup
            sessionStorage.setItem('clinical_student_id', studentDoc ? studentDoc.id : 'auth-session');
            sessionStorage.setItem('clinical_student_name', user.displayName || 'Student');

            // Routing Logic
            const isPasswordChanged = studentDoc?.data()?.password_changed === true;

            if (loginMode === 'first_time') {
                // Force Password Change for First Time Login
                navigate('/student/set-password');
            } else {
                // Standard Mode
                if (!isPasswordChanged) {
                    // Even if logged in via Standard (maybe they knew the initial password?), force change if flag is false
                    navigate('/student/set-password');
                } else {
                    navigate('/student/dashboard');
                }
            }

        } catch (err) {
            console.error("Login failed:", err);
            let msg = 'エラーが発生しました: ' + err.message;

            if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
                if (loginMode === 'first_time') {
                    msg = '認証に失敗しました。学籍番号または氏名を確認してください。';
                } else {
                    msg = '認証に失敗しました。学籍番号またはパスワードを確認してください。';
                }

            } else if (err.code === 'auth/too-many-requests') {
                msg = '試行回数が多すぎます。しばらく待ってから再試行してください。';
            } else if (err.message.includes('氏名での認証')) {
                msg = err.message;
            }

            setError(msg);
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
                        実習支援システム
                    </p>
                </div>

                <div className="glass-panel p-8 rounded-2xl shadow-2xl bg-white/80 transition-all duration-300">

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
                                        {loginMode === 'first_time' ? '初回認証' : '認証'}
                                    </h2>
                                    <p className="text-xs text-slate-500 mt-1">
                                        {loginMode === 'first_time' ? '氏名を入力確認を行います' : 'パスワードを入力してください'}
                                    </p>
                                </div>

                                {error && (
                                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-100 text-rose-600 text-sm flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                                        {error}
                                    </div>
                                )}

                                <form onSubmit={handleLogin} className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700 ml-1">
                                            {loginMode === 'first_time' ? '氏名' : 'パスワード'}
                                        </label>
                                        <div className="relative group">
                                            {loginMode === 'first_time' ? (
                                                <User className="absolute left-4 top-3.5 w-5 h-5 text-slate-400 group-focus-within:text-primary transition-colors" />
                                            ) : (
                                                <Key className="absolute left-4 top-3.5 w-5 h-5 text-slate-400 group-focus-within:text-primary transition-colors" />
                                            )}

                                            <input
                                                type={loginMode === 'first_time' || showPassword ? "text" : "password"}
                                                className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-12 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium shadow-sm transition-caret"
                                                value={credential}
                                                onChange={(e) => setCredential(e.target.value)}
                                                placeholder={loginMode === 'first_time' ? "例: 山田 太郎" : "パスワード"}
                                                required
                                                autoFocus
                                            />

                                            {loginMode !== 'first_time' && (
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute right-4 top-3.5 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
                                                    tabIndex={-1}
                                                >
                                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold hover:shadow-lg hover:shadow-blue-500/25 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group shadow-md"
                                    >
                                        {loading ? (
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                {loginMode === 'first_time' ? '認証・設定へ' : 'ログイン'}
                                                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                                            </>
                                        )}
                                    </button>

                                    {/* Toggle Mode Link */}
                                    <div className="text-center pt-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setLoginMode(loginMode === 'standard' ? 'first_time' : 'standard');
                                                setCredential('');
                                                setError('');
                                            }}
                                            className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors underline decoration-indigo-200 hover:decoration-indigo-800 underline-offset-4"
                                        >
                                            {loginMode === 'standard'
                                                ? '初めてログインする方はこちら'
                                                : 'すでにパスワードをお持ちの方はこちら'}
                                        </button>
                                    </div>
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
