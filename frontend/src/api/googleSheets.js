/**
 * High-performance Google Sheets API Client
 * Uses Google Visualization CSV Endpoint for sub-second (< 800ms) realtime fetching.
 * Fallback to Google Apps Script if direct CSV fetch is unavailable.
 */

const SPREADSHEET_ID = '1nLoOn_ErNC13sSzr5EHb8L7k2oDbrhlaSJCo9VnoDrA';
const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycby6KkWax3dC6o7GzlQzH-z8Wdobre-QUeu6znyYDovSuFGIPHpvXTTPeRb3-0gSCQE/exec';

/**
 * Fast RFC 4180 compliant CSV Parser
 */
function parseCSV(text) {
  const lines = [];
  let row = [];
  let inQuotes = false;
  let currentToken = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentToken += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentToken);
      currentToken = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      row.push(currentToken);
      currentToken = '';
      if (row.length > 0 && row.some(cell => cell.trim() !== '')) {
        lines.push(row);
      }
      row = [];
    } else {
      currentToken += char;
    }
  }
  if (currentToken !== '' || row.length > 0) {
    row.push(currentToken);
    if (row.some(cell => cell.trim() !== '')) {
      lines.push(row);
    }
  }

  if (lines.length === 0) return [];

  // Normalize header names (strip newlines, extra spaces)
  const headers = lines[0].map(h => h.replace(/[\r\n]+/g, ' ').trim());

  return lines.slice(1).map(line => {
    const obj = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = line[idx] !== undefined ? line[idx] : '';
    });
    return obj;
  });
}

/**
 * Clear all localStorage cache keys for Google Sheets
 */
export function clearSheetCache() {
  try {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('gs_cache_')) localStorage.removeItem(k);
    });
  } catch (_) {}
}

/**
 * Fetch sheet data via direct CSV endpoint with < 1s latency
 */
async function fetchSheetData(sheetName, force = false) {
  const cacheKey = `gs_cache_${sheetName}`;
  if (force) {
    try { localStorage.removeItem(cacheKey); } catch (_) {}
  }
  
  // 1. Try Direct Google Sheets CSV Endpoint (Fastest: ~400-800ms)
  try {
    const ts = Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&t=${ts}`;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 6000); // 6s timeout max

    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: force ? 'no-store' : 'no-cache',
      headers: force ? { 'Pragma': 'no-cache', 'Cache-Control': 'no-cache' } : {}
    });
    clearTimeout(tid);

    if (res.ok) {
      const csvText = await res.text();
      const rows = parseCSV(csvText);
      if (rows && rows.length > 0) {
        // Save to cache for offline/instant load
        try { localStorage.setItem(cacheKey, JSON.stringify(rows)); } catch (_) {}
        return rows;
      }
    }
  } catch (e) {
    console.warn(`Direct CSV fetch failed for [${sheetName}], falling back to Apps Script:`, e.message);
  }

  // 2. Fallback to Google Apps Script Endpoint
  try {
    const ts = Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const url = `${APPS_SCRIPT_URL}?action=getData&sheet=${encodeURIComponent(sheetName)}&t=${ts}`;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 15000);

    const res = await fetch(url, { signal: ctrl.signal, cache: force ? 'no-store' : 'no-cache' });
    clearTimeout(tid);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch (_) {}
      return data;
    }
  } catch (e) {
    console.error(`Apps Script fallback error for [${sheetName}]:`, e.message);
  }

  // 3. Fallback to LocalStorage Cache
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (_) {}

  return [];
}

// ─── master_data ──────────────────────────────────────────────────────────
export async function fetchMasterData(force = false) {
  return fetchSheetData('master_data', force);
}

// ─── HR_Status ────────────────────────────────────────────────────────────
export async function fetchHRStatus(force = false) {
  return fetchSheetData('HR_Status', force);
}

// ─── QC ───────────────────────────────────────────────────────────────────
export async function fetchQCData(force = false) {
  return fetchSheetData('QC', force);
}

// ─── Vinda_july ───────────────────────────────────────────────────────────
export async function fetchVindaData(force = false) {
  return fetchSheetData('Vinda_july', force);
}

// ─── P&G ──────────────────────────────────────────────────────────────────
export async function fetchPGData(force = false) {
  return fetchSheetData('P&G', force);
}

/**
 * Parse date strings
 */
export function parseDate(str) {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length !== 3) return null;
  return new Date(+parts[2], +parts[1] - 1, +parts[0]);
}

/**
 * Get ISO week number
 */
export function getWeek(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return 0;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

/**
 * Normalize Region label using Region, Province, and Store Name keywords
 */
export function normalizeRegion(r, prov, storeName) {
  const pStr = (prov || '').trim().toLowerCase();
  const rStr = (r || '').trim().toLowerCase();
  const sStr = (storeName || '').trim().toLowerCase();

  // 1. Check Province first (most reliable)
  if (
    pStr.includes('hcm') ||
    pStr.includes('hồ chí minh') ||
    pStr.includes('tp.hcm') ||
    pStr.includes('tphcm')
  ) {
    return 'HCM';
  }
  if (
    pStr.includes('hà nội') ||
    pStr.includes('ha noi') ||
    pStr.includes('hn')
  ) {
    return 'HN';
  }

  // 2. Check Region
  if (
    rStr === 'hcm' ||
    rStr.includes('hồ chí minh') ||
    rStr.includes('tphcm')
  ) {
    return 'HCM';
  }
  if (
    rStr === 'hn' ||
    rStr === 'north' ||
    rStr.includes('hà nội')
  ) {
    return 'HN';
  }

  // 3. Check Store Name keywords for known HCM / HN locations
  const hcmKeywords = [
    'cống quỳnh', 'rạch miễu', 'nguyễn đình chiểu', 'huỳnh tấn phát',
    'xa lộ hà nội', 'phú lâm', 'nguyễn ảnh thủ', 'lý thường kiệt',
    'quang trung', 'văn thánh', 'tân phong', 'phạm văn đồng',
    'sư vạn hạnh', 'linh trung', 'hậu giang', 'nguyễn kiệm',
    'thắng lợi', 'tuy lý vương', 'phú thọ', 'nhiêu lộc',
    'vivo city', 'lotte gò vấp', 'emart gò vấp', 'landmark', 'thảo điền'
  ];
  const hnKeywords = [
    'hà đông', 'ba đình', 'thăng long', 'times city',
    'trúc khê', 'ocean park', 'long biên', 'thủ lệ', 'liễu giai'
  ];

  if (hcmKeywords.some(k => sStr.includes(k))) return 'HCM';
  if (hnKeywords.some(k => sStr.includes(k))) return 'HN';

  const map = {
    HN: 'HN', HCM: 'HCM',
    North: 'HN', South: 'Tỉnh', Central: 'Tỉnh',
    Tỉnh: 'Tỉnh', Miền: 'Tỉnh',
  };
  return map[r] || 'Tỉnh';
}

export function getSups(rows) {
  return [...new Set(rows.map(r => r['Sup'] || r['SUP'] || r['Supervisor']).filter(Boolean))].sort();
}

export function getProjects(rows) {
  return [...new Set(rows.map(r => r['Project'] || r['Dự Án']).filter(Boolean))].sort();
}
