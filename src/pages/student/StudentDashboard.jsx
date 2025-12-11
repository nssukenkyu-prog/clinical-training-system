import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { Clock, Calendar, CheckCircle, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';

export default function StudentDashboard() {
    const [student, setStudent] = useState(null);
    const [reservations, setReservations] = useState([]);
    const [totalMinutes, setTotalMinutes] = useState(0);
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        try {
            // セッションから学生IDを取得
            const studentId = sessionStorage.getItem('clinical_student_id');

            if (!studentId) {
                navigate('/');
                return;
            }

            // 学生情報を取得
            const studentDoc = await getDoc(doc(db, 'students', studentId));

            if (!studentDoc.exists()) {
                sessionStorage.clear();
                navigate('/');
                return;
            }

            const studentData = { id: studentDoc.id, ...studentDoc.data() };
            setStudent(studentData);

            // 予約一覧を取得（キャンセル以外）
            const reservationsRef = collection(db, 'reservations');
            const qReservations = query(
                reservationsRef,
                where('student_id', '==', studentId)
            );
            const reservationsSnapshot = await getDocs(qReservations);
            const reservationsData = reservationsSnapshot.docs
                .map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }))
                .filter(r => r.status !== 'cancelled')
                .sort((a, b) => {
                    // Sort by date desc, then by time desc
                    if (a.slot_date !== b.slot_date) return b.slot_date.localeCompare(a.slot_date);
                    return (b.slot_start_time || '').localeCompare(a.slot_start_time || '');
                });
            setReservations(reservationsData);

            // 累積時間を計算
            const completed = reservationsData.filter(r => r.status === 'completed');
            const total = completed.reduce((sum, r) => sum + (r.actual_minutes || 0), 0);
            setTotalMinutes(total);

            // システム設定を取得
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

    const formatTime = (minutes) => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours}時間${mins}分`;
    };

    const getProgressPercent = () => {
        if (!settings) return 0;
        return Math.min((totalMinutes / settings.requiredMinutes) * 100, 100);
    };

    const getTrainingTypeLabel = (type) => {
        const labels = { 'I': '臨床実習Ⅰ', 'II': '臨床実習Ⅱ', 'IV': '臨床実習Ⅳ' };
        return labels[type] || type;
    };

    const getStatusBadge = (status) => {
        const styles = {
            'confirmed': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
            'completed': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
            'cancelled': 'bg-rose-500/20 text-rose-300 border-rose-500/30'
        };
        const labels = {
            'confirmed': '予約済',
            'completed': '承認済',
            'cancelled': 'キャンセル'
        };
        return (
            <span className={clsx("px-2 py-1 rounded-full text-xs font-medium border", styles[status])}>
                {labels[status] || status}
            </span>
        );
    };

    const handleDeleteReservation = async (reservation) => {
        if (!window.confirm(`${formatDate(reservation.slot_date)} ${reservation.slot_start_time?.slice(0, 5) || ''} の予約を削除しますか？`)) {
            return;
        }
        try {
            await deleteDoc(doc(db, 'reservations', reservation.id));
            // Remove from local state
            setReservations(reservations.filter(r => r.id !== reservation.id));

            // Email Notification
            if (student?.email) {
                try {
                    const GAS_WEBHOOK_URL = import.meta.env.VITE_GAS_EMAIL_WEBHOOK_URL;
                    if (GAS_WEBHOOK_URL) {
                        await fetch(GAS_WEBHOOK_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            mode: 'no-cors',
                            body: JSON.stringify({
                                to: student.email,
                                subject: '【臨床実習】予約キャンセルのお知らせ',
                                body: `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; padding: 20px;">
  <h2 style="color: #ef4444;">予約キャンセルのお知らせ</h2>
  <p>${student.name} 様</p>
  <p>以下の予約を取り消しました（ダッシュボード）。</p>
  <div style="background: #fef2f2; padding: 15px; border-radius: 8px; border: 1px solid #fee2e2; margin: 20px 0;">
    <ul style="list-style: none; padding: 0;">
      <li style="margin-bottom: 8px;">📅 <b>日時:</b> ${formatDate(reservation.slot_date)} ${reservation.slot_start_time?.slice(0, 5)} - ${reservation.slot_end_time?.slice(0, 5)}</li>
      <li>📋 <b>実習:</b> 臨床実習 ${reservation.slot_training_type}</li>
    </ul>
  </div>
</body>
</html>`
                            })
                        });
                    }
                } catch (e) {
                    console.error('Email failed', e);
                }
            }

            alert('予約を削除しました');
        } catch (error) {
            console.error('Error deleting reservation:', error);
            alert('削除に失敗しました');
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        return `${date.getMonth() + 1}月${date.getDate()}日(${days[date.getDay()]})`;
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
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
                    <p className="text-slate-500 mt-1">実習の進捗状況と予約管理</p>
                </div>
                <Link
                    to="/student/reservation"
                    className="bg-white border border-slate-200 shadow-sm px-6 py-3 rounded-xl flex items-center gap-2 text-primary font-bold hover:bg-slate-50 transition-colors"
                >
                    <Plus className="w-5 h-5" />
                    新規予約
                </Link>
            </div>

            {/* Progress Card */}
            <div className="glass-panel p-8 rounded-2xl relative overflow-hidden bg-white shadow-lg border-slate-100">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Clock className="w-32 h-32 text-slate-900" />
                </div>

                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900">
                            <CheckCircle className="w-5 h-5 text-primary" />
                            実習進捗状況
                        </h2>
                        <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-sm font-medium border border-slate-200">
                            {getTrainingTypeLabel(student?.training_type)}
                        </span>
                    </div>

                    <div className="mb-4">
                        <div className="flex justify-between text-sm mb-2">
                            <span className="text-slate-500">達成率</span>
                            <span className="font-bold text-xl text-slate-900">{Math.round(getProgressPercent())}%</span>
                        </div>
                        <div className="h-4 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                            <div
                                className="h-full bg-gradient-to-r from-primary to-blue-600 transition-all duration-1000 ease-out shadow-sm"
                                style={{ width: `${getProgressPercent()}%` }}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-6">
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                            <p className="text-sm text-slate-500 mb-1">現在の累積時間</p>
                            <p className="text-2xl font-bold text-slate-900">{formatTime(totalMinutes)}</p>
                        </div>
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                            <p className="text-sm text-slate-500 mb-1">必須時間</p>
                            <p className="text-2xl font-bold text-slate-700">{formatTime(settings?.requiredMinutes || 1260)}</p>
                        </div>
                    </div>

                    {getProgressPercent() >= 100 && (
                        <div className="mt-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center gap-3">
                            <CheckCircle className="w-5 h-5 text-emerald-500" />
                            <p className="font-medium">必須時間をクリアしました。</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Reservations List */}
            <div className="glass-panel p-8 rounded-2xl bg-white shadow-lg border-slate-100">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-900">
                    <Calendar className="w-5 h-5 text-primary" />
                    予約一覧
                </h2>

                {reservations.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-xl border border-slate-100 dashed">
                        <p>予約がありません</p>
                        <Link to="/student/reservation" className="text-primary hover:underline mt-2 inline-block font-medium">
                            実習枠を予約する
                        </Link>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-slate-500 border-b border-slate-200">
                                    <th className="pb-4 pl-4 font-medium">日付</th>
                                    <th className="pb-4 font-medium">時間</th>
                                    <th className="pb-4 font-medium">実習区分</th>
                                    <th className="pb-4 font-medium">ステータス</th>
                                    <th className="pb-4 font-medium">実習時間</th>
                                    <th className="pb-4 font-medium">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {reservations.map((reservation) => (
                                    <tr key={reservation.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="py-4 pl-4 font-medium text-slate-700">
                                            {formatDate(reservation.slot_date)}
                                        </td>
                                        <td className="py-4 text-slate-600">
                                            {reservation.slot_start_time && `${reservation.slot_start_time.slice(0, 5)} - ${reservation.slot_end_time.slice(0, 5)}`}
                                        </td>
                                        <td className="py-4">
                                            <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-sm border border-slate-200">
                                                {getTrainingTypeLabel(reservation.slot_training_type)}
                                            </span>
                                        </td>
                                        <td className="py-4">
                                            {getStatusBadge(reservation.status)}
                                        </td>
                                        <td className="py-4 font-mono text-slate-600">
                                            {reservation.actual_minutes
                                                ? formatTime(reservation.actual_minutes)
                                                : '-'}
                                        </td>
                                        <td className="py-4">
                                            {reservation.status === 'confirmed' && (
                                                <button
                                                    onClick={() => handleDeleteReservation(reservation)}
                                                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                                    title="予約を削除"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Notice */}
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 flex items-start gap-3 shadow-sm">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-blue-600" />
                <div>
                    <strong className="block mb-1 font-semibold">予約の変更・キャンセルについて</strong>
                    <p className="text-sm opacity-90 text-blue-700">
                        予約の変更・キャンセルは開始時刻の12時間前まで可能です。
                        それ以降の変更は、Teamsでご連絡ください。
                    </p>
                </div>
            </div>
        </div>
    );
}
