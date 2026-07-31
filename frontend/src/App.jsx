import React, { useEffect, useState } from 'react';
import './index.css';
import { onAuthStateChangedListener, signOutUser } from './firebase';
import useUserRole from './hooks/useUserRole';
import { clearSheetCache } from './api/googleSheets';
import LoginOverlay from './components/LoginOverlay';
import PendingApproval from './components/PendingApproval';
import Header      from './components/Header';
import SummaryView  from './components/SummaryView';
import ScheduleView from './components/ScheduleView';
import HRView       from './components/HRView';
import ReportView   from './components/ReportView';
import UsersAdminView from './components/admin/UsersAdminView';

function getInitialUser() {
  try {
    const saved = localStorage.getItem('dashboard_user');
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    return null;
  }
}

/** Tài khoản demo/mock (đăng nhập email+mật khẩu khi chưa cấu hình Firebase thật) không
 *  đi qua Firebase Auth thật, nên bỏ qua bước duyệt tài khoản qua Supabase. */
function isMockUser(u) {
  return !!u && typeof u.uid === 'string' && u.uid.startsWith('mock-uid-');
}

function App() {
  const [user,         setUser]         = useState(getInitialUser);
  const [authLoading,  setAuthLoading]  = useState(true);
  const [activeTab,    setActiveTab]    = useState('summary');
  const [refreshKey,   setRefreshKey]   = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMsg,     setToastMsg]     = useState('');

  // Trạng thái duyệt/vai trò thật lấy từ Supabase (qua api/users/sync), chỉ áp dụng cho
  // tài khoản Firebase thật (Google hoặc email/mật khẩu thật) — mock user bỏ qua hook này.
  const { status: syncedStatus, profile, loading: roleLoading, error: roleError } = useUserRole();

  const mock = isMockUser(user);
  const cachedApproved = mock || user?.status === 'approved';

  useEffect(() => {
    const unsubscribe = onAuthStateChangedListener((u) => {
      if (u) {
        setUser((prev) => ({
          uid: u.uid,
          email: u.email,
          displayName: u.displayName || prev?.displayName,
          photoURL: u.photoURL || prev?.photoURL,
          // giữ role/status cũ đã cache để render lạc quan trong lúc chờ useUserRole xác nhận lại
          role: prev?.uid === u.uid ? prev?.role : undefined,
          status: prev?.uid === u.uid ? prev?.status : undefined,
        }));
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Khi useUserRole trả về kết quả mới nhất cho tài khoản thật, đồng bộ vào user + localStorage
  useEffect(() => {
    if (mock || !user || roleLoading) return;
    if (roleError) return;
    if (!profile) return;
    setUser((prev) => {
      if (!prev || prev.email?.toLowerCase() !== profile.email?.toLowerCase()) return prev;
      const next = {
        ...prev,
        role: profile.role,
        status: profile.status,
        displayName: profile.displayName || prev.displayName,
        photoURL: profile.photoURL || prev.photoURL,
      };
      try {
        localStorage.setItem('dashboard_user', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, roleLoading, roleError, mock]);

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

  // Tài khoản Firebase thật (Google / email thật) phải được Dev duyệt trước khi vào app.
  // Nếu chưa có trạng thái "approved" đã cache từ phiên trước, chờ useUserRole xác nhận.
  if (!mock) {
    if (!cachedApproved && roleLoading) {
      return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
          <div className="w-12 h-12 border-4 border-teal-500/30 border-t-teal-400 rounded-full animate-spin mb-3" />
          <p className="text-sm font-bold text-slate-300">Đang kiểm tra quyền truy cập...</p>
        </div>
      );
    }
    if (!roleLoading) {
      if (roleError) {
        return <PendingApproval status="error" user={user} detail={roleError} onLogout={handleLogout} />;
      }
      if (syncedStatus && syncedStatus !== 'approved') {
        return <PendingApproval status={syncedStatus} user={user} onLogout={handleLogout} />;
      }
    }
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

        {/* ── Tab 5: Quản trị tài khoản (chỉ Dev) ── */}
        {activeTab === 'admin'    && user?.role === 'Dev' && <UsersAdminView currentUserEmail={user?.email} />}
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
