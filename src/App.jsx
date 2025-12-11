import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import Layout from './components/Layout';

// Pages
import StudentEntry from './pages/student/StudentEntry';
// import SetPassword from './pages/student/SetPassword'; // Removed

import StudentDashboard from './pages/student/StudentDashboard';
import SlotReservation from './pages/student/SlotReservation';

import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import SlotManagement from './pages/admin/SlotManagement';
import StudentManagement from './pages/admin/StudentManagement';
import SystemSettings from './pages/admin/SystemSettings';
import ResultApproval from './pages/admin/ResultApproval';

import './index.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkingRole, setCheckingRole] = useState(true);
  const [userRole, setUserRole] = useState(null); // 'student' | 'admin'
  const [userName, setUserName] = useState('');

  const checkUserRole = async (currentUser) => {
    if (!currentUser) {
      setUserRole(null);
      setUserName('');
      setCheckingRole(false);
      return;
    }

    try {
      setCheckingRole(true);
      // Check Admin by email
      const adminsRef = collection(db, 'admins');
      const qAdminEmail = query(adminsRef, where('email', '==', currentUser.email));
      const adminSnapshot = await getDocs(qAdminEmail);

      if (!adminSnapshot.empty) {
        const adminData = adminSnapshot.docs[0].data();
        setUserRole('admin');
        setUserName(adminData.name || 'Admin');
      } else {
        // Check Student by email
        const studentsRef = collection(db, 'students');
        const qStudentEmail = query(studentsRef, where('email', '==', currentUser.email));
        const studentSnapshot = await getDocs(qStudentEmail);

        if (!studentSnapshot.empty) {
          const studentData = studentSnapshot.docs[0].data();
          setUserRole('student');
          setUserName(studentData.name || 'Student');
        } else {
          setUserRole(null); // Unknown user
        }
      }
    } catch (error) {
      console.error("Failed to check user role:", error);
    } finally {
      setCheckingRole(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false); // Auth init complete

      if (currentUser) {
        if (currentUser.isAnonymous) {
          // 匿名ログイン（学生）の場合は役割チェックをスキップして、画面リロード（ローディング表示）を防ぐ
          setCheckingRole(false);
        } else {
          await checkUserRole(currentUser);
        }
      } else {
        setCheckingRole(false);
      }
    });

    return () => unsubscribe();
  }, []);

  if (loading || checkingRole) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 text-sm font-medium animate-pulse">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<StudentEntry />} />

        {/* Admin Login - Public */}
        <Route
          path="/admin/login"
          element={
            !user ? <AdminLogin /> : <Navigate to="/admin/dashboard" replace />
          }
        />

        {/* Student Routes */}
        <Route
          path="/student/*"
          element={
            sessionStorage.getItem('clinical_student_id') ? (
              <Layout userRole="student" userName={sessionStorage.getItem('clinical_student_name') || 'Student'}>
                <Routes>
                  <Route path="dashboard" element={<StudentDashboard />} />
                  <Route path="reservation" element={<SlotReservation />} />
                  <Route path="*" element={<Navigate to="dashboard" replace />} />
                </Routes>
              </Layout>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        {/* Admin Protected Routes - NOT including /admin/login */}
        <Route
          path="/admin/dashboard"
          element={
            user && userRole === 'admin' ? (
              <Layout userRole="admin" userName={userName}>
                <AdminDashboard />
              </Layout>
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="/admin/slots"
          element={
            user && userRole === 'admin' ? (
              <Layout userRole="admin" userName={userName}>
                <SlotManagement />
              </Layout>
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="/admin/students"
          element={
            user && userRole === 'admin' ? (
              <Layout userRole="admin" userName={userName}>
                <StudentManagement />
              </Layout>
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="/admin/settings"
          element={
            user && userRole === 'admin' ? (
              <Layout userRole="admin" userName={userName}>
                <SystemSettings />
              </Layout>
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="/admin/approvals"
          element={
            user && userRole === 'admin' ? (
              <Layout userRole="admin" userName={userName}>
                <ResultApproval />
              </Layout>
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
