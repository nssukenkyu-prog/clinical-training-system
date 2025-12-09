import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, getDocs, addDoc, writeBatch, doc, where, orderBy } from 'firebase/firestore';
import { Users, Search, Plus, Upload, Mail, Check, X, Filter } from 'lucide-react';
import { clsx } from 'clsx';

export default function StudentManagement() {
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [formData, setFormData] = useState({
        studentNumber: '',
        email: '',
        name: '',
        grade: 2,
        trainingType: 'I'
    });
    const [csvData, setCsvData] = useState('');
    const [filter, setFilter] = useState({ grade: 'all', trainingType: 'all' });
    const [sending, setSending] = useState(false);

    useEffect(() => {
        loadStudents();
    }, []);

    const loadStudents = async () => {
        try {
            // Fetch all students
            const studentsRef = collection(db, 'students');
            const qStudents = query(studentsRef, orderBy('student_number'));
            const studentsSnapshot = await getDocs(qStudents);
            const studentsData = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Fetch all completed reservations to calculate total minutes
            // Optimization: In a real app, we might want to aggregate this on the server or store in student doc.
            const reservationsRef = collection(db, 'reservations');
            const qReservations = query(reservationsRef, where('status', '==', 'completed'));
            const reservationsSnapshot = await getDocs(qReservations);
            const reservationsData = reservationsSnapshot.docs.map(doc => doc.data());

            // Merge reservations into students
            const studentsWithStats = studentsData.map(student => {
                const studentReservations = reservationsData.filter(r => r.student_id === student.id);
                return {
                    ...student,
                    reservations: studentReservations
                };
            });

            setStudents(studentsWithStats);
        } catch (error) {
            console.error("Error loading students:", error);
        } finally {
            setLoading(false);
        }
    };

    const getFilteredStudents = () => {
        return students.filter(s => {
            if (filter.grade !== 'all' && s.grade !== parseInt(filter.grade)) return false;
            if (filter.trainingType !== 'all' && s.training_type !== filter.trainingType) return false;
            return true;
        });
    };

    const handleAddStudent = async (e) => {
        e.preventDefault();

        try {
            // Firestoreに学生ドキュメントを作成
            // Note: Auth user creation requires Admin SDK (Cloudflare Worker).
            // For now, we just create the record. The student will need to sign up or we use a Worker.
            // We'll mark 'password_set' as false.

            await addDoc(collection(db, 'students'), {
                student_number: formData.studentNumber,
                email: formData.email,
                name: formData.name,
                grade: formData.grade,
                training_type: formData.trainingType,
                auth_user_id: null, // Will be linked upon registration
                password_set: false,
                created_at: new Date().toISOString()
            });

            // Trigger Worker to send invite/create Auth user (Placeholder)
            console.log('Should trigger Cloudflare Worker to create Auth user and send invite email');

            setShowModal(false);
            setFormData({ studentNumber: '', email: '', name: '', grade: 2, trainingType: 'I' });
            loadStudents();
            alert('学生を登録しました。');

        } catch (error) {
            console.error(error);
            alert('学生登録に失敗しました');
        }
    };

    const handleBulkImport = async () => {
        if (!csvData.trim()) {
            alert('CSVデータを入力してください');
            return;
        }

        const lines = csvData.trim().split('\n');
        const studentsToAdd = [];

        for (const line of lines) {
            const [studentNumber, email, name, grade, trainingType] = line.split(',').map(s => s.trim());
            if (studentNumber && email && name) {
                studentsToAdd.push({
                    student_number: studentNumber,
                    email,
                    name,
                    grade: parseInt(grade) || 2,
                    training_type: trainingType || 'I',
                    password_set: false,
                    auth_user_id: null,
                    created_at: new Date().toISOString()
                });
            }
        }

        if (studentsToAdd.length === 0) {
            alert('有効なデータがありません');
            return;
        }

        setSending(true);

        try {
            const batch = writeBatch(db);
            const studentsRef = collection(db, 'students');

            studentsToAdd.forEach(student => {
                const newDocRef = doc(studentsRef);
                batch.set(newDocRef, student);
            });

            await batch.commit();

            // Trigger Worker for bulk Auth creation (Placeholder)
            console.log('Should trigger Cloudflare Worker for bulk Auth creation');

            setShowBulkModal(false);
            setCsvData('');
            loadStudents();
            alert(`${studentsToAdd.length}名の学生を登録しました`);

        } catch (error) {
            console.error(error);
            alert('一括登録中にエラーが発生しました');
        } finally {
            setSending(false);
        }
    };

    const handleResendInvite = async (student) => {
        if (!window.confirm(`${student.name}さんに招待メールを再送信しますか？`)) return;

        // Placeholder for Worker call
        alert('招待メール再送信機能はCloudflare Worker実装後に利用可能です');
    };

    const getTrainingTypeLabel = (type) => {
        const labels = { 'I': '実習Ⅰ', 'II': '実習Ⅱ', 'IV': '実習Ⅳ' };
        return labels[type] || type;
    };

    const getTotalMinutes = (student) => {
        const completed = (student.reservations || []); // Already filtered for completed in loadStudents
        return completed.reduce((sum, r) => sum + (r.actual_minutes || 0), 0);
    };

    const formatTime = (minutes) => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours}h${mins}m`;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    const filteredStudents = getFilteredStudents();

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold">学生管理</h1>
                    <p className="text-slate-400 mt-1">学生の登録・編集・進捗確認を行います</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowModal(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                    >
                        <Plus className="w-4 h-4" />
                        <span>学生を追加</span>
                    </button>
                    <button
                        onClick={() => setShowBulkModal(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-colors border border-white/10"
                    >
                        <Upload className="w-4 h-4" />
                        <span>CSV一括登録</span>
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="glass-panel p-4 rounded-xl flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 text-slate-400">
                    <Filter className="w-4 h-4" />
                    <span className="text-sm font-medium">フィルター:</span>
                </div>
                <select
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary transition-colors"
                    value={filter.grade}
                    onChange={e => setFilter({ ...filter, grade: e.target.value })}
                >
                    <option value="all">全学年</option>
                    <option value="2">2年生</option>
                    <option value="3">3年生</option>
                    <option value="4">4年生</option>
                </select>
                <select
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary transition-colors"
                    value={filter.trainingType}
                    onChange={e => setFilter({ ...filter, trainingType: e.target.value })}
                >
                    <option value="all">全実習</option>
                    <option value="I">実習Ⅰ</option>
                    <option value="II">実習Ⅱ</option>
                    <option value="IV">実習Ⅳ</option>
                </select>
                <div className="ml-auto text-sm text-slate-400">
                    {filteredStudents.length}名 表示中
                </div>
            </div>

            {/* Student List */}
            <div className="glass-panel rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-white/10 bg-white/5">
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400">学籍番号</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400">氏名</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400">学年</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400">実習区分</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400">累積時間</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400">ステータス</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredStudents.map(student => (
                                <tr key={student.id} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4 text-sm font-mono text-slate-300">{student.student_number}</td>
                                    <td className="px-6 py-4 text-sm font-medium">{student.name}</td>
                                    <td className="px-6 py-4 text-sm text-slate-400">{student.grade}年</td>
                                    <td className="px-6 py-4 text-sm">
                                        <span className="px-2 py-1 rounded text-xs font-bold bg-white/10 text-slate-300">
                                            {getTrainingTypeLabel(student.training_type)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-mono text-primary">{formatTime(getTotalMinutes(student))}</td>
                                    <td className="px-6 py-4">
                                        {student.auth_user_id ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">
                                                <Check className="w-3 h-3" /> 登録済
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/20">
                                                <Mail className="w-3 h-3" /> 未設定
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        {!student.auth_user_id && (
                                            <button
                                                onClick={() => handleResendInvite(student)}
                                                className="text-xs text-primary hover:text-primary/80 hover:underline"
                                            >
                                                再送信
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Student Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)}>
                    <div className="glass-panel p-6 rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold">学生を追加</h3>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleAddStudent} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">学籍番号</label>
                                <input
                                    type="text"
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-primary transition-colors"
                                    value={formData.studentNumber}
                                    onChange={e => setFormData({ ...formData, studentNumber: e.target.value })}
                                    placeholder="2024001"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">メールアドレス</label>
                                <input
                                    type="email"
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-primary transition-colors"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    placeholder="student@example.com"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">氏名</label>
                                <input
                                    type="text"
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-primary transition-colors"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="山田 太郎"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">学年</label>
                                    <select
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-primary transition-colors"
                                        value={formData.grade}
                                        onChange={e => setFormData({ ...formData, grade: parseInt(e.target.value) })}
                                    >
                                        <option value={2}>2年生</option>
                                        <option value={3}>3年生</option>
                                        <option value={4}>4年生</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">実習区分</label>
                                    <select
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-primary transition-colors"
                                        value={formData.trainingType}
                                        onChange={e => setFormData({ ...formData, trainingType: e.target.value })}
                                    >
                                        <option value="I">実習Ⅰ</option>
                                        <option value="II">実習Ⅱ</option>
                                        <option value="IV">実習Ⅳ</option>
                                    </select>
                                </div>
                            </div>

                            <div className="pt-4">
                                <button
                                    type="submit"
                                    className="w-full px-4 py-3 rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 font-medium"
                                >
                                    登録
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* CSV Bulk Import Modal */}
            {showBulkModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowBulkModal(false)}>
                    <div className="glass-panel p-6 rounded-2xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold">CSV一括登録</h3>
                            <button onClick={() => setShowBulkModal(false)} className="text-slate-400 hover:text-white">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="mb-6 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-200 text-sm">
                            <strong>CSV形式:</strong> 学籍番号,メールアドレス,氏名,学年,実習区分<br />
                            例: 2024001,yamada@example.com,山田太郎,2,I
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-slate-300 mb-2">CSVデータ</label>
                            <textarea
                                className="w-full h-64 bg-white/5 border border-white/10 rounded-xl p-4 font-mono text-sm focus:outline-none focus:border-primary transition-colors resize-none"
                                value={csvData}
                                onChange={e => setCsvData(e.target.value)}
                                placeholder={`2024001,yamada@example.com,山田太郎,2,I\n2024002,tanaka@example.com,田中花子,2,I`}
                            />
                        </div>

                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 transition-colors"
                                onClick={() => setShowBulkModal(false)}
                            >
                                キャンセル
                            </button>
                            <button
                                type="button"
                                className="px-6 py-2 rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={handleBulkImport}
                                disabled={sending}
                            >
                                {sending ? '登録中...' : '一括登録'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
