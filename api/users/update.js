// api/users/update.js (Vercel Serverless Function)
// Duyệt / chặn / bỏ chặn / đổi vai trò một tài khoản. Chỉ Dev đã được duyệt mới gọi được.
// Body: { email: string, role?: 'Dev'|'GD'|'PM'|'HR'|'KT'|'SUP'|null, status?: 'pending'|'approved'|'blocked' }

import { requireDev, VALID_ROLES, VALID_STATUSES } from '../_lib/requireDev.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { supabase, email: callerEmail } = await requireDev(req);
    const { email, role, status } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Thiếu email' });
    const targetEmail = String(email).toLowerCase();

    if (role !== undefined && role !== null && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Vai trò không hợp lệ. Chỉ chấp nhận: ${VALID_ROLES.join(', ')}` });
    }
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Trạng thái không hợp lệ. Chỉ chấp nhận: ${VALID_STATUSES.join(', ')}` });
    }
    if (status === 'blocked' && targetEmail === callerEmail) {
      return res.status(400).json({ error: 'Không thể tự chặn chính mình' });
    }
    if (role !== undefined && role !== 'Dev' && targetEmail === callerEmail) {
      return res.status(400).json({ error: 'Không thể tự hạ quyền Dev của chính mình' });
    }

    const patch = { updated_at: new Date().toISOString() };
    if (role !== undefined) patch.role = role;
    if (status !== undefined) {
      patch.status = status;
      if (status === 'approved') {
        patch.approved_by = callerEmail;
        patch.approved_at = new Date().toISOString();
      }
    }

    const { data, error } = await supabase
      .from('users')
      .update(patch)
      .eq('email', targetEmail)
      .select('*')
      .single();
    if (error) throw error;
    return res.status(200).json({ user: data });
  } catch (e) {
    console.error('users/update error', e);
    return res.status(e.status || 500).json({ error: e.message || 'Lỗi máy chủ' });
  }
}
