import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { LogOut, User, Calendar, LayoutDashboard, Settings, Users, CheckSquare } from 'lucide-react';
import { clsx } from 'clsx';

const Layout = ({ children, userRole, userName }) => {
    const location = useLocation();
    const navigate = useNavigate();

    const handleLogout = async () => {
        if (userRole === 'admin') {
            await signOut(auth);
            navigate('/admin/login');
        } else {
            // Student: Clear session
            sessionStorage.removeItem('clinical_student_id');
            sessionStorage.removeItem('clinical_student_name');
            // Sign out from anonymous auth if needed, but not strictly required if we just clear session.
            // But let's be clean.
            if (auth.currentUser?.isAnonymous) {
                await signOut(auth);
            }
            navigate('/');
        }
    };

    const navItems = userRole === 'admin' ? [
        { path: '/admin/dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
        { path: '/admin/slots', label: '実習枠管理', icon: Calendar },
        { path: '/admin/students', label: '学生管理', icon: Users },
        { path: '/admin/approvals', label: '実績承認', icon: CheckSquare }, // New page
        { path: '/admin/settings', label: '設定', icon: Settings },
    ] : [
        { path: '/student/dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
        { path: '/student/reservation', label: '実習予約', icon: Calendar },
    ];

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-primary/30">
            {/* Background Gradients */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-100 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-purple-100 rounded-full blur-[120px]" />
            </div>

            {/* Sidebar (Desktop) */}
            <aside className="fixed left-0 top-0 h-full w-64 bg-gradient-to-b from-slate-50 to-white backdrop-blur-xl border-r border-slate-200/50 z-20 hidden md:flex flex-col shadow-xl">
                <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700">
                    <h1 className="text-lg font-bold text-white leading-tight drop-shadow-sm">
                        NSSU 令和8年度<br />臨床実習
                    </h1>
                    <p className="text-xs text-indigo-200 mt-1 font-medium">
                        {userRole === 'admin' ? '👤 管理者ポータル' : '🎓 学生ポータル'}
                    </p>
                </div>

                <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={clsx(
                                    "flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm",
                                    isActive
                                        ? "bg-indigo-100 text-indigo-700 font-bold shadow-sm"
                                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                )}
                            >
                                <Icon className="w-4 h-4 flex-shrink-0" />
                                <span className="font-medium truncate">{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-slate-100">
                    <div className="flex items-center gap-3 px-4 py-3 mb-2">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                            <User className="w-4 h-4 text-slate-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate text-slate-900">{userName || 'User'}</p>
                            <p className="text-xs text-slate-500 truncate capitalize">{userRole}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                        ログアウト
                    </button>
                </div>
            </aside>

            {/* Mobile Header */}
            <header className="md:hidden fixed top-0 left-0 w-full z-20 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex justify-between items-center shadow-sm">
                <span className="font-bold text-lg text-slate-900">NSSU 2026 臨床実習</span>
                <button onClick={handleLogout} className="p-2 text-slate-500 hover:text-slate-900">
                    <LogOut className="w-5 h-5" />
                </button>
            </header>

            {/* Main Content */}
            <main className="relative z-10 md:ml-64 min-h-screen pt-20 md:pt-0 p-6">
                <div className="max-w-7xl mx-auto">
                    {children}
                </div>
            </main>

            {/* Mobile Bottom Nav */}
            <nav className="md:hidden fixed bottom-0 left-0 w-full z-20 bg-white border-t border-slate-200 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                <div className="flex justify-around items-center p-2">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={clsx(
                                    "flex flex-col items-center gap-1 p-2 rounded-lg transition-colors",
                                    isActive ? "text-primary" : "text-slate-400"
                                )}
                            >
                                <Icon className="w-6 h-6" />
                                <span className="text-[10px] font-medium">{item.label}</span>
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
};

export default Layout;
