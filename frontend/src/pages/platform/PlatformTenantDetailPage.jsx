import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { Globe, Users, Building2, BarChart3, Puzzle, Save, CreditCard, ChevronLeft, Network } from 'lucide-react';
import {
  TIER_LABELS, FEATURE_LABELS, formatSubscriptionDate,
  subscriptionStatus, toDateInputValue,
} from '../../lib/platformConstants';
import TenantEcosystemDiagram from '../../components/platform/TenantEcosystemDiagram';

export default function PlatformTenantDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState(null);
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('overview');

  const load = useCallback(async () => {
    try {
      const [tRes, uRes, cRes, sRes] = await Promise.all([
        api.get(`/platform/tenants/${id}`),
        api.get(`/platform/tenants/${id}/users`),
        api.get(`/platform/tenants/${id}/companies`),
        api.get(`/platform/tenants/${id}/stats`).catch(() => ({ data: null })),
      ]);
      const t = tRes.data;
      setTenant(t);
      setForm({
        name: t.name,
        slug: t.slug,
        tier: t.tier,
        max_users: t.max_users,
        max_companies: t.max_companies,
        domain: t.domain || '',
        subscription_start: toDateInputValue(t.subscription_start),
        subscription_end: toDateInputValue(t.subscription_end),
      });
      setUsers(uRes.data);
      setCompanies(cRes.data);
      setStats(sRes.data || {
        total_users: uRes.data?.length || 0,
        active_users: (uRes.data || []).filter((u) => u.is_active).length,
        companies: cRes.data?.length || 0,
        deals: 0,
        projects: 0,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/platform/tenants/${id}`, {
        ...form,
        subscription_start: form.subscription_start || null,
        subscription_end: form.subscription_end || null,
      });
      setEditing(false);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu');
    } finally {
      setSaving(false);
    }
  };

  const toggleFeature = async (featureKey, enabled) => {
    try {
      await api.post(`/platform/tenants/${id}/features`, { feature_key: featureKey, enabled });
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  const toggleActive = async () => {
    if (!confirm(tenant.is_active ? 'Tạm dừng hệ sinh thái này?' : 'Kích hoạt lại?')) return;
    try {
      await api.patch(`/platform/tenants/${id}`, { is_active: !tenant.is_active });
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="animate-spin h-8 w-8 border-3 border-teal-600 border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!tenant) return <div className="flex items-center justify-center h-64 text-gray-500">Không tìm thấy</div>;

  const featureMap = {};
  (tenant.features || []).forEach((f) => { featureMap[f.feature_key] = f.enabled; });
  const sub = subscriptionStatus(tenant);
  const subClass = { green: 'bg-green-50 text-green-700', amber: 'bg-amber-50 text-amber-800', red: 'bg-red-50 text-red-700' }[sub.tone];

  const TABS = [
    { key: 'overview', label: 'Tổng quan', icon: BarChart3 },
    { key: 'ecosystem', label: 'Sơ đồ HST', icon: Network },
    { key: 'billing', label: 'Gói thuê bao', icon: CreditCard },
    { key: 'features', label: 'Tính năng', icon: Puzzle },
    { key: 'users', label: `Users (${users.length})`, icon: Users },
    { key: 'companies', label: `Công ty (${companies.length})`, icon: Building2 },
  ];

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate('/platform/tenants')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 cursor-pointer"
      >
        <ChevronLeft className="h-4 w-4" /> Danh sách HST
      </button>

      <div className="bg-white border rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="h-12 w-12 rounded-xl bg-teal-100 flex items-center justify-center shrink-0">
              <Globe className="h-6 w-6 text-teal-600" />
            </div>
            <div className="min-w-0">
              {editing ? (
                <div className="space-y-2">
                  <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="border rounded-lg px-2 py-1 text-lg font-bold w-full max-w-md" />
                  <div className="flex flex-wrap gap-2">
                    <input value={form.slug} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))} className="border rounded-lg px-2 py-1 text-sm" placeholder="slug" />
                    <input value={form.domain} onChange={(e) => setForm((p) => ({ ...p, domain: e.target.value }))} className="border rounded-lg px-2 py-1 text-sm" placeholder="domain" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select value={form.tier} onChange={(e) => setForm((p) => ({ ...p, tier: e.target.value }))} className="border rounded-lg px-2 py-1 text-sm">
                      {Object.entries(TIER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <input type="number" value={form.max_users} onChange={(e) => setForm((p) => ({ ...p, max_users: +e.target.value }))} className="border rounded-lg px-2 py-1 text-sm w-24" placeholder="Max users" />
                    <input type="number" value={form.max_companies} onChange={(e) => setForm((p) => ({ ...p, max_companies: +e.target.value }))} className="border rounded-lg px-2 py-1 text-sm w-24" placeholder="Max công ty" />
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-gray-900 truncate">{tenant.name}</h2>
                  <div className="text-sm text-gray-500 mt-0.5">
                    {tenant.slug}{tenant.domain ? ` • ${tenant.domain}` : ''} • {TIER_LABELS[tenant.tier] || tenant.tier}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!editing && (
              <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${subClass}`}>{sub.label}</span>
            )}
            {editing ? (
              <>
                <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm text-gray-600 cursor-pointer">Hủy</button>
                <button type="button" onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white text-sm rounded-lg cursor-pointer disabled:opacity-50">
                  <Save className="h-3.5 w-3.5" />{saving ? 'Lưu...' : 'Lưu'}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setEditing(true)} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 cursor-pointer">Sửa</button>
                <button type="button" onClick={toggleActive} className={`px-3 py-1.5 text-sm rounded-lg cursor-pointer ${tenant.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                  {tenant.is_active ? 'Tạm dừng' : 'Kích hoạt'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap cursor-pointer ${tab === t.key ? 'border-teal-600 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Tổng users', value: stats.total_users },
            { label: 'Users hoạt động', value: stats.active_users },
            { label: 'Công ty', value: stats.companies },
            { label: 'Deals', value: stats.deals },
            { label: 'Dự án', value: stats.projects },
          ].map((s) => (
            <div key={s.label} className="bg-white border rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{s.value}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'ecosystem' && (
        <TenantEcosystemDiagram tenantId={id} />
      )}

      {tab === 'billing' && (
        <div className="bg-white border rounded-2xl p-5 space-y-4">
          <h3 className="font-semibold">Thông tin gói thuê bao</h3>
          {editing ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ngày bắt đầu</label>
                <input type="date" value={form.subscription_start} onChange={(e) => setForm((p) => ({ ...p, subscription_start: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ngày hết hạn</label>
                <input type="date" value={form.subscription_end} onChange={(e) => setForm((p) => ({ ...p, subscription_end: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
          ) : (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm max-w-lg">
              <div><dt className="text-gray-500">Gói hiện tại</dt><dd className="font-medium mt-0.5">{TIER_LABELS[tenant.tier] || tenant.tier}</dd></div>
              <div><dt className="text-gray-500">Trạng thái</dt><dd className="font-medium mt-0.5">{sub.label}</dd></div>
              <div><dt className="text-gray-500">Bắt đầu</dt><dd className="font-medium mt-0.5">{formatSubscriptionDate(tenant.subscription_start)}</dd></div>
              <div><dt className="text-gray-500">Hết hạn</dt><dd className="font-medium mt-0.5">{formatSubscriptionDate(tenant.subscription_end)}</dd></div>
              <div><dt className="text-gray-500">Giới hạn users</dt><dd className="font-medium mt-0.5">{stats?.active_users || 0} / {tenant.max_users}</dd></div>
              <div><dt className="text-gray-500">Giới hạn công ty</dt><dd className="font-medium mt-0.5">{stats?.companies || 0} / {tenant.max_companies}</dd></div>
            </dl>
          )}
          {!editing && (
            <button type="button" onClick={() => navigate('/platform/billing')} className="text-sm text-teal-600 hover:text-teal-800 cursor-pointer">
              Xem tất cả gói thuê bao →
            </button>
          )}
        </div>
      )}

      {tab === 'features' && (
        <div className="bg-white border rounded-2xl p-5">
          <h3 className="font-semibold mb-4">Tính năng (override riêng)</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(FEATURE_LABELS).map(([key, label]) => {
              const enabled = featureMap[key] !== false;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleFeature(key, !enabled)}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border text-sm cursor-pointer ${enabled ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}
                >
                  <span>{label}</span>
                  <span className={`w-8 h-5 rounded-full relative ${enabled ? 'bg-teal-500' : 'bg-gray-300'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${enabled ? 'left-3.5' : 'left-0.5'}`} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="bg-white border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Họ tên</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{u.full_name}</td>
                  <td className="px-4 py-3 text-gray-500">{u.email}</td>
                  <td className="px-4 py-3">{u.role}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'companies' && (
        <div className="bg-white border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Công ty</th>
                <th className="text-left px-4 py-3 font-medium">Tên viết tắt</th>
                <th className="text-left px-4 py-3 font-medium">SĐT</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {companies.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-gray-500">{c.short_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{c.phone || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{c.email || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
