import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';

export default function StudentLogin() {
    const [studentNumber, setStudentNumber] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // 1. Get email from student number
            const studentsRef = collection(db, 'students');
            const q = query(studentsRef, where('student_number', '==', studentNumber));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                setError('学籍番号が見つかりません');
                setLoading(false);
                return;
            }

            const studentData = querySnapshot.docs[0].data();
            const email = studentData.email;

            // 2. Sign in with Firebase Auth
            await signInWithEmailAndPassword(auth, email, password);
            navigate('/student/dashboard');

        } catch (err) {
            console.error(err);
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
                setError('パスワードが正しくありません');
            } else {
                setError('ログイン処理中にエラーが発生しました');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <h1>臨床実習予約システム</h1>
                    <p>学生ログイン</p>
                </div>

                {error && <div className="login-error">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label" htmlFor="studentNumber">
                            学籍番号
                        </label>
                        <input
                            type="text"
                            id="studentNumber"
                            className="form-input"
                            value={studentNumber}
                            onChange={(e) => setStudentNumber(e.target.value)}
                            placeholder="例: 2024001"
                            required
                            autoComplete="username"
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="password">
                            パスワード
                        </label>
                        <input
                            type="password"
                            id="password"
                            className="form-input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="パスワードを入力"
                            required
                            autoComplete="current-password"
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ width: '100%' }}
                        disabled={loading}
                    >
                        {loading ? 'ログイン中...' : 'ログイン'}
                    </button>
                </form>

                <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                    <Link to="/admin/login" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                        管理者ログインはこちら
                    </Link>
                </div>
            </div>
        </div>
    );
}
