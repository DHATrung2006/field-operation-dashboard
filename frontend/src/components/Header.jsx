import React from 'react';

/**
 * Header component displayed after login.
 * Displays brand logo, user display name/role, tab navigation, and logout action.
 */
export default function Header({ user, onLogout, activeTab, onTabChange, onRefresh, isRefreshing }) {
  const displayName = user?.displayName || user?.email || 'User';
  const role = user?.role || user?.customClaims?.role || 'PM';

  const navItems = [
    { id: 'summary',  label: 'Summary',       icon: 'fa-chart-pie' },
    { id: 'schedule', label: 'Lịch làm BA',   icon: 'fa-calendar-days' },
    { id: 'hr',       label: 'HR',             icon: 'fa-user-plus' },
    { id: 'report',   label: 'Báo cáo UFF',   icon: 'fa-camera' },
    ...(role === 'Dev' ? [{ id: 'admin', label: 'Quản trị', icon: 'fa-user-shield' }] : []),
  ];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        {/* Brand & Title */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <i className="fa-solid fa-chart-gantt text-sm"></i>
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800 leading-tight">Field Operation Dashboard</h1>
            <p className="text-[11px] text-slate-400 font-medium">Quản lý Lịch Công Tác PG/BA &amp; Báo Cáo Nội Bộ</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange && onTabChange(item.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                }`}
              >
                <i className={`fa-solid ${item.icon}`}></i>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Actions: Refresh, User Info & Logout */}
        <div className="flex items-center gap-2.5">
          {/* 🟢 NÚT REFRESH TẢI LẠI GOOGLE SHEET */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 transition-all cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
            title="Bấm để buộc làm mới và tải lại dữ liệu trực tiếp từ Google Sheets"
          >
            <i className={`fa-solid fa-arrows-rotate ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
            <span>{isRefreshing ? 'Đang làm mới...' : 'Cập Nhật Sheet'}</span>
          </button>

          <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
            <i className="fa-solid fa-user-circle text-slate-500 text-sm" />
            <span className="text-xs font-semibold text-slate-700">{displayName}</span>
            <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">{role}</span>
          </div>

          <button
            id="btn-logout"
            className="w-8 h-8 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl flex items-center justify-center transition-colors border border-red-200 cursor-pointer"
            title="Đăng xuất"
            onClick={onLogout}
          >
            <i className="fa-solid fa-right-from-bracket text-xs" />
          </button>
        </div>
      </div>
    </header>
  );
}
