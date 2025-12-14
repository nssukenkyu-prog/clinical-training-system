import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, Timestamp, orderBy } from 'firebase/firestore';
import { Clock, CheckCircle, LogIn, LogOut, User, AlertCircle, X } from 'lucide-react';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

export default function SiteKiosk() {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [reservations, setReservations] = useState([]);
    const [activeSessions, setActiveSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [processing, setProcessing] = useState(false);
    const [modalMode, setModalMode] = useState(null); // 'checkin' | 'checkout'

    // Clock
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Data Fetching
    const fetchData = async () => {
        try {
            setLoading(true);
            // JST Date Construction
            const now = new Date();
            const jstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
            const today = format(jstNow, 'yyyy-MM-dd');

            // 1. Get Today's Reservations (Confirmed)
            // Note: Field name is 'slot_date' in reservation doc
            const resRef = collection(db, 'reservations');
            const qRes = query(
                resRef,
                where('slot_date', '==', today),
                where('status', '==', 'confirmed')
            );
            const resSnap = await getDocs(qRes);
            const todayReservations = resSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            // 2. Get Active Sessions (Check-in but no Check-out)
            const logsRef = collection(db, 'attendance_logs');
            const qLogs = query(
                logsRef,
                where('date', '==', today),
                where('status', '==', 'active') // Assuming 'active' means checked in
            );
            const logsSnap = await getDocs(qLogs);
            const currentSessions = logsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Filter out reservations that are already active
            const activeStudentIds = new Set(currentSessions.map(s => s.student_id));
            const pendingReservations = todayReservations.filter(r => !activeStudentIds.has(r.student_id));

            setReservations(pendingReservations);
            setActiveSessions(currentSessions);
        } catch (err) {
            console.error("Error fetching kiosk data:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60000); // Refresh every minute
        return () => clearInterval(interval);
    }, []);

    const handleCardClick = (item, mode) => {
        setSelectedStudent(item);
        setModalMode(mode);
        setPin('');
        setError('');
    };

    const handleCloseModal = () => {
        setSelectedStudent(null);
        setModalMode(null);
        setPin('');
    };

    const verifyAndSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setProcessing(true);

        try {
            // Verify Student ID (Alphanumeric check against student record)
            // Fetch student doc by ID from item
            const studentId = modalMode === 'checkin' ? selectedStudent.student_id : selectedStudent.student_id;

            // We need to fetch the student's actual record to verify the student_number (ID)
            const studentDocRef = doc(db, 'students', studentId);
            // Optimization: In a real app we might store student_number on the reservation/log to save reads,
            // but for safety let's fetch.
            // Wait, we don't have direct access here easily without reading "students" collection.
            // Let's assume we can query 'students' by document ID.

            // However, verify logic: input PIN must match student_number (e.g., 2024001)
            // Strategy: Get all students? No, too heavy.
            // Get specific student.
            // Note: firestore getDoc is cheap.

            // BUT, the problem: 'students' collection has 'student_number'.
            // The user inputs 'pin'. verify pin == student_number.

            // To do this securely without exposing all IDs to client (though this IS the client),
            // we fetch the student doc and compare.

            // Wait, we need to find the student doc. 'reservations' has 'student_id'.
            const sDoc = await getDocs(query(collection(db, 'students'), where('__name__', '==', studentId)));
            if (sDoc.empty) throw new Error("Student record not found");
            const studentData = sDoc.docs[0].data();

            // Case-insensitive comparison
            const recordId = (studentData.student_number || '').toString().toLowerCase();
            const inputId = (pin || '').toString().toLowerCase();

            if (recordId !== inputId) {
                // Remove non-digits for fallback check?
                // The user requested lowercase support likely for alpha-numeric IDs (e.g., 24AB01)
                // Strict check:
                throw new Error("学籍番号が一致しません");
            }

            // Action
            const now = new Date();
            const timeString = format(now, 'HH:mm');

            if (modalMode === 'checkin') {
                // Create Check-in Log
                await addDoc(collection(db, 'attendance_logs'), {
                    student_id: studentId,
                    student_name: selectedStudent.student_name || studentData.name, // Fallback
                    date: format(now, 'yyyy-MM-dd'),
                    start_time: timeString,
                    end_time: null,
                    status: 'active',
                    training_type: selectedStudent.training_type || studentData.training_type || 'Unknown',
                    reservation_id: selectedStudent.id,
                    created_at: now.toISOString()
                });

                // Update Reservation Status? Optional.
                // Maybe update reservation to 'attended'?
            } else {
                // Checkout
                // Update existing log
                await updateDoc(doc(db, 'attendance_logs', selectedStudent.id), {
                    end_time: timeString,
                    status: 'completed',
                    actual_minutes: calculateDuration(selectedStudent.start_time, timeString),
                    updated_at: now.toISOString()
                });

                // Update Reservation to completed?
                if (selectedStudent.reservation_id) {
                    await updateDoc(doc(db, 'reservations', selectedStudent.reservation_id), {
                        status: 'completed',
                        actual_minutes: calculateDuration(selectedStudent.start_time, timeString)
                    });
                }
            }

            alert(`${modalMode === 'checkin' ? '出席' : '退室'}処理が完了しました: ${studentData.name}`);
            handleCloseModal();
            fetchData(); // Refresh

        } catch (err) {
            console.error(err);
            setError(err.message || "エラーが発生しました");
        } finally {
            setProcessing(false);
        }
    };

    const calculateDuration = (start, end) => {
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        return (eh * 60 + em) - (sh * 60 + sm);
    };

    return (
        <div className="min-h-screen bg-slate-900 text-white font-sans selection:bg-indigo-500/30">
            {/* Animated Background */}
            <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-cyan-600/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
            </div>

            {/* Header */}
            <header className="relative z-10 flex items-center justify-between px-8 py-6 bg-slate-900/50 backdrop-blur-md border-b border-white/10">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                        <Clock className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">NSSU Clinical Training</h1>
                        <p className="text-slate-400 text-sm">Kiosk Check-in System</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-4xl font-mono font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">
                        {format(currentTime, 'HH:mm')}
                    </div>
                    <div className="text-slate-400 text-sm font-medium">
                        {format(currentTime, 'yyyy/MM/dd (EEE)', { locale: ja })}
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="relative z-10 container mx-auto p-4 md:p-8 h-[calc(100vh-100px)] grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* Check-in Column */}
                <div className="bg-slate-800/40 backdrop-blur-xl rounded-3xl border border-white/5 p-6 flex flex-col">
                    <div className="flex items-center gap-3 mb-6 px-2">
                        <div className="w-2 h-8 rounded-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]"></div>
                        <h2 className="text-xl font-bold text-white">Check-in <span className="text-slate-500 text-sm ml-2">本日の予約</span></h2>
                        <span className="ml-auto bg-emerald-500/20 text-emerald-300 text-xs font-bold px-3 py-1 rounded-full">{reservations.length}</span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                        {reservations.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-slate-500 flex-col gap-4">
                                <CheckCircle className="w-16 h-16 opacity-20" />
                                <p>現在、チェックイン可能な予約はありません</p>
                            </div>
                        ) : (
                            reservations.map(res => (
                                <button
                                    key={res.id}
                                    onClick={() => handleCardClick(res, 'checkin')}
                                    className="w-full text-left bg-slate-700/30 hover:bg-slate-700/60 border border-white/5 hover:border-emerald-500/50 rounded-2xl p-5 transition-all duration-300 group relative overflow-hidden"
                                >
                                    <div className="absolute inset-y-0 left-0 w-1 bg-emerald-500/50 group-hover:bg-emerald-500 transition-colors"></div>
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-lg font-bold text-white group-hover:text-emerald-300 transition-colors">{res.student_name}</span>
                                        <span className="text-xs font-mono bg-slate-800 px-2 py-1 rounded text-slate-300">{res.training_type || '一般'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                                        <Clock className="w-4 h-4" />
                                        {res.custom_start_time || res.slot_start_time || '??:??'} - {res.custom_end_time || res.slot_end_time || '??:??'}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Check-out Column */}
                <div className="bg-slate-800/40 backdrop-blur-xl rounded-3xl border border-white/5 p-6 flex flex-col">
                    <div className="flex items-center gap-3 mb-6 px-2">
                        <div className="w-2 h-8 rounded-full bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.5)]"></div>
                        <h2 className="text-xl font-bold text-white">Check-out <span className="text-slate-500 text-sm ml-2">実習中</span></h2>
                        <span className="ml-auto bg-rose-500/20 text-rose-300 text-xs font-bold px-3 py-1 rounded-full">{activeSessions.length}</span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                        {activeSessions.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-slate-500 flex-col gap-4">
                                <LogOut className="w-16 h-16 opacity-20" />
                                <p>現在、実習中の学生はいません</p>
                            </div>
                        ) : (
                            activeSessions.map(session => (
                                <button
                                    key={session.id}
                                    onClick={() => handleCardClick(session, 'checkout')}
                                    className="w-full text-left bg-slate-700/30 hover:bg-slate-700/60 border border-white/5 hover:border-rose-500/50 rounded-2xl p-5 transition-all duration-300 group relative overflow-hidden"
                                >
                                    <div className="absolute inset-y-0 left-0 w-1 bg-rose-500/50 group-hover:bg-rose-500 transition-colors"></div>
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-lg font-bold text-white group-hover:text-rose-300 transition-colors">{session.student_name}</span>
                                        <div className="flex items-center gap-2 text-emerald-400 text-sm font-mono bg-emerald-500/10 px-2 py-1 rounded">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                            Active
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                                        <LogIn className="w-4 h-4" />
                                        Started: {session.start_time}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>

            </main>

            {/* Modal */}
            {selectedStudent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <form onSubmit={verifyAndSubmit} className="bg-slate-900 border border-white/10 rounded-3xl shadow-2xl p-8 w-full max-w-md relative overflow-hidden">
                        {/* Glow effect */}
                        <div className={`absolute top-0 left-0 w-full h-1 ${modalMode === 'checkin' ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>

                        <button type="button" onClick={handleCloseModal} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors">
                            <X className="w-6 h-6" />
                        </button>

                        <div className="text-center mb-8">
                            <h3 className="text-xl font-bold text-white mb-1">
                                {modalMode === 'checkin' ? 'Check-in Confirmation' : 'Check-out Confirmation'}
                            </h3>
                            <p className="text-slate-400 text-sm">
                                {selectedStudent.student_name}
                            </p>
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-500 ml-1">Student ID (学籍番号)</label>
                                <input
                                    type="text"
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-4 text-2xl font-mono text-center text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-600"
                                    placeholder="2024001"
                                    autoFocus
                                    required
                                />
                            </div>

                            {error && (
                                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-sm flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" />
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={processing}
                                className={`w-full py-4 rounded-xl font-bold text-white shadow-lg transform transition-all active:scale-[0.98] ${modalMode === 'checkin'
                                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 shadow-emerald-500/20 hover:shadow-emerald-500/40'
                                    : 'bg-gradient-to-r from-rose-600 to-pink-600 shadow-rose-500/20 hover:shadow-rose-500/40'
                                    }`}
                            >
                                {processing ? 'Processing...' : modalMode === 'checkin' ? 'Confirm Check-in' : 'Confirm Check-out'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
