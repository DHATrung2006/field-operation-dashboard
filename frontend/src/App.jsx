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

function App() {
  const [user,         setUser]         = useState(null);
  const [activeTab,    setActiveTab]    = useState('summary');
  const [refreshKey,   setRefreshKey]   = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMsg,     setToastMsg]     = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChangedListener((u) => {
      if (u) setUser(u);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try { await signOutUser(); } catch (e) { console.warn('Signout error:', e); }
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

  if (!user) {
    return <LoginOverlay onLoginSuccess={(u) => setUser(u)} />;
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
