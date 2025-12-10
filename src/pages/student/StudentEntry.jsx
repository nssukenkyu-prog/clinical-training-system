import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { User, LockOpen } from 'lucide-react';

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

            // 3. 匿名ログイン (Firestoreの認証ルールを通過するため)
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
        <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 relative overflow-hidden">
            {/* Background Decorations */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-blue-200/20 rounded-full blur-3xl"></div>
                <div className="absolute bottom-[-10%] left-[-5%] w-96 h-96 bg-emerald-200/20 rounded-full blur-3xl"></div>
            </div>

            <div className="w-full max-w-md bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20 relative z-10 transition-all hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)]">
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30 mb-6 group transition-all duration-500 hover:scale-110 hover:rotate-3">
                        <LockOpen className="w-8 h-8 text-white group-hover:animate-pulse" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">NSSU 令和8年度 臨床実習</h1>
                    <p className="text-slate-500 mt-2 text-sm font-medium">学籍番号と氏名を入力して開始してください</p>
                </div>

                {error && (
                    <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm flex items-center gap-2 animate-shake">
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div>
                        {error}
                    </div>
                )}

                <form onSubmit={handleEntry} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 ml-1">学籍番号</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <User className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                            </div>
                            <input
                                type="text"
                                className="w-full pl-11 pr-4 py-3.5 bg-[#24ca00] bg-opacity-10 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-slate-900 placeholder:text-slate-400 font-mono transition-all duration-300 hover:bg-white"
                                placeholder="2024001"
                                value={studentNumber}
                                onChange={(e) => setStudentNumber(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 ml-1">氏名</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <User className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                            </div>
                            <input
                                type="text"
                                className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-slate-900 placeholder:text-slate-400 transition-all duration-300 hover:bg-white"
                                placeholder="日体 太郎"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>
                        <p className="text-xs text-slate-400 ml-1">※ 登録されている氏名と完全に一致させる必要があります</p>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                        {loading ? (
                            <div className="flex items-center justify-center gap-2">
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                <span>確認中...</span>
                            </div>
                        ) : '開始する'}
                    </button>
                </form>

                <div className="mt-8 text-center">
                    <a href="/admin/login" className="text-xs text-slate-400 hover:text-blue-600 transition-colors font-medium hover:underline decoration-blue-600/30 underline-offset-4">
                        管理者はこちら
                    </a>
                </div>
            </div>
        </div>
    );
}
