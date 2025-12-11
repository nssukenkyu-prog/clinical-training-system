import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../../lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { User, Lock, LockOpen, ArrowRight, CheckCircle, KeyRound } from 'lucide-react';
import { hashPassword } from '../../utils/crypto';

export default function StudentEntry() {
    const [step, setStep] = useState('entry'); // 'entry' | 'setup' | 'verify'
    const [studentNumber, setStudentNumber] = useState('');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [targetStudent, setTargetStudent] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleIdentify = async (e) => {
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
            const studentDoc = querySnapshot.docs[0];
            const studentData = studentDoc.data();
            const dbName = studentData.name.replace(/\s+/g, '');
            const inputName = name.replace(/\s+/g, '');

            if (dbName !== inputName) {
                setError('氏名が一致しません。');
                setLoading(false);
                return;
            }

            // 3. 認証実行 (書き込み権限確保のため、まずログインする)
            await signInAnonymously(auth);

            // 4. 次のステップ判定
            setTargetStudent({ id: studentDoc.id, ...studentData });
            if (studentData.password_hash) {
                setStep('verify');
            } else {
                setStep('setup');
            }

        } catch (err) {
            console.error(err);
            setError('エラーが発生しました。');
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordAction = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const hashedPassword = await hashPassword(password);

            if (step === 'setup') {
                // パスワード設定
                if (password.length < 4) {
                    setError('パスワードは4文字以上で設定してください。');
                    setLoading(false);
                    return;
                }
                if (password !== confirmPassword) {
                    setError('パスワードが一致しません。');
                    setLoading(false);
                    return;
                }

                // DB保存 (すでにログイン済みなのでupdateDoc可能)
                await updateDoc(doc(db, 'students', targetStudent.id), {
                    password_hash: hashedPassword
                });
            } else {
                // パスワード検証
                if (hashedPassword !== targetStudent.password_hash) {
                    setError('パスワードが間違っています。');
                    setLoading(false);
                    return;
                }
            }

            // セッションに保存してダッシュボードへ
            sessionStorage.setItem('clinical_student_id', targetStudent.id);
            sessionStorage.setItem('clinical_student_name', targetStudent.name);
            navigate('/student/dashboard');

        } catch (err) {
            console.error(err);
            setError('エラーが発生しました。');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 via-indigo-50/30 to-purple-50/30 relative overflow-hidden">
            {/* Background Decorations */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-gradient-to-br from-indigo-300/30 to-purple-300/30 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-gradient-to-tr from-blue-300/30 to-cyan-300/30 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
            </div>

            <div className="w-full max-w-md bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20 relative z-10 transition-all hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)]">
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30 mb-6 group transition-all duration-500 hover:scale-110 hover:rotate-3">
                        {step === 'entry' ? (
                            <User className="w-8 h-8 text-white group-hover:animate-pulse" />
                        ) : step === 'setup' ? (
                            <KeyRound className="w-8 h-8 text-white group-hover:animate-pulse" />
                        ) : (
                            <Lock className="w-8 h-8 text-white group-hover:animate-pulse" />
                        )}
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">NSSU 令和8年度 臨床実習</h1>
                    <p className="text-slate-500 mt-2 text-sm font-medium">
                        {step === 'entry' && '学籍番号と氏名を入力してください'}
                        {step === 'setup' && '初回パスワードを設定してください'}
                        {step === 'verify' && 'パスワードを入力してください'}
                    </p>
                </div>

                {error && (
                    <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm flex items-center gap-2 animate-shake">
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div>
                        {error}
                    </div>
                )}

                {step === 'entry' ? (
                    <form onSubmit={handleIdentify} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700 ml-1">学籍番号</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><User className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" /></div>
                                <input type="text" className="w-full pl-11 pr-4 py-3.5 bg-[#24ca00] bg-opacity-10 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-slate-900 placeholder:text-slate-400 font-mono transition-all duration-300 hover:bg-white" placeholder="24ca000" value={studentNumber} onChange={(e) => setStudentNumber(e.target.value)} required />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700 ml-1">氏名</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><User className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" /></div>
                                <input type="text" className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-slate-900 placeholder:text-slate-400 transition-all duration-300 hover:bg-white" placeholder="日体 太郎" value={name} onChange={(e) => setName(e.target.value)} required />
                            </div>
                        </div>
                        <button type="submit" disabled={loading} className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed">
                            {loading ? '確認中...' : '次へ'}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handlePasswordAction} className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="text-center mb-2">
                            <span className="text-lg font-bold text-slate-800">{targetStudent?.name}</span>
                            <span className="text-slate-500 text-sm ml-2">({targetStudent?.student_number})</span>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700 ml-1">
                                {step === 'setup' ? '新しいパスワード' : 'パスワード'}
                            </label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><Lock className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" /></div>
                                <input type="password" className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-slate-900 placeholder:text-slate-400 transition-all duration-300 hover:bg-white" placeholder="••••••" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
                            </div>
                        </div>

                        {step === 'setup' && (
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 ml-1">パスワード確認</label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><Lock className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" /></div>
                                    <input type="password" className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-slate-900 placeholder:text-slate-400 transition-all duration-300 hover:bg-white" placeholder="••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                                </div>
                                <p className="text-xs text-slate-500 ml-1">※このパスワードは今後ログインに必要になります。</p>
                            </div>
                        )}

                        <div className="flex flex-col gap-3">
                            <button type="submit" disabled={loading} className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed">
                                {loading ? '処理中...' : (step === 'setup' ? '設定して開始' : 'ログイン')}
                            </button>
                            <button type="button" onClick={() => { setStep('entry'); setError(''); setPassword(''); }} className="text-sm text-slate-400 hover:text-slate-600 py-2">
                                最初に戻る
                            </button>
                        </div>
                    </form>
                )}

                <div className="mt-8 text-center">
                    <a href="/admin/login" className="text-xs text-slate-400 hover:text-blue-600 transition-colors font-medium hover:underline decoration-blue-600/30 underline-offset-4">
                        管理者はこちら
                    </a>
                </div>
            </div>
        </div>
    );
}
