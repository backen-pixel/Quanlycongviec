import { useState, useEffect, useMemo } from 'react';
import api from '../lib/api';
import { formatVND } from '../lib/utils';
import {
  BarChart3, TrendingUp, Target, FileText, ShoppingCart, Receipt,
  RefreshCw, Trophy, Users, ArrowUpRight, CheckCircle2, Clock,
  AlertCircle, Sparkles, Award, Filter,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from 'recharts';

const QUOTE_PALETTE = {
  draft: { bg: 'from-slate-100 to-slate-50', border: 'border-slate-300', text: 'text-slate-700', dot: '#64748b', label: 'Nháp', icon: FileText },
  sent: { bg: 'from-blue-100 to-blue-50', border: 'border-blue-300', text: 'text-blue-700', dot: '#3b82f6', label: 'Đã gửi', icon: ArrowUpRight },
  accepted: { bg: 'from-emerald-100 to-emerald-50', border: 'border-emerald-300', text: 'text-emerald-700', dot: '#10b981', label: 'Chấp nhận', icon: CheckCircle2 },
  converted: { bg: 'from-purple-100 to-purple-50', border: 'border-purple-300', text: 'text-purple-700', dot: '#8b5cf6', label: '→ Đơn hàng', icon: ShoppingCart },
  rejected: { bg: 'from-red-100 to-red-50', border: 'border-red-300', text: 'text-red-700', dot: '#ef4444', label: 'Từ chối', icon: AlertCircle },
};

export default function CRMReports() {
  const [data, setData] = useState(null);
  const [leads, setLeads] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    try {
      const [d, l, q, o, i] = await Promise.all([
        api.get('/crm/dashboard'),
        api.get('/crm/leads'),
        api.get('/crm/quotations'),
        api.get('/crm/orders'),
        api.get('/crm/invoices'),
      ]);
      setData(d.data);
      const leadPayload = l.data;
      setLeads(Array.isArray(leadPayload) ? leadPayload : (leadPayload?.data ?? []));
      setQuotes(q.data || []);
      setOrders(o.data || []);
      setInvoices(i.data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const kpis = data?.kpis || {};
  const pipeline = data?.pipeline || [];

  const sourceStats = useMemo(() => {
    const m = {};
    leads.forEach((l) => {
      const name = l.source?.name || 'Khác';
      if (!m[name]) m[name] = { icon: l.source?.icon || '📋', count: 0, value: 0, won: 0 };
      m[name].count++;
      m[name].value += l.estimated_value || 0;
      if (l.stage?.is_won) m[name].won++;
    });
    return m;
  }, [leads]);

  const assigneeStats = useMemo(() => {
    const m = {};
    leads.forEach((l) => {
      const name = l.assignee?.full_name || 'Chưa gán';
      if (!m[name]) m[name] = { count: 0, value: 0, won: 0 };
      m[name].count++;
      m[name].value += l.estimated_value || 0;
      if (l.stage?.is_won) m[name].won++;
    });
    return m;
  }, [leads]);

  const quoteStats = useMemo(() => {
    const s = { total: quotes.length, draft: 0, sent: 0, accepted: 0, converted: 0, rejected: 0, total_value: 0 };
    quotes.forEach((q) => {
      s[q.status] = (s[q.status] || 0) + 1;
      s.total_value += q.total || 0;
    });
    return s;
  }, [quotes]);

  const invTotal = useMemo(() => invoices.reduce((s, i) => s + (i.total || 0), 0), [invoices]);
  const invPaid = useMemo(() => invoices.reduce((s, i) => s + (i.paid_amount || 0), 0), [invoices]);
  const invDebt = invTotal - invPaid;
  const invPct = invTotal > 0 ? Math.round((invPaid / invTotal) * 100) : 0;
  const ordersTotal = useMemo(() => orders.reduce((s, o) => s + (o.total || 0), 0), [orders]);

  const quoteChartData = useMemo(() => (
    Object.entries(QUOTE_PALETTE)
      .map(([key, meta]) => ({ key, name: meta.label, value: quoteStats[key] || 0, color: meta.dot }))
      .filter((x) => x.value > 0)
  ), [quoteStats]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full" />
        <p className="text-sm" style={{ color: '#000000' }}>Đang tải dữ liệu báo cáo...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HERO HEADER */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 p-6 md:p-8 shadow-xl">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 right-0 w-72 h-72 bg-blue-500 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
          <div className="absolute bottom-0 left-0 w-72 h-72 bg-purple-500 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />
        </div>
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg">
              <BarChart3 className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Báo cáo CRM</h1>
              <p className="text-sm text-blue-100 mt-1 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5" />
                Tổng quan hiệu suất bán hàng theo thời gian thực
              </p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white/15 backdrop-blur-md border border-white/30 text-white text-sm font-medium hover:bg-white/25 disabled:opacity-50 transition-all shadow-md"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Đang làm mới...' : 'Làm mới'}
          </button>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          icon={Target}
          label="Tổng Lead"
          value={kpis.total_leads ?? 0}
          sub={`${kpis.won_leads ?? 0} đã chốt`}
          gradient="from-blue-100 via-sky-50 to-white"
          border="border-blue-300"
          iconBg="bg-blue-200"
          iconColor="text-blue-700"
          accent="bg-blue-500"
        />
        <KpiCard
          icon={TrendingUp}
          label="Tỷ lệ chốt"
          value={`${kpis.conversion_rate ?? 0}%`}
          sub="Lead → Deal"
          gradient="from-emerald-100 via-green-50 to-white"
          border="border-emerald-300"
          iconBg="bg-emerald-200"
          iconColor="text-emerald-700"
          accent="bg-emerald-500"
        />
        <KpiCard
          icon={FileText}
          label="Báo giá"
          value={quoteStats.total}
          sub={formatVND(quoteStats.total_value)}
          gradient="from-amber-100 via-yellow-50 to-white"
          border="border-amber-300"
          iconBg="bg-amber-200"
          iconColor="text-amber-700"
          accent="bg-amber-500"
        />
        <KpiCard
          icon={ShoppingCart}
          label="Đơn hàng"
          value={orders.length}
          sub={formatVND(ordersTotal)}
          gradient="from-indigo-100 via-blue-50 to-white"
          border="border-indigo-300"
          iconBg="bg-indigo-200"
          iconColor="text-indigo-700"
          accent="bg-indigo-500"
        />
        <KpiCard
          icon={Receipt}
          label="Thu tiền"
          value={formatVND(invPaid)}
          sub={`/ ${formatVND(invTotal)}`}
          gradient="from-purple-100 via-violet-50 to-white"
          border="border-purple-300"
          iconBg="bg-purple-200"
          iconColor="text-purple-700"
          accent="bg-purple-500"
        />
      </div>

      {/* PIPELINE FUNNEL */}
      <SectionCard
        icon={Filter}
        title="Phễu bán hàng"
        subtitle="Pipeline — số lead theo từng giai đoạn"
        accentColor="from-blue-500 to-cyan-500"
      >
        <div className="space-y-3 mt-2">
          {pipeline.length === 0 && (
            <p className="text-center text-sm py-6" style={{ color: '#000000' }}>Chưa có dữ liệu pipeline</p>
          )}
          {pipeline.map((s) => {
            const maxCount = Math.max(...pipeline.map((p) => p.count), 1);
            const pct = (s.count / maxCount) * 100;
            return (
              <div key={s.id} className="flex items-center gap-3 group">
                <span className="w-36 text-sm font-semibold truncate shrink-0 flex items-center gap-1.5" style={{ color: '#000000' }}>
                  <span className="text-base">{s.icon}</span>
                  {s.name}
                </span>
                <div className="flex-1 h-10 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl overflow-hidden relative shadow-inner">
                  <div
                    className="h-full rounded-xl transition-all duration-500 flex items-center px-4 shadow-md group-hover:shadow-lg"
                    style={{
                      width: `${Math.max(pct, s.count > 0 ? 10 : 0)}%`,
                      background: `linear-gradient(135deg, ${s.color}, ${s.color}cc)`,
                    }}
                  >
                    {s.count > 0 && (
                      <span className="text-sm font-bold text-white drop-shadow">{s.count}</span>
                    )}
                  </div>
                </div>
                <span className="text-sm font-bold w-32 text-right shrink-0 tabular-nums" style={{ color: '#000000' }}>
                  {formatVND(s.value)}
                </span>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* SOURCE + ASSIGNEE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          icon={Trophy}
          title="Hiệu quả theo nguồn Lead"
          subtitle="Xếp hạng theo số lead"
          accentColor="from-amber-500 to-orange-500"
        >
          <RankingTable rows={sourceStats} showIcon />
        </SectionCard>

        <SectionCard
          icon={Users}
          title="Hiệu suất nhân viên"
          subtitle="Xếp hạng theo giá trị deal"
          accentColor="from-violet-500 to-purple-500"
          sort="value"
        >
          <RankingTable rows={assigneeStats} sort="value" />
        </SectionCard>
      </div>

      {/* QUOTATION + REVENUE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          icon={FileText}
          title="Thống kê báo giá"
          subtitle={`${quoteStats.total} báo giá — ${formatVND(quoteStats.total_value)}`}
          accentColor="from-amber-500 to-pink-500"
        >
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center mt-2">
            <div className="md:col-span-2 h-44">
              {quoteChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={quoteChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {quoteChartData.map((entry) => (
                        <Cell key={entry.key} fill={entry.color} stroke="#fff" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                      formatter={(v, n) => [`${v} báo giá`, n]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-sm" style={{ color: '#000000' }}>
                  Chưa có dữ liệu
                </div>
              )}
            </div>
            <div className="md:col-span-3 grid grid-cols-2 gap-2.5">
              {Object.entries(QUOTE_PALETTE).map(([key, meta]) => {
                const Icon = meta.icon;
                const count = quoteStats[key] || 0;
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-gradient-to-br ${meta.bg} border ${meta.border} shadow-sm`}
                  >
                    <div className="h-8 w-8 rounded-lg bg-white/70 flex items-center justify-center shrink-0">
                      <Icon className={`h-4 w-4 ${meta.text}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-extrabold leading-none" style={{ color: '#000000' }}>{count}</p>
                      <p className="text-[11px] font-semibold uppercase tracking-wide mt-0.5" style={{ color: '#000000' }}>{meta.label}</p>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-gradient-to-br from-amber-100 to-yellow-50 border border-amber-300 shadow-sm">
                <div className="h-8 w-8 rounded-lg bg-white/70 flex items-center justify-center shrink-0">
                  <Award className="h-4 w-4 text-amber-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-extrabold leading-none" style={{ color: '#000000' }}>
                    {quotes.length > 0 ? Math.round((quoteStats.accepted / quotes.length) * 100) : 0}%
                  </p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide mt-0.5" style={{ color: '#000000' }}>Tỷ lệ chấp nhận</p>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          icon={Receipt}
          title="Doanh thu & Công nợ"
          subtitle="Tình hình thu tiền từ hóa đơn"
          accentColor="from-emerald-500 to-teal-500"
        >
          <div className="mt-2 grid grid-cols-1 md:grid-cols-[160px_1fr] gap-5 items-center">
            <CircularProgress percentage={invPct} />
            <div className="space-y-2.5">
              <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-sm font-medium" style={{ color: '#000000' }}>Tổng hóa đơn</span>
                <span className="text-sm font-bold tabular-nums" style={{ color: '#000000' }}>{formatVND(invTotal)}</span>
              </div>
              <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <span className="text-sm font-medium flex items-center gap-1.5" style={{ color: '#000000' }}>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Đã thu
                </span>
                <span className="text-sm font-bold tabular-nums" style={{ color: '#000000' }}>{formatVND(invPaid)}</span>
              </div>
              <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-red-50 border border-red-200">
                <span className="text-sm font-medium flex items-center gap-1.5" style={{ color: '#000000' }}>
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  Còn nợ
                </span>
                <span className="text-sm font-bold tabular-nums" style={{ color: '#000000' }}>{formatVND(invDebt)}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-red-200 bg-gradient-to-br from-red-50 to-rose-50 p-3 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-200 flex items-center justify-center">
                <Clock className="h-5 w-5 text-red-700" />
              </div>
              <div>
                <p className="text-xl font-extrabold" style={{ color: '#000000' }}>
                  {invoices.filter((i) => i.payment_status !== 'paid').length}
                </p>
                <p className="text-xs font-semibold" style={{ color: '#000000' }}>HĐ chưa thanh toán</p>
              </div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50 p-3 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-200 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-700" />
              </div>
              <div>
                <p className="text-xl font-extrabold" style={{ color: '#000000' }}>
                  {invoices.filter((i) => i.payment_status === 'paid').length}
                </p>
                <p className="text-xs font-semibold" style={{ color: '#000000' }}>HĐ đã thanh toán</p>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, gradient, border, iconBg, iconColor, accent }) {
  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br ${gradient} border ${border} rounded-2xl p-4 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200`}
    >
      <div className={`absolute top-0 left-0 right-0 h-1 ${accent}`} />
      <div className="flex items-start justify-between mb-3">
        <div className={`h-10 w-10 rounded-xl ${iconBg} flex items-center justify-center shadow-sm`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#000000' }}>
          {label}
        </span>
      </div>
      <p className="text-2xl font-extrabold leading-tight tracking-tight truncate" style={{ color: '#000000' }} title={String(value)}>
        {value}
      </p>
      <p className="text-xs font-medium mt-1 truncate" style={{ color: '#000000' }}>{sub}</p>
    </div>
  );
}

function SectionCard({ icon: Icon, title, subtitle, accentColor, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 md:p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 pb-4 mb-2 border-b border-gray-100">
        <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${accentColor} flex items-center justify-center shadow-md shrink-0`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold leading-tight" style={{ color: '#000000' }}>{title}</h2>
          {subtitle && (
            <p className="text-xs mt-0.5 truncate" style={{ color: '#000000' }}>{subtitle}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function RankingTable({ rows, showIcon = false, sort = 'count' }) {
  const entries = Object.entries(rows).sort((a, b) => {
    if (sort === 'value') return b[1].value - a[1].value;
    return b[1].count - a[1].count;
  });

  if (entries.length === 0) {
    return <p className="text-center text-sm py-6" style={{ color: '#000000' }}>Chưa có dữ liệu</p>;
  }

  const RANK_BADGE = ['bg-amber-400', 'bg-slate-300', 'bg-orange-400'];

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#000000' }}>
            <th className="py-2 px-2 text-left w-10">#</th>
            <th className="py-2 px-2 text-left">Tên</th>
            <th className="py-2 px-2 text-right">Leads</th>
            <th className="py-2 px-2 text-right">Chốt</th>
            <th className="py-2 px-2 text-right">Tỷ lệ</th>
            <th className="py-2 px-2 text-right">Giá trị</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([name, s], idx) => {
            const rate = s.count > 0 ? Math.round((s.won / s.count) * 100) : 0;
            return (
              <tr
                key={name}
                className="border-t border-gray-100 hover:bg-slate-50/70 transition-colors"
              >
                <td className="py-2.5 px-2">
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold text-white ${RANK_BADGE[idx] || 'bg-gray-300'}`}
                  >
                    {idx + 1}
                  </span>
                </td>
                <td className="py-2.5 px-2 font-semibold truncate max-w-[180px]" style={{ color: '#000000' }} title={name}>
                  {showIcon && s.icon ? <span className="mr-1">{s.icon}</span> : null}
                  {name}
                </td>
                <td className="py-2.5 px-2 text-right font-semibold tabular-nums" style={{ color: '#000000' }}>{s.count}</td>
                <td className="py-2.5 px-2 text-right font-bold tabular-nums text-emerald-700">{s.won}</td>
                <td className="py-2.5 px-2 text-right">
                  <span
                    className={`inline-flex items-center justify-center min-w-[44px] px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      rate >= 50 ? 'bg-emerald-100 text-emerald-700' : rate >= 20 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {rate}%
                  </span>
                </td>
                <td className="py-2.5 px-2 text-right text-xs font-semibold tabular-nums" style={{ color: '#000000' }}>
                  {formatVND(s.value)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CircularProgress({ percentage }) {
  const radius = 60;
  const stroke = 12;
  const normalized = radius - stroke / 2;
  const circumference = 2 * Math.PI * normalized;
  const offset = circumference - (percentage / 100) * circumference;
  return (
    <div className="relative h-40 w-40 mx-auto">
      <svg height="160" width="160" className="-rotate-90">
        <defs>
          <linearGradient id="progress-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
        <circle
          cx="80"
          cy="80"
          r={normalized}
          stroke="#e5e7eb"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx="80"
          cy="80"
          r={normalized}
          stroke="url(#progress-gradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          fill="none"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-extrabold tabular-nums" style={{ color: '#000000' }}>{percentage}%</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide mt-1" style={{ color: '#000000' }}>Đã thu</span>
      </div>
    </div>
  );
}
