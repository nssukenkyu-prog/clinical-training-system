import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';

export default function SlotReservation() {
    const [student, setStudent] = useState(null);
    const [slots, setSlots] = useState([]);
    const [selectedDate, setSelectedDate] = useState(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [loading, setLoading] = useState(true);
    const [reserving, setReserving] = useState(false);
    const [settings, setSettings] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        if (student) {
            loadSlots();
        }
    }, [currentMonth, student]);

    const loadInitialData = async () => {
        try {
            const user = auth.currentUser;
            if (!user) {
                navigate('/student/login');
                return;
            }

            // 学生情報を取得
            const studentsRef = collection(db, 'students');
            const qStudent = query(studentsRef, where('auth_user_id', '==', user.uid));
            let studentSnapshot = await getDocs(qStudent);

            if (studentSnapshot.empty && user.email) {
                const qStudentEmail = query(studentsRef, where('email', '==', user.email));
                studentSnapshot = await getDocs(qStudentEmail);
            }

            if (!studentSnapshot.empty) {
                const studentDoc = studentSnapshot.docs[0];
                setStudent({ id: studentDoc.id, ...studentDoc.data() });
            }

            // 設定を取得
            const settingsRef = collection(db, 'settings');
            const qSettings = query(settingsRef, where('key', '==', 'training_config'));
            const settingsSnapshot = await getDocs(qSettings);

            if (!settingsSnapshot.empty) {
                setSettings(settingsSnapshot.docs[0].data().value);
            }

        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadSlots = async () => {
        if (!student) return;

        const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

        const startDate = startOfMonth.toISOString().split('T')[0];
        const endDate = endOfMonth.toISOString().split('T')[0];

        // 1. Fetch Slots
        const slotsRef = collection(db, 'slots');
        const qSlots = query(
            slotsRef,
            where('training_type', '==', student.training_type),
            where('is_active', '==', true),
            where('date', '>=', startDate),
            where('date', '<=', endDate)
        );
        const slotsSnapshot = await getDocs(qSlots);
        const slotsData = slotsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 2. Fetch Reservations for this month (to calculate availability)
        const reservationsRef = collection(db, 'reservations');
        const qReservations = query(
            reservationsRef,
            where('slot_date', '>=', startDate),
            where('slot_date', '<=', endDate),
            where('status', '==', 'confirmed')
        );
        const reservationsSnapshot = await getDocs(qReservations);
        const reservationsData = reservationsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 3. Merge Reservations into Slots
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

    const getAvailability = (slot) => {
        const confirmed = (slot.reservations || []).length;
        const remaining = slot.max_capacity - confirmed;

        if (remaining <= 0) return { status: 'none', label: '満員', remaining: 0, color: 'text-rose-500 bg-rose-50 border-rose-100' };
        if (remaining <= 2) return { status: 'few', label: '残りわずか', remaining, color: 'text-amber-600 bg-amber-50 border-amber-100' };
        return { status: 'available', label: '空きあり', remaining, color: 'text-emerald-600 bg-emerald-50 border-emerald-100' };
    };

    const isAlreadyReserved = (slot) => {
        return (slot.reservations || []).some(
            r => r.student_id === student?.id
        );
    };

    const handleReserve = async (slot) => {
        if (!student || reserving) return;

        const availability = getAvailability(slot);
        if (availability.remaining <= 0) {
            alert('この枠は満員です');
            return;
        }

        if (isAlreadyReserved(slot)) {
            alert('既にこの枠を予約しています');
            return;
        }

        if (!window.confirm(`${slot.date} ${slot.start_time.slice(0, 5)}〜${slot.end_time.slice(0, 5)} を予約しますか？`)) {
            return;
        }

        setReserving(true);

        try {
            const reservationData = {
                student_id: student.id,
                slot_id: slot.id,
                status: 'confirmed',
                created_at: new Date().toISOString(),
                // Denormalized slot data
                slot_date: slot.date,
                slot_start_time: slot.start_time,
                slot_end_time: slot.end_time,
                slot_training_type: slot.training_type
            };

            await addDoc(collection(db, 'reservations'), reservationData);

            // Send confirmation email via Cloudflare Worker
            try {
                await fetch('/api/send-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to: student.email,
                        subject: '【臨床実習】予約完了のお知らせ',
                        body: `
                            <p>${student.name} 様</p>
                            <p>以下の日程で予約を受け付けました。</p>
                            <ul>
                                <li>日時: ${slot.date} ${slot.start_time.slice(0, 5)} - ${slot.end_time.slice(0, 5)}</li>
                                <li>実習: ${slot.training_type}</li>
                            </ul>
                            <p>キャンセルはシステムから行ってください。</p>
                        `
                    })
                });
            } catch (emailError) {
                console.error('Failed to send email:', emailError);
            }

            alert('予約が完了しました');
            loadSlots(); // Reload

        } catch (error) {
            console.error(error);
            alert('予約処理中にエラーが発生しました');
        } finally {
            setReserving(false);
        }
    };

    const handleCancelReservation = async (slot) => {
        const reservation = (slot.reservations || []).find(
            r => r.student_id === student?.id
        );

        if (!reservation) return;

        // 12 hours check
        const slotDateTime = new Date(`${slot.date}T${slot.start_time}`);
        const now = new Date();
        const hoursUntilSlot = (slotDateTime - now) / (1000 * 60 * 60);
        const deadline = settings?.cancellationDeadlineHours || 12;

        if (hoursUntilSlot < deadline) {
            alert(`開始${deadline}時間前を過ぎているため、システムからのキャンセルはできません。\nTeamsでご連絡ください。`);
            return;
        }

        if (!window.confirm('この予約をキャンセルしますか？')) {
            return;
        }

        try {
            const reservationRef = doc(db, 'reservations', reservation.id);
            await updateDoc(reservationRef, {
                status: 'cancelled',
                cancelled_at: new Date().toISOString()
            });

            // Send Email Notification (Cloudflare Worker)
            try {
                await fetch('/api/send-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to: student.email,
                        subject: '【臨床実習】予約キャンセルのお知らせ',
                        body: `
                            <p>${student.name} 様</p>
                            <p>以下の予約をキャンセルしました。</p>
                            <ul>
                                <li>日時: ${slot.date} ${slot.start_time.slice(0, 5)} - ${slot.end_time.slice(0, 5)}</li>
                                <li>実習: ${slot.training_type}</li>
                            </ul>
                        `
                    })
                });
            } catch (emailError) {
                console.error('Failed to send email:', emailError);
            }

            alert('予約をキャンセルしました');
            loadSlots();

        } catch (error) {
            console.error(error);
            alert('キャンセル処理中にエラーが発生しました');
        }
    };

    const formatDate = (date) => {
        if (!date) return '';
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        return `${date.getMonth() + 1}月${date.getDate()}日(${days[date.getDay()]})`;
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
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">実習予約</h1>
                    <p className="text-slate-500 mt-1">希望する日時を選択してください</p>
                </div>
                <Link to="/student/dashboard" className="text-sm text-slate-500 hover:text-primary transition-colors font-medium">
                    ← ダッシュボードに戻る
                </Link>
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
                            const isPast = date < new Date().setHours(0, 0, 0, 0);

                            return (
                                <button
                                    key={index}
                                    onClick={() => !isPast && hasSlots && setSelectedDate(date)}
                                    disabled={isPast || !hasSlots}
                                    className={clsx(
                                        "aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all border",
                                        isSelected ? "bg-primary text-white shadow-md border-primary scale-105" :
                                            hasSlots ? "bg-blue-50 hover:bg-blue-100 text-slate-700 cursor-pointer border-blue-100" :
                                                "bg-white text-slate-300 border-slate-100 cursor-default"
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

                    <div className="mt-6 flex items-center gap-4 text-sm text-slate-500">
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-blue-100 border border-blue-200"></span>
                            <span>予約受付中</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-slate-100 border border-slate-200"></span>
                            <span>枠なし/過去</span>
                        </div>
                    </div>
                </div>

                {/* Slots List */}
                <div className="glass-panel p-6 rounded-2xl h-fit bg-white shadow-lg border-slate-100">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-900">
                        <CalendarIcon className="w-5 h-5 text-primary" />
                        {selectedDate ? formatDate(selectedDate) : '日付を選択'}
                    </h3>

                    {!selectedDate ? (
                        <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-xl border border-slate-100 dashed">
                            <p>カレンダーから日付を<br />選択してください</p>
                        </div>
                    ) : selectedDateSlots.length === 0 ? (
                        <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-xl border border-slate-100 dashed">
                            <p>この日の実習枠はありません</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {selectedDateSlots.map(slot => {
                                const availability = getAvailability(slot);
                                const reserved = isAlreadyReserved(slot);

                                return (
                                    <div key={slot.id} className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2 text-lg font-bold text-slate-700">
                                                <Clock className="w-4 h-4 text-slate-400" />
                                                {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                                            </div>
                                            <span className={clsx("text-xs font-bold px-2 py-1 rounded border", availability.color)}>
                                                {availability.label}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-slate-500">
                                                残り {availability.remaining} 枠
                                            </span>

                                            {reserved ? (
                                                <button
                                                    onClick={() => handleCancelReservation(slot)}
                                                    className="px-4 py-2 rounded-lg bg-rose-50 text-rose-600 text-sm font-bold border border-rose-100 hover:bg-rose-100 transition-colors"
                                                >
                                                    キャンセル
                                                </button>
                                            ) : availability.remaining > 0 ? (
                                                <button
                                                    onClick={() => handleReserve(slot)}
                                                    disabled={reserving}
                                                    className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors shadow-md shadow-primary/20"
                                                >
                                                    {reserving ? '処理中...' : '予約する'}
                                                </button>
                                            ) : (
                                                <span className="px-4 py-2 rounded-lg bg-slate-100 text-slate-400 text-sm font-bold border border-slate-200">
                                                    満員
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
