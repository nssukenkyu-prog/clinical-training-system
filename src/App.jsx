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
  const [userRole, setUserRole] = useState(null); // 'student' | 'admin'
  const [userName, setUserName] = useState('');

  const checkUserRole = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    // Check Admin by email
    const adminsRef = collection(db, 'admins');
    const qAdminEmail = query(adminsRef, where('email', '==', currentUser.email));
    const adminSnapshot = await getDocs(qAdminEmail);

    if (!adminSnapshot.empty) {
      const adminData = adminSnapshot.docs[0].data();
      setUserRole('admin');
      setUserName(adminData.name || 'Admin');
      return;
    }

    // Check Student by email
    const studentsRef = collection(db, 'students');
    const qStudentEmail = query(studentsRef, where('email', '==', currentUser.email));
    const studentSnapshot = await getDocs(qStudentEmail);

    if (!studentSnapshot.empty) {
      const studentData = studentSnapshot.docs[0].data();
      setUserRole('student');
      setUserName(studentData.name || 'Student');
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        await checkUserRole();
      } else {
        setUser(null);
        setUserRole(null);
        setUserName('');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
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
