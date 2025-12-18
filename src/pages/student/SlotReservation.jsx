import { useState, useEffect, useRef } from 'react';
import { db, auth } from '../../lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, onSnapshot } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Info, Check, X, LayoutGrid, List, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

export default function SlotReservation() {
    const [slots, setSlots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [student, setStudent] = useState(null);
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [showTimeModal, setShowTimeModal] = useState(false);
    const [customStartTime, setCustomStartTime] = useState('');
    const [customEndTime, setCustomEndTime] = useState('');
    const [reserving, setReserving] = useState(false);
    const [reservationPriority, setReservationPriority] = useState(1);
    const [existingReservations, setExistingReservations] = useState([]);
    const [settings, setSettings] = useState(null);
    const dateScrollRef = useRef(null);

    useEffect(() => {
        const fetchStudentAndSettings = async () => {
            let foundStudentId = sessionStorage.getItem('clinical_student_id');

            // Fallback: Check Firebase Auth if no session ID
            if (!foundStudentId && auth.currentUser) {
                // Use auth_user_id to match the Shadow Auth user to the Student Doc
                const q = query(collection(db, 'students'), where('auth_user_id', '==', auth.currentUser.uid));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    foundStudentId = snap.docs[0].id;
                }
            }

            if (foundStudentId) {
                const studentDoc = await getDocs(query(collection(db, 'students'), where('__name__', '==', foundStudentId)));
                if (!studentDoc.empty) {
                    const sId = studentDoc.docs[0].id;
                    setStudent({ id: sId, ...studentDoc.docs[0].data() });

                    // Initial fetch of existing reservations
                    const resQuery = query(collection(db, 'reservations'), where('student_id', '==', sId), where('status', 'in', ['applied', 'confirmed']));
                    const resSnap = await getDocs(resQuery);
                    setExistingReservations(resSnap.docs.map(d => d.data()));
                }
            }

            // Settings Fetch
            const settingsRef = collection(db, 'settings');
            const qSettings = query(settingsRef, where('key', '==', 'training_config'));
            const settingsDoc = await getDocs(qSettings);
            if (!settingsDoc.empty) {
                setSettings(settingsDoc.docs[0].data().value);
            }
        };

        // If auth is not ready yet, we might miss it. So we should listen to auth state changes or retry.
        // For simplicity in this patch, we'll try immediately. 
        // A better approach is to wrap this in onAuthStateChanged if auth.currentUser is null initially.
        if (auth.currentUser) {
            fetchStudentAndSettings();
        } else {
            // Wait briefly or just rely on re-render if parent passes user. 
            // But actually, since this is a page route, App.jsx waits for auth before rendering this.
            // So auth.currentUser SHOULD be populated.
            fetchStudentAndSettings();
        }
    }, []);

    useEffect(() => {
        let unsubscribe;

        const loadSlots = async () => {
            setLoading(true);
            try {
                const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
                const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
                const startStr = startOfMonth.toISOString().split('T')[0];
                const endStr = endOfMonth.toISOString().split('T')[0];

                const q = query(collection(db, 'slots'), where('date', '>=', startStr), where('date', '<=', endStr));

                // Real-time listener for slots
                unsubscribe = onSnapshot(q, (snapshot) => {
                    const slotsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    setSlots(slotsData);
                    setLoading(false);
                }, (error) => {
                    console.error("Snapshot error:", error);
                    setLoading(false);
                });
            } catch (error) {
                console.error(error);
                setLoading(false);
            }
        };

        loadSlots();

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [currentMonth]);

    const getDaysInMonth = () => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const date = new Date(year, month, 1);
        const days = [];
        while (date.getMonth() === month) {
            days.push(new Date(date));
            date.setDate(date.getDate() + 1);
        }
        return days;
    };

    const getSlotsForDate = (date) => {
        if (!date) return [];
        // Local Date String construction manually to avoid UTC issues
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

        let availableSlots = slots.filter(slot => slot.date === dateStr);

        // Filter: 12-Hour Advance Rule & Past Date Prevention
        const now = new Date();
        // Today string in YYYY-MM-DD
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        // 1. Filter out past DATES immediately
        if (dateStr < todayStr) return [];

        // 2. If it is TODAY or FUTURE, check specific times against 12h rule
        // Rule: Can only book if slot start time is more than 12 hours from now
        const twelveHoursLater = new Date(now.getTime() + 12 * 60 * 60 * 1000);

        availableSlots = availableSlots.filter(slot => {
            // Construct Slot Date Object
            const slotStartDateTime = new Date(`${slot.date}T${slot.start_time}`);
            return slotStartDateTime > twelveHoursLater;
        });

        return availableSlots.sort((a, b) => a.start_time.localeCompare(b.start_time));
    };

    const isAlreadyReserved = (slot) => {
        if (!student || !slot.reservations) return false;
        return slot.reservations.some(r => r.student_id === student.id && r.status !== 'cancelled');
    };

    const parseMinutes = (timeStr) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    };

    const checkSimultaneousCapacity = (slot, newStartStr, newEndStr) => {
        const newStart = parseMinutes(newStartStr);
        const newEnd = parseMinutes(newEndStr);
        const limit = slot.capacity || 5; // Default to 5 if not set

        // Filter valid reservations for this slot (excluding cancelled)
        const activeReservations = (slot.reservations || []).filter(r => r.status !== 'cancelled');

        // We need to check if at any point in [newStart, newEnd), the count >= limit.
        // We'll calculate the usage at every "event point" (start or end of any reservation) that falls within our range.

        // 1. Get all relevant reservations (those that overlap with new interval)
        const overlaps = activeReservations.filter(r => {
            const rStart = parseMinutes(r.custom_start_time || r.slot_start_time);
            const rEnd = parseMinutes(r.custom_end_time || r.slot_end_time);
            return rStart < newEnd && rEnd > newStart;
        });

        // If no overlaps, we are fine
        if (overlaps.length === 0) return true;

        // 2. Create timeline points
        // We only care about points within our new interval [newStart, newEnd]
        const points = new Set([newStart]);
        overlaps.forEach(r => {
            const rStart = parseMinutes(r.custom_start_time || r.slot_start_time);
            const rEnd = parseMinutes(r.custom_end_time || r.slot_end_time);
            if (rStart > newStart && rStart < newEnd) points.add(rStart);
            if (rEnd > newStart && rEnd < newEnd) points.add(rEnd);
        });

        const sortedPoints = Array.from(points).sort((a, b) => a - b);

        // 3. Check each segment
        for (let i = 0; i < sortedPoints.length; i++) {
            const time = sortedPoints[i];
            // Check concurrency at this specific time (inclusive of start, exclusive of end)
            // A reservation is active if start <= time < end
            const concurrency = overlaps.filter(r => {
                const rStart = parseMinutes(r.custom_start_time || r.slot_start_time);
                const rEnd = parseMinutes(r.custom_end_time || r.slot_end_time);
                return rStart <= time && rEnd > time;
            }).length;

            if (concurrency >= limit) {
                return false; // Limit reached at this time
            }
        }

        return true;
    };

    const getAvailability = (slot) => {
        // Visual indicator only - simplistic check.
        // We do NOT block based on this anymore, as requested.
        const reservedCount = (slot.reservations || []).filter(r => r.status !== 'cancelled').length;
        const remaining = slot.capacity - reservedCount;

        // Even if mathematically negative (more people total), we show "Available" or "Few Left" 
        // because they might be non-overlapping.
        // Changing logic: Unless remaining is VERY negative, we show available.
        // Actually, let's just show "空きあり" (Available) effectively always, 
        // or a different label like "受付中" (Accepting).
        // To be safe and avoid confusing "Full" message:

        return { label: '受付中', color: 'bg-emerald-100 text-emerald-600 border-emerald-200', remaining: 99 };
    };

    const handleReserve = (slot) => {
        setSelectedSlot(slot);

        // Default to first valid start time
        const validStarts = getValidStartTimes(slot);
        const initialStart = validStarts.length > 0 ? validStarts[0] : slot.start_time;
        setCustomStartTime(initialStart);

        // Default to first valid end time for that start
        const validEnds = getValidEndTimes(initialStart, slot.end_time);
        const initialEnd = validEnds.length > 0 ? validEnds[0] : slot.end_time;
        setCustomEndTime(initialEnd);

        // Reset Priority default
        setReservationPriority(1);

        setShowTimeModal(true);
    };

    const isPriorityTaken = (priority) => {
        if (!settings?.lotteryMode) return false;
        // Check if student already has an active reservation with this priority
        return existingReservations.some(r => r.priority === priority && r.status !== 'cancelled');
    };

    const confirmReservation = async () => {
        if (!student || !selectedSlot) return;
        setReserving(true);

        try {
            // Determine reservation status based on Lottery Mode
            const isLottery = settings?.lotteryMode;
            const newStatus = isLottery ? 'applied' : 'confirmed';

            // Strict Simultaneous Capacity Check (Skip if Lottery Mode)
            if (!isLottery && !checkSimultaneousCapacity(selectedSlot, customStartTime, customEndTime)) {
                alert('指定された時間は定員(5名)に達しているため予約できません。\n時間をずらして再度お試しください。');
                setReserving(false);
                return;
            }

            // Lottery Priority Check
            if (isLottery) {
                if (isPriorityTaken(reservationPriority)) {
                    alert(`第${reservationPriority}希望は既に申し込まれています。`);
                    setReserving(false);
                    return;
                }
            }

            const reservationData = {
                student_id: student.id,
                slot_id: selectedSlot.id,
                status: newStatus,
                created_at: new Date().toISOString(),
                slot_date: selectedSlot.date,
                slot_start_time: selectedSlot.start_time,
                slot_end_time: selectedSlot.end_time,
                slot_training_type: selectedSlot.training_type,
                custom_start_time: customStartTime,
                custom_end_time: customEndTime,
                priority: isLottery ? reservationPriority : null,
                custom_duration_minutes: 0 // Calc logic here
            };

            // Add Doc & Sync Logic (Same as before)
            await addDoc(collection(db, 'reservations'), reservationData);

            // GAS Sync & Email
            // GAS Sync & Email
            // GAS Sync & Email
            try {
                const GAS_WEBHOOK_URL = import.meta.env.VITE_GAS_EMAIL_WEBHOOK_URL;
                if (GAS_WEBHOOK_URL && student.email) {
                    const GAS_URL = 'https://script.google.com/macros/s/AKfycbyC0qE-V93aOFD366Mh2U5-S96yZ0_rR3R25-8f6l4_YkO9k5P8_i9n/exec';

                    if (!isLottery) {
                        // Formatting for Single Reservation (Standard Mode)
                        await fetch(GAS_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'text/plain' },
                            mode: 'no-cors',
                            body: JSON.stringify({
                                to: student.email,
                                subject: '【臨床実習】実習予約のお知らせ',
                                body: `
<!DOCTYPE html>
<html>
<head><meta name="color-scheme" content="light dark"><style>/* ... styles ... */</style></head>
<body>
  <div class="container" style="max-width:600px;margin:20px auto;padding:20px;font-family:sans-serif;">
    <div style="background-color:#4f46e5;padding:24px;text-align:center;color:white;border-radius:16px 16px 0 0;">
       <h1>実習予約完了</h1>
    </div>
    <div style="background-color:#fff;padding:32px;border:1px solid #e2e8f0;border-radius:0 0 16px 16px;">
       <h2>${student.name} 様</h2>
       <p>以下の内容で実習予約を受け付けました。</p>
       <div style="background:#f8fafc;padding:20px;border-radius:12px;margin:24px 0;">
          <p><strong>日付:</strong> ${formatDate(selectedSlot.date).full}</p>
          <p><strong>時間:</strong> ${customStartTime} - ${customEndTime}</p>
          <p><strong>区分:</strong> 臨床実習 ${selectedSlot.training_type}</p>
       </div>
       <p style="font-size:12px;color:#64748b;text-align:center;">NSSU Clinical Training System</p>
    </div>
  </div>
</body>
</html>`
                            })
                        });
                    } else {
                        // Lottery Mode: Check if we have 3 applications
                        const myAppsQ = query(
                            collection(db, 'reservations'),
                            where('student_id', '==', student.id),
                            where('status', '==', 'applied')
                        );
                        const myAppsSnap = await getDocs(myAppsQ);

                        // If the user has exactly 3 applications (1st, 2nd, 3rd), send the consolidated email
                        if (myAppsSnap.size >= 3) {
                            const apps = myAppsSnap.docs.map(d => d.data()).sort((a, b) => a.priority - b.priority);

                            const appsListHtml = apps.map(app => `
                        <div style="background:#fff;padding:15px;margin-bottom:10px;border-radius:8px;border:1px solid #e2e8f0;">
                            <div style="font-weight:bold;color:#f59e0b;margin-bottom:5px;">第${app.priority}希望</div>
                            <div>${app.slot_date} ${app.slot_start_time} - ${app.slot_end_time}</div>
                            <div style="font-size:12px;color:#64748b;">(実習${app.training_type || '?'})</div>
                        </div>
                    `).join('');

                            await fetch(GAS_URL, {
                                method: 'POST',
                                headers: { 'Content-Type': 'text/plain' },
                                mode: 'no-cors',
                                body: JSON.stringify({
                                    to: student.email,
                                    subject: '【臨床実習】抽選申込受付完了（第1〜第3希望）',
                                    body: `
<!DOCTYPE html>
<html>
<body>
  <div style="max-width:600px;margin:20px auto;font-family:sans-serif;background:#f8fafc;padding:20px;">
    <div style="background:#f59e0b;padding:24px;text-align:center;color:white;border-radius:12px 12px 0 0;">
       <h1>抽選申込 受付完了</h1>
    </div>
    <div style="background:white;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;">
       <h2>${student.name} 様</h2>
       <p>第1〜第3希望までの抽選申込を受け付けました。<br><strong>※まだ確定ではありません。後日結果をご連絡します。</strong></p>
       
       <div style="background:#f1f5f9;padding:20px;border-radius:12px;margin:20px 0;">
          ${appsListHtml}
       </div>
       
       <p style="font-size:12px;color:#64748b;text-align:center;">変更・キャンセルはマイページから行えます。</p>
    </div>
  </div>
</body>
</html>`
                                })
                            });
                        }
                    }
                }
            } catch (e) {
                console.error('Email failed', e);
                // Do not block UI success even if email fails
            }

            // Success UI
            alert(isLottery ? `第${reservationPriority}希望として抽選に申し込みました。\n結果をお待ちください。` : '予約が完了しました');
            setShowTimeModal(false);
            setSelectedSlot(null);

            // Reload existing reservations for next check
            if (student) {
                const resQuery = query(collection(db, 'reservations'), where('student_id', '==', student.id), where('status', 'in', ['applied', 'confirmed']));
                const resSnap = await getDocs(resQuery);
                setExistingReservations(resSnap.docs.map(d => d.data()));
            }

        } catch (error) {
            console.error(error);
            alert('エラーが発生しました');
        } finally {
            setReserving(false);
        }
    };

    const formatDate = (dateInput) => {
        if (!dateInput) return { day: '', weekday: '', full: '' };

        const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        return {
            day: date.getDate(),
            weekday: days[date.getDay()],
            full: `${date.getMonth() + 1}月${date.getDate()}日`
        };
    };

    const selectedDateSlots = getSlotsForDate(selectedDate);

    return (
        <div className="pb-24">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-slate-900">実習予約</h1>
                <p className="text-slate-500 text-sm">希望の日時を選択してください</p>
            </div>

            {/* Horizontal Calendar Strip */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 mb-6 sticky top-20 z-30">
                <div className="flex items-center justify-between mb-4 px-2">
                    <h2 className="font-bold text-lg text-slate-900">
                        {currentMonth.getFullYear()}年 {currentMonth.getMonth() + 1}月
                    </h2>
                    <div className="flex gap-2">
                        <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"><ChevronLeft className="w-5 h-5" /></button>
                        <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"><ChevronRight className="w-5 h-5" /></button>
                    </div>
                </div>

                <div
                    ref={dateScrollRef}
                    className="flex gap-3 overflow-x-auto pb-2 snap-x hide-scrollbar"
                >
                    {getDaysInMonth().map((date, i) => {
                        const isSelected = date.toDateString() === selectedDate.toDateString();
                        const dateInfo = formatDate(date);
                        const hasSlots = getSlotsForDate(date).length > 0;
                        const isToday = date.toDateString() === new Date().toDateString();

                        return (
                            <button
                                key={i}
                                data-selected={isSelected}
                                onClick={() => setSelectedDate(date)}
                                className={clsx(
                                    "flex-shrink-0 w-14 h-20 rounded-2xl flex flex-col items-center justify-center transition-all snap-center",
                                    isSelected
                                        ? "bg-slate-900 text-white shadow-lg shadow-slate-900/30 scale-105"
                                        : "bg-slate-50 text-slate-400 hover:bg-slate-100",
                                    isToday && !isSelected && "border-2 border-indigo-500/30"
                                )}
                            >
                                <span className="text-xs font-medium mb-1">{dateInfo.weekday}</span>
                                <span className="text-xl font-bold">{dateInfo.day}</span>
                                {hasSlots && (
                                    <div className={`w-1.5 h-1.5 rounded-full mt-1 ${isSelected ? 'bg-indigo-400' : 'bg-indigo-500'}`} />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Slots List */}
            <div className="space-y-4">
                <h3 className="font-bold text-slate-900 px-2 flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5 text-indigo-500" />
                    {formatDate(selectedDate).full} の空き状況
                </h3>

                <AnimatePresence mode="wait">
                    {loading ? (
                        <div className="py-12 flex justify-center"><div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" /></div>
                    ) : selectedDateSlots.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-center py-16 bg-slate-50 rounded-3xl border border-slate-100 border-dashed mx-2"
                        >
                            <p className="text-slate-400 font-medium">この日の実習枠はありません</p>
                        </motion.div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {selectedDateSlots.map((slot, i) => {
                                const availability = getAvailability(slot);
                                const reserved = isAlreadyReserved(slot);

                                return (
                                    <motion.div
                                        key={slot.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        className={clsx(
                                            "relative overflow-hidden p-6 rounded-3xl border-2 transition-all active:scale-[0.98]",
                                            reserved
                                                ? "bg-indigo-50 border-indigo-200"
                                                : "bg-white border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-100"
                                        )}
                                    >
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className={clsx(
                                                        "px-2.5 py-1 rounded-lg text-xs font-bold",
                                                        slot.training_type === 'I' ? "bg-blue-100 text-blue-700" :
                                                            slot.training_type === 'II' ? "bg-emerald-100 text-emerald-700" :
                                                                "bg-purple-100 text-purple-700"
                                                    )}>
                                                        実習{slot.training_type}
                                                    </span>
                                                    <span className={clsx("px-2.5 py-1 rounded-lg text-xs font-bold", availability.color)}>
                                                        {availability.label}
                                                    </span>
                                                </div>
                                                <div className="text-2xl font-bold text-slate-900">
                                                    {slot.start_time.slice(0, 5)} <span className="text-slate-300 text-lg">-</span> {slot.end_time.slice(0, 5)}
                                                </div>
                                            </div>
                                            {reserved && (
                                                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                                                    <Check className="w-6 h-6 text-indigo-600" />
                                                </div>
                                            )}
                                        </div>

                                        {reserved ? (
                                            <button
                                                className="w-full py-3 rounded-xl bg-white border border-indigo-200 text-indigo-600 font-bold text-sm hover:bg-indigo-50 transition-colors"
                                                onClick={() => alert('キャンセルは詳細画面から行ってください')} // Simplified for redesign demo
                                            >
                                                予約済み
                                            </button>
                                        ) : availability.remaining > 0 ? (
                                            <button
                                                onClick={() => handleReserve(slot)}
                                                className={clsx(
                                                    "w-full py-3 rounded-xl font-bold text-sm transition-colors shadow-lg",
                                                    settings?.lotteryMode
                                                        ? "bg-amber-500 text-white hover:bg-amber-600 shadow-amber-500/20"
                                                        : "bg-slate-900 text-white hover:bg-slate-800 shadow-slate-900/20"
                                                )}
                                            >
                                                {settings?.lotteryMode ? '抽選に申し込む' : '予約する'}
                                            </button>
                                        ) : (
                                            <button disabled className="w-full py-3 rounded-xl bg-slate-100 text-slate-400 font-bold text-sm cursor-not-allowed">
                                                満員
                                            </button>
                                        )}
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </AnimatePresence>
            </div>

            {/* Time Selection Modal (Bottom Sheet style) */}
            <AnimatePresence>
                {showTimeModal && selectedSlot && (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-none">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
                            onClick={() => setShowTimeModal(false)}
                        />
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 pb-32 sm:pb-6 shadow-2xl pointer-events-auto"
                        >
                            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 sm:hidden" />

                            <h3 className="text-xl font-bold text-slate-900 mb-6">{settings?.lotteryMode ? '抽選申込（希望順位選択）' : '時間の調整'}</h3>

                            <div className="space-y-4 mb-8">
                                {settings?.lotteryMode && (
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">希望順位</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {[1, 2, 3].map(p => {
                                                const taken = isPriorityTaken(p);
                                                return (
                                                    <button
                                                        key={p}
                                                        onClick={() => !taken && setReservationPriority(p)}
                                                        disabled={taken}
                                                        className={clsx(
                                                            "py-3 rounded-xl border-2 font-bold transition-all",
                                                            taken ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed" :
                                                                reservationPriority === p
                                                                    ? "bg-amber-50 border-amber-500 text-amber-700"
                                                                    : "bg-white border-slate-200 text-slate-600 hover:border-amber-300"
                                                        )}
                                                    >
                                                        第{p}希望
                                                        {taken && <span className="block text-[10px] font-normal">申込済</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">開始時間</label>
                                    <select
                                        value={customStartTime}
                                        onChange={(e) => {
                                            const newStart = e.target.value;
                                            setCustomStartTime(newStart);
                                            // Auto-adjust end time if needed (reset to min duration)
                                            // Ideally we find the closest valid end time or min duration
                                            const validEnds = getValidEndTimes(newStart, selectedSlot.end_time);
                                            if (validEnds.length > 0) {
                                                setCustomEndTime(validEnds[0]);
                                            } else {
                                                setCustomEndTime('');
                                            }
                                        }}
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-lg font-bold text-slate-900 focus:border-indigo-500 focus:outline-none transition-colors appearance-none"
                                    >
                                        {getValidStartTimes(selectedSlot).map(t => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">終了時間 (2時間以上)</label>
                                    <select
                                        value={customEndTime}
                                        onChange={(e) => setCustomEndTime(e.target.value)}
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-lg font-bold text-slate-900 focus:border-indigo-500 focus:outline-none transition-colors appearance-none"
                                        disabled={!customStartTime}
                                    >
                                        {getValidEndTimes(customStartTime, selectedSlot.end_time).map(t => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowTimeModal(false)}
                                    className="flex-1 py-3.5 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors"
                                >
                                    キャンセル
                                </button>
                                <button
                                    onClick={confirmReservation}
                                    disabled={reserving || !customStartTime || !customEndTime}
                                    className="flex-1 py-3.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/30 disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    {reserving ? '処理中...' : (settings?.lotteryMode ? '申し込む' : '確定する')}
                                </button>
                            </div>
                            {settings?.lotteryMode && (
                                <p className="text-center text-xs text-slate-400 mt-4">
                                    ※第1〜第3希望まで、最大3枠申し込むことができます。
                                </p>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

// Helper Functions for Time Logic
const ALLOWED_START_TIMES = ['08:30', '11:00', '13:20', '15:00', '16:40', '18:20'];

const parseMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
};

const formatMinutes = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const getValidStartTimes = (slot) => {
    if (!slot) return [];
    const slotStart = parseMinutes(slot.start_time);
    const slotEnd = parseMinutes(slot.end_time);

    // Filter allowed times that fall within the slot (start needs to be strictly before end - min duration)
    // Actually, start needs to be early enough that start + 120 <= slotEnd
    return ALLOWED_START_TIMES.filter(t => {
        const tMin = parseMinutes(t);
        return tMin >= slotStart && (tMin + 120) <= slotEnd;
    });
};

const getValidEndTimes = (startTime, slotEndTime) => {
    if (!startTime || !slotEndTime) return [];

    const startMin = parseMinutes(startTime);
    const slotEndMin = parseMinutes(slotEndTime);
    const validTimes = [];

    // Start at +120 minutes (2 hours)
    let current = startMin + 120;

    // Round up to nearest 10 if not already (though +120 to 08:30 is 10:30 which is valid)
    // 08:30 -> 8*60+30 = 510. +120 = 630 (10:30). 630%10 == 0. OK.

    while (current <= slotEndMin) {
        validTimes.push(formatMinutes(current));
        current += 10;
    }

    return validTimes;
};
