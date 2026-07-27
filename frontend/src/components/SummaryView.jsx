import React, { useState, useEffect, useMemo, useRef } from 'react';
import { fetchMasterData, fetchHRStatus, normalizeRegion, getSups } from '../api/googleSheets';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Parse Vietnamese date string "Thứ Sáu, 3 tháng 7, 2026" → "YYYY-MM-DD" string.
 * We intentionally return a string (not a Date object) to avoid UTC timezone
 * issues where new Date("YYYY-MM-DD") is parsed as UTC midnight = 07:00 Vietnam.
 */
function parseVNDateISO(str) {
  if (!str) return null;
  // 1. Format: "Thứ Sáu, 3 tháng 7, 2026"
  let m = str.match(/(\d+)\s+tháng\s+(\d+),\s+(\d+)/i);
  if (m) {
    const year  = m[3];
    const month = String(+m[2]).padStart(2, '0');
    const day   = String(+m[1]).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  // 2. Format: "DD/MM/YYYY" or "D/M/YYYY"
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const year  = m[3];
    const month = String(+m[2]).padStart(2, '0');
    const day   = String(+m[1]).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  // 3. Format: "YYYY-MM-DD"
  m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const year  = m[1];
    const month = String(+m[2]).padStart(2, '0');
    const day   = String(+m[3]).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return null;
}

/* ─── Today as "YYYY-MM-DD" (local time, no UTC shift) ─────────────── */
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function SummaryView({ refreshKey = 0 }) {
  const [masterRows, setMasterRows] = useState([]);
  const [hrRows,     setHrRows]     = useState([]);
  const [loading,    setLoading]    = useState(true);

  /* Filters */
  const [selSup,          setSelSup]          = useState('');
  const [onlyNewHR,       setOnlyNewHR]       = useState(false);
  const [onlyActiveProj,  setOnlyActiveProj]  = useState(false);
  const [dateFrom,        setDateFrom]        = useState('2026-07-01');
  const [dateTo,          setDateTo]          = useState('2026-07-31');

  const contentRef = useRef();

  useEffect(() => {
    setLoading(true);
    const force = refreshKey > 0;
    Promise.all([fetchMasterData(force), fetchHRStatus(force)]).then(([master, hr]) => {
      setMasterRows(master);
      setHrRows(hr);
      setLoading(false);
    });
  }, [refreshKey]);

  /* ── Stores with active HR recruitment (Sourcing / Interviewing / etc.) ── */
  const hrStoreSet = useMemo(() => {
    const set = new Set();
    hrRows.forEach(r => {
      const name = (r['Mart Name'] || r['Store Name'] || '').trim().toLowerCase();
      if (name) set.add(name);
    });
    return set;
  }, [hrRows]);

  /* ── Supervisors list ────────────────────────────────────────────── */
  const sups = useMemo(() => getSups(masterRows), [masterRows]);

  /* ── Build store map (grouped strictly by Store Name) ─────────────── */
  const allStoresMap = useMemo(() => {
    const map = {};
    masterRows.forEach(r => {
      const storeName = (r['Store Name'] || r['Store Code'] || '').trim();
      if (!storeName) return;
      const normKey = storeName.toLowerCase();
      const reg     = normalizeRegion(r['Region'], r['Province'], storeName);

      if (!map[normKey]) {
        map[normKey] = {
          code:        (r['Store Code'] || '').trim(),
          name:        storeName,
          region:      reg,
          province:    (r['Province'] || '—').trim(),
          isNewHR:     hrStoreSet.has(normKey),
          projects:    new Set(),
          brands:      new Set(),
          sups:        new Set(),
          shifts:      [],
        };
      }

      const st = map[normKey];
      if (r['Project']) st.projects.add(r['Project'].trim());
      if (r['Brand'])   st.brands.add(r['Brand'].trim());
      if (r['Sup'])     st.sups.add(r['Sup'].trim());
      if ((st.region === 'Tỉnh' || !st.region) && reg !== 'Tỉnh') st.region = reg;
      if ((!st.province || st.province === '—') && r['Province']) st.province = r['Province'].trim();

      if (r['Date']) {
        const dateISO = parseVNDateISO(r['Date']);
        st.shifts.push({
          dateISO,
          dateRaw: r['Date'],
          time:    r['Working Time'] || '',
          status:  r['Status'] || '',
          project: (r['Project'] || '—').trim(),
          brand:   (r['Brand'] || '—').trim(),
          sup:     (r['Sup'] || '—').trim(),
        });
      }
    });
    return map;
  }, [masterRows, hrStoreSet]);

  const allStoresList = useMemo(() => Object.values(allStoresMap), [allStoresMap]);

  /* ── Filtered stores (by SUP + HR checkbox) ─────────────────────── */
  const filteredStores = useMemo(() => {
    let list = allStoresList;
    if (selSup)    list = list.filter(s => s.sups.has(selSup));
    if (onlyNewHR) list = list.filter(s => s.isNewHR);
    return list;
  }, [allStoresList, selSup, onlyNewHR]);

  /* ── Daily roster rows filtered by date range and WORKING SHIFTS ONLY ── */
  const rosterRows = useMemo(() => {
    const rows = [];
    filteredStores.forEach(s => {
      s.shifts.forEach(sh => {
        if (!sh.dateISO) return;
        if (dateFrom && sh.dateISO < dateFrom) return;
        if (dateTo   && sh.dateISO > dateTo)   return;
        if (selSup   && sh.sup !== selSup)     return;
        
        const isOff = !sh.time || sh.time.toLowerCase().includes('off') || sh.time.toLowerCase().includes('nghỉ');
        if (isOff || !sh.time.trim()) return;

        rows.push({
          storeName: s.name,
          project:   sh.project,
          brand:     sh.brand,
          region:    s.region,
          province:  s.province,
          sup:       sh.sup,
          shift:     sh.time,
          dateRaw:   sh.dateRaw,
          dateISO:   sh.dateISO,
          isWorking: true,
          isNewHR:   s.isNewHR,
        });
      });
    });
    rows.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    return rows;
  }, [filteredStores, dateFrom, dateTo, selSup]);

  const activeCount = rosterRows.length;
  const offCount    = 0;

  /* ── Total unique physical supermarket stores count ────────────────── */
  const uniqueStoreCount = useMemo(() => {
    return filteredStores.length;
  }, [filteredStores]);

  /* ── Projects active in the next 2 months (today → today + 60 days) ──── */
  const activeProjSet2Months = useMemo(() => {
    const activeSet = new Set();
    const today = todayISO();
    const d = new Date();
    d.setDate(d.getDate() + 60);
    const next2MonthsISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    allStoresList.forEach(s => {
      s.shifts.forEach(sh => {
        if (!sh.dateISO) return;
        const isOff = !sh.time || sh.time.toLowerCase().includes('off') || sh.time.toLowerCase().includes('nghỉ');
        if (isOff || !sh.time.trim()) return;

        if (sh.dateISO >= today && sh.dateISO <= next2MonthsISO) {
          activeSet.add(sh.project);
        }
      });
    });
    return activeSet;
  }, [allStoresList]);

  /* ── Project Coverage Blocks ─────────────────────────────────────── */
  const projectBlocks = useMemo(() => {
    const map = {};
    filteredStores.forEach(s => {
      const sProjects = selSup
        ? new Set(s.shifts.filter(sh => sh.sup === selSup).map(sh => sh.project))
        : s.projects;

      sProjects.forEach(p => {
        if (!p || p === '—') return;
        if (!map[p]) {
          map[p] = {
            project:  p,
            brands:   new Set(),
            total:    0,
            hcm:      0,
            hn:       0,
            tinh:     0,
            isActive: activeProjSet2Months.has(p),
          };
        }
        s.brands.forEach(b => { if (b && b !== '—') map[p].brands.add(b); });
        map[p].total++;
        if      (s.region === 'HCM') map[p].hcm++;
        else if (s.region === 'HN')  map[p].hn++;
        else                          map[p].tinh++;
      });
    });
    const all = Object.values(map).sort((a, b) => b.total - a.total);
    return onlyActiveProj ? all.filter(p => p.isActive) : all;
  }, [filteredStores, selSup, activeProjSet2Months, onlyActiveProj]);

  /* ── Roster split by region ──────────────────────────────────────── */
  const rosterHCM  = useMemo(() => rosterRows.filter(r => r.region === 'HCM'),  [rosterRows]);
  const rosterHN   = useMemo(() => rosterRows.filter(r => r.region === 'HN'),   [rosterRows]);
  const rosterTinh = useMemo(() => rosterRows.filter(r => r.region !== 'HCM' && r.region !== 'HN'), [rosterRows]);

  /* ── PDF Export ─────────────────────────────────────────────────── */
  const exportPDF = async () => {
    const el = contentRef.current;
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true });
    const pdf = new jsPDF('p', 'mm', 'a4');
    const w = pdf.internal.pageSize.getWidth();
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, (canvas.height * w) / canvas.width);
    pdf.save(`Summary_${dateFrom}_to_${dateTo}.pdf`);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div ref={contentRef} className="space-y-5">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <i className="fa-solid fa-chart-pie text-blue-600" /> Summary Operations Overview
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tổng quan BA · Độ phủ dự án · Lịch phân ca theo khoảng ngày
          </p>
        </div>
        <button
          onClick={exportPDF}
          className="flex items-center gap-2 bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-sm transition-all cursor-pointer shrink-0"
        >
          <i className="fa-solid fa-file-pdf" /> Xuất PDF
        </button>
      </div>

      {/* ── Filter Controls ─────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <i className="fa-solid fa-sliders text-blue-500" /> Bộ Lọc
        </div>
        <div className="flex flex-wrap gap-4 items-end">

          {/* Supervisor */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Supervisor</label>
            <select
              value={selSup}
              onChange={e => setSelSup(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 cursor-pointer min-w-44 font-medium"
            >
              <option value="">Tất cả các SUP</option>
              {sups.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Từ Ngày</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 font-medium"
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Đến Ngày</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 font-medium"
            />
          </div>

          {/* Checkbox NV Mới */}
          <div className="pb-0.5">
            <label className="flex items-center gap-2 cursor-pointer bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors rounded-lg px-3.5 py-2.5">
              <input
                type="checkbox"
                checked={onlyNewHR}
                onChange={e => setOnlyNewHR(e.target.checked)}
                className="w-4 h-4 accent-amber-600 cursor-pointer"
              />
              <span className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                <i className="fa-solid fa-user-plus text-amber-600" />
                Siêu thị đang tuyển NV Mới
                <span
                  className="w-4 h-4 rounded-full bg-amber-200 text-amber-800 text-[10px] flex items-center justify-center font-extrabold cursor-help"
                  title="Hiển thị các siêu thị đang có vị trí BA trống cần tuyển thay thế (dựa theo tab HR_Status trong Google Sheet). Tiêu chí: siêu thị xuất hiện trong HR_Status = đang có lịch tuyển dụng BA mới."
                >?</span>
              </span>
            </label>
          </div>

          {/* Reset */}
          {(selSup || onlyNewHR || dateFrom !== '2026-07-01' || dateTo !== '2026-07-31') && (
            <button
              onClick={() => { setSelSup(''); setOnlyNewHR(false); setDateFrom('2026-07-01'); setDateTo('2026-07-31'); }}
              className="pb-0.5 text-xs text-slate-400 hover:text-rose-600 transition-colors underline font-medium"
            >
              Đặt lại bộ lọc
            </button>
          )}

          <div className="ml-auto text-xs text-slate-400 font-semibold self-end">
            <span className="text-blue-600 font-bold">{filteredStores.length}</span> / {allStoresList.length} điểm bán
          </div>
        </div>
      </div>

      {/* ── Top KPI Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          gradient="from-blue-500 to-indigo-600"
          icon="fa-id-badge"
          label="Tổng Số BA & Store Điểm Bán"
          value={`${filteredStores.length} BA / ${uniqueStoreCount} Store`}
          sub={selSup ? `Lọc theo SUP: ${selSup}` : `Tổng ${filteredStores.length} vị trí BA tại ${uniqueStoreCount} siêu thị`}
        />
        <KpiCard
          gradient="from-violet-500 to-purple-600"
          icon="fa-briefcase"
          label="Tổng Dự Án"
          value={projectBlocks.length}
          sub={`Đang hoạt động: ${activeProjSet2Months.size} dự án`}
        />
        <KpiCard
          gradient="from-emerald-500 to-teal-600"
          icon="fa-user-clock"
          label={`Ca Làm Việc (${dateFrom}${dateTo !== dateFrom ? ' → ' + dateTo : ''})`}
          value={activeCount}
          sub={`Đang làm: ${activeCount} · Off lịch: ${offCount}`}
        />
      </div>

      {/* ── Project Coverage Blocks ──────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-slate-50/80 px-5 py-3.5 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <i className="fa-solid fa-layer-group text-violet-600" />
              Số Lượng BA &amp; Độ Phủ Theo Dự Án (HCM / HN / Tỉnh)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Mỗi block = 1 dự án · Bộ lọc SUP ảnh hưởng trực tiếp đến các con số
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Toggle chỉ hiện dự án còn hoạt động */}
            <button
              onClick={() => setOnlyActiveProj(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                onlyActiveProj
                  ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                  : 'bg-white text-slate-500 border-slate-300 hover:border-emerald-400 hover:text-emerald-600'
              }`}
              title="Dự án còn hoạt động = có lịch phân ca trong vòng 2 tháng tới"
            >
              <span className={`w-2 h-2 rounded-full ${onlyActiveProj ? 'bg-white animate-pulse' : 'bg-slate-300'}`} />
              {onlyActiveProj ? `Đang hoạt động (${activeProjSet2Months.size})` : 'Tất cả dự án'}
            </button>
            <span className="bg-violet-100 text-violet-700 border border-violet-200 px-2.5 py-1 rounded-full text-xs font-bold">
              {projectBlocks.length} / {activeProjSet2Months.size} dự án active (2 tháng)
            </span>
          </div>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {projectBlocks.map((p) => {
              const maxVal   = Math.max(p.hcm, p.hn, p.tinh, 1);
              const pctHCM   = Math.round((p.hcm  / maxVal) * 100);
              const pctHN    = Math.round((p.hn   / maxVal) * 100);
              const pctTinh  = Math.round((p.tinh / maxVal) * 100);
              const brandStr = [...p.brands].join(' · ') || '—';
              return (
                <div key={p.project} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  {/* Block Header */}
                  <div className={`px-4 py-3 flex items-center justify-between ${p.isActive ? 'bg-gradient-to-r from-slate-700 to-slate-800' : 'bg-gradient-to-r from-slate-400 to-slate-500'}`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-extrabold text-white tracking-wide">{p.project}</span>
                        {p.isActive
                          ? <span className="bg-emerald-400/30 text-emerald-200 border border-emerald-400/40 px-1.5 py-0.5 rounded text-[10px] font-bold">● Đang hoạt động</span>
                          : <span className="bg-slate-300/30 text-slate-200 border border-slate-300/40 px-1.5 py-0.5 rounded text-[10px] font-bold">○ Ngưng hoạt động</span>
                        }
                      </div>
                      <div className="text-[11px] text-slate-300 font-medium mt-0.5">
                        <i className="fa-solid fa-tag mr-1 opacity-70" />{brandStr}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-extrabold text-white">{p.total}</div>
                      <div className="text-[10px] text-slate-300 font-semibold uppercase tracking-wide">Tổng BA</div>
                    </div>
                  </div>

                  {/* Coverage bars */}
                  <div className="bg-white px-4 py-3 space-y-2.5">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /><span className="text-xs font-bold text-slate-600">HCM</span></div>
                        <span className="text-xs font-extrabold text-blue-700">{p.hcm} BA</span>
                      </div>
                      <div className="h-2 bg-blue-50 rounded-full overflow-hidden border border-blue-100"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${pctHCM}%` }} /></div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /><span className="text-xs font-bold text-slate-600">HN</span></div>
                        <span className="text-xs font-extrabold text-indigo-700">{p.hn} BA</span>
                      </div>
                      <div className="h-2 bg-indigo-50 rounded-full overflow-hidden border border-indigo-100"><div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pctHN}%` }} /></div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /><span className="text-xs font-bold text-slate-600">Tỉnh</span></div>
                        <span className="text-xs font-extrabold text-emerald-700">{p.tinh} BA</span>
                      </div>
                      <div className="h-2 bg-emerald-50 rounded-full overflow-hidden border border-emerald-100"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pctTinh}%` }} /></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Daily Roster Tables split by Region ──────────────────────── */}
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <i className="fa-solid fa-list-check text-blue-600" />
            Chi Tiết Lịch Phân Ca
            <span className="font-mono text-blue-600">{dateFrom}{dateTo !== dateFrom ? ` → ${dateTo}` : ''}</span>
          </h3>
          <div className="flex items-center gap-2 text-xs font-bold">
            <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-full">✓ Tổng ca làm việc: {rosterRows.length}</span>
          </div>
        </div>

        {/* HCM */}
        <RosterTable
          title="🔵 HCM"
          colorBg="bg-blue-50"
          colorBorder="border-blue-200"
          colorText="text-blue-800"
          rows={rosterHCM}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />

        {/* HN */}
        <RosterTable
          title="🟣 Hà Nội"
          colorBg="bg-indigo-50"
          colorBorder="border-indigo-200"
          colorText="text-indigo-800"
          rows={rosterHN}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />

        {/* Tỉnh */}
        <RosterTable
          title="🟢 Tỉnh / Miền"
          colorBg="bg-emerald-50"
          colorBorder="border-emerald-200"
          colorText="text-emerald-800"
          rows={rosterTinh}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      </div>
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────────────── */
function KpiCard({ gradient, icon, label, value, sub }) {
  return (
    <div className={`bg-gradient-to-br ${gradient} rounded-xl p-5 text-white shadow-md flex items-center justify-between`}>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider opacity-80 mb-1">
          <i className={`fa-solid ${icon} mr-1.5`} />{label}
        </div>
        <div className="text-4xl font-extrabold">{typeof value === 'number' ? value.toLocaleString() : value}</div>
        <div className="text-xs opacity-80 mt-1 font-medium">{sub}</div>
      </div>
      <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0">
        <i className={`fa-solid ${icon}`} />
      </div>
    </div>
  );
}

function RegionBadge({ region }) {
  const m = {
    HCM:  'bg-blue-100 text-blue-700 border-blue-200',
    HN:   'bg-indigo-100 text-indigo-700 border-indigo-200',
    Tỉnh: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };
  return (
    <span className={`inline-block border px-2.5 py-0.5 rounded-full text-[10px] font-bold ${m[region] || m['Tỉnh']}`}>
      {region}
    </span>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      <p className="text-slate-500 text-sm font-medium">Đang tải dữ liệu Summary...</p>
    </div>
  );
}

const PROJECT_COLORS = {
  'BA VINDA':     { badge: 'bg-indigo-100 text-indigo-900 border-indigo-300 font-bold',  label: 'bg-indigo-600 text-white' },
  'NESCAFÉ':      { badge: 'bg-amber-100 text-amber-950 border-amber-300 font-bold',     label: 'bg-amber-600 text-white' },
  'MAGGI':        { badge: 'bg-emerald-100 text-emerald-950 border-emerald-300 font-bold', label: 'bg-emerald-600 text-white' },
  'SGC BEAUTY':   { badge: 'bg-rose-100 text-rose-950 border-rose-300 font-bold',        label: 'bg-rose-600 text-white' },
  'GOGI IN ST':   { badge: 'bg-sky-100 text-sky-950 border-sky-300 font-bold',           label: 'bg-sky-600 text-white' },
  'CRV':          { badge: 'bg-violet-100 text-violet-950 border-violet-300 font-bold',   label: 'bg-violet-600 text-white' },
  'STMB':         { badge: 'bg-cyan-100 text-cyan-950 border-cyan-300 font-bold',        label: 'bg-cyan-600 text-white' },
  'BHX':          { badge: 'bg-teal-100 text-teal-950 border-teal-300 font-bold',        label: 'bg-teal-600 text-white' },
  'MEGA NPL':     { badge: 'bg-pink-100 text-pink-950 border-pink-300 font-bold',        label: 'bg-pink-600 text-white' },
  'MEGA LAUNDRY': { badge: 'bg-fuchsia-100 text-fuchsia-950 border-fuchsia-300 font-bold', label: 'bg-fuchsia-600 text-white' },
  'HOMECARE':     { badge: 'bg-orange-100 text-orange-950 border-orange-300 font-bold',  label: 'bg-orange-600 text-white' },
};

function getProjColor(proj) {
  return PROJECT_COLORS[proj] || { badge: 'bg-slate-100 text-slate-800 border-slate-300 font-bold', label: 'bg-slate-600 text-white' };
}

function RosterTable({ title, colorBg, colorBorder, colorText, rows, dateFrom, dateTo }) {
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  /* Group shift rows strictly by Date + Store Name */
  const combinedRows = useMemo(() => {
    const map = new Map();
    rows.forEach(r => {
      const key = `${r.dateISO}_${(r.storeName || '').toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, {
          dateISO:   r.dateISO,
          dateRaw:   r.dateRaw,
          storeName: r.storeName,
          province:  r.province,
          region:    r.region,
          isNewHR:   r.isNewHR,
          brands:    new Set(),
          sups:      new Set(),
          projects:  [],
        });
      }
      const grp = map.get(key);
      if (r.brand && r.brand !== '—') grp.brands.add(r.brand);
      if (r.sup && r.sup !== '—')     grp.sups.add(r.sup);
      if (r.isNewHR) grp.isNewHR = true;

      // Ensure distinct project shift entry
      if (!grp.projects.some(p => p.project === r.project && p.shift === r.shift)) {
        grp.projects.push({
          project: r.project,
          brand:   r.brand,
          shift:   r.shift,
          sup:     r.sup,
        });
      }
    });
    return [...map.values()];
  }, [rows]);

  const filtered = useMemo(() => {
    if (!search.trim()) return combinedRows;
    const q = search.toLowerCase();
    return combinedRows.filter(r =>
      (r.storeName || '').toLowerCase().includes(q) ||
      (r.province || '').toLowerCase().includes(q) ||
      [...r.brands].some(b => b.toLowerCase().includes(q)) ||
      [...r.sups].some(s => s.toLowerCase().includes(q)) ||
      r.projects.some(p => p.project.toLowerCase().includes(q) || p.shift.toLowerCase().includes(q))
    );
  }, [combinedRows, search]);

  /* Unique physical stores count in table */
  const uniqueStoresCount = useMemo(() => {
    return new Set(filtered.map(r => r.storeName.toLowerCase())).size;
  }, [filtered]);

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const formatDateDDMMYY = (dateISO) => {
    if (!dateISO) return '—';
    const parts = dateISO.split('-');
    if (parts.length !== 3) return dateISO;
    const [y, m, d] = parts;
    return `${d}/${m}/${y.slice(2)}`;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {/* Table Header */}
      <div className={`${colorBg} px-5 py-3.5 border-b ${colorBorder} flex items-center justify-between flex-wrap gap-3`}>
        <div className="flex items-center gap-3">
          <h4 className={`text-base font-extrabold ${colorText}`}>{title}</h4>
          <span className="bg-white/80 text-slate-700 border border-slate-200 px-2.5 py-0.5 rounded-full text-xs font-bold shadow-xs">
            {uniqueStoresCount} siêu thị ({rows.length} ca làm việc)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
            <input
              type="text"
              placeholder="Tìm siêu thị, dự án, SUP..."
              value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 w-52 font-medium"
            />
          </div>
        </div>
      </div>

      {/* Table Body */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
              <th className="py-3 px-4">Ngày</th>
              <th className="py-3 px-4">Tên Siêu Thị</th>
              <th className="py-3 px-4">Dự Án (Projects)</th>
              <th className="py-3 px-4">Brand</th>
              <th className="py-3 px-4">Tỉnh / Thành</th>
              <th className="py-3 px-4">Supervisor</th>
              <th className="py-3 px-4">Ca Làm Việc theo Project</th>
              <th className="py-3 px-4 text-center">Trạng Thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                  Không có lịch phân ca phù hợp
                </td>
              </tr>
            ) : (
              pageRows.map((r, idx) => {
                const supStr   = [...r.sups].join(', ') || '—';
                const brandStr = [...r.brands].join(' · ') || '—';
                return (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-600 whitespace-nowrap align-top">
                      {formatDateDDMMYY(r.dateISO)}
                    </td>
                    <td className="py-2.5 px-4 font-bold text-slate-900 align-top">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{r.storeName}</span>
                        {r.isNewHR && (
                          <span className="bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-extrabold px-1.5 py-0.5 rounded shadow-2xs whitespace-nowrap">
                            + NV Mới
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Projects badges */}
                    <td className="py-2.5 px-4 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {r.projects.map((p, pIdx) => {
                          const c = getProjColor(p.project);
                          return (
                            <span key={pIdx} className={`inline-block px-2 py-0.5 rounded text-[11px] border ${c.badge}`}>
                              {p.project}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-slate-500 font-semibold align-top">{brandStr}</td>
                    <td className="py-2.5 px-4 text-slate-600 align-top">{r.province || '—'}</td>
                    <td className="py-2.5 px-4 text-slate-700 font-semibold align-top">{supStr}</td>
                    {/* Shift times with colored project tags */}
                    <td className="py-2.5 px-4 align-top">
                      <div className="space-y-1">
                        {r.projects.map((p, pIdx) => {
                          const c = getProjColor(p.project);
                          return (
                            <div key={pIdx} className="flex items-center gap-1.5">
                              <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded ${c.label}`}>
                                {p.project}
                              </span>
                              <span className="font-mono text-xs font-extrabold text-slate-800">{p.shift}</span>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-center whitespace-nowrap align-top">
                      <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[11px] font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Đang làm ({r.projects.length} ca)
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <div className="text-xs text-slate-500 font-medium">
            Trang <span className="font-bold text-slate-800">{currentPage}</span> / {totalPages}
          </div>
          <div className="flex items-center gap-1">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
              className="px-2.5 py-1 text-xs border border-slate-300 rounded bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-semibold"
            >
              Trước
            </button>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
              className="px-2.5 py-1 text-xs border border-slate-300 rounded bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-semibold"
            >
              Sau
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
