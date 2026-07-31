import { getIdToken } from '../firebase';

const BASE = import.meta.env.VITE_BACKEND_URL;

async function authFetch(path, options = {}) {
  const token = await getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Lỗi máy chủ (HTTP ${res.status})`);
  }
  return data;
}

/** Danh sách toàn bộ tài khoản (chỉ Dev). */
export const listUsers = () => authFetch('/users/list');

/** Đổi role và/hoặc status (approve/block/unblock) của 1 tài khoản. */
export const updateUser = (email, patch) =>
  authFetch('/users/update', { method: 'POST', body: JSON.stringify({ email, ...patch }) });

/** Thêm trước (pre-invite) 1 tài khoản theo email, trước khi họ từng đăng nhập. */
export const createUser = ({ email, role, status }) =>
  authFetch('/users/create', { method: 'POST', body: JSON.stringify({ email, role, status }) });

/** Thu hồi quyền truy cập (xoá row) của 1 tài khoản. */
export const deleteUser = (email) =>
  authFetch('/users/delete', { method: 'POST', body: JSON.stringify({ email }) });
