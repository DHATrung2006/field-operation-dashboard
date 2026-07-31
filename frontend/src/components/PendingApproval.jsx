import React from 'react';

const STATUS_CONFIG = {
  pending: {
    icon: 'fa-hourglass-half',
    iconWrapClass: 'bg-amber-100 text-amber-600',
    title: 'Tài khoản đang chờ duyệt',
    message: 'Tài khoản Google của bạn đã được ghi nhận. Vui lòng chờ quản trị viên (Dev) duyệt và gán quyền truy cập.',
  },
  blocked: {
    icon: 'fa-ban',
    iconWrapClass: 'bg-red-100 text-red-600',
    title: 'Tài khoản đã bị chặn',
    message: 'Tài khoản của bạn không được phép truy cập hệ thống. Vui lòng liên hệ quản trị viên nếu đây là nhầm lẫn.',
  },
  error: {
    icon: 'fa-triangle-exclamation',
    iconWrapClass: 'bg-red-100 text-red-600',
    title: 'Không thể kiểm tra quyền truy cập',
    message: 'Có lỗi khi kết nối tới máy chủ phân quyền. Vui lòng thử đăng xuất và đăng nhập lại sau ít phút.',
  },
};

/**
 * PendingApproval – full-screen gate shown for signed-in Firebase accounts that are
 * not yet approved (pending), have been blocked, or whose approval status failed to load.
 */
export default function PendingApproval({ status = 'pending', user, detail, onLogout }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

  return (
    <div className="login-overlay">
      <div className="login-card text-center">
        <div className={`w-16 h-16 ${config.iconWrapClass} rounded-2xl flex items-center justify-center mx-auto mb-4`}>
          <i className={`fa-solid ${config.icon} text-2xl`} />
        </div>
        <h2 className="text-lg font-bold text-slate-800 mb-2">{config.title}</h2>
        <p className="text-sm text-slate-500 leading-relaxed">{config.message}</p>
        {detail && <p className="text-xs text-red-500 mt-2">{detail}</p>}

        <div className="mt-5 pt-4 border-t border-slate-100 text-xs text-slate-400">
          Đang đăng nhập với: <span className="font-semibold text-slate-600">{user?.email}</span>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="login-btn mt-5 flex items-center justify-center gap-2"
        >
          <i className="fa-solid fa-right-from-bracket" />
          <span>Đăng xuất</span>
        </button>
      </div>
    </div>
  );
}
