import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function DailyView() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/daily.get?start=2026-01-01&end=2026-12-31')
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) setStats(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-slate-500 font-medium">Đang tải dữ liệu Daily Store...</div>;
  }

  const mock = {
    total_store: 150,
    ba_store: 45,
    empty_store: 10,
    shift_morning: 80,
    shift_afternoon: 70,
  };
  const data = stats || mock;
  const baCoverage = ((data.ba_store / data.total_store) * 100).toFixed(1);

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <i className="fa-solid fa-store text-blue-600"></i> Daily Store Overview & Phân Ca
        </h2>
        <p className="text-xs text-slate-500 mt-1">Báo cáo số lượng cửa hàng có BA, cửa hàng trống và phân bố ca sáng / chiều trong ngày.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Tổng Số Store / Shop</div>
          <div className="text-3xl font-extrabold text-slate-800 mt-2">{data.total_store}</div>
          <div className="text-xs text-slate-400 mt-1">Hệ thống toàn quốc</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Store Có BA / PG</div>
          <div className="text-3xl font-extrabold text-blue-600 mt-2">{data.ba_store} <span className="text-xs font-normal text-slate-500">/ {data.total_store}</span></div>
          <div className="text-xs text-blue-600 font-semibold mt-1">Tỷ lệ phủ BA: {baCoverage}%</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Store Đang Trống Nhân Sự</div>
          <div className="text-3xl font-extrabold text-amber-600 mt-2">{data.empty_store}</div>
          <div className="text-xs text-amber-600 font-medium mt-1">Cần bổ sung nhân sự gấp</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Tổng Ca Trong Ngày</div>
          <div className="text-3xl font-extrabold text-emerald-600 mt-2">{data.shift_morning + data.shift_afternoon}</div>
          <div className="text-xs text-slate-500 mt-1">Sáng: <strong>{data.shift_morning}</strong> | Chiều: <strong>{data.shift_afternoon}</strong></div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
          <i className="fa-solid fa-chart-column text-blue-500"></i> Phân Thống Kê Ca Làm Việc Trong Ngày (Ca Sáng vs Ca Chiều)
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[
              { name: 'Ca Sáng (08:00 - 15:00)', value: data.shift_morning },
              { name: 'Ca Chiều (15:00 - 22:00)', value: data.shift_afternoon }
            ]}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip />
              <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} barSize={50} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
