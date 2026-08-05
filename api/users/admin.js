// api/users/admin.js (Vercel Serverless Function)
// Gộp 4 endpoints quản trị tài khoản thành 1 function để tiết kiệm quota Hobby plan.
// Route theo: GET → list, POST?action=create → create, POST?action=update → update, POST?action=delete → delete
// Chỉ Dev đã được duyệt mới gọi được.

import { requireDev, VALID_ROLES, VALID_STATUSES } from '../_lib/requireDev.js';

export default async function handler(req, res) {
  const action = req.query.action;

  // ─── GET → List all users ────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const { supabase } = await requireDev(req);
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ users: data });
    } catch (e) {
      console.error('users/admin GET error', e);
      return res.status(e.status || 500).json({ error: e.message || 'Lỗi máy chủ' });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ─── POST?action=create → Create user ────────────────────────
  if (action === 'create') {
    try {
      const { supabase, email: callerEmail } = await requireDev(req);
      const { email, role, status } = req.body || {};
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({ error: 'Email không hợp lệ' });
      }
      const targetEmail = email.trim().toLowerCase();
      const finalRole = role ?? null;
      const finalStatus = status || 'approved';

      if (finalRole !== null && !VALID_ROLES.includes(finalRole)) {
        return res.status(400).json({ error: `Vai trò không hợp lệ. Chỉ chấp nhận: ${VALID_ROLES.join(', ')}` });
      }
      if (!VALID_STATUSES.includes(finalStatus)) {
        return res.status(400).json({ error: `Trạng thái không hợp lệ. Chỉ chấp nhận: ${VALID_STATUSES.join(', ')}` });
      }

      const { data: existing, error: selectError } = await supabase
        .from('users')
        .select('email')
        .eq('email', targetEmail)
        .maybeSingle();
      if (selectError) throw selectError;
      if (existing) return res.status(409).json({ error: 'Email này đã có trong danh sách' });

      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('users')
        .insert({
          email: targetEmail,
          role: finalRole,
          status: finalStatus,
          approved_by: finalStatus === 'approved' ? callerEmail : null,
          approved_at: finalStatus === 'approved' ? now : null,
        })
        .select('*')
        .single();
      if (error) throw error;
      return res.status(200).json({ user: data });
    } catch (e) {
      console.error('users/admin create error', e);
      return res.status(e.status || 500).json({ error: e.message || 'Lỗi máy chủ' });
    }
  }

  // ─── POST?action=update → Update role/status ─────────────────
  if (action === 'update') {
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
      console.error('users/admin update error', e);
      return res.status(e.status || 500).json({ error: e.message || 'Lỗi máy chủ' });
    }
  }

  // ─── POST?action=delete → Delete user ────────────────────────
  if (action === 'delete') {
    try {
      const { supabase, email: callerEmail } = await requireDev(req);
      const { email } = req.body || {};
      if (!email) return res.status(400).json({ error: 'Thiếu email' });
      const targetEmail = String(email).toLowerCase();

      if (targetEmail === callerEmail) {
        return res.status(400).json({ error: 'Không thể tự xoá chính mình' });
      }

      const { error } = await supabase.from('users').delete().eq('email', targetEmail);
      if (error) throw error;
      return res.status(200).json({ success: true });
    } catch (e) {
      console.error('users/admin delete error', e);
      return res.status(e.status || 500).json({ error: e.message || 'Lỗi máy chủ' });
    }
  }

  return res.status(400).json({ error: 'Thiếu tham số action. Dùng ?action=create|update|delete' });
}
