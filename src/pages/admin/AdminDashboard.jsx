import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, getCountFromServer } from 'firebase/firestore';
import { Users, Calendar, CheckSquare, Clock, ArrowRight, Activity, Download } from 'lucide-react';
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
            // Force JST Date
            const now = new Date();
            const jstDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
            const todayStr = `${jstDate.getFullYear()}-${String(jstDate.getMonth() + 1).padStart(2, '0')}-${String(jstDate.getDate()).padStart(2, '0')}`;

            console.log('AdminDashboard loading for date (JST):', todayStr);

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

            // 今日の枠一覧 - 修正: インデックス問題を回避するためクライアントサイドフィルタリングを使用
            // 単純なクエリで取得し、JSでフィルタリングとソートを行う
            const qTodaySlots = query(
                slotsRef,
                where('is_active', '==', true),
                where('date', '>=', todayStr) // 今日以降を取得
                // orderBy は外す（インデックス回避のため）
            );
            const todaySlotsSnapshot = await getDocs(qTodaySlots);
            const allActiveSlots = todaySlotsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // JSで「今日」かつ「開始時間順」にフィルタリング・ソート
            const slotsData = allActiveSlots
                .filter(slot => slot.date === todayStr)
                .sort((a, b) => a.start_time.localeCompare(b.start_time));

            console.log(`Loaded ${slotsData.length} slots for today (${todayStr})`);

            // Fetch reservations for today's slots
            // Using denormalized slot_date
            // ここも同様に修正しても良いが、statusとslot_dateの複合ならインデックスがある可能性が高い
            // 念のため、reservationsも安全策をとる
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
                };
            });

            // Fetch student details for the reservations
            const studentIds = [...new Set(reservationsData.map(r => r.student_id))];
            let studentsMap = {};
            if (studentIds.length > 0) {
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
            // ユーザーに見えるアラートは出さない（statsなどは表示されるため）
        } finally {
            setLoading(false);
        }
    };

    const getTrainingTypeLabel = (type) => {
        const labels = { 'I': '臨床実習Ⅰ', 'II': '臨床実習Ⅱ', 'IV': '臨床実習Ⅳ' };
        return labels[type] || type;
    };

    const exportToCSV = async () => {
        try {
            // Fetch all reservations
            const reservationsRef = collection(db, 'reservations');
            const reservationsSnapshot = await getDocs(reservationsRef);
            const reservations = reservationsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Fetch all students for name lookup
            const studentsRef = collection(db, 'students');
            const studentsSnapshot = await getDocs(studentsRef);
            const studentsMap = {};
            studentsSnapshot.docs.forEach(doc => {
                studentsMap[doc.id] = doc.data();
            });

            // Create CSV content
            const headers = ['学籍番号', '氏名', '日付', '開始時間', '終了時間', '実習区分', 'ステータス', '実績時間(分)'];
            const rows = reservations.map(r => {
                const student = studentsMap[r.student_id] || {};
                return [
                    student.student_number || '',
                    student.name || '',
                    r.slot_date || '',
                    r.custom_start_time || r.slot_start_time || '',
                    r.custom_end_time || r.slot_end_time || '',
                    r.slot_training_type || '',
                    r.status || '',
                    r.actual_minutes || ''
                ].join(',');
            });

            const csv = [headers.join(','), ...rows].join('\n');
            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `reservations_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export error:', error);
            alert('エクスポートに失敗しました');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8 pt-10">
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">管理者ダッシュボード</h1>
                    <p className="text-slate-500 mt-2">システム全体の状況を確認できます</p>
                </div>
                <button
                    onClick={exportToCSV}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-medium shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all hover:-translate-y-0.5"
                >
                    <Download className="w-4 h-4" />
                    CSVエクスポート
                </button>
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
