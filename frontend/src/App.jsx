import React, { useEffect, useState } from 'react';
import './index.css';
import { onAuthStateChangedListener, signOutUser } from './firebase';
import LoginOverlay from './components/LoginOverlay';
import Header from './components/Header';
import DailyView from './components/DailyView';
import HRDashboard from './components/HRDashboard';

function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const unsubscribe = onAuthStateChangedListener((u) => {
      if (u) setUser(u);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOutUser();
    } catch (e) {
      console.warn('Signout error:', e);
    }
    setUser(null);
  };

  if (!user) {
    return <LoginOverlay onLoginSuccess={(loggedInUser) => setUser(loggedInUser)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      <Header user={user} onLogout={handleLogout} activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2">
                <i className="fa-solid fa-chart-line text-blue-500"></i>
                Field Operation Dashboard Overview
              </h2>
              <p className="text-sm text-slate-500 mb-6">Chào mừng đến với hệ thống quản lý lịch công tác PG/BA và Tiến độ Tuyển dụng.</p>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                  <div className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-1">Tổng Siêu Thị / Store</div>
                  <div className="text-2xl font-bold text-slate-800">128</div>
                </div>
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4">
                  <div className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-1">Đã Đạt Chỉ Tiêu</div>
                  <div className="text-2xl font-bold text-slate-800">94</div>
                </div>
                <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4">
                  <div className="text-xs font-semibold text-amber-500 uppercase tracking-wider mb-1">Đang Tuyển Dụng</div>
                  <div className="text-2xl font-bold text-slate-800">18</div>
                </div>
                <div className="bg-violet-50/50 border border-violet-100 rounded-xl p-4">
                  <div className="text-xs font-semibold text-violet-500 uppercase tracking-wider mb-1">Đang Đào Tạo</div>
                  <div className="text-2xl font-bold text-slate-800">16</div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500 flex items-center justify-between">
                <span>Hệ thống tuân thủ tiêu chuẩn NPA Security, mã hóa dữ liệu & Audit Log.</span>
                <span className="font-semibold text-blue-600">Vercel Ready Deployment v1.0</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'daily' && <DailyView />}

        {activeTab === 'hr' && <HRDashboard />}
      </main>
    </div>
  );
}

export default App;
