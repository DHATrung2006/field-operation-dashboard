import React, { useEffect, useState } from 'react';
import './index.css';
import { onAuthStateChangedListener, signOutUser } from './firebase';
import LoginOverlay from './components/LoginOverlay';
import Header      from './components/Header';
import SummaryView  from './components/SummaryView';
import ScheduleView from './components/ScheduleView';
import HRView       from './components/HRView';
import ReportView   from './components/ReportView';

function App() {
  const [user,      setUser]      = useState(null);
  const [activeTab, setActiveTab] = useState('summary');

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

  if (!user) {
    return <LoginOverlay onLoginSuccess={(u) => setUser(u)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      <Header user={user} onLogout={handleLogout} activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="flex-1 p-5 max-w-[1400px] w-full mx-auto">
        {/* ── Tab 1: Summary ── */}
        {activeTab === 'summary'  && <SummaryView />}

        {/* ── Tab 2: Lịch làm BA ── */}
        {activeTab === 'schedule' && <ScheduleView />}

        {/* ── Tab 3: HR ── */}
        {activeTab === 'hr'       && <HRView />}

        {/* ── Tab 4: Báo cáo / UFF ── */}
        {activeTab === 'report'   && <ReportView />}
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
