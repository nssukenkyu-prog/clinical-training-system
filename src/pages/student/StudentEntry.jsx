import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../../lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, orderBy } from 'firebase/firestore';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { User, ArrowRight, Activity, ShieldCheck, GraduationCap, Lock, Key } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function StudentEntry() {
    const [step, setStep] = useState('grade'); // 'grade', 'number', 'name'
    const [selectedGrade, setSelectedGrade] = useState('');
    const [studentNumber, setStudentNumber] = useState('');
    const [studentName, setStudentName] = useState('');
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
        if (step === 'name') {
            setStep('number');
            setStudentName('');
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
        // Basic validation alphanumeric
        if (!/^[a-zA-Z0-9]+$/.test(studentNumber)) {
            setError('学籍番号は半角英数字で入力してください');
            return;
        }
        setStep('name');
        setError('');
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // Flexible Matching Logic
            // 1. Shadow Email: [stdNumber]@clinical-system.local
            const shadowEmail = `${studentNumber.toLowerCase()}@clinical-system.local`;

            // 2. Normalized Name: Remove ALL whitespace
            const normalizedName = studentName.replace(/\s+/g, '');
            if (normalizedName.length < 1) {
                setError('氏名を入力してください');
                setLoading(false);
                return;
            }

            // 3. Password: s{ID}-{NormalizedName}
            const password = `s${studentNumber}-${normalizedName}`;

            // 4. Attempt Sign In
            await signInWithEmailAndPassword(auth, shadowEmail, password);

            // 5. Success - Set Session & Redirect
            // We need to fetch the user's name from Auth profile for session storage
            // because we don't have the "correct" display name if input was fuzzy.
            // Actually, onAuthStateChanged in App.jsx handles loading user.
            // But we set sessionStorage for legacy/fast access.

            // We can use the currentUser right after sign in
            const currentUser = auth.currentUser;
            if (currentUser) {
                sessionStorage.setItem('clinical_student_id', 'auth-session'); // Placeholder or fetch doc ID if needed
                sessionStorage.setItem('clinical_student_name', currentUser.displayName || studentName);
            }

            navigate('/student/dashboard');

        } catch (err) {
            console.error("Login failed:", err);
            // Vague error for security
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
                setError('学籍番号または氏名が登録されていません');
            } else {
                setError('ログインに失敗しました。');
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

                        {step === 'name' && (
                            <motion.div
                                key="name"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                <button onClick={handleBack} className="text-sm text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-2">← 学籍番号入力へ</button>

                                <div className="text-center mb-6">
                                    <div className="text-sm text-slate-500 font-mono mb-1">{studentNumber}</div>
                                    <h2 className="text-xl font-bold text-slate-900">氏名を入力してください</h2>
                                </div>

                                {error && (
                                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-100 text-rose-600 text-sm flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                                        {error}
                                    </div>
                                )}

                                <form onSubmit={handleLogin} className="space-y-4">
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

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold hover:shadow-lg hover:shadow-blue-500/25 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group shadow-md"
                                    >
                                        {loading ? (
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                ログイン
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
