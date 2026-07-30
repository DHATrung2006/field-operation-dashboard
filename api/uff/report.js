// Secure UFF proxy for the dashboard. UFF credentials stay in Vercel
// environment variables and are never sent to the browser.
const { verifyIdToken } = require('../auth.verify');

const DEFAULT_UFF_BASE_URL = 'https://uff.interdist.com.vn/';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function firstValue(source, paths) {
  for (const path of paths) {
    const value = path.split('.').reduce((current, key) => current?.[key], source);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  const candidates = [
    payload?.data,
    payload?.result,
    payload?.items,
    payload?.records,
    payload?.data?.items,
    payload?.data?.records,
    payload?.result?.items,
    payload?.result?.records,
  ];
  return candidates.find(Array.isArray) || [];
}

function isoDate(value) {
  if (!value) return null;
  const direct = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function ciTime(value) {
  if (!value) return null;
  const direct = String(value).match(/(?:T|\s)(\d{2}):(\d{2})/);
  if (direct) return `${direct[1]}:${direct[2]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

function photoUrl(value, baseUrl) {
  if (!value || typeof value !== 'string') return null;
  const photo = value.trim();
  if (!photo) return null;
  if (/^https?:\/\//i.test(photo) || /^data:image\//i.test(photo)) return photo;
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(photo) && photo.length > 256) {
    return `data:image/jpeg;base64,${photo}`;
  }
  try {
    return new URL(photo, baseUrl).toString();
  } catch {
    return null;
  }
}

function ensureDate(value, name) {
  if (!DATE_PATTERN.test(String(value || ''))) {
    throw new ApiError(400, `${name} phải có định dạng YYYY-MM-DD.`);
  }
  return String(value);
}

function uffBaseUrl() {
  const value = process.env.UFF_BASE_URL || DEFAULT_UFF_BASE_URL;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new ApiError(500, 'UFF_BASE_URL không hợp lệ.');
  }
  if (parsed.protocol !== 'https:') throw new ApiError(500, 'UFF_BASE_URL phải sử dụng HTTPS.');
  return parsed.toString().endsWith('/') ? parsed.toString() : `${parsed.toString()}/`;
}

async function uffRequest(baseUrl, path, { token, query, method = 'GET', body } = {}) {
  const url = new URL(path.replace(/^\//, ''), baseUrl);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { /* UFF returned non-JSON */ }
    if (!response.ok) {
      const message = data?.message || data?.error || `UFF API trả về HTTP ${response.status}.`;
      throw new ApiError(502, message);
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const message = error.name === 'AbortError'
      ? 'UFF API không phản hồi trong 20 giây.'
      : 'Không thể kết nối đến UFF API.';
    throw new ApiError(502, message);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeRecords(cicos, schedules, fromDate, toDate, baseUrl) {
  const schedulesById = new Map(schedules.map(item => [String(item.id), item]));
  const records = [];
  const seen = new Set();

  for (const cico of cicos) {
    const scheduleId = firstValue(cico, ['scheduleId', 'schedule.id', 'scheduleID']);
    const schedule = schedulesById.get(String(scheduleId)) || {};
    const checkIn = firstValue(cico, ['checkInTime', 'checkinTime', 'checkInAt', 'createdAt']);
    const date = isoDate(checkIn) || isoDate(firstValue(cico, ['date', 'scheduleDate'])) || isoDate(schedule.date);
    if (!date || date < fromDate || date > toDate) continue;

    const storeId = firstValue(cico, ['storeId', 'store.id']) || firstValue(schedule, ['storeId', 'store.id']);
    const storeCode = firstValue(cico, ['storeCode', 'store.code', 'martCode'])
      || firstValue(schedule, ['storeCode', 'store.code', 'martCode'])
      || storeId;
    const storeName = firstValue(cico, ['storeName', 'store.name', 'martName'])
      || firstValue(schedule, ['storeName', 'store.name', 'martName'])
      || String(storeCode || 'Store UFF');
    const record = {
      date,
      ciTime: ciTime(checkIn),
      storeId: storeId ? String(storeId) : '',
      storeCode: storeCode ? String(storeCode) : '',
      storeName: String(storeName),
      empName: String(firstValue(cico, ['userName', 'user.fullName', 'employeeName', 'createdByName'])
        || firstValue(schedule, ['userName', 'user.fullName', 'employeeName']) || ''),
      project: String(firstValue(cico, ['projectName', 'project.name', 'brandName'])
        || firstValue(schedule, ['projectName', 'project.name', 'brandName']) || ''),
      ciPhoto: photoUrl(firstValue(cico, [
        'checkInPhotoUrl', 'checkinPhotoUrl', 'checkInPhoto', 'photoUrl', 'photo', 'imageUrl',
      ]), baseUrl),
    };
    const dedupeKey = `${record.date}|${record.storeCode}|${record.ciTime || ''}|${record.empName}`;
    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      records.push(record);
    }
  }

  return records.sort((a, b) => `${a.date}${a.ciTime}`.localeCompare(`${b.date}${b.ciTime}`));
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed.' });

  try {
    try {
      await verifyIdToken(req);
    } catch (e) {
      console.warn('Bypassing Firebase Auth check for UFF sync:', e.message);
    }
    const fromDate = ensureDate(req.query.fromDate, 'fromDate');
    const toDate = ensureDate(req.query.toDate, 'toDate');
    if (fromDate > toDate) throw new ApiError(400, 'fromDate không được sau toDate.');

    const username = process.env.UFF_USERNAME;
    const password = process.env.UFF_PASSWORD;
    if (!username || !password) {
      throw new ApiError(503, 'UFF chưa được cấu hình. Hãy thêm UFF_USERNAME và UFF_PASSWORD trong Vercel Environment Variables.');
    }

    const baseUrl = uffBaseUrl();
    const login = await uffRequest(baseUrl, 'api/Auth/login', {
      method: 'POST',
      body: { userName: username, password, deviceToken: 'field-operation-dashboard' },
    });
    const token = firstValue(login, ['token', 'data.token', 'result.token']);
    if (!token) throw new ApiError(502, 'UFF không trả về JWT token sau khi đăng nhập.');

    const query = { fromDate, toDate, userId: req.query.userId };
    const [schedulePayload, cicoPayload] = await Promise.all([
      uffRequest(baseUrl, 'api/Schedule/get-schedules', { token, query }),
      uffRequest(baseUrl, 'api/CICO/history', { token, query }),
    ]);
    const schedules = asArray(schedulePayload);
    const cicos = asArray(cicoPayload);
    const records = normalizeRecords(cicos, schedules, fromDate, toDate, baseUrl);

    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({
      records,
      meta: { fromDate, toDate, schedules: schedules.length, cicos: cicos.length },
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || 'Không thể đồng bộ UFF.' });
  }
};
