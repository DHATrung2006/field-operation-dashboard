// /api/hr.get.js
// Returns HR recruitment data for the dashboard.
// Requires a valid Firebase ID token (verified via /api/auth.verify).

import { json } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Verify Firebase token using internal auth.verify endpoint */
async function verifyToken(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) throw new Error('Missing Firebase ID token');
  const verifyRes = await fetch(`${process.env.BACKEND_URL}/auth.verify`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!verifyRes.ok) throw new Error('Invalid Firebase token');
  const payload = await verifyRes.json();
  return payload.uid; // optional, can be used for audit
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return json({ error: 'Method not allowed' }, { status: 405 });
    }
    // Verify authentication
    await verifyToken(req);
    // Fetch HR data from Supabase
    const { data, error } = await supabase
      .from('hr_data')
      .select('*')
      .order('hire_date', { ascending: false });
    if (error) throw error;
    return json({ success: true, records: data }, { status: 200 });
  } catch (err) {
    console.error('HR get error:', err);
    return json({ error: err.message }, { status: 500 });
  }
}
