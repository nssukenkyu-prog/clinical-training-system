import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../../lib/firebase';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { User, Lock, LockOpen, CheckCircle, ChevronDown, Search } from 'lucide-react';
import { hashPassword } from '../../utils/crypto';

export default function StudentEntry() {
    const [students, setStudents] = useState([]);
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [pageLoading, setPageLoading] = useState(true);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    // 学生一覧を取得
    useEffect(() => {
        const fetchStudents = async () => {
            try {
                const querySnapshot = await getDocs(collection(db, 'students'));
                const studentList = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })).sort((a, b) => a.student_number.localeCompare(b.student_number));
                setStudents(studentList);
            } catch (err) {
                console.error("Failed to fetch students:", err);
                setError('学生データの読み込みに失敗しました。');
            } finally {
                setPageLoading(false);
            }
        };
        fetchStudents();
    }, []);

    const selectedStudent = useMemo(() =>
        students.find(s => s.id === selectedStudentId),
        [students, selectedStudentId]);

    const isSetupMode = selectedStudent && !selectedStudent.password_hash;

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!selectedStudent) return;

        setError('');
        setLoading(true);

        try {
            const hashedPassword = await hashPassword(password);

            // 1. パスワード検証 or 設定
            if (isSetupMode) {
                // 初回設定
                if (password.length < 4) {
                    throw new Error('パスワードは4文字以上で設定してください。');
                }
                if (password !== confirmPassword) {
                    throw new Error('確認用パスワードが一致しません。');
                }

                // 認証してから書き込む
                await signInAnonymously(auth);
                await updateDoc(doc(db, 'students', selectedStudent.id), {
                    password_hash: hashedPassword
                });
            } else {
                // 通常ログイン
                if (hashedPassword !== selectedStudent.password_hash) {
                    throw new Error('パスワードが間違っています。');
                }
                // 認証
                await signInAnonymously(auth);
            }

            // 2. セッション保存 & リダイレクト
            sessionStorage.setItem('clinical_student_id', selectedStudent.id);
            sessionStorage.setItem('clinical_student_name', selectedStudent.name);
            navigate('/student/dashboard');

        } catch (err) {
            console.error(err);
            setError(err.message || 'ログイン中にエラーが発生しました。');
            // エラー時はログアウトしておく（不完全な状態を防ぐ）
            auth.signOut();
        } finally {
            setLoading(false);
        }
    };

    if (pageLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 via-indigo-50/30 to-purple-50/30 relative overflow-hidden">
            {/* Background Decorations */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-gradient-to-br from-indigo-300/30 to-purple-300/30 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-gradient-to-tr from-blue-300/30 to-cyan-300/30 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
            </div>

            <div className="w-full max-w-md bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20 relative z-10">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30 mb-6">
                        <User className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900">臨床実習 ログイン</h1>
                    <p className="text-slate-500 mt-2 text-sm">自分の名前を選んでログインしてください</p>
                </div>

                {error && (
                    <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm flex items-center gap-2 animate-shake">
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div>
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-6">
                    {/* 学生選択プルダウン */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 ml-1">氏名 (学籍番号)</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Search className="h-5 w-5 text-slate-400" />
                            </div>
                            <select
                                value={selectedStudentId}
                                onChange={(e) => {
                                    setSelectedStudentId(e.target.value);
                                    setPassword('');
                                    setConfirmPassword('');
                                    setError('');
                                }}
                                className="w-full pl-11 pr-10 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-slate-900 appearance-none cursor-pointer hover:bg-white transition-colors"
                                required
                            >
                                <option value="">選択してください</option>
                                {students.map(student => (
                                    <option key={student.id} value={student.id}>
                                        {student.student_number} {student.name}
                                    </option>
                                ))}
                            </select>
                            <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                                <ChevronDown className="h-5 w-5 text-slate-400" />
                            </div>
                        </div>
                    </div>

                    {/* パスワード入力エリア (学生選択時のみ表示) */}
                    {selectedStudent && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 ml-1 flex items-center gap-2">
                                    {isSetupMode ? (
                                        <>
                                            <span className="text-blue-600">初回パスワード設定</span>
                                            <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">未設定</span>
                                        </>
                                    ) : (
                                        'パスワード'
                                    )}
                                </label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                    </div>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-slate-900 placeholder:text-slate-400 transition-all hover:bg-white"
                                        placeholder={isSetupMode ? "新しいパスワード (4文字以上)" : "パスワードを入力"}
                                        required
                                    />
                                </div>
                            </div>

                            {isSetupMode && (
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700 ml-1">パスワード確認</label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <CheckCircle className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                        </div>
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-slate-900 placeholder:text-slate-400 transition-all hover:bg-white"
                                            placeholder="もう一度入力"
                                            required
                                        />
                                    </div>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <div className="flex items-center justify-center gap-2">
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        <span>処理中...</span>
                                    </div>
                                ) : isSetupMode ? (
                                    '設定してログイン'
                                ) : (
                                    'ログイン'
                                )}
                            </button>
                        </div>
                    )}
                </form>

                <div className="mt-8 text-center">
                    <a href="/admin/login" className="text-xs text-slate-400 hover:text-blue-600 transition-colors font-medium hover:underline decoration-blue-600/30 underline-offset-4">
                        管理者画面へ
                    </a>
                </div>
            </div>
        </div>
    );
}
