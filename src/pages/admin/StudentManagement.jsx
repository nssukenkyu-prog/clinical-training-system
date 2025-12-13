import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, getDocs, addDoc, writeBatch, doc, where, orderBy, deleteDoc, updateDoc } from 'firebase/firestore';
import { Users, Search, Plus, Upload, Mail, Check, X, Filter, Trash2, Edit } from 'lucide-react';
import { hashPassword } from '../../utils/crypto';
import { clsx } from 'clsx';

export default function StudentManagement() {
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedDetailStudent, setSelectedDetailStudent] = useState(null);
    const [newPassword, setNewPassword] = useState('');
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [formData, setFormData] = useState({
        studentNumber: '',
        email: '',
        name: '',
        grade: 2,
        trainingType: 'I'
    });
    const [editingStudent, setEditingStudent] = useState(null);
    const [csvData, setCsvData] = useState('');
    const [filter, setFilter] = useState({ grade: 'all', trainingType: 'all' });
    const [sending, setSending] = useState(false);
    const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());

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

    const handleStudentClick = (student) => {
        setSelectedDetailStudent(student);
        setNewPassword('');
        setShowDetailModal(true);
    };

    const handlePasswordReset = async (e) => {
        e.preventDefault();
        if (!selectedDetailStudent || !newPassword) return;

        if (!window.confirm(`「${selectedDetailStudent.name}」さんのパスワードを変更してもよろしいですか？`)) return;

        try {
            const passwordHash = await hashPassword(newPassword);
            await updateDoc(doc(db, 'students', selectedDetailStudent.id), {
                password_hash: passwordHash,
                password_set: true,
                updated_at: new Date().toISOString()
            });

            alert('パスワードを変更しました');
            setNewPassword('');
            // Update local state
            const updatedStudents = students.map(s =>
                s.id === selectedDetailStudent.id ? { ...s, password_set: true } : s
            );
            setStudents(updatedStudents);
        } catch (error) {
            console.error("Error resetting password:", error);
            alert('パスワード変更に失敗しました');
        }
    };

    const getStudentStats = (student) => {
        if (!student || !student.reservations) return { totalReserved: 0, totalCompleted: 0 };

        const reservations = student.reservations;

        // Cumulative (Completed)
        const completed = reservations.filter(r => r.status === 'completed');
        const totalCompleted = completed.reduce((sum, r) => sum + (r.actual_minutes || 0), 0);

        // Scheduled (Confirmed)
        const scheduled = reservations.filter(r => r.status === 'confirmed');
        const start = (str) => {
            const [h, m] = str.split(':').map(Number);
            return h * 60 + m;
        };
        const totalScheduled = scheduled.reduce((sum, r) => {
            return sum + (start(r.endTime) - start(r.startTime));
        }, 0);

        return { totalReserved: totalScheduled, totalCompleted };
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

    const handleDeleteStudent = async (student) => {
        if (!window.confirm(`「${student.name}」を削除しますか？\n※この操作は取り消せません。`)) return;

        try {
            await deleteDoc(doc(db, 'students', student.id));
            alert('削除しました');
            loadStudents();
        } catch (error) {
            console.error("Error deleting student:", error);
            alert('削除に失敗しました');
        }
    };

    const handleEditClick = (student) => {
        setEditingStudent({ ...student });
        // Use the same form data structure for editing
        setFormData({
            studentNumber: student.student_number,
            email: student.email,
            name: student.name,
            grade: student.grade,
            trainingType: student.training_type
        });
        setShowModal(true);
    };

    const handleUpdateStudent = async (e) => {
        e.preventDefault();
        if (!editingStudent) return;

        try {
            await updateDoc(doc(db, 'students', editingStudent.id), {
                student_number: formData.studentNumber,
                email: formData.email,
                name: formData.name,
                grade: formData.grade,
                training_type: formData.trainingType
            });

            alert('更新しました');
            setShowModal(false);
            setEditingStudent(null);
            setFormData({ studentNumber: '', email: '', name: '', grade: 2, trainingType: 'I' });
            loadStudents();
        } catch (error) {
            console.error("Error updating student:", error);
            alert('更新に失敗しました');
        }
    };

    // Modify handleAddStudent to verify if we are editing or adding
    const handleSaveStudent = async (e) => {
        if (editingStudent) {
            handleUpdateStudent(e);
        } else {
            handleAddStudent(e);
        }
    };



    const handleToggleSelect = (studentId) => {
        const newSelected = new Set(selectedStudentIds);
        if (newSelected.has(studentId)) {
            newSelected.delete(studentId);
        } else {
            newSelected.add(studentId);
        }
        setSelectedStudentIds(newSelected);
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedStudentIds(new Set(filteredStudents.map(s => s.id)));
        } else {
            setSelectedStudentIds(new Set());
        }
    };

    const handleBulkDelete = async () => {
        if (selectedStudentIds.size === 0) return;
        if (!window.confirm(`選択した ${selectedStudentIds.size} 名の学生を削除しますか？\n※この操作は取り消せません。`)) return;

        try {
            const batch = writeBatch(db);
            selectedStudentIds.forEach(id => {
                batch.delete(doc(db, 'students', id));
            });
            await batch.commit();
            alert('削除しました');
            setSelectedStudentIds(new Set());
            loadStudents();
        } catch (error) {
            console.error("Error bulk deleting students:", error);
            alert('一括削除に失敗しました');
        }
    };

    const isAllSelected = filteredStudents.length > 0 && selectedStudentIds.size === filteredStudents.length;

    return (
        <div className="space-y-8 pt-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">学生管理</h1>
                    <p className="text-slate-500 mt-1">学生の登録・編集・進捗確認を行います</p>
                </div >
                <div className="flex gap-3">
                    {selectedStudentIds.size > 0 && (
                        <button
                            onClick={handleBulkDelete}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 transition-colors shadow-sm font-bold"
                        >
                            <Trash2 className="w-4 h-4" />
                            <span>{selectedStudentIds.size}件を削除</span>
                        </button>
                    )}
                    <button
                        onClick={() => {
                            setEditingStudent(null);
                            setFormData({ studentNumber: '', email: '', name: '', grade: 2, trainingType: 'I' });
                            setShowModal(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                    >
                        <Plus className="w-4 h-4" />
                        <span>学生を追加</span>
                    </button>
                    {/* ... CSV Button ... */}
                    <button
                        onClick={() => setShowBulkModal(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
                    >
                        <Upload className="w-4 h-4" />
                        <span>CSV一括登録</span>
                    </button>
                </div>
            </div >

            {/* Filters */}
            < div className="glass-panel p-4 rounded-xl flex flex-wrap items-center gap-4 bg-white shadow-sm border border-slate-200" >
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
            </div >

            {/* Student List */}
            < div className="glass-panel rounded-2xl overflow-hidden bg-white shadow-lg border-slate-100" >
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50">
                                <th className="px-6 py-4 text-left">
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-300 text-primary focus:ring-primary"
                                        checked={isAllSelected}
                                        onChange={handleSelectAll}
                                    />
                                </th>
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
                                <tr key={student.id} className={`hover:bg-slate-50 transition-colors ${selectedStudentIds.has(student.id) ? 'bg-slate-50' : ''}`}>
                                    <td className="px-6 py-4">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-300 text-primary focus:ring-primary"
                                            checked={selectedStudentIds.has(student.id)}
                                            onChange={() => handleToggleSelect(student.id)}
                                        />
                                    </td>
                                    <td className="px-6 py-4 text-sm font-mono text-slate-600">{student.student_number}</td>
                                    <td className="px-6 py-4 text-sm font-medium text-slate-900 cursor-pointer hover:text-primary hover:underline" onClick={() => handleStudentClick(student)}>{student.name}</td>
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
                                    <td className="px-6 py-4 flex items-center gap-3">
                                        <button
                                            onClick={() => handleEditClick(student)}
                                            className="text-slate-400 hover:text-indigo-600 transition-colors p-1"
                                            title="編集"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteStudent(student)}
                                            className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                                            title="削除"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div >

            {/* Add/Edit Student Modal */}
            {
                showModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)}>
                        <div className="glass-panel p-6 rounded-2xl w-full max-w-md bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold text-slate-900">{editingStudent ? '学生情報を編集' : '学生を追加'}</h3>
                                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <form onSubmit={handleSaveStudent} className="space-y-4">
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
                                        {editingStudent ? '更新' : '登録'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* CSV Bulk Import Modal */}
            {
                showBulkModal && (
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
                )
            }

            {/* Student Detail Modal */}
            {showDetailModal && selectedDetailStudent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowDetailModal(false)}>
                    <div className="glass-panel p-6 rounded-2xl w-full max-w-4xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold text-slate-900">学生詳細情報</h3>
                            <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="grid md:grid-cols-2 gap-8">
                            {/* Left Column: Info & Stats */}
                            <div className="space-y-6">
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                    <h4 className="text-sm font-bold text-slate-500 mb-3 uppercase tracking-wider">基本情報</h4>
                                    <div className="space-y-2">
                                        <p><span className="text-slate-500 w-24 inline-block">氏名:</span> <span className="font-bold text-lg">{selectedDetailStudent.name}</span></p>
                                        <p><span className="text-slate-500 w-24 inline-block">学籍番号:</span> <span className="font-mono">{selectedDetailStudent.student_number}</span></p>
                                        <p><span className="text-slate-500 w-24 inline-block">メール:</span> {selectedDetailStudent.email}</p>
                                        <p><span className="text-slate-500 w-24 inline-block">学年/区分:</span> {selectedDetailStudent.grade}年 / 実習{selectedDetailStudent.training_type}</p>
                                    </div>
                                </div>

                                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                                    <h4 className="text-sm font-bold text-indigo-500 mb-3 uppercase tracking-wider">実習時間集計</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-xs text-indigo-400 mb-1">現在の予約合計</p>
                                            <p className="text-2xl font-bold text-indigo-700">{formatTime(getStudentStats(selectedDetailStudent).totalReserved)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-indigo-400 mb-1">累積実習時間</p>
                                            <p className="text-2xl font-bold text-emerald-600">{formatTime(getStudentStats(selectedDetailStudent).totalCompleted)}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="border-t border-slate-200 pt-6">
                                    <h4 className="text-sm font-bold text-slate-900 mb-4">パスワード変更</h4>
                                    <form onSubmit={handlePasswordReset} className="flex gap-2">
                                        <input
                                            type="password"
                                            placeholder="新しいパスワード"
                                            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                                            value={newPassword}
                                            onChange={e => setNewPassword(e.target.value)}
                                            minLength={6}
                                            required
                                        />
                                        <button
                                            type="submit"
                                            className="px-4 py-2 bg-slate-800 text-white text-sm font-bold rounded-lg hover:bg-slate-700 transition-colors"
                                        >
                                            変更
                                        </button>
                                    </form>
                                    <p className="text-xs text-slate-400 mt-2">※管理者権限でパスワードを強制的に上書きします。</p>
                                </div>
                            </div>

                            {/* Right Column: Reservation List */}
                            <div>
                                <h4 className="text-sm font-bold text-slate-500 mb-3 uppercase tracking-wider">予約履歴</h4>
                                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden max-h-[500px] overflow-y-auto">
                                    {(!selectedDetailStudent.reservations || selectedDetailStudent.reservations.length === 0) ? (
                                        <div className="p-8 text-center text-slate-400">履歴はありません</div>
                                    ) : (
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50 sticky top-0">
                                                <tr>
                                                    <th className="px-4 py-2 text-left font-medium text-slate-500">日付</th>
                                                    <th className="px-4 py-2 text-left font-medium text-slate-500">時間</th>
                                                    <th className="px-4 py-2 text-left font-medium text-slate-500">状態</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {selectedDetailStudent.reservations
                                                    .sort((a, b) => new Date(b.date) - new Date(a.date)) // Sort descending
                                                    .map((res, i) => (
                                                        <tr key={i} className="hover:bg-slate-50">
                                                            <td className="px-4 py-3">{res.date}</td>
                                                            <td className="px-4 py-3 whitespace-nowrap">{res.startTime} - {res.endTime}</td>
                                                            <td className="px-4 py-3">
                                                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${res.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                                                                        res.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
                                                                            'bg-slate-100 text-slate-600'
                                                                    }`}>
                                                                    {res.status === 'completed' ? '完了' :
                                                                        res.status === 'confirmed' ? '予約中' : res.status}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
}
