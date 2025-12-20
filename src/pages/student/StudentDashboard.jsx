import { useState, useEffect } from 'react';
import { db, auth } from '../../lib/firebase';
import { collection, query, where, getDocs, orderBy, updateDoc, doc } from 'firebase/firestore';
import { Clock, Calendar, CheckCircle2, ChevronRight, Trophy, Activity, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function StudentDashboard() {
    const [student, setStudent] = useState(null);
    const [reservations, setReservations] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            let foundStudentId = sessionStorage.getItem('clinical_student_id');

            // Fallback: Check Firebase Auth if no session ID
            if (!foundStudentId && auth.currentUser) {
                const q = query(collection(db, 'students'), where('auth_user_id', '==', auth.currentUser.uid));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    foundStudentId = snap.docs[0].id;
                    // Restore session for consistency
                    sessionStorage.setItem('clinical_student_id', foundStudentId);
                }
            }

            if (!foundStudentId) return;

            try {
                // Fetch Student
                const studentsRef = collection(db, 'students');
                const qStudent = query(studentsRef, where('__name__', '==', foundStudentId));
                const studentSnap = await getDocs(qStudent);

                if (!studentSnap.empty) {
                    setStudent({ id: studentSnap.docs[0].id, ...studentSnap.docs[0].data() });
                }

                // Fetch Reservations
                const reservationsRef = collection(db, 'reservations');
                const qReservations = query(
                    reservationsRef,
                    where('student_id', '==', foundStudentId)
                );
                const reservationsSnap = await getDocs(qReservations);
                let reservationsData = reservationsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                // 1. Filter: Remove "Lost" Lottery Applications (Applied but date passed)
                //    Also consider if we should hide Cancelled? User didn't ask to hide cancelled, only lost lottery.
                const todayStr = new Date().toISOString().split('T')[0];
                reservationsData = reservationsData.filter(r => {
                    const isLostLottery = r.status === 'applied' && r.slot_date < todayStr;
                    return !isLostLottery;
                });

                // 2. Sort: By Created At (Newest First) as requested
                //    Fallback to slot_date if created_at is missing
                reservationsData.sort((a, b) => {
                    const dateA = a.created_at || a.slot_date || '';
                    const dateB = b.created_at || b.slot_date || '';
                    return dateB.localeCompare(dateA);
                });

                setReservations(reservationsData);

            } catch (error) {
                console.error("Error fetching data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="relative w-16 h-16">
                    <div className="absolute inset-0 border-4 border-slate-200 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin"></div>
                </div>
            </div>
        );
    }

    // Calculations
    const completedReservations = reservations.filter(r => r.status === 'completed');
    // Approved Time (Completed only) - Used for Achievement Rate
    const totalMinutes = completedReservations.reduce((sum, r) => sum + (r.actual_minutes || 0), 0);
    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;

    // Reserved Time (Confirmed + Completed) - Scheduled time
    // Note: detailed calculation might need to parse time strings if custom_duration_minutes is 0
    // For now assuming custom_duration_minutes is populated or rough est from slots
    const calcDuration = (r) => {
        if (r.actual_minutes) return r.actual_minutes;
        // Parse start/end
        const start = r.custom_start_time || r.slot_start_time;
        const end = r.custom_end_time || r.slot_end_time;
        if (!start || !end) return 0;
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        return (eh * 60 + em) - (sh * 60 + sm);
    };

    // Total Reserved (Approved + Pending execution/approval)
    // The user asked for "Reserved Time" and "Approved Time" separately.
    // "Reserved" usually means everything booked.
    const allActiveReservations = reservations.filter(r => r.status !== 'cancelled');
    const totalReservedMinutes = allActiveReservations.reduce((sum, r) => sum + calcDuration(r), 0);
    const reservedHours = Math.floor(totalReservedMinutes / 60);
    const reservedRemMinutes = totalReservedMinutes % 60;

    // Target (Mandatory) Time Logic
    const TARGET_HOURS = 21;
    const progressPercentage = Math.min(100, (totalMinutes / (TARGET_HOURS * 60)) * 100);

    // Upcoming Reservation
    const now = new Date();
    const upcomingReservations = reservations.filter(r =>
        (r.status === 'confirmed' || r.status === 'applied') &&
        new Date(`${r.slot_date}T${r.slot_start_time || '00:00'}`) > now
    );
    const nextReservation = upcomingReservations.length > 0 ? upcomingReservations[upcomingReservations.length - 1] : null;

    const getStatusLabel = (res) => {
        if (res.status === 'completed') return { label: '承認済', color: 'bg-emerald-50 text-emerald-600' };
        if (res.status === 'confirmed') {
            // Check if it is in the past
            const now = new Date();
            const slotDateTime = new Date(`${res.slot_date}T${res.slot_start_time || res.custom_start_time}`);

            if (slotDateTime < now) {
                return { label: '承認待ち', color: 'bg-amber-50 text-amber-600' };
            }
            return { label: '予約済', color: 'bg-indigo-50 text-indigo-600' };
        }
        if (res.status === 'applied') {
            return { label: '抽選待ち', color: 'bg-orange-50 text-orange-600' };
        }
        return { label: res.status, color: 'bg-slate-100 text-slate-500' };
    };

    const handleCancel = async (reservation) => {
        // 24-hour restriction check
        const now = new Date();
        const slotDateTime = new Date(`${reservation.slot_date}T${reservation.custom_start_time || reservation.slot_start_time}`);
        const diffHours = (slotDateTime - now) / (1000 * 60 * 60);

        if (diffHours < 24) {
            alert('予約日時の24時間前を過ぎているためキャンセルできません。\n欠席する場合は教員に直接連絡してください。');
            return;
        }

        if (!confirm('予約をキャンセルしてもよろしいですか？')) return;

        try {
            await updateDoc(doc(db, 'reservations', reservation.id), {
                status: 'cancelled',
                cancelled_at: new Date().toISOString(),
                cancelled_by: 'student'
            });

            // Remove from local state
            setReservations(prev => prev.filter(r => r.id !== reservation.id));

            // Email Notification
            try {
                const GAS_WEBHOOK_URL = import.meta.env.VITE_GAS_EMAIL_WEBHOOK_URL;
                if (GAS_WEBHOOK_URL && student?.email) {
                    // Simple date formatter for email
                    const dateObj = new Date(reservation.slot_date);
                    const dateStr = `${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;

                    await fetch(GAS_WEBHOOK_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain' },
                        mode: 'no-cors',
                        body: JSON.stringify({
                            to: student.email,
                            subject: '【臨床実習】予約キャンセル完了のお知らせ',
                            body: `
<!DOCTYPE html>
<html>
<head>
<meta name="color-scheme" content="light dark">
<style>
  body { font-family: sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; }
  .container { max-width: 600px; margin: 20px auto; padding: 20px; }
  .card { background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 20px; }
  .header { border-bottom: 2px solid #ef4444; padding-bottom: 10px; margin-bottom: 20px; }
  .header h1 { color: #ef4444; margin: 0; font-size: 18px; }
  .info-box { background-color: #fef2f2; border-radius: 8px; padding: 15px; margin: 15px 0; border: 1px solid #fee2e2; }
  .label { font-size: 12px; color: #991b1b; font-weight: bold; }
  .value { font-size: 14px; color: #7f1d1d; margin-top: 4px; }
</style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <h1>予約キャンセル完了</h1>
      </div>
      <div>
        <p>${student.name} 様</p>
        <p>以下の予約をキャンセルしました。</p>
        <div class="info-box">
          <div style="margin-bottom: 10px;">
            <div class="label">日時</div>
            <div class="value">${reservation.slot_date} (${dateStr}) <br> ${reservation.custom_start_time || reservation.slot_start_time} - ${reservation.custom_end_time || reservation.slot_end_time}</div>
          </div>
          <div>
            <div class="label">実習区分</div>
            <div class="value">臨床実習 ${reservation.slot_training_type}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`
                        })
                    });
                }
            } catch (e) {
                console.error('Email failed', e);
            }

            alert('予約をキャンセルしました');
        } catch (error) {
            console.error("Cancel error:", error);
            alert('エラーが発生しました');
        }
    };


    return (
        <div className="space-y-6 pb-24">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between"
            >
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">{student?.name}</h1>
                    <p className="text-slate-500 text-xs font-medium">実習管理ダッシュボード</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                    <span className="font-bold text-slate-600">{student?.grade}</span>
                </div>
            </motion.div>

            {/* Hero Progress Card */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
                className="relative overflow-hidden rounded-3xl bg-secondary text-white p-6 shadow-xl shadow-primary/20"
            >
                <div className="absolute top-0 right-0 w-48 h-48 bg-primary/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-accent/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>

                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <div className="flex items-center gap-2 text-indigo-200 mb-1 font-medium text-sm">
                                <Trophy className="w-4 h-4 text-accent" />
                                <span className="text-accent/80">承認済み時間 (達成率)</span>
                            </div>
                            <div className="text-4xl font-bold tracking-tight">
                                {totalHours}<span className="text-xl text-indigo-200 font-medium ml-1">h</span> {remainingMinutes}<span className="text-xl text-indigo-200 font-medium ml-1">m</span>
                            </div>
                        </div>
                        {/* Circular Progress */}
                        <div className="relative w-20 h-20 flex-shrink-0">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
                                <motion.circle
                                    cx="50" cy="50" r="45"
                                    fill="none"
                                    stroke="url(#gradient)"
                                    strokeWidth="8"
                                    strokeLinecap="round"
                                    strokeDasharray="283"
                                    initial={{ strokeDashoffset: 283 }}
                                    animate={{ strokeDashoffset: 283 - (283 * progressPercentage) / 100 }}
                                    transition={{ duration: 1.5, ease: "easeOut" }}
                                />
                                <defs>
                                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" stopColor="#3b82f6" />
                                        <stop offset="100%" stopColor="#06b6d4" />
                                    </linearGradient>
                                </defs>
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center font-bold text-sm">
                                {Math.round(progressPercentage)}%
                            </div>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                        <div>
                            <div className="text-xs text-indigo-300 mb-1">予約済み (合計)</div>
                            <div className="text-xl font-bold">
                                {reservedHours}<span className="text-sm font-normal ml-0.5">h</span> {reservedRemMinutes}<span className="text-sm font-normal ml-0.5">m</span>
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-indigo-300 mb-1">目標時間</div>
                            <div className="text-xl font-bold">
                                {TARGET_HOURS}<span className="text-sm font-normal ml-0.5">h</span>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Dashboard Content Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Recent History (Moved up for Mobile) */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="order-2 md:order-2"
                >
                    <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        最近の活動
                    </h2>
                    <div className="space-y-3">
                        {reservations.length === 0 ? (
                            <p className="text-slate-400 text-sm p-4 bg-slate-50 rounded-xl text-center border border-slate-100 border-dashed">履歴はありません</p>
                        ) : (
                            reservations.slice(0, 5).map((res, i) => {
                                const status = getStatusLabel(res);
                                return (
                                    <motion.div
                                        key={res.id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.4 + (i * 0.1) }}
                                        className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${status.label === '承認済' ? 'bg-emerald-100 text-emerald-600' :
                                                status.label === '承認待ち' ? 'bg-amber-100 text-amber-600' :
                                                    'bg-indigo-100 text-indigo-600'
                                                }`}>
                                                {status.label === '承認済' ? <CheckCircle2 className="w-5 h-5" /> :
                                                    status.label === '承認待ち' ? <Clock className="w-5 h-5" /> :
                                                        <Calendar className="w-5 h-5" />}
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-900 text-sm">{res.slot_date}</div>
                                                <div className="text-xs text-slate-500 font-medium">
                                                    {res.slot_training_type} • {res.custom_start_time.slice(0, 5)}-{res.custom_end_time.slice(0, 5)}
                                                </div>
                                                {res.status === 'completed' && (res.check_in_time || res.check_out_time) && (
                                                    <div className="text-[10px] text-emerald-600 font-mono mt-0.5">
                                                        実績: {res.check_in_time?.slice(0, 5) || '--:--'} - {res.check_out_time?.slice(0, 5) || '--:--'}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold ${status.color}`}>
                                            {status.label}
                                        </span>
                                        {res.priority && (
                                            <span className="ml-2 inline-block px-1.5 py-1 rounded border border-orange-200 bg-orange-50 text-orange-700 text-[10px] font-bold">
                                                第{res.priority}希望
                                            </span>
                                        )}
                                    </motion.div>
                                );
                            })
                        )}
                    </div>
                </motion.div>

                {/* Next Reservation */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="order-1 md:order-1"
                >
                    <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-primary" />
                        次回の予約
                    </h2>
                    {nextReservation ? (
                        <div className="group relative bg-white rounded-2xl p-6 shadow-lg shadow-slate-200/50 border border-slate-100 overflow-hidden hover:shadow-xl transition-shadow">
                            <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-primary to-accent"></div>
                            <div className="flex justify-between items-start">
                                <div>
                                    <span className="inline-block px-3 py-1 rounded-full bg-blue-50 text-primary text-xs font-bold mb-3">
                                        臨床実習 {nextReservation.slot_training_type}
                                    </span>
                                    <div className="text-2xl font-bold text-slate-900 mb-1">
                                        {nextReservation.slot_date}
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-500 font-medium">
                                        <Clock className="w-4 h-4" />
                                        {nextReservation.custom_start_time.slice(0, 5)} - {nextReservation.custom_end_time.slice(0, 5)}
                                    </div>
                                    {nextReservation.priority && nextReservation.status === 'applied' && (
                                        <div className="mt-2 inline-block px-2 py-0.5 rounded border border-orange-200 bg-orange-50 text-orange-700 text-xs font-bold">
                                            第{nextReservation.priority}希望で申込中
                                        </div>
                                    )}
                                </div>
                                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center">
                                    <Activity className="w-6 h-6 text-slate-400 group-hover:text-primary transition-colors" />
                                </div>
                            </div>


                            <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
                                <button
                                    onClick={() => handleCancel(nextReservation)}
                                    className="text-xs font-bold text-slate-400 hover:text-rose-500 transition-colors"
                                >
                                    予約をキャンセル
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-slate-50 rounded-2xl p-6 text-center border border-slate-100 border-dashed">
                            <p className="text-slate-400 font-medium text-sm">次回の予約はありません</p>
                            <a href="/student/reservation" className="inline-block mt-4 px-6 py-2 bg-white text-primary font-bold rounded-full shadow-sm hover:shadow-md transition-all text-sm">
                                予約を入れる
                            </a>
                        </div>
                    )}
                </motion.div>
            </div >
        </div >
    );
}
