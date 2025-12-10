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
                <div className="w-8 h-8 border-2 border-primary border-t-white/0 rounded-full animate-spin"></div>
            </div>
        );
    }

    const filteredStudents = getFilteredStudents();

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">学生管理</h1>
                    <p className="text-slate-500 mt-1">学生の登録・編集・進捗確認を行います</p>
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
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
                    >
                        <Upload className="w-4 h-4" />
                        <span>CSV一括登録</span>
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="glass-panel p-4 rounded-xl flex flex-wrap items-center gap-4 bg-white shadow-sm border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500">
                    <Filter className="w-4 h-4" />
                    <span className="text-sm font-medium">フィルター:</span>
                </div>
                <select
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-700 transition-colors"
                    value={filter.grade}
                    onChange={e => setFilter({ ...filter, grade: e.target.value })}
                >
                    <option value="all">全学年</option>
                    <option value="2">2年生</option>
                    <option value="3">3年生</option>
                    <option value="4">4年生</option>
                </select>
                <select
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-700 transition-colors"
                    value={filter.trainingType}
                    onChange={e => setFilter({ ...filter, trainingType: e.target.value })}
                >
                    <option value="all">全実習</option>
                    <option value="I">実習Ⅰ</option>
                    <option value="II">実習Ⅱ</option>
                    <option value="IV">実習Ⅳ</option>
                </select>
                <div className="ml-auto text-sm text-slate-500">
                    {filteredStudents.length}名 表示中
                </div>
            </div>

            {/* Student List */}
            <div className="glass-panel rounded-2xl overflow-hidden bg-white shadow-lg border-slate-100">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50">
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500">学籍番号</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500">氏名</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500">学年</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500">実習区分</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500">累積時間</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500">ステータス</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredStudents.map(student => (
                                <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-mono text-slate-600">{student.student_number}</td>
                                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{student.name}</td>
                                    <td className="px-6 py-4 text-sm text-slate-500">{student.grade}年</td>
                                    <td className="px-6 py-4 text-sm">
                                        <span className="px-2 py-1 rounded text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                            {getTrainingTypeLabel(student.training_type)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-mono text-primary font-bold">{formatTime(getTotalMinutes(student))}</td>
                                    <td className="px-6 py-4">
                                        {student.auth_user_id ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">
                                                <Check className="w-3 h-3" /> 登録済
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold bg-amber-50 text-amber-600 border border-amber-100">
                                                <Mail className="w-3 h-3" /> 未設定
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        {!student.auth_user_id && (
                                            <button
                                                onClick={() => handleResendInvite(student)}
                                                className="text-xs text-primary hover:text-primary/80 hover:underline font-medium"
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
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)}>
                    <div className="glass-panel p-6 rounded-2xl w-full max-w-md bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold text-slate-900">学生を追加</h3>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleAddStudent} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">学籍番号</label>
                                <input
                                    type="text"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:border-primary text-slate-900 transition-colors"
                                    value={formData.studentNumber}
                                    onChange={e => setFormData({ ...formData, studentNumber: e.target.value })}
                                    placeholder="24ca000"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">メールアドレス</label>
                                <input
                                    type="email"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:border-primary text-slate-900 transition-colors"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    placeholder="student@example.com"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">氏名</label>
                                <input
                                    type="text"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:border-primary text-slate-900 transition-colors"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="山田 太郎"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">学年</label>
                                    <select
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:border-primary text-slate-900 transition-colors"
                                        value={formData.grade}
                                        onChange={e => setFormData({ ...formData, grade: parseInt(e.target.value) })}
                                    >
                                        <option value={2}>2年生</option>
                                        <option value={3}>3年生</option>
                                        <option value={4}>4年生</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">実習区分</label>
                                    <select
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:border-primary text-slate-900 transition-colors"
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
                                    className="w-full px-4 py-3 rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 font-bold"
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
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowBulkModal(false)}>
                    <div className="glass-panel p-6 rounded-2xl w-full max-w-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold text-slate-900">CSV一括登録</h3>
                            <button onClick={() => setShowBulkModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="mb-6 p-4 rounded-xl bg-blue-50 border border-blue-100 text-blue-700 text-sm">
                            <strong className="block mb-1">CSV形式:</strong> 学籍番号,メールアドレス,氏名,学年,実習区分<br />
                            <span className="text-blue-500">例: 24ca000,yamada@example.com,山田太郎,2,I</span>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-slate-700 mb-2">CSVデータ</label>
                            <textarea
                                className="w-full h-64 bg-slate-50 border border-slate-200 rounded-xl p-4 font-mono text-sm focus:outline-none focus:border-primary text-slate-900 transition-colors resize-none"
                                value={csvData}
                                onChange={e => setCsvData(e.target.value)}
                                placeholder={`24ca000,yamada@example.com,山田太郎,2,I\n24ca001,tanaka@example.com,田中花子,2,I`}
                            />
                        </div>

                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors font-medium"
                                onClick={() => setShowBulkModal(false)}
                            >
                                キャンセル
                            </button>
                            <button
                                type="button"
                                className="px-6 py-2 rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed font-bold"
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
