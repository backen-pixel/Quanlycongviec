import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { formatVND, formatDate } from '../lib/utils';
import {
  Users, Search, Phone, Mail, Building2, Target,
  ShoppingCart, Receipt, ChevronDown, ChevronUp, Plus,
} from 'lucide-react';

const LS_CRM_CUSTOMERS_COMPANY = 'crm_customers_filter_company_id';
const LS_CRM_CUSTOMERS_SEARCH = 'crm_customers_search_v1';

export default function CRMCustomersPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const userCompanyId = user?.company_id ? String(user.company_id) : '';

  const [customers, setCustomers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [filterCompanyId, setFilterCompanyId] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      return localStorage.getItem(LS_CRM_CUSTOMERS_COMPANY) || '';
    } catch {
      return '';
    }
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      return localStorage.getItem(LS_CRM_CUSTOMERS_SEARCH) || '';
    } catch {
      return '';
    }
  });
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAdmin) return;
    api.get('/companies', { params: { for_module: 'crm' } }).then((r) => {
      const list = r.data?.companies || r.data || [];
      setCompanies(Array.isArray(list) ? list : []);
    }).catch(() => setCompanies([]));
  }, [isAdmin]);

  const listParams = isAdmin && filterCompanyId ? { company_id: filterCompanyId } : {};

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = isAdmin && filterCompanyId ? { company_id: filterCompanyId } : {};
      const { data } = await api.get('/crm/customers-overview', { params });
      setCustomers(data || []);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, filterCompanyId]);

  useEffect(() => {
    void load();
  }, [load, userCompanyId]);

  useEffect(() => {
    if (!isAdmin) return;
    try {
      if (filterCompanyId) localStorage.setItem(LS_CRM_CUSTOMERS_COMPANY, filterCompanyId);
      else localStorage.removeItem(LS_CRM_CUSTOMERS_COMPANY);
    } catch {
      /* ignore */
    }
  }, [isAdmin, filterCompanyId]);

  useEffect(() => {
    try {
      const q = (search || '').trim();
      if (q) localStorage.setItem(LS_CRM_CUSTOMERS_SEARCH, q);
      else localStorage.removeItem(LS_CRM_CUSTOMERS_SEARCH);
    } catch {
      /* ignore */
    }
  }, [search]);

  const loadDetail = async (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    const { data } = await api.get(`/crm/customers-overview/${id}`, { params: listParams });
    setDetail(data);
    setExpandedId(id);
  };

  const filtered = customers.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.full_name || '').toLowerCase().includes(s) || (c.phone || '').includes(s) || (c.email || '').toLowerCase().includes(s) || (c.company || '').toLowerCase().includes(s);
  });

  // Sort by total value desc
  const sorted = [...filtered].sort((a, b) => (b.stats.total_orders + b.stats.lead_value) - (a.stats.total_orders + a.stats.lead_value));

  const leadDealCounts = useMemo(() => {
    let leads = 0;
    let deals = 0;
    (customers || []).forEach((c) => {
      (c.leads || []).forEach((l) => {
        if (l.type === 'deal') deals += 1;
        else leads += 1;
      });
    });
    return { leads, deals };
  }, [customers]);

  // Summary
  const totalCustomers = customers.length;
  const activeCustomers = customers.filter(c => c.stats.lead_count > 0 || c.stats.order_count > 0).length;
  const totalRevenue = customers.reduce((s, c) => s + c.stats.total_paid, 0);
  const totalDebt = customers.reduce((s, c) => s + c.stats.total_debt, 0);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-600" /> Khách hàng CRM
          </h1>
          <p className="text-sm text-gray-500 mt-1">{totalCustomers} khách hàng</p>
          {!isAdmin && userCompanyId && (
            <p className="text-xs text-blue-700 mt-1 flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              Chỉ dữ liệu công ty của bạn
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-500 shrink-0" />
              <select
                value={filterCompanyId}
                onChange={(e) => setFilterCompanyId(e.target.value)}
                className="h-9 min-w-[200px] px-3 bg-white border border-gray-200 rounded-lg text-sm"
              >
                <option value="">Tất cả công ty</option>
                {companies.map((co) => (
                  <option key={co.id} value={co.id}>{co.short_name || co.name}</option>
                ))}
              </select>
            </div>
          )}
          <button onClick={() => navigate('/crm/customers/new')} className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer">
            <Plus className="h-4 w-4" /> Thêm KH
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500 uppercase font-medium">Tổng KH</p><p className="text-2xl font-bold text-gray-900">{totalCustomers}</p><p className="text-xs text-blue-600">{activeCustomers} đang giao dịch</p></div>
        <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500 uppercase font-medium">Doanh thu</p><p className="text-2xl font-bold text-emerald-600">{formatVND(totalRevenue)}</p><p className="text-xs text-gray-400">Đã thu</p></div>
        <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500 uppercase font-medium">Công nợ</p><p className="text-2xl font-bold text-red-600">{formatVND(totalDebt)}</p><p className="text-xs text-gray-400">Còn nợ</p></div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500 uppercase font-medium">Lead / Deal</p>
          <p className="text-2xl font-bold text-blue-600">{leadDealCounts.leads + leadDealCounts.deals}</p>
          <p className="text-xs text-gray-400">{leadDealCounts.leads} lead · {leadDealCounts.deals} deal · {customers.reduce((s, c) => s + c.stats.won_count, 0)} đã chốt</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tên, SĐT, email, công ty..." className="w-full h-10 pl-10 pr-4 border rounded-lg text-sm" />
      </div>

      {/* Customer List */}
      <div className="space-y-3">
        {sorted.map(c => (
          <div key={c.id} className="bg-white rounded-xl border overflow-hidden">
            <div onClick={() => loadDetail(c.id)} className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                {(c.full_name || '?')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-gray-900 truncate">{c.full_name}</h3>
                  {c.company && <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><Building2 className="h-3 w-3" />{c.company}</span>}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                  {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                  {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                </div>
              </div>
              {/* Mini stats */}
              <div className="hidden md:flex items-center gap-4 shrink-0">
                {c.stats.lead_count > 0 && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full font-medium"><Target className="h-3 w-3 inline mr-0.5" />{c.stats.lead_count} lead</span>}
                {c.stats.order_count > 0 && <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full font-medium"><ShoppingCart className="h-3 w-3 inline mr-0.5" />{c.stats.order_count} ĐH</span>}
                {c.stats.total_debt > 0 && <span className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded-full font-medium">Nợ {formatVND(c.stats.total_debt)}</span>}
                {c.stats.total_orders > 0 && <span className="text-sm font-bold text-gray-900">{formatVND(c.stats.total_orders)}</span>}
              </div>
              {expandedId === c.id ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
            </div>

            {/* Expanded Detail */}
            {expandedId === c.id && detail && (
              <div className="border-t p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-bold text-gray-900">Lịch sử giao dịch</h4>
                  <button onClick={() => navigate(`/crm?new_lead=1&customer_id=${c.id}`)} className="h-7 px-3 bg-blue-600 text-white rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer"><Plus className="h-3 w-3" /> Tạo Lead</button>
                </div>
                {/* Timeline */}
                <div className="relative">
                  <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-200" />
                  <div className="space-y-2">
                    {buildTimeline(detail).map((item, i) => (
                      <div key={i} className="relative pl-8">
                        <div className={`absolute left-1.5 top-1 w-3 h-3 rounded-full border-2 border-white ${item.color}`} />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold" style={{ color: item.textColor }}>{item.icon} {item.type}</span>
                            <span className="text-xs text-gray-700 font-medium">{item.code}</span>
                            <span className="text-xs text-gray-500">— {item.title}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {item.amount > 0 && <span className="text-xs font-bold text-gray-900">{formatVND(item.amount)}</span>}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${item.statusColor}`}>{item.statusText}</span>
                            <span className="text-[10px] text-gray-400">{formatDate(item.date)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {buildTimeline(detail).length === 0 && <p className="pl-8 text-xs text-gray-400">Chưa có giao dịch nào</p>}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        {sorted.length === 0 && <div className="text-center py-12 text-gray-400">Không tìm thấy khách hàng</div>}
      </div>
    </div>
  );
}

function buildTimeline(detail) {
  const items = [];
  (detail.leads || []).forEach(l => items.push({
    type: 'Lead', icon: '🎯', code: l.code, title: l.title, amount: l.estimated_value || 0,
    date: l.created_at, color: 'bg-blue-500', textColor: '#2563eb',
    statusText: l.stage?.name || '—', statusColor: l.stage?.is_won ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700',
  }));
  (detail.quotes || []).forEach(q => items.push({
    type: 'Báo giá', icon: '📄', code: q.code, title: q.title || '', amount: q.total || 0,
    date: q.created_at, color: 'bg-amber-500', textColor: '#d97706',
    statusText: { draft: 'Nháp', sent: 'Đã gửi', accepted: 'Chấp nhận', rejected: 'Từ chối', converted: '→ĐH' }[q.status] || q.status,
    statusColor: q.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' : q.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700',
  }));
  (detail.orders || []).forEach(o => items.push({
    type: 'Đơn hàng', icon: '🛒', code: o.code, title: o.title || '', amount: o.total || 0,
    date: o.created_at, color: 'bg-emerald-500', textColor: '#059669',
    statusText: { draft: 'Nháp', confirmed: 'Xác nhận', processing: 'SX', shipped: 'Giao', delivered: 'Đã giao', cancelled: 'Hủy' }[o.status] || o.status,
    statusColor: o.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' : o.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700',
  }));
  (detail.invoices || []).forEach(i => items.push({
    type: 'Hóa đơn', icon: '🧾', code: i.code, title: i.title || '', amount: i.total || 0,
    date: i.created_at, color: 'bg-purple-500', textColor: '#7c3aed',
    statusText: i.payment_status === 'paid' ? 'Đã TT' : i.payment_status === 'partial' ? 'TT 1 phần' : 'Chưa TT',
    statusColor: i.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-700' : i.payment_status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700',
  }));
  return items.sort((a, b) => new Date(b.date) - new Date(a.date));
}
