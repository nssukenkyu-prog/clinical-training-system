import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { Save, Settings, Clock, Users, AlertTriangle } from 'lucide-react';

export default function SystemSettings() {
    const [settings, setSettings] = useState({
        requiredMinutes: 1260,
        minDailyMinutes: 120,
        maxDailyMinutes: 480,
        cancellationDeadlineHours: 12,
        maxStudentsPerSlot: 5
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [docId, setDocId] = useState(null);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const settingsRef = collection(db, 'settings');
            const q = query(settingsRef, where('key', '==', 'training_config'));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const docData = querySnapshot.docs[0];
                setSettings(docData.data().value);
                setDocId(docData.id);
            }
        } catch (error) {
            console.error("Error loading settings:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);

        try {
            if (docId) {
                // Update existing
                const settingRef = doc(db, 'settings', docId);
                await updateDoc(settingRef, {
                    value: settings
                });
            } else {
                // Create new
                const docRef = await addDoc(collection(db, 'settings'), {
                    key: 'training_config',
                    value: settings
                });
                setDocId(docRef.id);
            }

            alert('設定を保存しました');
        } catch (error) {
            console.error("Error saving settings:", error);
            alert('保存に失敗しました');
        } finally {
            setSaving(false);
        }
    };

    const formatMinutesToHours = (minutes) => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours}時間${mins > 0 ? mins + '分' : ''}`;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-primary border-t-white/0 rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8 pt-10">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">システム設定</h1>
                    <p className="text-slate-500 mt-1">実習のルールや制約を設定します</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="glass-button px-6 py-3 rounded-xl flex items-center gap-2 text-primary font-bold hover:bg-slate-50 border border-slate-200 shadow-sm disabled:opacity-50"
                >
                    <Save className="w-5 h-5" />
                    {saving ? '保存中...' : '設定を保存'}
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Training Time Settings */}
                <div className="glass-panel p-8 rounded-2xl bg-white shadow-lg border-slate-100">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-900">
                        <Clock className="w-5 h-5 text-primary" />
                        実習時間設定
                    </h2>

                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                必要累積時間
                                <span className="ml-2 text-xs text-slate-500">
                                    （現在: {formatMinutesToHours(settings.requiredMinutes)}）
                                </span>
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="number"
                                    className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 w-32 focus:outline-none focus:border-primary text-slate-900 transition-colors"
                                    value={settings.requiredMinutes}
                                    onChange={e => setSettings({ ...settings, requiredMinutes: parseInt(e.target.value) || 0 })}
                                    min="0"
                                />
                                <span className="text-slate-500">分</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-2">
                                21時間 = 1260分（5時間15分 × 4日）
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    1日の最低実習時間
                                </label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="number"
                                        className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 w-full focus:outline-none focus:border-primary text-slate-900 transition-colors"
                                        value={settings.minDailyMinutes}
                                        onChange={e => setSettings({ ...settings, minDailyMinutes: parseInt(e.target.value) || 0 })}
                                        min="0"
                                    />
                                    <span className="text-slate-500">分</span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    1日の最高実習時間
                                </label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="number"
                                        className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 w-full focus:outline-none focus:border-primary text-slate-900 transition-colors"
                                        value={settings.maxDailyMinutes}
                                        onChange={e => setSettings({ ...settings, maxDailyMinutes: parseInt(e.target.value) || 0 })}
                                        min="0"
                                    />
                                    <span className="text-slate-500">分</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Booking Settings */}
                <div className="glass-panel p-8 rounded-2xl bg-white shadow-lg border-slate-100">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-900">
                        <Settings className="w-5 h-5 text-primary" />
                        予約・運用設定
                    </h2>

                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                キャンセル締切
                            </label>
                            <div className="flex items-center gap-3">
                                <span className="text-slate-500">開始</span>
                                <input
                                    type="number"
                                    className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 w-24 focus:outline-none focus:border-primary text-slate-900 transition-colors"
                                    value={settings.cancellationDeadlineHours}
                                    onChange={e => setSettings({ ...settings, cancellationDeadlineHours: parseInt(e.target.value) || 0 })}
                                    min="0"
                                />
                                <span className="text-slate-500">時間前まで</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-2">
                                この時間を過ぎると学生はシステムからキャンセルできなくなります
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                1枠あたりの最大人数
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="number"
                                    className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 w-24 focus:outline-none focus:border-primary text-slate-900 transition-colors"
                                    value={settings.maxStudentsPerSlot}
                                    onChange={e => setSettings({ ...settings, maxStudentsPerSlot: parseInt(e.target.value) || 1 })}
                                    min="1"
                                    max="20"
                                />
                                <span className="text-slate-500">名</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Help Section */}
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 flex items-start gap-3 shadow-sm">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-blue-600" />
                <div>
                    <strong className="block mb-1 font-semibold">設定の反映について</strong>
                    <ul className="text-sm opacity-90 list-disc list-inside space-y-1 text-blue-700">
                        <li>必要累積時間: 全学生の進捗計算に即座に反映されます。</li>
                        <li>1日の最低/最高時間: 実績入力時のバリデーションに使用されます。</li>
                        <li>キャンセル締切: 学生の予約確認画面に表示され、キャンセルボタンの制御に使用されます。</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
