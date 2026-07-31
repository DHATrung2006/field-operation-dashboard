// api/users/create.js (Vercel Serverless Function)
// Thêm trước (pre-invite) một tài khoản theo email, trước khi người đó từng đăng nhập.
// Khi họ đăng nhập Google lần đầu, api/users/sync.js sẽ nhận diện email đã tồn tại và
// chỉ điền thêm uid/tên/ảnh, không ghi đè role/status đã được Dev thiết lập ở đây.
// Chỉ Dev đã được duyệt mới gọi được.

import { requireDev, VALID_ROLES, VALID_STATUSES } from '../_lib/requireDev.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    console.error('users/create error', e);
    return res.status(e.status || 500).json({ error: e.message || 'Lỗi máy chủ' });
  }
}
