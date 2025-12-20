import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, orderBy, documentId } from 'firebase/firestore';
import { SquareCheck, Search, Check, X, Clock } from 'lucide-react';
import { clsx } from 'clsx';

// Helper function (module scope for use in ResultCard)
const formatDate = (dateInput) => {
    if (!dateInput) return '';
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return `${date.getMonth() + 1}月${date.getDate()}日(${days[date.getDay()]})`;
};

export default function ResultApproval() {
    const [reservations, setReservations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('pending'); // pending, completed
    const [processingId, setProcessingId] = useState(null);

    useEffect(() => {
        loadReservations();
    }, [filter]);

    const loadReservations = async () => {
        setLoading(true);
        try {
            const reservationsRef = collection(db, 'reservations');
            let q;

            if (filter === 'pending') {
                q = query(reservationsRef, where('status', '==', 'confirmed'), orderBy('created_at', 'desc'));
            } else {
                q = query(reservationsRef, where('status', '==', 'completed'), orderBy('created_at', 'desc'));
            }

            const querySnapshot = await getDocs(q);
            const reservationsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            if (reservationsData.length === 0) {
                setReservations([]);
                setLoading(false);
                return;
            }

            // Fetch related students
            // Get unique student IDs
            const studentIds = [...new Set(reservationsData.map(r => r.student_id))];

            // Firestore 'in' query is limited to 10 items. We need to chunk if more.
            // For simplicity in this migration, if there are many, we might need a different approach.
            // But let's assume < 10 active students for now or implement chunking.

            let studentsMap = {};

            // Chunking for 'in' query
            const chunkSize = 10;
            for (let i = 0; i < studentIds.length; i += chunkSize) {
                const chunk = studentIds.slice(i, i + chunkSize);
                if (chunk.length > 0) {
                    const studentsRef = collection(db, 'students');
                    const qStudents = query(studentsRef, where(documentId(), 'in', chunk));
                    const studentsSnapshot = await getDocs(qStudents);
                    studentsSnapshot.forEach(doc => {
                        studentsMap[doc.id] = doc.data();
                    });
                }
            }

            // Merge data
            // Note: Slot data is already denormalized in reservation (slot_date, slot_start_time, etc.)
            const mergedReservations = reservationsData.map(r => ({
                ...r,
                student: studentsMap[r.student_id] || { name: 'Unknown', student_number: '???', grade: '?', training_type: '?' },
                slot: {
                    date: r.slot_date,
                    start_time: r.slot_start_time,
                    end_time: r.slot_end_time,
                    training_type: r.slot_training_type
                }
            }));

            setReservations(mergedReservations);

        } catch (error) {
            console.error('Error loading reservations:', error);
            // alert('データの読み込みに失敗しました');
        } finally {
            setLoading(false);
        }
    };

    const calculateDuration = (start, end) => {
        if (!start || !end) return 0;
        const [startH, startM] = start.split(':').map(Number);
        const [endH, endM] = end.split(':').map(Number);
        return (endH * 60 + endM) - (startH * 60 + startM);
    };

    const handleApprove = async (reservation, actualMinutes) => {
        if (!window.confirm(`${reservation.student.name}さんの実習を完了として承認しますか？\n実績時間: ${Math.floor(actualMinutes / 60)}時間${actualMinutes % 60}分`)) {
            return;
        }

        setProcessingId(reservation.id);
        try {
            const reservationRef = doc(db, 'reservations', reservation.id);
            await updateDoc(reservationRef, {
                status: 'completed',
                actual_minutes: actualMinutes
            });

            // Remove from list if pending filter
            if (filter === 'pending') {
                setReservations(reservations.filter(r => r.id !== reservation.id));
            } else {
                loadReservations();
            }

            // Email Notification
            if (reservation.student.email) {
                try {
                    const GAS_WEBHOOK_URL = import.meta.env.VITE_GAS_EMAIL_WEBHOOK_URL;
                    if (GAS_WEBHOOK_URL) {
                        await fetch(GAS_WEBHOOK_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            mode: 'no-cors',
                            body: JSON.stringify({
                                subject: '【臨床実習】実習承認のお知らせ',
                                body: `
<!DOCTYPE html>
<html>
<head>
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body { font-family: -apple-system, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 20px auto; padding: 20px; }
  .card { background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0; }
  .header { background-color: #10b981; padding: 24px; text-align: center; } /* Emerald for Approval */
  .header h1 { color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; }
  .content { padding: 32px 24px; }
  .content h2 { color: #0f172a; margin-top: 0; font-size: 18px; text-align: center; margin-bottom: 24px; }
  .info-box { background-color: #f1f5f9; border-radius: 12px; padding: 20px; margin: 24px 0; border: 1px solid #e2e8f0; }
  .info-row { display: flex; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 8px; }
  .info-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
  .label { font-size: 13px; color: #64748b; font-weight: 600; }
  .value { font-size: 15px; color: #334155; font-weight: 600; text-align: right; }
  .footer { text-align: center; padding: 24px; color: #94a3b8; font-size: 12px; }
  
  @media (prefers-color-scheme: dark) {
    body { background-color: #0f172a !important; color: #e2e8f0 !important; }
    .card { background-color: #1e293b !important; border-color: #334155 !important; box-shadow: none !important; }
    .content h2 { color: #f8fafc !important; }
    .info-box { background-color: #334155 !important; border-color: #475569 !important; }
    .label { color: #94a3b8 !important; }
    .value { color: #f1f5f9 !important; }
  }
</style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <h1>実習承認のお知らせ</h1>
      </div>
      <div class="content">
        <h2>${reservation.student.name} 様</h2>
        <p>以下の実習実績が正式に承認されました。</p>
        
        <div class="info-box">
          <div class="info-row">
            <span class="label">日時</span>
            <span class="value">${formatDate(reservation.slot.date)}<br>${(reservation.custom_start_time || reservation.slot.start_time).slice(0, 5)} - ${(reservation.custom_end_time || reservation.slot.end_time).slice(0, 5)}</span>
          </div>
          <div class="info-row">
            <span class="label">実習区分</span>
            <span class="value">臨床実習 ${reservation.slot.training_type}</span>
          </div>
          <div class="info-row">
            <span class="label">認定時間</span>
            <span class="value" style="color: #10b981;">${Math.floor(actualMinutes / 60)}時間${actualMinutes % 60}分</span>
          </div>
        </div>
        
        <p style="text-align: center; font-size: 14px; color: #64748b;">マイページで累積時間を確認できます。</p>
      </div>
    </div>
    <div class="footer">
      &copy; NSSU Clinical Training System
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
            }

            // Optional: Show success toast
        } catch (error) {
            console.error('Error approving:', error);
            alert('承認処理に失敗しました');
        } finally {
            setProcessingId(null);
        }
    };

    const handleCancel = async (reservation) => {
        if (!window.confirm(`${reservation.student.name}さんの予約をキャンセル扱いにしますか？`)) {
            return;
        }

        setProcessingId(reservation.id);
        try {
            const reservationRef = doc(db, 'reservations', reservation.id);
            await updateDoc(reservationRef, {
                status: 'cancelled',
                cancelled_at: new Date().toISOString()
            });

            setReservations(reservations.filter(r => r.id !== reservation.id));

            // Email Notification
            if (reservation.student.email) {
                try {
                    const GAS_WEBHOOK_URL = import.meta.env.VITE_GAS_EMAIL_WEBHOOK_URL;
                    if (GAS_WEBHOOK_URL) {
                        await fetch(GAS_WEBHOOK_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            mode: 'no-cors',
                            body: JSON.stringify({
                                to: reservation.student.email,
                                subject: '【臨床実習】実習キャンセルのご連絡',
                                body: `
<!DOCTYPE html>
<html>
<head>
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body { font-family: -apple-system, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 20px auto; padding: 20px; }
  .card { background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0; }
  .header { background-color: #ef4444; padding: 24px; text-align: center; } /* Red for Cancellation */
  .header h1 { color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; }
  .content { padding: 32px 24px; }
  .content h2 { color: #0f172a; margin-top: 0; font-size: 18px; text-align: center; margin-bottom: 24px; }
  .info-box { background-color: #fef2f2; border-radius: 12px; padding: 20px; margin: 24px 0; border: 1px solid #fee2e2; }
  .info-row { display: flex; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px dashed #fecaca; padding-bottom: 8px; }
  .info-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
  .label { font-size: 13px; color: #991b1b; font-weight: 600; }
  .value { font-size: 15px; color: #7f1d1d; font-weight: 600; text-align: right; }
  .footer { text-align: center; padding: 24px; color: #94a3b8; font-size: 12px; }
  
  @media (prefers-color-scheme: dark) {
    body { background-color: #0f172a !important; color: #e2e8f0 !important; }
    .card { background-color: #1e293b !important; border-color: #334155 !important; box-shadow: none !important; }
    .content h2 { color: #f8fafc !important; }
    .info-box { background-color: #450a0a !important; border-color: #7f1d1d !important; }
    .label { color: #fecaca !important; }
    .value { color: #fef2f2 !important; }
  }
</style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <h1>実習キャンセルのお知らせ</h1>
      </div>
      <div class="content">
        <h2>${reservation.student.name} 様</h2>
        <p>以下の実習予約が管理者によりキャンセルされました。<br>理由等の詳細は教員までご確認ください。</p>
        
        <div class="info-box">
          <div class="info-row">
            <span class="label">日時</span>
            <span class="value">${formatDate(reservation.slot.date)}<br>${reservation.slot.start_time.slice(0, 5)} - ${reservation.slot.end_time.slice(0, 5)}</span>
          </div>
          <div class="info-row">
            <span class="label">実習区分</span>
            <span class="value">臨床実習 ${reservation.slot.training_type}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="footer">
      &copy; NSSU Clinical Training System
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
            }
        } catch (error) {
            console.error('Error cancelling:', error);
            alert('キャンセル処理に失敗しました');
        } finally {
            setProcessingId(null);
        }
    };


    // formatDate is moved to module scope

    return (
        <div className="space-y-8 pt-10">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">実績承認</h1>
                    <p className="text-slate-500 mt-1">実習の実績時間を確定・承認します</p>
                </div>

                <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                    <button
                        onClick={() => setFilter('pending')}
                        className={clsx(
                            "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                            filter === 'pending' ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        未承認
                    </button>
                    <button
                        onClick={() => setFilter('completed')}
                        className={clsx(
                            "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                            filter === 'completed' ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        承認済
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="w-8 h-8 border-2 border-primary border-t-white/0 rounded-full animate-spin"></div>
                </div>
            ) : reservations.length === 0 ? (
                <div className="glass-panel p-12 rounded-2xl text-center text-slate-500 bg-white shadow-lg border-slate-100">
                    <SquareCheck className="w-12 h-12 mx-auto mb-4 opacity-20 text-slate-700" />
                    <p>対象のデータはありません</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {reservations.map((reservation) => {
                        const defaultDuration = calculateDuration(
                            reservation.check_in_time || reservation.custom_start_time || reservation.slot.start_time,
                            reservation.check_out_time || reservation.custom_end_time || reservation.slot.end_time
                        );

                        return (
                            <ResultCard
                                key={reservation.id}
                                reservation={reservation}
                                defaultDuration={defaultDuration}
                                onApprove={handleApprove}
                                onCancel={handleCancel}
                                isProcessing={processingId === reservation.id}
                                isCompleted={filter === 'completed'}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}

const ResultCard = ({ reservation, defaultDuration, onApprove, onCancel, isProcessing, isCompleted }) => {
    const [minutes, setMinutes] = useState(reservation.actual_minutes || defaultDuration);

    return (
        <div className="glass-panel p-6 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
            <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                    <span className="px-2 py-1 rounded text-xs font-bold bg-slate-100 border border-slate-200 text-slate-600">
                        {reservation.student.grade}年
                    </span>
                    <span className="px-2 py-1 rounded text-xs font-bold bg-blue-50 text-blue-600 border border-blue-100">
                        実習{reservation.slot.training_type}
                    </span>
                    <span className="text-slate-500 text-sm font-medium">
                        {formatDate(reservation.slot.date)} {(reservation.custom_start_time || reservation.slot.start_time).slice(0, 5)}-{(reservation.custom_end_time || reservation.slot.end_time).slice(0, 5)}
                    </span>
                    {(reservation.check_in_time || reservation.check_out_time) && (
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                            実績: {reservation.check_in_time?.slice(0, 5) || '--:--'} - {reservation.check_out_time?.slice(0, 5) || '--:--'}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold text-slate-900">{reservation.student.name}</h3>
                    <span className="text-sm text-slate-500">{reservation.student.student_number}</span>
                </div>
            </div>

            <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                    <label className="text-sm text-slate-500 font-medium">実績時間</label>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 w-16 text-center focus:outline-none focus:border-primary text-slate-900 font-bold disabled:bg-slate-100 disabled:text-slate-500"
                            value={Math.floor(minutes / 60)}
                            onChange={(e) => {
                                const newH = parseInt(e.target.value) || 0;
                                const currentM = minutes % 60;
                                setMinutes(newH * 60 + currentM);
                            }}
                            disabled={isProcessing || isCompleted}
                            min="0"
                        />
                        <span className="text-sm font-medium text-slate-600">時間</span>
                        <input
                            type="number"
                            className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 w-16 text-center focus:outline-none focus:border-primary text-slate-900 font-bold disabled:bg-slate-100 disabled:text-slate-500"
                            value={minutes % 60}
                            onChange={(e) => {
                                const newM = parseInt(e.target.value) || 0;
                                const currentH = Math.floor(minutes / 60);
                                setMinutes(currentH * 60 + newM);
                            }}
                            disabled={isProcessing || isCompleted}
                            min="0"
                            max="59"
                        />
                        <span className="text-sm font-medium text-slate-600">分</span>
                    </div>

                    {!isCompleted && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => onApprove(reservation, minutes)}
                                disabled={isProcessing}
                                className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                                title="承認"
                            >
                                <Check className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => onCancel(reservation)}
                                disabled={isProcessing}
                                className="p-2 rounded-lg bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 transition-colors disabled:opacity-50"
                                title="欠席/キャンセル"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    )}

                    {isCompleted && (
                        <span className="text-emerald-600 text-sm font-bold flex items-center gap-1 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                            <Check className="w-4 h-4" /> 承認済
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};
