import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import JSZip from 'jszip';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { fetchMasterData } from '../api/googleSheets';

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════ */
const UFF_BASE_URL = 'https://uff.interdist.com.vn/';
const UFF_USER     = 'TRUNG.DHA';

const STATUS_STYLE = {
  'Đúng giờ': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Đi trễ':   'bg-amber-100  text-amber-800  border-amber-200',
  'Chưa CI':  'bg-rose-100   text-rose-800   border-rose-200',
};

// Map all known UFF zip folder prefixes → full project/brand display name
const PREFIX_MAP = {
  // P&G
  PNG:'P&G', PG:'P&G', 'P&G':'P&G',
  // MAGGI / Nestle
  MAG:'MAGGI', MGI:'MAGGI', MAGGI:'MAGGI',
  // NESTCAFE / NESCAFE
  NCF:'NESTCAFE', NSF:'NESTCAFE', NSC:'NESTCAFE', NES:'NESTCAFE',
  NESTCAFE:'NESTCAFE', NESCAFE:'NESTCAFE',
  // VINDA
  VDA:'VINDA', VND:'VINDA', VIN:'VINDA', VINDA:'VINDA',
  // Others
  STM:'STMB', STMB:'STMB',
  UNI:'Unilever', UL:'Unilever', UNILEVER:'Unilever',
  AEO:'AEON', AEON:'AEON',
};

/* ═══════════════════════════════════════════════════════════════
   PURE HELPERS
   ═══════════════════════════════════════════════════════════════ */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parseVNDateISO(str) {
  if (!str) return null;
  let m;
  m = str.match(/(\d+)\s+tháng\s+(\d+),\s+(\d+)/i);
  if (m) return `${m[3]}-${String(+m[2]).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`;
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${String(+m[2]).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`;
  m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${String(+m[2]).padStart(2,'0')}-${String(+m[3]).padStart(2,'0')}`;
  return null;
}

/** Detect UFF project-range folder: PREFIX_YYYYMMDD[_YYYYMMDD] */
function detectProjFolder(part) {
  const m = part.match(/^([A-Za-z&]+)_\d{8}(_\d{8})?$/);
  if (!m) return '';
  const raw = m[1].toUpperCase();
  return PREFIX_MAP[raw] || raw;
}

/** Normalize store name for fuzzy matching */
function normStr(s) {
  return (s || '').trim().toLowerCase().replace(/[_\-\.]/g, ' ').replace(/\s+/g, ' ');
}

/** Read EXIF DateTimeOriginal from a JPEG Blob → "HH:MM" or null */
async function readExifTime(blob) {
  try {
    // Dynamically import exifr only when needed (keeps initial bundle small)
    const exifr = (await import('exifr')).default;
    const tags  = await exifr.parse(blob, { DateTimeOriginal: true, DateTime: true });
    const dt    = tags?.DateTimeOriginal || tags?.DateTime;
    if (dt instanceof Date) {
      return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    }
  } catch (_) {}
  return null;
}

/** Extract HH:MM from filename patterns like CI_20260728_081523.jpg or CI0815.jpg */
function timeFromFilename(fileName) {
  // Pattern: 6-digit compact HHMMSS somewhere in name
  let m = fileName.match(/[_\-](\d{2})(\d{2})\d{2}[_\-.]/) || fileName.match(/(\d{2})(\d{2})\d{2}\./);
  if (m && +m[1] <= 23 && +m[2] <= 59) return `${m[1]}:${m[2]}`;
  // Pattern: HH-MM or HH:MM in name
  m = fileName.match(/[_\-](\d{2})[:\-](\d{2})/);
  if (m && +m[1] <= 23 && +m[2] <= 59) return `${m[1]}:${m[2]}`;
  // Pattern: 4-digit HHMM
  m = fileName.match(/[_\-](\d{2})(\d{2})[_\-\.]/);
  if (m && +m[1] <= 23 && +m[2] <= 59) return `${m[1]}:${m[2]}`;
  return null;
}

/** Determine "Đúng giờ" | "Đi trễ" | "Chưa CI" */
function calcStatus(ciTime, workingTime) {
  if (!ciTime || ciTime === '—') return 'Chưa CI';
  if (!workingTime) return 'Đúng giờ';
  const sm = workingTime.match(/(\d{1,2}):(\d{2})/);
  const cm = ciTime.match(/(\d{1,2}):(\d{2})/);
  if (!sm || !cm) return 'Đúng giờ';
  const schedMins = +sm[1] * 60 + +sm[2];
  const ciMins    = +cm[1] * 60 + +cm[2];
  return ciMins > schedMins + 5 ? 'Đi trễ' : 'Đúng giờ';
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function ReportView({ refreshKey }) {
  const [masterData, setMasterData]   = useState([]);
  // uffZipData: Map<"storeCode||date", { storeCode, storeName, projLabel, ciPhotos, coPhotos, ciTime, coTime }>
  const [uffZipData, setUffZipData]   = useState(null);
  const [zipStats,   setZipStats]     = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [zipProgress,  setZipProgress]  = useState('');
  const [zipFileName,  setZipFileName]  = useState('');

  // Filters
  const [search,     setSearch]     = useState('');
  const [selProject, setSelProject] = useState('Tất cả');
  const [selDate,    setSelDate]    = useState(todayISO);
  const [selStatus,  setSelStatus]  = useState('');
  const [selectedRow, setSelectedRow] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [previewImages, setPreviewImages] = useState([]); // all photos for lightbox

  // API
  const [apiStatus, setApiStatus] = useState('idle');
  const [apiMsg,    setApiMsg]    = useState('');

  const fileInputRef = useRef();

  /* ── Load Master Data ── */
  useEffect(() => {
    fetchMasterData()
      .then(d => { if (Array.isArray(d)) setMasterData(d); })
      .catch(e => console.warn('Master data error:', e));
  }, [refreshKey]);

  /* ═══════════════════════════════════════════════════════════════
     ZIP PARSER
     ═══════════════════════════════════════════════════════════════ */
  const handleZipUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setZipFileName(file.name);
    setIsProcessing(true);
    setZipProgress('Đang đọc file zip...');

    try {
      // FIX: read entire file into memory first to avoid "permission" errors
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);

      const imagePaths = Object.keys(zip.files).filter(fp =>
        !zip.files[fp].dir && /\.(jpg|jpeg|png|webp)$/i.test(fp)
      );

      setZipProgress(`Phân tích ${imagePaths.length} ảnh...`);

      // storeMap key: "YYYY-MM-DD||storeCode"
      const storeMap = {};
      let detectedProject = '';
      let totalImages = 0;

      for (let idx = 0; idx < imagePaths.length; idx++) {
        if (idx % 20 === 0) {
          setZipProgress(`Đang xử lý ảnh ${idx + 1} / ${imagePaths.length}...`);
        }

        const filePath = imagePaths[idx];
        const parts    = filePath.split(/[/\\]/);
        const fileName = parts[parts.length - 1];

        let datePart  = '';
        let shopPart  = '';
        let projLabel = '';
        let projFound = false;

        for (let pi = 0; pi < parts.length - 1; pi++) {  // skip filename (last part)
          const p = parts[pi];

          // Project folder: PREFIX_YYYYMMDD[_YYYYMMDD]
          if (!projFound) {
            const pj = detectProjFolder(p);
            if (pj) { projLabel = pj; projFound = true; continue; }
          }

          // Date folder: exactly 8 digits
          if (/^\d{8}$/.test(p)) {
            datePart = `${p.slice(0,4)}-${p.slice(4,6)}-${p.slice(6,8)}`;
            continue;
          }

          // Shop folder: contains '_', not a date, not a project folder
          if (p.includes('_') && !/^\d{8}$/.test(p)) {
            shopPart = p;
          }
        }

        // Fallback: second-to-last folder is shop
        if (!shopPart && parts.length >= 2) {
          const candidate = parts[parts.length - 2];
          if (!/^\d{8}$/.test(candidate) && !detectProjFolder(candidate)) {
            shopPart = candidate;
          }
        }

        if (!datePart) continue;
        if (projLabel) detectedProject = projLabel;

        // Parse store code & name from shopPart "CODE_Name With Spaces"
        let storeCode = shopPart;
        let storeName = shopPart;
        if (shopPart.includes('_')) {
          const idx_ = shopPart.indexOf('_');
          storeCode = shopPart.slice(0, idx_);
          storeName = shopPart.slice(idx_ + 1).replace(/_/g, ' ');
        }

        const isCI = /^ci[_\-\s]?/i.test(fileName) || /[_\-]ci[_\-\s\.]/i.test(fileName);
        const isCO = /^co[_\-\s]?/i.test(fileName) || /[_\-]co[_\-\s\.]/i.test(fileName);

        const blob   = await zip.files[filePath].async('blob');
        const imgUrl = URL.createObjectURL(blob);
        totalImages++;

        // Extract time: EXIF first, then filename
        let imageTime = await readExifTime(blob);
        if (!imageTime) imageTime = timeFromFilename(fileName);

        const key = `${datePart}||${storeCode}`;
        if (!storeMap[key]) {
          storeMap[key] = {
            key,
            date: datePart,
            storeCode,
            storeName,
            projLabel,
            ciPhotos: [],
            coPhotos: [],
            ciTime: null,
            coTime: null,
          };
        }
        const rec = storeMap[key];

        if (isCO) {
          rec.coPhotos.push(imgUrl);
          if (!rec.coTime && imageTime) rec.coTime = imageTime;
        } else {
          // Default or explicit CI
          rec.ciPhotos.push(imgUrl);
          if (!rec.ciTime && imageTime) rec.ciTime = imageTime;
        }
      }

      const parsedList = Object.values(storeMap);
      if (parsedList.length > 0) {
        setUffZipData(parsedList);
        const allDates = [...new Set(parsedList.map(r => r.date))].sort();
        setZipStats({ totalImages, totalStores: parsedList.length, dates: allDates, project: detectedProject });
        if (detectedProject && detectedProject !== 'Tất cả') setSelProject(detectedProject);
        // Auto-select first date in zip
        if (allDates.length > 0) setSelDate(allDates[allDates.length - 1]);
      } else {
        alert('Không tìm thấy ảnh hợp lệ trong zip.\nCấu trúc cần: DuAn_YYYYMMDD_YYYYMMDD / YYYYMMDD / CodeStore_TenStore / CI_xxx.jpg');
      }
    } catch (err) {
      console.error('Zip error:', err);
      alert('Lỗi đọc file zip: ' + err.message);
    } finally {
      setIsProcessing(false);
      setZipProgress('');
    }
  }, []);

  /* ── API Test ── */
  const handleTestAPI = async () => {
    setApiStatus('connecting');
    setApiMsg('Đang kiểm tra kết nối UFF API...');
    try {
      const res = await fetch(`${UFF_BASE_URL}api/Auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: UFF_USER, password: '12345678', deviceToken: 'web-dashboard' }),
      });
      if (res.ok) {
        const j = await res.json();
        setApiStatus('connected');
        setApiMsg(`✅ Kết nối thành công! Token: ${j.token ? j.token.slice(0,20)+'…' : 'OK'}`);
      } else {
        setApiStatus('error');
        setApiMsg(`⚠️ Server trả về HTTP ${res.status}. Dùng phương thức tải file Zip thủ công.`);
      }
    } catch (err) {
      setApiStatus('error');
      setApiMsg(`⚠️ Lỗi CORS/Network.\nHãy xuất file Zip từ web UFF và upload lên đây.`);
    }
  };

  /* ═══════════════════════════════════════════════════════════════
     SCHEDULE DATA FOR SELECTED DATE
     ═══════════════════════════════════════════════════════════════ */
  const scheduleForDate = useMemo(() => {
    if (!masterData.length) return [];
    return masterData
      .map(m => {
        const isoDate = parseVNDateISO(m['Date'] || m['Ngày'] || '');
        if (!isoDate) return null;
        return {
          isoDate,
          storeCode:   (m['Store Code'] || m['Mart Code'] || '').trim(),
          storeName:   (m['Store Name'] || m['Mart Name'] || '').trim(),
          project:     (m['Project'] || '').trim(),
          brand:       (m['Brand'] || '').trim(),
          workingTime: (m['Working Time'] || '').trim(),
          sup:         (m['Sup'] || m['Supervisor'] || '').trim(),
          region:      (m['Region'] || '').trim(),
        };
      })
      .filter(Boolean);
  }, [masterData]);

  /** All dates that appear in master schedule */
  const allScheduleDates = useMemo(() => {
    const s = new Set(scheduleForDate.map(r => r.isoDate));
    const arr = [...s].sort();
    return arr.length ? arr : [todayISO()];
  }, [scheduleForDate]);

  /** Projects active on selected date */
  const projectsOnDate = useMemo(() => {
    const projs = [...new Set(
      scheduleForDate
        .filter(r => r.isoDate === selDate)
        .map(r => r.project)
        .filter(Boolean)
    )].sort();
    return ['Tất cả', ...projs];
  }, [scheduleForDate, selDate]);

  /* ═══════════════════════════════════════════════════════════════
     BUILD ZIP LOOKUP (storeCode → zip record)
     ═══════════════════════════════════════════════════════════════ */
  const zipLookup = useMemo(() => {
    if (!uffZipData) return new Map();
    const m = new Map();
    for (const z of uffZipData) {
      // key by date+storeCode (exact)
      m.set(`${z.date}||${z.storeCode.toUpperCase()}`, z);
      // also key by date+normStoreName for fuzzy
      m.set(`${z.date}||NAME||${normStr(z.storeName)}`, z);
    }
    return m;
  }, [uffZipData]);

  /** Fuzzy find zip record for a schedule row */
  const findZipRecord = useCallback((sched) => {
    if (!uffZipData) return null;
    // 1. Exact storeCode match
    let rec = zipLookup.get(`${sched.isoDate}||${sched.storeCode.toUpperCase()}`);
    if (rec) return rec;
    // 2. Fuzzy store name match
    const normSched = normStr(sched.storeName);
    rec = zipLookup.get(`${sched.isoDate}||NAME||${normSched}`);
    if (rec) return rec;
    // 3. Partial name match
    for (const z of (uffZipData || [])) {
      if (z.date !== sched.isoDate) continue;
      const zNorm = normStr(z.storeName);
      const scNorm = normStr(sched.storeCode);
      if (zNorm.includes(normSched) || normSched.includes(zNorm) ||
          z.storeCode.toUpperCase() === sched.storeCode.toUpperCase() ||
          scNorm === normStr(z.storeCode)) {
        return z;
      }
    }
    return null;
  }, [uffZipData, zipLookup]);

  /* ═══════════════════════════════════════════════════════════════
     BUILD DISPLAY ROWS — primary source is SCHEDULE
     ═══════════════════════════════════════════════════════════════ */
  const displayRows = useMemo(() => {
    const dateRows = scheduleForDate.filter(r => r.isoDate === selDate);
    if (!dateRows.length) return [];

    const rows = dateRows.map((sched, i) => {
      const zip = findZipRecord(sched);
      const ciTime  = zip?.ciTime || null;
      const coTime  = zip?.coTime || null;
      const status  = zip ? calcStatus(ciTime, sched.workingTime) : 'Chưa CI';

      // Store code/name: prefer zip folder info (more accurate UFF code)
      const displayCode = zip?.storeCode || sched.storeCode;
      const displayName = zip?.storeName || sched.storeName;

      return {
        id: `${sched.isoDate}_${sched.storeCode}_${i}`,
        date:        sched.isoDate,
        project:     sched.project,
        brand:       sched.brand,
        storeCode:   displayCode,
        storeName:   displayName,
        workingTime: sched.workingTime,
        sup:         sched.sup,
        region:      sched.region,
        ciTime:      ciTime || '—',
        coTime:      coTime || '—',
        status,
        ciPhotos:    zip?.ciPhotos || [],
        coPhotos:    zip?.coPhotos || [],
        ciPhoto:     zip?.ciPhotos?.[0] || null,
        coPhoto:     zip?.coPhotos?.[0] || null,
        hasZip:      !!zip,
      };
    });

    // Apply filters
    let filtered = rows;
    if (selProject && selProject !== 'Tất cả') {
      filtered = filtered.filter(r => r.project === selProject || r.brand === selProject);
    }
    if (selStatus) {
      filtered = filtered.filter(r => r.status === selStatus);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(r =>
        normStr(r.storeName).includes(q) ||
        normStr(r.storeCode).includes(q) ||
        normStr(r.sup).includes(q) ||
        normStr(r.project).includes(q)
      );
    }

    // Sort within each project: Chưa CI → Đi trễ → Đúng giờ
    const ord = { 'Chưa CI': 0, 'Đi trễ': 1, 'Đúng giờ': 2 };
    filtered.sort((a, b) =>
      a.project.localeCompare(b.project) ||
      (ord[a.status] ?? 9) - (ord[b.status] ?? 9)
    );
    return filtered;
  }, [scheduleForDate, selDate, selProject, selStatus, search, findZipRecord]);

  /** Group display rows by (project, brand) */
  const groupedRows = useMemo(() => {
    const groups = new Map();
    for (const row of displayRows) {
      const key = `${row.project}||${row.brand}`;
      if (!groups.has(key)) groups.set(key, { project: row.project, brand: row.brand, rows: [] });
      groups.get(key).rows.push(row);
    }
    return [...groups.values()];
  }, [displayRows]);

  /* ── KPIs ── */
  const totalScheduled = scheduleForDate.filter(r => r.isoDate === selDate).length;
  const onTimeCount    = displayRows.filter(r => r.status === 'Đúng giờ').length;
  const lateCount      = displayRows.filter(r => r.status === 'Đi trễ').length;
  const missingCount   = displayRows.filter(r => r.status === 'Chưa CI').length;

  /* ═══════════════════════════════════════════════════════════════
     PDF EXPORT (grouped by project)
     ═══════════════════════════════════════════════════════════════ */
  const projectRefs = useRef({});
  const modalRef    = useRef();

  const exportAllPDF = async () => {
    const pdf = new jsPDF('l', 'mm', 'a3');
    let first = true;
    for (const grp of groupedRows) {
      const el = projectRefs.current[`${grp.project}||${grp.brand}`];
      if (!el) continue;
      const canvas = await html2canvas(el, { scale: 2, useCORS: true });
      const img = canvas.toDataURL('image/png');
      if (!first) pdf.addPage();
      const w = pdf.internal.pageSize.getWidth();
      pdf.addImage(img, 'PNG', 0, 0, w, (canvas.height * w) / canvas.width);
      first = false;
    }
    pdf.save(`BaoCao_UFF_${selDate}.pdf`);
  };

  const exportStorePDF = async () => {
    if (!selectedRow) return alert('Vui lòng chọn một dòng store trước.');
    const el = modalRef.current;
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true });
    const img = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const w = pdf.internal.pageSize.getWidth();
    pdf.addImage(img, 'PNG', 0, 0, w, (canvas.height * w) / canvas.width);
    pdf.save(`BaoCao_${selectedRow.storeCode}_${selectedRow.date}.pdf`);
  };

  const clearZip = () => {
    setUffZipData(null);
    setZipStats(null);
    setZipFileName('');
    setSelectedRow(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-5">

      {/* ── TITLE BAR ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white flex items-center justify-center text-sm shadow-md">
              <i className="fa-solid fa-camera" />
            </div>
            Báo cáo UFF — Đối Soát Check-In BA
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Upload file Zip ảnh CI/CO từ web UFF → đối soát tự động với Lịch Master Google Sheet → phát hiện đi trễ / chưa CI.
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

      {/* ── UPLOAD + API ROW ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left: Zip Upload */}
        <div className="lg:col-span-2 bg-gradient-to-br from-teal-900 to-slate-900 text-white p-5 rounded-2xl shadow-lg border border-teal-800/30">
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-teal-300 font-bold text-sm uppercase tracking-wider">
                <i className="fa-solid fa-file-zipper" /> Tải File Zip Ảnh UFF
              </div>
              {zipFileName && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-teal-300 font-mono bg-teal-800/40 px-2.5 py-1 rounded-full border border-teal-600/30 truncate max-w-[200px]">
                    📁 {zipFileName}
                  </span>
                  <button onClick={clearZip}
                    className="text-[10px] bg-rose-500/30 hover:bg-rose-500/50 text-rose-200 px-2 py-0.5 rounded-full border border-rose-400/30 cursor-pointer transition-colors">
                    ✕ Xóa
                  </button>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Vào web UFF → chọn <strong className="text-teal-200">Dự án</strong> → <strong className="text-teal-200">Xuất dữ liệu → Tải ảnh/tệp</strong> → upload Zip vào đây.
              <br/>Cấu trúc: <code className="text-teal-300 text-[10px]">PnG_20260720_20260726 / 20260720 / BHX001_BHX Dang Van Bi / CI_xxx.jpg</code>
            </p>

            {/* Drop zone */}
            <label className={`border-2 border-dashed ${isProcessing ? 'border-teal-400' : 'border-teal-600/40 hover:border-teal-400'} bg-teal-950/30 hover:bg-teal-900/30 rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer transition-all`}>
              <input ref={fileInputRef} type="file" accept=".zip" onChange={handleZipUpload} disabled={isProcessing} className="hidden" />
              {isProcessing ? (
                <div className="flex flex-col items-center gap-2 py-1">
                  <i className="fa-solid fa-circle-notch animate-spin text-teal-400 text-2xl" />
                  <span className="text-teal-200 text-xs font-bold">{zipProgress}</span>
                </div>
              ) : (
                <div className="text-center py-1">
                  <i className="fa-solid fa-cloud-arrow-up text-3xl text-teal-400 mb-2" />
                  <div className="text-xs font-bold text-slate-200">Nhấn chọn hoặc kéo thả file Zip</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Giờ CI/CO tự động đọc từ EXIF ảnh</div>
                </div>
              )}
            </label>

            {/* Zip stats after upload */}
            {zipStats && (
              <div className="grid grid-cols-4 gap-2">
                {[
                  { icon: 'fa-images',   label: 'Ảnh',      value: zipStats.totalImages },
                  { icon: 'fa-store',    label: 'Cửa hàng', value: zipStats.totalStores },
                  { icon: 'fa-calendar', label: 'Ngày',     value: zipStats.dates.length },
                  { icon: 'fa-tag',      label: 'Dự án',    value: zipStats.project || '—' },
                ].map(({ icon, label, value }) => (
                  <div key={label} className="bg-teal-800/40 border border-teal-700/30 rounded-xl px-3 py-2 text-center">
                    <div className="text-[10px] text-teal-400 font-bold uppercase tracking-wide mb-0.5">
                      <i className={`fa-solid ${icon} mr-1`} />{label}
                    </div>
                    <div className="text-lg font-extrabold text-teal-100">{value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: API Connector */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-slate-800 font-bold text-sm mb-3">
              <i className="fa-solid fa-server text-blue-600" /> Kết Nối UFF API
            </div>
            <div className="text-xs bg-slate-50 rounded-xl border border-slate-100 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
                <span className="text-slate-500 w-14 shrink-0">URL:</span>
                <span className="font-mono text-[10px] text-blue-700 truncate">{UFF_BASE_URL}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-slate-500 w-14 shrink-0">User:</span>
                <span className="font-mono text-[10px]">{UFF_USER}</span>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <button onClick={handleTestAPI} disabled={apiStatus === 'connecting'}
              className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50">
              <i className={`fa-solid ${apiStatus === 'connecting' ? 'fa-spinner animate-spin' : 'fa-plug'}`} />
              {apiStatus === 'connecting' ? 'Đang kiểm tra...' : 'Test Kết Nối API'}
            </button>
            {apiMsg && (
              <div className={`text-[11px] p-2.5 rounded-xl whitespace-pre-wrap leading-snug font-medium ${
                apiStatus === 'connected' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                {apiMsg}
              </div>
            )}
            <p className="text-[10px] text-slate-400">
              💡 Nếu bị CORS, xuất file Zip từ web UFF rồi upload lên trái.
            </p>
          </div>
        </div>
      </div>

      {/* ── KPIs (4 boxes) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiBox icon="fa-store"                label="Tổng Store Lịch Hôm Nay" value={totalScheduled} color="blue"    tooltip={`Tổng ${totalScheduled} store trong lịch ngày ${selDate}`} />
        <KpiBox icon="fa-circle-check"         label="Check-In Đúng Giờ"       value={onTimeCount}    color="emerald" />
        <KpiBox icon="fa-clock"                label="Check-In Đi Trễ"         value={lateCount}      color="amber"   />
        <KpiBox icon="fa-triangle-exclamation" label="Chưa CI / Vắng Mặt"      value={missingCount}   color="rose"    />
      </div>

      {/* ── FILTER BAR ── */}
      <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3.5 shadow-xs flex flex-wrap gap-3 items-end">
        {/* Search */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">🔍 Tìm kiếm</label>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Store, SUP, dự án..."
            className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white text-slate-700 outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-400 w-48 font-medium" />
        </div>

        {/* Project — dynamic from today's schedule */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Dự Án</label>
          <select value={selProject} onChange={e => setSelProject(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white text-slate-700 font-bold outline-none cursor-pointer">
            {projectsOnDate.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Date */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Ngày</label>
          <select value={selDate} onChange={e => setSelDate(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white text-slate-700 font-medium outline-none cursor-pointer">
            {allScheduleDates.map(d => (
              <option key={d} value={d}>{d}{d === todayISO() ? ' (Hôm nay)' : ''}</option>
            ))}
          </select>
        </div>

        {/* Status */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Trạng Thái</label>
          <select value={selStatus} onChange={e => setSelStatus(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white text-slate-700 font-medium outline-none cursor-pointer">
            <option value="">Tất cả</option>
            <option value="Đúng giờ">✅ Đúng giờ</option>
            <option value="Đi trễ">⚠️ Đi trễ</option>
            <option value="Chưa CI">🔴 Chưa CI / Vắng</option>
          </select>
        </div>

        <div className="ml-auto self-end text-xs pb-2">
          {selectedRow ? (
            <span className="text-teal-700 font-bold">✓ {selectedRow.storeName} ({selectedRow.date})</span>
          ) : (
            <span className="text-slate-400">{displayRows.length} dòng • Click dòng để xem ảnh</span>
          )}
        </div>
      </div>

      {/* ── TABLE GROUPED BY PROJECT ── */}
      {groupedRows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 shadow-xs">
          <i className="fa-solid fa-inbox text-4xl text-slate-200 mb-3" />
          <div className="font-bold text-sm">Không có dữ liệu cho ngày {selDate}.</div>
          <div className="text-xs mt-1">Kiểm tra lại Google Sheet hoặc chọn ngày khác.</div>
        </div>
      ) : (
        <div className="space-y-5">
          {groupedRows.map(grp => {
            const grpKey = `${grp.project}||${grp.brand}`;
            const grpOnTime  = grp.rows.filter(r => r.status === 'Đúng giờ').length;
            const grpLate    = grp.rows.filter(r => r.status === 'Đi trễ').length;
            const grpMissing = grp.rows.filter(r => r.status === 'Chưa CI').length;

            return (
              <div key={grpKey}
                ref={el => { projectRefs.current[grpKey] = el; }}
                className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">

                {/* Project section header */}
                <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-3 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                      <i className="fa-solid fa-tag text-white text-xs" />
                    </div>
                    <div>
                      <div className="text-white font-extrabold text-sm">{grp.project}</div>
                      <div className="text-slate-400 text-[11px] font-medium">Brand: {grp.brand}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-bold">
                    <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-full">✅ {grpOnTime} đúng giờ</span>
                    <span className="bg-amber-500/20  text-amber-300  border border-amber-500/30  px-2.5 py-1 rounded-full">⚠️ {grpLate} trễ</span>
                    <span className="bg-rose-500/20   text-rose-300   border border-rose-500/30   px-2.5 py-1 rounded-full">🔴 {grpMissing} chưa CI</span>
                    <span className="bg-white/10 text-slate-300 border border-white/20 px-2.5 py-1 rounded-full">{grp.rows.length} store</span>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs min-w-[900px]">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600 text-left">
                        {['Ngày','Store Code','Tên Store / Siêu Thị','Ca Làm (Lịch)','SUP','Ảnh CI','Giờ CI','Giờ CO','Trạng Thái'].map(h => (
                          <th key={h} className="px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap border-b border-slate-200">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {grp.rows.map((r, i) => {
                        const isSel = selectedRow?.id === r.id;
                        return (
                          <tr key={r.id}
                            onClick={() => setSelectedRow(isSel ? null : r)}
                            className={`cursor-pointer transition-all ${
                              isSel ? 'bg-teal-50 ring-1 ring-inset ring-teal-400'
                              : r.status === 'Chưa CI' ? 'bg-rose-50/40 hover:bg-rose-50'
                              : r.status === 'Đi trễ'  ? 'bg-amber-50/40 hover:bg-amber-50'
                              : i % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/40 hover:bg-slate-50'
                            }`}>
                            <td className="px-3.5 py-3 font-mono text-slate-500 text-[11px] whitespace-nowrap">{r.date}</td>
                            <td className="px-3.5 py-3 font-mono text-[11px] font-bold text-slate-600">{r.storeCode}</td>
                            <td className="px-3.5 py-3 font-bold text-slate-800 whitespace-nowrap">{r.storeName}</td>
                            <td className="px-3.5 py-3 text-slate-600 whitespace-nowrap text-[11px]">{r.workingTime || '—'}</td>
                            <td className="px-3.5 py-3 text-slate-600 whitespace-nowrap text-[11px]">{r.sup || '—'}</td>
                            <td className="px-3.5 py-3">
                              {r.ciPhoto ? (
                                <div className="relative w-10 h-10"
                                  onClick={e => { e.stopPropagation(); setPreviewImages(r.ciPhotos); setPreviewImage(r.ciPhoto); }}>
                                  <img src={r.ciPhoto} alt="CI"
                                    className="w-10 h-10 rounded-lg object-cover border-2 border-emerald-300 cursor-zoom-in hover:opacity-80 transition-all" />
                                  {r.ciPhotos.length > 1 && (
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
                            <td className="px-3.5 py-3 font-mono font-bold text-[11px]">
                              <span className={r.status === 'Đi trễ' ? 'text-amber-700' : r.status === 'Chưa CI' ? 'text-rose-500' : 'text-emerald-700'}>
                                {r.ciTime}
                              </span>
                            </td>
                            <td className="px-3.5 py-3 font-mono text-slate-500 text-[11px]">{r.coTime}</td>
                            <td className="px-3.5 py-3 whitespace-nowrap">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${STATUS_STYLE[r.status] || ''}`}>
                                {r.status === 'Đúng giờ' ? '✅ Đúng giờ'
                                 : r.status === 'Đi trễ' ? '⚠️ Đi trễ'
                                 : '🔴 Chưa CI'}
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
            <button onClick={() => setSelectedRow(null)}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center cursor-pointer transition-colors">
              <i className="fa-solid fa-xmark text-sm" />
            </button>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Info */}
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
              <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 pb-2">Thông Tin Phân Công</h4>
              {[
                ['Dự Án', selectedRow.project],
                ['Brand', selectedRow.brand],
                ['Ca Làm Việc', selectedRow.workingTime],
                ['Supervisor', selectedRow.sup],
                ['Giờ Check-In', selectedRow.ciTime],
                ['Giờ Check-Out', selectedRow.coTime],
                ['Số ảnh CI', selectedRow.ciPhotos.length],
                ['Số ảnh CO', selectedRow.coPhotos.length],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                  <span className="text-slate-500 font-medium">{label}</span>
                  <span className="text-slate-800 font-bold">{value}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-xs py-1">
                <span className="text-slate-500 font-medium">Trạng Thái</span>
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border ${STATUS_STYLE[selectedRow.status]}`}>
                  {selectedRow.status === 'Đúng giờ' ? '✅ Đúng giờ' : selectedRow.status === 'Đi trễ' ? '⚠️ Đi trễ' : '🔴 Chưa CI'}
                </span>
              </div>
            </div>

            {/* Photos */}
            <div className="space-y-3">
              <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 pb-2">Hình Ảnh Check-In / Check-Out</h4>
              <div className="grid grid-cols-2 gap-3">
                {/* CI photos */}
                <div>
                  <div className="text-[11px] font-bold text-emerald-700 mb-1.5">📷 Check-In (CI)</div>
                  {selectedRow.ciPhoto ? (
                    <>
                      <img src={selectedRow.ciPhoto} alt="CI"
                        onClick={() => { setPreviewImages(selectedRow.ciPhotos); setPreviewImage(selectedRow.ciPhoto); }}
                        className="w-full h-40 object-cover rounded-xl border-2 border-emerald-200 cursor-zoom-in hover:opacity-90 transition-all" />
                      {selectedRow.ciPhotos.length > 1 && (
                        <div className="flex gap-1 mt-1.5 overflow-x-auto">
                          {selectedRow.ciPhotos.slice(1).map((p, i) => (
                            <img key={i} src={p} alt={`CI ${i+2}`}
                              onClick={() => { setPreviewImages(selectedRow.ciPhotos); setPreviewImage(p); }}
                              className="w-12 h-12 rounded-lg object-cover border border-slate-200 cursor-zoom-in hover:opacity-80 flex-shrink-0" />
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="h-40 bg-rose-50 rounded-xl flex flex-col items-center justify-center text-rose-400 text-xs border-2 border-dashed border-rose-300 gap-1">
                      <i className="fa-solid fa-image text-xl" /><span className="font-bold">Chưa có ảnh CI</span>
                    </div>
                  )}
                </div>
                {/* CO photos */}
                <div>
                  <div className="text-[11px] font-bold text-blue-700 mb-1.5">📷 Check-Out (CO)</div>
                  {selectedRow.coPhoto ? (
                    <>
                      <img src={selectedRow.coPhoto} alt="CO"
                        onClick={() => { setPreviewImages(selectedRow.coPhotos); setPreviewImage(selectedRow.coPhoto); }}
                        className="w-full h-40 object-cover rounded-xl border-2 border-blue-200 cursor-zoom-in hover:opacity-90 transition-all" />
                    </>
                  ) : (
                    <div className="h-40 bg-slate-100 rounded-xl flex flex-col items-center justify-center text-slate-400 text-xs border-2 border-dashed border-slate-300 gap-1">
                      <i className="fa-solid fa-image text-xl" /><span className="font-bold">Chưa có ảnh CO</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-400 flex items-center gap-2">
            <i className="fa-solid fa-shield-halved text-slate-300" />
            Field Operation Dashboard · {new Date().toLocaleDateString('vi-VN')} · UFF Automated Report
          </div>
        </div>
      )}

      {/* ── IMAGE LIGHTBOX ── */}
      {previewImage && (
        <div onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out">
          <div className="relative max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewImage(null)}
              className="absolute -top-4 -right-4 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 text-white flex items-center justify-center cursor-pointer transition-colors z-10 text-lg">
              <i className="fa-solid fa-xmark" />
            </button>
            <img src={previewImage} alt="Preview" className="w-full max-h-[85vh] object-contain rounded-2xl" />
            {/* Thumbnails row for multiple photos */}
            {previewImages.length > 1 && (
              <div className="flex gap-2 justify-center mt-3 overflow-x-auto pb-1">
                {previewImages.map((p, i) => (
                  <img key={i} src={p} alt={`img ${i+1}`}
                    onClick={() => setPreviewImage(p)}
                    className={`w-14 h-14 rounded-lg object-cover cursor-pointer transition-all border-2 shrink-0 ${p === previewImage ? 'border-teal-400 opacity-100' : 'border-white/20 opacity-60 hover:opacity-100'}`} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────── */
function KpiBox({ icon, label, value, color, tooltip }) {
  const clr = {
    blue:    'bg-blue-50 border-blue-200 text-blue-800',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    amber:   'bg-amber-50 border-amber-200 text-amber-800',
    rose:    'bg-rose-50 border-rose-200 text-rose-800',
  }[color];
  return (
    <div className={`border rounded-2xl p-4 shadow-xs ${clr}`} title={tooltip || ''}>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-1.5 opacity-70">
        <i className={`fa-solid ${icon}`} /> {label}
      </div>
      <div className="text-2xl font-extrabold">{value}</div>
    </div>
  );
}
