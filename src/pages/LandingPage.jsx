import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Calendar, Clock, ShieldCheck } from 'lucide-react';

const LandingPage = () => {
    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 overflow-hidden relative">
            {/* Background Gradients */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-100 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-100 rounded-full blur-[120px]" />
            </div>

            {/* Navbar */}
            <nav className="relative z-10 container mx-auto px-6 py-6 flex justify-between items-center">
                <div className="text-2xl font-bold tracking-tighter text-primary">
                    ClinicalTraining
                </div>
                <div className="flex gap-4">
                    <Link to="/admin/login" className="text-sm font-medium text-slate-500 hover:text-primary transition-colors">
                        管理者ログイン
                    </Link>
                    <Link to="/student/login" className="px-6 py-2 rounded-full text-sm font-medium text-white bg-primary hover:bg-primary/90 shadow-md hover:shadow-lg transition-all">
                        学生ログイン
                    </Link>
                </div>
            </nav>

            {/* Hero Section */}
            <main className="relative z-10 container mx-auto px-6 pt-20 pb-32 flex flex-col items-center text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-200 shadow-sm mb-8 animate-fade-in-up">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-sm text-slate-600">次世代の臨床実習管理システム</span>
                </div>

                <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-8 leading-tight text-slate-900">
                    実習を、もっと<br />
                    <span className="text-primary">
                        自由でスマートに。
                    </span>
                </h1>

                <p className="text-xl text-slate-500 max-w-2xl mb-12 leading-relaxed">
                    固定日から予約制へ。自分のペースで学びを深める。<br />
                    累積時間管理で、より柔軟で効果的な実習体験を提供します。
                </p>

                <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                    <Link to="/student/login" className="group relative px-8 py-4 bg-primary hover:bg-primary/90 rounded-full font-bold text-lg text-white transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5">
                        <span className="relative z-10 flex items-center gap-2">
                            今すぐ予約する <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </span>
                    </Link>
                </div>

                {/* Features Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-32 w-full max-w-5xl">
                    <FeatureCard
                        icon={<Calendar className="w-8 h-8 text-primary" />}
                        title="自由な予約"
                        description="自分のスケジュールに合わせて、最適な実習枠を選択可能。"
                    />
                    <FeatureCard
                        icon={<Clock className="w-8 h-8 text-purple-500" />}
                        title="累積時間管理"
                        description="目標21時間に向けて、進捗をリアルタイムに可視化。"
                    />
                    <FeatureCard
                        icon={<ShieldCheck className="w-8 h-8 text-rose-500" />}
                        title="確実な実績"
                        description="システムによる正確な記録で、実習の質を保証。"
                    />
                </div>
            </main>
        </div>
    );
};

const FeatureCard = ({ icon, title, description }) => (
    <div className="bg-white p-8 rounded-2xl text-left border border-slate-100 shadow-xl shadow-slate-200/50 hover:shadow-2xl hover:shadow-slate-200/50 transition-all hover:-translate-y-1">
        <div className="mb-6 p-3 bg-slate-50 rounded-xl w-fit border border-slate-100">
            {icon}
        </div>
        <h3 className="text-xl font-bold mb-3 text-slate-900">{title}</h3>
        <p className="text-slate-500 leading-relaxed">{description}</p>
    </div>
);

export default LandingPage;
