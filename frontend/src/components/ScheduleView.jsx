import React, { useState, useEffect, useMemo, useRef } from 'react';
import { fetchMasterData, fetchQCData, normalizeRegion, getSups, getProjects, getWeek } from '../api/googleSheets';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const DAY_OF_WEEK = ['CN','T2','T3','T4','T5','T6','T7']; // 0=Sun

function parseDate(str) {
  if (!str) return null;
  const p = str.split('/');
  if (p.length !== 3) return null;
  return new Date(+p[2], +p[1]-1, +p[0]);
}

const QC_CLR = s => {
  if (!s || s === 0) return 'text-slate-400 bg-slate-100';
  if (s >= 90) return 'text-emerald-700 bg-emerald-100';
  if (s >= 75) return 'text-amber-700 bg-amber-100';
  return 'text-rose-700 bg-rose-100';
};

export default function ScheduleView({ refreshKey = 0 }) {
  const [masterRows, setMasterRows] = useState([]);
  const [qcRows,     setQcRows]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [selSup,     setSelSup]     = useState('');
  const [selRegion,  setSelRegion]  = useState('');
  const [selProject, setSelProject] = useState('');
  const [selWeek,    setSelWeek]    = useState('');
  const contentRef = useRef();

  useEffect(() => {
    setLoading(true);
    const force = refreshKey > 0;
    Promise.all([fetchMasterData(force), fetchQCData(force)]).then(([master, qc]) => {
      setMasterRows(master);
      setQcRows(qc);
      setLoading(false);
    });
  }, [refreshKey]);

  // QC per store (latest)
  const qcByStore = useMemo(() => {
    const m = {};
    qcRows.forEach(r => {
      const code = r['Store Code'] || r['Code'] || r['Mart Code'];
      const score = parseFloat(r['QC Score'] || r['Score'] || r['Kết quả'] || r['Result'] || 0);
      if (code) m[code] = score;
    });
    return m;
  }, [qcRows]);

  // Build per-store schedule from daily rows
  const stores = useMemo(() => {
    const map = {};
    masterRows.forEach(r => {
      const code = r['Store Code'] || r['Store Name'];
      if (!code) return;
      if (!map[code]) {
        map[code] = {
          code,
          name:     r['Store Name'] || '',
          project:  r['Project'] || '',
          brand:    r['Brand'] || '',
          sup:      r['Sup'] || '',
          region:   normalizeRegion(r['Region'], r['Province'], r['Store Name']),
          province: r['Province'] || r['Tỉnh'] || '',
          status:   r['Status'] || '',
          dayMap:   {}, // "YYYY-MM-DD" → { dow, time }
          times:    [],
        };
      }
      const d = parseDate(r['Date']);
      if (d) {
        const key = d.toISOString().slice(0,10);
        map[code].dayMap[key] = { dow: d.getDay(), time: r['Working Time'] || '' };
        if (r['Working Time']) map[code].times.push(r['Working Time']);
      }
    });

    // Derive shift summary: group by day-of-week, pick most common time
    return Object.values(map).map(s => {
      const dowMap = {}; // dow → times[]
      Object.values(s.dayMap).forEach(({ dow, time }) => {
        if (!dowMap[dow]) dowMap[dow] = [];
        if (time) dowMap[dow].push(time);
      });
      const shiftByDow = {};
      for (const [dow, times] of Object.entries(dowMap)) {
        if (!times.length) { shiftByDow[dow] = ''; continue; }
        const freq = {};
        times.forEach(t => { freq[t] = (freq[t]||0)+1; });
        shiftByDow[dow] = Object.entries(freq).sort((a,b)=>b[1]-a[1])[0][0];
      }
      return {
        ...s,
        shiftByDow,
        workingDays: Object.keys(s.dayMap).length,
        isNew: Object.keys(s.dayMap).length <= 5,
        qcScore: qcByStore[s.code] || 0,
      };
    });
  }, [masterRows, qcByStore]);

  // Available weeks
  const weeks = useMemo(() => {
    const ws = new Set();
    masterRows.forEach(r => {
      const w = getWeek(r['Date']);
      if (w) ws.add(w);
    });
    return [...ws].sort((a,b)=>a-b);
  }, [masterRows]);

  // Filter
  const sups     = useMemo(() => getSups(masterRows), [masterRows]);
  const projects = useMemo(() => getProjects(masterRows), [masterRows]);
  const regions  = ['HCM','HN','Tỉnh'];

  const filtered = useMemo(() => {
    let d = stores;
    if (selSup)    d = d.filter(s => s.sup === selSup);
    if (selRegion) d = d.filter(s => s.region === selRegion);
    if (selProject)d = d.filter(s => s.project === selProject);
    if (selWeek)   d = d.filter(s => {
      const w = parseInt(selWeek);
      return Object.keys(s.dayMap).some(k => {
        const d2 = new Date(k);
        const ds = `${String(d2.getDate()).padStart(2,'0')}/${String(d2.getMonth()+1).padStart(2,'0')}/${d2.getFullYear()}`;
        return getWeek(ds) === w;
      });
    });
    if (search.trim()) {
      const q = search.toLowerCase();
      d = d.filter(s =>
        s.name.toLowerCase().includes(q)     ||
        s.code.toLowerCase().includes(q)     ||
        s.sup.toLowerCase().includes(q)      ||
        s.region.toLowerCase().includes(q)   ||
        s.province.toLowerCase().includes(q) ||
        s.project.toLowerCase().includes(q)  ||
        s.brand.toLowerCase().includes(q)
      );
    }
    return d;
  }, [stores, selSup, selRegion, selProject, selWeek, search]);

  const exportPDF = async () => {
    const el = contentRef.current;
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true });
    const pdf    = new jsPDF('l','mm','a3');
    const w      = pdf.internal.pageSize.getWidth();
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, (canvas.height * w) / canvas.width);
    pdf.save(`LichLamBA_W${selWeek||'all'}_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  if (loading) return <LoadingSpinner label="Đang tải Lịch làm BA từ Google Sheet…" />;

  const clearFilters = () => { setSearch(''); setSelSup(''); setSelRegion(''); setSelProject(''); setSelWeek(''); };
  const hasFilter = search || selSup || selRegion || selProject || selWeek;

  // Days to show as column headers (Sun=0 → CN, Mon=1 → T2 …)
  const DOW_COLS = [1,2,3,4,5,6,0]; // Mon→Sun

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <i className="fa-solid fa-calendar-days text-violet-600" /> Lịch Làm BA
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Data thực · {stores.length} stores · {masterRows.length} ngày công
          </p>
        </div>
        <button onClick={exportPDF} className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm transition-all cursor-pointer shrink-0">
          <i className="fa-solid fa-file-pdf" /> Xuất PDF
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">🔍 Tìm</label>
          <div className="relative">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
            <input type="text" value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Store, Sup, HCM, Đà Nẵng…"
              className="pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-700 outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-400 w-52" />
          </div>
        </div>
        <Sel label="Supervisor" value={selSup}    onChange={setSelSup}    opts={sups}     />
        <Sel label="Region"     value={selRegion}  onChange={setSelRegion}  opts={regions}  />
        <Sel label="Project"    value={selProject} onChange={setSelProject} opts={projects} />
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Tuần</label>
          <select value={selWeek} onChange={e=>setSelWeek(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 outline-none cursor-pointer">
            <option value="">Tất cả</option>
            {weeks.map(w=><option key={w} value={w}>Tuần {w}</option>)}
          </select>
        </div>
        {hasFilter && <button onClick={clearFilters} className="text-xs text-violet-600 hover:text-violet-800 underline self-end pb-2">Xóa</button>}
        <span className="self-end pb-2 text-xs text-slate-400 ml-auto">{filtered.length}/{stores.length}</span>
      </div>

      {/* Table */}
      <div ref={contentRef} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs min-w-[1000px]">
            <thead>
              <tr className="bg-slate-800 text-white text-left">
                <th className="px-3 py-3 font-semibold uppercase tracking-wide whitespace-nowrap">Store</th>
                <th className="px-3 py-3 font-semibold uppercase tracking-wide whitespace-nowrap">Project / Brand</th>
                <th className="px-3 py-3 font-semibold uppercase tracking-wide whitespace-nowrap">Region</th>
                <th className="px-3 py-3 font-semibold uppercase tracking-wide whitespace-nowrap">Supervisor</th>
                <th className="px-3 py-3 font-semibold uppercase tracking-wide text-center">BA</th>
                {DOW_COLS.map(d=>(
                  <th key={d} className="px-2 py-3 font-semibold uppercase tracking-wide text-center whitespace-nowrap min-w-[80px]">
                    {DAY_OF_WEEK[d]}
                  </th>
                ))}
                <th className="px-3 py-3 font-semibold uppercase tracking-wide text-center whitespace-nowrap">Ngày Công</th>
                <th className="px-3 py-3 font-semibold uppercase tracking-wide text-center whitespace-nowrap">QC Tuần Trước</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr><td colSpan={13} className="p-8 text-center text-slate-400">Không có dữ liệu.</td></tr>
              )}
              {filtered.map((s,i) => (
                <tr key={s.code} className={`hover:bg-violet-50/40 transition-colors ${i%2===0?'bg-white':'bg-slate-50/40'}`}>
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-slate-800">{s.name}</div>
                    <div className="text-slate-400 font-mono text-[10px]">{s.code}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-700">{s.project}</div>
                    <div className="text-slate-400 text-[10px]">{s.brand}</div>
                  </td>
                  <td className="px-3 py-2.5"><RegionBadge region={s.region}/></td>
                  <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{s.sup}</td>
                  <td className="px-3 py-2.5 text-center">
                    {s.isNew
                      ? <span className="bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-[10px] font-bold">🆕 Mới</span>
                      : <span className="bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold">✓ Cũ</span>
                    }
                  </td>
                  {DOW_COLS.map(d => {
                    const time = s.shiftByDow[d] || '';
                    return (
                      <td key={d} className="px-2 py-2.5 text-center">
                        {time
                          ? <div className="bg-indigo-100 text-indigo-800 rounded px-1 py-0.5 text-[10px] font-semibold whitespace-nowrap">{time}</div>
                          : <span className="text-slate-300">—</span>}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-center">
                    <span className="bg-blue-100 text-blue-800 font-bold px-2.5 py-0.5 rounded-full text-[11px]">
                      {s.workingDays}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {s.qcScore > 0
                      ? <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${QC_CLR(s.qcScore)}`}>{s.qcScore}%</span>
                      : <span className="text-slate-400 text-[11px]">Chưa có</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Sel({ label, value, onChange, opts }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</label>
      <select value={value} onChange={e=>onChange(e.target.value)}
        className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 outline-none cursor-pointer focus:ring-2 focus:ring-violet-100 focus:border-violet-400">
        <option value="">Tất cả</option>
        {opts.map(o=><option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

function RegionBadge({ region }) {
  const m = { HCM:'bg-blue-100 text-blue-700 border-blue-200', HN:'bg-indigo-100 text-indigo-700 border-indigo-200', Tỉnh:'bg-emerald-100 text-emerald-700 border-emerald-200' };
  return <span className={`inline-block border px-2 py-0.5 rounded-full text-[10px] font-bold ${m[region]||m['Tỉnh']}`}>{region}</span>;
}

function LoadingSpinner({ label }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      <p className="text-slate-500 text-sm font-medium">{label}</p>
      <p className="text-slate-400 text-xs">Google Apps Script thường mất 3–8 giây</p>
    </div>
  );
}
