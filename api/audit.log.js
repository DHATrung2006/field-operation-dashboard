// api/audit.log.js (Vercel Serverless Function)
// Logs user actions for NPA compliance.

import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createClient } from '@supabase/supabase-js';

if (!getApps().length) {
  initializeApp();
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Missing token' });

  try {
    const decoded = await getAuth().verifyIdToken(token);
    const { uid } = decoded;
    const { action, details } = req.body;
    if (!action) return res.status(400).json({ error: 'Missing action' });
    const { data, error } = await supabase
      .from('audit_logs')
      .insert({ user_id: uid, action, details });
    if (error) throw error;
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('audit.log error', e);
    return res.status(401).json({ error: 'Invalid token or insert failed' });
  }
}
