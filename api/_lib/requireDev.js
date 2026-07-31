// api/_lib/requireDev.js
// Helper dùng chung cho các endpoint quản trị tài khoản (api/users/*.js):
// verify Firebase ID token, load Supabase (service role, bypass RLS) và xác nhận
// người gọi là Dev đã được duyệt.

import admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';

if (!admin.apps.length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      admin.initializeApp({ credential: admin.cert(serviceAccount) });
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT không phải JSON hợp lệ.');
    }
  } else {
    admin.initializeApp();
  }
}

export const VALID_ROLES = ['Dev', 'GD', 'PM', 'HR', 'KT', 'SUP'];
export const VALID_STATUSES = ['pending', 'approved', 'blocked'];

let supabaseAdmin = null;

/** Supabase client dùng SUPABASE_SERVICE_ROLE_KEY – bỏ qua RLS, chỉ dùng phía server. */
export function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    const url = process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      const err = new Error(
        'Server chưa cấu hình SUPABASE_SERVICE_ROLE_KEY (hoặc VITE_SUPABASE_URL). Xem GOOGLE_LOGIN_SETUP.md.'
      );
      err.status = 503;
      throw err;
    }
    supabaseAdmin = createClient(url, serviceKey, { auth: { persistSession: false } });
  }
  return supabaseAdmin;
}

/** Danh sách email được tự động cấp quyền Dev khi đăng nhập lần đầu (bootstrap). */
export function bootstrapEmails() {
  return (process.env.DEV_BOOTSTRAP_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Verify Firebase ID token từ header Authorization: Bearer <token>. */
export async function verifyRequestToken(req) {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    const err = new Error('Thiếu Authorization header');
    err.status = 401;
    throw err;
  }
  try {
    return await admin.auth().verifyIdToken(match[1]);
  } catch {
    const err = new Error('Token không hợp lệ hoặc đã hết hạn');
    err.status = 401;
    throw err;
  }
}

/**
 * Verify request đến từ một Dev đã được duyệt (hoặc nằm trong DEV_BOOTSTRAP_EMAILS).
 * Trả về { decoded, email, supabase, callerRow }. Ném lỗi có .status khi không đủ quyền.
 */
export async function requireDev(req) {
  const decoded = await verifyRequestToken(req);
  const email = (decoded.email || '').toLowerCase();
  if (!email) {
    const err = new Error('Tài khoản Firebase không có email');
    err.status = 403;
    throw err;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
  if (error) throw error;

  const isBootstrapDev = bootstrapEmails().includes(email);
  const effectiveRole = isBootstrapDev ? 'Dev' : data?.role;
  const effectiveStatus = isBootstrapDev ? 'approved' : data?.status;

  if (effectiveRole !== 'Dev' || effectiveStatus !== 'approved') {
    const err = new Error('Chỉ tài khoản Dev đã được duyệt mới có quyền thực hiện thao tác này');
    err.status = 403;
    throw err;
  }

  return { decoded, email, supabase, callerRow: data };
}
