import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, getCountFromServer } from 'firebase/firestore';
import { Users, Calendar, SquareCheck, Clock, ArrowRight, Activity, Download, Monitor } from 'lucide-react';
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
    const [selectedSlot, setSelectedSlot] = useState(null); // For timeline detail modal

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

    const handleSlotClick = (slot) => {
        setSelectedSlot(slot);
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
        <div className="space-y-8 pt-10 relative">
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
                    icon={SquareCheck}
                    color="text-purple-600"
                    bg="bg-purple-50"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Content (Today's Slots) */}
                {/* Main Content (Today's Slots - Timeline View) */}
                <div className="lg:col-span-2 glass-panel p-6 rounded-2xl bg-white shadow-lg border-slate-100 flex flex-col h-[600px]">
                    <div className="flex items-center justify-between mb-4 flex-shrink-0">
                        <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900">
                            <Clock className="w-5 h-5 text-primary" />
                            本日のスケジュール
                        </h2>
                        <span className="text-sm text-slate-500 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                            {new Date().toLocaleDateString('ja-JP')}
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto relative border border-slate-100 rounded-xl bg-slate-50/50 custom-scrollbar">
                        {/* Time Grid */}
                        <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                            {Array.from({ length: 14 }).map((_, i) => { // 8:00 to 21:00
                                const hour = 8 + i;
                                return (
                                    <div key={hour} className="absolute w-full border-t border-slate-200 flex items-start" style={{ top: `${i * 100}px` }}> {/* 100px per hour */}
                                        <span className="text-xs text-slate-400 -mt-2.5 bg-slate-50/50 px-1 ml-1">{hour}:00</span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Slots */}
                        {todaySlots.length === 0 ? (
                            <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                                <p>今日の実習枠はありません</p>
                            </div>
                        ) : (
                            <div className="absolute top-0 left-12 right-2 h-full">
                                {todaySlots.map(slot => {
                                    // Calculate Position
                                    const [startH, startM] = slot.start_time.split(':').map(Number);
                                    const [endH, endM] = slot.end_time.split(':').map(Number);
                                    const startMin = (startH - 8) * 60 + startM;
                                    const durationMin = (endH * 60 + endM) - (startH * 60 + startM);

                                    const top = startMin * (100 / 60);
                                    const height = durationMin * (100 / 60);

                                    const confirmedCount = (slot.reservations || []).length;
                                    const isFull = confirmedCount >= slot.max_capacity;

                                    return (
                                        <button
                                            key={slot.id}
                                            onClick={() => handleSlotClick(slot)}
                                            style={{ top: `${top}px`, height: `${height}px` }}
                                            className={clsx(
                                                "absolute w-full rounded-lg border p-3 text-left transition-all hover:shadow-md hover:scale-[1.01] hover:z-10 bg-opacity-95 backdrop-blur-sm group",
                                                slot.training_type === 'I' ? 'bg-blue-50 border-blue-200 text-blue-900' :
                                                    slot.training_type === 'II' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' :
                                                        'bg-purple-50 border-purple-200 text-purple-900'
                                            )}
                                        >
                                            <div className="flex justify-between items-start h-full">
                                                <div className="flex flex-col justify-between h-full">
                                                    <div>
                                                        <div className="text-xs font-bold opacity-70 mb-0.5">
                                                            {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                                                        </div>
                                                        <div className="font-bold text-base">
                                                            {getTrainingTypeLabel(slot.training_type)}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col items-end gap-2">
                                                    <span className={clsx(
                                                        "text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 border",
                                                        isFull ? "bg-rose-100 text-rose-700 border-rose-200" : "bg-white/60 text-slate-600 border-slate-200"
                                                    )}>
                                                        <Users className="w-3 h-3" />
                                                        {confirmedCount} / {slot.max_capacity}
                                                    </span>

                                                    {/* Student Avatars Preview */}
                                                    <div className="flex -space-x-2 overflow-hidden">
                                                        {(slot.reservations || []).slice(0, 5).map((r, i) => (
                                                            <div key={i} className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-white flex items-center justify-center text-[10px] font-bold text-slate-600 shadow-sm" title={r.students?.name}>
                                                                {r.students?.name?.[0] || '?'}
                                                            </div>
                                                        ))}
                                                        {(slot.reservations || []).length > 5 && (
                                                            <div className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                                                                +{confirmedCount - 5}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Spacer for bottom scrolling */}
                        <div style={{ height: `${(21 - 8) * 100 + 50}px` }}></div>
                    </div>
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
                                    <SquareCheck className="w-5 h-5" />
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

                        <Link to="/site-kiosk" target="_blank" className="bg-white border border-slate-200 w-full p-4 rounded-xl flex items-center justify-between group hover:bg-slate-50 hover:shadow-sm transition-all mt-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-pink-50 text-pink-600 border border-pink-100">
                                    <Monitor className="w-5 h-5" />
                                </div>
                                <span className="font-medium text-slate-700 group-hover:text-slate-900">出席キオスクを開く</span>
                            </div>
                            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
                        </Link>
                    </div>
                </div>
            </div>

            {/* Detail Modal */}
            {selectedSlot && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedSlot(null)}>
                    <div className="glass-panel p-6 rounded-2xl w-full max-w-md bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                    {selectedSlot.start_time.slice(0, 5)} - {selectedSlot.end_time.slice(0, 5)}
                                </h3>
                                <p className="text-sm text-slate-500">{getTrainingTypeLabel(selectedSlot.training_type)}</p>
                            </div>
                            <button onClick={() => setSelectedSlot(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <Activity className="w-6 h-6 transform rotate-45" /> {/* Use X icon if imported, else Activity placeholder */}
                            </button>
                        </div>

                        <div className="space-y-4">
                            <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wider">予約中の学生</h4>
                            {(selectedSlot.reservations || []).length === 0 ? (
                                <p className="text-slate-400 text-sm">予約はありません</p>
                            ) : (
                                <div className="space-y-2">
                                    {(selectedSlot.reservations || []).map(r => (
                                        <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
                                                    {r.students?.name?.[0]}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-900 text-sm">{r.students?.name}</div>
                                                    <div className="text-xs text-slate-500 font-mono">{r.students?.student_number}</div>
                                                </div>
                                            </div>
                                            <span className={clsx(
                                                "text-[10px] px-2 py-1 rounded-full font-bold",
                                                r.status === 'confirmed' ? "bg-blue-100 text-blue-700" :
                                                    r.status === 'completed' ? "bg-emerald-100 text-emerald-700" :
                                                        "bg-slate-100 text-slate-600"
                                            )}>
                                                {r.status === 'confirmed' ? '予約中' : r.status === 'completed' ? '完了' : r.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
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
