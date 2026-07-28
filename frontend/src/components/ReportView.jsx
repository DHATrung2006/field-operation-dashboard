import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import JSZip from 'jszip';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { fetchMasterData } from '../api/googleSheets';

/* ═════════════════════════════════════════════════════════════════════
   UFF CONFIG
   ═════════════════════════════════════════════════════════════════════ */
const UFF_CONFIG = {
  baseUrl: 'https://uff.interdist.com.vn/',
  username: 'TRUNG.DHA',
};

/* ═════════════════════════════════════════════════════════════════════
   STYLE MAPS
   ═════════════════════════════════════════════════════════════════════ */
const STATUS_STYLE = {
  'Đúng giờ': 'bg-emerald-100 text-emerald-800 border-emerald-300',
  'Đi trễ':   'bg-amber-100 text-amber-800 border-amber-300',
  'Chưa CI':  'bg-rose-100 text-rose-800 border-rose-300',
};

/* ═════════════════════════════════════════════════════════════════════
   DATE HELPERS
   ═════════════════════════════════════════════════════════════════════ */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/** Parse Vietnamese date "Thứ Sáu, 3 tháng 7, 2026" or "DD/MM/YYYY" → "YYYY-MM-DD" */
function parseVNDateISO(str) {
  if (!str) return null;
  let m = str.match(/(\d+)\s+tháng\s+(\d+),\s+(\d+)/i);
  if (m) return `${m[3]}-${String(+m[2]).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`;
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${String(+m[2]).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`;
  m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${String(+m[2]).padStart(2,'0')}-${String(+m[3]).padStart(2,'0')}`;
  return null;
}

/** Compare check-in time against scheduled start time → "Đúng giờ" or "Đi trễ" */
function checkLateStatus(ciTimeStr, scheduledWorkingTime) {
  if (!ciTimeStr || ciTimeStr === '—') return 'Chưa CI';
  if (!scheduledWorkingTime) return 'Đúng giờ';
  // scheduledWorkingTime format: "08:00 - 17:00" or "15:30-21:30"
  const startMatch = scheduledWorkingTime.match(/(\d{1,2}):(\d{2})/);
  if (!startMatch) return 'Đúng giờ';
  const schedH = +startMatch[1];
  const schedM = +startMatch[2];
  const ciMatch = ciTimeStr.match(/(\d{1,2}):(\d{2})/);
  if (!ciMatch) return 'Đúng giờ';
  const ciH = +ciMatch[1];
  const ciM = +ciMatch[2];
  // Late if CI time is more than 5 minutes after scheduled start
  const schedMins = schedH * 60 + schedM;
  const ciMins = ciH * 60 + ciM;
  return ciMins > schedMins + 5 ? 'Đi trễ' : 'Đúng giờ';
}

/** Normalize store name for fuzzy matching */
function normStore(s) {
  return (s || '').trim().toLowerCase()
    .replace(/[_\-\.]/g, ' ')
    .replace(/\s+/g, ' ');
}

/* ═════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═════════════════════════════════════════════════════════════════════ */
export default function ReportView({ refreshKey }) {
  const [masterData, setMasterData] = useState([]);
  const [uffZipData, setUffZipData] = useState(null);      // parsed from zip
  const [zipStats, setZipStats]     = useState(null);       // { totalImages, totalStores, dates, project }
  const [isProcessingZip, setIsProcessingZip] = useState(false);
  const [zipFileName, setZipFileName] = useState('');
  const [zipProgress, setZipProgress] = useState('');

  // Filters
  const [search, setSearch]       = useState('');
  const [selProject, setSelProject] = useState('Tất cả');
  const [selDate, setSelDate]     = useState('');
  const [selStatus, setSelStatus] = useState('');
  const [selectedRow, setSelectedRow] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);

  // API state
  const [apiStatus, setApiStatus] = useState('idle');
  const [apiMsg, setApiMsg]       = useState('');

  const contentRef = useRef();
  const modalRef   = useRef();
  const fileInputRef = useRef();

  /* ── Load Google Sheet Master Data ── */
  useEffect(() => {
    fetchMasterData()
      .then(data => { if (Array.isArray(data)) setMasterData(data); })
      .catch(err => console.warn('Master data fetch error:', err));
  }, [refreshKey]);

  /* ═══════════════════════════════════════════════════════════════════
     ZIP FILE PARSER — CORE LOGIC
     ═══════════════════════════════════════════════════════════════════ */
  const handleZipUpload = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setZipFileName(file.name);
    setIsProcessingZip(true);
    setZipProgress('Đang đọc file zip...');

    // ── Project prefix → full name mapping ──────────────────────────
    // Covers all known UFF export prefixes. Add more as needed.
    const PROJECT_MAP = {
      // P&G variants
      'PNG': 'P&G', 'PNG': 'P&G', 'PG': 'P&G', 'P&G': 'P&G',
      // MAGGI / Nestle
      'MAG': 'MAGGI', 'MAGGI': 'MAGGI', 'MGI': 'MAGGI',
      // NESTCAFE / NESCAFE
      'NCF': 'NESTCAFE', 'NSF': 'NESTCAFE', 'NESTCAFE': 'NESTCAFE',
      'NESCAFE': 'NESTCAFE', 'NSC': 'NESTCAFE', 'NES': 'NESTCAFE',
      // VINDA
      'VDA': 'VINDA', 'VND': 'VINDA', 'VINDA': 'VINDA', 'VIN': 'VINDA',
      // Others — add as needed
      'STM': 'STMB', 'STMB': 'STMB',
      'UNI': 'Unilever', 'UL': 'Unilever', 'UNILEVER': 'Unilever',
      'AEO': 'AEON', 'AEON': 'AEON',
    };

    /**
     * Detects the project folder using the pattern:
     *   PREFIX_YYYYMMDD_YYYYMMDD   (e.g. PnG_20260720_20260726)
     *   or PREFIX_YYYYMMDD          (e.g. MAG_20260720)
     * Works for ANY prefix, not just hardcoded ones.
     */
    const detectProjectFolder = (part) => {
      // Must match: LETTERS_8DIGITS or LETTERS_8DIGITS_8DIGITS
      const m = part.match(/^([A-Za-z&]+)_\d{8}(_\d{8})?$/);
      if (!m) return '';
      const prefix = m[1].toUpperCase();
      return PROJECT_MAP[prefix] || prefix; // return mapped name or raw prefix
    };

    try {
      const zip = await JSZip.loadAsync(file);
      const storeMap = {};
      let totalImages = 0;
      let detectedProject = '';

      const filePaths = Object.keys(zip.files).filter(fp => !zip.files[fp].dir);
      const imagePaths = filePaths.filter(fp => /\.(jpg|jpeg|png|webp)$/i.test(fp));

      setZipProgress(`Đang phân tích ${imagePaths.length} ảnh...`);

      for (let idx = 0; idx < imagePaths.length; idx++) {
        const filePath = imagePaths[idx];
        const fileObj = zip.files[filePath];

        // Update progress every 20 images
        if (idx % 20 === 0) {
          setZipProgress(`Đang xử lý ảnh ${idx + 1} / ${imagePaths.length}...`);
        }

        const parts = filePath.split(/[/\\]/);
        // Expected structure (depth-flexible):
        //   [root/] ProjFolder / DateFolder / ShopFolder / image.jpg
        
        let datePart = '';
        let shopPart = '';
        let projPart = '';
        let projFolderFound = false;

        for (let pi = 0; pi < parts.length; pi++) {
          const p = parts[pi];

          // 1. Detect project folder: LETTERS_YYYYMMDD[_YYYYMMDD]
          const detectedProj = detectProjectFolder(p);
          if (detectedProj && !projFolderFound) {
            projPart = detectedProj;
            projFolderFound = true;
            continue;
          }

          // 2. Detect date folder: exactly 8 digits YYYYMMDD
          if (/^\d{8}$/.test(p)) {
            datePart = `${p.slice(0,4)}-${p.slice(4,6)}-${p.slice(6,8)}`;
            continue;
          }

          // 3. Detect shop folder: contains underscore, not an image file, not a date folder, not the last part (filename)
          const isImageFile = /\.(jpg|jpeg|png|webp)$/i.test(p);
          const isLastPart = pi === parts.length - 1;
          if (!isLastPart && !isImageFile && p.includes('_') && !/^\d{8}$/.test(p)) {
            shopPart = p;
          }
        }

        // Fallback: if still no shopPart, take parent folder of the image
        if (!shopPart && parts.length >= 2) {
          const parent = parts[parts.length - 2];
          if (!/^\d{8}$/.test(parent) && !detectProjectFolder(parent)) {
            shopPart = parent;
          }
        }

        if (!datePart) continue; // skip if we can't determine the date
        if (projPart) detectedProject = projPart;

        const fileName = parts[parts.length - 1];
        const fileNameLower = fileName.toLowerCase();
        const isCI = fileNameLower.includes('ci') || fileNameLower.includes('checkin') || fileNameLower.includes('check_in');
        const isCO = fileNameLower.includes('co') || fileNameLower.includes('checkout') || fileNameLower.includes('check_out');

        // Create blob URL for image display
        const blob = await fileObj.async('blob');
        const imgUrl = URL.createObjectURL(blob);
        totalImages++;

        const key = `${datePart}||${shopPart}`;
        if (!storeMap[key]) {
          let storeCode = shopPart;
          let storeName = shopPart;
          if (shopPart.includes('_')) {
            const sp = shopPart.split('_');
            storeCode = sp[0];
            storeName = sp.slice(1).join(' ');
          }
          storeMap[key] = {
            id: key,
            date: datePart,
            storeCode,
            storeName,
            project: projPart || 'UFF',
            ciPhotos: [],
            coPhotos: [],
            checkinTime: '—',
            checkoutTime: '—',
            status: 'Đúng giờ',
            source: 'zip',
          };
        }

        const rec = storeMap[key];
        if (isCO) {
          rec.coPhotos.push(imgUrl);
          // Try to extract time from filename
          const tm = fileName.match(/(\d{2})(\d{2})/);
          if (tm && +tm[1] >= 0 && +tm[1] <= 23) {
            rec.checkoutTime = `${tm[1]}:${tm[2]}`;
          }
        } else {
          // Default: treat as CI photo
          rec.ciPhotos.push(imgUrl);
          const tm = fileName.match(/(\d{2})(\d{2})/);
          if (tm && +tm[1] >= 0 && +tm[1] <= 23) {
            rec.checkinTime = `${tm[1]}:${tm[2]}`;
          }
        }
      }

      const parsedList = Object.values(storeMap);
      const allDates = [...new Set(parsedList.map(r => r.date))].sort();

      if (parsedList.length > 0) {
        setUffZipData(parsedList);
        setZipStats({
          totalImages,
          totalStores: parsedList.length,
          dates: allDates,
          project: detectedProject,
        });
        setZipProgress('');
        // Auto-select project filter
        if (detectedProject) setSelProject(detectedProject);
      } else {
        alert('Không tìm thấy tệp ảnh hợp lệ trong file zip.\nVui lòng kiểm tra cấu trúc folder: DuAn_YYYYMMDD_YYYYMMDD/YYYYMMDD/ShopCode_ShopName/ảnh.jpg');
        setZipProgress('');
      }
    } catch (err) {
      console.error('Error reading zip:', err);
      alert('Không thể đọc file zip: ' + err.message);
      setZipProgress('');
    } finally {
      setIsProcessingZip(false);
    }
  }, []);

  /* ═══════════════════════════════════════════════════════════════════
     UFF API TEST CONNECTION
     ═══════════════════════════════════════════════════════════════════ */
  const handleConnectAPI = async () => {
    setApiStatus('connecting');
    setApiMsg('Đang gửi yêu cầu đăng nhập tới UFF API...');
    try {
      const res = await fetch(`${UFF_CONFIG.baseUrl}api/Auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: 'TRUNG.DHA',
          password: '12345678',
          deviceToken: 'web-dashboard-client',
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setApiStatus('connected');
        setApiMsg(`✅ Kết nối UFF thành công! Token: ${json.token ? json.token.slice(0,20)+'…' : 'OK'}`);
      } else {
        setApiStatus('error');
        setApiMsg(`⚠️ HTTP ${res.status}. Vui lòng dùng phương pháp tải file Zip thủ công.`);
      }
    } catch (err) {
      setApiStatus('error');
      setApiMsg(`⚠️ Lỗi CORS/Network: ${err.message}.\nHãy tải file Zip trực tiếp từ web UFF rồi upload lên đây để đối soát.`);
    }
  };

  /* ═══════════════════════════════════════════════════════════════════
     BUILD DISPLAY ROWS — CROSS-REFERENCE ZIP DATA WITH MASTER SCHEDULE
     ═══════════════════════════════════════════════════════════════════ */
  const displayRows = useMemo(() => {
    // Step 1: Parse master schedule into lookup
    const scheduleByDateStore = new Map(); // "YYYY-MM-DD||normStoreName" → { ...masterRow }

    if (masterData.length > 0) {
      for (const m of masterData) {
        const rawDate = m['Date'] || m['Ngày'] || '';
        const isoDate = parseVNDateISO(rawDate);
        if (!isoDate) continue;

        const sName = normStore(m['Store Name'] || m['Mart Name'] || m['Store Code'] || '');
        if (!sName) continue;

        const key = `${isoDate}||${sName}`;
        scheduleByDateStore.set(key, {
          storeCode: (m['Store Code'] || m['Mart Code'] || '').trim(),
          storeName: (m['Store Name'] || m['Mart Name'] || '').trim(),
          project: (m['Project'] || '').trim(),
          brand: (m['Brand'] || '').trim(),
          workingTime: (m['Working Time'] || m['Thời Gian Làm Việc'] || '').trim(),
          sup: (m['Sup'] || m['Supervisor'] || '').trim(),
          region: (m['Region'] || '').trim(),
          date: isoDate,
        });
      }
    }

    let rows = [];

    if (uffZipData && uffZipData.length > 0) {
      // Step 2: Enrich zip data with master schedule info
      const matchedScheduleKeys = new Set();

      for (const z of uffZipData) {
        const zNorm = normStore(z.storeName);
        const lookupKey = `${z.date}||${zNorm}`;

        // Try exact match first
        let sched = scheduleByDateStore.get(lookupKey);

        // Fuzzy match: try partial match on store code or name
        if (!sched) {
          for (const [k, v] of scheduleByDateStore.entries()) {
            if (!k.startsWith(z.date + '||')) continue;
            const schedNorm = normStore(v.storeName);
            const schedCode = normStore(v.storeCode);
            if (schedNorm.includes(zNorm) || zNorm.includes(schedNorm) ||
                (z.storeCode && schedCode === normStore(z.storeCode))) {
              sched = v;
              matchedScheduleKeys.add(k);
              break;
            }
          }
        } else {
          matchedScheduleKeys.add(lookupKey);
        }

        const workingTime = sched?.workingTime || '';
        const status = checkLateStatus(z.checkinTime, workingTime);

        rows.push({
          ...z,
          ciPhoto: z.ciPhotos?.[0] || null,
          coPhoto: z.coPhotos?.[0] || null,
          ciPhotoCount: z.ciPhotos?.length || 0,
          coPhotoCount: z.coPhotos?.length || 0,
          brand: sched?.brand || z.project,
          workingTime: workingTime || '—',
          sup: sched?.sup || '—',
          region: sched?.region || 'HCM',
          status,
          matchedSchedule: !!sched,
        });
      }

      // Step 3: Find scheduled stores that are MISSING from zip (Chưa CI)
      // Only for dates that exist in the zip
      const zipDates = new Set(uffZipData.map(z => z.date));
      const zipProject = zipStats?.project || '';

      for (const [key, sched] of scheduleByDateStore.entries()) {
        if (matchedScheduleKeys.has(key)) continue;
        if (!zipDates.has(sched.date)) continue;
        // If zip has a specific project, only flag missing for same project
        if (zipProject && sched.project && !sched.project.toLowerCase().includes(zipProject.toLowerCase()) &&
            !zipProject.toLowerCase().includes(sched.project.toLowerCase())) {
          continue;
        }

        rows.push({
          id: `missing_${key}`,
          date: sched.date,
          storeCode: sched.storeCode,
          storeName: sched.storeName,
          project: sched.project || '—',
          brand: sched.brand || '—',
          workingTime: sched.workingTime || '—',
          sup: sched.sup || '—',
          region: sched.region || 'HCM',
          status: 'Chưa CI',
          checkinTime: '—',
          checkoutTime: '—',
          ciPhoto: null,
          coPhoto: null,
          ciPhotos: [],
          coPhotos: [],
          ciPhotoCount: 0,
          coPhotoCount: 0,
          matchedSchedule: true,
          source: 'schedule',
        });
      }
    } else {
      // No zip uploaded — show today's schedule from master data with all "Chưa CI"
      const today = todayISO();
      for (const [key, sched] of scheduleByDateStore.entries()) {
        if (sched.date !== today) continue;
        rows.push({
          id: `sched_${key}`,
          date: sched.date,
          storeCode: sched.storeCode,
          storeName: sched.storeName,
          project: sched.project || '—',
          brand: sched.brand || '—',
          workingTime: sched.workingTime || '—',
          sup: sched.sup || '—',
          region: sched.region || 'HCM',
          status: 'Chưa CI',
          checkinTime: '—',
          checkoutTime: '—',
          ciPhoto: null,
          coPhoto: null,
          ciPhotos: [],
          coPhotos: [],
          ciPhotoCount: 0,
          coPhotoCount: 0,
          matchedSchedule: true,
          source: 'schedule',
        });
      }
    }

    // Apply UI Filters
    if (selProject && selProject !== 'Tất cả') {
      const q = selProject.toLowerCase();
      rows = rows.filter(r =>
        (r.project || '').toLowerCase().includes(q) ||
        (r.brand || '').toLowerCase().includes(q)
      );
    }
    if (selDate) {
      rows = rows.filter(r => r.date === selDate);
    }
    if (selStatus) {
      rows = rows.filter(r => r.status === selStatus);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        (r.storeName || '').toLowerCase().includes(q) ||
        (r.storeCode || '').toLowerCase().includes(q) ||
        (r.sup || '').toLowerCase().includes(q) ||
        (r.project || '').toLowerCase().includes(q)
      );
    }

    // Sort: Chưa CI first, then Đi trễ, then Đúng giờ
    const statusOrder = { 'Chưa CI': 0, 'Đi trễ': 1, 'Đúng giờ': 2 };
    rows.sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9) || a.date.localeCompare(b.date));

    return rows;
  }, [uffZipData, masterData, zipStats, selProject, selDate, selStatus, search]);

  /* ── Unique dates & projects for filter dropdowns ── */
  const uniqueDates = useMemo(() => {
    if (zipStats?.dates?.length) return zipStats.dates;
    const dates = [...new Set(displayRows.map(r => r.date))].filter(Boolean).sort().reverse();
    return dates.length > 0 ? dates : [todayISO()];
  }, [displayRows, zipStats]);

  const uniqueProjects = useMemo(() => {
    const projs = [...new Set(displayRows.map(r => r.project).filter(Boolean))].sort();
    return ['Tất cả', ...projs];
  }, [displayRows]);

  /* ── KPIs ── */
  const totalRecords = displayRows.length;
  const onTimeCount  = displayRows.filter(r => r.status === 'Đúng giờ').length;
  const lateCount    = displayRows.filter(r => r.status === 'Đi trễ').length;
  const missingCount = displayRows.filter(r => r.status === 'Chưa CI').length;
  const uniqueStores = new Set(displayRows.map(r => normStore(r.storeName))).size;

  /* ── PDF Exports ── */
  const exportPDF = async () => {
    const el = contentRef.current;
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true });
    const img = canvas.toDataURL('image/png');
    const pdf = new jsPDF('l', 'mm', 'a3');
    const w = pdf.internal.pageSize.getWidth();
    pdf.addImage(img, 'PNG', 0, 0, w, (canvas.height * w) / canvas.width);
    pdf.save(`BaoCao_UFF_${todayISO()}.pdf`);
  };

  const exportCustomerReport = async () => {
    if (!selectedRow) return alert('Vui lòng chọn 1 dòng store trước khi xuất báo cáo.');
    const el = modalRef.current;
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true });
    const img = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const w = pdf.internal.pageSize.getWidth();
    pdf.addImage(img, 'PNG', 0, 0, w, (canvas.height * w) / canvas.width);
    pdf.save(`BaoCao_Store_${selectedRow.storeCode}_${selectedRow.date}.pdf`);
  };

  const clearZipData = () => {
    setUffZipData(null);
    setZipStats(null);
    setZipFileName('');
    setSelectedRow(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /* ═══════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-5">
      {/* ══ HEADER ══ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white flex items-center justify-center text-sm shadow-md">
              <i className="fa-solid fa-camera" />
            </div>
            Báo cáo UFF — Đối Soát Check-In BA
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Tải file Zip ảnh CI/CO từ web UFF → tự động đối soát với Lịch Master trên Google Sheet → phát hiện BA đi trễ / chưa CI.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={exportCustomerReport}
            className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-xs transition-all cursor-pointer">
            <i className="fa-solid fa-file-invoice" /> Báo Cáo Store
          </button>
          <button onClick={exportPDF}
            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-xs transition-all cursor-pointer">
            <i className="fa-solid fa-file-pdf" /> Xuất PDF
          </button>
        </div>
      </div>

      {/* ══ UPLOAD ZONE + API CONNECTOR ══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT: Zip Uploader */}
        <div className="lg:col-span-2 bg-gradient-to-br from-teal-900 to-slate-900 text-white p-5 rounded-2xl shadow-lg border border-teal-800/30 relative overflow-hidden">
          <div className="relative z-10 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-teal-300 font-bold text-sm uppercase tracking-wider">
                <i className="fa-solid fa-file-zipper text-base" /> Tải File Zip Ảnh UFF
              </div>
              {zipFileName && (
                <div className="flex items-center gap-2">
                  <span className="bg-teal-500/20 text-teal-300 text-[11px] px-2.5 py-1 rounded-full font-mono border border-teal-400/30">
                    📁 {zipFileName}
                  </span>
                  <button onClick={clearZipData}
                    className="text-[10px] bg-rose-500/30 hover:bg-rose-500/50 text-rose-300 px-2 py-0.5 rounded-full border border-rose-400/30 cursor-pointer transition-colors">
                    ✕ Xóa
                  </button>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Vào <strong className="text-teal-200">web UFF</strong> → chọn Dự án → <strong className="text-teal-200">Xuất dữ liệu → Tải ảnh/tệp</strong> → upload file Zip vào đây.
              <br/>Cấu trúc folder: <code className="text-teal-200 text-[10px]">PnG_20260720_20260726 / 20260720 / BHX001_BHX Dang Van Bi / ảnh CI.jpg</code>
            </p>

            <label className="border-2 border-dashed border-teal-400/30 hover:border-teal-300 bg-teal-950/40 hover:bg-teal-900/40 rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer transition-all">
              <input ref={fileInputRef} type="file" accept=".zip" onChange={handleZipUpload} disabled={isProcessingZip} className="hidden" />
              {isProcessingZip ? (
                <div className="flex flex-col items-center gap-2 py-2">
                  <i className="fa-solid fa-circle-notch animate-spin text-teal-400 text-2xl" />
                  <span className="text-teal-200 text-xs font-bold">{zipProgress}</span>
                </div>
              ) : (
                <div className="text-center">
                  <i className="fa-solid fa-cloud-arrow-up text-3xl text-teal-400 mb-2" />
                  <div className="text-xs font-bold text-slate-200">Nhấn để chọn file hoặc kéo thả file Zip vào đây</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Tự động giải nén, nhận diện dự án, ngày, siêu thị &amp; ảnh CI/CO</div>
                </div>
              )}
            </label>

            {/* Zip summary after upload */}
            {zipStats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                <MiniStat icon="fa-images" label="Ảnh" value={zipStats.totalImages} />
                <MiniStat icon="fa-store" label="Cửa hàng" value={zipStats.totalStores} />
                <MiniStat icon="fa-calendar" label="Ngày" value={zipStats.dates.length} />
                <MiniStat icon="fa-tag" label="Dự án" value={zipStats.project || '—'} />
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: API Connector */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center gap-2 text-slate-800 font-bold text-sm mb-2">
              <i className="fa-solid fa-server text-blue-600" /> Kết Nối UFF API
            </div>
            <div className="text-xs text-slate-500 space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <strong className="text-slate-600">URL:</strong>
                <span className="font-mono text-[10px] text-blue-700">{UFF_CONFIG.baseUrl}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <strong className="text-slate-600">User:</strong>
                <span className="font-mono text-[10px]">{UFF_CONFIG.username}</span>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <button onClick={handleConnectAPI} disabled={apiStatus === 'connecting'}
              className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold py-2.5 px-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50">
              <i className={`fa-solid ${apiStatus === 'connecting' ? 'fa-spinner animate-spin' : 'fa-plug'}`} />
              {apiStatus === 'connecting' ? 'Đang kiểm tra...' : 'Test Kết Nối API'}
            </button>
            {apiMsg && (
              <div className={`text-[11px] p-2.5 rounded-xl leading-snug font-medium whitespace-pre-wrap ${
                apiStatus === 'connected'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : apiStatus === 'error'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-slate-50 text-slate-600 border border-slate-200'
              }`}>
                {apiMsg}
              </div>
            )}
            <p className="text-[10px] text-slate-400 leading-tight mt-1">
              💡 Nếu API bị CORS, hãy xuất file Zip thủ công từ web UFF rồi upload lên khung bên trái.
            </p>
          </div>
        </div>
      </div>

      {/* ══ KPI ROW ══ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiBox icon="fa-store"     label="Tổng Store"     value={uniqueStores} color="blue" />
        <KpiBox icon="fa-list"      label="Tổng Dòng"      value={totalRecords} color="slate" />
        <KpiBox icon="fa-circle-check" label="Đúng Giờ"    value={onTimeCount}  color="emerald" />
        <KpiBox icon="fa-clock"     label="Đi Trễ"         value={lateCount}    color="amber" />
        <KpiBox icon="fa-triangle-exclamation" label="Chưa CI / Vắng" value={missingCount} color="rose" />
      </div>

      {/* ══ FILTER BAR ══ */}
      <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3.5 shadow-xs flex flex-wrap gap-3 items-end">
        <FilterInput label="🔍 Tìm kiếm" value={search} onChange={setSearch} placeholder="Store, SUP, dự án..." width="w-48" />
        <FilterSelect label="Dự Án" value={selProject} onChange={setSelProject} options={uniqueProjects} />
        <FilterSelect label="Ngày" value={selDate} onChange={setSelDate}
          options={['', ...uniqueDates]}
          renderOption={(v) => v || 'Tất cả ngày'} />
        <FilterSelect label="Trạng Thái" value={selStatus} onChange={setSelStatus}
          options={[
            { value: '', label: 'Tất cả' },
            { value: 'Đúng giờ', label: '✅ Đúng giờ' },
            { value: 'Đi trễ', label: '⚠️ Đi trễ' },
            { value: 'Chưa CI', label: '🔴 Chưa CI / Vắng' },
          ]} />
        <div className="self-end pb-2 ml-auto text-xs text-slate-400 font-medium">
          {selectedRow ? (
            <span className="text-teal-700 font-bold">✓ {selectedRow.storeName} ({selectedRow.date})</span>
          ) : uffZipData ? (
            <span className="text-blue-600">📋 {displayRows.length} dòng · Click chọn store xem ảnh</span>
          ) : (
            <span className="text-slate-400">Tải file Zip UFF lên để bắt đầu đối soát</span>
          )}
        </div>
      </div>

      {/* ══ MAIN TABLE ══ */}
      <div ref={contentRef} className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs min-w-[1000px]">
            <thead>
              <tr className="bg-slate-800 text-white text-left">
                {['Ngày', 'Dự Án', 'Brand', 'Store Code', 'Tên Store / Siêu Thị', 'Ca Làm (Lịch)', 'SUP', 'Ảnh CI', 'Giờ CI', 'Giờ CO', 'Trạng Thái'].map(h => (
                  <th key={h} className="px-3 py-3 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayRows.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-10 text-center text-slate-400">
                    <div className="space-y-2">
                      <i className="fa-solid fa-inbox text-3xl text-slate-300" />
                      <div className="font-bold text-sm">{uffZipData ? 'Không có dữ liệu phù hợp bộ lọc.' : 'Chưa có dữ liệu Check-In.'}</div>
                      <div className="text-xs">{!uffZipData && 'Tải file Zip ảnh CI/CO từ web UFF lên để bắt đầu đối soát tự động.'}</div>
                    </div>
                  </td>
                </tr>
              )}
              {displayRows.map((r, i) => {
                const isSelected = selectedRow === r;
                return (
                  <tr key={r.id || i}
                    onClick={() => setSelectedRow(isSelected ? null : r)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-teal-50 ring-1 ring-inset ring-teal-400'
                      : r.status === 'Chưa CI' ? 'bg-rose-50/30 hover:bg-rose-50'
                      : r.status === 'Đi trễ' ? 'bg-amber-50/30 hover:bg-amber-50'
                      : i % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-100/50'
                    }`}>
                    <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap text-[11px]">{r.date}</td>
                    <td className="px-3 py-2.5 font-bold text-slate-700 text-[11px]">{r.project}</td>
                    <td className="px-3 py-2.5 text-slate-500 text-[11px]">{r.brand}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-500 text-[11px]">{r.storeCode}</td>
                    <td className="px-3 py-2.5 font-bold text-slate-800 whitespace-nowrap">{r.storeName}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap text-[11px]">{r.workingTime}</td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap text-[11px]">{r.sup}</td>
                    <td className="px-3 py-2.5">
                      {r.ciPhoto ? (
                        <div onClick={(e) => { e.stopPropagation(); setPreviewImage(r.ciPhoto); }}
                          className="w-10 h-10 rounded-lg overflow-hidden border-2 border-emerald-300 hover:border-emerald-500 transition-all cursor-zoom-in shadow-xs relative">
                          <img src={r.ciPhoto} alt="CI" className="w-full h-full object-cover" />
                          {r.ciPhotoCount > 1 && (
                            <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                              {r.ciPhotoCount}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center">
                          <i className="fa-solid fa-camera-slash text-slate-300 text-[10px]" />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono font-bold text-[11px]">
                      <span className={r.status === 'Đi trễ' ? 'text-amber-700' : r.status === 'Chưa CI' ? 'text-rose-500' : 'text-emerald-700'}>
                        {r.checkinTime || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-600 text-[11px]">{r.checkoutTime || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border whitespace-nowrap ${STATUS_STYLE[r.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {r.status === 'Đúng giờ' && '✅ '}{r.status === 'Đi trễ' && '⚠️ '}{r.status === 'Chưa CI' && '🔴 '}
                        {r.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══ STORE DETAIL PANEL ══ */}
      {selectedRow && (
        <div ref={modalRef} className="bg-white border-2 border-teal-400 rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-teal-700 to-cyan-700 px-6 py-4 text-white flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-base flex items-center gap-2">
                <i className="fa-solid fa-store" /> CHI TIẾT — {selectedRow.storeName}
              </h3>
              <p className="text-xs text-teal-100 mt-0.5">
                Ngày: {selectedRow.date} · Dự án: {selectedRow.project} · Brand: {selectedRow.brand} · Mã: {selectedRow.storeCode}
              </p>
            </div>
            <button onClick={() => setSelectedRow(null)}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center cursor-pointer transition-colors">
              <i className="fa-solid fa-xmark text-sm" />
            </button>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Info */}
            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 pb-2">
                Thông Tin Phân Công &amp; Đối Soát
              </h4>
              <InfoRow label="Supervisor" value={selectedRow.sup} />
              <InfoRow label="Ca Làm Việc (Lịch)" value={selectedRow.workingTime} />
              <InfoRow label="Giờ Check-In thực tế" value={selectedRow.checkinTime || 'Chưa CI'} />
              <InfoRow label="Giờ Check-Out thực tế" value={selectedRow.checkoutTime || 'Chưa CO'} />
              <InfoRow label="Số ảnh CI" value={selectedRow.ciPhotoCount || 0} />
              <InfoRow label="Số ảnh CO" value={selectedRow.coPhotoCount || 0} />
              <InfoRow label="Trạng Thái"
                value={
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border ${STATUS_STYLE[selectedRow.status]}`}>
                    {selectedRow.status}
                  </span>
                } />
              <InfoRow label="Nguồn" value={selectedRow.source === 'zip' ? '📁 File Zip UFF' : '📋 Lịch Master (Chưa CI)'} />
            </div>

            {/* Right: Photos */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 pb-2">
                Hình Ảnh Check-In / Check-Out
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] font-bold text-emerald-700 mb-1.5">📷 Ảnh Check-In (CI)</div>
                  {selectedRow.ciPhoto ? (
                    <img src={selectedRow.ciPhoto} alt="CI"
                      onClick={() => setPreviewImage(selectedRow.ciPhoto)}
                      className="w-full h-40 object-cover rounded-xl border-2 border-emerald-200 shadow-xs cursor-zoom-in hover:opacity-90 transition-all" />
                  ) : (
                    <div className="h-40 bg-rose-50 rounded-xl flex flex-col items-center justify-center text-rose-400 text-xs border-2 border-dashed border-rose-300 gap-1">
                      <i className="fa-solid fa-image text-xl" />
                      <span className="font-bold">Chưa có ảnh CI</span>
                    </div>
                  )}
                  {/* Additional CI photos */}
                  {selectedRow.ciPhotos?.length > 1 && (
                    <div className="flex gap-1.5 mt-2 overflow-x-auto">
                      {selectedRow.ciPhotos.slice(1).map((p, idx) => (
                        <img key={idx} src={p} alt={`CI ${idx+2}`}
                          onClick={() => setPreviewImage(p)}
                          className="w-12 h-12 rounded-lg object-cover border border-slate-200 cursor-zoom-in hover:opacity-80 transition-all flex-shrink-0" />
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[11px] font-bold text-blue-700 mb-1.5">📷 Ảnh Check-Out (CO)</div>
                  {selectedRow.coPhoto ? (
                    <img src={selectedRow.coPhoto} alt="CO"
                      onClick={() => setPreviewImage(selectedRow.coPhoto)}
                      className="w-full h-40 object-cover rounded-xl border-2 border-blue-200 shadow-xs cursor-zoom-in hover:opacity-90 transition-all" />
                  ) : (
                    <div className="h-40 bg-slate-100 rounded-xl flex flex-col items-center justify-center text-slate-400 text-xs border-2 border-dashed border-slate-300 gap-1">
                      <i className="fa-solid fa-image text-xl" />
                      <span className="font-bold">Chưa có ảnh CO</span>
                    </div>
                  )}
                  {selectedRow.coPhotos?.length > 1 && (
                    <div className="flex gap-1.5 mt-2 overflow-x-auto">
                      {selectedRow.coPhotos.slice(1).map((p, idx) => (
                        <img key={idx} src={p} alt={`CO ${idx+2}`}
                          onClick={() => setPreviewImage(p)}
                          className="w-12 h-12 rounded-lg object-cover border border-slate-200 cursor-zoom-in hover:opacity-80 transition-all flex-shrink-0" />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-400 flex items-center gap-2">
            <i className="fa-solid fa-shield-halved text-slate-300" />
            Báo cáo đối soát tự động — Field Operation Dashboard · {new Date().toLocaleDateString('vi-VN')}
          </div>
        </div>
      )}

      {/* ══ FULLSCREEN IMAGE PREVIEW ══ */}
      {previewImage && (
        <div onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 cursor-zoom-out backdrop-blur-sm">
          <div className="max-w-4xl w-full bg-white rounded-2xl p-2 relative overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewImage(null)}
              className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black transition-colors z-10 cursor-pointer">
              <i className="fa-solid fa-xmark text-lg" />
            </button>
            <img src={previewImage} alt="Full preview" className="w-full max-h-[85vh] object-contain rounded-xl" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═════════════════════════════════════════════════════════════════════ */
function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-slate-500 font-medium">{label}</span>
      <span className="text-slate-800 font-bold">{value}</span>
    </div>
  );
}

function KpiBox({ icon, label, value, color }) {
  const clr = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    amber:   'bg-amber-50 border-amber-200 text-amber-800',
    rose:    'bg-rose-50 border-rose-200 text-rose-800',
    blue:    'bg-blue-50 border-blue-200 text-blue-800',
    slate:   'bg-slate-50 border-slate-200 text-slate-800',
  }[color];
  return (
    <div className={`border rounded-2xl p-4 shadow-xs ${clr}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-1.5 opacity-80">
        <i className={`fa-solid ${icon}`} /> {label}
      </div>
      <div className="text-2xl font-extrabold">{value}</div>
    </div>
  );
}

function MiniStat({ icon, label, value }) {
  return (
    <div className="bg-teal-800/40 border border-teal-700/30 rounded-lg px-3 py-2 text-center">
      <div className="text-[10px] text-teal-400 font-bold uppercase tracking-wide mb-0.5">
        <i className={`fa-solid ${icon} mr-1`} />{label}
      </div>
      <div className="text-lg font-extrabold text-teal-100">{value}</div>
    </div>
  );
}

function FilterInput({ label, value, onChange, placeholder, width = 'w-44' }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={`border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white text-slate-700 outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-400 ${width} font-medium`} />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, renderOption }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white text-slate-700 font-bold outline-none cursor-pointer">
        {options.map((opt, i) => {
          if (typeof opt === 'object') {
            return <option key={opt.value} value={opt.value}>{opt.label}</option>;
          }
          return <option key={opt || `opt_${i}`} value={opt}>{renderOption ? renderOption(opt) : opt}</option>;
        })}
      </select>
    </div>
  );
}
