import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';

export default function SetPassword() {
    const [email, setEmail] = useState('');
    const [studentNumber, setStudentNumber] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    useEffect(() => {
        // URLからメールアドレスを取得（もしあれば）
        const emailParam = searchParams.get('email');
        if (emailParam) {
            setEmail(emailParam);
        }
    }, [searchParams]);

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
            // 1. Firestoreで学生情報を確認
            const studentsRef = collection(db, 'students');
            const q = query(
                studentsRef,
                where('email', '==', email),
                where('student_number', '==', studentNumber)
            );
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                setError('学生情報が見つかりません。メールアドレスと学籍番号を確認してください。');
                setLoading(false);
                return;
            }

            const studentDoc = querySnapshot.docs[0];
            const studentData = studentDoc.data();

            if (studentData.auth_user_id) {
                setError('このアカウントは既に登録されています。ログインしてください。');
                setLoading(false);
                return;
            }

            // 2. Firebase Authでユーザー作成
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // 3. Firestoreを更新してリンク
            const studentDocRef = doc(db, 'students', studentDoc.id);
            await updateDoc(studentDocRef, {
                auth_user_id: user.uid,
                password_set: true
            });

            setSuccess(true);
            setTimeout(() => {
                navigate('/student/login');
            }, 3000);

        } catch (err) {
            console.error(err);
            if (err.code === 'auth/email-already-in-use') {
                setError('このメールアドレスは既に使用されています。');
            } else {
                setError('登録処理中にエラーが発生しました: ' + err.message);
            }
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
                <div className="w-full max-w-md glass-panel p-8 rounded-2xl text-center">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl mb-4">
                        <strong className="block text-lg mb-2">登録が完了しました！</strong>
                        <p>3秒後にログイン画面に移動します...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
            <div className="w-full max-w-md glass-panel p-8 rounded-2xl">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold mb-2">アカウント登録</h1>
                    <p className="text-slate-400">管理者から登録された情報と紐付けを行います</p>
                </div>

                {error && (
                    <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl mb-6 text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            メールアドレス
                        </label>
                        <input
                            type="email"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:border-primary transition-colors"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="student@example.com"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            学籍番号
                        </label>
                        <input
                            type="text"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:border-primary transition-colors"
                            value={studentNumber}
                            onChange={(e) => setStudentNumber(e.target.value)}
                            placeholder="2024001"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            パスワード（8文字以上）
                        </label>
                        <input
                            type="password"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:border-primary transition-colors"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            minLength={8}
                            autoComplete="new-password"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            パスワード（確認）
                        </label>
                        <input
                            type="password"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:border-primary transition-colors"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            autoComplete="new-password"
                        />
                    </div>

                    <button
                        type="submit"
                        className="w-full py-3 rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 font-bold"
                        disabled={loading}
                    >
                        {loading ? '登録中...' : 'アカウント登録'}
                    </button>
                </form>
            </div>
        </div>
    );
}
