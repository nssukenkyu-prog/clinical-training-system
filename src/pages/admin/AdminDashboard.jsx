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
            // Fix: Use local date for todayStr to match JST
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

            // 1. Today's Reservations
            const reservationsRef = collection(db, 'reservations');
            const qToday = query(
                reservationsRef,
                where('slot_date', '==', todayStr),
                where('status', '==', 'confirmed')
            );
            const todaySnapshot = await getCountFromServer(qToday);

            // 2. Total Students
            const studentsRef = collection(db, 'students');
            const studentsSnapshot = await getCountFromServer(studentsRef);

            // 3. Active Slots (Future slots)
            const slotsRef = collection(db, 'slots');
            const qActiveSlots = query(
                slotsRef,
                where('date', '>=', todayStr),
                where('is_active', '==', true)
            );
            const activeSlotsSnapshot = await getCountFromServer(qActiveSlots);

            // 4. Approved Trainings (using 'completed' status internally)
            const qCompleted = query(
                reservationsRef,
                where('status', '==', 'completed')
            );
            const completedSnapshot = await getCountFromServer(qCompleted);

            setStats({
                todayReservations: todaySnapshot.data().count,
                totalStudents: studentsSnapshot.data().count,
                activeSlots: activeSlotsSnapshot.data().count,
                completedTrainings: completedSnapshot.data().count
            });

            // 今日の枠一覧
            const qTodaySlots = query(
                slotsRef,
                where('date', '==', todayStr),
                where('is_active', '==', true),
                orderBy('start_time')
            );
            const todaySlotsSnapshot = await getDocs(qTodaySlots);
            const slotsData = todaySlotsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Fetch reservations for today's slots
            // Using denormalized slot_date
            const qTodaySlotReservations = query(
                reservationsRef,
                where('slot_date', '==', todayStr),
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
        <div className="space-y-8 pt-6">
            <div>
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">管理者ダッシュボード</h1>
                <p className="text-slate-500 mt-2">システム全体の状況を確認できます</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    label="今日の予約"
                    value={stats.todayReservations}
                    icon={Calendar}
                    color="text-blue-600"
                    bg="bg-blue-50"
                />
                <StatCard
                    label="登録学生数"
                    value={stats.totalStudents}
                    icon={Users}
                    color="text-emerald-600"
                    bg="bg-emerald-50"
                />
                <StatCard
                    label="有効な実習枠"
                    value={stats.activeSlots}
                    icon={Clock}
                    color="text-amber-600"
                    bg="bg-amber-50"
                />
                <StatCard
                    label="承認済の実習"
                    value={stats.completedTrainings}
                    icon={CheckSquare}
                    color="text-purple-600"
                    bg="bg-purple-50"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Content (Today's Slots) */}
                <div className="lg:col-span-2 glass-panel p-6 rounded-2xl bg-white shadow-lg border-slate-100">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900">
                            <Clock className="w-5 h-5 text-primary" />
                            本日の実習枠
                        </h2>
                        <span className="text-sm text-slate-500 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                            {new Date().toLocaleDateString('ja-JP')}
                        </span>
                    </div>

                    {todaySlots.length === 0 ? (
                        <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-xl border border-slate-100 dashed">
                            <p>今日の実習枠はありません</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {todaySlots.map(slot => {
                                const confirmed = (slot.reservations || []);
                                const isFull = confirmed.length >= slot.max_capacity;

                                return (
                                    <div key={slot.id} className="p-4 rounded-xl bg-white border border-slate-200 hover:shadow-md transition-all">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <span className="text-lg font-bold text-slate-900">
                                                    {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                                                </span>
                                                <span className="text-xs font-bold px-2 py-1 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                                    {getTrainingTypeLabel(slot.training_type)}
                                                </span>
                                            </div>
                                            <span className={clsx(
                                                "text-xs font-bold px-2 py-1 rounded flex items-center gap-1 border",
                                                isFull ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-emerald-50 text-emerald-600 border-emerald-200"
                                            )}>
                                                <Users className="w-3 h-3" />
                                                {confirmed.length} / {slot.max_capacity}
                                            </span>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            {confirmed.length > 0 ? (
                                                confirmed.map(r => (
                                                    <span key={r.id} className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 border border-blue-200 flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                                                        {r.students?.name || '---'}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="text-xs text-slate-400 italic">予約なし</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Quick Actions */}
                <div className="glass-panel p-6 rounded-2xl h-fit bg-white shadow-lg border-slate-100">
                    <h2 className="text-xl font-bold mb-6 text-slate-900">クイックアクション</h2>
                    <div className="space-y-3">
                        <Link to="/admin/slots" className="bg-white border border-slate-200 w-full p-4 rounded-xl flex items-center justify-between group hover:bg-slate-50 hover:shadow-sm transition-all">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                                    <Calendar className="w-5 h-5" />
                                </div>
                                <span className="font-medium text-slate-700 group-hover:text-slate-900">実習枠を作成</span>
                            </div>
                            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
                        </Link>

                        <Link to="/admin/approvals" className="bg-white border border-slate-200 w-full p-4 rounded-xl flex items-center justify-between group hover:bg-slate-50 hover:shadow-sm transition-all">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-purple-50 text-purple-600 border border-purple-100">
                                    <CheckSquare className="w-5 h-5" />
                                </div>
                                <span className="font-medium text-slate-700 group-hover:text-slate-900">実績を承認</span>
                            </div>
                            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
                        </Link>

                        <Link to="/admin/students" className="bg-white border border-slate-200 w-full p-4 rounded-xl flex items-center justify-between group hover:bg-slate-50 hover:shadow-sm transition-all">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
                                    <Users className="w-5 h-5" />
                                </div>
                                <span className="font-medium text-slate-700 group-hover:text-slate-900">学生を管理</span>
                            </div>
                            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

const StatCard = ({ label, value, icon: Icon, color, bg }) => (
    <div className="bg-white p-6 rounded-2xl flex items-center gap-5 shadow-sm border border-slate-100 hover:shadow-md transition-all duration-300">
        <div className={`p-4 rounded-xl ${bg} ${color}`}>
            <Icon className="w-8 h-8" />
        </div>
        <div>
            <p className="text-sm text-slate-500 font-bold mb-1">{label}</p>
            <p className="text-3xl font-bold text-slate-900">{value}</p>
        </div>
    </div>
);
