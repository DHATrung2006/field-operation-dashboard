// api/users/delete.js (Vercel Serverless Function)
// Thu hồi quyền truy cập của một tài khoản (xoá row trong bảng users). Không xoá tài
// khoản Firebase Auth thật — nếu người đó đăng nhập lại, api/users/sync.js sẽ tạo lại
// một row "pending" mới. Chỉ Dev đã được duyệt mới gọi được.

import { requireDev } from '../_lib/requireDev.js';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    console.error('users/delete error', e);
    return res.status(e.status || 500).json({ error: e.message || 'Lỗi máy chủ' });
  }
}
