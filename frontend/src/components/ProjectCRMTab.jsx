import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import { Target, FileText, ShoppingCart, Receipt, DollarSign, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function ProjectCRMTab({ projectId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [projectId]);
  const load = async () => {
    try { const { data: d } = await api.get(`/crm/project/${projectId}/summary`); setData(d); }
    catch (e) { console.error(e); }
    setLoading(false);
  };

  if (loading) return <div className="flex items-center justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  if (!data) return <div className="text-center py-12 text-gray-400">Không có dữ liệu CRM</div>;

  const autoCreateInvoice = async () => {
    if (!confirm('Tự động tạo hóa đơn từ tất cả đơn hàng chưa xuất HĐ?')) return;
    try {
      const { data: result } = await api.post(`/crm/project/${projectId}/auto-invoice`);
      alert(`✅ Đã tạo ${result.created} hóa đơn tự động!`);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const { leads, quotes, orders, invoices, stats } = data;
  const hasData = leads.length || quotes.length || orders.length || invoices.length;

  if (!hasData) return (
    <div className="text-center py-12">
      <Target className="h-12 w-12 text-gray-200 mx-auto mb-3" />
      <p className="text-sm text-gray-400">Dự án này chưa liên kết với CRM</p>
      <p className="text-xs text-gray-300 mt-1">Tạo Lead hoặc Đơn hàng từ CRM để liên kết</p>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Financial KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-emerald-50 rounded-xl p-4">
          <p className="text-[10px] text-emerald-600 uppercase font-medium flex items-center gap-1"><ShoppingCart className="h-3 w-3" />Tổng ĐH</p>
          <p className="text-lg font-bold text-emerald-700">{formatVND(stats.totalOrders)}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4">
          <p className="text-[10px] text-purple-600 uppercase font-medium flex items-center gap-1"><Receipt className="h-3 w-3" />Đã xuất HĐ</p>
          <p className="text-lg font-bold text-purple-700">{formatVND(stats.totalInvoiced)}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4">
          <p className="text-[10px] text-blue-600 uppercase font-medium flex items-center gap-1"><DollarSign className="h-3 w-3" />Đã thu</p>
          <p className="text-lg font-bold text-blue-700">{formatVND(stats.totalPaid)}</p>
        </div>
        <div className={`rounded-xl p-4 ${stats.totalDebt > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
          <p className={`text-[10px] uppercase font-medium flex items-center gap-1 ${stats.totalDebt > 0 ? 'text-red-600' : 'text-gray-500'}`}>
            {stats.totalDebt > 0 ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}Công nợ
          </p>
          <p className={`text-lg font-bold ${stats.totalDebt > 0 ? 'text-red-700' : 'text-gray-400'}`}>{formatVND(stats.totalDebt)}</p>
        </div>
      </div>

      {/* Payment Progress */}
      {stats.totalOrders > 0 && (
        <div className="bg-white rounded-xl border p-4">
          <div className="flex justify-between mb-2">
            <span className="text-xs text-gray-500">Tiến độ thanh toán</span>
            <span className="text-xs font-bold">{stats.totalOrders > 0 ? Math.round(stats.totalPaid / stats.totalOrders * 100) : 0}%</span>
          </div>
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${stats.totalOrders > 0 ? Math.min(stats.totalPaid / stats.totalOrders * 100, 100) : 0}%` }} />
          </div>
          {stats.needsInvoice && (
            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Chưa xuất hết hóa đơn ({formatVND(stats.totalOrders - stats.totalInvoiced)} chưa xuất)</p>
          )}
        </div>
      )}

      {/* Auto Invoice Button */}
      {stats.needsInvoice && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-amber-800">⚡ Chưa xuất hết hóa đơn</p>
            <p className="text-xs text-amber-600">{formatVND(stats.totalOrders - stats.totalInvoiced)} chưa xuất HĐ</p>
          </div>
          <button onClick={autoCreateInvoice} className="h-8 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium cursor-pointer">Tự động xuất HĐ</button>
        </div>
      )}

      {/* Leads */}
      {leads.length > 0 && (
        <Section title="🎯 Lead / Cơ hội" count={leads.length}>
          {leads.map(l => (
            <Link key={l.id} to={`/crm/leads/${l.id}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
              <div><span className="text-xs text-blue-600 font-bold mr-2">{l.code}</span><span className="text-sm text-gray-900">{l.title}</span></div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-green-600">{formatVND(l.estimated_value)}</span>
                {l.stage && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100">{l.stage.icon} {l.stage.name}</span>}
              </div>
            </Link>
          ))}
        </Section>
      )}

      {/* Quotations */}
      {quotes.length > 0 && (
        <Section title="📄 Báo giá" count={quotes.length}>
          {quotes.map(q => (
            <Link key={q.id} to={`/crm/quotations/${q.id}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
              <div><span className="text-xs text-blue-600 font-bold mr-2">{q.code}</span><span className="text-sm text-gray-900">{q.title}</span></div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold">{formatVND(q.total)}</span>
                <StatusBadge status={q.status} map={{ draft: 'Nháp', sent: 'Đã gửi', accepted: '✅', rejected: '❌', converted: '→ĐH' }} colors={{ accepted: 'bg-emerald-100 text-emerald-700', rejected: 'bg-red-100 text-red-700' }} />
              </div>
            </Link>
          ))}
        </Section>
      )}

      {/* Orders */}
      {orders.length > 0 && (
        <Section title="🛒 Đơn hàng" count={orders.length}>
          {orders.map(o => (
            <Link key={o.id} to={`/crm/orders/${o.id}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
              <div><span className="text-xs text-emerald-600 font-bold mr-2">{o.code}</span><span className="text-sm text-gray-900">{o.title}</span></div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold">{formatVND(o.total)}</span>
                <StatusBadge status={o.status} map={{ draft: 'Nháp', confirmed: 'XN', processing: 'SX', shipped: 'Giao', delivered: '✅', cancelled: '❌' }} colors={{ delivered: 'bg-emerald-100 text-emerald-700', cancelled: 'bg-red-100 text-red-700' }} />
              </div>
            </Link>
          ))}
        </Section>
      )}

      {/* Invoices */}
      {invoices.length > 0 && (
        <Section title="🧾 Hóa đơn" count={invoices.length}>
          {invoices.map(i => (
            <Link key={i.id} to={`/crm/invoices/${i.id}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
              <div><span className="text-xs text-purple-600 font-bold mr-2">{i.code}</span><span className="text-sm text-gray-900">{i.title}</span></div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold">{formatVND(i.total)}</span>
                <span className="text-xs text-emerald-600 font-medium">{formatVND(i.paid_amount)} thu</span>
                <StatusBadge status={i.payment_status} map={{ unpaid: 'Chưa TT', partial: '1 phần', paid: '✅ Đủ' }} colors={{ paid: 'bg-emerald-100 text-emerald-700', unpaid: 'bg-red-100 text-red-700' }} />
              </div>
            </Link>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, count, children }) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center justify-between">{title}<span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{count}</span></h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function StatusBadge({ status, map, colors = {} }) {
  const label = map[status] || status;
  const color = colors[status] || 'bg-gray-100 text-gray-600';
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${color}`}>{label}</span>;
}
