import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { User, ArrowRight, Activity, ShieldCheck, GraduationCap } from 'lucide-react';
import { motion } from 'framer-motion';

export default function StudentEntry() {
    const [studentNumber, setStudentNumber] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleEntry = async (e) => {
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

            // 2. 氏名の一致確認 (簡易チェック: 空白除去して比較)
            const studentDoc = querySnapshot.docs[0];
            const studentData = studentDoc.data();

            const dbName = studentData.name.replace(/\s+/g, '');
            const inputName = name.replace(/\s+/g, '');

            if (dbName !== inputName) {
                setError('氏名が一致しません。');
                setLoading(false);
                return;
            }

            // 3. 匿名ログイン
            await signInAnonymously(auth);

            // 4. セッションに保存
            sessionStorage.setItem('clinical_student_id', studentDoc.id);
            sessionStorage.setItem('clinical_student_name', studentData.name);

            // 5. ダッシュボードへ移動
            navigate('/student/dashboard');

        } catch (err) {
            console.error(err);
            setError('エラーが発生しました。もう一度お試しください。');
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

            {/* Right Side - Login Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12 relative">
                <div className="w-full max-w-md">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                    >
                        <div className="mb-10">
                            <h2 className="text-3xl font-bold text-slate-900 mb-2">ログイン</h2>
                            <p className="text-slate-500">学籍番号と氏名を入力してください</p>
                        </div>

                        {error && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm flex items-center gap-3"
                            >
                                <div className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                                {error}
                            </motion.div>
                        )}

                        <form onSubmit={handleEntry} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700">学籍番号</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        className="w-full pl-4 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white text-slate-900 font-mono transition-all duration-200 placeholder:text-slate-400"
                                        placeholder="2024001"
                                        value={studentNumber}
                                        onChange={(e) => setStudentNumber(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700">氏名</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        className="w-full pl-4 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white text-slate-900 transition-all duration-200 placeholder:text-slate-400"
                                        placeholder="日体 太郎"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        required
                                    />
                                </div>
                                <p className="text-xs text-slate-400">※ 登録氏名と完全に一致する必要があります</p>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 active:scale-[0.98] transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
                            >
                                {loading ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <span>実習を開始する</span>
                                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </>
                                )}
                            </button>
                        </form>

                        <div className="mt-12 pt-6 border-t border-slate-100 text-center">
                            <p className="text-xs text-slate-400 mb-4">管理者の方はこちら</p>
                            <a
                                href="/admin/login"
                                className="inline-flex items-center justify-center px-6 py-2 rounded-lg bg-slate-50 text-slate-600 text-sm font-medium hover:bg-slate-100 transition-colors"
                            >
                                管理者ログイン
                            </a>
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
