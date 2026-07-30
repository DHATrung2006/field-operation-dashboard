import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import JSZip from 'jszip';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { fetchMasterData } from '../api/googleSheets';
import { getIdToken } from '../firebase';

/* ─── Constants ─────────────────────────────────────────────── */
const STATUS_STYLE = {
  'Đúng giờ': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Đi trễ':   'bg-amber-100  text-amber-800  border-amber-200',
  'Chưa CI':  'bg-rose-100   text-rose-800   border-rose-200',
};

// UFF zip folder prefix & store code → normalized project name for actual projects in sheet
const PREFIX_MAP = {
  PNG:'P&G', PG:'P&G', 'P&G':'P&G', BHX:'P&G', 'BÁCH HÓA XANH':'P&G', 'BACH HOA XANH':'P&G',
  MAG:'MAGGI', MGI:'MAGGI', MAGGI:'MAGGI', MGI_:'MAGGI',
  NCF:'NESTCAFE', NSF:'NESTCAFE', NSC:'NESTCAFE', NES:'NESTCAFE', NESTCAFE:'NESTCAFE', NESCAFE:'NESTCAFE',
  VDA:'VINDA', VND:'VINDA', VIN:'VINDA', VINDA:'VINDA', DRYPERS:'VINDA', TENA:'VINDA',
  STM:'STMB', STMB:'STMB', SUNTORY:'STMB', PEPSI:'STMB', SPB:'STMB',
  AEO:'AEON', AEON:'AEON', AEONMALL:'AEON', AE:'AEON',
  LOT:'LOTTE', LOTTE:'LOTTE',
  COP:'COOP', COOP:'COOP', COOPXTRA:'COOP',
  BIG:'BIG C / GO', BIGC:'BIG C / GO', GO:'BIG C / GO',
  WIN:'WINMART', WINMART:'WINMART', WM:'WINMART',
  EMA:'EMART', EMART:'EMART',
  MM:'MEGA MARKET', MEGAMARKET:'MEGA MARKET', MEGA:'MEGA MARKET',
  LCM:'LAN CHI', LANCHI:'LAN CHI',
};

const KNOWN_PROJECTS = new Set([
  'P&G', 'MAGGI', 'NESTCAFE', 'VINDA', 'STMB', 'AEON', 'LOTTE',
  'COOP', 'BIG C / GO', 'WINMART', 'EMART', 'MEGA MARKET', 'LAN CHI',
]);

/* ─── Pure Helpers ──────────────────────────────────────────── */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function pad(n) { return String(n).padStart(2,'0'); }

/** Remove Vietnamese diacritics */
function removeAccents(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/** Clean & normalize string for matching */
function cleanStoreStr(str) {
  if (!str) return '';
  return removeAccents(str)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract numbers with at least 3 digits */
function extractDigits(str) {
  const m = String(str || '').match(/\d{3,}/g);
  return m ? m.join('') : '';
}

/** Universal Project Name Normalizer */
function normalizeProjName(p) {
  if (!p) return 'Khác';
  const raw = String(p).trim().toUpperCase();
  for (const [k, v] of Object.entries(PREFIX_MAP)) {
    if (raw === k || raw.startsWith(k)) return v;
  }
  if (/NEST|NCF|NSF|NSC|NES/.test(raw)) return 'NESTCAFE';
  if (/PNG|P&G|PG|BHX/.test(raw)) return 'P&G';
  if (/MAGGI|MAG|MGI/.test(raw)) return 'MAGGI';
  if (/VINDA|VDA|VND|VIN/.test(raw)) return 'VINDA';
  if (/STMB|STM|SUNTORY/.test(raw)) return 'STMB';
  if (/AEON|AEO/.test(raw)) return 'AEON';
  if (/LOTTE|LOT/.test(raw)) return 'LOTTE';
  if (/COOP|COP/.test(raw)) return 'COOP';
  if (/BIGC|BIG|GO_/.test(raw)) return 'BIG C / GO';
  if (/WIN|WM_/.test(raw)) return 'WINMART';
  if (/EMART|EMA/.test(raw)) return 'EMART';
  if (/MEGA|MM_/.test(raw)) return 'MEGA MARKET';
  if (/LANCHI|LCM/.test(raw)) return 'LAN CHI';
  return p;
}

/** Flexible date parser into YYYY-MM-DD */
function parseVNDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  let m;
  m = s.match(/(\d+)\s+(?:tháng|thg)?\s*(\d+)[,\s]+(\d{4})/i);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  m = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/** Detect UFF project folder */
function detectProjFolder(part) {
  const m = part.match(/^([A-Za-z0-9&]+)_\d{8}(_\d{8})?$/);
  if (!m) return '';
  const raw = m[1].toUpperCase();
  return normalizeProjName(raw);
}

/** 
 * Extract time from OCR text — handles AM/PM, 12h→24h, Vietnamese SA/CH.
 * Prioritizes AM/PM patterns to avoid picking up random numbers as times.
 */
function extractTimeText(text) {
  if (!text) return null;
  let match;

  // 1. AM/PM format with lenient spacing (e.g. "01: 53: 01 P M")
  const ampmRegex = /(\d{1,2})[\s:\.]*(\d{2})(?:[\s:\.]*(\d{2}))?\s*(AM|PM|A\.M\.|P\.M\.|SA|CH|P\s*M|A\s*M)/ig;
  while ((match = ampmRegex.exec(text)) !== null) {
    let h = parseInt(match[1]);
    const min = parseInt(match[2]);
    const period = match[4].replace(/\s/g, '').toUpperCase();
    if (h < 1 || h > 12 || min > 59) continue;
    if (period.includes('PM') || period.includes('CH') || period === 'P.M.') {
      if (h !== 12) h += 12;
    } else {
      if (h === 12) h = 0;
    }
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }

  // 2. Full HH:MM:SS (24h)
  const fullTimeRegex = /(\d{1,2})[\s:\.]+(\d{2})[\s:\.]+(\d{2})/g;
  while ((match = fullTimeRegex.exec(text)) !== null) {
    const h = parseInt(match[1]);
    const min = parseInt(match[2]);
    const sec = parseInt(match[3]);
    if (h >= 0 && h <= 23 && min <= 59 && sec <= 59) {
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
  }

  // 3. HH:MM (24h) only
  const shortTimeRegex = /\b(\d{1,2})[\s:\.]+(\d{2})\b/g;
  while ((match = shortTimeRegex.exec(text)) !== null) {
    const h = parseInt(match[1]);
    const min = parseInt(match[2]);
    if (h >= 5 && h <= 22 && min <= 59) {
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
  }

  return null;
}

/** Extract time from filename patterns like CI_20260728_081523.jpg or CI_0815.jpg */
function timeFromFilename(fileName) {
  if (!fileName) return null;
  let m = fileName.match(/[_\-](\d{2})(\d{2})\d{2}[_\-.]/) || fileName.match(/(\d{2})(\d{2})\d{2}\./);
  if (m && +m[1] <= 23 && +m[2] <= 59) return `${m[1]}:${m[2]}`;
  m = fileName.match(/[_\-](\d{2})[:\-h](\d{2})/);
  if (m && +m[1] <= 23 && +m[2] <= 59) return `${m[1]}:${m[2]}`;
  m = fileName.match(/[_\-](\d{2})(\d{2})[_\-\.]/);
  if (m && +m[1] <= 23 && +m[2] <= 59) return `${m[1]}:${m[2]}`;
  return null;
}

/** A CI photo must live inside a folder named exactly "CI" (case-insensitive). */
function isCiImagePath(filePath) {
  const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.slice(0, -1).some(part => part.trim().toUpperCase() === 'CI');
}

/** 
 * Parse UFF zip path precisely:
 * Project_DateRange / Date / StoreCode_StoreName / EmpCode_EmpName / CI / filename
 */
function parseUffPath(filePath) {
  const cleanPath = filePath.replace(/\\/g, '/');
  const parts = cleanPath.split('/').filter(Boolean);
  const fileName = parts[parts.length - 1];

  let datePart  = '';
  let projLabel = '';
  let dateIdx   = -1;

  // 1. Scan folders for project & date
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!projLabel) {
      const pj = detectProjFolder(p);
      if (pj) projLabel = pj;
    }
    const dParsed = parseVNDate(p);
    if (dParsed && !datePart) {
      datePart = dParsed;
      dateIdx  = i;
    }
    const rangeMatch = p.match(/^[A-Za-z0-9&]+_(\d{8})/);
    if (rangeMatch && !datePart) {
      const ds = rangeMatch[1];
      datePart = `${ds.slice(0,4)}-${ds.slice(4,6)}-${ds.slice(6,8)}`;
    }
  }

  if (!datePart) {
    const fnDateMatch = fileName.match(/(\d{4})[_\-]?(\d{2})[_\-]?(\d{2})/);
    if (fnDateMatch) datePart = `${fnDateMatch[1]}-${fnDateMatch[2]}-${fnDateMatch[3]}`;
  }
  if (!datePart) datePart = todayISO();

  // 2. Identify Store folder vs Employee folder using dateIdx & hierarchy
  let storePart = '';
  let empPart   = '';

  if (dateIdx >= 0 && dateIdx + 1 < parts.length - 1) {
    const afterDate = parts[dateIdx + 1];
    if (!/^(CI|CO|CHECKIN|CHECKOUT)$/i.test(afterDate)) {
      storePart = afterDate;
      if (dateIdx + 2 < parts.length - 1) {
        const next = parts[dateIdx + 2];
        if (!/^(CI|CO|CHECKIN|CHECKOUT)$/i.test(next)) empPart = next;
      }
    }
  }

  if (!storePart) {
    const remaining = parts.slice(0, parts.length - 1).filter(p =>
      !/^\d{8}$/.test(p) && !detectProjFolder(p) && !parseVNDate(p) &&
      !/^[A-Za-z0-9&]+_\d{8}/.test(p) && !/\.zip$/i.test(p) && !/^(CI|CO)$/i.test(p)
    );

    if (remaining.length >= 2) {
      const p0IsEmp = /^(PGBHX|PG|BA|NV|SUP|STAFF)\d+/i.test(remaining[0]);
      if (p0IsEmp) {
        empPart   = remaining[0];
        storePart = remaining[1];
      } else {
        storePart = remaining[0];
        empPart   = remaining[1];
      }
    } else if (remaining.length === 1) {
      storePart = remaining[0];
    }
  }

  if (storePart && /^(PGBHX|PG|BA|NV|SUP|STAFF)\d+_/i.test(storePart) && empPart && !/^(PGBHX|PG|BA|NV|SUP|STAFF)\d+_/i.test(empPart)) {
    const temp = storePart;
    storePart = empPart;
    empPart = temp;
  }

  // Parse storeCode & storeName
  let storeCode = '';
  let storeName = storePart;

  if (storePart) {
    if (storePart.includes('_')) {
      const idx = storePart.indexOf('_');
      storeCode = storePart.slice(0, idx).trim();
      storeName = storePart.slice(idx + 1).replace(/_/g, ' ').trim();
    } else if (storePart.includes('-')) {
      const idx = storePart.indexOf('-');
      storeCode = storePart.slice(0, idx).trim();
      storeName = storePart.slice(idx + 1).trim();
    } else {
      const codeMatch = storePart.match(/^([A-Za-z0-9]{3,8})\s+(.*)$/);
      if (codeMatch) {
        storeCode = codeMatch[1];
        storeName = codeMatch[2];
      } else {
        storeCode = storePart;
        storeName = storePart;
      }
    }
  }

  // Parse empCode & empName
  let empCode = '';
  let empName = empPart;
  if (empPart && empPart.includes('_')) {
    const idx = empPart.indexOf('_');
    empCode = empPart.slice(0, idx).trim();
    empName = empPart.slice(idx + 1).replace(/_/g, ' ').trim();
  }

  return {
    datePart,
    projLabel: normalizeProjName(projLabel),
    storePart,
    storeCode: storeCode || storePart || 'STORE',
    storeName: storeName || storePart || 'Siêu Thị',
    empCode,
    empName,
    fileName,
  };
}

/** Robust store matcher — ALWAYS checks project compatibility first */
function isStoreMatch(sched, zip) {
  const pSched = normalizeProjName(sched.project);
  const pZip   = normalizeProjName(zip.projLabel);

  // ─── PROJECT COMPATIBILITY CHECK (must pass first) ───────────
  const schedIsKnown = KNOWN_PROJECTS.has(pSched);
  const zipIsKnown   = KNOWN_PROJECTS.has(pZip);

  // Both have recognized projects → must be the same project
  if (schedIsKnown && zipIsKnown && pSched !== pZip) return false;

  // Zip has a known project but schedule's project is unrecognized (e.g., CRV001)
  // → different project system, don't mix them
  if (zipIsKnown && !schedIsKnown && pSched !== 'Khác') return false;

  // Schedule has a known project but zip's project is unrecognized → same logic
  if (schedIsKnown && !zipIsKnown && pZip !== 'Khác') return false;

  // ─── STORE CODE MATCH ────────────────────────────────────────
  const codeS = cleanStoreStr(sched.storeCode).replace(/\s/g, '');
  const codeZ = cleanStoreStr(zip.storeCode).replace(/\s/g, '');
  if (codeS && codeZ && codeS.length >= 3 && (codeS === codeZ || codeS.includes(codeZ) || codeZ.includes(codeS))) {
    return true;
  }

  // ─── NUMERIC CODE MATCH ──────────────────────────────────────
  const numS = extractDigits(sched.storeCode + ' ' + sched.storeName);
  const numZ = extractDigits(zip.storeCode + ' ' + zip.storeName);
  if (numS && numZ && numS.length >= 3 && numZ.length >= 3 && (numS === numZ || numS.includes(numZ) || numZ.includes(numS))) {
    return true;
  }

  // ─── NAME MATCH ──────────────────────────────────────────────
  const nameS = cleanStoreStr(sched.storeName);
  const nameZ = cleanStoreStr(zip.storeName);
  if (nameS && nameZ) {
    if (nameS.includes(nameZ) || nameZ.includes(nameS)) return true;

    const wordsZ = nameZ.split(' ').filter(w => w.length > 2);
    if (wordsZ.length >= 2) {
      const matchCount = wordsZ.filter(w => nameS.includes(w)).length;
      if (matchCount / wordsZ.length >= 0.5) return true;
    }
  }

  return false;
}

/** Determine status: Đúng giờ / Đi trễ / Chưa CI */
function calcStatus(ciTime, workingTime) {
  if (!ciTime || ciTime === '—') return 'Chưa CI';
  if (!workingTime || workingTime === '—') return 'Đúng giờ';
  const sm = workingTime.match(/(\d{1,2}):(\d{2})/);
  const cm = ciTime.match(/(\d{1,2}):(\d{2})/);
  if (!sm || !cm) return 'Đúng giờ';
  const schedMins = +sm[1]*60 + +sm[2];
  const ciMins    = +cm[1]*60 + +cm[2];
  return ciMins > schedMins + 5 ? 'Đi trễ' : 'Đúng giờ';
}

/* ─── OCR via Tesseract.js ─────────────────────────────────────────────── */
let _tesseractWorker = null;

async function getOCRWorker() {
  if (!_tesseractWorker) {
    const { createWorker } = await import('tesseract.js');
    _tesseractWorker = await createWorker('eng');
    // The watermark only needs numbers, separators and AM/PM. Limiting the
    // character set substantially improves recognition against busy photos.
    await _tesseractWorker.setParameters({
      tessedit_pageseg_mode: '11', // sparse text, suitable for a watermark
      tessedit_char_whitelist: '0123456789/:.- AMPMapm',
    });
  }
  return _tesseractWorker;
}

/**
 * Make a black-on-white image containing bright, near-white pixels only.
 * UFF camera watermarks are white, so this removes most of the photo behind it.
 */
function isolateWhiteWatermark(canvas, ctx) {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
    const colourSpread = Math.max(r, g, b) - Math.min(r, g, b);
    const isWhiteText = brightness >= 168 && colourSpread <= 85;
    const value = isWhiteText ? 0 : 255;
    pixels[i] = value;
    pixels[i + 1] = value;
    pixels[i + 2] = value;
    pixels[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

function makeCropCanvas(bitmap, region, scale) {
  const width = Math.max(1, Math.round(region.width * scale));
  const height = Math.max(1, Math.round(region.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(
    bitmap,
    region.x, region.y, region.width, region.height,
    0, 0, width, height,
  );
  return { canvas, ctx };
}

/**
 * Scan every edge of the image, because UFF's watermark can appear in a
 * different corner/side. A full-image pass is kept as a fallback.
 */
async function ocrTimeFromBlob(blob) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
    const worker = await getOCRWorker();

    const maxDimension = 2200;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const w = bitmap.width;
    const h = bitmap.height;
    const edgeWidth = Math.max(1, Math.round(w * 0.48));
    const edgeHeight = Math.max(1, Math.round(h * 0.48));
    const regions = [
      { x: 0, y: 0, width: w, height: edgeHeight, label: 'top' },
      { x: 0, y: h - edgeHeight, width: w, height: edgeHeight, label: 'bottom' },
      { x: 0, y: 0, width: edgeWidth, height: h, label: 'left' },
      { x: w - edgeWidth, y: 0, width: edgeWidth, height: h, label: 'right' },
      { x: 0, y: 0, width: w, height: h, label: 'full' },
    ];

    for (const region of regions) {
      const { canvas, ctx } = makeCropCanvas(bitmap, region, scale);
      isolateWhiteWatermark(canvas, ctx);
      const { data } = await worker.recognize(canvas);
      const time = extractTimeText(data.text);
      if (time) return time;
    }

    // Some photos compress the white watermark to light grey. Retry one full
    // image in its original colours before reporting that it cannot be read.
    const { canvas } = makeCropCanvas(bitmap, { x: 0, y: 0, width: w, height: h }, scale);
    const { data } = await worker.recognize(canvas);
    return extractTimeText(data.text);
  } catch (e) {
    console.warn('OCR failed:', e.message);
    return null;
  } finally {
    bitmap?.close?.();
  }
}

/** Try each CI photo because the first one may not contain a readable clock. */
async function ocrTimeFromBlobs(blobs) {
  for (const blob of blobs) {
    const time = await ocrTimeFromBlob(blob);
    if (time) return time;
  }
  return null;
}

/** Convert the server's normalized UFF CICO response into the existing row model. */
function makeUffApiSession(records, selectedDate) {
  const storeMap = {};

  for (const item of records) {
    const date = parseVNDate(item.date || '') || selectedDate;
    const storeCode = String(item.storeCode || item.storeId || item.storeName || 'STORE').trim();
    const key = `${date}||${storeCode.toUpperCase()}`;
    if (!storeMap[key]) {
      storeMap[key] = {
        key,
        date,
        storeCode,
        storeName: item.storeName || storeCode,
        empName: item.empName || '—',
        projLabel: normalizeProjName(item.project || 'Khác'),
        ciPhotos: [],
        ciBlobs: [],
        ciTime: item.ciTime || null,
      };
    }

    const rec = storeMap[key];
    if (!rec.ciTime && item.ciTime) rec.ciTime = item.ciTime;
    if (item.ciPhoto && !rec.ciPhotos.includes(item.ciPhoto)) rec.ciPhotos.push(item.ciPhoto);
  }

  const storeEntries = Object.values(storeMap);
  const dates = [...new Set(storeEntries.map(item => item.date))].sort();
  return {
    id: `uff_api_${Date.now()}`,
    source: 'uff-api',
    fileName: `Đồng bộ API UFF · ${selectedDate}`,
    project: 'UFF API',
    storeCount: storeEntries.length,
    imageCount: storeEntries.reduce((sum, item) => sum + item.ciPhotos.length, 0),
    dates,
    storeMap,
  };
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function ReportView({ refreshKey }) {
  const [masterData, setMasterData] = useState([]);
  const [sessions, setSessions]     = useState([]);

  // Filters
  const [search,     setSearch]     = useState('');
  const [selProject, setSelProject] = useState('Tất cả');
  const [selDate,    setSelDate]    = useState(todayISO);
  const [selStatus,  setSelStatus]  = useState('');

  const [selectedRow,  setSelectedRow]  = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [previewList,  setPreviewList]  = useState([]);

  const [ocrState, setOcrState] = useState({});

  // API test
  const [apiStatus, setApiStatus] = useState('idle');
  const [apiMsg,    setApiMsg]    = useState('');

  const fileInputRef  = useRef();
  const projectRefs   = useRef({});
  const modalRef      = useRef();

  /* ── Load Master Data ── */
  useEffect(() => {
    fetchMasterData()
      .then(d => { if (Array.isArray(d)) setMasterData(d); })
      .catch(() => {});
  }, [refreshKey]);

  /* ═══════════════════════════════════════════════════════════════
     ZIP UPLOAD — supports multiple files, accumulates sessions
     ═══════════════════════════════════════════════════════════════ */
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress,     setProgress]     = useState('');

  const handleZipUpload = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setIsProcessing(true);

    const newSessions = [];

    for (const file of files) {
      setProgress(`Đang đọc: ${file.name}...`);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);

        const imagePaths = Object.keys(zip.files).filter(fp => {
          if (zip.files[fp].dir) return false;
          if (!/\.(jpg|jpeg|png|webp)$/i.test(fp)) return false;
          // Only use photos stored in a folder named exactly "CI".
          return isCiImagePath(fp);
        });

        setProgress(`${file.name}: phân tích ${imagePaths.length} ảnh...`);

        const storeMap = {}; // key: "date||storeCode"
        let detectedProject = '';

        for (let idx = 0; idx < imagePaths.length; idx++) {
          if (idx % 20 === 0) setProgress(`${file.name}: ${idx+1}/${imagePaths.length} ảnh...`);

          const fp = imagePaths[idx];
          const { datePart, projLabel, storeCode, storeName, empName, fileName } = parseUffPath(fp);

          if (projLabel) detectedProject = projLabel;

          const blob   = await zip.files[fp].async('blob');
          const imgUrl = URL.createObjectURL(blob);

          const finalProj = normalizeProjName(projLabel || detectedProject || file.name.split('_')[0]);

          const key = `${datePart}||${storeCode.toUpperCase()}`;
          if (!storeMap[key]) {
            storeMap[key] = {
              key, date: datePart, storeCode, storeName, empName,
              projLabel: finalProj,
              ciPhotos: [],
              ciBlobs:  [],
              ciTime: null,
            };
          }
          const rec = storeMap[key];
          rec.ciPhotos.push(imgUrl);
          rec.ciBlobs.push(blob);

          // Pre-extract time from filename
          if (!rec.ciTime) {
            const timeFromFn = timeFromFilename(fileName);
            if (timeFromFn) rec.ciTime = timeFromFn;
          }
        }

        // Auto OCR background scanning for stores without filename time.
        // Check every CI image for the store, not only the first one.
        const storeEntries = Object.values(storeMap);
        for (let sIdx = 0; sIdx < storeEntries.length; sIdx++) {
          const rec = storeEntries[sIdx];
          if (!rec.ciTime && rec.ciBlobs.length > 0) {
            setProgress(`${file.name}: Đang đọc giờ Check-In (${sIdx+1}/${storeEntries.length} store)...`);
            const scannedTime = await ocrTimeFromBlobs(rec.ciBlobs);
            if (scannedTime) rec.ciTime = scannedTime;
          }
        }

        const allDates = [...new Set(storeEntries.map(r => r.date))].sort();
        const projName = normalizeProjName(detectedProject || file.name.split('_')[0]);
        newSessions.push({
          id:         `${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
          fileName:   file.name,
          project:    projName,
          storeCount: storeEntries.length,
          imageCount: imagePaths.length,
          dates:      allDates,
          storeMap,
        });

      } catch (err) {
        alert(`Lỗi đọc "${file.name}": ${err.message}`);
      }
    }

    if (newSessions.length) {
      setSessions(prev => [...prev, ...newSessions]);
      const zipDates = newSessions.flatMap(s => s.dates);
      if (zipDates.length > 0) {
        const latest = zipDates.sort()[zipDates.length - 1];
        setSelDate(latest);
      }
    }

    setIsProcessing(false);
    setProgress('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  /* Remove one session */
  const removeSession = useCallback((id) => {
    setSessions(prev => {
      const sess = prev.find(s => s.id === id);
      if (sess) {
        Object.values(sess.storeMap).forEach(rec => {
          rec.ciPhotos?.forEach(url => URL.revokeObjectURL(url));
        });
      }
      return prev.filter(s => s.id !== id);
    });
    setSelectedRow(null);
  }, []);

  /* Merged zip lookup */
  const mergedZipMap = useMemo(() => {
    const m = new Map();
    for (const sess of sessions) {
      for (const [k, v] of Object.entries(sess.storeMap)) {
        if (!m.has(k)) m.set(k, { ...v, ciPhotos:[...v.ciPhotos], ciBlobs:[...v.ciBlobs] });
        else {
          const ex = m.get(k);
          ex.ciPhotos = [...ex.ciPhotos, ...v.ciPhotos];
          ex.ciBlobs  = [...ex.ciBlobs,  ...v.ciBlobs];
          if (!ex.ciTime && v.ciTime) ex.ciTime = v.ciTime;
        }
      }
    }
    return m;
  }, [sessions]);

  /* OCR trigger manually if needed */
  const triggerOCR = useCallback(async (rowId, ciBlobs) => {
    setOcrState(prev => ({ ...prev, [rowId]: 'scanning' }));
    try {
      const ciTime = ciBlobs.length ? await ocrTimeFromBlobs(ciBlobs) : null;
      setOcrState(prev => ({ ...prev, [rowId]: { ciTime: ciTime || '—' } }));
    } catch {
      setOcrState(prev => ({ ...prev, [rowId]: { ciTime: '—' } }));
    }
  }, []);

  /* SCHEDULE DATA */
  const scheduleRows = useMemo(() => {
    return masterData.map(m => {
      const isoDate = parseVNDate(m['Date'] || m['Ngày'] || '');
      if (!isoDate) return null;
      const rawProj = (m['Project'] || '').trim();
      return {
        isoDate,
        storeCode:   (m['Store Code'] || m['Mart Code'] || '').trim(),
        storeName:   (m['Store Name'] || m['Mart Name'] || '').trim(),
        project:     normalizeProjName(rawProj),
        brand:       (m['Brand'] || '').trim() || normalizeProjName(rawProj),
        workingTime: (m['Working Time'] || '').trim(),
        sup:         (m['Sup'] || m['Supervisor'] || '').trim(),
        region:      (m['Region'] || '').trim(),
      };
    }).filter(Boolean);
  }, [masterData]);

  // Dates union (Schedule + Uploaded Zips)
  const allScheduleDates = useMemo(() => {
    const s = new Set(scheduleRows.map(r => r.isoDate));
    for (const sess of sessions) {
      for (const d of sess.dates) s.add(d);
    }
    const arr = [...s].sort();
    return arr.length ? arr : [todayISO()];
  }, [scheduleRows, sessions]);

  // Auto select available date if selected date is not in list
  useEffect(() => {
    if (allScheduleDates.length > 0 && !allScheduleDates.includes(selDate)) {
      setSelDate(allScheduleDates[allScheduleDates.length - 1]);
    }
  }, [allScheduleDates]);

  // Projects union on selDate
  const projectsOnDate = useMemo(() => {
    const projs = new Set();
    scheduleRows.filter(r => r.isoDate === selDate).forEach(r => { if (r.project) projs.add(r.project); });
    for (const sess of sessions) {
      for (const v of Object.values(sess.storeMap)) {
        if (v.date === selDate && v.projLabel) projs.add(v.projLabel);
      }
    }
    return ['Tất cả', ...[...projs].sort()];
  }, [scheduleRows, sessions, selDate]);

  /* ═══════════════════════════════════════════════════════════════
     BUILD DISPLAY ROWS — Merges Schedule & Uploaded Zip Stores
     ═══════════════════════════════════════════════════════════════ */
  const displayRows = useMemo(() => {
    const schedForDate = scheduleRows.filter(r => r.isoDate === selDate);
    const zipForDate   = [];
    for (const v of mergedZipMap.values()) {
      if (v.date === selDate) zipForDate.push(v);
    }

    const mergedRows = [];
    const matchedZipKeys = new Set();

    // 1. Loop Schedule entries and match with Zip
    schedForDate.forEach((sched, i) => {
      let zip = null;
      for (const z of zipForDate) {
        if (matchedZipKeys.has(z.key)) continue;
        if (isStoreMatch(sched, z)) {
          zip = z;
          break;
        }
      }

      if (zip) matchedZipKeys.add(zip.key);

      const rowId  = `sched_${sched.isoDate}_${sched.storeCode}_${i}`;
      const ocr    = ocrState[rowId];
      const ciTime = (ocr && ocr !== 'scanning') ? ocr.ciTime : (zip?.ciTime || (zip ? '—' : null));
      const status = zip
        ? calcStatus(ciTime, sched.workingTime)
        : 'Chưa CI';

      // Use zip's known project when schedule project is unrecognized (e.g., raw code like CRV001)
      const schedProjKnown = KNOWN_PROJECTS.has(normalizeProjName(sched.project));
      const bestProject = schedProjKnown
        ? normalizeProjName(sched.project)
        : (zip ? normalizeProjName(zip.projLabel) : normalizeProjName(sched.project));

      mergedRows.push({
        id:          rowId,
        date:        sched.isoDate,
        project:     bestProject,
        brand:       sched.brand || zip?.projLabel || '—',
        storeCode:   sched.storeCode || zip?.storeCode,
        storeName:   sched.storeName || zip?.storeName,
        empName:     zip?.empName || '—',
        workingTime: sched.workingTime || '—',
        sup:         sched.sup || '—',
        region:      sched.region || '—',
        ciTime:      ciTime || '—',
        status,
        ciPhotos:    zip?.ciPhotos || [],
        ciPhoto:     zip?.ciPhotos?.[0] || null,
        ciBlobs:     zip?.ciBlobs || [],
        hasZip:      !!zip,
        ocrDone:     !!(ocr && ocr !== 'scanning'),
        ocrScanning: ocr === 'scanning',
      });
    });

    // 2. Loop unmatched Zip entries
    zipForDate.forEach((zip, i) => {
      if (matchedZipKeys.has(zip.key)) return;

      const normP  = normalizeProjName(zip.projLabel);
      const rowId  = `zip_${zip.date}_${zip.storeCode}_${i}`;
      const ocr    = ocrState[rowId];
      const ciTime = (ocr && ocr !== 'scanning') ? ocr.ciTime : (zip.ciTime || '—');
      const status = calcStatus(ciTime, null);

      mergedRows.push({
        id:          rowId,
        date:        zip.date,
        project:     normP,
        brand:       normP,
        storeCode:   zip.storeCode,
        storeName:   zip.storeName,
        empName:     zip.empName || '—',
        workingTime: '—',
        sup:         '—',
        region:      '—',
        ciTime,
        status,
        ciPhotos:    zip.ciPhotos || [],
        ciPhoto:     zip.ciPhotos?.[0] || null,
        ciBlobs:     zip.ciBlobs || [],
        hasZip:      true,
        ocrDone:     !!(ocr && ocr !== 'scanning'),
        ocrScanning: ocr === 'scanning',
      });
    });

    // Filters
    let filtered = mergedRows;
    if (selProject && selProject !== 'Tất cả') {
      const normSelP = normalizeProjName(selProject);
      filtered = filtered.filter(r => r.project === normSelP || r.brand === normSelP);
    }
    if (selStatus)
      filtered = filtered.filter(r => r.status === selStatus);
    if (search.trim()) {
      const q = cleanStoreStr(search);
      filtered = filtered.filter(r =>
        cleanStoreStr(r.storeName).includes(q) || cleanStoreStr(r.storeCode).includes(q) ||
        cleanStoreStr(r.sup).includes(q) || cleanStoreStr(r.project).includes(q) ||
        cleanStoreStr(r.empName).includes(q)
      );
    }

    const ord = { 'Chưa CI': 0, 'Đi trễ': 1, 'Đúng giờ': 2 };
    filtered.sort((a,b) =>
      a.project.localeCompare(b.project) || (ord[a.status]??9)-(ord[b.status]??9)
    );
    return filtered;
  }, [scheduleRows, mergedZipMap, selDate, selProject, selStatus, search, ocrState]);

  // Group BY PROJECT ONLY
  const groupedRows = useMemo(() => {
    const m = new Map();
    for (const r of displayRows) {
      const k = normalizeProjName(r.project);
      if (!m.has(k)) m.set(k, { project: k, brand: r.brand, rows: [] });
      const grp = m.get(k);
      if (r.brand && r.brand !== '—' && r.brand !== k) grp.brand = r.brand;
      grp.rows.push(r);
    }
    return [...m.values()];
  }, [displayRows]);

  /* ── KPIs ── */
  const totalScheduled = displayRows.length;
  const onTimeCount    = displayRows.filter(r => r.status === 'Đúng giờ').length;
  const lateCount      = displayRows.filter(r => r.status === 'Đi trễ').length;
  const missingCount   = displayRows.filter(r => r.status === 'Chưa CI').length;

  /* ── Handle row click → auto-trigger OCR ── */
  const handleRowClick = useCallback((row) => {
    setSelectedRow(prev => prev?.id === row.id ? null : row);
    if (row.hasZip && (!row.ciTime || row.ciTime === '—') && !row.ocrScanning) {
      triggerOCR(row.id, row.ciBlobs);
    }
  }, [triggerOCR]);

  /* ── PDF Export ── */
  const exportAllPDF = async () => {
    const pdf = new jsPDF('l','mm','a3');
    let first = true;
    for (const grp of groupedRows) {
      const el = projectRefs.current[grp.project];
      if (!el) continue;
      const canvas = await html2canvas(el, { scale: 2, useCORS: true });
      if (!first) pdf.addPage();
      const w = pdf.internal.pageSize.getWidth();
      pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,w,(canvas.height*w)/canvas.width);
      first = false;
    }
    pdf.save(`BaoCao_UFF_${selDate}.pdf`);
  };

  const exportStorePDF = async () => {
    if (!selectedRow) return alert('Chọn một dòng store trước.');
    if (!modalRef.current) return;
    const canvas = await html2canvas(modalRef.current, { scale: 2, useCORS: true });
    const pdf = new jsPDF('p','mm','a4');
    const w = pdf.internal.pageSize.getWidth();
    pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,w,(canvas.height*w)/canvas.width);
    pdf.save(`Store_${selectedRow.storeCode}_${selectedRow.date}.pdf`);
  };

  /* ── UFF API sync ── */
  const handleSyncUFF = async () => {
    setApiStatus('connecting');
    setApiMsg(`Đang lấy check-in UFF ngày ${selDate}...`);
    try {
      const idToken = await getIdToken();
      if (!idToken) {
        throw new Error('Bạn cần đăng nhập Firebase hợp lệ để đồng bộ dữ liệu UFF.');
      }

      const params = new URLSearchParams({ fromDate: selDate, toDate: selDate });
      const res = await fetch(`/api/uff/report?${params}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || body.error || `UFF API trả về HTTP ${res.status}.`);
      }

      const session = makeUffApiSession(Array.isArray(body.records) ? body.records : [], selDate);
      setSessions(prev => body.records?.length
        ? [...prev.filter(item => item.source !== 'uff-api'), session]
        : prev.filter(item => item.source !== 'uff-api')
      );
      setSelectedRow(null);
      setApiStatus('connected');
      setApiMsg(body.records?.length
        ? `✅ Đã đồng bộ ${body.records.length} lượt check-in từ UFF.`
        : '⚠️ UFF không trả về lượt check-in nào cho ngày đã chọn.');
    } catch (err) {
      setApiStatus('error');
      setApiMsg(`⚠️ ${err.message || 'Không thể đồng bộ UFF.'}`);
    }
  };

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */
  const totalZipSessions = sessions.length;
  const totalZipStores   = sessions.reduce((s, sess) => s + sess.storeCount, 0);

  return (
    <div className="space-y-5">

      {/* ── TITLE ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white flex items-center justify-center text-sm shadow-md">
              <i className="fa-solid fa-camera" />
            </div>
            Báo cáo UFF — Đối Soát Check-In BA
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Đồng bộ giờ check-in qua UFF API hoặc upload Zip ảnh CI để OCR → đối soát với Lịch Master.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportStorePDF}
            className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all cursor-pointer">
            <i className="fa-solid fa-file-invoice" /> Báo Cáo Store
          </button>
          <button onClick={exportAllPDF}
            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all cursor-pointer">
            <i className="fa-solid fa-file-pdf" /> Xuất PDF Tất Cả
          </button>
        </div>
      </div>

      {/* ── UPLOAD ZONE ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* LEFT: Zip Upload Panel */}
        <div className="lg:col-span-2 bg-gradient-to-br from-teal-900 to-slate-900 text-white p-5 rounded-2xl shadow-lg border border-teal-800/30 space-y-4">
          
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-teal-300 font-bold text-sm uppercase tracking-wider">
              <i className="fa-solid fa-file-zipper" /> Tải File Zip Ảnh UFF
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              {totalZipSessions > 0 && (
                <span className="bg-teal-500/20 border border-teal-500/30 text-teal-300 px-2.5 py-1 rounded-full font-bold">
                  {totalZipSessions} dự án · {totalZipStores} store
                </span>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Mỗi dự án xuất <strong className="text-teal-200">một file Zip riêng</strong> từ web UFF → upload từng file. Hệ thống chỉ lấy ảnh trong thư mục <code className="text-teal-300">CI</code> và tự tích lũy dữ liệu.
            <br/>Cấu trúc: <code className="text-teal-300 text-[10px]">Project_DateRange / Date / StoreCode_StoreName / EmpCode_EmpName / CI / xxx.jpg</code>
          </p>

          {/* Drop zone */}
          <label className={`border-2 border-dashed ${isProcessing ? 'border-teal-400 bg-teal-950/50' : 'border-teal-600/40 hover:border-teal-400 bg-teal-950/20 hover:bg-teal-950/40'} rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer transition-all`}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              multiple
              onChange={handleZipUpload}
              disabled={isProcessing}
              className="hidden"
            />
            {isProcessing ? (
              <div className="flex flex-col items-center gap-2 py-1">
                <i className="fa-solid fa-circle-notch animate-spin text-teal-400 text-2xl" />
                <span className="text-teal-200 text-xs font-bold">{progress}</span>
              </div>
            ) : (
              <div className="text-center py-1">
                <i className="fa-solid fa-cloud-arrow-up text-3xl text-teal-400 mb-2" />
                <div className="text-xs font-bold text-slate-200">Nhấn để chọn hoặc kéo thả file Zip vào đây</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Có thể chọn nhiều file cùng lúc · Chỉ đọc ảnh trong CI · OCR tự động giờ trên ảnh</div>
              </div>
            )}
          </label>

          {/* Loaded Sessions List */}
          {sessions.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] text-teal-400 font-bold uppercase tracking-wider">📁 Dữ Liệu Đã Nạp:</div>
              {sessions.map(sess => (
                <div key={sess.id}
                  className="flex items-center justify-between gap-3 bg-teal-800/30 border border-teal-700/30 rounded-xl px-4 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="shrink-0 bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wide">
                      {sess.project}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[11px] text-slate-200 font-bold truncate">{sess.fileName}</div>
                      <div className="text-[10px] text-slate-500">
                        {sess.storeCount} store · {sess.source === 'uff-api' ? 'đồng bộ từ API' : `${sess.imageCount} ảnh`} · {sess.dates.length} ngày ({sess.dates[0]} → {sess.dates[sess.dates.length-1]})
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => removeSession(sess.id)}
                    className="shrink-0 w-7 h-7 rounded-full bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 flex items-center justify-center cursor-pointer transition-colors text-xs"
                    title="Xóa file này">
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: API + OCR Info */}
        <div className="flex flex-col gap-4">
          {/* API Connector */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col gap-3">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
              <i className="fa-solid fa-server text-blue-600" /> Đồng Bộ UFF API
            </div>
            <div className="text-xs bg-slate-50 rounded-xl border border-slate-100 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
                <span className="text-[10px] text-blue-700">Lấy giờ CI trực tiếp theo ngày đang chọn</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-[10px] text-slate-600">Tài khoản UFF được lưu an toàn ở Vercel, không hiển thị trên trình duyệt</span>
              </div>
            </div>
            <button onClick={handleSyncUFF} disabled={apiStatus==='connecting'}
              className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50">
              <i className={`fa-solid ${apiStatus==='connecting'?'fa-spinner animate-spin':'fa-plug'}`} />
              {apiStatus==='connecting' ? 'Đang đồng bộ...' : `Đồng Bộ Ngày ${selDate}`}
            </button>
            {apiMsg && (
              <div className={`text-[11px] p-2.5 rounded-xl font-medium ${apiStatus==='connected'?'bg-emerald-50 text-emerald-700 border border-emerald-200':'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                {apiMsg}
              </div>
            )}
          </div>

          {/* OCR Info box */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-indigo-800 font-bold text-xs">
              <i className="fa-solid fa-eye text-indigo-600" /> Đọc Giờ Từ Ảnh (OCR Toàn Ảnh)
            </div>
            <p className="text-[11px] text-indigo-700 leading-relaxed">
              Hệ thống quét các cạnh trên/dưới/trái/phải, ưu tiên watermark <strong>chữ trắng</strong>, hỗ trợ ngày giờ AM/PM ở mọi góc ảnh.
              <br/>Nếu ảnh đầu chưa đọc được, hệ thống tự quét các ảnh CI còn lại của store.
            </p>
            <div className="text-[10px] text-indigo-500 bg-indigo-100 rounded-lg px-2.5 py-1.5">
              💡 Tự động khớp store code & gộp vào lịch làm việc.
            </div>
          </div>
        </div>
      </div>

      {/* ── KPIs (4 boxes) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon:'fa-store',                label:'Tổng Store (Lịch Hôm Nay)', value:totalScheduled, color:'blue',    tooltip:`${totalScheduled} store hiển thị ngày ${selDate}` },
          { icon:'fa-circle-check',         label:'Check-In Đúng Giờ',         value:onTimeCount,    color:'emerald' },
          { icon:'fa-clock',                label:'Check-In Đi Trễ',           value:lateCount,      color:'amber'   },
          { icon:'fa-triangle-exclamation', label:'Chưa CI / Vắng Mặt',        value:missingCount,   color:'rose'    },
        ].map(({ icon, label, value, color, tooltip }) => (
          <div key={label} title={tooltip||''}
            className={`border rounded-2xl p-4 shadow-xs ${{
              blue:'bg-blue-50 border-blue-200 text-blue-800',
              emerald:'bg-emerald-50 border-emerald-200 text-emerald-800',
              amber:'bg-amber-50 border-amber-200 text-amber-800',
              rose:'bg-rose-50 border-rose-200 text-rose-800',
            }[color]}`}>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-1.5 opacity-70">
              <i className={`fa-solid ${icon}`} /> {label}
            </div>
            <div className="text-2xl font-extrabold">{value}</div>
          </div>
        ))}
      </div>

      {/* ── FILTER BAR ── */}
      <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3.5 shadow-xs flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">🔍 Tìm kiếm</label>
          <input type="text" value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Store, BA, SUP, dự án..."
            className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white text-slate-700 outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-400 w-48 font-medium" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Dự Án</label>
          <select value={selProject} onChange={e=>setSelProject(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white text-slate-700 font-bold outline-none cursor-pointer">
            {projectsOnDate.map(p=><option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Ngày</label>
          <select value={selDate} onChange={e=>setSelDate(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white text-slate-700 font-medium outline-none cursor-pointer">
            {allScheduleDates.map(d=>(
              <option key={d} value={d}>{d}{d===todayISO()?' (Hôm nay)':''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Trạng Thái</label>
          <select value={selStatus} onChange={e=>setSelStatus(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white text-slate-700 font-medium outline-none cursor-pointer">
            <option value="">Tất cả</option>
            <option value="Đúng giờ">✅ Đúng giờ</option>
            <option value="Đi trễ">⚠️ Đi trễ</option>
            <option value="Chưa CI">🔴 Chưa CI / Vắng</option>
          </select>
        </div>
        <div className="ml-auto self-end text-xs text-slate-400 pb-2">
          {selectedRow
            ? <span className="text-teal-700 font-bold">✓ {selectedRow.storeName}</span>
            : <span>{displayRows.length} dòng · Click chọn store để xem ảnh CI</span>}
        </div>
      </div>

      {/* ── TABLE GROUPED BY PROJECT ── */}
      {groupedRows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 shadow-xs">
          <i className="fa-solid fa-inbox text-4xl text-slate-200 mb-3 block" />
          <div className="font-bold text-sm">Không có dữ liệu cho ngày {selDate}.</div>
          <div className="text-xs mt-1">Hãy chọn ngày khác ở bộ lọc phía trên hoặc upload file Zip.</div>
        </div>
      ) : (
        <div className="space-y-5">
          {groupedRows.map(grp => {
            const gk = grp.project;
            const cnt = { on: grp.rows.filter(r=>r.status==='Đúng giờ').length, late: grp.rows.filter(r=>r.status==='Đi trễ').length, miss: grp.rows.filter(r=>r.status==='Chưa CI').length };
            return (
              <div key={gk} ref={el=>{ projectRefs.current[gk]=el; }}
                className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
                {/* Section header */}
                <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-3 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                      <i className="fa-solid fa-tag text-white text-xs" />
                    </div>
                    <div>
                      <div className="text-white font-extrabold text-sm">{grp.project}</div>
                      <div className="text-slate-400 text-[11px]">Brand: {grp.brand || grp.project}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-bold flex-wrap">
                    <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-full">✅ {cnt.on}</span>
                    <span className="bg-amber-500/20  text-amber-300  border border-amber-500/30  px-2.5 py-1 rounded-full">⚠️ {cnt.late}</span>
                    <span className="bg-rose-500/20   text-rose-300   border border-rose-500/30   px-2.5 py-1 rounded-full">🔴 {cnt.miss}</span>
                    <span className="bg-white/10 text-slate-300 border border-white/20 px-2.5 py-1 rounded-full">{grp.rows.length} store</span>
                  </div>
                </div>
                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs min-w-[900px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-left">
                        {['Ngày','Store Code','Tên Store / Siêu Thị','Nhân Viên (BA)','Ca Làm (Lịch)','SUP','Ảnh CI','Giờ CI','Trạng Thái'].map(h=>(
                          <th key={h} className="px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap border-b border-slate-200">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {grp.rows.map((r, i) => {
                        const isSel = selectedRow?.id === r.id;
                        return (
                          <tr key={r.id} onClick={()=>handleRowClick(r)}
                            className={`cursor-pointer transition-all ${
                              isSel ? 'bg-teal-50 ring-1 ring-inset ring-teal-400'
                              : r.status==='Chưa CI' ? 'bg-rose-50/40 hover:bg-rose-50'
                              : r.status==='Đi trễ'  ? 'bg-amber-50/40 hover:bg-amber-50'
                              : i%2===0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/30 hover:bg-slate-50'
                            }`}>
                            <td className="px-3.5 py-3 font-mono text-slate-500 text-[11px] whitespace-nowrap">{r.date}</td>
                            <td className="px-3.5 py-3 font-mono font-bold text-slate-600 text-[11px]">{r.storeCode}</td>
                            <td className="px-3.5 py-3 font-bold text-slate-800 whitespace-nowrap">{r.storeName}</td>
                            <td className="px-3.5 py-3 text-slate-600 whitespace-nowrap text-[11px]">{r.empName || '—'}</td>
                            <td className="px-3.5 py-3 text-slate-600 whitespace-nowrap text-[11px]">{r.workingTime||'—'}</td>
                            <td className="px-3.5 py-3 text-slate-600 whitespace-nowrap text-[11px]">{r.sup||'—'}</td>
                            <td className="px-3.5 py-3">
                              {r.ciPhoto ? (
                                <div className="relative w-10 h-10"
                                  onClick={e=>{ e.stopPropagation(); setPreviewList(r.ciPhotos); setPreviewImage(r.ciPhoto); }}>
                                  <img src={r.ciPhoto} alt="CI"
                                    className="w-10 h-10 rounded-lg object-cover border-2 border-emerald-300 cursor-zoom-in hover:opacity-80 transition-all" />
                                  {r.ciPhotos.length>1 && (
                                    <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[8px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center">
                                      {r.ciPhotos.length}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center">
                                  <i className="fa-solid fa-camera-slash text-slate-300 text-[10px]" />
                                </div>
                              )}
                            </td>
                            {/* CI Time — shows spinner while OCR running */}
                            <td className="px-3.5 py-3 font-mono font-bold text-[11px]">
                              {r.ocrScanning ? (
                                <span className="flex items-center gap-1 text-indigo-500">
                                  <i className="fa-solid fa-circle-notch animate-spin text-[10px]" /> quét...
                                </span>
                              ) : (
                                <span className={r.status==='Đi trễ'?'text-amber-700':r.status==='Chưa CI'?'text-rose-500':'text-emerald-700'}>
                                  {r.ciTime || '—'}
                                </span>
                              )}
                            </td>
                            <td className="px-3.5 py-3 whitespace-nowrap">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${STATUS_STYLE[r.status]||''}`}>
                                {r.status==='Đúng giờ'?'✅ Đúng giờ':r.status==='Đi trễ'?'⚠️ Đi trễ':'🔴 Chưa CI'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── STORE DETAIL PANEL ── */}
      {selectedRow && (
        <div ref={modalRef} className="bg-white border-2 border-teal-400 rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-teal-700 to-cyan-700 px-6 py-4 flex items-center justify-between text-white">
            <div>
              <h3 className="font-extrabold text-base flex items-center gap-2">
                <i className="fa-solid fa-store" /> {selectedRow.storeName}
              </h3>
              <p className="text-xs text-teal-100 mt-0.5">
                {selectedRow.date} · {selectedRow.project} · Brand: {selectedRow.brand} · Mã Store: {selectedRow.storeCode}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {selectedRow.hasZip && (!selectedRow.ciTime || selectedRow.ciTime === '—') && !selectedRow.ocrScanning && (
                <button
                  onClick={() => triggerOCR(selectedRow.id, selectedRow.ciBlobs)}
                  className="text-[11px] bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-colors flex items-center gap-1.5">
                  <i className="fa-solid fa-eye" /> Quét Giờ OCR
                </button>
              )}
              {selectedRow.ocrScanning && (
                <span className="text-[11px] bg-indigo-500/30 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                  <i className="fa-solid fa-circle-notch animate-spin" /> Đang quét giờ...
                </span>
              )}
              <button onClick={()=>setSelectedRow(null)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center cursor-pointer transition-colors">
                <i className="fa-solid fa-xmark text-sm" />
              </button>
            </div>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Info */}
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
              <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 pb-2 mb-3">Thông Tin Phân Công</h4>
              {[
                ['Dự Án', selectedRow.project],
                ['Brand', selectedRow.brand],
                ['Tên Siêu Thị', selectedRow.storeName],
                ['Mã Siêu Thị', selectedRow.storeCode],
                ['Nhân Viên (BA)', selectedRow.empName],
                ['Ca Làm Việc', selectedRow.workingTime],
                ['Supervisor', selectedRow.sup],
                ['Giờ Check-In', selectedRow.ocrScanning ? '🔍 đang quét...' : selectedRow.ciTime],
                ['Số ảnh CI', selectedRow.ciPhotos.length],
              ].map(([lbl, val]) => (
                <div key={lbl} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 last:border-0">
                  <span className="text-slate-500 font-medium">{lbl}</span>
                  <span className={`font-bold ${lbl.includes('Giờ') && selectedRow.ocrScanning ? 'text-indigo-500 italic' : 'text-slate-800'}`}>{val}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-xs py-1.5 mt-1">
                <span className="text-slate-500 font-medium">Trạng Thái</span>
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border ${STATUS_STYLE[selectedRow.status]||''}`}>
                  {selectedRow.status==='Đúng giờ'?'✅ Đúng giờ':selectedRow.status==='Đi trễ'?'⚠️ Đi trễ':'🔴 Chưa CI'}
                </span>
              </div>
            </div>

            {/* Photos */}
            <div className="space-y-3">
              <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 pb-2">Hình Ảnh Check-In (CI)</h4>
              <div>
                {selectedRow.ciPhotos.length ? (
                  <>
                    <img src={selectedRow.ciPhotos[0]} alt="CI"
                      onClick={()=>{ setPreviewList(selectedRow.ciPhotos); setPreviewImage(selectedRow.ciPhotos[0]); }}
                      className="w-full h-52 object-cover rounded-xl border-2 border-emerald-200 cursor-zoom-in hover:opacity-90 transition-all" />
                    {selectedRow.ciPhotos.length > 1 && (
                      <div className="flex gap-1.5 mt-2 overflow-x-auto">
                        {selectedRow.ciPhotos.map((p,i)=>(
                          <img key={i} src={p} alt="" onClick={()=>{ setPreviewList(selectedRow.ciPhotos); setPreviewImage(p); }}
                            className="w-14 h-14 rounded-lg object-cover border border-slate-200 cursor-zoom-in hover:opacity-80 flex-shrink-0" />
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="h-52 bg-rose-50 border-2 border-dashed border-rose-300 text-rose-400 rounded-xl flex flex-col items-center justify-center text-xs gap-1">
                    <i className="fa-solid fa-image text-2xl" />
                    <span className="font-bold">Chưa có ảnh CI</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-400 flex items-center gap-2">
            <i className="fa-solid fa-shield-halved text-slate-300" />
            Field Operation Dashboard · {new Date().toLocaleDateString('vi-VN')}
          </div>
        </div>
      )}

      {/* ── LIGHTBOX ── */}
      {previewImage && (
        <div onClick={()=>setPreviewImage(null)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out">
          <div className="relative max-w-4xl w-full" onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setPreviewImage(null)}
              className="absolute -top-4 -right-4 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 text-white flex items-center justify-center cursor-pointer transition-colors z-10 text-lg">
              <i className="fa-solid fa-xmark" />
            </button>
            <img src={previewImage} alt="Preview" className="w-full max-h-[82vh] object-contain rounded-2xl" />
            {previewList.length > 1 && (
              <div className="flex gap-2 justify-center mt-3 overflow-x-auto pb-1">
                {previewList.map((p,i) => (
                  <img key={i} src={p} alt="" onClick={()=>setPreviewImage(p)}
                    className={`w-14 h-14 rounded-lg object-cover cursor-pointer border-2 shrink-0 transition-all ${p===previewImage?'border-teal-400 opacity-100':'border-white/20 opacity-60 hover:opacity-100'}`} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
