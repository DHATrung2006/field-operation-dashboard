import React, { useState } from 'react';
import { signIn, signInWithGoogle, signOutUser, onAuthStateChangedListener } from '../firebase';

/**
 * LoginOverlay – email/password login UI with Firebase SDK & Mock fallback for preview,
 * plus Google sign-in. Tài khoản Google mới đăng nhập lần đầu sẽ ở trạng thái chờ Dev duyệt.
 */
export default function LoginOverlay({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await signIn(email, password);
      const user = res?.user || { email, uid: 'demo-123', displayName: email.split('@')[0] };
      if (onLoginSuccess) onLoginSuccess(user);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError('');
    try {
      const res = await signInWithGoogle();
      if (onLoginSuccess) onLoginSuccess(res.user);
    } catch (err) {
      console.error(err);
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        setError(err.message || 'Đăng nhập Google thất bại. Vui lòng thử lại.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  React.useEffect(() => {
    const unsubscribe = onAuthStateChangedListener((user) => {
      if (!user) {
        setEmail('');
        setPassword('');
      }
    });
    return () => unsubscribe();
  }, []);

  return (
    <div id="login-overlay" className="login-overlay">
      <div className="login-card">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/30">
            <i className="fa-solid fa-chart-gantt text-white text-2xl" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Field Operation Dashboard</h2>
          <p className="text-sm text-slate-400 mt-1">Đăng nhập để tiếp tục</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Tài khoản (Email)</label>
            <input
              type="text"
              id="login-user"
              className="login-input"
              placeholder="Nhập email (ví dụ: admin@example.com)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Mật khẩu</label>
            <input
              type="password"
              id="login-pass"
              className="login-input"
              placeholder="Nhập mật khẩu"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error && (
            <div id="login-error" className="text-red-500 text-xs font-medium bg-red-50 p-2.5 rounded-lg border border-red-100 flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation text-red-500"></i>
              <span>{error}</span>
            </div>
          )}
          <button type="submit" className="login-btn flex items-center justify-center gap-2" disabled={loading}>
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <i className="fa-solid fa-right-to-bracket" />
                <span>Đăng nhập</span>
              </>
            )}
          </button>
        </form>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">hoặc</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={googleLoading}
          className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {googleLoading ? (
            <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
              <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
              <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
              <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
            </svg>
          )}
          <span>{googleLoading ? 'Đang đăng nhập...' : 'Đăng nhập bằng Google'}</span>
        </button>

        <div className="mt-4 pt-4 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-400">Gợi ý test: <code className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">admin@example.com</code></p>
        </div>
        <p className="text-center text-[10px] text-slate-300 mt-4">PG/BA Schedule Dashboard v2.0</p>
      </div>
    </div>
  );
}
