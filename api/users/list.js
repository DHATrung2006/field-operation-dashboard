// api/users/list.js (Vercel Serverless Function)
// Trả về toàn bộ danh sách tài khoản cho trang Quản trị. Chỉ Dev đã được duyệt mới gọi được.

import { requireDev } from '../_lib/requireDev.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { supabase } = await requireDev(req);
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.status(200).json({ users: data });
  } catch (e) {
    console.error('users/list error', e);
    return res.status(e.status || 500).json({ error: e.message || 'Lỗi máy chủ' });
  }
}
