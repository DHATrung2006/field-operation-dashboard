  import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../firebase';
  import jsPDF from 'jspdf';
  import html2canvas from 'html2canvas';
  import { fetchMasterData } from '../api/googleSheets';
  import { getIdToken } from '../firebase';
  import * as XLSX from 'xlsx';

  /* ─── Constants ─────────────────────────────────────────────── */
  const STATUS_STYLE = {
    'Đúng giờ': 'bg-emerald-100 text-emerald-800 border-emerald-200',
    'Đi trễ':   'bg-amber-100  text-amber-800  border-amber-200',
    'Chưa CI':  'bg-rose-100   text-rose-800   border-rose-200',
  };

  // Layout cho Báo Cáo Khách Hàng (thẻ ảnh lớn, render ẩn rồi chụp html2canvas theo từng trang)
  // Giảm còn 2 thẻ/hàng (trước là 3) để thẻ rộng hơn — ảnh CI không còn bị bóp/cắt nhiều theo
  // chiều ngang, và khung chữ bên dưới đủ rộng để hiện tên store/BA mà không bị cắt/che mất.
  const PRINT_PAGE_W = 1500;
  const PRINT_CARDS_PER_ROW = 2;
  const PRINT_ROWS_PER_PAGE = 2;
  const PRINT_CARDS_PER_PAGE = PRINT_CARDS_PER_ROW * PRINT_ROWS_PER_PAGE;

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

  /** Cắt chuỗi theo số ký tự cố định (không dựa vào CSS ellipsis — html2canvas render không
      luôn đáng tin cậy với overflow/text-overflow, dễ gây chữ đè lên thẻ bên cạnh khi in PDF). */
  function truncate(str, maxChars) {
    const s = String(str || '');
    return s.length > maxChars ? s.slice(0, maxChars - 1).trimEnd() + '…' : s;
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

  /** Robust store matcher — so khớp theo mã/tên cửa hàng thực tế.
      (Trước đây có thêm bước chặn theo "dự án đã biết" (PREFIX_MAP/KNOWN_PROJECTS), nhưng
      danh sách đó chỉ là rút gọn của vài chuỗi bán lẻ lớn và còn gộp nhầm cả tên dự án/kênh
      (CRV, BA VINDA...) vào tên brand (P&G, VINDA...) — gây chặn nhầm nhiều match hợp lệ.
      Đã bỏ bước đó, chỉ dựa vào mã/tên cửa hàng — đáng tin cậy và cụ thể hơn nhiều.) */
  function isStoreMatch(sched, zip) {
    // ─── STORE CODE MATCH ────────────────────────────────────────
    // Khớp CHÍNH XÁC toàn bộ mã (không còn dùng includes()/chuỗi con) — mã ngắn/rút gọn (vd
    // Excel chỉ ghi "010") vốn vừa là chuỗi con của "BHX010" vừa của "LCM010", 2 cửa hàng khác
    // chuỗi hoàn toàn không liên quan — dùng includes() sẽ luôn dính nhầm vào bất kỳ dòng Lịch
    // nào duyệt tới trước (từng khiến "BHX Lê Văn Việt" bị gộp nhầm check-in vào "LCM010").
    const codeS = cleanStoreStr(sched.storeCode).replace(/\s/g, '');
    const codeZ = cleanStoreStr(zip.storeCode).replace(/\s/g, '');
    if (codeS && codeZ && codeS.length >= 3 && codeS === codeZ) {
      return true;
    }

    // ─── NUMERIC CODE MATCH ──────────────────────────────────────
    // Chỉ lấy số từ MÃ cửa hàng (không lấy số trong TÊN nữa — số nhà/số quận trong địa chỉ dễ
    // trùng ngẫu nhiên với mã 1 cửa hàng khác). Bắt buộc khớp CHÍNH XÁC toàn bộ chuỗi số, VÀ nếu
    // cả 2 mã đều có phần chữ (prefix chuỗi, vd BHX/LCM) thì phần chữ đó cũng phải khớp — nếu
    // không, 2 chuỗi khác nhau nhưng trùng số thứ tự (BHX010 vs LCM010) sẽ bị nhận nhầm là cùng
    // 1 cửa hàng dù thuộc 2 chuỗi bán lẻ hoàn toàn khác nhau.
    const numS = extractDigits(sched.storeCode);
    const numZ = extractDigits(zip.storeCode);
    if (numS && numZ && numS.length >= 3 && numZ.length >= 3 && numS === numZ) {
      const prefixS = cleanStoreStr(sched.storeCode).replace(/[0-9\s]/g, '');
      const prefixZ = cleanStoreStr(zip.storeCode).replace(/[0-9\s]/g, '');
      
      // Nếu cả hai đều có prefix thì prefix phải khớp (vd: BHX == BHX)
      if (prefixS && prefixZ && prefixS === prefixZ) return true;
      
      // Nếu một trong hai KHÔNG CÓ prefix (chỉ có số), KHÔNG TỰ ĐỘNG MATCH NGAY
      // vì "010" có thể là của "BHX010" hoặc "LCM010". Để phần NAME MATCH quyết định tiếp.
    }

    // ─── NAME MATCH ──────────────────────────────────────────────
    const nameS = cleanStoreStr(sched.storeName);
    const nameZ = cleanStoreStr(zip.storeName);
    if (nameS && nameZ) {
      // Kiểm tra xem tên có quá ngắn hoặc chỉ là số không
      const isSShortOrNum = /^\d+$/.test(nameS.replace(/\s/g, '')) || nameS.length < 5;
      const isZShortOrNum = /^\d+$/.test(nameZ.replace(/\s/g, '')) || nameZ.length < 5;
      
      // Chỉ dùng includes khi cả 2 chuỗi đều đủ dài và có chữ (tránh "010" includes trong "bhx 010")
      if (!isSShortOrNum && !isZShortOrNum) {
        if (nameS.includes(nameZ) || nameZ.includes(nameS)) return true;
      }

      // Khớp gần đúng theo từ — yêu cầu TOÀN BỘ từ có nghĩa (>1 ký tự, để không loại nhầm tên
      // chuỗi ngắn như "GO") của MỘT bên đều xuất hiện ở bên kia (không chỉ đa số/50%). Nhiều
      // chuỗi bán lẻ khác nhau đặt chi nhánh cùng 1 khu vực nên tên hay trùng phần địa danh
      // (vd: "GO Thăng Long", "Mega Thăng Long", "Winmart Thăng Long" đều có "Thăng Long") —
      // đòi khớp đa số vẫn nhầm chuỗi vì từ phân biệt chuỗi ("GO"/"Mega") bị bỏ qua. Kiểm tra
      // theo cả 2 chiều để vẫn khớp được khi 1 bên có thêm vài từ mô tả phụ (vd: quận/phường).
      const wordsZ = nameZ.split(' ').filter(w => w.length > 1);
      const wordsS = nameS.split(' ').filter(w => w.length > 1);
      const zAllInS = wordsZ.length >= 2 && wordsZ.every(w => nameS.includes(w));
      const sAllInZ = wordsS.length >= 2 && wordsS.every(w => nameZ.includes(w));
      if (zAllInS || sAllInZ) return true;
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

  window.localPhotoMap = window.localPhotoMap || {};

  async function parseExcelCI(file, fallbackDate) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

          if (rows.length === 0) return resolve([]);

          // Find correct keys by checking lowercase versions
          const keys = Object.keys(rows[0]);
          const keyMap = {};
          for (const k of keys) {
            const lowerK = k.toLowerCase().trim();
            if (lowerK.includes('mã nhân viên') || lowerK.includes('mã nv')) keyMap.empCode = k;
            if (lowerK.includes('tên nhân viên') || lowerK.includes('tên nv')) keyMap.empName = k;
            if (lowerK.includes('mã cửa hàng') || lowerK.includes('mã siêu thị')) keyMap.storeCode = k;
            if (lowerK.includes('tên cửa hàng') || lowerK.includes('siêu thị')) keyMap.storeName = k;
            if (lowerK.includes('ngày ci')) keyMap.dateCI = k;
            if (lowerK.includes('thời gian ci') || lowerK.includes('giờ ci')) keyMap.timeCI = k;
            if (lowerK.includes('thời gian co') || lowerK.includes('giờ co')) keyMap.timeCO = k;
            if (lowerK.includes('kênh')) keyMap.channel = k;
          }

          if (!keyMap.empCode) {
            return reject(new Error("File Excel không đúng định dạng chuẩn. Cần có cột 'Mã nhân viên' và 'Thời gian CI'."));
          }

          const records = [];
          for (const row of rows) {
            const empCode = row[keyMap.empCode]?.toString().trim();
            if (!empCode) continue;

            let dateIso = fallbackDate;
            if (keyMap.dateCI && row[keyMap.dateCI]) {
              const rawDate = row[keyMap.dateCI].toString().trim();
              const dateParts = rawDate.split('/'); // DD/MM/YYYY
              if (dateParts.length === 3) dateIso = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
            }
            
            let ciTime = null;
            if (keyMap.timeCI && row[keyMap.timeCI]) {
              ciTime = row[keyMap.timeCI].toString().trim();
              if (ciTime === '-' || ciTime === '' || ciTime === '00:00:00') ciTime = null;
            }

            let coTime = null;
            if (keyMap.timeCO && row[keyMap.timeCO]) {
              coTime = row[keyMap.timeCO].toString().trim();
              if (coTime === '-' || coTime === '' || coTime === '00:00:00') coTime = null;
            }

            const storeCode = keyMap.storeCode ? row[keyMap.storeCode]?.toString().trim() : 'Unknown';
            const storeName = keyMap.storeName ? row[keyMap.storeName]?.toString().trim() : storeCode;
            const project = keyMap.channel ? row[keyMap.channel]?.toString().trim() : 'UFF Excel';

            records.push({
              empCode: empCode.toUpperCase(),
              coTime,
              date: dateIso,
              storeCode,
              storeName,
              empName: keyMap.empName ? row[keyMap.empName]?.toString().trim() : empCode,
              ciTime,
              // Key phải khớp với localPhotoMap: LOCAL_{date}_{empCode}
              cicoId: `LOCAL_${dateIso}_${empCode.toUpperCase()}`,
              project
            });
          }
          resolve(records);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Lỗi khi đọc file Excel."));
      reader.readAsArrayBuffer(file);
    });
  }

  /** Convert the server's normalized UFF CICO response into the existing row model. */
  function makeUffApiSession(records, selectedDate) {
    const storeMap = {};

    for (const item of records) {
      const date = parseVNDate(item.date || '') || selectedDate;
      // Không dùng item.storeId làm mã cửa hàng thay thế — với dữ liệu đồng bộ online, storeId
      // (nếu có) chỉ là id của lượt check-in, không phải mã cửa hàng, dùng để so khớp sẽ bị nhiễu.
      const storeCode = String(item.storeCode || item.storeName || 'STORE').trim();
      const key = `${date}||${storeCode.toUpperCase()}`;
      if (!storeMap[key]) {
        storeMap[key] = {
          key,
          date,
          storeCode,
          storeName: item.storeName || storeCode,
          empName: item.empName || '—',
          projLabel: item.project || 'Khác',
          ciTime: item.ciTime || null,
          coTime: item.coTime || null,
          cicoId: item.cicoId || null,
        };
      }

      const rec = storeMap[key];
      if (!rec.ciTime && item.ciTime) rec.ciTime = item.ciTime;
      if (!rec.coTime && item.coTime) rec.coTime = item.coTime;
      if (!rec.cicoId && item.cicoId) rec.cicoId = item.cicoId;
    }

    const storeEntries = Object.values(storeMap);
    const dates = [...new Set(storeEntries.map(item => item.date))].sort();
    return {
      id: `uff_api_${Date.now()}`,
      source: 'uff-api',
      fileName: `Đồng bộ API UFF · ${selectedDate}`,
      project: 'UFF API',
      storeCount: storeEntries.length,
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

    // API test
    const [apiStatus, setApiStatus] = useState('idle');
    const [apiMsg,    setApiMsg]    = useState('');

    // Ảnh CI nạp theo yêu cầu (lazy) qua /api/uff/photo, khoá theo cicoId
    const [photoCache, setPhotoCache] = useState({}); // { [cicoId]: 'loading' | { photos, error } }
    const photoRequestsInFlight = useRef(new Set());

    // Offline Import States
    const [excelFile, setExcelFile] = useState(null);
    const [folderFiles, setFolderFiles] = useState([]);
    const [uploadProgress, setUploadProgress] = useState(null); // { current, total, text }
    
    const excelInputRef = useRef();
    const folderInputRef = useRef();

    const projectRefs = useRef({});
    const modalRef     = useRef();
    const printRefs    = useRef({});
    const [exportingClient, setExportingClient] = useState(false);
    const [exportProject,  setExportProject]    = useState('Tất cả');

    /* ── Tải Dữ Liệu Check-in Offline ── */
    const fetchOfflineCico = useCallback(async (date) => {
      try {
        const { data, error } = await supabase
          .from('uff_offline_cico')
          .select('*')
          .eq('date', date);
        if (error) throw error;
        
        if (data && data.length > 0) {
           const records = data.map(d => ({
             date: d.date,
             ciTime: d.ci_time,
             coTime: d.co_time,
             cicoId: d.cico_id,
             storeId: d.cico_id,
             storeCode: d.store_code,
             storeName: d.store_name,
             empName: d.emp_name,
             project: d.project
           }));
           const session = makeUffApiSession(records, date);
           session.source = 'uff-offline-db';
           session.fileName = `Dữ liệu lưu trữ (Offline) · ${date}`;
           setSessions(prev => {
             const others = prev.filter(p => p.source !== 'uff-offline-db');
             return [session, ...others];
           });
        }
      } catch (err) {
         console.error("Lỗi khi tải dữ liệu offline từ Supabase:", err);
      }
    }, []);

    useEffect(() => {
      fetchOfflineCico(selDate);
    }, [selDate, fetchOfflineCico]);

    /* ── Load Master Data ── */
    useEffect(() => {
      fetchMasterData()
        .then(d => { if (Array.isArray(d)) setMasterData(d); })
        .catch(() => {});
    }, [refreshKey]);

    /* Nạp ảnh CI cho 1 lượt check-in (lazy, gọi khi người dùng thực sự cần xem) */
    const loadCiPhoto = useCallback(async (cicoId, { force = false } = {}) => {
      if (!cicoId) return;

      // Ảnh Offline (Local)
      if (cicoId.startsWith('LOCAL_')) {
        const urls = window.localPhotoMap && window.localPhotoMap[cicoId];
        if (urls && urls.length > 0) {
            setPhotoCache(prev => ({ ...prev, [cicoId]: { photos: urls.map(u => ({ dataUri: u })), error: null } }));
        } else {
            setPhotoCache(prev => ({ ...prev, [cicoId]: { photos: [], error: 'Chưa nạp thư mục ảnh cho nhân viên này.' } }));
        }
        return;
      }

      if (!force && photoRequestsInFlight.current.has(cicoId)) return;
      photoRequestsInFlight.current.add(cicoId);
      setPhotoCache(prev => ({ ...prev, [cicoId]: 'loading' }));
      try {
        const idToken = await getIdToken();
        const res = await fetch(`/api/uff/photo?cicoId=${encodeURIComponent(cicoId)}`, {
          headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.message || `HTTP ${res.status}`);
        setPhotoCache(prev => ({ ...prev, [cicoId]: { photos: body.photos || [], error: null } }));
      } catch (err) {
        setPhotoCache(prev => ({ ...prev, [cicoId]: { photos: [], error: err.message || 'Không tải được ảnh.' } }));
      } finally {
        photoRequestsInFlight.current.delete(cicoId);
      }
    }, []);

    /* Trạng thái ảnh CI hiện tại của 1 lượt check-in, đọc từ photoCache */
    const getPhotoEntry = (cicoId) => {
      if (!cicoId) return { state: 'no-id' };
      const entry = photoCache[cicoId];
      if (!entry) return { state: 'idle' };
      if (entry === 'loading') return { state: 'loading' };
      if (entry.error) return { state: 'error', error: entry.error };
      if (!entry.photos.length) return { state: 'empty' };
      return { state: 'ready', photos: entry.photos.map(p => p.dataUri) };
    };

  /* Xử lý Hybrid: Excel + Ảnh Folder */
  const handleHybridProceed = async () => {
    if (!excelFile) {
      alert('Vui lòng chọn File Excel CI báo cáo UFF trước!');
      return;
    }
    
    try {
      // 1. Map folder files — chỉ lấy ảnh CI, dùng empCode+date làm key
      let photoCount = 0;
      if (folderFiles.length > 0) {
        for (const file of folderFiles) {
          if (!file.type.startsWith('image/')) continue;
          const parts = file.webkitRelativePath.split('/');
          if (parts.length < 4) continue;

          // Tìm thư mục ngày (8 chữ số, vd: 20260730)
          const dateIndex = parts.findIndex(p => /^\d{8}$/.test(p));
          if (dateIndex === -1) continue;

          // Chỉ lấy ảnh CI (bỏ qua CO)
          const typeFolder = parts[dateIndex + 3];
          if (typeFolder && typeFolder.toUpperCase() !== 'CI') continue;

          const rawDate = parts[dateIndex];
          const dateIso = `${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6,8)}`;

          // parts[dateIndex+1] = 'AE0002_Aeon Binh Tan' (store folder)
          // parts[dateIndex+2] = 'NCBA0134_Vo Huong Quynh' (employee folder)
          const empStr = parts[dateIndex + 2];
          if (!empStr) continue;

          const empCode = empStr.split('_')[0].toUpperCase();
          if (!empCode || empCode.length < 4) continue; // bỏ qua nếu không phải mã NV hợp lệ

          // Key khớp 100% với cicoId trong parseExcelCI
          const cicoId = `LOCAL_${dateIso}_${empCode}`;

          if (!window.localPhotoMap[cicoId]) window.localPhotoMap[cicoId] = [];
          window.localPhotoMap[cicoId].push(URL.createObjectURL(file));
          photoCount++;
        }
      }

      // 2. Đọc file Excel
      const records = await parseExcelCI(excelFile, selDate);
      if (records.length === 0) {
        alert('Không tìm thấy dữ liệu hợp lệ trong file Excel.');
        return;
      }

      // 3. Tạo session
      const session = makeUffApiSession(records, selDate);
      session.source = 'uff-offline';
      session.fileName = `Offline Import · ${records.length} CI${photoCount > 0 ? ` + ${photoCount} Ảnh` : ''}`;
      
      setSessions(prev => [session, ...prev]);
      setPhotoCache(prev => ({...prev})); // Trigger re-render to load local photo state
      
      // Reset
      setExcelFile(null);
      setFolderFiles([]);
      if (excelInputRef.current) excelInputRef.current.value = '';
      if (folderInputRef.current) folderInputRef.current.value = '';
      
      alert(`Đã hợp nhất thành công ${records.length} lượt Check-in và ${photoCount} hình ảnh!`);
    } catch (e) {
      alert(e.message);
    }
  };

    /* Merged check-in lookup (hiện chỉ có 1 nguồn: session đồng bộ từ UFF API) */
  const mergedZipMap = useMemo(() => {
    const m = new Map();
    for (const sess of sessions) {
      for (const [k, v] of Object.entries(sess.storeMap)) {
        if (!m.has(k)) m.set(k, { ...v });
        else {
          const ex = m.get(k);
          if (!ex.ciTime && v.ciTime) ex.ciTime = v.ciTime;
          if (!ex.coTime && v.coTime) ex.coTime = v.coTime;
          if (!ex.cicoId && v.cicoId) ex.cicoId = v.cicoId;
        }
      }
    }
    return m;
  }, [sessions]);

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
        project:     rawProj || 'Khác',
        brand:       (m['Brand'] || '').trim() || rawProj || 'Khác',
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
      const ciTime = zip?.ciTime || (zip ? '—' : null);
      const status = zip
        ? calcStatus(ciTime, sched.workingTime)
        : 'Chưa CI';

      // Dự án hiển thị NGUYÊN VĂN từ Lịch (giống cách tab Summary đang hiển thị: r['Project'].trim(),
      // không chuẩn hoá/gộp nhóm gì cả) — CRV, BHX, BA VINDA... đều là dự án thật, giữ đúng tên,
      // không để nhãn chung chung từ zip (thường chỉ là tên tenant UFF) đè lên.
      const bestProject = sched.project !== 'Khác' ? sched.project : (zip?.projLabel || 'Khác');

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
        cicoId:      zip?.cicoId || null,
      });
    });

    // 2. Loop unmatched Zip entries
    // Nếu ngày này CÓ Lịch Master nhưng lượt check-in này không khớp được store nào trong Lịch
    // (tên/mã cửa hàng trên UFF khác với Lịch), KHÔNG dùng zip.projLabel (chỉ là tên tenant/công ty
    // đăng ký trên UFF, ví dụ "LMC") làm tên dự án — dễ hiểu lầm là cửa hàng thuộc dự án khác (bug
    // "BHX Lê Văn Việt nhảy xuống LMC"). Gom hết các lượt không khớp vào 1 nhóm cảnh báo riêng để
    // biết ngay là cần kiểm tra lại tên/mã cửa hàng trong Lịch, thay vì tưởng nhầm là sai dự án.
    const hasScheduleForDate = schedForDate.length > 0;
    zipForDate.forEach((zip, i) => {
      if (matchedZipKeys.has(zip.key)) return;

      const rawProj = hasScheduleForDate ? '⚠️ Chưa khớp Lịch' : (zip.projLabel || 'Khác');
      const rowId  = `zip_${zip.date}_${zip.storeCode}_${i}`;
      const ciTime = zip.ciTime || '—';
      const status = calcStatus(ciTime, null);

      mergedRows.push({
        id:          rowId,
        date:        zip.date,
        project:     rawProj,
        brand:       zip.projLabel || 'Khác',
        storeCode:   zip.storeCode,
        storeName:   zip.storeName,
        empName:     zip.empName || '—',
        workingTime: '—',
        sup:         '—',
        region:      '—',
        ciTime,
        status,
        cicoId:      zip.cicoId || null,
      });
    });

    // Filters
    let filtered = mergedRows;
    if (selProject && selProject !== 'Tất cả') {
      filtered = filtered.filter(r => r.project === selProject || r.brand === selProject);
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
  }, [scheduleRows, mergedZipMap, selDate, selProject, selStatus, search]);

  // Group BY PROJECT ONLY
  const groupedRows = useMemo(() => {
    const m = new Map();
    for (const r of displayRows) {
      const k = r.project; // Keep original raw project name
      if (!m.has(k)) m.set(k, { project: k, brand: r.brand, rows: [] });
      const grp = m.get(k);
      if (r.brand && r.brand !== '—' && r.brand !== k && (!grp.brand || grp.brand === k || grp.brand === '—')) {
        grp.brand = r.brand;
      }
      grp.rows.push(r);
    }
    return [...m.values()];
  }, [displayRows]);

  /* Chia nhỏ groupedRows thành từng trang (mỗi trang tối đa PRINT_CARDS_PER_PAGE store)
     để mỗi trang PDF chụp 1 canvas riêng — tránh bị vỡ ảnh/cắt ngang thẻ khi 1 dự án có quá nhiều store. */
  const printChunks = useMemo(() => {
    const chunks = [];
    for (const grp of groupedRows) {
      const totalPages = Math.max(1, Math.ceil(grp.rows.length / PRINT_CARDS_PER_PAGE));
      for (let i = 0; i < totalPages; i++) {
        chunks.push({
          key: `${grp.project}__${i}`,
          project: grp.project,
          brand: grp.brand,
          rows: grp.rows.slice(i * PRINT_CARDS_PER_PAGE, (i + 1) * PRINT_CARDS_PER_PAGE),
          pageIndex: i + 1,
          totalPages,
        });
      }
    }
    return chunks;
  }, [groupedRows]);

  /* ── KPIs ── */
  const totalScheduled = displayRows.length;
  const onTimeCount    = displayRows.filter(r => r.status === 'Đúng giờ').length;
  const lateCount      = displayRows.filter(r => r.status === 'Đi trễ').length;
  const missingCount   = displayRows.filter(r => r.status === 'Chưa CI').length;

  /* ── Handle row click → tự nạp ảnh CI nếu chưa có ── */
  const handleRowClick = useCallback((row) => {
    setSelectedRow(prev => prev?.id === row.id ? null : row);
    if (row.cicoId && !photoCache[row.cicoId]) {
      loadCiPhoto(row.cicoId);
    }
  }, [photoCache, loadCiPhoto]);

  /* ── PDF Export ── */
  const exportAllPDF = async () => {
    // Nạp trước ảnh CI cho mọi dòng đang hiển thị (bulk fetch duy nhất được phép,
    // vì đây là hành động người dùng chủ động bấm, không chạy ngầm lúc đồng bộ).
    const pendingIds = displayRows
      .map(r => r.cicoId)
      .filter(id => id && !photoCache[id]);
    if (pendingIds.length) {
      await Promise.all(pendingIds.map(id => loadCiPhoto(id)));
    }

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
    if (selectedRow.cicoId && !photoCache[selectedRow.cicoId]) {
      await loadCiPhoto(selectedRow.cicoId);
    }
    if (!modalRef.current) return;
    const canvas = await html2canvas(modalRef.current, { scale: 2, useCORS: true });
    const pdf = new jsPDF('p','mm','a4');
    const w = pdf.internal.pageSize.getWidth();
    pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,w,(canvas.height*w)/canvas.width);
    pdf.save(`Store_${selectedRow.storeCode}_${selectedRow.date}.pdf`);
  };

  /* ── Xuất Báo Cáo Khách Hàng: mỗi store 1 thẻ ảnh lớn, gộp theo dự án ── */
  const exportClientPDF = async () => {
    const rowsToExport = exportProject === 'Tất cả'
      ? displayRows
      : displayRows.filter(r => r.project === exportProject);
    const chunksToExport = exportProject === 'Tất cả'
      ? printChunks
      : printChunks.filter(c => c.project === exportProject);

    if (!rowsToExport.length || !chunksToExport.length) {
      alert(`Không có dữ liệu của dự án "${exportProject}" để xuất báo cáo.`);
      return;
    }
    setExportingClient(true);
    try {
      // Nạp trước toàn bộ ảnh CI đang thiếu cho các dòng sẽ xuất
      const pendingIds = rowsToExport
        .map(r => r.cicoId)
        .filter(id => id && !photoCache[id]);
      if (pendingIds.length) {
        await Promise.all(pendingIds.map(id => loadCiPhoto(id)));
      }

      // Chờ React render lại DOM ẩn với ảnh mới + chờ ảnh vẽ xong trước khi chụp canvas
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      await new Promise(resolve => setTimeout(resolve, 400));

      const pdf = new jsPDF('l', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const pageAR = pageW / pageH;

      let first = true;
      for (const chunk of chunksToExport) {
        const el = printRefs.current[chunk.key];
        if (!el) continue;
        const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
        if (!first) pdf.addPage();

        // Fit "contain": luôn hiện trọn nội dung trong trang, không bao giờ bị cắt mất,
        // dù tỉ lệ khung ảnh/thẻ chụp được có lệch với tỉ lệ trang A4 ngang.
        const canvasAR = canvas.width / canvas.height;
        let drawW, drawH;
        if (canvasAR > pageAR) {
          drawW = pageW;
          drawH = pageW / canvasAR;
        } else {
          drawH = pageH;
          drawW = pageH * canvasAR;
        }
        const xOff = (pageW - drawW) / 2;
        const yOff = (pageH - drawH) / 2;
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', xOff, yOff, drawW, drawH);
        first = false;
      }

      const projSlug = exportProject === 'Tất cả' ? 'TatCa' : exportProject.replace(/[^\p{L}\p{N}]+/gu, '_');
      pdf.save(`BaoCao_KhachHang_${projSlug}_${selDate}.pdf`);
    } catch (e) {
      alert(e.message || 'Không thể xuất báo cáo.');
    } finally {
      setExportingClient(false);
    }
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
      
      if (body.records?.length) {
        setApiMsg(`✅ Đã đồng bộ ${body.records.length} lượt check-in từ UFF.`);
      } else {
        if (body.meta?.cicos > 0) {
           console.log('--- DEBUG UFF API ---');
           console.log('Tổng số raw CICO UFF trả về:', body.meta.cicos);
           console.log('Mẫu 1 dòng dữ liệu gốc chưa xử lý:', body.meta.debug?.sampleRaw);
           console.log('---------------------');
           setApiMsg('⚠️ Có dữ liệu từ UFF nhưng hệ thống không khớp được định dạng. (Hãy nhấn F12 mở Console để xem chi tiết)');
        } else {
           setApiMsg('⚠️ UFF không trả về lượt check-in nào cho ngày đã chọn.');
        }
      }
    } catch (err) {
      setApiStatus('error');
      setApiMsg(`⚠️ ${err.message || 'Không thể đồng bộ UFF.'}`);
    }
  };

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */
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
            Đồng bộ giờ check-in (và ảnh CI khi cần) qua UFF API → đối soát với Lịch Master.
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
          <div className="flex items-center rounded-xl border border-indigo-200 bg-indigo-50 overflow-hidden">
            <select value={exportProject} onChange={e => setExportProject(e.target.value)}
              title="Chọn dự án sẽ xuất báo cáo"
              className="bg-transparent text-indigo-800 text-xs font-bold pl-3 pr-1.5 py-2 outline-none cursor-pointer max-w-[140px]">
              {projectsOnDate.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <button onClick={exportClientPDF} disabled={exportingClient}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold pl-2.5 pr-3.5 py-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              <i className={`fa-solid ${exportingClient ? 'fa-spinner animate-spin' : 'fa-images'}`} />
              {exportingClient ? 'Đang tạo...' : 'Xuất Báo Cáo Khách Hàng'}
            </button>
          </div>
        </div>
      </div>

      {/* ── API / OFFLINE CONNECTOR ── */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col gap-3">
        <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
          <i className="fa-solid fa-server text-blue-600" /> Đồng Bộ Dữ Liệu UFF
        </div>
        
        {/* Offline Methods */}
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col gap-3">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 pb-2">
            Đồng Bộ Offline (File + Ảnh)
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className={`flex flex-col items-center justify-center gap-1.5 ${excelFile ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'} border text-xs font-bold py-3 rounded-xl transition-all cursor-pointer shadow-sm`}>
              <i className={`fa-solid ${excelFile ? 'fa-file-excel text-emerald-500' : 'fa-file-csv'} text-lg`} /> 
              {excelFile ? 'Đã chọn File Excel' : 'Tải Lên File Excel CI'}
              <input type="file" ref={excelInputRef} accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => setExcelFile(e.target.files[0])} />
            </label>
            <label className={`flex flex-col items-center justify-center gap-1.5 ${folderFiles.length ? 'bg-purple-100 border-purple-300 text-purple-800' : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'} border text-xs font-bold py-3 rounded-xl transition-all cursor-pointer shadow-sm`}>
              <i className={`fa-solid ${folderFiles.length ? 'fa-images text-emerald-500' : 'fa-folder-open'} text-lg`} /> 
              {folderFiles.length ? `Đã chọn ${folderFiles.length} File` : 'Tải Lên Thư Mục Ảnh'}
              <input type="file" ref={folderInputRef} webkitdirectory="true" directory="true" multiple className="hidden" onChange={(e) => setFolderFiles(Array.from(e.target.files))} />
            </label>
          </div>
          <button onClick={handleHybridProceed} disabled={!excelFile}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md disabled:opacity-50 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed">
            <i className="fa-solid fa-wand-magic-sparkles" /> Tiến Hành Xử Lý Dữ Liệu
          </button>
        </div>

        {/* Online API Sync */}
        <button onClick={handleSyncUFF} disabled={apiStatus==='connecting'}
          className="w-full bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 mt-1">
          <i className={`fa-solid ${apiStatus==='connecting'?'fa-spinner animate-spin':'fa-plug'}`} />
          {apiStatus==='connecting' ? 'Đang đồng bộ tự động...' : `Đồng Bộ API Tự Động (Ngày ${selDate})`}
        </button>

        {apiMsg && (
          <div className={`text-[11px] p-2.5 rounded-xl font-medium ${apiStatus==='connected'?'bg-emerald-50 text-emerald-700 border border-emerald-200':'bg-amber-50 text-amber-700 border border-amber-200'}`}>
            {apiMsg}
          </div>
        )}
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
          <div className="text-xs mt-1">Hãy chọn ngày khác ở bộ lọc phía trên hoặc nhấn Đồng Bộ Ngày để lấy dữ liệu UFF.</div>
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
                        {['Ngày','Store Code','Tên Store / Siêu Thị','Nhân Viên (BA)','Ca Làm (Lịch)','SUP','Ảnh CI','Giờ CI', 'Giờ CO','Trạng Thái'].map(h=>(
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
                            <td className="px-3.5 py-3" onClick={e=>e.stopPropagation()}>
                              {(() => {
                                const p = getPhotoEntry(r.cicoId);
                                if (p.state === 'idle') {
                                  return (
                                    <button onClick={()=>loadCiPhoto(r.cicoId)} title="Xem ảnh CI"
                                      className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 flex items-center justify-center cursor-pointer transition-colors">
                                      <i className="fa-solid fa-camera text-blue-500 text-[11px]" />
                                    </button>
                                  );
                                }
                                if (p.state === 'loading') {
                                  return (
                                    <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center">
                                      <i className="fa-solid fa-circle-notch animate-spin text-indigo-400 text-[11px]" />
                                    </div>
                                  );
                                }
                                if (p.state === 'error') {
                                  return (
                                    <button onClick={()=>loadCiPhoto(r.cicoId, { force: true })} title={p.error}
                                      className="w-10 h-10 rounded-lg bg-rose-50 border border-rose-200 hover:bg-rose-100 flex items-center justify-center cursor-pointer transition-colors">
                                      <i className="fa-solid fa-triangle-exclamation text-rose-400 text-[11px]" />
                                    </button>
                                  );
                                }
                                if (p.state === 'ready') {
                                  return (
                                    <div className="relative w-10 h-10"
                                      onClick={()=>{ setPreviewList(p.photos); setPreviewImage(p.photos[0]); }}>
                                      <img src={p.photos[0]} alt="CI"
                                        className="w-10 h-10 rounded-lg object-cover border-2 border-emerald-300 cursor-zoom-in hover:opacity-80 transition-all" />
                                      {p.photos.length>1 && (
                                        <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[8px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center">
                                          {p.photos.length}
                                        </span>
                                      )}
                                    </div>
                                  );
                                }
                                // 'no-id' hoặc 'empty'
                                return (
                                  <div className="w-10 h-10 rounded-lg bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center"
                                    title={p.state === 'empty' ? 'UFF không có ảnh cho lượt check-in này' : ''}>
                                    <i className="fa-solid fa-camera-slash text-slate-300 text-[10px]" />
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="px-3.5 py-3 font-mono font-bold text-[11px]">
                              <span className={r.status==='Đi trễ'?'text-amber-700':r.status==='Chưa CI'?'text-rose-500':'text-emerald-700'}>
                                {r.ciTime || '—'}
                              </span>
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
                ['Giờ Check-In', selectedRow.ciTime],
                ['Số ảnh CI', (() => {
                  const p = getPhotoEntry(selectedRow.cicoId);
                  if (p.state === 'loading') return '🔍 đang tải...';
                  if (p.state === 'ready') return p.photos.length;
                  if (p.state === 'error') return '⚠️ lỗi tải ảnh';
                  return 0;
                })()],
              ].map(([lbl, val]) => (
                <div key={lbl} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 last:border-0">
                  <span className="text-slate-500 font-medium">{lbl}</span>
                  <span className="font-bold text-slate-800">{val}</span>
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
                {(() => {
                  const p = getPhotoEntry(selectedRow.cicoId);
                  if (p.state === 'loading') {
                    return (
                      <div className="h-52 bg-indigo-50 border-2 border-dashed border-indigo-200 text-indigo-400 rounded-xl flex flex-col items-center justify-center text-xs gap-2">
                        <i className="fa-solid fa-circle-notch animate-spin text-2xl" />
                        <span className="font-bold">Đang tải ảnh CI từ UFF...</span>
                      </div>
                    );
                  }
                  if (p.state === 'ready') {
                    return (
                      <>
                        <img src={p.photos[0]} alt="CI"
                          onClick={()=>{ setPreviewList(p.photos); setPreviewImage(p.photos[0]); }}
                          className="w-full h-52 object-cover rounded-xl border-2 border-emerald-200 cursor-zoom-in hover:opacity-90 transition-all" />
                        {p.photos.length > 1 && (
                          <div className="flex gap-2 justify-center mt-3 overflow-x-auto pb-1">
                            {p.photos.map((src, idx) => (
                              <img key={idx} src={src} onClick={(e)=>{e.stopPropagation();setPreviewImage(src);}} 
                                className={`h-16 w-16 object-cover rounded-lg cursor-pointer border-2 transition-all ${src===previewImage?'border-white opacity-100':'border-transparent opacity-50 hover:opacity-100'}`} />
                            ))}
                          </div>
                        )}
                      </>
                    );
                  }
                  if (p.state === 'error') {
                    return (
                      <div className="h-52 bg-rose-50 border-2 border-dashed border-rose-300 text-rose-400 rounded-xl flex flex-col items-center justify-center text-xs gap-2 px-4 text-center">
                        <i className="fa-solid fa-triangle-exclamation text-2xl" />
                        <span className="font-bold">{p.error}</span>
                        <button onClick={()=>loadCiPhoto(selectedRow.cicoId, { force: true })}
                          className="text-[11px] bg-rose-100 hover:bg-rose-200 text-rose-600 font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-colors">
                          Thử lại
                        </button>
                      </div>
                    );
                  }
                  if (p.state === 'idle' && selectedRow.cicoId) {
                    return (
                      <button onClick={()=>loadCiPhoto(selectedRow.cicoId)}
                        className="w-full h-52 bg-blue-50 border-2 border-dashed border-blue-200 text-blue-500 rounded-xl flex flex-col items-center justify-center text-xs gap-2 cursor-pointer hover:bg-blue-100 transition-colors">
                        <i className="fa-solid fa-camera text-2xl" />
                        <span className="font-bold">Xem ảnh CI</span>
                      </button>
                    );
                  }
                  return (
                    <div className="h-52 bg-rose-50 border-2 border-dashed border-rose-300 text-rose-400 rounded-xl flex flex-col items-center justify-center text-xs gap-1">
                      <i className="fa-solid fa-image text-2xl" />
                      <span className="font-bold">Chưa có ảnh CI</span>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-400 flex items-center gap-2">
            <i className="fa-solid fa-shield-halved text-slate-300" />
            Field Operation Dashboard · {new Date().toLocaleDateString('vi-VN')}
          </div>
        </div>
      )}

      {/* ── DOM ẨN: layout thẻ ảnh cho Báo Cáo Khách Hàng, chụp html2canvas theo từng trang ── */}
      <div aria-hidden="true" style={{ position: 'fixed', top: 0, left: '-99999px', zIndex: -1 }}>
        {printChunks.map(chunk => (
          <div key={chunk.key} ref={el => { printRefs.current[chunk.key] = el; }}
            style={{ width: PRINT_PAGE_W, background: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif', padding: 28, boxSizing: 'border-box' }}>
            {/* Header trang */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '3px solid #0f172a', paddingBottom: 10, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Báo Cáo Check-In UFF</div>
                <div style={{ fontSize: 13, color: '#475569', marginTop: 2 }}>{chunk.project} · Ngày {selDate}</div>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                Trang {chunk.pageIndex}/{chunk.totalPages} · {chunk.rows.length} store
              </div>
            </div>

            {/* Lưới thẻ store */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${PRINT_CARDS_PER_ROW}, 1fr)`, gap: 18 }}>
              {chunk.rows.map(r => {
                const p = getPhotoEntry(r.cicoId);
                const photoSrc = p.state === 'ready' ? p.photos[0] : null;
                const statusColor = r.status === 'Đúng giờ' ? '#059669' : r.status === 'Đi trễ' ? '#d97706' : '#e11d48';
                const statusBg    = r.status === 'Đúng giờ' ? '#ecfdf5' : r.status === 'Đi trễ' ? '#fffbeb' : '#fff1f2';
                const empLine = `${truncate(r.storeCode, 20)} · BA: ${truncate(r.empName || '—', 24)}`;
                return (
                  <div key={r.id} style={{
                    border: '1px solid #e2e8f0',
                    borderTop: `5px solid ${statusColor}`,
                    borderRadius: 14,
                    overflow: 'hidden',
                    background: '#fff',
                    boxShadow: '0 2px 6px rgba(15,23,42,0.10)',
                  }}>
                    {/* background-image thay vì <img>+object-fit: html2canvas không luôn tôn trọng
                        object-fit và hay kéo méo ảnh. background-size:contain (thay vì cover) để
                        giữ nguyên toàn bộ ảnh gốc, không cắt/bóp mất phần nào. Bọc thêm 1 lớp
                        padding ở div ngoài (nền xám) để ảnh không dán sát mép thẻ — nhìn có khung,
                        đỡ trơ so với để ảnh tràn viền. */}
                    {photoSrc ? (
                      <div style={{ height: 420, backgroundColor: '#f1f5f9', padding: 12, boxSizing: 'border-box' }}>
                        <div style={{
                          width: '100%',
                          height: '100%',
                          borderRadius: 8,
                          backgroundImage: `url("${photoSrc}")`,
                          backgroundSize: 'contain',
                          backgroundPosition: 'center',
                          backgroundRepeat: 'no-repeat',
                        }} />
                      </div>
                    ) : (
                      <div style={{ height: 420, backgroundColor: '#f1f5f9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                        <div style={{ fontSize: 42, opacity: 0.3 }}>{r.status === 'Chưa CI' ? '🚫' : '📷'}</div>
                        <div style={{ color: '#94a3b8', fontSize: 14, fontWeight: 700, lineHeight: '18px', textAlign: 'center', padding: '0 16px' }}>
                          {r.status === 'Chưa CI' ? 'Chưa Check-In' : 'Không có ảnh CI'}
                        </div>
                      </div>
                    )}
                    <div style={{ padding: '16px' }}>
                      <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.4, color: '#0f172a', whiteSpace: 'nowrap' }}>
                        {truncate(r.storeName, 40)}
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.4, color: '#64748b', marginTop: 4, whiteSpace: 'nowrap' }}>
                        {empLine}
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.4, color: '#64748b', marginTop: 2, whiteSpace: 'nowrap' }}>
                        Sup: <span style={{ fontWeight: 600 }}>{truncate(r.sup || '—', 35)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Giờ CI: {r.ciTime || '—'}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#ffffff', background: statusColor, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                          {r.status}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 16, paddingTop: 8, borderTop: '1px solid #e2e8f0', fontSize: 10, color: '#94a3b8' }}>
              Field Operation Dashboard · Xuất lúc {new Date().toLocaleString('vi-VN')}
            </div>
          </div>
        ))}
      </div>

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
