import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { Users, Calendar, CheckCircle2, Clock, ArrowRight, TrendingUp, Activity } from 'lucide-react';
import { motion } from 'framer-motion';

export default function AdminDashboard() {
    const [stats, setStats] = useState({
        todayReservations: 0,
        totalStudents: 0,
        activeSlots: 0,
        completedTrainings: 0
    });
    const [todayList, setTodayList] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Today's Date
                const now = new Date();
                const todayStr = now.toISOString().split('T')[0];

                // 1. Today's Reservations
                const reservationsRef = collection(db, 'reservations');
                const qToday = query(reservationsRef, where('slot_date', '==', todayStr), orderBy('slot_start_time'));
                const todaySnap = await getDocs(qToday);
                const todayData = await Promise.all(todaySnap.docs.map(async (doc) => {
                    const data = doc.data();
                    // Fetch student name
                    const studentDoc = await getDocs(query(collection(db, 'students'), where('__name__', '==', data.student_id)));
                    const studentName = !studentDoc.empty ? studentDoc.docs[0].data().name : 'Unknown';
                    return { id: doc.id, ...data, studentName };
                }));
                setTodayList(todayData);

                // 2. Total Students
                const studentsSnap = await getDocs(collection(db, 'students'));

                // 3. Active Slots (Future)
                const slotsRef = collection(db, 'training_slots');
                const qSlots = query(slotsRef, where('date', '>=', todayStr));
                const slotsSnap = await getDocs(qSlots);

                // 4. Completed Trainings
                const qCompleted = query(reservationsRef, where('status', '==', 'completed'));
                const completedSnap = await getDocs(qCompleted);

                setStats({
                    todayReservations: todaySnap.size,
                    totalStudents: studentsSnap.size,
                    activeSlots: slotsSnap.size,
                    completedTrainings: completedSnap.size
                });

            } catch (error) {
                console.error("Error fetching admin stats:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="animate-spin w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    const statCards = [
        { label: '今日の予約', value: stats.todayReservations, icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
        { label: '登録学生数', value: stats.totalStudents, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
        { label: '有効な実習枠', value: stats.activeSlots, icon: Activity, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
        { label: '承認済の実習', value: stats.completedTrainings, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
    ];

    return (
        <div className="space-y-8 pb-24">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
                    <p className="text-slate-500">管理画面概要</p>
                </div>
                <div className="text-right hidden sm:block">
                    <div className="text-sm font-bold text-slate-900">{new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                    <div className="text-xs text-slate-500">Today</div>
                </div>
            </div>

            {/* Stats Grid (Scrollable on mobile) */}
            <div className="flex overflow-x-auto gap-4 pb-4 -mx-6 px-6 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible sm:mx-0 sm:px-0 snap-x">
                {statCards.map((stat, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className={`flex-shrink-0 w-64 sm:w-auto snap-center p-6 rounded-3xl border ${stat.bg} ${stat.border} shadow-sm`}
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <div className={`p-2.5 rounded-xl bg-white shadow-sm ${stat.color}`}>
                                <stat.icon className="w-6 h-6" />
                            </div>
                            <span className={`font-bold text-sm ${stat.color} opacity-80`}>{stat.label}</span>
                        </div>
                        <div className="text-4xl font-bold text-slate-900">
                            {stat.value}
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Today's Schedule */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <Clock className="w-6 h-6 text-indigo-500" />
                        本日のスケジュール
                    </h2>
                    <span className="text-sm font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                        {todayList.length}件
                    </span>
                </div>

                <div className="space-y-3">
                    {todayList.length === 0 ? (
                        <div className="text-center py-16 bg-slate-50 rounded-3xl border border-slate-100 border-dashed">
                            <p className="text-slate-400 font-medium">本日の予約はありません</p>
                        </div>
                    ) : (
                        todayList.map((res, i) => (
                            <motion.div
                                key={res.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.5 + (i * 0.05) }}
                                className="group flex items-center justify-between p-5 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all"
                            >
                                <div className="flex items-center gap-5">
                                    <div className="flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-slate-50 text-slate-900 font-bold border border-slate-100">
                                        <span className="text-xs text-slate-400">START</span>
                                        {res.custom_start_time.slice(0, 5)}
                                    </div>
                                    <div>
                                        <div className="font-bold text-lg text-slate-900 mb-1">{res.studentName}</div>
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${res.slot_training_type === 'I' ? 'bg-blue-100 text-blue-700' :
                                                    res.slot_training_type === 'II' ? 'bg-emerald-100 text-emerald-700' :
                                                        'bg-purple-100 text-purple-700'
                                                }`}>
                                                Type {res.slot_training_type}
                                            </span>
                                            <span className="text-xs text-slate-400 font-medium">
                                                ~ {res.custom_end_time.slice(0, 5)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-colors">
                                    <ArrowRight className="w-4 h-4" />
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>
            </motion.div>
        </div>
    );
}
