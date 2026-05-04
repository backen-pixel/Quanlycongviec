import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { formatVND } from '../lib/utils';
import { useAuth } from '../lib/auth';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
  ComposedChart,
} from 'recharts';
import {
  TrendingUp,
  Users,
  Wrench,
  Building2,
  AlertTriangle,
  Filter,
  RefreshCw,
  ClipboardCheck,
} from 'lucide-react';

const EXEC_ROLES = ['admin', 'manager', 'director', 'supervisor'];

const PIE_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0d9488', '#ea580c'];

export default function ExecutiveKpiPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const canView = EXEC_ROLES.includes(user?.role);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = {};
      if (dateFrom) params.date_from = new Date(dateFrom).toISOString();
      if (dateTo) params.date_to = new Date(dateTo + 'T23:59:59').toISOString();
      if (companyId) params.company_id = companyId;
      const r = await api.get('/crm/executive/summary', { params });
      setData(r.data);
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Lỗi tải dữ liệu');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canView) return;
    api.get('/companies').then((r) => setCompanies(r.data?.companies || [])).catch(() => setCompanies([]));
  }, [canView]);

  useEffect(() => {
    if (!canView) return;
    load();
  }, [canView]);

  const salesChartData = useMemo(() => {
    const rows = data?.sales_by_user || [];
    return rows.slice(0, 12).map((r) => ({
      name: r.full_name?.length > 14 ? `${r.full_name.slice(0, 12)}…` : r.full_name || '—',
      Doanh_thu: Math.round(r.revenue || 0),
      Diem: r.score ?? 0,
    }));
  }, [data]);

  const deptPieData = useMemo(() => {
    const rows = data?.by_department || [];
    return rows.slice(0, 8).map((d) => ({
      name: d.department_name || '—',
      value: Math.round(d.revenue || 0),
    }));
  }, [data]);

  const scoreCompareData = useMemo(() => {
    const sales = data?.sales_by_user || [];
    return sales.slice(0, 8).map((r) => ({
      name: r.full_name?.length > 12 ? `${r.full_name.slice(0, 10)}…` : r.full_name || '—',
      Diem: r.score ?? 0,
      Thu_tien: Math.min(100, Math.round(r.payment_ratio || 0)),
    }));
  }, [data]);

  const monthly = data?.monthly_series || [];

  if (!canView) {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center p-8 bg-amber-50 border border-amber-200 rounded-xl">
        <p className="text-amber-900 font-medium">Bạn không có quyền xem KPI Giám đốc.</p>
        <p className="text-sm text-amber-800 mt-2">Cần vai trò: Admin, Quản lý, Giám đốc hoặc Supervisor.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="h-7 w-7 text-indigo-600" /> KPI Giám đốc (theo Đơn hàng)
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Doanh thu &amp; sản lượng cho Sale và Lắp đặt; đối soát chéo CRM — Dự án — Đơn.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400 hidden sm:block" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 px-2 border rounded-lg text-sm"
          />
          <span className="text-gray-400">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 px-2 border rounded-lg text-sm"
          />
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="h-9 px-2 border rounded-lg text-sm max-w-[200px]"
          >
            <option value="">Tất cả công ty</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.short_name || c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="h-9 px-3 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-1"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Áp dụng
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
      )}

      {loading && !data ? (
        <div className="flex justify-center py-24">
          <div className="animate-spin h-10 w-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full" />
        </div>
      ) : data ? (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <div className="text-xs font-semibold text-gray-500 uppercase">Doanh thu (đơn sales)</div>
              <div className="text-xl font-bold text-gray-900 mt-1">{formatVND(data.totals?.revenue)}</div>
              <div className="text-xs text-emerald-600 mt-1">Đã thu: {formatVND(data.totals?.paid)}</div>
            </div>
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <div className="text-xs font-semibold text-gray-500 uppercase">Số đơn / Sản lượng</div>
              <div className="text-xl font-bold text-gray-900 mt-1">{data.totals?.orders} đơn</div>
              <div className="text-xs text-gray-500 mt-1">Tổng SL dòng hàng: {Math.round(data.totals?.qty || 0)}</div>
            </div>
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <div className="text-xs font-semibold text-gray-500 uppercase">Đơn có lắp đặt</div>
              <div className="text-xl font-bold text-gray-900 mt-1">{data.totals?.install_orders}</div>
              <div className="text-xs text-gray-500 mt-1">Gán NC lắp đặt trên đơn</div>
            </div>
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <div className="text-xs font-semibold text-gray-500 uppercase">Đối soát cần xem</div>
              <div className="text-xl font-bold text-amber-700 mt-1">{(data.cross_checks || []).length}</div>
              <div className="text-xs text-gray-500 mt-1">Lệch Lead/DA vs Đơn</div>
            </div>
          </div>

          <p className="text-xs text-gray-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
            {data.attribution_note}
          </p>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Sale revenue bar */}
            <div className="bg-white rounded-xl border p-5 shadow-sm">
              <h2 className="text-base font-bold text-gray-900 mb-1 flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" /> Doanh thu theo Sale (NV phụ trách)
              </h2>
              <p className="text-xs text-gray-500 mb-4">Đơn loại sales, không hủy</p>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesChartData} margin={{ top: 8, right: 8, left: 8, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={70} />
                    <YAxis tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${v}`)} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => formatVND(v)} />
                    <Bar dataKey="Doanh_thu" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Doanh thu" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Monthly line */}
            <div className="bg-white rounded-xl border p-5 shadow-sm">
              <h2 className="text-base font-bold text-gray-900 mb-4">Xu hướng theo tháng (doanh thu + số đơn)</h2>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthly} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis
                      yAxisId="left"
                      tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${v}`)}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v, name) =>
                        name === 'Doanh thu' || name === 'revenue' ? formatVND(v) : v
                      }
                    />
                    <Legend />
                    <Bar yAxisId="right" dataKey="orders" fill="#a5b4fc" name="Số đơn" radius={[4, 4, 0, 0]} />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="revenue"
                      stroke="#059669"
                      strokeWidth={2}
                      dot
                      name="Doanh thu"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Department pie */}
            <div className="bg-white rounded-xl border p-5 shadow-sm">
              <h2 className="text-base font-bold text-gray-900 mb-1 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-violet-600" /> Doanh thu theo phòng ban
              </h2>
              <p className="text-xs text-gray-500 mb-4">Gán theo phòng ban của nhân viên Sale</p>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={deptPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={110}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {deptPieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatVND(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Score vs thu tiền */}
            <div className="bg-white rounded-xl border p-5 shadow-sm">
              <h2 className="text-base font-bold text-gray-900 mb-1">Điểm KPI vs tỷ lệ thu tiền</h2>
              <p className="text-xs text-gray-500 mb-4">Điểm (0–100) so với % đã thu trên giá trị đơn</p>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scoreCompareData} margin={{ top: 8, right: 8, left: 8, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Diem" fill="#4f46e5" name="Điểm KPI" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Thu_tien" fill="#10b981" name="% Thu tiền" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Install */}
          <div className="bg-white rounded-xl border p-5 shadow-sm">
            <h2 className="text-base font-bold text-gray-900 mb-1 flex items-center gap-2">
              <Wrench className="h-5 w-5 text-orange-600" /> Lắp đặt / Thi công (sx_construction_assignee_id)
            </h2>
            <p className="text-xs text-gray-500 mb-4">Sản lượng &amp; giá trị đơn gán người lắp đặt</p>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={(data.install_by_user || []).slice(0, 12).map((r) => ({
                    name: r.full_name?.length > 14 ? `${r.full_name.slice(0, 12)}…` : r.full_name,
                    San_luong: Math.round(r.qty || 0),
                    Diem: r.score ?? 0,
                  }))}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="San_luong" fill="#ea580c" radius={[0, 4, 4, 0]} name="Sản lượng" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="px-4 py-3 border-b font-bold text-gray-900 text-sm">Bảng điểm Sale</div>
              <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left py-2 px-3">NV</th>
                      <th className="text-right py-2 px-3">Điểm</th>
                      <th className="text-right py-2 px-3">Doanh thu</th>
                      <th className="text-right py-2 px-3">SL</th>
                      <th className="text-right py-2 px-3">% Thu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.sales_by_user || []).map((r) => (
                      <tr key={r.user_id} className="border-b border-gray-100">
                        <td className="py-2 px-3">
                          <div className="font-medium">{r.full_name}</div>
                          <div className="text-xs text-gray-500">{r.department_name}</div>
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-indigo-600">{r.score}</td>
                        <td className="py-2 px-3 text-right">{formatVND(r.revenue)}</td>
                        <td className="py-2 px-3 text-right">{Math.round(r.qty || 0)}</td>
                        <td className="py-2 px-3 text-right">{r.payment_ratio}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="px-4 py-3 border-b font-bold text-gray-900 text-sm">Phòng ban (doanh thu Sale)</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left py-2 px-3">Phòng ban</th>
                      <th className="text-right py-2 px-3">NV</th>
                      <th className="text-right py-2 px-3">Đơn</th>
                      <th className="text-right py-2 px-3">Doanh thu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.by_department || []).map((d) => (
                      <tr key={d.department_id || 'x'} className="border-b border-gray-100">
                        <td className="py-2 px-3 font-medium">{d.department_name}</td>
                        <td className="py-2 px-3 text-right">{d.staff_count}</td>
                        <td className="py-2 px-3 text-right">{d.orders}</td>
                        <td className="py-2 px-3 text-right">{formatVND(d.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Cross checks */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b font-bold text-gray-900 text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Đối soát chéo (Lead/DA vs Đơn)
            </div>
            <p className="text-xs text-gray-500 px-4 pt-2">
              Cảnh báo khi chênh lệch &gt; 2% hoặc &gt; 10.000đ so với giá trị Lead hoặc Dự án.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-2 px-3">Loại</th>
                    <th className="text-left py-2 px-3">Chi tiết</th>
                    <th className="text-right py-2 px-3">Giá trị A</th>
                    <th className="text-right py-2 px-3">Giá trị B</th>
                    <th className="text-right py-2 px-3">Lệch</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.cross_checks || []).map((c, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-2 px-3 whitespace-nowrap">{c.type === 'lead_vs_orders' ? 'Lead ↔ Đơn' : 'DA ↔ Đơn'}</td>
                      <td className="py-2 px-3">
                        {c.type === 'lead_vs_orders' ? (
                          <>
                            <Link className="text-indigo-600 hover:underline" to={`/crm/leads/${c.lead_id}`}>
                              {c.lead_code || c.lead_id}
                            </Link>
                            <span className="text-gray-500 text-xs block">{c.lead_title}</span>
                          </>
                        ) : (
                          <>
                            <Link className="text-indigo-600 hover:underline" to={`/crm/orders/${c.order_id}`}>
                              {c.order_code}
                            </Link>
                            <span className="text-gray-500 text-xs block">{c.project_name}</span>
                          </>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right">{formatVND(c.estimated_value ?? c.project_value)}</td>
                      <td className="py-2 px-3 text-right">{formatVND(c.orders_total ?? c.order_total)}</td>
                      <td className="py-2 px-3 text-right text-amber-700">{formatVND(c.diff)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(!data.cross_checks || data.cross_checks.length === 0) && (
                <p className="text-center text-gray-400 py-8">Không phát hiện lệch theo ngưỡng hiện tại.</p>
              )}
            </div>
          </div>

          {/* Acceptances logged */}
          {(data.acceptances || []).length > 0 && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="px-4 py-3 border-b font-bold text-gray-900 text-sm flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-emerald-600" /> Đã ghi nhận nghiệm thu / đối soát
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left py-2 px-3">Đơn</th>
                      <th className="text-left py-2 px-3">Loại</th>
                      <th className="text-right py-2 px-3">Snapshot Đơn</th>
                      <th className="text-left py-2 px-3">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.acceptances.map((a) => (
                      <tr key={a.id} className="border-b border-gray-100">
                        <td className="py-2 px-3">
                          <Link className="text-indigo-600 hover:underline" to={`/crm/orders/${a.order_id}`}>
                            Xem đơn
                          </Link>
                        </td>
                        <td className="py-2 px-3">{a.check_type}</td>
                        <td className="py-2 px-3 text-right">{formatVND(a.snapshot_order_total)}</td>
                        <td className="py-2 px-3 text-gray-600">{a.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
