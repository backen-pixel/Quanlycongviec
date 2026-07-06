import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import {
  ShoppingCart, Search, UserPlus, Mail, Shield, AlertTriangle, ChevronRight, Bell,
} from 'lucide-react';
import { PURCHASE_STATUS_LABELS } from '../../lib/saasModuleDisplay';
import { PAYMENT_STATUS_LABELS, paymentMethodLabel } from '../../lib/saasPayment';

function formatDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleString('vi-VN');
}

function formatPrice(n) {
  return Number(n || 0).toLocaleString('vi-VN');
}

const TONE_CLASS = {
  amber: 'bg-amber-50 text-amber-800',
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-green-50 text-green-700',
  gray: 'bg-gray-100 text-gray-600',
};

export default function PlatformPurchasesPage() {
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState([]);
  const [subscribers, setSubscribers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tab, setTab] = useState('purchases');
  const [provisioning, setProvisioning] = useState(null);

  const load = useCallback(async () => {
    try {
      const params = statusFilter !== 'all' ? { status: statusFilter } : {};
      const [{ data: p }, { data: s }, { data: st }] = await Promise.all([
        api.get('/platform/saas-purchases', { params: { ...params, search: search || undefined } }),
        api.get('/platform/saas-notify'),
        api.get('/platform/saas-store/stats'),
      ]);
      setPurchases(p || []);
      setSubscribers(s || []);
      setStats(st);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  const handleProvision = async (id) => {
    if (!window.confirm('Cấp tài khoản và gửi email đăng nhập cho người mua?')) return;
    setProvisioning(id);
    try {
      const { data } = await api.post(`/platform/saas-purchases/${id}/provision`);
      let msg = data.email_sent
        ? 'Đã cấp tài khoản và gửi email thành công.'
        : 'Đã cấp tài khoản. Email chưa gửi được (chưa cấu hình RESEND_API_KEY).';
      if (data.temp_password) {
        msg += `\n\nMật khẩu tạm (chỉ hiện khi chưa gửi email):\n${data.temp_password}`;
      }
      alert(msg);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cấp tài khoản');
    } finally {
      setProvisioning(null);
    }
  };

  const markPaid = async (id) => {
    try {
      await api.patch(`/platform/saas-purchases/${id}`, { payment_status: 'paid' });
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  const cancelPurchase = async (id) => {
    if (!window.confirm('Huỷ đơn mua này?')) return;
    try {
      await api.patch(`/platform/saas-purchases/${id}`, { status: 'cancelled' });
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  const pendingCount = stats?.pending_purchases || 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-teal-600" />
          Đơn mua & thông báo
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">Theo dõi ai đã mua, cấp tài khoản qua email, quản lý đăng ký nhận tin</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Chờ xử lý', value: stats?.pending_purchases || 0, tone: 'amber' },
          { label: 'Chờ cấp gói', value: stats?.pending_plan_purchases || 0, tone: 'blue' },
          { label: 'Đã cấp TK', value: stats?.provisioned_purchases || 0, tone: 'green' },
          { label: 'Đăng ký TB', value: stats?.notify_subscribers || 0, tone: 'gray' },
        ].map((c) => (
          <div key={c.label} className="bg-white border rounded-xl p-4">
            <div className="text-2xl font-bold text-gray-900">{c.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {pendingCount > 0 && (
        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          {pendingCount} đơn mua chờ cấp tài khoản
        </div>
      )}

      <div className="flex gap-2 border-b">
        {[
          { id: 'purchases', label: 'Đơn mua', icon: ShoppingCart },
          { id: 'notify', label: 'Đăng ký thông báo', icon: Bell },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px cursor-pointer ${
              tab === t.id ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500'
            }`}
          >
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
      </div>

      {tab === 'purchases' && (
        <>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && load()}
                placeholder="Tìm email, tên, công ty..."
                className="w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm"
              />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border rounded-xl px-3 py-2.5 text-sm min-w-[160px]">
              <option value="all">Tất cả trạng thái</option>
              <option value="pending">Chờ xử lý</option>
              <option value="processing">Đang xử lý</option>
              <option value="provisioned">Đã cấp TK</option>
              <option value="cancelled">Đã huỷ</option>
            </select>
          </div>

          <div className="bg-white border rounded-2xl overflow-hidden">
            {loading ? (
              <div className="py-12 text-center text-gray-500">Đang tải...</div>
            ) : purchases.length === 0 ? (
              <div className="py-12 text-center text-gray-400">Chưa có đơn mua</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[960px]">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Người mua</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Gói</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Giá</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Thanh toán</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Trạng thái</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Bảo mật</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Ngày</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {purchases.map((p) => {
                      const st = PURCHASE_STATUS_LABELS[p.status] || PURCHASE_STATUS_LABELS.pending;
                      return (
                        <tr key={p.id} className="hover:bg-gray-50/80">
                          <td className="px-4 py-3">
                            <div className="font-medium">{p.buyer_name || '—'}</div>
                            <div className="text-xs text-gray-500">{p.buyer_email}</div>
                            <div className="text-xs text-gray-400">{p.company_name}</div>
                          </td>
                          <td className="px-4 py-3">
                            {p.purchase_type === 'plan' || p.plan_id ? (
                              <span className="font-medium text-teal-700">Gói: {p.saas_plans?.title || p.plan_id}</span>
                            ) : (
                              <span>{p.saas_modules?.title || p.module_id || '—'}</span>
                            )}
                            {p.purchase_type === 'module' && (
                              <div className="text-[10px] text-gray-400">Modun add-on</div>
                            )}
                          </td>
                          <td className="px-4 py-3">{formatPrice(p.amount)} đ</td>
                          <td className="px-4 py-3 text-xs">
                            <div className="font-medium text-gray-800">{paymentMethodLabel(p.payment_method)}</div>
                            {p.payment_status && (
                              <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${TONE_CLASS[PAYMENT_STATUS_LABELS[p.payment_status]?.tone || 'gray']}`}>
                                {PAYMENT_STATUS_LABELS[p.payment_status]?.label || p.payment_status}
                              </span>
                            )}
                            {p.payment_reference && (
                              <div className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[120px]" title={p.payment_reference}>MK: {p.payment_reference}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${TONE_CLASS[st.tone]}`}>{st.label}</span>
                            {p.email_sent_at && (
                              <div className="text-[10px] text-green-600 mt-0.5 flex items-center gap-0.5">
                                <Mail className="h-3 w-3" />Đã gửi email
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {p.ip_address && (
                              <div className="flex items-center gap-1" title={p.user_agent}>
                                <Shield className="h-3 w-3" />{p.ip_address.slice(0, 20)}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{formatDate(p.created_at)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2 flex-wrap">
                              {p.status === 'pending' && p.payment_status === 'awaiting' && (p.amount || 0) > 0 && (
                                <button type="button" onClick={() => markPaid(p.id)} className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer whitespace-nowrap">
                                  Xác nhận TT
                                </button>
                              )}
                              {p.status === 'pending' && (
                                <button
                                  type="button"
                                  onClick={() => handleProvision(p.id)}
                                  disabled={provisioning === p.id}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-teal-600 text-white text-xs rounded-lg cursor-pointer disabled:opacity-50"
                                >
                                  <UserPlus className="h-3 w-3" />
                                  {provisioning === p.id ? '...' : 'Cấp TK + Email'}
                                </button>
                              )}
                              {p.tenant_id && (
                                <button type="button" onClick={() => navigate(`/platform/tenants/${p.tenant_id}`)} className="text-xs text-teal-600 cursor-pointer">
                                  HST<ChevronRight className="h-3 w-3 inline" />
                                </button>
                              )}
                              {p.status === 'pending' && (
                                <button type="button" onClick={() => cancelPurchase(p.id)} className="text-xs text-red-500 cursor-pointer">Huỷ</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'notify' && (
        <div className="bg-white border rounded-2xl overflow-hidden">
          {loading ? (
            <div className="py-12 text-center text-gray-500">Đang tải...</div>
          ) : subscribers.length === 0 ? (
            <div className="py-12 text-center text-gray-400">Chưa có đăng ký</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Modun quan tâm</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Nguồn</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Ngày</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {subscribers.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-3 font-medium">{s.email}</td>
                      <td className="px-4 py-3 text-gray-600">{s.saas_modules?.title || 'Tất cả modun'}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{s.source}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDate(s.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
