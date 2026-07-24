import React, { useState } from 'react';
import { signIn, signOutUser, onAuthStateChangedListener } from '../firebase';

/**
 * LoginOverlay – email/password login UI with Firebase SDK & Mock fallback for preview.
 */
export default function LoginOverlay({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
        <div className="mt-4 pt-4 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-400">Gợi ý test: <code className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">admin@example.com</code></p>
        </div>
        <p className="text-center text-[10px] text-slate-300 mt-4">PG/BA Schedule Dashboard v2.0</p>
      </div>
    </div>
  );
}
