import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, getDoc } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, AlertCircle, X, List, LayoutGrid } from 'lucide-react';
import { clsx } from 'clsx';

export default function SlotReservation() {
    const [student, setStudent] = useState(null);
    const [slots, setSlots] = useState([]);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [loading, setLoading] = useState(true);
    const [reserving, setReserving] = useState(false);
    const [settings, setSettings] = useState(null);
    const [showTimeModal, setShowTimeModal] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [customStartTime, setCustomStartTime] = useState('');
    const [customEndTime, setCustomEndTime] = useState('');
    const [viewMode, setViewMode] = useState('day'); // 'month' or 'day'
    const navigate = useNavigate();

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        if (student) {
            loadSlots();
        }
    }, [currentMonth, student, viewMode]); // Reload when month changes or view mode changes (though mainly month)

    const loadInitialData = async () => {
        try {
            const studentId = sessionStorage.getItem('clinical_student_id');
            if (!studentId) {
                navigate('/');
                return;
            }
            const studentDoc = await getDoc(doc(db, 'students', studentId));
            if (!studentDoc.exists()) {
                sessionStorage.clear();
                navigate('/');
                return;
            }
            setStudent({ id: studentDoc.id, ...studentDoc.data() });

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

        // Load for the whole current month to support both views efficiently
        // Or if in day view, maybe just load surrounding days? 
        // For simplicity, let's load the current month + padding if needed, 
        // but sticking to month-based loading is easier for the calendar view.

        // If viewMode is 'day', we might want to ensure we have slots for the selectedDate.
        // But let's keep the logic simple: Load slots for the month of 'currentMonth' state.
        // When switching days in Day View, if we cross month boundaries, we update currentMonth.

        const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

        const startDate = startOfMonth.toISOString().split('T')[0];
        const endDate = endOfMonth.toISOString().split('T')[0];

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

        const reservationsRef = collection(db, 'reservations');
        const qReservations = query(
            reservationsRef,
            where('slot_date', '>=', startDate),
            where('slot_date', '<=', endDate),
            where('status', '==', 'confirmed')
        );
        const reservationsSnapshot = await getDocs(qReservations);
        const reservationsData = reservationsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const slotsWithReservations = slotsData.map(slot => {
            const slotReservations = reservationsData.filter(r => r.slot_id === slot.id);
            return {
                ...slot,
                reservations: slotReservations
            };
        });

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
        for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
        for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
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
        return (slot.reservations || []).some(r => r.student_id === student?.id);
    };

    const handleReserve = (slot) => {
        if (!student || reserving) return;
        const availability = getAvailability(slot);
        if (availability.remaining <= 0) { alert('この枠は満員です'); return; }
        if (isAlreadyReserved(slot)) { alert('既にこの枠を予約しています'); return; }
        setSelectedSlot(slot);
        setCustomStartTime(slot.start_time.slice(0, 5));
        setCustomEndTime(slot.end_time.slice(0, 5));
        setShowTimeModal(true);
    };

    const timeToMinutes = (time) => {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
    };

    const confirmReservation = async () => {
        if (!selectedSlot || !student || reserving) return;
        const slot = selectedSlot;
        const slotStartMins = timeToMinutes(slot.start_time.slice(0, 5));
        const slotEndMins = timeToMinutes(slot.end_time.slice(0, 5));
        const customStartMins = timeToMinutes(customStartTime);
        const customEndMins = timeToMinutes(customEndTime);
        const duration = customEndMins - customStartMins;
        const minMinutes = settings?.minDailyMinutes || 120;
        const maxMinutes = settings?.maxDailyMinutes || 480;

        if (customStartMins < slotStartMins || customEndMins > slotEndMins) { alert(`時間は枠の範囲内 (${slot.start_time.slice(0, 5)} 〜 ${slot.end_time.slice(0, 5)}) で入力してください。`); return; }
        if (customStartMins >= customEndMins) { alert('終了時間は開始時間より後にしてください。'); return; }
        if (duration < minMinutes) { alert(`最低 ${Math.floor(minMinutes / 60)}時間${minMinutes % 60}分 以上で予約してください。`); return; }
        if (duration > maxMinutes) { alert(`1日の最高時間 ${Math.floor(maxMinutes / 60)}時間${maxMinutes % 60}分 を超えています。`); return; }

        setReserving(true);
        try {
            const reservationData = {
                student_id: student.id,
                slot_id: slot.id,
                status: 'confirmed',
                created_at: new Date().toISOString(),
                slot_date: slot.date,
                slot_start_time: slot.start_time,
                slot_end_time: slot.end_time,
                slot_training_type: slot.training_type,
                custom_start_time: customStartTime,
                custom_end_time: customEndTime,
                custom_duration_minutes: duration
            };
            await addDoc(collection(db, 'reservations'), reservationData);

            // Email Notification via GAS
            if (student.email) {
                try {
                    const GAS_WEBHOOK_URL = import.meta.env.VITE_GAS_EMAIL_WEBHOOK_URL;
                    if (GAS_WEBHOOK_URL) {
                        await fetch(GAS_WEBHOOK_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            mode: 'no-cors', // GAS requires no-cors
                            body: JSON.stringify({
                                to: student.email,
                                subject: '【臨床実習】予約完了のお知らせ',
                                body: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f5f7fa;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 16px 16px 0 0; padding: 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">NSSU 臨床実習予約システム</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">予約完了のお知らせ</p>
    </div>
    
    <!-- Content -->
    <div style="background: white; padding: 32px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <p style="color: #1e293b; font-size: 16px; margin: 0 0 24px 0;">
        <strong>${student.name}</strong> 様
      </p>
      
      <p style="color: #64748b; font-size: 14px; margin: 0 0 24px 0; line-height: 1.6;">
        以下の日程で実習予約を受け付けました。
      </p>
      
      <!-- Reservation Details Card -->
      <div style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 12px; padding: 24px; margin-bottom: 24px; border-left: 4px solid #6366f1;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 13px; width: 80px;">📅 日付</td>
            <td style="padding: 8px 0; color: #1e293b; font-size: 15px; font-weight: 600;">${slot.date}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">⏰ 時間</td>
            <td style="padding: 8px 0; color: #1e293b; font-size: 15px; font-weight: 600;">${customStartTime} - ${customEndTime}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">📋 区分</td>
            <td style="padding: 8px 0; color: #1e293b; font-size: 15px; font-weight: 600;">臨床実習 ${slot.training_type}</td>
          </tr>
        </table>
      </div>
      
      <!-- Notice -->
      <div style="background: #fef3c7; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <p style="color: #92400e; font-size: 13px; margin: 0; line-height: 1.5;">
          ⚠️ キャンセルや変更はシステムから行ってください。<br>
          当日欠席の場合は、必ず事前にご連絡ください。
        </p>
      </div>
      
      <!-- Footer -->
      <div style="border-top: 1px solid #e2e8f0; padding-top: 24px; text-align: center;">
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">
          このメールは自動送信されています。<br>
          ご不明な点がございましたら、担当者までお問い合わせください。
        </p>
      </div>
    </div>
    
    <!-- Branding -->
    <p style="text-align: center; color: #94a3b8; font-size: 11px; margin-top: 24px;">
      © ${new Date().getFullYear()} NSSU 臨床実習予約システム
    </p>
  </div>
</body>
</html>
                                `
                            })
                        });
                        console.log('[Email] Sent via GAS webhook');
                    } else {
                        console.log('[Email] GAS webhook URL not configured, skipping email');
                    }
                } catch (e) { console.error('Email failed', e); }
            }

            alert('予約が完了しました');
            setShowTimeModal(false);
            setSelectedSlot(null);
            loadSlots();
        } catch (error) {
            console.error(error);
            alert('予約処理中にエラーが発生しました');
        } finally {
            setReserving(false);
        }
    };

    const handleCancelReservation = async (slot) => {
        const reservation = (slot.reservations || []).find(r => r.student_id === student?.id);
        if (!reservation) return;
        const slotDateTime = new Date(`${slot.date}T${slot.start_time}`);
        const now = new Date();
        const hoursUntilSlot = (slotDateTime - now) / (1000 * 60 * 60);
        const deadline = settings?.cancellationDeadlineHours || 12;

        if (hoursUntilSlot < deadline) { alert(`開始${deadline}時間前を過ぎているため、システムからのキャンセルはできません。\nTeamsでご連絡ください。`); return; }
        if (!window.confirm('この予約をキャンセルしますか？')) return;

        try {
            await updateDoc(doc(db, 'reservations', reservation.id), { status: 'cancelled', cancelled_at: new Date().toISOString() });

            // Email Notification
            if (student.email) {
                try {
                    await fetch('/api/send-email', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            to: student.email,
                            subject: '【臨床実習】予約キャンセルのお知らせ',
                            body: `<p>${student.name} 様</p><p>以下の予約をキャンセルしました。</p><ul><li>日時: ${slot.date} ${slot.start_time.slice(0, 5)} - ${slot.end_time.slice(0, 5)}</li><li>実習: ${slot.training_type}</li></ul>`
                        })
                    });
                } catch (e) { console.error('Email failed', e); }
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

    const changeDate = (days) => {
        const newDate = new Date(selectedDate);
        newDate.setDate(newDate.getDate() + days);
        setSelectedDate(newDate);

        // Update currentMonth if needed to fetch new slots
        if (newDate.getMonth() !== currentMonth.getMonth() || newDate.getFullYear() !== currentMonth.getFullYear()) {
            setCurrentMonth(new Date(newDate.getFullYear(), newDate.getMonth(), 1));
        }
    };

    const goToToday = () => {
        const today = new Date();
        setSelectedDate(today);
        if (today.getMonth() !== currentMonth.getMonth() || today.getFullYear() !== currentMonth.getFullYear()) {
            setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
        }
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
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">実習予約</h1>
                    <p className="text-slate-500 mt-1">希望する日時を選択してください</p>
                </div>
                <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                    <button
                        onClick={() => setViewMode('month')}
                        className={clsx("px-4 py-2 rounded-lg text-sm font-bold transition-all", viewMode === 'month' ? "bg-slate-100 text-slate-900 shadow-sm" : "text-slate-500 hover:bg-slate-50")}
                    >
                        <LayoutGrid className="w-4 h-4 inline-block mr-2" />
                        月表示
                    </button>
                    <button
                        onClick={() => setViewMode('day')}
                        className={clsx("px-4 py-2 rounded-lg text-sm font-bold transition-all", viewMode === 'day' ? "bg-slate-100 text-slate-900 shadow-sm" : "text-slate-500 hover:bg-slate-50")}
                    >
                        <List className="w-4 h-4 inline-block mr-2" />
                        日表示
                    </button>
                </div>
            </div>

            {viewMode === 'month' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Month Calendar */}
                    <div className="lg:col-span-2 glass-panel p-6 rounded-2xl bg-white shadow-lg border-slate-100">
                        <div className="flex items-center justify-between mb-6">
                            <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))} className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600">
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <h2 className="text-xl font-bold text-slate-900">
                                {currentMonth.getFullYear()}年 {currentMonth.getMonth() + 1}月
                            </h2>
                            <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))} className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600">
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="grid grid-cols-7 gap-2 mb-2">
                            {['日', '月', '火', '水', '木', '金', '土'].map(day => (
                                <div key={day} className="text-center text-sm text-slate-500 py-2 font-medium">{day}</div>
                            ))}
                        </div>
                        <div className="grid grid-cols-7 gap-2">
                            {getDaysInMonth().map((date, index) => {
                                if (!date) return <div key={index} className="aspect-square"></div>;
                                const dateSlots = getSlotsForDate(date);
                                const hasSlots = dateSlots.length > 0;
                                const isSelected = selectedDate && date.toDateString() === selectedDate.toDateString();
                                const isPast = date < new Date().setHours(0, 0, 0, 0);
                                return (
                                    <button
                                        key={index}
                                        onClick={() => {
                                            if (!isPast && hasSlots) {
                                                setSelectedDate(date);
                                                // Optional: Switch to day view on click?
                                                // setViewMode('day'); 
                                            }
                                        }}
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
                                            <span className="text-[10px] text-blue-600 mt-1 font-bold">{dateSlots.length}枠</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    {/* Selected Day Slots (Sidebar in Month View) */}
                    <div className="glass-panel p-6 rounded-2xl h-fit bg-white shadow-lg border-slate-100">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-900">
                            <CalendarIcon className="w-5 h-5 text-primary" />
                            {selectedDate ? formatDate(selectedDate) : '日付を選択'}
                        </h3>
                        {!selectedDate ? (
                            <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-xl border border-slate-100 dashed"><p>カレンダーから日付を<br />選択してください</p></div>
                        ) : selectedDateSlots.length === 0 ? (
                            <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-xl border border-slate-100 dashed"><p>この日の実習枠はありません</p></div>
                        ) : (
                            <div className="space-y-4">
                                {selectedDateSlots.map(slot => (
                                    <SlotCard key={slot.id} slot={slot} availability={getAvailability(slot)} reserved={isAlreadyReserved(slot)} onReserve={() => handleReserve(slot)} onCancel={() => handleCancelReservation(slot)} reserving={reserving} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                // Day View
                <div className="glass-panel p-8 rounded-2xl bg-white shadow-lg border-slate-100">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <button onClick={() => changeDate(-1)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600 border border-slate-200">
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <div className="text-center">
                                <h2 className="text-2xl font-bold text-slate-900">{formatDate(selectedDate)}</h2>
                                <p className="text-sm text-slate-500 font-medium">{selectedDate.getFullYear()}年</p>
                            </div>
                            <button onClick={() => changeDate(1)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600 border border-slate-200">
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                        <button onClick={goToToday} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-bold transition-colors">
                            今日
                        </button>
                    </div>

                    <div className="space-y-4">
                        {selectedDateSlots.length === 0 ? (
                            <div className="text-center py-20 bg-slate-50 rounded-2xl border border-slate-100 dashed">
                                <CalendarIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                <p className="text-slate-500 font-medium">この日の実習枠はありません</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {selectedDateSlots.map(slot => (
                                    <SlotCard key={slot.id} slot={slot} availability={getAvailability(slot)} reserved={isAlreadyReserved(slot)} onReserve={() => handleReserve(slot)} onCancel={() => handleCancelReservation(slot)} reserving={reserving} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Time Selection Modal */}
            {showTimeModal && selectedSlot && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowTimeModal(false)}>
                    <div className="glass-panel p-6 rounded-2xl w-full max-w-md bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold text-slate-900">実習時間を選択</h3>
                            <button onClick={() => setShowTimeModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X className="w-6 h-6" /></button>
                        </div>
                        <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-sm">
                            <p className="font-medium mb-1">枠の時間範囲</p>
                            <p className="text-blue-600">{selectedSlot.start_time.slice(0, 5)} 〜 {selectedSlot.end_time.slice(0, 5)}</p>
                        </div>
                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">開始時間</label>
                                <input type="time" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:border-primary text-slate-900 transition-colors text-lg" value={customStartTime} onChange={(e) => setCustomStartTime(e.target.value)} min={selectedSlot.start_time.slice(0, 5)} max={selectedSlot.end_time.slice(0, 5)} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">終了時間</label>
                                <input type="time" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:border-primary text-slate-900 transition-colors text-lg" value={customEndTime} onChange={(e) => setCustomEndTime(e.target.value)} min={selectedSlot.start_time.slice(0, 5)} max={selectedSlot.end_time.slice(0, 5)} />
                            </div>
                        </div>
                        <div className="mb-6 p-3 rounded-lg bg-amber-50 border border-amber-100 text-amber-700 text-sm">
                            <p>最低 {Math.floor((settings?.minDailyMinutes || 120) / 60)}時間{(settings?.minDailyMinutes || 120) % 60 > 0 ? `${(settings?.minDailyMinutes || 120) % 60}分` : ''} 〜 最高 {Math.floor((settings?.maxDailyMinutes || 480) / 60)}時間{(settings?.maxDailyMinutes || 480) % 60 > 0 ? `${(settings?.maxDailyMinutes || 480) % 60}分` : ''}</p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setShowTimeModal(false)} className="flex-1 px-4 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors">キャンセル</button>
                            <button onClick={confirmReservation} disabled={reserving} className="flex-1 px-4 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 disabled:opacity-50">{reserving ? '処理中...' : '予約を確定'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const SlotCard = ({ slot, availability, reserved, onReserve, onCancel, reserving }) => {
    const getTrainingTypeColor = (type) => {
        const colors = {
            'I': 'bg-blue-100 text-blue-700 border-blue-200',
            'II': 'bg-emerald-100 text-emerald-700 border-emerald-200',
            'IV': 'bg-purple-100 text-purple-700 border-purple-200'
        };
        return colors[type] || 'bg-slate-100 text-slate-600 border-slate-200';
    };

    const getTrainingTypeLabel = (type) => {
        const labels = { 'I': '実習Ⅰ', 'II': '実習Ⅱ', 'IV': '実習Ⅳ' };
        return labels[type] || type;
    };

    return (
        <div className={clsx(
            "p-5 rounded-2xl border-2 shadow-sm hover:shadow-lg transition-all duration-300",
            reserved
                ? "bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-300"
                : "bg-white border-slate-200 hover:border-indigo-300"
        )}>
            {/* Header with time and training type */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className={clsx(
                        "p-2.5 rounded-xl",
                        reserved ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-600"
                    )}>
                        <Clock className="w-5 h-5" />
                    </div>
                    <div>
                        <span className="block text-xl font-bold text-slate-900 leading-none mb-1">
                            {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                        </span>
                        <span className={clsx(
                            "text-xs font-bold px-2 py-0.5 rounded-full border",
                            getTrainingTypeColor(slot.training_type)
                        )}>
                            {getTrainingTypeLabel(slot.training_type)}
                        </span>
                    </div>
                </div>
                <span className={clsx("text-xs font-bold px-3 py-1.5 rounded-full border", availability.color)}>
                    {availability.label}
                </span>
            </div>

            {/* Footer with remaining slots and action */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500">残り</span>
                    <span className={clsx(
                        "text-lg font-bold",
                        availability.remaining > 2 ? "text-emerald-600" : availability.remaining > 0 ? "text-amber-600" : "text-slate-400"
                    )}>
                        {availability.remaining}
                    </span>
                    <span className="text-sm text-slate-500">枠</span>
                </div>

                {reserved ? (
                    <button
                        onClick={onCancel}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 text-white text-sm font-bold shadow-md shadow-rose-500/20 hover:shadow-rose-500/40 transition-all hover:-translate-y-0.5"
                    >
                        キャンセル
                    </button>
                ) : availability.remaining > 0 ? (
                    <button
                        onClick={onReserve}
                        disabled={reserving}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-sm font-bold shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/40 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                    >
                        {reserving ? '処理中...' : '予約する'}
                    </button>
                ) : (
                    <button
                        disabled
                        className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-400 text-sm font-bold border border-slate-200 cursor-not-allowed"
                    >
                        満員
                    </button>
                )}
            </div>
        </div>
    );
};
