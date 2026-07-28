import React, { useEffect, useState } from 'react';
import './index.css';
import { onAuthStateChangedListener, signOutUser } from './firebase';
import { clearSheetCache } from './api/googleSheets';
import LoginOverlay from './components/LoginOverlay';
import Header      from './components/Header';
import SummaryView  from './components/SummaryView';
import ScheduleView from './components/ScheduleView';
import HRView       from './components/HRView';
import ReportView   from './components/ReportView';

function getInitialUser() {
  try {
    const saved = localStorage.getItem('dashboard_user');
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    return null;
  }
}

function App() {
  const [user,         setUser]         = useState(getInitialUser);
  const [authLoading,  setAuthLoading]  = useState(true);
  const [activeTab,    setActiveTab]    = useState('summary');
  const [refreshKey,   setRefreshKey]   = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMsg,     setToastMsg]     = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChangedListener((u) => {
      if (u) {
        setUser(u);
        try {
          localStorage.setItem('dashboard_user', JSON.stringify(u));
        } catch (e) {}
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLoginSuccess = (u) => {
    setUser(u);
    try {
      localStorage.setItem('dashboard_user', JSON.stringify(u));
    } catch (e) {}
  };

  const handleLogout = async () => {
    try { await signOutUser(); } catch (e) { console.warn('Signout error:', e); }
    try { localStorage.removeItem('dashboard_user'); } catch (e) {}
    setUser(null);
  };

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    clearSheetCache();
    setRefreshKey(prev => prev + 1);

    setTimeout(() => {
      setIsRefreshing(false);
      setToastMsg('✅ Đã cập nhật dữ liệu mới nhất từ Google Sheet!');
      setTimeout(() => setToastMsg(''), 4000);
    }, 800);
  };

  // Show quick spinner while Firebase auth listener initializes if no saved user in localStorage
  if (authLoading && !user) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 border-4 border-teal-500/30 border-t-teal-400 rounded-full animate-spin mb-3" />
        <p className="text-sm font-bold text-slate-300">Đang kiểm tra phiên đăng nhập...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginOverlay onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans relative">
      <Header
        user={user}
        onLogout={handleLogout}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-16 right-6 z-50 bg-emerald-700 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-xs font-bold animate-bounce">
          <i className="fa-solid fa-circle-check text-emerald-300 text-sm" />
          <span>{toastMsg}</span>
        </div>
      )}

      <main className="flex-1 p-5 max-w-[1400px] w-full mx-auto">
        {/* ── Tab 1: Summary ── */}
        {activeTab === 'summary'  && <SummaryView refreshKey={refreshKey} />}

        {/* ── Tab 2: Lịch làm BA ── */}
        {activeTab === 'schedule' && <ScheduleView refreshKey={refreshKey} />}

        {/* ── Tab 3: HR ── */}
        {activeTab === 'hr'       && <HRView refreshKey={refreshKey} />}

        {/* ── Tab 4: Báo cáo / UFF ── */}
        {activeTab === 'report'   && <ReportView refreshKey={refreshKey} />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-3 px-6 text-center text-xs text-slate-400">
        Field Operation Dashboard v2.0 &nbsp;·&nbsp; {new Date().getFullYear()} &nbsp;·&nbsp;
        <span className="text-blue-500 font-medium">Vercel Deployment</span>
      </footer>
    </div>
  );
}

export default App;
