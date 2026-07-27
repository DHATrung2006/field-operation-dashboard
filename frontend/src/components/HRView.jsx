import React, { useState, useEffect, useMemo, useRef } from 'react';
import { fetchHRStatus, getProjects, getWeek } from '../api/googleSheets';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const STATUS_STYLE = {
  Sourcing:      'bg-sky-100 text-sky-800 border-sky-200',
  Interviewing:  'bg-violet-100 text-violet-800 border-violet-200',
  'Offer Sent':  'bg-amber-100 text-amber-800 border-amber-200',
  Onboarding:    'bg-blue-100 text-blue-800 border-blue-200',
  Training:      'bg-indigo-100 text-indigo-800 border-indigo-200',
  Completed:     'bg-emerald-100 text-emerald-800 border-emerald-200',
};

export default function HRView() {
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [selProject,setSelProject]= useState('');
  const [selStatus, setSelStatus] = useState('');
  const contentRef = useRef();

  useEffect(() => {
    setLoading(true);
    fetchHRStatus().then(data => { setRows(data); setLoading(false); });
  }, []);

  // Column names from HR_Status sheet:
  // "Project","Mart Name","Brand","Sup","Loại Tuyển Dụng","Tình trạng Tuyển Dụng","Tình trạng shop",
  // "Ngày siêu trống BA","Target of Week","HR Commit","Filled"
  const normalize = r => ({
    store:       r['Mart Name'] || r['Store'] || '',
    project:     r['Project'] || '',
    brand:       r['Brand'] || '',
    sup:         r['Sup'] || r['Supervisor'] || '',
    recruitType: r['Loại Tuyển Dụng'] || r['Loai Tuyen Dung'] || '',
    status:      r['Tình trạng Tuyển Dụng'] || r['Status'] || r['Tinh trang'] || '',
    shopStatus:  r['Tình trạng shop'] || r['Shop Status'] || '',
    vacantDate:  r['Ngày siêu trống BA'] || r['Ngay trong'] || '',
    targetWeek:  r['Target of Week'] || r['Target Week'] || '',
    hrCommit:    parseInt(r['HR Commit'] || r['Cam kết'] || 0) || 0,
    filled:      parseInt(r['Filled'] || r['Đã tuyển'] || 0) || 0,
  });

  const normRows = useMemo(() => rows.map(normalize), [rows]);

  const projects  = useMemo(() => [...new Set(normRows.map(r=>r.project).filter(Boolean))].sort(), [normRows]);
  const statuses  = useMemo(() => [...new Set(normRows.map(r=>r.status).filter(Boolean))].sort(), [normRows]);

  const filtered = useMemo(() => {
    let d = normRows;
    if (selProject) d = d.filter(r=>r.project===selProject);
    if (selStatus)  d = d.filter(r=>r.status===selStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      d = d.filter(r=>r.store.toLowerCase().includes(q)||r.sup.toLowerCase().includes(q)||r.project.toLowerCase().includes(q));
    }
    return d;
  }, [normRows, selProject, selStatus, search]);

  // KPIs
  const totalVacant  = normRows.filter(r=>r.status!=='Completed').length;
  const totalFilled  = normRows.reduce((a,r)=>a+r.filled, 0);
  const totalCommit  = normRows.reduce((a,r)=>a+r.hrCommit, 0);
  const sourcingNow  = normRows.filter(r=>r.status==='Sourcing').length;

  // Weekly trend from target weeks in data
  const weeklyTrend = useMemo(() => {
    const weekMap = {};
    normRows.forEach(r => {
      const w = r.targetWeek || 'Unknown';
      if (!weekMap[w]) weekMap[w] = { week: w, sourcing:0, interviewing:0, offer:0, training:0, completed:0 };
      const s = r.status;
      if (s==='Sourcing') weekMap[w].sourcing++;
      else if (s==='Interviewing') weekMap[w].interviewing++;
      else if (s==='Offer Sent') weekMap[w].offer++;
      else if (s==='Training'||s==='Onboarding') weekMap[w].training++;
      else if (s==='Completed') weekMap[w].completed++;
    });
    return Object.values(weekMap).slice(0, 10);
  }, [normRows]);

  const exportPDF = async () => {
    const el = contentRef.current;
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true });
    const pdf    = new jsPDF('p','mm','a4');
    const w      = pdf.internal.pageSize.getWidth();
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, (canvas.height * w) / canvas.width);
    pdf.save(`HR_TuyenDung_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  if (loading) return <LoadingSpinner label="Đang tải HR_Status từ Google Sheet…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <i className="fa-solid fa-user-plus text-emerald-600" /> HR — Tình Hình Tuyển Dụng
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Dữ liệu thực từ sheet HR_Status · {rows.length} dòng
          </p>
        </div>
        <button onClick={exportPDF} className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm transition-all cursor-pointer shrink-0">
          <i className="fa-solid fa-file-pdf" /> Xuất PDF
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiBox icon="fa-circle-xmark"    color="rose"    label="Cần Tuyển"        value={totalVacant}  />
        <KpiBox icon="fa-circle-check"    color="emerald" label="Đã Tuyển"         value={totalFilled}  />
        <KpiBox icon="fa-handshake"       color="blue"    label="Cam Kết HR"       value={totalCommit}  />
        <KpiBox icon="fa-magnifying-glass-plus" color="amber" label="Đang Sourcing" value={sourcingNow} />
      </div>

      {/* Chart */}
      <div ref={contentRef} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
          <i className="fa-solid fa-chart-bar text-blue-500" /> Tiến Độ Tuyển Dụng Theo Tuần Target
        </h3>
        {weeklyTrend.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeklyTrend} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="week" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Legend iconSize={10} wrapperStyle={{ fontSize:11 }} />
              <Bar dataKey="sourcing"     name="Sourcing"     fill="#38bdf8" radius={[3,3,0,0]} />
              <Bar dataKey="interviewing" name="Interview"    fill="#a78bfa" radius={[3,3,0,0]} />
              <Bar dataKey="offer"        name="Offer"        fill="#fbbf24" radius={[3,3,0,0]} />
              <Bar dataKey="training"     name="Training"     fill="#60a5fa" radius={[3,3,0,0]} />
              <Bar dataKey="completed"    name="Completed"    fill="#34d399" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-32 flex items-center justify-center text-slate-400 text-sm">Chưa đủ data để vẽ biểu đồ</div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">🔍 Tìm</label>
          <input type="text" value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Store, Sup, Project…"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 w-48" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Project</label>
          <select value={selProject} onChange={e=>setSelProject(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 outline-none cursor-pointer">
            <option value="">Tất cả</option>
            {projects.map(p=><option key={p}>{p}</option>)}
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
        <span className="self-end pb-2 text-xs text-slate-400 ml-auto">{filtered.length}/{normRows.length}</span>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[900px]">
            <thead>
              <tr className="bg-slate-800 text-white text-left">
                {['Store / Điểm Bán','Project','Brand','Supervisor','Loại Tuyển','Tình Trạng TD','Tình Trạng Shop','Ngày Trống BA','Target Tuần','Cam Kết HR','Tiến Độ'].map(h=>(
                  <th key={h} className="px-3 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length===0 && (
                <tr><td colSpan={11} className="p-8 text-center text-slate-400">
                  {rows.length===0 ? 'Sheet HR_Status trống hoặc tên cột chưa khớp.' : 'Không có dữ liệu phù hợp.'}
                </td></tr>
              )}
              {filtered.map((r,i)=>{
                const pct = r.hrCommit>0 ? Math.round((r.filled/r.hrCommit)*100) : 0;
                return (
                  <tr key={i} className={`hover:bg-emerald-50/30 transition-colors ${i%2===0?'bg-white':'bg-slate-50/40'}`}>
                    <td className="px-3 py-2.5 font-semibold text-slate-800 whitespace-nowrap">{r.store||'—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.project}</td>
                    <td className="px-3 py-2.5 text-slate-500">{r.brand}</td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{r.sup}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                        r.recruitType.toLowerCase().includes('thay') ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>{r.recruitType||'—'}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_STYLE[r.status]||'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {r.status||'—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{r.shopStatus||'—'}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{r.vacantDate||'—'}</td>
                    <td className="px-3 py-2.5 text-center text-slate-600">{r.targetWeek||'—'}</td>
                    <td className="px-3 py-2.5 text-center font-bold text-blue-700">{r.hrCommit||'—'}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden min-w-[50px]">
                          <div className={`h-full rounded-full ${pct>=100?'bg-emerald-500':pct>=50?'bg-blue-500':'bg-amber-400'}`}
                            style={{ width:`${Math.min(pct,100)}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">{r.filled}/{r.hrCommit||'?'}</span>
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
    rose:'bg-rose-50 border-rose-200 text-rose-700', emerald:'bg-emerald-50 border-emerald-200 text-emerald-700',
    blue:'bg-blue-50 border-blue-200 text-blue-700', amber:'bg-amber-50 border-amber-200 text-amber-700',
  }[color];
  return (
    <div className={`border rounded-xl p-3.5 shadow-sm ${clr}`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2 opacity-70">
        <i className={`fa-solid ${icon} text-[11px]`} /> {label}
      </div>
      <div className="text-2xl font-extrabold">{value}</div>
    </div>
  );
}

function LoadingSpinner({ label }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
      <p className="text-slate-500 text-sm font-medium">{label}</p>
      <p className="text-slate-400 text-xs">Google Apps Script thường mất 3–8 giây</p>
    </div>
  );
}
