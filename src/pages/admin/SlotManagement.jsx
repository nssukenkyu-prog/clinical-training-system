import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Plus, Trash2, Calendar, Clock, Users, X, List, Grid } from 'lucide-react';
import { clsx } from 'clsx';

export default function SlotManagement() {
    const [slots, setSlots] = useState([]);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [viewMode, setViewMode] = useState('month'); // 'month' or 'day'
    const [formData, setFormData] = useState({
        startTime: '09:00',
        endTime: '12:00',
        trainingType: 'I',
        maxCapacity: 5
    });

    useEffect(() => {
        loadSlots();
    }, [currentMonth]);

    const loadSlots = async () => {
        setLoading(true);
        try {
            const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
            const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

            const startDate = startOfMonth.toISOString().split('T')[0];
            const endDate = endOfMonth.toISOString().split('T')[0];

            // 1. Fetch Slots
            const slotsRef = collection(db, 'slots');
            const qSlots = query(
                slotsRef,
                where('date', '>=', startDate),
                where('date', '<=', endDate)
            );
            const slotsSnapshot = await getDocs(qSlots);
            const slotsData = slotsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // 2. Fetch Reservations for this month (all statuses except cancelled)
            const reservationsRef = collection(db, 'reservations');
            const qReservations = query(
                reservationsRef,
                where('slot_date', '>=', startDate),
                where('slot_date', '<=', endDate)
            );
            const reservationsSnapshot = await getDocs(qReservations);
            // Filter out cancelled reservations
            const reservationsData = reservationsSnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(r => r.status !== 'cancelled');

            // 3. Fetch Student names for reservations
            const studentIds = [...new Set(reservationsData.map(r => r.student_id))];
            let studentsMap = {};
            let completedCountMap = {}; // 完了済み予約のカウント

            if (studentIds.length > 0) {
                const studentsRef = collection(db, 'students');
                const reservationsRef = collection(db, 'reservations');

                // Chunk for 'in' query (max 10)
                for (let i = 0; i < studentIds.length; i += 10) {
                    const chunk = studentIds.slice(i, i + 10);

                    // 学生情報の取得
                    const qStudents = query(studentsRef, where('__name__', 'in', chunk));
                    const studentsSnapshot = await getDocs(qStudents);
                    studentsSnapshot.forEach(doc => {
                        studentsMap[doc.id] = doc.data();
                    });

                    // その学生の以前の予約件数を取得（全ステータス）
                    const qPreviousReservations = query(
                        reservationsRef,
                        where('student_id', 'in', chunk)
                    );
                    const previousSnapshot = await getDocs(qPreviousReservations);
                    previousSnapshot.forEach(doc => {
                        const data = doc.data();
                        completedCountMap[data.student_id] = (completedCountMap[data.student_id] || 0) + 1;
                    });
                }
            }

            // 4. Merge reservations with student info (name, number, previous reservation count)
            const reservationsWithNames = reservationsData.map(r => ({
                ...r,
                student_name: studentsMap[r.student_id]?.name || '不明',
                student_number: studentsMap[r.student_id]?.student_number || '',
                // その学生の予約がこの1件のみ（他に予約がない）なら初日
                is_first_day: (completedCountMap[r.student_id] || 0) <= 1
            }));

            // 5. Merge into slots
            const slotsWithReservations = slotsData.map(slot => {
                const slotReservations = reservationsWithNames.filter(r => r.slot_id === slot.id);
                return {
                    ...slot,
                    reservations: slotReservations
                };
            });

            // Sort
            slotsWithReservations.sort((a, b) => {
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                return a.start_time.localeCompare(b.start_time);
            });

            setSlots(slotsWithReservations);
            setError(null);
        } catch (err) {
            console.error("Error loading slots:", err);
            setError(err.message || 'データの読み込みに失敗しました');
        } finally {
            setLoading(false);
        }
    };

    const getDaysInMonth = () => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const days = [];

        for (let i = 0; i < firstDay.getDay(); i++) {
            days.push(null);
        }

        for (let d = 1; d <= lastDay.getDate(); d++) {
            days.push(new Date(year, month, d));
        }

        return days;
    };

    const getSlotsForDate = (date) => {
        if (!date) return [];
        const dateStr = date.toISOString().split('T')[0];
        return slots.filter(slot => slot.date === dateStr);
    };

    const handleCreateSlot = async (e) => {
        e.preventDefault();

        if (!selectedDate) {
            alert('日付を選択してください');
            return;
        }

        const dateStr = selectedDate.toISOString().split('T')[0];

        try {
            await addDoc(collection(db, 'slots'), {
                date: dateStr,
                start_time: formData.startTime,
                end_time: formData.endTime,
                training_type: formData.trainingType,
                max_capacity: formData.maxCapacity,
                is_active: true
            });

            setShowModal(false);
            loadSlots();
        } catch (error) {
            console.error(error);
            alert('枠の作成に失敗しました');
        }
    };

    const handleDeleteSlot = async (slotId) => {
        if (!window.confirm('この枠を削除しますか？予約がある場合は削除できません。')) {
            return;
        }

        try {
            await deleteDoc(doc(db, 'slots', slotId));
            loadSlots();
        } catch (error) {
            console.error(error);
            alert('削除に失敗しました。');
        }
    };

    const handleBulkCreate = async () => {
        if (!selectedDate) {
            alert('日付を選択してください');
            return;
        }

        const templates = [
            { start: '09:00', end: '12:00' },
            { start: '13:00', end: '17:00' },
            { start: '17:30', end: '20:30' }
        ];

        const dateStr = selectedDate.toISOString().split('T')[0];

        try {
            const batch = writeBatch(db);
            const slotsRef = collection(db, 'slots');

            templates.forEach(t => {
                const newSlotRef = doc(slotsRef); // Generate new ID
                batch.set(newSlotRef, {
                    date: dateStr,
                    start_time: t.start,
                    end_time: t.end,
                    training_type: formData.trainingType,
                    max_capacity: formData.maxCapacity,
                    is_active: true
                });
            });

            await batch.commit();

            setShowModal(false);
            loadSlots();
        } catch (error) {
            console.error(error);
            alert('一括作成に失敗しました');
        }
    };

    const getTrainingTypeLabel = (type) => {
        const labels = { 'I': '実習Ⅰ', 'II': '実習Ⅱ', 'IV': '実習Ⅳ' };
        return labels[type] || type;
    };

    const getTrainingTypeColor = (type) => {
        const colors = {
            'I': 'bg-blue-100 text-blue-700 border-blue-200',
            'II': 'bg-emerald-100 text-emerald-700 border-emerald-200',
            'IV': 'bg-purple-100 text-purple-700 border-purple-200'
        };
        return colors[type] || 'bg-slate-100 text-slate-700 border-slate-200';
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'confirmed':
                return { label: '予約済', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
            case 'completed':
                return { label: '完了', color: 'bg-green-100 text-green-700 border-green-200' };
            default:
                return { label: status, color: 'bg-slate-100 text-slate-600 border-slate-200' };
        }
    };

    const formatDate = (date) => {
        if (!date) return '';
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        return `${date.getMonth() + 1}月${date.getDate()} 日(${days[date.getDay()]})`;
    };

    const prevMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
        setSelectedDate(null);
    };

    const nextMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
        setSelectedDate(null);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-primary border-t-white/0 rounded-full animate-spin"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-center">
                <div className="text-rose-500 mb-4 text-lg">エラーが発生しました</div>
                <div className="text-slate-500 text-sm mb-4">{error}</div>
                <button
                    onClick={() => { setError(null); loadSlots(); }}
                    className="px-4 py-2 bg-primary text-white rounded-lg"
                >
                    再読み込み
                </button>
            </div>
        );
    }

    const selectedDateSlots = getSlotsForDate(selectedDate);

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">実習枠管理</h1>
                    <p className="text-slate-500 mt-1">実習枠の作成・編集・削除を行います</p>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                    <button
                        onClick={() => setViewMode('month')}
                        className={clsx(
                            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                            viewMode === 'month' ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <Grid className="w-4 h-4" />
                        月表示
                    </button>
                    <button
                        onClick={() => setViewMode('day')}
                        className={clsx(
                            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                            viewMode === 'day' ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <List className="w-4 h-4" />
                        日表示
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Calendar / Day View */}
                <div className="lg:col-span-2 glass-panel p-6 rounded-2xl bg-white shadow-lg border-slate-100">
                    {viewMode === 'month' ? (
                        <>
                            <div className="flex items-center justify-between mb-6">
                                <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600">
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <h2 className="text-xl font-bold text-slate-900">
                                    {currentMonth.getFullYear()}年 {currentMonth.getMonth() + 1}月
                                </h2>
                                <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600">
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="grid grid-cols-7 gap-2 mb-2">
                                {['日', '月', '火', '水', '木', '金', '土'].map(day => (
                                    <div key={day} className="text-center text-sm text-slate-500 py-2 font-medium">
                                        {day}
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-7 gap-2">
                                {getDaysInMonth().map((date, index) => {
                                    if (!date) {
                                        return <div key={index} className="aspect-square"></div>;
                                    }

                                    const dateSlots = getSlotsForDate(date);
                                    const hasSlots = dateSlots.length > 0;
                                    const isSelected = selectedDate && date.toDateString() === selectedDate.toDateString();

                                    return (
                                        <button
                                            key={index}
                                            onClick={() => setSelectedDate(date)}
                                            className={clsx(
                                                "aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all border",
                                                isSelected ? "bg-primary text-white shadow-md border-primary scale-105" :
                                                    hasSlots ? "bg-blue-50 hover:bg-blue-100 text-slate-700 cursor-pointer border-blue-100" :
                                                        "bg-white hover:bg-slate-50 text-slate-500 border-slate-100"
                                            )}
                                        >
                                            <span className="text-lg font-medium">{date.getDate()}</span>
                                            {hasSlots && !isSelected && (
                                                <span className="text-[10px] text-blue-600 mt-1 font-bold">
                                                    {dateSlots.length}枠
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        /* Day View - Timetable */
                        <>
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                    <Calendar className="w-5 h-5 text-primary" />
                                    {selectedDate ? formatDate(selectedDate) : '日付を選択してください'}
                                </h2>
                                {selectedDate && (
                                    <button
                                        onClick={() => setShowModal(true)}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors shadow-md shadow-primary/20 text-sm font-bold"
                                    >
                                        <Plus className="w-4 h-4" />
                                        枠を追加
                                    </button>
                                )}
                            </div>

                            {!selectedDate ? (
                                <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
                                    <p>左のカレンダーから日付を選択してください</p>
                                </div>
                            ) : selectedDateSlots.length === 0 ? (
                                <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
                                    <p>この日に枠はありません</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {selectedDateSlots.map(slot => {
                                        const confirmed = (slot.reservations || []).length;
                                        return (
                                            <div key={slot.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200 hover:shadow-sm transition-shadow">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex items-center gap-2 text-lg font-bold text-slate-700">
                                                            <Clock className="w-5 h-5 text-primary" />
                                                            {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                                                        </div>
                                                        <span className={clsx("text-xs font-bold px-2 py-1 rounded border", getTrainingTypeColor(slot.training_type))}>
                                                            {getTrainingTypeLabel(slot.training_type)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm text-slate-500 flex items-center gap-1 bg-white px-2 py-1 rounded border border-slate-200">
                                                            <Users className="w-4 h-4" />
                                                            {confirmed} / {slot.max_capacity}
                                                        </span>
                                                        <button
                                                            onClick={() => handleDeleteSlot(slot.id)}
                                                            disabled={confirmed > 0}
                                                            className="p-2 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors disabled:opacity-30"
                                                            title={confirmed > 0 ? '予約がある枠は削除できません' : '削除'}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                                {confirmed > 0 && (
                                                    <div className="pt-3 border-t border-slate-200">
                                                        <p className="text-xs text-slate-500 mb-2 font-medium">予約者:</p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {(slot.reservations || []).map(r => (
                                                                <div key={r.id} className={clsx(
                                                                    "flex items-center gap-2 text-xs px-3 py-2 rounded-lg border",
                                                                    r.status === 'completed' ? "bg-green-50 border-green-200" : "bg-white border-slate-200"
                                                                )}>
                                                                    <span className="font-mono text-slate-400">{r.student_number}</span>
                                                                    <span className="font-medium text-slate-700">{r.student_name}</span>
                                                                    {r.is_first_day ? (
                                                                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold">初日</span>
                                                                    ) : null}
                                                                    {r.custom_start_time && r.custom_end_time && (
                                                                        <span className="text-slate-400">
                                                                            {r.custom_start_time}-{r.custom_end_time}
                                                                        </span>
                                                                    )}
                                                                    <span className={clsx("px-1.5 py-0.5 rounded text-[10px] font-bold border", getStatusBadge(r.status).color)}>
                                                                        {getStatusBadge(r.status).label}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Selected Date Details */}
                <div className="glass-panel p-6 rounded-2xl h-fit bg-white shadow-lg border-slate-100">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900">
                            <Calendar className="w-5 h-5 text-primary" />
                            {selectedDate ? formatDate(selectedDate) : '日付を選択'}
                        </h2>
                        {selectedDate && (
                            <button
                                onClick={() => setShowModal(true)}
                                className="p-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors shadow-md shadow-primary/20"
                            >
                                <Plus className="w-5 h-5" />
                            </button>
                        )}
                    </div>

                    {!selectedDate ? (
                        <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-xl border border-slate-100 dashed">
                            <p>カレンダーから日付を<br />選択してください</p>
                        </div>
                    ) : selectedDateSlots.length === 0 ? (
                        <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-xl border border-slate-100 dashed">
                            <p>この日に枠はありません</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {selectedDateSlots.map(slot => {
                                const confirmed = (slot.reservations || []).length;
                                return (
                                    <div key={slot.id} className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2 font-bold text-slate-700">
                                                <Clock className="w-4 h-4 text-slate-400" />
                                                {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                                            </div>
                                            <span className={clsx("text-xs font-bold px-2 py-1 rounded border", getTrainingTypeColor(slot.training_type))}>
                                                {getTrainingTypeLabel(slot.training_type)}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between mt-3">
                                            <span className="text-sm text-slate-500 flex items-center gap-1">
                                                <Users className="w-4 h-4" />
                                                予約: {confirmed} / {slot.max_capacity}
                                            </span>
                                            <button
                                                onClick={() => handleDeleteSlot(slot.id)}
                                                disabled={confirmed > 0}
                                                className="p-2 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                                title={confirmed > 0 ? '予約がある枠は削除できません' : '削除'}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>

                                        {/* 予約者リスト */}
                                        {confirmed > 0 && (
                                            <div className="mt-3 pt-3 border-t border-slate-100">
                                                <p className="text-xs text-slate-500 mb-2 font-medium">予約者:</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {(slot.reservations || []).map(r => (
                                                        <div
                                                            key={r.id}
                                                            className={clsx(
                                                                "flex items-center gap-1.5 text-xs px-2 py-1 rounded border",
                                                                r.status === 'completed' ? "bg-green-50 border-green-200" : "bg-slate-50 border-slate-200"
                                                            )}
                                                        >
                                                            <span className="font-mono text-slate-400">{r.student_number}</span>
                                                            <span className="font-medium text-slate-700">{r.student_name}</span>
                                                            {r.is_first_day && (
                                                                <span className="px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[9px] font-bold">初日</span>
                                                            )}
                                                            <span className={clsx("px-1 py-0.5 rounded text-[9px] font-bold border", getStatusBadge(r.status).color)}>
                                                                {getStatusBadge(r.status).label}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Create Slot Modal */}
            {
                showModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)}>
                        <div className="glass-panel p-6 rounded-2xl w-full max-w-md bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold text-slate-900">{formatDate(selectedDate)} に枠を追加</h3>
                                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <form onSubmit={handleCreateSlot} className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">実習区分</label>
                                    <select
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:border-primary text-slate-900 transition-colors"
                                        value={formData.trainingType}
                                        onChange={e => setFormData({ ...formData, trainingType: e.target.value })}
                                    >
                                        <option value="I">臨床実習Ⅰ（2年生）</option>
                                        <option value="II">臨床実習Ⅱ（3年生）</option>
                                        <option value="IV">臨床実習Ⅳ（4年生）</option>
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">開始時刻</label>
                                        <input
                                            type="time"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:border-primary text-slate-900 transition-colors"
                                            value={formData.startTime}
                                            onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">終了時刻</label>
                                        <input
                                            type="time"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:border-primary text-slate-900 transition-colors"
                                            value={formData.endTime}
                                            onChange={e => setFormData({ ...formData, endTime: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">最大人数</label>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:border-primary text-slate-900 transition-colors"
                                        value={formData.maxCapacity}
                                        onChange={e => setFormData({ ...formData, maxCapacity: parseInt(e.target.value) })}
                                        min="1"
                                        max="10"
                                        required
                                    />
                                </div>

                                <div className="flex gap-3 pt-4">
                                    <button
                                        type="button"
                                        className="flex-1 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors font-medium"
                                        onClick={handleBulkCreate}
                                    >
                                        一括作成
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 font-bold"
                                    >
                                        作成
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
