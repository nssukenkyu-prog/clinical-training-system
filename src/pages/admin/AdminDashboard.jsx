import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, getCountFromServer, orderBy } from 'firebase/firestore';
import { Users, Calendar, CheckSquare, Clock, ArrowRight, Activity } from 'lucide-react';
import { clsx } from 'clsx';

export default function AdminDashboard() {
    const [stats, setStats] = useState({
        todayReservations: 0,
        totalStudents: 0,
        activeSlots: 0,
        completedTrainings: 0
    });
    const [todaySlots, setTodaySlots] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const today = new Date().toISOString().split('T')[0];

            // 今日の予約数
            const reservationsRef = collection(db, 'reservations');
            const qTodayReservations = query(
                reservationsRef,
                where('status', '==', 'confirmed'),
                where('created_at', '>=', today) // Note: This compares ISO string, might need adjustment if created_at includes time. 
                // Actually, 'created_at' usually includes time. Comparing string '2023-10-27' with '2023-10-27T...' works lexicographically.
                // But better to be safe.
            );
            const todayReservationsSnapshot = await getCountFromServer(qTodayReservations);

            // 学生総数
            const studentsRef = collection(db, 'students');
            const studentsSnapshot = await getCountFromServer(studentsRef);

            // 有効な実習枠数
            const slotsRef = collection(db, 'slots');
            const qActiveSlots = query(
                slotsRef,
                where('is_active', '==', true),
                where('date', '>=', today)
            );
            const activeSlotsSnapshot = await getCountFromServer(qActiveSlots);

            // 完了した実習数
            const qCompleted = query(
                reservationsRef,
                where('status', '==', 'completed')
            );
            const completedSnapshot = await getCountFromServer(qCompleted);

            setStats({
                todayReservations: todayReservationsSnapshot.data().count,
                totalStudents: studentsSnapshot.data().count,
                activeSlots: activeSlotsSnapshot.data().count,
                completedTrainings: completedSnapshot.data().count
            });

            // 今日の枠一覧
            const qTodaySlots = query(
                slotsRef,
                where('date', '==', today),
                where('is_active', '==', true),
                orderBy('start_time')
            );
            const todaySlotsSnapshot = await getDocs(qTodaySlots);
            const slotsData = todaySlotsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Fetch reservations for today's slots
            // Using denormalized slot_date
            const qTodaySlotReservations = query(
                reservationsRef,
                where('slot_date', '==', today),
                where('status', '==', 'confirmed')
            );
            const todaySlotReservationsSnapshot = await getDocs(qTodaySlotReservations);
            const reservationsData = todaySlotReservationsSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    // We need student name. Since we don't join, we might need to fetch student or rely on denormalized student name if we added it.
                    // We didn't add student name to reservation in SlotReservation.jsx.
                    // So we need to fetch student names.
                    // Or, for now, just show student ID or fetch them.
                    // Let's fetch all students? No.
                    // Let's fetch students involved in these reservations.
                };
            });

            // Fetch student details for the reservations
            const studentIds = [...new Set(reservationsData.map(r => r.student_id))];
            let studentsMap = {};
            if (studentIds.length > 0) {
                // Firestore 'in' query supports up to 10. If more, we need to batch or fetch all.
                // For dashboard, likely not too many students per day.
                // But to be safe, let's just fetch all students for now (assuming < 1000 active students) or fetch individually.
                // Or better: update SlotReservation to include student_name in reservation!
                // But I already wrote SlotReservation without it.
                // I will fetch students using 'in' batches or just one by one if few.
                // Let's use 'in' for chunks of 10.

                const chunks = [];
                for (let i = 0; i < studentIds.length; i += 10) {
                    chunks.push(studentIds.slice(i, i + 10));
                }

                for (const chunk of chunks) {
                    const qStudents = query(studentsRef, where('__name__', 'in', chunk)); // __name__ is doc ID
                    const snap = await getDocs(qStudents);
                    snap.forEach(doc => {
                        studentsMap[doc.id] = doc.data();
                    });
                }
            }

            // Merge
            const slotsWithReservations = slotsData.map(slot => {
                const slotReservations = reservationsData
                    .filter(r => r.slot_id === slot.id)
                    .map(r => ({
                        ...r,
                        students: studentsMap[r.student_id] || { name: 'Unknown' }
                    }));

                return {
                    ...slot,
                    reservations: slotReservations
                };
            });

            setTodaySlots(slotsWithReservations);

        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    const getTrainingTypeLabel = (type) => {
        const labels = { 'I': '臨床実習Ⅰ', 'II': '臨床実習Ⅱ', 'IV': '臨床実習Ⅳ' };
        return labels[type] || type;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold">管理者ダッシュボード</h1>
                <p className="text-slate-400 mt-1">システム全体の状況を確認できます</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    label="今日の予約"
                    value={stats.todayReservations}
                    icon={Calendar}
                    color="text-blue-400"
                    bg="bg-blue-500/10"
                />
                <StatCard
                    label="登録学生数"
                    value={stats.totalStudents}
                    icon={Users}
                    color="text-emerald-400"
                    bg="bg-emerald-500/10"
                />
                <StatCard
                    label="有効な実習枠"
                    value={stats.activeSlots}
                    icon={Activity}
                    color="text-amber-400"
                    bg="bg-amber-500/10"
                />
                <StatCard
                    label="完了した実習"
                    value={stats.completedTrainings}
                    icon={CheckSquare}
                    color="text-purple-400"
                    bg="bg-purple-500/10"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Content (Today's Slots) */}
                <div className="lg:col-span-2 glass-panel p-6 rounded-2xl">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Clock className="w-5 h-5 text-primary" />
                            本日の実習枠
                        </h2>
                        <span className="text-sm text-slate-400 bg-white/5 px-3 py-1 rounded-full">
                            {new Date().toLocaleDateString('ja-JP')}
                        </span>
                    </div>

                    {todaySlots.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            <p>今日の実習枠はありません</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {todaySlots.map(slot => {
                                const confirmed = (slot.reservations || []);
                                const isFull = confirmed.length >= slot.max_capacity;

                                return (
                                    <div key={slot.id} className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <span className="text-lg font-bold">
                                                    {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                                                </span>
                                                <span className="text-xs font-bold px-2 py-1 rounded bg-white/10 text-slate-300">
                                                    {getTrainingTypeLabel(slot.training_type)}
                                                </span>
                                            </div>
                                            <span className={clsx(
                                                "text-xs font-bold px-2 py-1 rounded flex items-center gap-1",
                                                isFull ? "bg-rose-500/20 text-rose-300" : "bg-emerald-500/20 text-emerald-300"
                                            )}>
                                                <Users className="w-3 h-3" />
                                                {confirmed.length} / {slot.max_capacity}
                                            </span>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            {confirmed.length > 0 ? (
                                                confirmed.map(r => (
                                                    <span key={r.id} className="text-xs px-2 py-1 rounded bg-primary/20 text-primary border border-primary/20">
                                                        {r.students?.name || '---'}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="text-xs text-slate-500 italic">予約なし</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Quick Actions */}
                <div className="glass-panel p-6 rounded-2xl h-fit">
                    <h2 className="text-xl font-bold mb-6">クイックアクション</h2>
                    <div className="space-y-3">
                        <Link to="/admin/slots" className="glass-button w-full p-4 rounded-xl flex items-center justify-between group hover:bg-white/10">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
                                    <Calendar className="w-5 h-5" />
                                </div>
                                <span className="font-medium">実習枠を作成</span>
                            </div>
                            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
                        </Link>

                        <Link to="/admin/results" className="glass-button w-full p-4 rounded-xl flex items-center justify-between group hover:bg-white/10">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400">
                                    <CheckSquare className="w-5 h-5" />
                                </div>
                                <span className="font-medium">実績を承認</span>
                            </div>
                            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
                        </Link>

                        <Link to="/admin/students" className="glass-button w-full p-4 rounded-xl flex items-center justify-between group hover:bg-white/10">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                                    <Users className="w-5 h-5" />
                                </div>
                                <span className="font-medium">学生を管理</span>
                            </div>
                            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

const StatCard = ({ label, value, icon: Icon, color, bg }) => (
    <div className="glass-panel p-6 rounded-2xl flex items-center gap-4">
        <div className={`p-3 rounded-xl ${bg} ${color}`}>
            <Icon className="w-6 h-6" />
        </div>
        <div>
            <p className="text-sm text-slate-400">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
        </div>
    </div>
);
