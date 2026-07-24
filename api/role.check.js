// api/role.check.js (Vercel Serverless Function)
// Returns the authenticated user's role and scope information.

import admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';

if (!admin.apps.length) {
  admin.initializeApp();
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Missing token' });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const { uid, email } = decoded;
    // Query users table – RLS ensures a user can only read their own row
    const { data, error } = await supabase
      .from('users')
      .select('role, region, project, store_codes, department, brand')
      .eq('id', uid)
      .single();
    if (error) throw error;
    return res.status(200).json({ uid, email, ...data });
  } catch (e) {
    console.error('role.check error', e);
    return res.status(401).json({ error: 'Invalid token' });
  }
}
