import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../../lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { User, ArrowRight, Activity, ShieldCheck, GraduationCap, Lock, Key } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function StudentEntry() {
    const [step, setStep] = useState('check'); // 'check', 'login', 'register'
    const [studentNumber, setStudentNumber] = useState('');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [studentData, setStudentData] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleCheck = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // 1. 学籍番号で検索
            const studentsRef = collection(db, 'students');
            const q = query(studentsRef, where('student_number', '==', studentNumber));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                setError('学籍番号が見つかりません。');
                setLoading(false);
                return;
            }

            // 2. 氏名の一致確認
            const docSnapshot = querySnapshot.docs[0];
            const data = docSnapshot.data();
            const dbName = data.name.replace(/\s+/g, '');
            const inputName = name.replace(/\s+/g, '');

            if (dbName !== inputName) {
                setError('氏名が一致しません。');
                setLoading(false);
                return;
            }

            setStudentData({ id: docSnapshot.id, ...data });

            // 3. パスワード設定状況で分岐
            if (data.password_set) {
                setStep('login');
            } else {
                setStep('register');
            }

        } catch (err) {
            console.error(err);
            setError('エラーが発生しました。');
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await signInWithEmailAndPassword(auth, studentData.email, password);

            // セッション保存
            sessionStorage.setItem('clinical_student_id', studentData.id);
            sessionStorage.setItem('clinical_student_name', studentData.name);

            navigate('/student/dashboard');
        } catch (err) {
            console.error(err);
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
                setError('パスワードが正しくありません。');
            } else {
                setError('ログインに失敗しました。');
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
            <div className="hidden lg:flex lg:w-1/2 bg-slate-900 relative overflow-hidden flex-col justify-between p-12 text-white">
                <div className="absolute inset-0 z-0">
                    <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] bg-blue-600/20 rounded-full blur-[120px]" />
                    <div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] bg-emerald-600/20 rounded-full blur-[120px]" />
                    <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80')] bg-cover bg-center opacity-10 mix-blend-overlay"></div>
                </div>

                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="p-2 bg-white/10 backdrop-blur-md rounded-lg border border-white/10">
                            <Activity className="w-6 h-6 text-emerald-400" />
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
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
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
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span>Secure Access</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <GraduationCap className="w-4 h-4 text-blue-400" />
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
                                    <h2 className="text-3xl font-bold text-slate-900 mb-2">ログイン</h2>
                                    <p className="text-slate-500">学籍番号と氏名を入力してください</p>
                                </div>

                                {error && (
                                    <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                                        {error}
                                    </div>
                                )}

                                <form onSubmit={handleCheck} className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700">学籍番号</label>
                                        <input
                                            type="text"
                                            className="w-full pl-4 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white text-slate-900 font-mono transition-all duration-200"
                                            placeholder="2024001"
                                            value={studentNumber}
                                            onChange={(e) => setStudentNumber(e.target.value)}
                                            required
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700">氏名</label>
                                        <input
                                            type="text"
                                            className="w-full pl-4 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white text-slate-900 transition-all duration-200"
                                            placeholder="日体 太郎"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            required
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all duration-200 disabled:opacity-70 flex items-center justify-center gap-2"
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
                                    <h2 className="text-3xl font-bold text-slate-900 mb-2">パスワード入力</h2>
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
                                                className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white text-slate-900 transition-all duration-200"
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
                                        className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all duration-200 disabled:opacity-70 flex items-center justify-center gap-2"
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
                                    <h2 className="text-3xl font-bold text-slate-900 mb-2">パスワード設定</h2>
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
                                                className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white text-slate-900 transition-all duration-200"
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
                                                className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white text-slate-900 transition-all duration-200"
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
                                        className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all duration-200 disabled:opacity-70 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
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
