import React, { useState, useMemo, useRef } from 'react';
import { UFF_CHECKIN_DATA } from '../data/mockData';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const STATUS_STYLE = {
  Active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Late:   'bg-amber-100 text-amber-700 border-amber-200',
  Absent: 'bg-rose-100 text-rose-700 border-rose-200',
};

const QC_COLOR = (score) => {
  if (!score) return 'text-slate-400';
  if (score >= 90) return 'text-emerald-700 font-bold';
  if (score >= 75) return 'text-amber-700 font-bold';
  return 'text-rose-700 font-bold';
};

export default function ReportView() {
  const [search,    setSearch]    = useState('');
  const [selDate,   setSelDate]   = useState('');
  const [selStatus, setSelStatus] = useState('');
  const [selectedRow, setSelectedRow] = useState(null);
  const contentRef = useRef();
  const modalRef   = useRef();

  const rows = useMemo(() => {
    let d = UFF_CHECKIN_DATA;
    if (selDate)   d = d.filter(r => r.date === selDate);
    if (selStatus) d = d.filter(r => r.status === selStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      d = d.filter(r =>
        r.storeName.toLowerCase().includes(q)   ||
        r.storeCode.toLowerCase().includes(q)   ||
        r.sup.toLowerCase().includes(q)          ||
        r.project.toLowerCase().includes(q)      ||
        r.region.toLowerCase().includes(q)       ||
        r.detail.toLowerCase().includes(q)
      );
    }
    return d;
  }, [search, selDate, selStatus]);

  const totalActive  = UFF_CHECKIN_DATA.filter(r => r.status === 'Active').length;
  const totalLate    = UFF_CHECKIN_DATA.filter(r => r.status === 'Late').length;
  const totalAbsent  = UFF_CHECKIN_DATA.filter(r => r.status === 'Absent').length;
  const avgQC        = Math.round(UFF_CHECKIN_DATA.filter(r=>r.qcScore>0).reduce((a,r)=>a+r.qcScore,0) / UFF_CHECKIN_DATA.filter(r=>r.qcScore>0).length);

  const uniqueDates  = [...new Set(UFF_CHECKIN_DATA.map(r=>r.date))].sort().reverse();

  const exportPDF = async () => {
    const el = contentRef.current;
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true });
    const img    = canvas.toDataURL('image/png');
    const pdf    = new jsPDF('l', 'mm', 'a3');
    const w      = pdf.internal.pageSize.getWidth();
    pdf.addImage(img, 'PNG', 0, 0, w, (canvas.height * w) / canvas.width);
    pdf.save(`BaoCao_CheckIn_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  const exportCustomerReport = async () => {
    if (!selectedRow) return alert('Vui lòng chọn 1 dòng dữ liệu trước.');
    const el = modalRef.current;
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true });
    const img    = canvas.toDataURL('image/png');
    const pdf    = new jsPDF('p', 'mm', 'a4');
    const w      = pdf.internal.pageSize.getWidth();
    pdf.addImage(img, 'PNG', 0, 0, w, (canvas.height * w) / canvas.width);
    pdf.save(`BaoCao_KhachHang_${selectedRow.storeCode}_${selectedRow.date}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <i className="fa-solid fa-link text-teal-600" /> Báo Cáo Check-In / UFF
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Dữ liệu từ hệ thống UFF — check-in BA, hình ảnh, QC score cho khách hàng.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCustomerReport}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm transition-all cursor-pointer"
          >
            <i className="fa-solid fa-file-invoice" /> Báo Cáo Khách Hàng
          </button>
          <button
            onClick={exportPDF}
            className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm transition-all cursor-pointer"
          >
            <i className="fa-solid fa-file-pdf" /> Xuất PDF Toàn Bộ
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiBox icon="fa-circle-check"  label="Check-In Đúng Giờ"  value={totalActive}  color="emerald" />
        <KpiBox icon="fa-clock"         label="Check-In Trễ"        value={totalLate}    color="amber"   />
        <KpiBox icon="fa-circle-xmark"  label="Vắng Mặt"            value={totalAbsent}  color="rose"    />
        <KpiBox icon="fa-star"          label="QC Score TB"         value={`${avgQC}%`}  color="blue"    />
      </div>

      {/* UFF Integration notice */}
      <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 flex items-start gap-3 text-sm">
        <i className="fa-solid fa-plug text-teal-600 mt-0.5" />
        <div>
          <span className="font-semibold text-teal-800">Kết Nối UFF API: </span>
          <span className="text-teal-700">
            Dữ liệu đang dùng mock. Khi bạn cung cấp UFF API endpoint, hệ thống sẽ tự động lấy check-in thực tế,
            hình ảnh BA và QC score theo ngày.
          </span>
          <div className="mt-1 text-xs text-teal-600 font-mono bg-teal-100 rounded px-2 py-1 inline-block">
            GET /api/uff/checkin?date=YYYY-MM-DD&store=STORE_CODE
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">🔍 Tìm kiếm</label>
          <input type="text" value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Store, Sup, Đà Nẵng…"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 outline-none focus:ring-2 focus:ring-teal-100 focus:border-teal-400 w-48" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Ngày</label>
          <select value={selDate} onChange={e=>setSelDate(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 outline-none cursor-pointer">
            <option value="">Tất cả ngày</option>
            {uniqueDates.map(d=><option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Trạng thái</label>
          <select value={selStatus} onChange={e=>setSelStatus(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 outline-none cursor-pointer">
            <option value="">Tất cả</option>
            <option value="Active">Active</option>
            <option value="Late">Trễ</option>
            <option value="Absent">Vắng</option>
          </select>
        </div>
        <div className="self-end pb-2 ml-auto">
          <span className="text-xs text-slate-400">
            {selectedRow
              ? <span className="text-teal-600 font-semibold">✓ Đã chọn: {selectedRow.storeName} — nhấn "Báo Cáo KH" để xuất</span>
              : 'Click vào dòng để chọn báo cáo khách hàng'}
          </span>
        </div>
      </div>

      {/* Table */}
      <div ref={contentRef} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[900px]">
            <thead>
              <tr className="bg-slate-800 text-white text-left">
                {['Ngày','Store Code','Tên Store','Project','Brand','Ca Làm Việc','Supervisor','Status','Region','Check-In','Check-Out','QC Score'].map(h=>(
                  <th key={h} className="px-3 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <tr><td colSpan={12} className="p-8 text-center text-slate-400">Không có dữ liệu.</td></tr>
              )}
              {rows.map((r, i) => {
                const isSelected = selectedRow === r;
                return (
                  <tr
                    key={i}
                    onClick={() => setSelectedRow(isSelected ? null : r)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-teal-100 border-l-4 border-teal-500'
                        : i%2===0 ? 'bg-white hover:bg-teal-50/30' : 'bg-slate-50/40 hover:bg-teal-50/30'
                    }`}
                  >
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{r.date}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{r.storeCode}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-800 whitespace-nowrap">{r.storeName}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.project}</td>
                    <td className="px-3 py-2.5 text-slate-500">{r.brand}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{r.workingTime}</td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{r.sup}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_STYLE[r.status]}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <RegionBadge region={r.region} detail={r.detail} />
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-700 font-medium">{r.checkinTime || '—'}</td>
                    <td className="px-3 py-2.5 text-center text-slate-700 font-medium">{r.checkoutTime || '—'}</td>
                    <td className="px-3 py-2.5 text-center">
                      {r.qcScore > 0
                        ? <span className={QC_COLOR(r.qcScore)}>{r.qcScore}%</span>
                        : <span className="text-slate-300 text-xs">—</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Report Preview Panel */}
      {selectedRow && (
        <div ref={modalRef} className="bg-white border-2 border-teal-300 rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-teal-600 to-cyan-600 px-6 py-4 text-white">
            <h3 className="font-bold text-base flex items-center gap-2">
              <i className="fa-solid fa-file-invoice" /> BÁO CÁO KHÁCH HÀNG — {selectedRow.storeName}
            </h3>
            <p className="text-xs text-teal-100 mt-0.5">Ngày: {selectedRow.date} · Project: {selectedRow.project} · Brand: {selectedRow.brand}</p>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Checkin info */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-700 border-b pb-2">Thông Tin Check-In</h4>
              <InfoRow label="Supervisor"    value={selectedRow.sup} />
              <InfoRow label="Ca làm việc"  value={selectedRow.workingTime} />
              <InfoRow label="Check-In"     value={selectedRow.checkinTime || 'Chưa check-in'} />
              <InfoRow label="Check-Out"    value={selectedRow.checkoutTime || 'Chưa check-out'} />
              <InfoRow label="Trạng thái"   value={
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_STYLE[selectedRow.status]}`}>
                  {selectedRow.status}
                </span>
              } />
              <InfoRow label="QC Score"     value={
                <span className={QC_COLOR(selectedRow.qcScore)}>
                  {selectedRow.qcScore > 0 ? `${selectedRow.qcScore}%` : 'N/A'}
                </span>
              } />
            </div>
            {/* Photo */}
            <div>
              <h4 className="text-sm font-bold text-slate-700 border-b pb-2 mb-3">Hình Ảnh Check-In BA</h4>
              {selectedRow.photo ? (
                <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                  <img
                    src={selectedRow.photo}
                    alt="Check-in BA"
                    className="w-full object-cover"
                    crossOrigin="anonymous"
                    onError={e => { e.target.src='https://picsum.photos/200/150'; }}
                  />
                  <div className="bg-slate-50 px-3 py-2 text-xs text-slate-500 flex items-center gap-1">
                    <i className="fa-solid fa-camera text-slate-400" />
                    Ảnh check-in tự động từ UFF App
                  </div>
                </div>
              ) : (
                <div className="h-32 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 text-sm border border-dashed border-slate-300">
                  <i className="fa-solid fa-image text-2xl" />
                </div>
              )}
            </div>
          </div>
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-400 flex items-center gap-2">
            <i className="fa-solid fa-shield-halved text-slate-300" />
            Báo cáo tự động từ hệ thống Field Operation Dashboard · {new Date().toLocaleDateString('vi-VN')}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500 font-medium">{label}</span>
      <span className="text-slate-800 font-semibold">{value}</span>
    </div>
  );
}

function RegionBadge({ region, detail }) {
  const map = {
    HCM:  'bg-blue-100 text-blue-700 border-blue-200',
    HN:   'bg-indigo-100 text-indigo-700 border-indigo-200',
    Tỉnh: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };
  return (
    <div>
      <span className={`inline-block border px-2 py-0.5 rounded-full text-[10px] font-bold ${map[region]}`}>
        {region}
      </span>
      <div className="text-[10px] text-slate-400 mt-0.5">{detail}</div>
    </div>
  );
}

function KpiBox({ icon, label, value, color }) {
  const clr = {
    emerald:'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber:  'bg-amber-50 border-amber-200 text-amber-700',
    rose:   'bg-rose-50 border-rose-200 text-rose-700',
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
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
