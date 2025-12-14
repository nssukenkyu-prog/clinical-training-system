import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { Clock, Calendar, CheckCircle2, ChevronRight, Trophy, Activity, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function StudentDashboard() {
    const [student, setStudent] = useState(null);
    const [reservations, setReservations] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            const studentId = sessionStorage.getItem('clinical_student_id');
            if (!studentId) return;

            try {
                // Fetch Student
                const studentsRef = collection(db, 'students');
                const qStudent = query(studentsRef, where('__name__', '==', studentId));
                const studentSnap = await getDocs(qStudent);

                if (!studentSnap.empty) {
                    setStudent({ id: studentSnap.docs[0].id, ...studentSnap.docs[0].data() });
                }

                // Fetch Reservations
                const reservationsRef = collection(db, 'reservations');
                const qReservations = query(
                    reservationsRef,
                    where('student_id', '==', studentId),
                    orderBy('slot_date', 'desc'),
                    orderBy('slot_start_time', 'asc')
                );
                const reservationsSnap = await getDocs(qReservations);
                const reservationsData = reservationsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
    const TARGET_HOURS = 80;
    const progressPercentage = Math.min(100, (totalMinutes / (TARGET_HOURS * 60)) * 100);

    // Upcoming Reservation
    const now = new Date();
    const upcomingReservations = reservations.filter(r => r.status === 'confirmed' && new Date(`${r.slot_date}T${r.slot_start_time || '00:00'}`) > now);
    const nextReservation = upcomingReservations.length > 0 ? upcomingReservations[upcomingReservations.length - 1] : null;

    const getStatusLabel = (res) => {
        if (res.status === 'completed') return { label: '承認済', color: 'bg-emerald-50 text-emerald-600' };
        if (res.status === 'confirmed') {
            const endDateTime = new Date(`${res.slot_date}T${res.custom_end_time || res.slot_end_time}`);
            if (endDateTime < now) {
                return { label: '承認待ち', color: 'bg-amber-50 text-amber-600' };
            }
            return { label: '予約中', color: 'bg-indigo-50 text-indigo-600' };
        }
        return { label: res.status, color: 'bg-slate-100 text-slate-500' };
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
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${status.label === '承認済' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                                                {status.label === '承認済' ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-900 text-sm">{res.slot_date}</div>
                                                <div className="text-xs text-slate-500 font-medium">
                                                    {res.slot_training_type} • {res.custom_start_time.slice(0, 5)}-{res.custom_end_time.slice(0, 5)}
                                                </div>
                                            </div>
                                        </div>
                                        <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold ${status.color}`}>
                                            {status.label}
                                        </span>
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
                                </div>
                                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center">
                                    <Activity className="w-6 h-6 text-slate-400 group-hover:text-primary transition-colors" />
                                </div>
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
            </div>
        </div>
    );
}
