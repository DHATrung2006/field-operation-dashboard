import React, { useState, useEffect, useMemo, useRef } from 'react';
import { fetchMasterData, fetchHRStatus, normalizeRegion, getSups, getProjects } from '../api/googleSheets';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export default function SummaryView() {
  const [masterRows, setMasterRows] = useState([]);
  const [hrRows,     setHrRows]     = useState([]);
  const [loading,    setLoading]    = useState(true);

  // Filters
  const [selSup,     setSelSup]     = useState('');
  const [onlyNewHR,  setOnlyNewHR]  = useState(false);
  const [selDate,    setSelDate]    = useState('');
  
  const contentRef = useRef();

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchMasterData(), fetchHRStatus()]).then(([master, hr]) => {
      setMasterRows(master);
      setHrRows(hr);

      // Default date = latest date in masterRows or today
      if (master.length > 0) {
        const dates = [...new Set(master.map(r => r['Date']).filter(Boolean))];
        if (dates.length > 0) {
          setSelDate(dates[0]); // Pick first available date
        }
      }
      setLoading(false);
    });
  }, []);

  // Set of stores that have New HR status (from HR_Status sheet)
  const hrNewStoreSet = useMemo(() => {
    const set = new Set();
    hrRows.forEach(r => {
      const storeName = r['Mart Name'] || r['Store Name'] || r['Store'];
      if (storeName) set.add(storeName.trim().toLowerCase());
    });
    return set;
  }, [hrRows]);

  // Unique list of all available dates in master_data
  const availableDates = useMemo(() => {
    return [...new Set(masterRows.map(r => r['Date']).filter(Boolean))];
  }, [masterRows]);

  // List of Supervisors
  const sups = useMemo(() => getSups(masterRows), [masterRows]);

  // Distinct Stores / BA Map from masterRows
  const allStoresMap = useMemo(() => {
    const map = {};
    masterRows.forEach(r => {
      const storeName = r['Store Name'] || r['Store Code'];
      if (!storeName) return;
      
      const key = storeName.trim();
      if (!map[key]) {
        map[key] = {
          code:     r['Store Code'] || '',
          name:     key,
          project:  r['Project'] || '—',
          brand:    r['Brand'] || '—',
          sup:      r['Sup'] || '—',
          region:   normalizeRegion(r['Region']),
          province: r['Province'] || r['Tỉnh'] || '—',
          isNewHR:  hrNewStoreSet.has(key.toLowerCase()),
          dailyShifts: {}, // Date -> Working Time
        };
      }
      if (r['Date']) {
        map[key].dailyShifts[r['Date']] = r['Working Time'] || r['Status'] || '';
      }
    });
    return map;
  }, [masterRows, hrNewStoreSet]);

  const allStoresList = useMemo(() => Object.values(allStoresMap), [allStoresMap]);

  // Apply Filters (Supervisor & HR New Checkbox)
  const filteredStores = useMemo(() => {
    let list = allStoresList;
    if (selSup) {
      list = list.filter(s => s.sup.toLowerCase() === selSup.toLowerCase());
    }
    if (onlyNewHR) {
      list = list.filter(s => s.isNewHR);
    }
    return list;
  }, [allStoresList, selSup, onlyNewHR]);

  // 1. Total BA Count (Total unique stores / BA assignments)
  const totalBACount = filteredStores.length;

  // 2. Total Projects & BA Details per Project
  const projectSummary = useMemo(() => {
    const projMap = {};
    filteredStores.forEach(s => {
      const p = s.project || 'Khác';
      if (!projMap[p]) {
        projMap[p] = { name: p, totalBA: 0, hcm: 0, hn: 0, tinh: 0 };
      }
      projMap[p].totalBA++;
      if (s.region === 'HCM') projMap[p].hcm++;
      else if (s.region === 'HN') projMap[p].hn++;
      else projMap[p].tinh++;
    });
    return Object.values(projMap).sort((a, b) => b.totalBA - a.totalBA);
  }, [filteredStores]);

  const totalProjectsCount = projectSummary.length;

  // 3. Daily Roster Details for selectedDate
  const dailyRoster = useMemo(() => {
    if (!selDate) return { active: [], off: [], totalActive: 0, totalOff: 0 };

    const active = [];
    const off = [];

    filteredStores.forEach(s => {
      const shiftTime = s.dailyShifts[selDate];
      const isOff = !shiftTime || shiftTime.toLowerCase().includes('off') || shiftTime.toLowerCase().includes('nghỉ');
      
      const item = {
        storeName: s.name,
        project:   s.project,
        brand:     s.brand,
        region:    s.region,
        province:  s.province,
        sup:       s.sup,
        shift:     shiftTime && !isOff ? shiftTime : 'Off lịch',
        isWorking: !isOff && Boolean(shiftTime),
        isNewHR:   s.isNewHR,
      };

      if (item.isWorking) active.push(item);
      else off.push(item);
    });

    return {
      active,
      off,
      all: [...active, ...off],
      totalActive: active.length,
      totalOff: off.length,
    };
  }, [filteredStores, selDate]);

  // Export PDF Handler
  const exportPDF = async () => {
    const el = contentRef.current;
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true });
    const pdf = new jsPDF('p', 'mm', 'a4');
    const w = pdf.internal.pageSize.getWidth();
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, (canvas.height * w) / canvas.width);
    pdf.save(`Summary_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  if (loading) return <LoadingSpinner label="Đang nạp dữ liệu Summary..." />;

  return (
    <div ref={contentRef} className="space-y-6">
      {/* ── Title & Export PDF ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <i className="fa-solid fa-chart-pie text-blue-600" /> Summary Operations Overview
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Tổng quan số lượng BA, độ phủ theo từng dự án & lịch phân ca chi tiết
          </p>
        </div>
        <button
          onClick={exportPDF}
          className="flex items-center gap-2 bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-sm transition-all cursor-pointer shrink-0"
        >
          <i className="fa-solid fa-file-pdf" /> Xuất Báo Cáo PDF
        </button>
      </div>

      {/* ── Filter Controls Section ──────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <i className="fa-solid fa-filter text-blue-500" /> Bộ Lọc Tổng Quan
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {/* Filter theo Supervisor */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Supervisor (SUP)
            </label>
            <select
              value={selSup}
              onChange={e => setSelSup(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 cursor-pointer min-w-48 font-medium"
            >
              <option value="">Tất cả các SUP</option>
              {sups.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Filter Chọn Ngày xem ca */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Ngày Xem Lịch Ca
            </label>
            <select
              value={selDate}
              onChange={e => setSelDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 cursor-pointer font-mono font-medium"
            >
              {availableDates.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Checkbox Có nhân viên mới (dựa vào tab HR) */}
          <div className="pt-5">
            <label className="flex items-center gap-2 cursor-pointer bg-amber-50 border border-amber-200 hover:bg-amber-100/70 transition-colors rounded-lg px-3.5 py-2">
              <input
                type="checkbox"
                checked={onlyNewHR}
                onChange={e => setOnlyNewHR(e.target.checked)}
                className="w-4 h-4 accent-amber-600 rounded cursor-pointer"
              />
              <span className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                <i className="fa-solid fa-user-plus text-amber-600" /> Chỉ hiện Siêu thị có NV Mới (từ HR)
              </span>
            </label>
          </div>

          {/* Reset Filters */}
          {(selSup || onlyNewHR) && (
            <button
              onClick={() => { setSelSup(''); setOnlyNewHR(false); }}
              className="pt-5 text-xs text-slate-400 hover:text-rose-600 transition-colors underline font-medium"
            >
              Xóa bộ lọc
            </button>
          )}

          <div className="ml-auto text-xs font-semibold text-slate-400 self-end">
            Hiển thị: <span className="text-blue-600 font-bold">{filteredStores.length}</span> / {allStoresList.length} điểm bán
          </div>
        </div>
      </div>

      {/* ── Top Summary KPI Cards ────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl p-5 text-white shadow-md flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1">
              <i className="fa-solid fa-users mr-1.5" /> Tổng Số BA (Toàn Dự Án)
            </div>
            <div className="text-4xl font-extrabold">{totalBACount}</div>
            <div className="text-xs opacity-90 mt-1 font-medium">
              {selSup ? `Lọc theo SUP: ${selSup}` : 'Tất cả các dự án'}
            </div>
          </div>
          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-3xl">
            <i className="fa-solid fa-id-badge" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl p-5 text-white shadow-md flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1">
              <i className="fa-solid fa-diagram-project mr-1.5" /> Total Số Dự Án
            </div>
            <div className="text-4xl font-extrabold">{totalProjectsCount}</div>
            <div className="text-xs opacity-90 mt-1 font-medium">
              Dự án đang vận hành
            </div>
          </div>
          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-3xl">
            <i className="fa-solid fa-briefcase" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl p-5 text-white shadow-md flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1">
              <i className="fa-solid fa-calendar-check mr-1.5" /> Ca Làm Việc Ngày {selDate}
            </div>
            <div className="text-4xl font-extrabold">{dailyRoster.totalActive}</div>
            <div className="text-xs opacity-90 mt-1 font-medium">
              Đang làm: {dailyRoster.totalActive} | Off lịch: {dailyRoster.totalOff}
            </div>
          </div>
          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-3xl">
            <i className="fa-solid fa-user-clock" />
          </div>
        </div>
      </div>

      {/* ── Details BA theo từng Dự án & Độ phủ theo Region ───────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-slate-50/80 px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <i className="fa-solid fa-layer-group text-blue-600" />
            Chi Tiết Số Lượng & Độ Phủ BA Theo Từng Dự Án (HCM / HN / Tỉnh)
          </h3>
          <span className="text-xs text-slate-400 font-medium">
            {projectSummary.length} dự án
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-left">
                <th className="px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wide">Tên Dự Án</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-blue-600 uppercase tracking-wide">Độ Phủ HCM</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-indigo-600 uppercase tracking-wide">Độ Phủ HN</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-emerald-600 uppercase tracking-wide">Độ Phủ Tỉnh</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-slate-800 uppercase tracking-wide">Tổng BA Dự Án</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {projectSummary.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400">Không có dữ liệu dự án.</td>
                </tr>
              ) : (
                projectSummary.map((p, idx) => (
                  <tr key={p.name} className={`hover:bg-blue-50/20 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                    <td className="px-4 py-3 font-bold text-slate-800 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      {p.name}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full text-xs font-bold">
                        {p.hcm} BA
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1 rounded-full text-xs font-bold">
                        {p.hn} BA
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-xs font-bold">
                        {p.tinh} BA
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-extrabold text-slate-900 text-base">
                      {p.totalBA}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Bảng Chi Tiết Ca Làm Việc Ngày (Daily Roster Table) ────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-slate-50/80 px-5 py-3.5 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <i className="fa-solid fa-list-check text-blue-600" />
              Chi Tiết Lịch Phân Ca Ngày <span className="text-blue-600 font-mono">{selDate}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Thống kê status phân ca làm việc thực tế của từng nhân viên BA theo siêu thị
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-full">
              ✓ Đang làm: {dailyRoster.totalActive}
            </span>
            <span className="bg-slate-100 text-slate-600 border border-slate-200 px-3 py-1 rounded-full">
              Off lịch: {dailyRoster.totalOff}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-left">
                <th className="px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wide whitespace-nowrap">Tên Siêu Thị</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wide whitespace-nowrap">Project</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wide whitespace-nowrap">Brand</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wide whitespace-nowrap text-center">Region</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wide whitespace-nowrap">Province</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wide whitespace-nowrap">Supervisor</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wide whitespace-nowrap text-center">Ca Làm</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wide whitespace-nowrap text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dailyRoster.all.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    Không tìm thấy lịch phân ca cho ngày {selDate}.
                  </td>
                </tr>
              ) : (
                dailyRoster.all.map((item, idx) => (
                  <tr
                    key={item.storeName + idx}
                    className={`hover:bg-blue-50/30 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                  >
                    {/* 1. Tên Siêu Thị */}
                    <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap flex items-center gap-2">
                      {item.storeName}
                      {item.isNewHR && (
                        <span className="bg-amber-100 text-amber-700 border border-amber-300 px-1.5 py-0.5 rounded text-[10px] font-extrabold" title="Siêu thị có nhân sự mới từ HR">
                          NV MỚI
                        </span>
                      )}
                    </td>

                    {/* 2. Project */}
                    <td className="px-4 py-3 text-slate-700 font-semibold whitespace-nowrap">
                      {item.project}
                    </td>

                    {/* 3. Brand */}
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {item.brand}
                    </td>

                    {/* 4. Region */}
                    <td className="px-4 py-3 text-center">
                      <RegionBadge region={item.region} />
                    </td>

                    {/* 5. Province */}
                    <td className="px-4 py-3 text-slate-600 font-medium whitespace-nowrap">
                      {item.province}
                    </td>

                    {/* 6. Supervisor */}
                    <td className="px-4 py-3 text-slate-700 font-medium whitespace-nowrap">
                      {item.sup}
                    </td>

                    {/* 7. Ca Làm */}
                    <td className="px-4 py-3 text-center font-mono font-semibold text-slate-800 whitespace-nowrap">
                      {item.shift}
                    </td>

                    {/* 8. Status */}
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {item.isWorking ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-1 rounded-full text-xs font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" /> Đang làm
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-500 border border-slate-200 px-2.5 py-1 rounded-full text-xs font-medium">
                          Off lịch
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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

function LoadingSpinner({ label }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      <p className="text-slate-500 text-sm font-medium">{label}</p>
    </div>
  );
}
