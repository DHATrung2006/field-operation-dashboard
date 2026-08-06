import React, { useState, useEffect, useMemo, useRef } from 'react';
import { fetchHRStatus } from '../api/googleSheets';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

function parseDMon(str) {
  if (!str || str === '-') return null;
  const M = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
  const m = String(str).trim().match(/^(\d{1,2})[/-]([A-Za-z]{3})$/);
  if (!m) return null;
  const mo = M[m[2]];
  if (mo === undefined) return null;
  return new Date(new Date().getFullYear(), mo, parseInt(m[1]));
}
function parseDDMM(str) {
  if (!str || str === '-') return null;
  const m = String(str).trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  return new Date(new Date().getFullYear(), parseInt(m[2]) - 1, parseInt(m[1]));
}
function daysBetween(d1, d2) {
  if (!d1 || !d2) return null;
  return Math.round((d2 - d1) / 86400000);
}
const SC = {
  Sourcing:'#f59e0b', Interviewing:'#8b5cf6', Offering:'#3b82f6',
  'Offer Sent':'#3b82f6', Onboarding:'#06b6d4', Training:'#6366f1',
  Pending:'#94a3b8', Completed:'#10b981',
};
const SB = {
  Sourcing:'bg-amber-100 text-amber-700', Interviewing:'bg-violet-100 text-violet-700',
  Offering:'bg-blue-100 text-blue-700', 'Offer Sent':'bg-blue-100 text-blue-700',
  Pending:'bg-slate-100 text-slate-500', Completed:'bg-emerald-100 text-emerald-700',
};
const CP = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4'];

export default function HRView({ refreshKey = 0 }) {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState('overview');
  const [search,   setSearch]   = useState('');
  const [fProject, setFProject] = useState('');
  const [fCity,    setFCity]    = useState('');
  const [fChannel, setFChannel] = useState('');
  const [fSup,     setFSup]     = useState('');
  const [fWeek,    setFWeek]    = useState('');
  const [fActive,  setFActive]  = useState('Active');
  const ref = useRef();

  useEffect(() => {
    setLoading(true);
    fetchHRStatus(refreshKey > 0).then(d => { setRows(d); setLoading(false); });
  }, [refreshKey]);

  const norm = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    return rows.map(r => {
      const g = (...ks) => { for (const k of ks) { const v = r[k]; if (v !== undefined && String(v).trim()) return String(v).trim(); } return ''; };
      const vacantDate = parseDMon(g('Ngày siêu trống BA','Ngay trong'));
      const startDate  = parseDMon(g('Ngày băt đầu chạy hạn tuyển dụng','Ngày bắt đầu chạy hạn tuyển dụng'));
      const dueDate    = parseDMon(g('Due date'));
      const compDate   = parseDDMM(g('Completion Date'));
      const status     = g('Tình trạng Tuyển Dụng','Tinh trang') || 'Sourcing';
      const isDone     = !!compDate;
      const isOver     = !!dueDate && !isDone && today > dueDate;
      const overDays   = isOver && dueDate ? daysBetween(dueDate, today) : null;
      const slaDays    = startDate && compDate ? daysBetween(startDate, compDate) : null;
      return {
        act:   g('Status tuyển dụng','Status tuyen dung'),
        proj:  g('Project'),
        city:  g('City'),
        chan:  g('Channel'),
        store: g('Mart Name'),
        sup:   g('Sup'),
        pic:   g('PIC tuyển dụng + PV','PIC tuyen dung + PV'),
        picHR: g('Phân bổ PIC HR kèm'),
        rType: g('Loại Tuyển Dụng','Loai Tuyen Dung'),
        status, shopSt: g('Tình trạng shop'),
        week:  g('Target of Week'),
        cv:    parseInt(g('CV đổ về','CV do ve')) || 0,
        notes: g('Tình hình tuyển dụng'),
        vacantDate, startDate, dueDate, compDate,
        isDone, isOver, overDays, slaDays,
      };
    });
  }, [rows]);

  const uniq = (arr, k) => [...new Set(arr.map(r => r[k]).filter(Boolean))].sort();
  const projs = useMemo(() => uniq(norm,'proj'),  [norm]);
  const cities = useMemo(() => uniq(norm,'city'),  [norm]);
  const chans  = useMemo(() => uniq(norm,'chan'),  [norm]);
  const sups   = useMemo(() => uniq(norm,'sup'),   [norm]);
  const weeks  = useMemo(() => uniq(norm,'week'),  [norm]);
  const lastW  = weeks[weeks.length-1] || '';

  const base = useMemo(() => {
    if (fActive==='Active')   return norm.filter(r=>r.act==='Active');
    if (fActive==='Inactive') return norm.filter(r=>r.act==='Inactive');
    return norm;
  }, [norm,fActive]);

  const filt = useMemo(() => {
    let d = base;
    if (fProject) d=d.filter(r=>r.proj===fProject);
    if (fCity)    d=d.filter(r=>r.city===fCity);
    if (fChannel) d=d.filter(r=>r.chan===fChannel);
    if (fSup)     d=d.filter(r=>r.sup===fSup);
    if (fWeek)    d=d.filter(r=>r.week===fWeek);
    if (search.trim()) { const q=search.toLowerCase(); d=d.filter(r=>r.store.toLowerCase().includes(q)||r.proj.toLowerCase().includes(q)||r.sup.toLowerCase().includes(q)||r.notes.toLowerCase().includes(q)); }
    return d;
  }, [base,fProject,fCity,fChannel,fSup,fWeek,search]);

  const K = useMemo(()=>({
    total:  base.length,
    src:    base.filter(r=>r.status==='Sourcing').length,
    itv:    base.filter(r=>r.status==='Interviewing').length,
    off:    base.filter(r=>r.status==='Offering'||r.status==='Offer Sent').length,
    pend:   base.filter(r=>r.status==='Pending').length,
    done:   base.filter(r=>r.isDone).length,
    over:   base.filter(r=>r.isOver).length,
    tt:     base.filter(r=>r.rType.toLowerCase().includes('thay')).length,
    dt:     base.filter(r=>r.rType.toLowerCase().includes('m\u1edbi')||r.rType.toLowerCase().includes('moi')).length,
    cv:     base.reduce((a,r)=>a+r.cv,0),
  }),[base]);

  const stChart = useMemo(()=>{ const m={}; base.forEach(r=>{m[r.status]=(m[r.status]||0)+1;}); return Object.entries(m).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value); },[base]);

  const wkData = useMemo(()=>{
    const m={};
    norm.forEach(r=>{
      const w=r.week||'?';
      if(!m[w]) m[w]={week:w,Sourcing:0,Interviewing:0,Offering:0,Pending:0,Xong:0};
      if(r.isDone) m[w].Xong++;
      else if(r.status==='Sourcing') m[w].Sourcing++;
      else if(r.status==='Interviewing') m[w].Interviewing++;
      else if(r.status==='Offering'||r.status==='Offer Sent') m[w].Offering++;
      else if(r.status==='Pending') m[w].Pending++;
    });
    return Object.values(m).sort((a,b)=>a.week.localeCompare(b.week));
  },[norm]);

  const chData = useMemo(()=>{ const m={}; base.forEach(r=>{const k=r.chan||'Khac'; if(!m[k]) m[k]={channel:k,total:0,done:0}; m[k].total++; if(r.isDone) m[k].done++;}); return Object.values(m).sort((a,b)=>b.total-a.total); },[base]);
  const ctData = useMemo(()=>{ const m={}; base.forEach(r=>{const k=r.city||'Khac'; if(!m[k]) m[k]={city:k,total:0,done:0,src:0,over:0}; m[k].total++; if(r.isDone) m[k].done++; if(r.status==='Sourcing') m[k].src++; if(r.isOver) m[k].over++;}); return Object.values(m).sort((a,b)=>b.total-a.total); },[base]);
  const spData = useMemo(()=>{ const m={}; base.forEach(r=>{const k=r.sup||'N/A'; if(!m[k]) m[k]={sup:k,total:0,done:0,over:0}; m[k].total++; if(r.isDone) m[k].done++; if(r.isOver) m[k].over++;}); return Object.values(m).sort((a,b)=>b.total-a.total); },[base]);
  const pcData = useMemo(()=>{ const m={}; base.forEach(r=>{const k=r.pic||'N/A'; if(!m[k]) m[k]={pic:k,total:0,done:0}; m[k].total++; if(r.isDone) m[k].done++;}); return Object.values(m).sort((a,b)=>b.total-a.total); },[base]);
  const ovRows = useMemo(()=>base.filter(r=>r.isOver).sort((a,b)=>(b.overDays||0)-(a.overDays||0)),[base]);

  const exportPDF = async () => {
    if (!ref.current) return;
    const c = await html2canvas(ref.current,{scale:2,useCORS:true});
    const p = new jsPDF('l','mm','a3');
    const w = p.internal.pageSize.getWidth();
    p.addImage(c.toDataURL('image/png'),'PNG',0,0,w,(c.height*w)/c.width);
    p.save(`HR_Report_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-slate-500">Đang tải HR_Status…</p>
      </div>
    </div>
  );

  const TABS = [
    {id:'overview',label:'Tổng quan',   icon:'fa-gauge-high'},
    {id:'weekly',  label:'Theo tuần',   icon:'fa-calendar-week'},
    {id:'city',    label:'TP / Kênh',   icon:'fa-city'},
    {id:'pic',     label:'Nhân sự HR',  icon:'fa-users'},
    {id:'sla',     label:'Quá hạn',     icon:'fa-triangle-exclamation', badge:ovRows.length},
    {id:'detail',  label:'Chi tiết',    icon:'fa-table-list'},
  ];
  const fd = d => d ? d.toLocaleDateString('vi-VN') : '—';
  const pc = (a,b) => b ? Math.round(a/b*100) : 0;
  const PBar = ({done,total,col='emerald'}) => (
    <div className="flex items-center gap-1.5">
      <div className="w-12 bg-slate-200 rounded-full h-1.5">
        <div className={`bg-${col}-500 h-1.5 rounded-full`} style={{width:`${pc(done,total)}%`}} />
      </div>
      <span className={`text-${col}-600 font-semibold text-[10px]`}>{pc(done,total)}%</span>
    </div>
  );

  return (
    <div className="space-y-5" ref={ref}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 text-white flex items-center justify-center shadow-md">
              <i className="fa-solid fa-user-plus text-sm" />
            </div>
            HR — Báo Cáo Tuyển Dụng
          </h2>
          <p className="text-xs text-slate-500 mt-1">{norm.length} dòng · Tuần mới nhất: <span className="font-semibold text-violet-600">{lastW}</span></p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={fActive} onChange={e=>setFActive(e.target.value)} className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none cursor-pointer">
            <option value="Active">✅ Active</option>
            <option value="Inactive">⚪ Inactive</option>
            <option value="">📋 Tất cả</option>
          </select>
          <button onClick={exportPDF} className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all cursor-pointer">
            <i className="fa-solid fa-file-pdf" /> Xuất PDF
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 bg-slate-100 p-1.5 rounded-2xl overflow-x-auto">
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${tab===t.id?'bg-white text-violet-700 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>
            <i className={`fa-solid ${t.icon}`} /> {t.label}
            {t.badge>0&&<span className="bg-rose-500 text-white text-[10px] font-bold rounded-full px-1.5">{t.badge}</span>}
          </button>
        ))}
      </div>

      {tab==='overview'&&(
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {[
              {icon:'fa-store',label:'Tổng Vị Trí',val:K.total,c:'blue'},
              {icon:'fa-magnifying-glass',label:'Sourcing',val:K.src,c:'amber'},
              {icon:'fa-comments',label:'Interviewing',val:K.itv,c:'violet'},
              {icon:'fa-handshake',label:'Offering',val:K.off,c:'sky'},
              {icon:'fa-circle-check',label:'Hoàn thành',val:K.done,c:'emerald'},
              {icon:'fa-pause-circle',label:'Pending',val:K.pend,c:'slate'},
              {icon:'fa-triangle-exclamation',label:'Quá hạn',val:K.over,c:'rose'},
              {icon:'fa-arrows-rotate',label:'Thay thế',val:K.tt,c:'orange'},
              {icon:'fa-rocket',label:'Đầu tư mới',val:K.dt,c:'indigo'},
              {icon:'fa-file-lines',label:'Tổng CV',val:K.cv,c:'teal'},
            ].map(({icon,label,val,c})=>(
              <div key={label} className={`bg-${c}-50 border border-${c}-200 rounded-2xl p-4 shadow-xs`}>
                <div className={`w-8 h-8 bg-${c}-100 rounded-xl flex items-center justify-center mb-2`}>
                  <i className={`fa-solid ${icon} text-${c}-600 text-sm`} />
                </div>
                <div className={`text-2xl font-bold text-${c}-800`}>{val}</div>
                <div className={`text-[10px] font-semibold text-${c}-500 uppercase tracking-wide mt-0.5`}>{label}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <h3 className="text-sm font-bold text-slate-700 mb-3"><i className="fa-solid fa-chart-bar text-violet-500 mr-1.5"/>Phân Bổ Trạng Thái</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stChart} layout="vertical" margin={{left:10}}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false}/>
                  <XAxis type="number" tick={{fontSize:11}}/>
                  <YAxis type="category" dataKey="name" tick={{fontSize:11}} width={95}/>
                  <Tooltip/>
                  <Bar dataKey="value" name="Vị trí" radius={[0,4,4,0]}>
                    {stChart.map((e,i)=><Cell key={i} fill={SC[e.name]||CP[i%CP.length]}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <h3 className="text-sm font-bold text-slate-700 mb-3"><i className="fa-solid fa-store text-sky-500 mr-1.5"/>Phân Bổ Kênh</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chData.slice(0,8)} layout="vertical" margin={{left:10}}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false}/>
                  <XAxis type="number" tick={{fontSize:11}}/>
                  <YAxis type="category" dataKey="channel" tick={{fontSize:11}} width={75}/>
                  <Tooltip/><Legend/>
                  <Bar dataKey="total" name="Tổng" fill="#3b82f6" radius={[0,3,3,0]}/>
                  <Bar dataKey="done"  name="Xong" fill="#10b981" radius={[0,3,3,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs overflow-x-auto">
            <h3 className="text-sm font-bold text-slate-700 mb-3"><i className="fa-solid fa-grid-2 text-orange-500 mr-1.5"/>Loại Tuyển Dụng Theo Project</h3>
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-50 border-b border-slate-200">
                {['Project','Thay thế','Đầu tư mới','Khác','Tổng','Hoàn thành','Tỷ lệ'].map(h=><th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody>
                {[...new Set(base.map(r=>r.proj))].filter(Boolean).sort().map(p=>{
                  const pr=base.filter(r=>r.proj===p);
                  const tt=pr.filter(r=>r.rType.toLowerCase().includes('thay')).length;
                  const dt=pr.filter(r=>r.rType.toLowerCase().includes('m\u1edbi')||r.rType.toLowerCase().includes('moi')).length;
                  const dn=pr.filter(r=>r.isDone).length;
                  return(
                    <tr key={p} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 font-semibold text-slate-800">{p}</td>
                      <td className="px-3 py-2 text-orange-600">{tt}</td>
                      <td className="px-3 py-2 text-indigo-600">{dt}</td>
                      <td className="px-3 py-2 text-slate-400">{pr.length-tt-dt}</td>
                      <td className="px-3 py-2 font-bold">{pr.length}</td>
                      <td className="px-3 py-2 text-emerald-600">{dn}</td>
                      <td className="px-3 py-2"><PBar done={dn} total={pr.length}/></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==='weekly'&&(
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <h3 className="text-sm font-bold text-slate-700 mb-4"><i className="fa-solid fa-chart-column text-violet-500 mr-1.5"/>Tiến Độ Tuyển Dụng Theo Tuần</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={wkData}><CartesianGrid strokeDasharray="3 3"/>
                <XAxis dataKey="week" tick={{fontSize:10}}/><YAxis tick={{fontSize:11}}/><Tooltip/><Legend/>
                <Bar dataKey="Sourcing"     stackId="a" fill="#f59e0b"/>
                <Bar dataKey="Interviewing" stackId="a" fill="#8b5cf6"/>
                <Bar dataKey="Offering"     stackId="a" fill="#3b82f6"/>
                <Bar dataKey="Pending"      stackId="a" fill="#94a3b8"/>
                <Bar dataKey="Xong"         stackId="a" fill="#10b981" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-50 border-b border-slate-200">
                {['Tuần','Sourcing','Interviewing','Offering','Pending','Xong','Tổng'].map(h=><th key={h} className="px-3 py-2 text-center font-semibold text-slate-500 uppercase">{h}</th>)}
              </tr></thead>
              <tbody>
                {wkData.map(w=>{
                  const tot=w.Sourcing+w.Interviewing+w.Offering+w.Pending+w.Xong;
                  return(
                    <tr key={w.week} className={`border-b border-slate-100 hover:bg-slate-50 ${w.week===lastW?'bg-violet-50/50':''}`}>
                      <td className="px-3 py-2 font-bold text-violet-700">{w.week}{w.week===lastW&&<span className="ml-1 text-[9px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full">Now</span>}</td>
                      <td className="px-3 py-2 text-center text-amber-600">{w.Sourcing}</td>
                      <td className="px-3 py-2 text-center text-violet-600">{w.Interviewing}</td>
                      <td className="px-3 py-2 text-center text-blue-600">{w.Offering}</td>
                      <td className="px-3 py-2 text-center text-slate-500">{w.Pending}</td>
                      <td className="px-3 py-2 text-center text-emerald-600 font-bold">{w.Xong}</td>
                      <td className="px-3 py-2 text-center font-bold">{tot}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==='city'&&(
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <h3 className="text-sm font-bold text-slate-700 mb-4"><i className="fa-solid fa-city text-sky-500 mr-1.5"/>Phân Bổ Theo Thành Phố</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={ctData.slice(0,12)} margin={{bottom:40}}>
                <CartesianGrid strokeDasharray="3 3"/>
                <XAxis dataKey="city" tick={{fontSize:9}} angle={-30} textAnchor="end" height={55}/>
                <YAxis tick={{fontSize:11}}/><Tooltip/><Legend/>
                <Bar dataKey="total" name="Tổng"    fill="#3b82f6" radius={[3,3,0,0]}/>
                <Bar dataKey="done"  name="Xong"    fill="#10b981" radius={[3,3,0,0]}/>
                <Bar dataKey="over"  name="Quá hạn" fill="#ef4444" radius={[3,3,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs overflow-x-auto">
              <h3 className="text-sm font-bold text-slate-700 mb-3"><i className="fa-solid fa-map-location-dot text-sky-500 mr-1.5"/>Theo Thành Phố</h3>
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50 border-b border-slate-200">{['TP','Tổng','Sourcing','Xong','Q.hạn','Tỷ lệ'].map(h=><th key={h} className="px-2 py-2 text-left font-semibold text-slate-500">{h}</th>)}</tr></thead>
                <tbody>
                  {ctData.map(c=>(
                    <tr key={c.city} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-2 py-2 font-medium text-slate-800 whitespace-nowrap">{c.city}</td>
                      <td className="px-2 py-2 font-bold">{c.total}</td>
                      <td className="px-2 py-2 text-amber-600">{c.src}</td>
                      <td className="px-2 py-2 text-emerald-600">{c.done}</td>
                      <td className="px-2 py-2 text-rose-600">{c.over}</td>
                      <td className="px-2 py-2"><PBar done={c.done} total={c.total}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs overflow-x-auto">
              <h3 className="text-sm font-bold text-slate-700 mb-3"><i className="fa-solid fa-store text-indigo-500 mr-1.5"/>Theo Kênh</h3>
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50 border-b border-slate-200">{['Kênh','Tổng','Xong','Tỷ lệ'].map(h=><th key={h} className="px-2 py-2 text-left font-semibold text-slate-500">{h}</th>)}</tr></thead>
                <tbody>
                  {chData.map(c=>(
                    <tr key={c.channel} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-2 py-2 font-medium text-slate-800">{c.channel}</td>
                      <td className="px-2 py-2 font-bold">{c.total}</td>
                      <td className="px-2 py-2 text-emerald-600">{c.done}</td>
                      <td className="px-2 py-2"><PBar done={c.done} total={c.total}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab==='pic'&&(
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <h3 className="text-sm font-bold text-slate-700 mb-4"><i className="fa-solid fa-chart-bar text-blue-500 mr-1.5"/>Workload Supervisor</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={spData}>
                <CartesianGrid strokeDasharray="3 3"/>
                <XAxis dataKey="sup" tick={{fontSize:10}}/><YAxis tick={{fontSize:11}}/><Tooltip/><Legend/>
                <Bar dataKey="total" name="Tổng"    fill="#3b82f6" radius={[4,4,0,0]}/>
                <Bar dataKey="done"  name="Xong"    fill="#10b981" radius={[4,4,0,0]}/>
                <Bar dataKey="over"  name="Quá hạn" fill="#ef4444" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs overflow-x-auto">
              <h3 className="text-sm font-bold text-slate-700 mb-3"><i className="fa-solid fa-user-tie text-blue-500 mr-1.5"/>Supervisor</h3>
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50 border-b border-slate-200">{['Sup','Tổng','Xong','Q.hạn','Tỷ lệ'].map(h=><th key={h} className="px-2 py-2 text-left font-semibold text-slate-500">{h}</th>)}</tr></thead>
                <tbody>
                  {spData.map(s=>(
                    <tr key={s.sup} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-2 py-2.5 font-medium text-slate-800">{s.sup}</td>
                      <td className="px-2 py-2.5 font-bold">{s.total}</td>
                      <td className="px-2 py-2.5 text-emerald-600">{s.done}</td>
                      <td className="px-2 py-2.5 text-rose-600">{s.over}</td>
                      <td className="px-2 py-2.5 text-violet-600 font-semibold">{pc(s.done,s.total)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs overflow-x-auto">
              <h3 className="text-sm font-bold text-slate-700 mb-3"><i className="fa-solid fa-user-check text-violet-500 mr-1.5"/>PIC Tuyển Dụng + PV</h3>
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50 border-b border-slate-200">{['PIC','Tổng','Xong','Tỷ lệ'].map(h=><th key={h} className="px-2 py-2 text-left font-semibold text-slate-500">{h}</th>)}</tr></thead>
                <tbody>
                  {pcData.map(p=>(
                    <tr key={p.pic} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-2 py-2.5 font-medium text-slate-800">{p.pic}</td>
                      <td className="px-2 py-2.5 font-bold">{p.total}</td>
                      <td className="px-2 py-2.5 text-emerald-600">{p.done}</td>
                      <td className="px-2 py-2.5"><PBar done={p.done} total={p.total} col="violet"/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab==='sla'&&(
        <div className="space-y-4">
          {ovRows.length>0&&(
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
                <i className="fa-solid fa-triangle-exclamation"/> {ovRows.length} vị trí đã quá Due Date — cần xử lý ngay!
              </div>
            </div>
          )}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-50 border-b border-slate-200">
                {['Store','Project','City','Channel','Sup','PIC','Trạng thái','Trống từ','Due Date','Quá hạn','Ghi chú'].map(h=><th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500 uppercase whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody>
                {ovRows.map((r,i)=>(
                  <tr key={i} className="border-b border-slate-100 hover:bg-rose-50/40">
                    <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap max-w-[150px] truncate" title={r.store}>{r.store}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{r.proj}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{r.city}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{r.chan}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{r.sup}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{r.pic}</td>
                    <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${SB[r.status]||'bg-slate-100 text-slate-600'}`}>{r.status}</span></td>
                    <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">{fd(r.vacantDate)}</td>
                    <td className="px-3 py-2.5 font-mono text-rose-600 whitespace-nowrap">{fd(r.dueDate)}</td>
                    <td className="px-3 py-2.5"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">+{r.overDays} ngày</span></td>
                    <td className="px-3 py-2.5 text-slate-400 max-w-[200px] truncate" title={r.notes}>{r.notes||'—'}</td>
                  </tr>
                ))}
                {ovRows.length===0&&<tr><td colSpan="11" className="p-10 text-center text-emerald-600 font-medium"><i className="fa-solid fa-circle-check text-xl mr-2"/>Không có vị trí nào quá hạn!</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==='detail'&&(
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2.5">
              <div className="lg:col-span-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tìm kiếm</label>
                <input value={search} onChange={e=>setSearch(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-400"
                  placeholder="Store, Sup, ghi chú..."/>
              </div>
              {[
                {label:'Project',    val:fProject, set:setFProject, opts:projs},
                {label:'Thành phố',  val:fCity,    set:setFCity,    opts:cities},
                {label:'Kênh',       val:fChannel, set:setFChannel, opts:chans},
                {label:'Supervisor', val:fSup,     set:setFSup,     opts:sups},
                {label:'Tuần',       val:fWeek,    set:setFWeek,    opts:weeks},
              ].map(({label,val,set,opts})=>(
                <div key={label}>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{label}</label>
                  <select value={val} onChange={e=>set(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white outline-none cursor-pointer">
                    <option value="">Tất cả</option>
                    {opts.map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="mt-2.5 text-xs text-slate-400 flex items-center justify-between">
              <span>Hiển thị <strong className="text-slate-600">{filt.length}</strong> / {base.length} dòng</span>
              <button onClick={()=>{setSearch('');setFProject('');setFCity('');setFChannel('');setFSup('');setFWeek('');}} className="text-violet-600 hover:text-violet-800 font-semibold cursor-pointer">Xóa bộ lọc</button>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-50 border-b border-slate-200">
                {['#','Store','Project','City','Channel','Sup','PIC','Loại TD','Trạng thái','Shop','Trống từ','Due Date','Xong ngày','SLA','Ghi chú'].map(h=><th key={h} className="px-2.5 py-2.5 text-left font-semibold text-slate-500 uppercase whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody>
                {filt.map((r,i)=>(
                  <tr key={i} className={`border-b border-slate-100 hover:bg-slate-50 ${r.isOver?'bg-rose-50/20':''}`}>
                    <td className="px-2.5 py-2.5 text-slate-400">{i+1}</td>
                    <td className="px-2.5 py-2.5 font-medium text-slate-800 whitespace-nowrap max-w-[140px] truncate" title={r.store}>{r.store}</td>
                    <td className="px-2.5 py-2.5 text-slate-600 whitespace-nowrap">{r.proj}</td>
                    <td className="px-2.5 py-2.5 text-slate-600 whitespace-nowrap">{r.city}</td>
                    <td className="px-2.5 py-2.5 text-slate-600 whitespace-nowrap">{r.chan}</td>
                    <td className="px-2.5 py-2.5 text-slate-600 whitespace-nowrap">{r.sup}</td>
                    <td className="px-2.5 py-2.5 text-slate-600 whitespace-nowrap">{r.pic}</td>
                    <td className="px-2.5 py-2.5 text-slate-600 whitespace-nowrap">{r.rType}</td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      {r.isDone
                        ?<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">✓ Xong</span>
                        :<span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${SB[r.status]||'bg-slate-100 text-slate-600'}`}>{r.status}</span>
                      }
                      {r.isOver&&<span className="ml-1 text-rose-500 text-[10px]">⚠</span>}
                    </td>
                    <td className="px-2.5 py-2.5 text-slate-500 whitespace-nowrap">{r.shopSt}</td>
                    <td className="px-2.5 py-2.5 font-mono text-slate-600 whitespace-nowrap">{fd(r.vacantDate)}</td>
                    <td className="px-2.5 py-2.5 font-mono whitespace-nowrap" style={{color:r.isOver?'#ef4444':'#64748b'}}>{fd(r.dueDate)}</td>
                    <td className="px-2.5 py-2.5 font-mono text-emerald-600 whitespace-nowrap">{fd(r.compDate)}</td>
                    <td className="px-2.5 py-2.5 text-center">
                      {r.slaDays!==null
                        ?<span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.slaDays<=7?'bg-emerald-100 text-emerald-700':r.slaDays<=14?'bg-amber-100 text-amber-700':'bg-rose-100 text-rose-700'}`}>{r.slaDays}</span>
                        :'—'}
                    </td>
                    <td className="px-2.5 py-2.5 text-slate-400 max-w-[180px] truncate" title={r.notes}>{r.notes||'—'}</td>
                  </tr>
                ))}
                {filt.length===0&&<tr><td colSpan="15" className="p-8 text-center text-slate-400">Không có kết quả phù hợp.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
