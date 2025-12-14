
import React from 'react';
import { RefreshCcw, AlertTriangle } from 'lucide-react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ error, errorInfo });
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
        window.location.href = '/';
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                    <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
                        <div className="flex items-center gap-3 text-rose-600 mb-6">
                            <div className="p-3 bg-rose-50 rounded-full">
                                <AlertTriangle className="w-8 h-8" />
                            </div>
                            <h1 className="text-2xl font-bold">システムエラーが発生しました</h1>
                        </div>

                        <div className="bg-slate-100 rounded-lg p-4 mb-6 text-xs font-mono text-slate-700 overflow-auto max-h-60 border border-slate-200">
                            <p className="font-bold mb-2">{this.state.error && this.state.error.toString()}</p>
                            <pre className="whitespace-pre-wrap">{this.state.errorInfo && this.state.errorInfo.componentStack}</pre>
                        </div>

                        <p className="text-slate-500 mb-8 text-sm leading-relaxed">
                            予期せぬエラーによりページの表示が中断されました。<br />
                            再読み込みを行っても解決しない場合は、管理者にお問い合わせください。
                        </p>

                        <button
                            onClick={this.handleReset}
                            className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-900/20"
                        >
                            <RefreshCcw className="w-4 h-4" />
                            <span>トップページに戻る</span>
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
