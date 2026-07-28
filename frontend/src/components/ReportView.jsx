import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import JSZip from 'jszip';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { fetchMasterData } from '../api/googleSheets';

/* ─── Constants ─────────────────────────────────────────────── */
const UFF_BASE = 'https://uff.interdist.com.vn/';
const UFF_USER = 'TRUNG.DHA';

const STATUS_STYLE = {
  'Đúng giờ': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Đi trễ':   'bg-amber-100  text-amber-800  border-amber-200',
  'Chưa CI':  'bg-rose-100   text-rose-800   border-rose-200',
};

// UFF zip folder prefix → full project name
const PREFIX_MAP = {
  PNG:'P&G', PG:'P&G', 'P&G':'P&G',
  MAG:'MAGGI', MGI:'MAGGI', MAGGI:'MAGGI',
  NCF:'NESTCAFE', NSF:'NESTCAFE', NSC:'NESTCAFE', NES:'NESTCAFE',
  NESTCAFE:'NESTCAFE', NESCAFE:'NESTCAFE',
  VDA:'VINDA', VND:'VINDA', VIN:'VINDA', VINDA:'VINDA',
  STM:'STMB', STMB:'STMB',
  UNI:'Unilever', UL:'Unilever', UNILEVER:'Unilever',
  AEO:'AEON', AEON:'AEON',
};

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

/** Normalize Project Name */
function normalizeProjName(p) {
  if (!p) return 'Khác';
  const raw = String(p).trim().toUpperCase();
  for (const [k, v] of Object.entries(PREFIX_MAP)) {
    if (raw === k || raw.startsWith(k)) return v;
  }
  if (/NEST|NCF|NSF|NSC|NES/.test(raw)) return 'NESTCAFE';
  if (/PNG|P&G|PG/.test(raw)) return 'P&G';
  if (/MAGGI|MAG|MGI/.test(raw)) return 'MAGGI';
  if (/VINDA|VDA|VND|VIN/.test(raw)) return 'VINDA';
  if (/STMB|STM/.test(raw)) return 'STMB';
  if (/UNI/.test(raw)) return 'Unilever';
  if (/AEON|AEO/.test(raw)) return 'AEON';
  return p;
}

/** Robust store matcher: code, numeric, unaccented name, word overlap */
function isStoreMatch(sched, zip) {
  // 1. Projects must align (if both known)
  const pSched = normalizeProjName(sched.project);
  const pZip   = normalizeProjName(zip.projLabel);
  if (pSched && pZip && pSched !== pZip && pSched !== 'Khác' && pZip !== 'Khác') {
    return false;
  }

  // 2. Exact or Normalized Code Match (e.g. K08620 vs K08620 or K-08620)
  const codeS = cleanStoreStr(sched.storeCode).replace(/\s/g, '');
  const codeZ = cleanStoreStr(zip.storeCode).replace(/\s/g, '');
  if (codeS && codeZ && (codeS === codeZ || codeS.includes(codeZ) || codeZ.includes(codeS))) {
    return true;
  }

  // 3. Numeric Code Match (e.g. 08620 or 8620 appearing in storeCode or storeName of both)
  const numS = extractDigits(sched.storeCode + ' ' + sched.storeName);
  const numZ = extractDigits(zip.storeCode + ' ' + zip.storeName);
  if (numS && numZ && numS.length >= 3 && numZ.length >= 3 && (numS === numZ || numS.includes(numZ) || numZ.includes(numS))) {
    return true;
  }

  // 4. Clean Unaccented Name Inclusion Match (e.g. "coopmart go vap" vs "co.opmart gò vấp")
  const nameS = cleanStoreStr(sched.storeName);
  const nameZ = cleanStoreStr(zip.storeName);
  if (nameS && nameZ) {
    if (nameS.includes(nameZ) || nameZ.includes(nameS)) return true;

    // 5. Word Overlap Match (if > 50% of words in zip name appear in schedule name)
    const wordsZ = nameZ.split(' ').filter(w => w.length > 2);
    if (wordsZ.length >= 2) {
      const matchCount = wordsZ.filter(w => nameS.includes(w)).length;
      if (matchCount / wordsZ.length >= 0.5) return true;
    }
  }

  return false;
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

/** Detect UFF project folder: LETTERS_YYYYMMDD[_YYYYMMDD] */
function detectProjFolder(part) {
  const m = part.match(/^([A-Za-z&]+)_\d{8}(_\d{8})?$/);
  if (!m) return '';
  const raw = m[1].toUpperCase();
  return normalizeProjName(raw);
}

function normStr(s) {
  return cleanStoreStr(s);
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

/* ─── OCR via Tesseract.js (lazy-loaded) ───────────────────── */
let _tesseractWorker = null;

async function getOCRWorker() {
  if (!_tesseractWorker) {
    const { createWorker } = await import('tesseract.js');
    _tesseractWorker = await createWorker('eng');
  }
  return _tesseractWorker;
}

async function ocrTimeFromBlob(blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    const cropH = Math.max(60, Math.floor(bitmap.height * 0.30));
    canvas.width  = bitmap.width;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, bitmap.height - cropH, bitmap.width, cropH, 0, 0, bitmap.width, cropH);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    let brightPx = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 128) brightPx++;
    }
    const isMostlyDark = brightPx < (d.length / 4) * 0.5;
    if (isMostlyDark) {
      for (let i = 0; i < d.length; i += 4) {
        d[i]   = 255 - d[i];
        d[i+1] = 255 - d[i+1];
        d[i+2] = 255 - d[i+2];
      }
      ctx.putImageData(imgData, 0, 0);
    }

    const worker = await getOCRWorker();
    const { data } = await worker.recognize(canvas);
    const text = data.text;

    const m = text.match(/\b([01]?\d|2[0-3])[:\.h]([0-5]\d)(?:[:\.][0-5]\d)?\b/);
    if (m) return `${pad(+m[1])}:${pad(+m[2])}`;
  } catch (e) {
    console.warn('OCR failed:', e.message);
  }
  return null;
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

        const imagePaths = Object.keys(zip.files).filter(fp =>
          !zip.files[fp].dir && /\.(jpg|jpeg|png|webp)$/i.test(fp)
        );

        setProgress(`${file.name}: phân tích ${imagePaths.length} ảnh...`);

        const storeMap = {}; // key: "date||storeCode"
        let detectedProject = '';

        for (let idx = 0; idx < imagePaths.length; idx++) {
          if (idx % 20 === 0) setProgress(`${file.name}: ${idx+1}/${imagePaths.length} ảnh...`);

          const fp    = imagePaths[idx];
          const parts = fp.split(/[/\\]/);
          const fileName = parts[parts.length - 1];

          let datePart  = '';
          let shopPart  = '';
          let projLabel = '';
          let projFound = false;

          for (let pi = 0; pi < parts.length - 1; pi++) {
            const p = parts[pi];
            if (!projFound) {
              const pj = detectProjFolder(p);
              if (pj) { projLabel = pj; projFound = true; }
            }
            let dParsed = parseVNDate(p);
            if (dParsed) { datePart = dParsed; continue; }

            const rangeMatch = p.match(/^[A-Za-z&]+_(\d{8})/);
            if (rangeMatch && !datePart) {
              const ds = rangeMatch[1];
              datePart = `${ds.slice(0,4)}-${ds.slice(4,6)}-${ds.slice(6,8)}`;
            }

            if (p.includes('_') && !/^\d{8}$/.test(p) && !detectProjFolder(p)) shopPart = p;
          }

          if (!shopPart && parts.length >= 2) {
            const parent = parts[parts.length - 2];
            if (!/^\d{8}$/.test(parent) && !detectProjFolder(parent)) shopPart = parent;
          }

          if (!datePart) {
            const fnDateMatch = fileName.match(/(\d{4})[_\-]?(\d{2})[_\-]?(\d{2})/);
            if (fnDateMatch) datePart = `${fnDateMatch[1]}-${fnDateMatch[2]}-${fnDateMatch[3]}`;
          }

          if (!datePart) datePart = todayISO();
          if (projLabel) detectedProject = normalizeProjName(projLabel);

          let storeCode = shopPart || 'STORE';
          let storeName = shopPart || 'Store ' + (idx + 1);
          if (shopPart.includes('_')) {
            const ux = shopPart.indexOf('_');
            storeCode = shopPart.slice(0, ux);
            storeName = shopPart.slice(ux + 1).replace(/_/g, ' ');
          }

          const fnLow = fileName.toLowerCase();
          const isCO  = /^co[_\-]|[_\-]co[_\-\.]/.test(fnLow);

          const blob   = await zip.files[fp].async('blob');
          const imgUrl = URL.createObjectURL(blob);

          const finalProj = normalizeProjName(projLabel || detectedProject || file.name.split('_')[0]);

          const key = `${datePart}||${storeCode.toUpperCase()}`;
          if (!storeMap[key]) {
            storeMap[key] = {
              key, date: datePart, storeCode, storeName,
              projLabel: finalProj,
              ciPhotos: [], coPhotos: [],
              ciBlobs:  [], coBlobs:  [],
              ciTime: null, coTime: null,
            };
          }
          const rec = storeMap[key];
          if (isCO) {
            rec.coPhotos.push(imgUrl);
            rec.coBlobs.push(blob);
          } else {
            rec.ciPhotos.push(imgUrl);
            rec.ciBlobs.push(blob);
          }
        }

        const allDates = [...new Set(Object.values(storeMap).map(r => r.date))].sort();
        const projName = normalizeProjName(detectedProject || file.name.split('_')[0]);
        newSessions.push({
          id:         `${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
          fileName:   file.name,
          project:    projName,
          storeCount: Object.keys(storeMap).length,
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
    setSessions(prev => prev.filter(s => s.id !== id));
    setSelectedRow(null);
  }, []);

  /* Merged zip lookup */
  const mergedZipMap = useMemo(() => {
    const m = new Map();
    for (const sess of sessions) {
      for (const [k, v] of Object.entries(sess.storeMap)) {
        if (!m.has(k)) m.set(k, { ...v, ciPhotos:[...v.ciPhotos], coPhotos:[...v.coPhotos], ciBlobs:[...v.ciBlobs], coBlobs:[...v.coBlobs] });
        else {
          const ex = m.get(k);
          ex.ciPhotos = [...ex.ciPhotos, ...v.ciPhotos];
          ex.coPhotos = [...ex.coPhotos, ...v.coPhotos];
          ex.ciBlobs  = [...ex.ciBlobs,  ...v.ciBlobs];
          ex.coBlobs  = [...ex.coBlobs,  ...v.coBlobs];
        }
      }
    }
    return m;
  }, [sessions]);

  /* OCR trigger */
  const triggerOCR = useCallback(async (rowId, ciBlobs, coBlobs) => {
    setOcrState(prev => ({ ...prev, [rowId]: 'scanning' }));
    try {
      const ciTime = ciBlobs.length ? await ocrTimeFromBlob(ciBlobs[0]) : null;
      const coTime = coBlobs.length ? await ocrTimeFromBlob(coBlobs[0]) : null;
      setOcrState(prev => ({ ...prev, [rowId]: { ciTime: ciTime || '—', coTime: coTime || '—' } }));
    } catch {
      setOcrState(prev => ({ ...prev, [rowId]: { ciTime: '—', coTime: '—' } }));
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
      // Robust match
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
      const ciTime = (ocr && ocr !== 'scanning') ? ocr.ciTime : (zip ? '—' : null);
      const coTime = (ocr && ocr !== 'scanning') ? ocr.coTime : (zip ? '—' : null);
      const status = zip
        ? (ocr && ocr !== 'scanning' ? calcStatus(ocr.ciTime, sched.workingTime) : 'Đúng giờ')
        : 'Chưa CI';

      mergedRows.push({
        id:          rowId,
        date:        sched.isoDate,
        project:     normalizeProjName(sched.project || zip?.projLabel),
        brand:       sched.brand || zip?.projLabel || '—',
        storeCode:   zip?.storeCode || sched.storeCode,
        storeName:   zip?.storeName || sched.storeName,
        workingTime: sched.workingTime || '—',
        sup:         sched.sup || '—',
        region:      sched.region || '—',
        ciTime:      ciTime || '—',
        coTime:      coTime || '—',
        status,
        ciPhotos:    zip?.ciPhotos || [],
        coPhotos:    zip?.coPhotos || [],
        ciPhoto:     zip?.ciPhotos?.[0] || null,
        coPhoto:     zip?.coPhotos?.[0] || null,
        ciBlobs:     zip?.ciBlobs || [],
        coBlobs:     zip?.coBlobs || [],
        hasZip:      !!zip,
        ocrDone:     !!(ocr && ocr !== 'scanning'),
        ocrScanning: ocr === 'scanning',
      });
    });

    // 2. Loop unmatched Zip entries (Stores from Zip not matched to schedule)
    zipForDate.forEach((zip, i) => {
      if (matchedZipKeys.has(zip.key)) return;

      const normP = normalizeProjName(zip.projLabel);
      const rowId = `zip_${zip.date}_${zip.storeCode}_${i}`;
      const ocr   = ocrState[rowId];
      const ciTime = (ocr && ocr !== 'scanning') ? ocr.ciTime : '—';
      const coTime = (ocr && ocr !== 'scanning') ? ocr.coTime : '—';
      const status = ocr && ocr !== 'scanning' ? calcStatus(ocr.ciTime, null) : 'Đúng giờ';

      mergedRows.push({
        id:          rowId,
        date:        zip.date,
        project:     normP,
        brand:       normP,
        storeCode:   zip.storeCode,
        storeName:   zip.storeName,
        workingTime: '—',
        sup:         '—',
        region:      '—',
        ciTime,
        coTime,
        status,
        ciPhotos:    zip.ciPhotos || [],
        coPhotos:    zip.coPhotos || [],
        ciPhoto:     zip.ciPhotos?.[0] || null,
        coPhoto:     zip.coPhotos?.[0] || null,
        ciBlobs:     zip.ciBlobs || [],
        coBlobs:     zip.coBlobs || [],
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
        cleanStoreStr(r.sup).includes(q) || cleanStoreStr(r.project).includes(q)
      );
    }

    const ord = { 'Chưa CI': 0, 'Đi trễ': 1, 'Đúng giờ': 2 };
    filtered.sort((a,b) =>
      a.project.localeCompare(b.project) || (ord[a.status]??9)-(ord[b.status]??9)
    );
    return filtered;
  }, [scheduleRows, mergedZipMap, selDate, selProject, selStatus, search, ocrState]);

  // Group BY PROJECT ONLY (So Schedule + Zip for NESTCAFE render in ONE single block)
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
    if (row.hasZip && !row.ocrDone && !row.ocrScanning) {
      triggerOCR(row.id, row.ciBlobs, row.coBlobs);
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

  /* ── API Test ── */
  const handleTestAPI = async () => {
    setApiStatus('connecting');
    setApiMsg('Đang kiểm tra kết nối...');
    try {
      const res = await fetch(`${UFF_BASE}api/Auth/login`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ userName:UFF_USER, password:'12345678', deviceToken:'web-dashboard' }),
      });
      if (res.ok) {
        const j = await res.json();
        setApiStatus('connected');
        setApiMsg(`✅ Kết nối thành công! ${j.token ? 'Token OK' : ''}`);
      } else {
        setApiStatus('error');
        setApiMsg(`⚠️ HTTP ${res.status}. Dùng phương thức upload Zip thủ công.`);
      }
    } catch (err) {
      setApiStatus('error');
      setApiMsg(`⚠️ CORS/Network error. Hãy xuất Zip từ web UFF rồi upload lên đây.`);
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
            Upload file Zip ảnh CI/CO theo từng dự án → hệ thống đọc giờ từ chữ trên ảnh (OCR) → đối soát với Lịch Master.
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
            Mỗi dự án xuất <strong className="text-teal-200">một file Zip riêng</strong> từ web UFF → upload từng file. Hệ thống tự tích lũy dữ liệu.
            <br/>Cấu trúc: <code className="text-teal-300 text-[10px]">PnG_20260720_20260726 / 20260720 / BHX001_BHX Dang Van Bi / CI_xxx.jpg</code>
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
                <div className="text-[10px] text-slate-500 mt-0.5">Có thể chọn nhiều file cùng lúc · Giờ CI/CO đọc từ chữ trên ảnh (OCR tự động)</div>
              </div>
            )}
          </label>

          {/* Loaded Sessions List */}
          {sessions.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] text-teal-400 font-bold uppercase tracking-wider">📁 Đã Tải Lên:</div>
              {sessions.map(sess => (
                <div key={sess.id}
                  className="flex items-center justify-between gap-3 bg-teal-800/30 border border-teal-700/30 rounded-xl px-4 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Project badge */}
                    <span className="shrink-0 bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wide">
                      {sess.project}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[11px] text-slate-200 font-bold truncate">{sess.fileName}</div>
                      <div className="text-[10px] text-slate-500">
                        {sess.storeCount} store · {sess.imageCount} ảnh · {sess.dates.length} ngày ({sess.dates[0]} → {sess.dates[sess.dates.length-1]})
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
              <i className="fa-solid fa-server text-blue-600" /> Kết Nối UFF API
            </div>
            <div className="text-xs bg-slate-50 rounded-xl border border-slate-100 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
                <span className="font-mono text-[10px] text-blue-700 truncate">{UFF_BASE}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="font-mono text-[10px]">{UFF_USER}</span>
              </div>
            </div>
            <button onClick={handleTestAPI} disabled={apiStatus==='connecting'}
              className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50">
              <i className={`fa-solid ${apiStatus==='connecting'?'fa-spinner animate-spin':'fa-plug'}`} />
              {apiStatus==='connecting' ? 'Đang kiểm tra...' : 'Test Kết Nối'}
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
              <i className="fa-solid fa-eye text-indigo-600" /> Đọc Giờ Từ Ảnh (OCR)
            </div>
            <p className="text-[11px] text-indigo-700 leading-relaxed">
              Hệ thống dùng <strong>Tesseract.js</strong> để đọc giờ CI/CO được ghi trên ảnh.
              <br/>OCR tự động chạy khi bạn <strong>click chọn một dòng store</strong> để xem chi tiết — không làm chậm quá trình upload.
            </p>
            <div className="text-[10px] text-indigo-500 bg-indigo-100 rounded-lg px-2.5 py-1.5">
              💡 OCR quét phần dưới ảnh (vị trí chữ timestamp). Lần đầu tải Tesseract engine ~2MB.
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
            placeholder="Store, SUP, dự án..."
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
            : <span>{displayRows.length} dòng · Click chọn store để xem ảnh + quét OCR giờ CI</span>}
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
                        {['Ngày','Store Code','Tên Store / Siêu Thị','Ca Làm (Lịch)','SUP','Ảnh CI','Giờ CI','Giờ CO','Trạng Thái'].map(h=>(
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
                                  {r.ciTime}
                                </span>
                              )}
                            </td>
                            <td className="px-3.5 py-3 font-mono text-slate-500 text-[11px]">
                              {r.ocrScanning ? <i className="fa-solid fa-circle-notch animate-spin text-[10px] text-indigo-400" /> : r.coTime}
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
                {selectedRow.date} · {selectedRow.project} · Brand: {selectedRow.brand} · {selectedRow.storeCode}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {selectedRow.hasZip && !selectedRow.ocrDone && !selectedRow.ocrScanning && (
                <button
                  onClick={() => triggerOCR(selectedRow.id, selectedRow.ciBlobs, selectedRow.coBlobs)}
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
                ['Ca Làm Việc', selectedRow.workingTime],
                ['Supervisor', selectedRow.sup],
                ['Giờ Check-In', selectedRow.ocrScanning ? '🔍 đang quét...' : selectedRow.ciTime],
                ['Giờ Check-Out', selectedRow.ocrScanning ? '🔍 đang quét...' : selectedRow.coTime],
                ['Số ảnh CI', selectedRow.ciPhotos.length],
                ['Số ảnh CO', selectedRow.coPhotos.length],
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
              <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 pb-2">Hình Ảnh CI / CO</h4>
              <div className="grid grid-cols-2 gap-3">
                <PhotoCol label="📷 Check-In (CI)" photos={selectedRow.ciPhotos} color="emerald"
                  onZoom={(p)=>{ setPreviewList(selectedRow.ciPhotos); setPreviewImage(p); }} />
                <PhotoCol label="📷 Check-Out (CO)" photos={selectedRow.coPhotos} color="blue"
                  onZoom={(p)=>{ setPreviewList(selectedRow.coPhotos); setPreviewImage(p); }} />
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

/* ─── PhotoCol sub-component ───────────────────────── */
function PhotoCol({ label, photos, color, onZoom }) {
  const borderCls = color==='emerald' ? 'border-2 border-emerald-200' : 'border-2 border-blue-200';
  const emptyBg   = color==='emerald' ? 'bg-rose-50 border-rose-300 text-rose-400' : 'bg-slate-100 border-slate-300 text-slate-400';
  return (
    <div>
      <div className={`text-[11px] font-bold mb-1.5 ${color==='emerald'?'text-emerald-700':'text-blue-700'}`}>{label}</div>
      {photos.length ? (
        <>
          <img src={photos[0]} alt={label}
            onClick={()=>onZoom(photos[0])}
            className={`w-full h-40 object-cover rounded-xl ${borderCls} cursor-zoom-in hover:opacity-90 transition-all`} />
          {photos.length > 1 && (
            <div className="flex gap-1 mt-1.5 overflow-x-auto">
              {photos.slice(1).map((p,i)=>(
                <img key={i} src={p} alt="" onClick={()=>onZoom(p)}
                  className="w-12 h-12 rounded-lg object-cover border border-slate-200 cursor-zoom-in hover:opacity-80 flex-shrink-0" />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className={`h-40 rounded-xl flex flex-col items-center justify-center text-xs border-2 border-dashed gap-1 ${emptyBg}`}>
          <i className="fa-solid fa-image text-xl" />
          <span className="font-bold">Chưa có ảnh</span>
        </div>
      )}
    </div>
  );
}
