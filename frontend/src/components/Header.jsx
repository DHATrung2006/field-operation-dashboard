import React from 'react';

/**
 * Header component displayed after login.
 * Displays brand logo, user display name/role, tab navigation, and logout action.
 */
export default function Header({ user, onLogout, activeTab, onTabChange }) {
  const displayName = user?.displayName || user?.email || 'User';
  const role = user?.role || user?.customClaims?.role || 'PM';

  const navItems = [
    { id: 'overview', label: 'Tổng Quan', icon: 'fa-chart-line' },
    { id: 'daily', label: 'Daily Store', icon: 'fa-store' },
    { id: 'hr', label: 'Nhân Sự & Đào Tạo', icon: 'fa-users' },
  ];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        {/* Brand & Title */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <i className="fa-solid fa-chart-gantt text-sm"></i>
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800 leading-tight">Field Operation Dashboard</h1>
            <p className="text-[11px] text-slate-400 font-medium">Quản lý Lịch Công Tác PG/BA & Báo Cáo Nội Bộ</p>
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
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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

        {/* User Info & Logout */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
            <i className="fa-solid fa-user-circle text-slate-500 text-sm" />
            <span className="text-xs font-semibold text-slate-700">{displayName}</span>
            <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">{role}</span>
          </div>
          <button
            id="btn-logout"
            className="w-9 h-9 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl flex items-center justify-center transition-colors border border-red-200 cursor-pointer"
            title="Đăng xuất"
            onClick={onLogout}
          >
            <i className="fa-solid fa-right-from-bracket text-sm" />
          </button>
        </div>
      </div>
    </header>
  );
}
