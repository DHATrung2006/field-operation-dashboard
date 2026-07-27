/**
 * Real Google Apps Script API integration.
 * CORS is confirmed working — the script returns proper JSON headers.
 */

const BASE_URL =
  'https://script.google.com/macros/s/AKfycby6KkWax3dC6o7GzlQzH-z8Wdobre-QUeu6znyYDovSuFGIPHpvXTTPeRb3-0gSCQE/exec';

/**
 * Generic fetcher with timeout + error handling.
 * Google Apps Script is slow (~3-8s) so we use a 30s timeout.
 */
async function apiFetch(params = {}) {
  const qs = new URLSearchParams({ action: 'getData', ...params }).toString();
  const url = `${BASE_URL}?${qs}`;
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res  = await fetch(url, { signal: ctrl.signal });
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('API error:', e.message);
    return [];
  } finally {
    clearTimeout(tid);
  }
}

// ─── master_data: all BA schedules ────────────────────────────────────────
export async function fetchMasterData() {
  return apiFetch({ sheet: 'master_data' });
}

// ─── HR_Status: recruitment data ──────────────────────────────────────────
export async function fetchHRStatus() {
  return apiFetch({ sheet: 'HR_Status' });
}

// ─── QC sheet: weekly QC results ──────────────────────────────────────────
export async function fetchQCData() {
  return apiFetch({ sheet: 'QC' });
}

// ─── Vinda_july ───────────────────────────────────────────────────────────
export async function fetchVindaData() {
  return apiFetch({ sheet: 'Vinda_july' });
}

// ─── P&G ──────────────────────────────────────────────────────────────────
export async function fetchPGData() {
  return apiFetch({ sheet: 'P&G' });
}

/**
 * Parse "DD/MM/YYYY" → Date object
 */
export function parseDate(str) {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length !== 3) return null;
  return new Date(+parts[2], +parts[1] - 1, +parts[0]);
}

/**
 * Get ISO week number for a date string "DD/MM/YYYY"
 * Note: week 31 starts 27/07/2026 per user config.
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
 * Normalize Region label from API → display label
 * master_data uses: "HN", "HCM", "North", "South", "Central"
 */
export function normalizeRegion(r) {
  const map = {
    HN: 'HN', HCM: 'HCM',
    North: 'HN', South: 'Tỉnh', Central: 'Tỉnh',
    Tỉnh: 'Tỉnh', Miền: 'Tỉnh',
  };
  return map[r] || r || 'Tỉnh';
}

/**
 * Get unique supervisors from rows
 */
export function getSups(rows) {
  return [...new Set(rows.map(r => r['Sup']).filter(Boolean))].sort();
}

/**
 * Get unique projects from rows
 */
export function getProjects(rows) {
  return [...new Set(rows.map(r => r['Project']).filter(Boolean))].sort();
}
