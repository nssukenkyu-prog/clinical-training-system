import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    CalendarDays,
    LogOut,
    Menu,
    X,
    User,
    ShieldCheck,
    Users,
    CheckSquare,
    Settings,
    Bell
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';

export default function Layout() {
    const location = useLocation();
    const navigate = useNavigate();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    const isAdmin = location.pathname.startsWith('/admin');
    const isStudent = location.pathname.startsWith('/student');

    // Scroll effect for header
    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            sessionStorage.clear();
            navigate(isAdmin ? '/admin/login' : '/');
        } catch (error) {
            console.error('Logout failed', error);
        }
    };

    const studentLinks = [
        { path: '/student/dashboard', icon: LayoutDashboard, label: 'ホーム' },
        { path: '/student/reservation', icon: CalendarDays, label: '予約' },
    ];

    const adminLinks = [
        { path: '/admin/dashboard', icon: LayoutDashboard, label: 'ダッシュボード' },
        { path: '/admin/students', icon: Users, label: '学生管理' },
        { path: '/admin/approval', icon: CheckSquare, label: '実績承認' },
        { path: '/admin/slots', icon: CalendarDays, label: '枠管理' },
    ];

    const links = isAdmin ? adminLinks : studentLinks;

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24 lg:pb-0">
            {/* Desktop Sidebar */}
            <aside className="hidden lg:flex fixed top-0 left-0 h-full w-72 bg-white/80 backdrop-blur-xl border-r border-slate-200/60 flex-col z-50 shadow-2xl shadow-slate-200/50">
                <div className="p-8">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                            <ShieldCheck className="w-6 h-6 text-white" />
                        </div>
                        <span className="font-bold text-xl tracking-tight text-slate-900">NSSU<br /><span className="text-sm font-medium text-slate-500">Clinical Training</span></span>
                    </div>
                </div>

                <nav className="flex-1 px-4 space-y-2">
                    {links.map((link) => {
                        const isActive = location.pathname === link.path;
                        return (
                            <Link
                                key={link.path}
                                to={link.path}
                                className={`relative flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 group ${isActive
                                    ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/20'
                                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                                    }`}
                            >
                                <link.icon className={`w-5 h-5 ${isActive ? 'text-indigo-400' : 'text-slate-400 group-hover:text-indigo-500'} transition-colors`} />
                                <span className="font-bold text-sm tracking-wide">{link.label}</span>
                                {isActive && (
                                    <div
                                        className="absolute right-4 w-1.5 h-1.5 rounded-full bg-indigo-400"
                                    />
                                )}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-slate-100">
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-all duration-300 font-medium text-sm group"
                    >
                        <LogOut className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        ログアウト
                    </button>
                </div>
            </aside>

            {/* Mobile Header */}
            <header className={`lg:hidden fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${scrolled ? 'bg-white/90 backdrop-blur-md shadow-sm py-3' : 'bg-transparent py-5'}`}>
                <div className="px-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                            <ShieldCheck className="w-5 h-5 text-white" />
                        </div>
                        <span className={`font-bold text-lg tracking-tight ${scrolled ? 'text-slate-900' : 'text-slate-900'}`}>
                            NSSU
                        </span>
                    </div>
                    <button onClick={handleLogout} className="p-2 rounded-full bg-white/50 backdrop-blur-sm border border-slate-200/50 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors">
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="lg:pl-72 min-h-screen pt-24 lg:pt-0">
                <div className="max-w-7xl mx-auto px-6 lg:px-12 lg:py-12">
                    <Outlet />
                </div>
            </main>

            {/* Mobile Bottom Navigation */}
            <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-200/60 z-50">
                <div className="flex justify-around items-center px-2 py-2">
                    {links.map((link) => {
                        const isActive = location.pathname === link.path;
                        return (
                            <Link
                                key={link.path}
                                to={link.path}
                                className="relative flex flex-col items-center justify-center w-full py-3"
                            >
                                <div className={`relative p-1.5 rounded-xl transition-all duration-300 ${isActive ? 'bg-indigo-50 -translate-y-1' : ''}`}>
                                    <link.icon className={`w-6 h-6 ${isActive ? 'text-indigo-600' : 'text-slate-400'} transition-colors duration-300`} />
                                    {isActive && (
                                        <div
                                            className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-600"
                                        />
                                    )}
                                </div>
                                <span className={`text-[10px] font-bold mt-1 ${isActive ? 'text-indigo-600' : 'text-slate-400'} transition-colors duration-300`}>
                                    {link.label}
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
}
