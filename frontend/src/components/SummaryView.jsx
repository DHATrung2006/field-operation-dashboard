import React, { useState, useMemo, useRef } from 'react';
import { SUMMARY_DATA, SUPERVISORS, REGIONS, PROJECTS } from '../data/mockData';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const REGION_COLORS = {
  HCM:  { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   dot: 'bg-blue-500' },
  HN:   { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  Tỉnh: { bg: 'bg-emerald-50',border: 'border-emerald-200',text: 'text-emerald-700',dot: 'bg-emerald-500' },
};

export default function SummaryView() {
  const [selectedSup, setSelectedSup] = useState('');
  const [filterNewBA,  setFilterNewBA]  = useState(false);
  const contentRef = useRef();

  const data   = SUMMARY_DATA;
  const stores = data.stores;

  const filtered = useMemo(() => {
    let rows = stores;
    if (selectedSup) rows = rows.filter(s => s.sup === selectedSup);
    if (filterNewBA)  rows = rows.filter(s => s.baStatus === 'new');
    return rows;
  }, [selectedSup, filterNewBA, stores]);

  // Derived KPIs
  const totalBA       = selectedSup ? filtered.reduce((a, s) => a + s.totalBA, 0) : data.totalBA;
  const baWorking     = selectedSup ? filtered.reduce((a, s) => a + s.baCount, 0) : data.baWorking;
  const baVacant      = totalBA - baWorking;
  const totalStores   = filtered.length;
  const byRegion      = REGIONS.reduce((acc, r) => {
    acc[r] = filtered.filter(s => s.region === r).length;
    return acc;
  }, {});

  const exportPDF = async () => {
    const el = contentRef.current;
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true });
    const img    = canvas.toDataURL('image/png');
    const pdf    = new jsPDF('p', 'mm', 'a4');
    const w      = pdf.internal.pageSize.getWidth();
    pdf.addImage(img, 'PNG', 0, 0, w, (canvas.height * w) / canvas.width);
    pdf.save(`Summary_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  return (
    <div id="summary-content" ref={contentRef} className="space-y-6">
      {/* ── Title + Export ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <i className="fa-solid fa-chart-pie text-blue-600" /> Summary Dashboard
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Tổng quan hoạt động Field Operation — cập nhật theo sheet thực tế.</p>
        </div>
        <button
          onClick={exportPDF}
          className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm transition-all cursor-pointer shrink-0"
        >
          <i className="fa-solid fa-file-pdf" /> Xuất PDF
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3 items-end bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Supervisor</label>
          <select
            value={selectedSup}
            onChange={e => setSelectedSup(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 cursor-pointer min-w-44"
          >
            <option value="">Tất cả SUP</option>
            {SUPERVISORS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 cursor-pointer bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <input
            type="checkbox"
            checked={filterNewBA}
            onChange={e => setFilterNewBA(e.target.checked)}
            className="w-4 h-4 accent-amber-500 cursor-pointer"
          />
          <span className="text-sm font-medium text-amber-700">Chỉ hiện BA Mới</span>
        </label>
        {(selectedSup || filterNewBA) && (
          <button
            onClick={() => { setSelectedSup(''); setFilterNewBA(false); }}
            className="text-xs text-slate-500 hover:text-slate-800 underline"
          >Xóa bộ lọc</button>
        )}
      </div>

      {/* ── KPI Cards Row 1 ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon="fa-users" label="Tổng BA" value={totalBA} sub={`${baWorking} đang làm / ${baVacant} trống`} color="blue" />
        <KpiCard icon="fa-briefcase" label="Tổng Project" value={data.totalProjects} sub="dự án đang hoạt động" color="indigo" />
        <KpiCard icon="fa-store" label="Tổng Stores" value={stores.length} sub={`Lọc: ${totalStores} siêu thị`} color="violet" />
        <KpiCard icon="fa-person-circle-exclamation" label="BA Mới (Cần Chú Ý)" value={stores.filter(s => s.baStatus==='new').length} sub="BA mới tuyển/đang onboard" color="amber" />
      </div>

      {/* ── Region Breakdown ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {REGIONS.map(r => {
          const c    = REGION_COLORS[r];
          const total = stores.filter(s => s.region===r).length;
          const shown = byRegion[r];
          const pct  = total ? Math.round((shown/total)*100) : 0;
          return (
            <div key={r} className={`${c.bg} ${c.border} border rounded-xl p-4 shadow-sm`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                <span className={`text-xs font-bold uppercase tracking-wide ${c.text}`}>Vùng {r}</span>
              </div>
              <div className="text-3xl font-extrabold text-slate-800">{shown}</div>
              <div className={`text-xs ${c.text} mt-1`}>/ {total} store toàn vùng</div>
              <div className="mt-3 h-1.5 bg-white/60 rounded-full overflow-hidden">
                <div className={`h-full ${c.dot} rounded-full transition-all`} style={{ width:`${pct}%` }} />
              </div>
              <div className={`text-[11px] ${c.text} mt-1`}>{pct}% đang hoạt động</div>
            </div>
          );
        })}
      </div>

      {/* ── Detail Table ── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <i className="fa-solid fa-table text-blue-500" />
            Chi Tiết Theo Store
            <span className="bg-slate-100 text-slate-500 text-xs font-medium px-2 py-0.5 rounded-full">{filtered.length} dòng</span>
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                {['Code','Tên Siêu Thị','Project','Brand','Region','Supervisor','BA Đang Làm','Tổng BA','Trạng Thái BA'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="p-8 text-center text-slate-400 text-sm">Không có dữ liệu phù hợp.</td></tr>
              )}
              {filtered.map((s, i) => (
                <tr key={s.id} className={`hover:bg-blue-50/30 transition-colors ${i%2===0?'bg-white':'bg-slate-50/40'}`}>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500 whitespace-nowrap">{s.id}</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-800 whitespace-nowrap">{s.name}</td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{s.project}</td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{s.brand}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${REGION_COLORS[s.region]?.text} ${REGION_COLORS[s.region]?.bg}`}>
                      {s.region}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{s.sup}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`font-bold ${s.baCount === 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{s.baCount}</span>
                    <span className="text-slate-400 text-xs"> / {s.totalBA}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center font-semibold text-slate-700">{s.totalBA}</td>
                  <td className="px-4 py-2.5 text-center">
                    {s.baStatus === 'new' ? (
                      <span className="bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full text-xs font-bold">🆕 BA Mới</span>
                    ) : (
                      <span className="bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full text-xs font-bold">✓ BA Cũ</span>
                    )}
                    {s.baCount === 0 && (
                      <span className="ml-1 bg-rose-100 text-rose-700 border border-rose-200 px-2.5 py-0.5 rounded-full text-xs font-bold">⚠ Trống</span>
                    )}
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

function KpiCard({ icon, label, value, sub, color }) {
  const clr = {
    blue:   { bg:'bg-blue-50/60',   border:'border-blue-200',   icon:'text-blue-600',  val:'text-blue-700' },
    indigo: { bg:'bg-indigo-50/60', border:'border-indigo-200', icon:'text-indigo-600',val:'text-indigo-700' },
    violet: { bg:'bg-violet-50/60', border:'border-violet-200', icon:'text-violet-600',val:'text-violet-700' },
    amber:  { bg:'bg-amber-50/60',  border:'border-amber-200',  icon:'text-amber-600', val:'text-amber-700' },
    rose:   { bg:'bg-rose-50/60',   border:'border-rose-200',   icon:'text-rose-600',  val:'text-rose-700' },
  }[color] || {};
  return (
    <div className={`${clr.bg} ${clr.border} border rounded-xl p-4 shadow-sm`}>
      <div className={`text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5 ${clr.icon}`}>
        <i className={`fa-solid ${icon}`} />{label}
      </div>
      <div className={`text-3xl font-extrabold ${clr.val}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{sub}</div>
    </div>
  );
}
