import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import Layout from './components/Layout';

// Pages
import StudentEntry from './pages/student/StudentEntry';
import StudentDashboard from './pages/student/StudentDashboard';
import SlotReservation from './pages/student/SlotReservation';
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import SlotManagement from './pages/admin/SlotManagement';
import StudentManagement from './pages/admin/StudentManagement';
import SystemSettings from './pages/admin/SystemSettings';
import ResultApproval from './pages/admin/ResultApproval';
import SiteKiosk from './pages/site/SiteKiosk';
import MigrationPage from './pages/admin/MigrationPage';

import './index.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(null); // 'student' | 'admin'
  const [userName, setUserName] = useState('');

  // Role detection logic
  const detectRole = async (currentUser) => {
    if (!currentUser) {
      setUserRole(null);
      setUserName('');
      return;
    }

    try {
      // 1. Check Admin
      const adminsRef = collection(db, 'admins');
      const qAdmin = query(adminsRef, where('email', '==', currentUser.email));
      const adminSnap = await getDocs(qAdmin);
      if (!adminSnap.empty) {
        setUserRole('admin');
        setUserName(adminSnap.docs[0].data().name || 'Admin');
        return;
      }

      // 2. Check Student
      const studentsRef = collection(db, 'students');
      const qStudent = query(studentsRef, where('email', '==', currentUser.email));
      const studentSnap = await getDocs(qStudent);
      if (!studentSnap.empty) {
        setUserRole('student');
        setUserName(studentSnap.docs[0].data().name || 'Student');
        return;
      }

      // 3. Unregistered
      setUserRole(null);
    } catch (err) {
      console.error("Role detection error:", err);
      // Fallback
      setUserRole(null);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await detectRole(currentUser);
      } else {
        setUserRole(null);
        setUserName('');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium text-sm">Loading System...</p>
        </div>
      </div>
    );
  }

  // Session Fallback for Students who didn't use Firebase Auth (legacy support)
  const isSessionStudent = sessionStorage.getItem('clinical_student_id');

  return (
    <Router>
      <Routes>
        {/* Public / Entry */}
        <Route path="/" element={<StudentEntry />} />

        {/* Admin Login */}
        <Route
          path="/admin/login"
          element={user && userRole === 'admin' ? <Navigate to="/admin/dashboard" replace /> : <AdminLogin />}
        />

        {/* Admin Routes */}
        <Route path="/admin/*" element={
          user && userRole === 'admin' ? (
            <Layout userRole="admin" userName={userName}>
              <Routes>
                <Route path="dashboard" element={<AdminDashboard />} />
                <Route path="students" element={<StudentManagement />} />
                <Route path="slots" element={<SlotManagement />} />
                <Route path="approvals" element={<ResultApproval />} />
                <Route path="settings" element={<SystemSettings />} />
                <Route path="migration" element={<MigrationPage />} />
                <Route path="*" element={<Navigate to="dashboard" replace />} />
              </Routes>
            </Layout>
          ) : (
            <Navigate to="/admin/login" replace />
          )
        } />

        {/* Student Routes */}
        <Route path="/student/*" element={
          (user && userRole === 'student') || isSessionStudent ? (
            <Layout userRole="student" userName={userName || sessionStorage.getItem('clinical_student_name') || 'Student'}>
              <Routes>
                <Route path="dashboard" element={<StudentDashboard />} />
                <Route path="reservation" element={<SlotReservation />} />
                <Route path="*" element={<Navigate to="dashboard" replace />} />
              </Routes>
            </Layout>
          ) : (
            <Navigate to="/" replace />
          )
        } />

        {/* Site Kiosk */}
        <Route path="/site-kiosk" element={<SiteKiosk />} />

        {/* 404 Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
