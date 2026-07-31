// api/role.check.js (Vercel Serverless Function)
// Returns the authenticated user's role and scope information (read-only).
// Giữ lại để không phá vỡ code cũ còn gọi endpoint này; đường chính cho luồng
// đăng nhập/duyệt tài khoản mới là GET /api/users/sync (có upsert + bootstrap Dev).

import { verifyRequestToken, getSupabaseAdmin } from './_lib/requireDev.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const decoded = await verifyRequestToken(req);
    const { uid, email } = decoded;
    if (!email) return res.status(400).json({ error: 'Tài khoản Firebase không có email' });

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('users')
      .select('role, status, region, project, store_codes, department, brand')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    if (error) throw error;
    return res.status(200).json({ uid, email, ...(data || { role: null, status: 'pending' }) });
  } catch (e) {
    console.error('role.check error', e);
    return res.status(e.status || 401).json({ error: e.message || 'Invalid token' });
  }
}
