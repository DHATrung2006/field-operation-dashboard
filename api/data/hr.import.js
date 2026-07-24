// /api/data/hr.import.js
// This serverless function runs on Vercel.
// It fetches the HR Google Sheet (read‑only), applies the required transformation,
// then upserts the cleaned rows into Supabase table `hr_data`.
// The function expects a valid Firebase ID token in the Authorization header,
// verifies it via the existing `/api/auth.verify` endpoint, and then uses the
// Supabase anon key (so RLS policies apply).

import { json } from '@vercel/node'; // Vercel helper for JSON responses
import fetch from 'node-fetch';
import Papa from 'papaparse';
import { createClient } from '@supabase/supabase-js';

// Environment variables (VITE_ prefix not needed on the server side)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID; // public sheet ID
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'HR';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Verify Firebase token via the internal verify endpoint */
async function verifyToken(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) throw new Error('Missing Firebase ID token');
  // Call the already‑implemented auth.verify endpoint (internal request)
  const verifyRes = await fetch(`${process.env.BACKEND_URL}/auth.verify`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!verifyRes.ok) throw new Error('Invalid Firebase token');
  const payload = await verifyRes.json();
  return payload.uid; // return uid for logging/audit if needed
}

/** Transform raw rows from the sheet */
function transformRows(rows) {
  // Assume the first row contains column headers.
  const [header, ...data] = rows;
  const headerMap = header.map((h) => h.trim().toLowerCase());

  // Desired output fields (example). Adjust as needed.
  const desiredFields = [
    'store',
    'mart',
    'project',
    'supervisor',
    'status', // Tình Trạng
    'hire_date', // Ngày Tuyển
    'target_training', // Target Đào Tạo
    'progress', // Tiến Độ
    'brand', // New column – may be empty in sheet
  ];

  const transformed = data.map((row) => {
    const record = {};
    headerMap.forEach((col, idx) => {
      const value = row[idx];
      // Map known columns to desired fields
      switch (col) {
        case 'store / mart':
        case 'store':
        case 'mart':
          record['store'] = value;
          break;
        case 'project':
          record['project'] = value;
          break;
        case 'supervisor':
          record['supervisor'] = value;
          break;
        case 'tình trạng':
        case 'status':
          record['status'] = value;
          break;
        case 'ngày tuyển':
        case 'hire date':
          record['hire_date'] = value;
          break;
        case 'target đào tạo':
        case 'target training':
          record['target_training'] = value;
          break;
        case 'tiến độ':
        case 'progress':
          record['progress'] = value;
          break;
        case 'brand':
          record['brand'] = value || null;
          break;
        default:
          // ignore unknown columns but keep them if needed
          break;
      }
    });
    // Ensure brand exists – set to '' if missing
    if (!('brand' in record)) record['brand'] = '';
    return record;
  });
  return transformed;
}

export default async function handler(req, res) {
  try {
    // Only allow POST (import) requests
    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, { status: 405 });
    }

    // Verify Firebase token (ensures only authenticated users can trigger import)
    await verifyToken(req);

    // Fetch the Google Sheet as CSV (publicly share the sheet as CSV)
    const csvUrl = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
      SHEET_NAME
    )}`;
    const response = await fetch(csvUrl);
    if (!response.ok) throw new Error('Failed to fetch Google Sheet');
    const csvText = await response.text();

    // Parse CSV into rows
    const parsed = Papa.parse(csvText, { skipEmptyLines: true });
    const rows = parsed.data;

    // Transform rows
    const transformed = transformRows(rows);

    // Upsert into Supabase (use `upsert` with primary key `store` + `project` for example)
    const { data, error } = await supabase.from('hr_data').upsert(transformed, {
      onConflict: ['store', 'project'],
    });
    if (error) throw error;

    return json({ success: true, inserted: data.length }, { status: 200 });
  } catch (err) {
    console.error('HR import error:', err);
    return json({ error: err.message }, { status: 500 });
  }
}
