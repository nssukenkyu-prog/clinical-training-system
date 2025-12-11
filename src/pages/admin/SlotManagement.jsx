import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, writeBatch, updateDoc } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Plus, Trash2, Calendar, Clock, Users, X, List, Grid, Info, UserCheck, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';

export default function SlotManagement() {
    const [slots, setSlots] = useState([]);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState(null); // For detail modal
    const [viewMode, setViewMode] = useState('month'); // 'month' or 'day'

    // Form Data
    const [formData, setFormData] = useState({
        startTime: '09:00',
        endTime: '12:00',
        trainingType: 'I',
        maxCapacity: 5
    });

    // Timeline configuration
    const TIMELINE_START_HOUR = 8;
    const TIMELINE_END_HOUR = 21;
    const HOUR_HEIGHT = 100; // px per hour

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

            // 2. Fetch Reservations (all except cancelled)
            const reservationsRef = collection(db, 'reservations');
            const qReservations = query(
                reservationsRef,
                where('slot_date', '>=', startDate),
                where('slot_date', '<=', endDate)
            );
            const reservationsSnapshot = await getDocs(qReservations);
            const reservationsData = reservationsSnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(r => r.status !== 'cancelled');

            // 3. Fetch Student names & Previous Counts
            const studentIds = [...new Set(reservationsData.map(r => r.student_id))];
            let studentsMap = {};
            let completedCountMap = {};

            if (studentIds.length > 0) {
                const studentsRef = collection(db, 'students');
                const reservationsRef = collection(db, 'reservations');

                // Chunking
                for (let i = 0; i < studentIds.length; i += 10) {
                    const chunk = studentIds.slice(i, i + 10);

                    // Students
                    const qStudents = query(studentsRef, where('__name__', 'in', chunk));
                    const studentsSnapshot = await getDocs(qStudents);
                    studentsSnapshot.forEach(doc => {
                        studentsMap[doc.id] = doc.data();
                    });

                    // Previous Reservations for "First Day" check
                    const qPreviousReservations = query(reservationsRef, where('student_id', 'in', chunk));
                    const previousSnapshot = await getDocs(qPreviousReservations);
                    previousSnapshot.forEach(doc => {
                        const data = doc.data();
                        // Count confirmed/completed only
                        if (data.status !== 'cancelled') {
                            completedCountMap[data.student_id] = (completedCountMap[data.student_id] || 0) + 1;
                        }
                    });
                }
            }

            // 4. Merge
            const reservationsWithNames = reservationsData.map(r => ({
                ...r,
                student_name: studentsMap[r.student_id]?.name || '不明',
                student_number: studentsMap[r.student_id]?.student_number || '',
                // If this is their only/first reservation? 
                // Logic: (count <= 1). NOTE: This logic is simple, ideally verify date order.
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
            setError('データの読み込みに失敗しました');
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
        for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
        for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
        return days;
    };

    const getSlotsForDate = (date) => {
        if (!date) return [];
        // Local Date String construction manually to avoid UTC issues
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        return slots.filter(slot => slot.date === dateStr);
    };

    const handleCreateSlot = async (e) => {
        e.preventDefault();
        if (!selectedDate) return;

        // Fix date to local YYYY-MM-DD
        const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;

        try {
            await addDoc(collection(db, 'slots'), {
                date: dateStr,
                start_time: formData.startTime,
                end_time: formData.endTime,
                training_type: formData.trainingType,
                max_capacity: formData.maxCapacity,
                is_active: true
            });
            setShowCreateModal(false);
            loadSlots();
        } catch (error) {
            console.error(error);
            alert('枠の作成に失敗しました');
        }
    };

    const handleBulkCreate = async () => {
        if (!selectedDate) { alert('日付を選択してください'); return; }
        const templates = [
            { start: '09:00', end: '12:00' },
            { start: '13:00', end: '17:00' },
            { start: '17:30', end: '20:30' }
        ];
        // Fix date to local YYYY-MM-DD
        const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;

        try {
            const batch = writeBatch(db);
            const slotsRef = collection(db, 'slots');
            templates.forEach(t => {
                const newSlotRef = doc(slotsRef);
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
            setShowCreateModal(false);
            loadSlots();
        } catch (error) {
            console.error(error);
            alert('一括作成に失敗しました');
        }
    };

    const handleDeleteSlot = async (slotId) => {
        try {
            await deleteDoc(doc(db, 'slots', slotId));
            setSelectedSlot(null); // Close modal
            loadSlots();
        } catch (error) {
            console.error(error);
            alert('削除に失敗しました。');
        }
    };

    const handleCancelReservation = async (reservationId, studentName) => {
        if (!window.confirm(`${studentName}の予約を削除しますか？`)) return;
        try {
            await deleteDoc(doc(db, 'reservations', reservationId));
            // Reload to update UI
            loadSlots();
            // Close detail modal if open, or update its content? 
            // Better to reload and let user click again or update local state.
            // For simplicity, reload slots.
            setSelectedSlot(null);
        } catch (error) {
            console.error(error);
            alert('予約削除に失敗しました');
        }
    };

    // --- Helpers ---
    const getTrainingTypeLabel = (type) => {
        const labels = { 'I': '実習Ⅰ', 'II': '実習Ⅱ', 'IV': '実習Ⅳ' };
        return labels[type] || type;
    };

    const getTrainingTypeColor = (type) => {
        const colors = {
            'I': 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
            'II': 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
            'IV': 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
        };
        return colors[type] || 'bg-slate-50 text-slate-700 border-slate-200';
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'confirmed': return { label: '予約済', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
            case 'completed': return { label: '完了', color: 'bg-green-100 text-green-700 border-green-200' };
            default: return { label: status, color: 'bg-slate-100 text-slate-600 border-slate-200' };
        }
    };

    const formatDate = (date) => {
        if (!date) return '';
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        return `${date.getMonth() + 1}月${date.getDate()} 日(${days[date.getDay()]})`;
    };

    const prevMonth = () => { setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1)); setSelectedDate(null); };
    const nextMonth = () => { setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1)); setSelectedDate(null); };

    // --- Timeline Calculations ---
    const calculatePosition = (startTime, endTime) => {
        const [startH, startM] = startTime.split(':').map(Number);
        const [endH, endM] = endTime.split(':').map(Number);

        const startMinutes = (startH - TIMELINE_START_HOUR) * 60 + startM;
        const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);

        const top = startMinutes * (HOUR_HEIGHT / 60);
        const height = durationMinutes * (HOUR_HEIGHT / 60);

        return { top: `${top}px`, height: `${height}px` };
    };

    const selectedDateSlots = getSlotsForDate(selectedDate);

    if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div></div>;

    return (
        <div className="space-y-8 pt-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">実習枠管理</h1>
                    <p className="text-slate-500 mt-1">実習枠の作成・編集・削除を行います</p>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                    <button onClick={() => setViewMode('month')} className={clsx("flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors", viewMode === 'month' ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                        <Grid className="w-4 h-4" /> 月表示
                    </button>
                    <button onClick={() => setViewMode('day')} className={clsx("flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors", viewMode === 'day' ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                        <List className="w-4 h-4" /> 日表示
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Calendar View */}
                <div className="lg:col-span-2 glass-panel p-6 rounded-2xl bg-white shadow-lg border-slate-100">
                    <div className="flex items-center justify-between mb-6">
                        <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600"><ChevronLeft className="w-5 h-5" /></button>
                        <h2 className="text-xl font-bold text-slate-900">{currentMonth.getFullYear()}年 {currentMonth.getMonth() + 1}月</h2>
                        <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600"><ChevronRight className="w-5 h-5" /></button>
                    </div>

                    <div className="grid grid-cols-7 gap-2 mb-2">
                        {['日', '月', '火', '水', '木', '金', '土'].map(day => <div key={day} className="text-center text-sm text-slate-500 py-2 font-medium">{day}</div>)}
                    </div>

                    <div className="grid grid-cols-7 gap-2">
                        {getDaysInMonth().map((date, index) => {
                            if (!date) return <div key={index} className="aspect-square"></div>;
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
                                    {hasSlots && !isSelected && <span className="text-[10px] text-blue-600 mt-1 font-bold">{dateSlots.length}枠</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* --- Timeline / Day Panel --- */}
                <div className="glass-panel p-6 rounded-2xl h-[800px] flex flex-col bg-white shadow-lg border-slate-100">
                    <div className="flex items-center justify-between mb-4 flex-shrink-0">
                        <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900">
                            <Calendar className="w-5 h-5 text-primary" />
                            {selectedDate ? formatDate(selectedDate) : '日付を選択'}
                        </h2>
                        {selectedDate && (
                            <button onClick={() => setShowCreateModal(true)} className="p-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors shadow-md shadow-primary/20">
                                <Plus className="w-5 h-5" />
                            </button>
                        )}
                    </div>

                    {!selectedDate ? (
                        <div className="flex-1 flex items-center justify-center text-slate-400 bg-slate-50 rounded-xl border border-slate-100 dashed m-2">
                            <p className="text-center">カレンダーから日付を<br />選択してください</p>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto relative border border-slate-100 rounded-xl bg-slate-50/50">
                            {/* Time Grid */}
                            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                                {Array.from({ length: TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1 }).map((_, i) => {
                                    const hour = TIMELINE_START_HOUR + i;
                                    return (
                                        <div key={hour} className="absolute w-full border-t border-slate-200 flex items-start" style={{ top: `${i * HOUR_HEIGHT}px` }}>
                                            <span className="text-xs text-slate-400 -mt-2.5 bg-slate-50/50 px-1">{hour}:00</span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Slot Cards */}
                            <div className="absolute top-0 left-12 right-2 h-full">
                                {selectedDateSlots.map(slot => {
                                    const style = calculatePosition(slot.start_time, slot.end_time);
                                    const confirmed = (slot.reservations || []).length;

                                    return (
                                        <div
                                            key={slot.id}
                                            onClick={() => setSelectedSlot(slot)}
                                            style={style}
                                            className={clsx(
                                                "absolute w-full rounded-lg border p-2 cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] hover:z-10 bg-opacity-90 backdrop-blur-sm",
                                                getTrainingTypeColor(slot.training_type)
                                            )}
                                        >
                                            <div className="flex justify-between items-start h-full flex-col">
                                                <div>
                                                    <div className="text-xs font-bold opacity-70 mb-0.5">
                                                        {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                                                    </div>
                                                    <div className="font-bold text-sm leading-tight">
                                                        {getTrainingTypeLabel(slot.training_type)}
                                                    </div>
                                                </div>
                                                <div className="w-full flex justify-between items-end">
                                                    <div className="flex items-center gap-1 text-xs font-medium bg-white/50 px-1.5 py-0.5 rounded">
                                                        <Users className="w-3 h-3" />
                                                        {confirmed}/{slot.max_capacity}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Spacer */}
                            <div style={{ height: `${(TIMELINE_END_HOUR - TIMELINE_START_HOUR) * HOUR_HEIGHT + 50}px` }}></div>
                        </div>
                    )}
                </div>
            </div>

            {/* --- Modals --- */}

            {/* Create Slot Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowCreateModal(false)}>
                    <div className="glass-panel p-6 rounded-2xl w-full max-w-md bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold text-slate-900">{formatDate(selectedDate)} に枠を追加</h3>
                            <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleCreateSlot} className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">実習区分</label>
                                <select className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2" value={formData.trainingType} onChange={e => setFormData({ ...formData, trainingType: e.target.value })}>
                                    <option value="I">臨床実習Ⅰ（2年生）</option>
                                    <option value="II">臨床実習Ⅱ（3年生）</option>
                                    <option value="IV">臨床実習Ⅳ（4年生）</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-slate-700 mb-2">開始</label><input type="time" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2" value={formData.startTime} onChange={e => setFormData({ ...formData, startTime: e.target.value })} required /></div>
                                <div><label className="block text-sm font-medium text-slate-700 mb-2">終了</label><input type="time" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2" value={formData.endTime} onChange={e => setFormData({ ...formData, endTime: e.target.value })} required /></div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">定員</label>
                                <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2" value={formData.maxCapacity} onChange={e => setFormData({ ...formData, maxCapacity: parseInt(e.target.value) })} min="1" max="10" required />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button type="button" className="flex-1 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium transition-colors" onClick={handleBulkCreate}>一括作成</button>
                                <button type="submit" className="flex-1 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary/90 font-bold transition-colors">作成</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Slot Detail Modal (NEW) */}
            {selectedSlot && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedSlot(null)}>
                    <div className="glass-panel p-0 rounded-2xl w-full max-w-lg bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className={clsx("p-6 border-b", getTrainingTypeColor(selectedSlot.training_type))}>
                            <div className="flex items-center justify-between mb-2">
                                <span className="px-2 py-1 bg-white/50 rounded-md text-xs font-bold uppercase tracking-wider">
                                    {getTrainingTypeLabel(selectedSlot.training_type)}
                                </span>
                                <button onClick={() => setSelectedSlot(null)} className="text-slate-600/70 hover:text-slate-900 transition-colors"><X className="w-6 h-6" /></button>
                            </div>
                            <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                                <Clock className="w-6 h-6" />
                                {selectedSlot.start_time.slice(0, 5)} - {selectedSlot.end_time.slice(0, 5)}
                            </h3>
                            <p className="text-slate-600 mt-2 flex items-center gap-2 text-sm font-medium">
                                <Calendar className="w-4 h-4" />
                                {formatDate(selectedDate)}
                            </p>
                        </div>

                        {/* Body */}
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h4 className="font-bold text-slate-900 flex items-center gap-2">
                                    <Users className="w-5 h-5 text-primary" />
                                    予約状況 ({selectedSlot.reservations.length} / {selectedSlot.max_capacity})
                                </h4>
                                {selectedSlot.reservations.length === 0 && (
                                    <button
                                        onClick={() => {
                                            if (window.confirm('この枠を削除しますか？')) handleDeleteSlot(selectedSlot.id);
                                        }}
                                        className="text-xs text-rose-500 hover:bg-rose-50 px-3 py-2 rounded-lg transition-colors flex items-center gap-1"
                                    >
                                        <Trash2 className="w-4 h-4" /> 枠を削除
                                    </button>
                                )}
                            </div>

                            {selectedSlot.reservations.length === 0 ? (
                                <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-100 dashed">
                                    <p className="text-slate-400">現在、予約はありません</p>
                                </div>
                            ) : (
                                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                                    {selectedSlot.reservations.map(r => (
                                        <div key={r.id} className="flex items-start justify-between p-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-white hover:shadow-sm transition-all">
                                            <div className="flex gap-3">
                                                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm">
                                                    {r.student_name.slice(0, 1)}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-slate-900">{r.student_name}</span>
                                                        <span className={clsx("text-[10px] px-1.5 py-0.5 rounded border font-bold", getStatusBadge(r.status).color)}>
                                                            {getStatusBadge(r.status).label}
                                                        </span>
                                                        {r.is_first_day && (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 font-bold">初日</span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-slate-500 font-mono mt-0.5">{r.student_number}</div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleCancelReservation(r.id, r.student_name)}
                                                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                                title="予約を解除"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Warning if capacity full */}
                            {selectedSlot.reservations.length >= selectedSlot.max_capacity && (
                                <div className="mt-4 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-100">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    <span>定員に達しています。これ以上の予約はできません。</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
