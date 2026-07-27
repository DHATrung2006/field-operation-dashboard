import React, { useState, useMemo, useRef } from 'react';
import { HR_DATA, HR_WEEKLY_TREND, PROJECTS, SUPERVISORS } from '../data/mockData';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from 'recharts';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const STATUS_STYLE = {
  Sourcing:     'bg-sky-100 text-sky-800 border-sky-200',
  Interviewing: 'bg-violet-100 text-violet-800 border-violet-200',
  'Offer Sent': 'bg-amber-100 text-amber-800 border-amber-200',
  Onboarding:   'bg-blue-100 text-blue-800 border-blue-200',
  Training:     'bg-indigo-100 text-indigo-800 border-indigo-200',
  Completed:    'bg-emerald-100 text-emerald-800 border-emerald-200',
};

export default function HRView() {
  const [search,     setSearch]     = useState('');
  const [selProject, setSelProject] = useState('');
  const [selStatus,  setSelStatus]  = useState('');
  const contentRef = useRef();

  const rows = useMemo(() => {
    let d = HR_DATA;
    if (selProject) d = d.filter(r => r.project === selProject);
    if (selStatus)  d = d.filter(r => r.status  === selStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      d = d.filter(r =>
        r.store.toLowerCase().includes(q) ||
        r.sup.toLowerCase().includes(q)   ||
        r.project.toLowerCase().includes(q)
      );
    }
    return d;
  }, [search, selProject, selStatus]);

  // KPIs
  const totalVacant   = HR_DATA.filter(r => r.status !== 'Completed').length;
  const totalFilled   = HR_DATA.reduce((a, r) => a + r.filled, 0);
  const totalCommit   = HR_DATA.reduce((a, r) => a + r.hrCommit, 0);
  const totalNeeded   = HR_DATA.length;
  const turnoverEst   = ((HR_DATA.filter(r => r.shopStatus.includes('Thay thế')).length / totalNeeded) * 100).toFixed(1);

  const exportPDF = async () => {
    const el = contentRef.current;
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true });
    const img    = canvas.toDataURL('image/png');
    const pdf    = new jsPDF('p', 'mm', 'a4');
    const w      = pdf.internal.pageSize.getWidth();
    pdf.addImage(img, 'PNG', 0, 0, w, (canvas.height * w) / canvas.width);
    pdf.save(`HR_TuyenDung_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  const statuses = [...new Set(HR_DATA.map(r => r.status))];

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <i className="fa-solid fa-user-plus text-emerald-600" /> HR — Tình Hình Tuyển Dụng
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Theo dõi tiến độ tuyển dụng theo tuần · project · cam kết HR.</p>
        </div>
        <button
          onClick={exportPDF}
          className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm transition-all cursor-pointer shrink-0"
        >
          <i className="fa-solid fa-file-pdf" /> Xuất PDF
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiBox icon="fa-circle-xmark"    label="Cần Tuyển"           value={totalVacant}  color="rose"    />
        <KpiBox icon="fa-circle-check"    label="Đã Tuyển Được"       value={totalFilled}  color="emerald" />
        <KpiBox icon="fa-handshake"       label="Cam Kết HR (tuần)"   value={totalCommit}  color="blue"    />
        <KpiBox icon="fa-store"           label="Store Đang Trống BA" value={HR_DATA.filter(r=>r.status==='Sourcing').length} color="amber" />
        <KpiBox icon="fa-arrow-right-from-bracket" label="Tỷ Lệ Nghỉ Việc Ước Tính" value={`${turnoverEst}%`} color="violet" />
      </div>

      {/* Charts Row */}
      <div ref={contentRef} className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Weekly trend bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
            <i className="fa-solid fa-chart-bar text-blue-500" /> Tiến Độ Tuyển Dụng Theo Tuần
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={HR_WEEKLY_TREND} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="week" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip />
              <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize:11 }} />
              <Bar dataKey="sourcing"     name="Sourcing"     fill="#38bdf8" radius={[3,3,0,0]} />
              <Bar dataKey="interviewing" name="Interview"    fill="#a78bfa" radius={[3,3,0,0]} />
              <Bar dataKey="offer"        name="Offer"        fill="#fbbf24" radius={[3,3,0,0]} />
              <Bar dataKey="training"     name="Training"     fill="#60a5fa" radius={[3,3,0,0]} />
              <Bar dataKey="completed"    name="Completed"    fill="#34d399" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Resign trend line */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
            <i className="fa-solid fa-chart-line text-rose-500" /> Tỷ Lệ Nghỉ Việc Theo Tuần
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={HR_WEEKLY_TREND}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="week" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip />
              <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize:11 }} />
              <Line type="monotone" dataKey="resigned"  name="Nghỉ việc" stroke="#f43f5e" strokeWidth={2} dot={{ r:4, fill:'#f43f5e' }} />
              <Line type="monotone" dataKey="completed" name="Tuyển được" stroke="#34d399" strokeWidth={2} dot={{ r:4, fill:'#34d399' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">🔍 Tìm kiếm</label>
          <input type="text" value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Store, Sup, Project…"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 w-48" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Project</label>
          <select value={selProject} onChange={e=>setSelProject(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 outline-none cursor-pointer">
            <option value="">Tất cả</option>
            {PROJECTS.map(p=><option key={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Trạng thái</label>
          <select value={selStatus} onChange={e=>setSelStatus(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 outline-none cursor-pointer">
            <option value="">Tất cả</option>
            {statuses.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <span className="self-end pb-2 text-xs text-slate-400 ml-auto">{rows.length} / {HR_DATA.length} dòng</span>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[900px]">
            <thead>
              <tr className="bg-slate-800 text-white text-left">
                {['Store / Điểm Bán','Project','Brand','Supervisor','Loại Tuyển','Tình Trạng TD','Tình Trạng Shop','Ngày Trống BA','Target Tuần','Cam Kết HR','Tiến Độ'].map(h => (
                  <th key={h} className="px-3 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <tr><td colSpan={11} className="p-8 text-center text-slate-400">Không có dữ liệu.</td></tr>
              )}
              {rows.map((r, i) => {
                const remaining = r.hrCommit - r.filled;
                const pct = r.hrCommit > 0 ? Math.round((r.filled/r.hrCommit)*100) : 0;
                return (
                  <tr key={i} className={`hover:bg-emerald-50/30 transition-colors ${i%2===0?'bg-white':'bg-slate-50/40'}`}>
                    <td className="px-3 py-2.5 font-semibold text-slate-800 whitespace-nowrap">{r.store}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{r.project}</td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{r.brand}</td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{r.sup}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                        r.recruitType.includes('thay thế')
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>{r.recruitType}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_STYLE[r.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{r.shopStatus}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{r.vacantDate}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap text-center">{r.targetWeek}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="font-bold text-blue-700">{r.hrCommit}</span>
                      <span className="text-slate-400 text-xs"> người</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden min-w-[60px]">
                          <div className={`h-full rounded-full ${pct>=100?'bg-emerald-500':pct>=50?'bg-blue-500':'bg-amber-400'}`}
                            style={{ width:`${Math.min(pct,100)}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                          {r.filled}/{r.hrCommit}
                        </span>
                        {remaining > 0 && (
                          <span className="text-[10px] text-rose-600 font-medium">(-{remaining})</span>
                        )}
                      </div>
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

function KpiBox({ icon, label, value, color }) {
  const clr = {
    rose:   'bg-rose-50 border-rose-200 text-rose-700',
    emerald:'bg-emerald-50 border-emerald-200 text-emerald-700',
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
    amber:  'bg-amber-50 border-amber-200 text-amber-700',
    violet: 'bg-violet-50 border-violet-200 text-violet-700',
  }[color] || 'bg-slate-50 border-slate-200 text-slate-700';
  return (
    <div className={`border rounded-xl p-3.5 shadow-sm ${clr}`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2 opacity-70">
        <i className={`fa-solid ${icon} text-[11px]`} /> {label}
      </div>
      <div className="text-2xl font-extrabold">{value}</div>
    </div>
  );
}
