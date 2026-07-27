import React, { useState, useMemo, useRef } from 'react';
import { SCHEDULE_DATA, SUPERVISORS, REGIONS, PROJECTS } from '../data/mockData';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const DAY_LABELS = [
  { key:'mon', label:'T2' },
  { key:'tue', label:'T3' },
  { key:'wed', label:'T4' },
  { key:'thu', label:'T5' },
  { key:'fri', label:'T6' },
  { key:'sat', label:'T7' },
  { key:'sun', label:'CN' },
];

const QC_COLOR = (score) => {
  if (score === 0)   return 'text-slate-400 bg-slate-100';
  if (score >= 90)   return 'text-emerald-700 bg-emerald-100';
  if (score >= 75)   return 'text-amber-700   bg-amber-100';
  return               'text-rose-700   bg-rose-100';
};

export default function ScheduleView() {
  const [search,   setSearch]   = useState('');
  const [selSup,   setSelSup]   = useState('');
  const [selRegion,setSelRegion] = useState('');
  const [selProject,setSelProject] = useState('');
  const contentRef = useRef();

  const rows = useMemo(() => {
    let d = SCHEDULE_DATA;
    if (selSup)     d = d.filter(r => r.sup === selSup);
    if (selRegion)  d = d.filter(r => r.region === selRegion);
    if (selProject) d = d.filter(r => r.project === selProject);
    if (search.trim()) {
      const q = search.toLowerCase();
      d = d.filter(r =>
        r.store.toLowerCase().includes(q)  ||
        r.sup.toLowerCase().includes(q)    ||
        r.region.toLowerCase().includes(q) ||
        r.detail.toLowerCase().includes(q) ||
        r.project.toLowerCase().includes(q)||
        r.brand.toLowerCase().includes(q)
      );
    }
    return d;
  }, [search, selSup, selRegion, selProject]);

  const exportPDF = async () => {
    const el = contentRef.current;
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true });
    const img    = canvas.toDataURL('image/png');
    const pdf    = new jsPDF('l', 'mm', 'a3');
    const w      = pdf.internal.pageSize.getWidth();
    pdf.addImage(img, 'PNG', 0, 0, w, (canvas.height * w) / canvas.width);
    pdf.save(`LichLamBA_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  const clearFilters = () => { setSearch(''); setSelSup(''); setSelRegion(''); setSelProject(''); };
  const hasFilter    = search || selSup || selRegion || selProject;

  return (
    <div className="space-y-5">
      {/* ── Title + Export ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <i className="fa-solid fa-calendar-days text-violet-600" /> Lịch Làm BA
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Ca làm việc · Target tháng · Tình trạng BA · QC tuần trước.</p>
        </div>
        <button
          onClick={exportPDF}
          className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm transition-all cursor-pointer shrink-0"
        >
          <i className="fa-solid fa-file-pdf" /> Xuất PDF
        </button>
      </div>

      {/* ── Filter Bar ── */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm flex flex-wrap gap-3 items-end">
        {/* Search */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
            🔍 Tìm kiếm
          </label>
          <div className="relative">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Store, Sup, Đà Nẵng, HCM, P&G…"
              className="pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-700 outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-400 w-52"
            />
          </div>
        </div>
        {/* Supervisor */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Supervisor</label>
          <select value={selSup} onChange={e => setSelSup(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 outline-none cursor-pointer focus:ring-2 focus:ring-violet-100 focus:border-violet-400">
            <option value="">Tất cả SUP</option>
            {SUPERVISORS.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        {/* Region */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Region</label>
          <select value={selRegion} onChange={e => setSelRegion(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 outline-none cursor-pointer focus:ring-2 focus:ring-violet-100 focus:border-violet-400">
            <option value="">Tất cả</option>
            {REGIONS.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        {/* Project */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Project</label>
          <select value={selProject} onChange={e => setSelProject(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 outline-none cursor-pointer focus:ring-2 focus:ring-violet-100 focus:border-violet-400">
            <option value="">Tất cả</option>
            {PROJECTS.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        {hasFilter && (
          <button onClick={clearFilters} className="text-xs text-violet-600 hover:text-violet-800 underline self-end pb-2">
            Xóa bộ lọc
          </button>
        )}
        <span className="self-end pb-2 text-xs text-slate-400 ml-auto">
          {rows.length} / {SCHEDULE_DATA.length} store
        </span>
      </div>

      {/* ── Table ── */}
      <div ref={contentRef} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs min-w-[1100px]">
            <thead>
              <tr className="bg-slate-800 text-white text-left">
                <th className="px-3 py-3 font-semibold uppercase tracking-wide whitespace-nowrap">Store / Mart</th>
                <th className="px-3 py-3 font-semibold uppercase tracking-wide whitespace-nowrap">Project</th>
                <th className="px-3 py-3 font-semibold uppercase tracking-wide whitespace-nowrap">Region / Tỉnh</th>
                <th className="px-3 py-3 font-semibold uppercase tracking-wide whitespace-nowrap">Supervisor</th>
                <th className="px-3 py-3 font-semibold uppercase tracking-wide whitespace-nowrap text-center">BA Status</th>
                {DAY_LABELS.map(d => (
                  <th key={d.key} className="px-2 py-3 font-semibold uppercase tracking-wide text-center whitespace-nowrap min-w-[90px]">{d.label}</th>
                ))}
                <th className="px-3 py-3 font-semibold uppercase tracking-wide text-center whitespace-nowrap">Giờ Ăn</th>
                <th className="px-3 py-3 font-semibold uppercase tracking-wide text-center whitespace-nowrap">Target Tháng</th>
                <th className="px-3 py-3 font-semibold uppercase tracking-wide text-center whitespace-nowrap">QC Tuần Trước</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <tr><td colSpan={18} className="p-8 text-center text-slate-400">Không tìm thấy kết quả.</td></tr>
              )}
              {rows.map((row, i) => (
                <tr key={row.id} className={`hover:bg-violet-50/40 transition-colors ${i%2===0?'bg-white':'bg-slate-50/40'}`}>
                  {/* Store */}
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-slate-800">{row.store}</div>
                    <div className="text-slate-400 font-mono text-[10px]">{row.id}</div>
                  </td>
                  {/* Project */}
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-700">{row.project}</div>
                    <div className="text-slate-400 text-[10px]">{row.brand}</div>
                  </td>
                  {/* Region */}
                  <td className="px-3 py-2.5">
                    <RegionBadge region={row.region} />
                    <div className="text-slate-400 text-[10px] mt-0.5">{row.detail}</div>
                  </td>
                  {/* SUP */}
                  <td className="px-3 py-2.5 text-slate-700 font-medium whitespace-nowrap">{row.sup}</td>
                  {/* BA Status */}
                  <td className="px-3 py-2.5 text-center">
                    {row.baStatus === 'new'
                      ? <span className="bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-[10px] font-bold">🆕 BA Mới</span>
                      : <span className="bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold">✓ BA Cũ</span>
                    }
                  </td>
                  {/* Shift cells per day */}
                  {DAY_LABELS.map(d => {
                    const shift = row.shifts[d.key];
                    const hasMorning   = shift?.morning   && shift.morning   !== '';
                    const hasAfternoon = shift?.afternoon && shift.afternoon !== '';
                    return (
                      <td key={d.key} className="px-2 py-2.5 text-center align-top">
                        {hasMorning && (
                          <div className="bg-sky-100 text-sky-800 rounded px-1 py-0.5 text-[10px] font-semibold mb-0.5 whitespace-nowrap">
                            ☀ {shift.morning}
                          </div>
                        )}
                        {hasAfternoon && (
                          <div className="bg-indigo-100 text-indigo-800 rounded px-1 py-0.5 text-[10px] font-semibold whitespace-nowrap">
                            🌙 {shift.afternoon}
                          </div>
                        )}
                        {!hasMorning && !hasAfternoon && (
                          <span className="text-slate-300 text-[10px]">—</span>
                        )}
                      </td>
                    );
                  })}
                  {/* Break */}
                  <td className="px-3 py-2.5 text-center text-slate-500 whitespace-nowrap">{row.breakTime || '—'}</td>
                  {/* Monthly Target */}
                  <td className="px-3 py-2.5 text-center">
                    <span className="bg-blue-100 text-blue-800 border border-blue-200 font-bold px-2.5 py-0.5 rounded-full text-[11px]">
                      {row.monthlyTarget} ngày
                    </span>
                  </td>
                  {/* QC Last Week */}
                  <td className="px-3 py-2.5 text-center">
                    {row.qcLastWeek === 0
                      ? <span className="text-slate-400 text-[11px]">Chưa có</span>
                      : <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${QC_COLOR(row.qcLastWeek)}`}>
                          {row.qcLastWeek}%
                        </span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-500 px-1">
        <span className="flex items-center gap-1.5"><span className="bg-sky-100 text-sky-800 rounded px-1.5 py-0.5 font-semibold">☀ Ca sáng</span>Morning shift</span>
        <span className="flex items-center gap-1.5"><span className="bg-indigo-100 text-indigo-800 rounded px-1.5 py-0.5 font-semibold">🌙 Ca chiều</span>Afternoon/evening shift</span>
        <span className="flex items-center gap-1.5"><span className="bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 font-semibold border border-amber-200">🆕 BA Mới</span>Mới tuyển / đang đào tạo</span>
        <span className="flex items-center gap-1.5">QC ≥90% <span className="bg-emerald-100 text-emerald-700 rounded-full px-1.5 py-0.5 font-semibold">Tốt</span></span>
      </div>
    </div>
  );
}

function RegionBadge({ region }) {
  const map = {
    HCM:  'bg-blue-100 text-blue-700 border-blue-200',
    HN:   'bg-indigo-100 text-indigo-700 border-indigo-200',
    Tỉnh: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };
  return (
    <span className={`inline-block border px-2 py-0.5 rounded-full text-[10px] font-bold ${map[region]}`}>
      {region}
    </span>
  );
}
