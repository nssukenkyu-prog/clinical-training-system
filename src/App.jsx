import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import Layout from './components/Layout';

// Pages
import LandingPage from './pages/LandingPage';
import StudentLogin from './pages/student/StudentLogin';
import SetPassword from './pages/student/SetPassword';
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        await checkUserRole(currentUser.uid);
      } else {
        setUser(null);
        setUserRole(null);
        setUserName('');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const checkUserRole = async (userId) => {
    // Check Admin
    const adminsRef = collection(db, 'admins');
    const qAdmin = query(adminsRef, where('auth_user_id', '==', userId)); // Assuming we keep auth_user_id or use doc ID
    // Note: For migration, we might want to check by email if auth_user_id doesn't match Firebase UID yet, 
    // but let's assume we are setting up fresh or migrating IDs. 
    // For a fresh start with Firebase, we can query by email or ID.
    // Let's query by email as a fallback or primary if ID not found? 
    // Actually, best practice is to store the Firebase UID in the user document.
    // Since we are migrating, let's assume the user document has a field 'uid' or we query by email.
    // Let's stick to the plan: query 'admins' collection where 'email' matches (if we use email as link) or 'uid'.
    // The previous code used 'auth_user_id'. Let's try to find a document where 'email' matches the current user's email.

    const currentUser = auth.currentUser;
    if (!currentUser) return;

    // Check Admin by email (simpler for initial setup)
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
        <Route path="/" element={!user ? <LandingPage /> : <Navigate to={userRole === 'admin' ? "/admin/dashboard" : "/student/dashboard"} replace />} />
        <Route path="/student/login" element={!user ? <StudentLogin /> : <Navigate to="/student/dashboard" replace />} />
        <Route path="/student/set-password" element={<SetPassword />} />
        <Route path="/admin/login" element={!user ? <AdminLogin /> : <Navigate to="/admin/dashboard" replace />} />

        {/* Student Routes */}
        <Route
          path="/student/*"
          element={
            user && userRole === 'student' ? (
              <Layout userRole="student" userName={userName}>
                <Routes>
                  <Route path="dashboard" element={<StudentDashboard />} />
                  <Route path="reservation" element={<SlotReservation />} />
                  <Route path="*" element={<Navigate to="dashboard" replace />} />
                </Routes>
              </Layout>
            ) : (
              <Navigate to="/student/login" replace />
            )
          }
        />

        {/* Admin Routes */}
        <Route
          path="/admin/*"
          element={
            user && userRole === 'admin' ? (
              <Layout userRole="admin" userName={userName}>
                <Routes>
                  <Route path="dashboard" element={<AdminDashboard />} />
                  <Route path="slots" element={<SlotManagement />} />
                  <Route path="students" element={<StudentManagement />} />
                  <Route path="settings" element={<SystemSettings />} />
                  <Route path="approvals" element={<ResultApproval />} />
                  <Route path="*" element={<Navigate to="dashboard" replace />} />
                </Routes>
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
