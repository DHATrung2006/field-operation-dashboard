// api/users/sync.js (Vercel Serverless Function)
// Gọi ngay sau khi Firebase báo có user đăng nhập (Google hoặc email/mật khẩu thật).
// Tạo row "pending" nếu email chưa từng đăng nhập, tự nâng lên Dev/approved nếu email
// nằm trong DEV_BOOTSTRAP_EMAILS, và trả về role/status hiện tại để frontend quyết định
// cho vào app hay hiển thị màn chờ duyệt / bị chặn.

import { verifyRequestToken, getSupabaseAdmin, bootstrapEmails } from '../_lib/requireDev.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const decoded = await verifyRequestToken(req);
    const email = (decoded.email || '').toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'Tài khoản Firebase không có email' });
    }

    const supabase = getSupabaseAdmin();
    const { data: existing, error: selectError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    if (selectError) throw selectError;

    const isBootstrapDev = bootstrapEmails().includes(email);
    const now = new Date().toISOString();

    if (!existing) {
      const { data: created, error: insertError } = await supabase
        .from('users')
        .insert({
          email,
          id: decoded.uid,
          display_name: decoded.name || null,
          photo_url: decoded.picture || null,
          role: isBootstrapDev ? 'Dev' : null,
          status: isBootstrapDev ? 'approved' : 'pending',
          approved_by: isBootstrapDev ? 'bootstrap' : null,
          approved_at: isBootstrapDev ? now : null,
        })
        .select('*')
        .single();
      if (insertError) throw insertError;
      return res.status(200).json(toResponse(created));
    }

    const patch = {};
    if (!existing.id && decoded.uid) patch.id = decoded.uid;
    if (decoded.name && decoded.name !== existing.display_name) patch.display_name = decoded.name;
    if (decoded.picture && decoded.picture !== existing.photo_url) patch.photo_url = decoded.picture;
    if (isBootstrapDev && (existing.role !== 'Dev' || existing.status !== 'approved')) {
      patch.role = 'Dev';
      patch.status = 'approved';
      patch.approved_by = 'bootstrap';
      patch.approved_at = now;
    }

    let finalRow = existing;
    if (Object.keys(patch).length > 0) {
      patch.updated_at = now;
      const { data: updated, error: updateError } = await supabase
        .from('users')
        .update(patch)
        .eq('email', email)
        .select('*')
        .single();
      if (updateError) throw updateError;
      finalRow = updated;
    }

    return res.status(200).json(toResponse(finalRow));
  } catch (e) {
    console.error('users/sync error', e);
    return res.status(e.status || 500).json({ error: e.message || 'Lỗi máy chủ' });
  }
}

function toResponse(row) {
  return {
    email: row.email,
    uid: row.id,
    displayName: row.display_name,
    photoURL: row.photo_url,
    role: row.role,
    status: row.status,
    region: row.region,
    project: row.project,
    department: row.department,
    brand: row.brand,
  };
}
