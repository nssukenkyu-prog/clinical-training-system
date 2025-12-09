import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Plus, Trash2, Calendar, Clock, Users, X } from 'lucide-react';
import { clsx } from 'clsx';

export default function SlotManagement() {
    const [slots, setSlots] = useState([]);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
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

            // 2. Fetch Reservations for this month
            const reservationsRef = collection(db, 'reservations');
            const qReservations = query(
                reservationsRef,
                where('slot_date', '>=', startDate),
                where('slot_date', '<=', endDate),
                where('status', '==', 'confirmed')
            );
            const reservationsSnapshot = await getDocs(qReservations);
            const reservationsData = reservationsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // 3. Merge
            const slotsWithReservations = slotsData.map(slot => {
                const slotReservations = reservationsData.filter(r => r.slot_id === slot.id);
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
        } catch (error) {
            console.error("Error loading slots:", error);
            // alert('データの読み込みに失敗しました'); // Don't block UI on load error
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

    const selectedDateSlots = getSlotsForDate(selectedDate);

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-slate-900">実習枠管理</h1>
                <p className="text-slate-500 mt-1">実習枠の作成・編集・削除を行います</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Calendar */}
                <div className="lg:col-span-2 glass-panel p-6 rounded-2xl bg-white shadow-lg border-slate-100">
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
                                            <span className="text-xs font-bold px-2 py-1 rounded bg-slate-100 text-slate-600 border border-slate-200">
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
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Create Slot Modal */}
            {showModal && (
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
            )}
        </div>
    );
}
