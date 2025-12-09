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
        await signOut(auth);
        navigate(userRole === 'admin' ? '/admin/login' : '/student/login');
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
        <div className="min-h-screen bg-background text-white font-sans selection:bg-primary/30">
            {/* Background Gradients */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-primary/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-accent/10 rounded-full blur-[120px]" />
            </div>

            {/* Sidebar (Desktop) */}
            <aside className="fixed left-0 top-0 h-full w-64 glass-panel border-r border-white/10 z-20 hidden md:flex flex-col">
                <div className="p-6 border-b border-white/10">
                    <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
                        ClinicalTraining
                    </h1>
                    <p className="text-xs text-slate-400 mt-1">
                        {userRole === 'admin' ? '管理者ポータル' : '学生ポータル'}
                    </p>
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={clsx(
                                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                                    isActive
                                        ? "bg-primary/20 text-primary border border-primary/20 shadow-[0_0_20px_-5px_rgba(14,165,233,0.3)]"
                                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                                )}
                            >
                                <Icon className="w-5 h-5" />
                                <span className="font-medium">{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-white/10">
                    <div className="flex items-center gap-3 px-4 py-3 mb-2">
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                            <User className="w-4 h-4 text-slate-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{userName || 'User'}</p>
                            <p className="text-xs text-slate-500 truncate capitalize">{userRole}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-accent hover:bg-accent/10 rounded-lg transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                        ログアウト
                    </button>
                </div>
            </aside>

            {/* Mobile Header */}
            <header className="md:hidden fixed top-0 left-0 w-full z-20 glass-panel border-b border-white/10 px-4 py-3 flex justify-between items-center">
                <span className="font-bold text-lg">ClinicalTraining</span>
                <button onClick={handleLogout} className="p-2 text-slate-400">
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
            <nav className="md:hidden fixed bottom-0 left-0 w-full z-20 glass-panel border-t border-white/10 pb-safe">
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
                                    isActive ? "text-primary" : "text-slate-500"
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
