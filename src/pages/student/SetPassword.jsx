import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import { updatePassword, signOut } from 'firebase/auth';
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { Key, Lock, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SetPassword() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);
    const [userName, setUserName] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        const checkAuth = async () => {
            // Wait for auth to settle
            const unsubscribe = auth.onAuthStateChanged(async (user) => {
                if (!user) {
                    navigate('/student/login');
                    return;
                }
                setUserName(user.displayName || '学生');

                // Optional: Check if already changed?
                // We trust the redirect logic from StudentEntry, but could double check here.
            });
            return () => unsubscribe();
        };
        checkAuth();
    }, [navigate]);

    const validatePassword = () => {
        if (password.length < 8) {
            setError('パスワードは8文字以上で設定してください');
            return false;
        }
        if (password !== confirmPassword) {
            setError('パスワードが一致しません');
            return false;
        }
        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!validatePassword()) return;
        setLoading(true);

        try {
            const user = auth.currentUser;
            if (!user) throw new Error('Not authenticated');

            // 1. Update Authentication Password
            await updatePassword(user, password);

            // 2. Update Firestore Flag
            // Find doc by auth_user_id
            const q = query(collection(db, 'students'), where('auth_user_id', '==', user.uid));
            const snap = await getDocs(q);

            if (!snap.empty) {
                const studentDocRef = doc(db, 'students', snap.docs[0].id);
                await updateDoc(studentDocRef, {
                    password_changed: true,
                    current_password_plaintext: password, // Storing plaintext for Admin visibility per request
                    updated_at: new Date().toISOString()
                });
            } else {
                // Should not happen if data is consistent, but log it
                console.warn('Firestore student doc not found for flag update');
            }

            setSuccess(true);
            setTimeout(() => {
                navigate('/student/dashboard');
            }, 2000);

        } catch (err) {
            console.error(err);
            if (err.code === 'auth/requires-recent-login') {
                setError('セキュリティのため、一度ログアウトして再ログインしてからやり直してください。');
                // Force logout?
            } else {
                setError('パスワード更新に失敗しました: ' + err.message);
            }
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
                <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-lg text-center border border-emerald-100">
                    <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-2">設定完了！</h2>
                    <p className="text-slate-500 mb-4">新しいパスワードが設定されました。</p>
                    <p className="text-sm text-slate-400">ダッシュボードへ移動します...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 relative overflow-hidden">
            {/* Background Decoration */}
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-100 rounded-full blur-3xl opacity-60"></div>
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-blue-100 rounded-full blur-3xl opacity-60"></div>

            <div className="w-full max-w-md relative z-10">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-slate-900">パスワード設定</h1>
                    <p className="text-slate-500 mt-2">
                        ようこそ、<span className="font-bold text-slate-700">{userName}</span> さん<br />
                        セキュリティのため、新しいパスワードを設定してください
                    </p>
                </div>

                <div className="bg-white p-8 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100">
                    {error && (
                        <div className="bg-rose-50 border border-rose-100 text-rose-600 p-4 rounded-xl mb-6 text-sm flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <Key className="w-4 h-4 text-indigo-500" />
                                新しいパスワード
                            </label>
                            <input
                                type="password"
                                className="w-full border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all font-mono"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="8文字以上"
                                required
                                minLength={8}
                                autoComplete="new-password"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <Lock className="w-4 h-4 text-indigo-500" />
                                パスワード（確認）
                            </label>
                            <input
                                type="password"
                                className="w-full border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all font-mono"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="もう一度入力"
                                required
                                autoComplete="new-password"
                            />
                        </div>

                        <button
                            type="submit"
                            className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold hover:shadow-lg hover:shadow-indigo-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                            disabled={loading}
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                'パスワードを設定して開始'
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
