import React, { useState, useEffect, useMemo, useRef } from 'react';
import { fetchMasterData, fetchQCData, normalizeRegion, getSups, getProjects } from '../api/googleSheets';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const REGION_COLORS = {
  HCM:  { bg:'bg-blue-50',   border:'border-blue-200',   text:'text-blue-700',   bar:'bg-blue-500' },
  HN:   { bg:'bg-indigo-50', border:'border-indigo-200', text:'text-indigo-700', bar:'bg-indigo-500' },
  Tỉnh: { bg:'bg-emerald-50',border:'border-emerald-200',text:'text-emerald-700',bar:'bg-emerald-500' },
};

export default function SummaryView() {
  const [rows,       setRows]       = useState([]);
  const [qcRows,     setQcRows]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [selSup,     setSelSup]     = useState('');
  const [filterNew,  setFilterNew]  = useState(false);
  const contentRef = useRef();

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchMasterData(), fetchQCData()]).then(([master, qc]) => {
      setRows(master);
      setQcRows(qc);
      setLoading(false);
    });
  }, []);

  // Unique stores from master_data
  const stores = useMemo(() => {
    const map = {};
    rows.forEach(r => {
      const code = r['Store Code'] || r['Store Name'];
      if (!code) return;
      if (!map[code]) {
        map[code] = {
          code,
          name:    r['Store Name'] || '',
          project: r['Project'] || '',
          brand:   r['Brand'] || '',
          sup:     r['Sup'] || '',
          region:  normalizeRegion(r['Region']),
          dates:   [],
          status:  r['Status'] || 'Active',
        };
      }
      map[code].dates.push(r['Date']);
    });
    return Object.values(map);
  }, [rows]);

  const sups     = useMemo(() => getSups(rows), [rows]);
  const projects = useMemo(() => getProjects(rows), [rows]);

  // Latest QC score per store (from QC sheet if available, else from status)
  const qcByStore = useMemo(() => {
    const m = {};
    qcRows.forEach(r => {
      const code = r['Store Code'] || r['Code'];
      if (code) m[code] = r['QC Score'] || r['Score'] || r['Kết quả'] || null;
    });
    return m;
  }, [qcRows]);

  const filtered = useMemo(() => {
    let s = stores;
    if (selSup)    s = s.filter(x => x.sup === selSup);
    if (filterNew) s = s.filter(x => x.dates.length <= 5); // "new" = few working days logged
    return s;
  }, [stores, selSup, filterNew]);

  // KPIs
  const totalStores  = stores.length;
  const byRegion     = { HCM: 0, HN: 0, Tỉnh: 0 };
  stores.forEach(s => { if (byRegion[s.region] !== undefined) byRegion[s.region]++; else byRegion['Tỉnh']++; });

  const activeBA  = rows.filter(r => r['Status'] === 'Active').length;
  const totalDays = rows.length;
  const projects_ = [...new Set(stores.map(s => s.project).filter(Boolean))];

  const exportPDF = async () => {
    const el = contentRef.current;
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true });
    const pdf    = new jsPDF('p','mm','a4');
    const w      = pdf.internal.pageSize.getWidth();
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, (canvas.height * w) / canvas.width);
    pdf.save(`Summary_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  if (loading) return <LoadingSpinner label="Đang tải Summary từ Google Sheet…" />;

  return (
    <div ref={contentRef} className="space-y-6">
      {/* Title + Export */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <i className="fa-solid fa-chart-pie text-blue-600" /> Summary Dashboard
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Dữ liệu thực từ Google Sheet — {rows.length} bản ghi · {stores.length} stores · {projects_.length} projects
          </p>
        </div>
        <button onClick={exportPDF} className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm transition-all cursor-pointer shrink-0">
          <i className="fa-solid fa-file-pdf" /> Xuất PDF
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Supervisor</label>
          <select value={selSup} onChange={e => setSelSup(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 cursor-pointer min-w-44">
            <option value="">Tất cả SUP</option>
            {sups.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 cursor-pointer bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <input type="checkbox" checked={filterNew} onChange={e => setFilterNew(e.target.checked)}
            className="w-4 h-4 accent-amber-500 cursor-pointer" />
          <span className="text-sm font-medium text-amber-700">Chỉ hiện BA Mới (≤5 ngày)</span>
        </label>
        {(selSup || filterNew) && (
          <button onClick={() => { setSelSup(''); setFilterNew(false); }} className="text-xs text-slate-500 hover:text-slate-800 underline">
            Xóa bộ lọc
          </button>
        )}
        <span className="ml-auto text-xs text-slate-400 self-end">{filtered.length} / {totalStores} stores</span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon="fa-users"     color="blue"   label="Tổng BA (ngày công)" value={totalDays.toLocaleString()} sub={`${activeBA.toLocaleString()} ca Active`} />
        <KpiCard icon="fa-briefcase" color="indigo" label="Tổng Project"         value={projects_.length}            sub={projects_.slice(0,3).join(', ') + (projects_.length > 3 ? '…' : '')} />
        <KpiCard icon="fa-store"     color="violet" label="Tổng Stores"          value={totalStores}                 sub={`Đang filter: ${filtered.length}`} />
        <KpiCard icon="fa-star"      color="amber"  label="BA Mới (≤5 ngày)"    value={stores.filter(s=>s.dates.length<=5).length} sub="cần theo dõi sát" />
      </div>

      {/* Region Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {['HCM','HN','Tỉnh'].map(r => {
          const c     = REGION_COLORS[r];
          const total = byRegion[r] || 0;
          const shown = filtered.filter(s => s.region === r).length;
          const pct   = total ? Math.round((shown/total)*100) : 0;
          return (
            <div key={r} className={`${c.bg} ${c.border} border rounded-xl p-4 shadow-sm`}>
              <div className={`text-xs font-bold uppercase tracking-wide mb-2 ${c.text}`}>
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${c.bar} mr-2`} />
                Vùng {r}
              </div>
              <div className="text-3xl font-extrabold text-slate-800">{shown}</div>
              <div className={`text-xs ${c.text} mt-1`}>/ {total} store toàn vùng</div>
              <div className="mt-3 h-1.5 bg-white/60 rounded-full overflow-hidden">
                <div className={`h-full ${c.bar} rounded-full`} style={{ width:`${pct}%` }} />
              </div>
              <div className={`text-[11px] ${c.text} mt-1`}>{pct}% hiển thị</div>
            </div>
          );
        })}
      </div>

      {/* Store Detail Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <i className="fa-solid fa-table text-blue-500" /> Chi Tiết Theo Store
            <span className="bg-slate-100 text-slate-500 text-xs font-medium px-2 py-0.5 rounded-full">{filtered.length}</span>
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                {['Code','Tên Siêu Thị','Project','Brand','Region','Supervisor','Ngày Công (tháng)','Status BA'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-slate-400">Không có dữ liệu.</td></tr>
              )}
              {filtered.map((s, i) => {
                const isNew = s.dates.length <= 5;
                return (
                  <tr key={s.code} className={`hover:bg-blue-50/30 transition-colors ${i%2===0?'bg-white':'bg-slate-50/40'}`}>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{s.code}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800 whitespace-nowrap">{s.name}</td>
                    <td className="px-4 py-2.5 text-slate-600">{s.project}</td>
                    <td className="px-4 py-2.5 text-slate-500">{s.brand}</td>
                    <td className="px-4 py-2.5">
                      <RegionBadge region={s.region} />
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{s.sup}</td>
                    <td className="px-4 py-2.5 text-center font-bold text-slate-700">{s.dates.length}</td>
                    <td className="px-4 py-2.5 text-center">
                      {isNew
                        ? <span className="bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full text-xs font-bold">🆕 BA Mới</span>
                        : <span className="bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full text-xs font-bold">✓ Đang làm</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, sub, color }) {
  const clr = {
    blue:  'bg-blue-50/60 border-blue-200 text-blue-700',
    indigo:'bg-indigo-50/60 border-indigo-200 text-indigo-700',
    violet:'bg-violet-50/60 border-violet-200 text-violet-700',
    amber: 'bg-amber-50/60 border-amber-200 text-amber-700',
  }[color];
  return (
    <div className={`border rounded-xl p-4 shadow-sm ${clr}`}>
      <div className="text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5 opacity-80">
        <i className={`fa-solid ${icon}`} />{label}
      </div>
      <div className="text-3xl font-extrabold">{value}</div>
      <div className="text-xs mt-1 opacity-70">{sub}</div>
    </div>
  );
}

function RegionBadge({ region }) {
  const m = {
    HCM: 'bg-blue-100 text-blue-700 border-blue-200',
    HN:  'bg-indigo-100 text-indigo-700 border-indigo-200',
    Tỉnh:'bg-emerald-100 text-emerald-700 border-emerald-200',
  };
  return <span className={`inline-block border px-2 py-0.5 rounded-full text-[10px] font-bold ${m[region] || m['Tỉnh']}`}>{region}</span>;
}

function LoadingSpinner({ label }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      <p className="text-slate-500 text-sm font-medium">{label}</p>
      <p className="text-slate-400 text-xs">Google Apps Script thường mất 3–8 giây để phản hồi</p>
    </div>
  );
}
