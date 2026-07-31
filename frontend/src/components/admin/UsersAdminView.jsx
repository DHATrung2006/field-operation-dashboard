import React, { useEffect, useMemo, useState } from 'react';
import { listUsers, updateUser, createUser, deleteUser } from '../../api/usersAdmin';

const ROLES = ['Dev', 'GD', 'PM', 'HR', 'KT', 'SUP'];

const STATUS_LABEL = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  blocked: 'Đã chặn',
};

const STATUS_STYLE = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  blocked: 'bg-red-100 text-red-800 border-red-200',
};

const FILTERS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'pending', label: 'Chờ duyệt' },
  { id: 'approved', label: 'Đã duyệt' },
  { id: 'blocked', label: 'Đã chặn' },
];

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '—';
  }
}

function Avatar({ user }) {
  if (user.photo_url) {
    return <img src={user.photo_url} alt="" className="w-8 h-8 rounded-full object-cover border border-slate-200" />;
  }
  const initial = (user.display_name || user.email || '?').trim().charAt(0).toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xs font-bold">
      {initial}
    </div>
  );
}

/**
 * UsersAdminView – trang quản trị tài khoản dành cho Dev: duyệt, chặn/bỏ chặn, xoá,
 * thêm trước theo email, và gán vai trò (Dev/GD/PM/HR/KT/SUP) cho mọi tài khoản.
 */
export default function UsersAdminView({ currentUserEmail }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [savingEmail, setSavingEmail] = useState(null);
  const [rowError, setRowError] = useState({ email: null, message: '' });

  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ email: '', role: '', status: 'approved' });
  const [addError, setAddError] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);

  const [confirmDeleteEmail, setConfirmDeleteEmail] = useState(null);

  const load = () => {
    setLoading(true);
    setLoadError('');
    listUsers()
      .then((res) => setUsers(res.users || []))
      .catch((err) => setLoadError(err.message || 'Không tải được danh sách tài khoản'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const counts = useMemo(() => {
    const c = { all: users.length, pending: 0, approved: 0, blocked: 0 };
    users.forEach((u) => {
      if (c[u.status] !== undefined) c[u.status] += 1;
    });
    return c;
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filter !== 'all' && u.status !== filter) return false;
      if (!q) return true;
      return (u.email || '').toLowerCase().includes(q) || (u.display_name || '').toLowerCase().includes(q);
    });
  }, [users, filter, search]);

  const patchLocalUser = (email, patch) => {
    setUsers((prev) => prev.map((u) => (u.email === email ? { ...u, ...patch } : u)));
  };

  const runMutation = async (email, action) => {
    setSavingEmail(email);
    setRowError({ email: null, message: '' });
    try {
      await action();
    } catch (err) {
      setRowError({ email, message: err.message || 'Thao tác thất bại' });
    } finally {
      setSavingEmail(null);
    }
  };

  const handleApprove = (email) =>
    runMutation(email, async () => {
      const { user } = await updateUser(email, { status: 'approved' });
      patchLocalUser(email, user);
    });

  const handleBlock = (email) =>
    runMutation(email, async () => {
      const { user } = await updateUser(email, { status: 'blocked' });
      patchLocalUser(email, user);
    });

  const handleUnblock = (email) =>
    runMutation(email, async () => {
      const { user } = await updateUser(email, { status: 'approved' });
      patchLocalUser(email, user);
    });

  const handleRoleChange = (email, role) =>
    runMutation(email, async () => {
      const { user } = await updateUser(email, { role: role || null });
      patchLocalUser(email, user);
    });

  const handleDelete = (email) =>
    runMutation(email, async () => {
      await deleteUser(email);
      setUsers((prev) => prev.filter((u) => u.email !== email));
      setConfirmDeleteEmail(null);
    });

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setAddError('');
    if (!addForm.email.trim()) {
      setAddError('Vui lòng nhập email');
      return;
    }
    setAddSubmitting(true);
    try {
      const { user } = await createUser({
        email: addForm.email.trim(),
        role: addForm.role || null,
        status: addForm.status,
      });
      setUsers((prev) => [user, ...prev]);
      setShowAddModal(false);
      setAddForm({ email: '', role: '', status: 'approved' });
    } catch (err) {
      setAddError(err.message || 'Không thêm được tài khoản');
    } finally {
      setAddSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Quản trị tài khoản</h2>
          <p className="text-xs text-slate-400 mt-0.5">Duyệt, chặn, xoá và gán vai trò cho tài khoản đăng nhập bằng Google.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm cursor-pointer"
        >
          <i className="fa-solid fa-user-plus" />
          <span>Thêm tài khoản</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
              filter === f.id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {f.label} <span className="opacity-70">({counts[f.id] ?? 0})</span>
          </button>
        ))}
        <div className="relative ml-auto">
          <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-xs" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo email hoặc tên..."
            className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs w-56 outline-none focus:border-blue-400"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            <i className="fa-solid fa-circle-notch fa-spin mr-2" />
            Đang tải danh sách tài khoản...
          </div>
        ) : loadError ? (
          <div className="p-8 text-center text-red-500 text-sm">
            {loadError}
            <button onClick={load} className="ml-2 underline cursor-pointer">Thử lại</button>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">Không có tài khoản nào.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200">
                  <th className="px-4 py-2.5 font-semibold">Người dùng</th>
                  <th className="px-4 py-2.5 font-semibold">Vai trò</th>
                  <th className="px-4 py-2.5 font-semibold">Trạng thái</th>
                  <th className="px-4 py-2.5 font-semibold">Ngày tạo</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isSelf = u.email === currentUserEmail;
                  const saving = savingEmail === u.email;
                  return (
                    <tr key={u.email} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar user={u} />
                          <div>
                            <div className="font-semibold text-slate-700 text-xs flex items-center gap-1.5">
                              {u.display_name || '(Chưa có tên)'}
                              {isSelf && <span className="text-[10px] text-blue-500 font-bold">(bạn)</span>}
                            </div>
                            <div className="text-[11px] text-slate-400">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          value={u.role || ''}
                          disabled={saving || (isSelf && u.role === 'Dev')}
                          onChange={(e) => handleRoleChange(u.email, e.target.value)}
                          className="text-xs font-semibold border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <option value="">— Chưa gán —</option>
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block px-2 py-1 rounded-full text-[11px] font-bold border ${STATUS_STYLE[u.status] || ''}`}>
                          {STATUS_LABEL[u.status] || u.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-400">{formatDate(u.created_at)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {u.status === 'pending' && (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => handleApprove(u.email)}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <i className="fa-solid fa-check mr-1" />Duyệt
                            </button>
                          )}
                          {u.status === 'approved' && !isSelf && (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => handleBlock(u.email)}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <i className="fa-solid fa-ban mr-1" />Chặn
                            </button>
                          )}
                          {u.status === 'blocked' && (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => handleUnblock(u.email)}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <i className="fa-solid fa-rotate-left mr-1" />Bỏ chặn
                            </button>
                          )}
                          {!isSelf && (
                            confirmDeleteEmail === u.email ? (
                              <>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => handleDelete(u.email)}
                                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-red-600 hover:bg-red-700 text-white transition-colors cursor-pointer disabled:opacity-50"
                                >
                                  Xác nhận xoá
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteEmail(null)}
                                  className="px-2 py-1.5 rounded-lg text-[11px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
                                >
                                  Huỷ
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => setConfirmDeleteEmail(u.email)}
                                title="Xoá tài khoản"
                                className="w-7 h-7 rounded-lg text-red-500 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                <i className="fa-solid fa-trash text-xs" />
                              </button>
                            )
                          )}
                        </div>
                        {rowError.email === u.email && (
                          <div className="text-[11px] text-red-500 text-right mt-1">{rowError.message}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-base font-bold text-slate-800 mb-1">Thêm tài khoản trước</h3>
            <p className="text-xs text-slate-400 mb-4">Cấp quyền sẵn cho một email Google trước khi họ đăng nhập lần đầu.</p>
            <form onSubmit={handleAddSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">Email</label>
                <input
                  type="email"
                  required
                  value={addForm.email}
                  onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="ten@gmail.com"
                  className="login-input"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">Vai trò</label>
                <select
                  value={addForm.role}
                  onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))}
                  className="login-input"
                >
                  <option value="">— Chưa gán —</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">Trạng thái</label>
                <select
                  value={addForm.status}
                  onChange={(e) => setAddForm((f) => ({ ...f, status: e.target.value }))}
                  className="login-input"
                >
                  <option value="approved">Đã duyệt</option>
                  <option value="pending">Chờ duyệt</option>
                </select>
              </div>
              {addError && (
                <div className="text-red-500 text-xs font-medium bg-red-50 p-2 rounded-lg border border-red-100">{addError}</div>
              )}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setAddError(''); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Huỷ
                </button>
                <button type="submit" disabled={addSubmitting} className="flex-1 login-btn">
                  {addSubmitting ? 'Đang thêm...' : 'Thêm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
