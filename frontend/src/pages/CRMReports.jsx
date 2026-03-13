import { useState, useEffect } from 'react';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import { BarChart3, TrendingUp, Users, DollarSign, Target, FileText, ShoppingCart, Receipt, Calendar } from 'lucide-react';

export default function CRMReports() {
  const [data, setData] = useState(null);
  const [leads, setLeads] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    const [d, l, q, o, i] = await Promise.all([
      api.get('/crm/dashboard'), api.get('/crm/leads'),
      api.get('/crm/quotations'), api.get('/crm/orders'), api.get('/crm/invoices'),
    ]);
    setData(d.data); setLeads(l.data || []); setQuotes(q.data || []);
    setOrders(o.data || []); setInvoices(i.data || []);
    setLoading(false);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;

  const kpis = data?.kpis || {};
  const pipeline = data?.pipeline || [];

  // Source stats
  const sourceStats = {};
  leads.forEach(l => { const name = l.source?.name || 'Khác'; if (!sourceStats[name]) sourceStats[name] = { icon: l.source?.icon || '📋', count: 0, value: 0, won: 0 }; sourceStats[name].count++; sourceStats[name].value += l.estimated_value || 0; if (l.stage?.is_won) sourceStats[name].won++; });

  // Assignee stats
  const assigneeStats = {};
  leads.forEach(l => { const name = l.assignee?.full_name || 'Chưa gán'; if (!assigneeStats[name]) assigneeStats[name] = { count: 0, value: 0, won: 0 }; assigneeStats[name].count++; assigneeStats[name].value += l.estimated_value || 0; if (l.stage?.is_won) assigneeStats[name].won++; });

  // Quote stats
  const quoteStats = { total: quotes.length, draft: 0, sent: 0, accepted: 0, converted: 0, rejected: 0, total_value: 0 };
  quotes.forEach(q => { quoteStats[q.status] = (quoteStats[q.status] || 0) + 1; quoteStats.total_value += q.total || 0; });

  // Invoice totals
  const invTotal = invoices.reduce((s, i) => s + (i.total || 0), 0);
  const invPaid = invoices.reduce((s, i) => s + (i.paid_amount || 0), 0);

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><BarChart3 className="h-6 w-6 text-blue-600" /> Báo cáo CRM</h1><p className="text-sm text-gray-500 mt-1">Tổng quan hiệu suất bán hàng</p></div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard icon={Target} color="blue" label="Tổng Lead" value={kpis.total_leads} sub={`${kpis.won_leads} chốt`} />
        <StatCard icon={TrendingUp} color="emerald" label="Tỷ lệ chốt" value={`${kpis.conversion_rate}%`} sub="Lead → Deal" />
        <StatCard icon={FileText} color="amber" label="Báo giá" value={quoteStats.total} sub={formatVND(quoteStats.total_value)} />
        <StatCard icon={ShoppingCart} color="indigo" label="Đơn hàng" value={orders.length} sub={formatVND(orders.reduce((s, o) => s + (o.total || 0), 0))} />
        <StatCard icon={Receipt} color="purple" label="Thu tiền" value={formatVND(invPaid)} sub={`/ ${formatVND(invTotal)}`} />
      </div>

      {/* Pipeline Funnel */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-base font-bold text-gray-900 mb-4">📊 Phễu bán hàng (Pipeline)</h2>
        <div className="space-y-2">
          {pipeline.map((s, i) => {
            const maxCount = Math.max(...pipeline.map(p => p.count), 1);
            const pct = (s.count / maxCount) * 100;
            return (
              <div key={s.id} className="flex items-center gap-3">
                <span className="w-28 text-xs font-medium text-gray-700 shrink-0">{s.icon} {s.name}</span>
                <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden relative">
                  <div className="h-full rounded-lg transition-all flex items-center px-3" style={{ width: `${Math.max(pct, s.count > 0 ? 8 : 0)}%`, backgroundColor: s.color }}>
                    {s.count > 0 && <span className="text-xs font-bold text-white">{s.count}</span>}
                  </div>
                </div>
                <span className="text-xs text-gray-500 w-24 text-right shrink-0">{formatVND(s.value)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source Performance */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-base font-bold text-gray-900 mb-4">📌 Hiệu quả theo nguồn Lead</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-xs text-gray-500 uppercase"><th className="py-2 text-left">Nguồn</th><th className="py-2 text-right">Leads</th><th className="py-2 text-right">Chốt</th><th className="py-2 text-right">Tỷ lệ</th><th className="py-2 text-right">Giá trị</th></tr></thead>
            <tbody>
              {Object.entries(sourceStats).sort((a, b) => b[1].count - a[1].count).map(([name, s]) => (
                <tr key={name} className="border-b">
                  <td className="py-2 font-medium">{s.icon} {name}</td>
                  <td className="py-2 text-right">{s.count}</td>
                  <td className="py-2 text-right text-emerald-600 font-medium">{s.won}</td>
                  <td className="py-2 text-right">{s.count > 0 ? Math.round(s.won / s.count * 100) : 0}%</td>
                  <td className="py-2 text-right text-xs">{formatVND(s.value)}</td>
                </tr>
              ))}
              {Object.keys(sourceStats).length === 0 && <tr><td colSpan={5} className="text-center text-gray-400 py-4">Chưa có dữ liệu</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Sales Performance */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-base font-bold text-gray-900 mb-4">👤 Hiệu suất nhân viên</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-xs text-gray-500 uppercase"><th className="py-2 text-left">Nhân viên</th><th className="py-2 text-right">Leads</th><th className="py-2 text-right">Chốt</th><th className="py-2 text-right">Tỷ lệ</th><th className="py-2 text-right">Giá trị</th></tr></thead>
            <tbody>
              {Object.entries(assigneeStats).sort((a, b) => b[1].value - a[1].value).map(([name, s]) => (
                <tr key={name} className="border-b">
                  <td className="py-2 font-medium">{name}</td>
                  <td className="py-2 text-right">{s.count}</td>
                  <td className="py-2 text-right text-emerald-600 font-medium">{s.won}</td>
                  <td className="py-2 text-right">{s.count > 0 ? Math.round(s.won / s.count * 100) : 0}%</td>
                  <td className="py-2 text-right text-xs">{formatVND(s.value)}</td>
                </tr>
              ))}
              {Object.keys(assigneeStats).length === 0 && <tr><td colSpan={5} className="text-center text-gray-400 py-4">Chưa có dữ liệu</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Quotation Stats */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-base font-bold text-gray-900 mb-4">📄 Thống kê báo giá</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xl font-bold">{quoteStats.draft}</p><p className="text-[10px] text-gray-500">Nháp</p></div>
            <div className="bg-blue-50 rounded-lg p-3 text-center"><p className="text-xl font-bold text-blue-700">{quoteStats.sent}</p><p className="text-[10px] text-blue-600">Đã gửi</p></div>
            <div className="bg-emerald-50 rounded-lg p-3 text-center"><p className="text-xl font-bold text-emerald-700">{quoteStats.accepted}</p><p className="text-[10px] text-emerald-600">Chấp nhận</p></div>
            <div className="bg-purple-50 rounded-lg p-3 text-center"><p className="text-xl font-bold text-purple-700">{quoteStats.converted}</p><p className="text-[10px] text-purple-600">→ ĐH</p></div>
            <div className="bg-red-50 rounded-lg p-3 text-center"><p className="text-xl font-bold text-red-700">{quoteStats.rejected}</p><p className="text-[10px] text-red-600">Từ chối</p></div>
            <div className="bg-amber-50 rounded-lg p-3 text-center"><p className="text-xl font-bold text-amber-700">{quotes.length > 0 ? Math.round(quoteStats.accepted / quotes.length * 100) : 0}%</p><p className="text-[10px] text-amber-600">Tỷ lệ</p></div>
          </div>
        </div>

        {/* Revenue */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-base font-bold text-gray-900 mb-4">💰 Doanh thu & Công nợ</h2>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-1"><span className="text-sm text-gray-500">Tổng hóa đơn</span><span className="text-sm font-bold">{formatVND(invTotal)}</span></div>
              <div className="flex justify-between mb-1"><span className="text-sm text-gray-500">Đã thu</span><span className="text-sm font-bold text-emerald-600">{formatVND(invPaid)}</span></div>
              <div className="flex justify-between mb-2"><span className="text-sm text-gray-500 font-medium">Còn nợ</span><span className="text-sm font-bold text-red-600">{formatVND(invTotal - invPaid)}</span></div>
              <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${invTotal > 0 ? (invPaid / invTotal * 100) : 0}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-1 text-right">{invTotal > 0 ? Math.round(invPaid / invTotal * 100) : 0}% đã thu</p>
            </div>
            <div className="border-t pt-3">
              <div className="flex justify-between"><span className="text-xs text-gray-500">Số HĐ chưa TT</span><span className="text-xs font-bold text-red-600">{invoices.filter(i => i.payment_status !== 'paid').length}</span></div>
              <div className="flex justify-between mt-1"><span className="text-xs text-gray-500">Số HĐ đã TT đủ</span><span className="text-xs font-bold text-emerald-600">{invoices.filter(i => i.payment_status === 'paid').length}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, color, label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between mb-2">
        <div className={`w-9 h-9 rounded-lg bg-${color}-50 flex items-center justify-center`}><Icon className={`h-4 w-4 text-${color}-600`} /></div>
        <span className="text-[10px] text-gray-500 font-semibold uppercase">{label}</span>
      </div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{sub}</p>
    </div>
  );
}
