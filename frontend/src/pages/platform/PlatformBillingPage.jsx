import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import {
  CreditCard, Search, ChevronRight, Save, AlertTriangle,
} from 'lucide-react';
import {
  TIER_LABELS, TIER_BADGE_COLORS, formatSubscriptionDate,
  subscriptionStatus, toDateInputValue,
} from '../../lib/platformConstants';

export default function PlatformBillingPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/platform/tenants');
      setTenants(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = (t) => {
    setEditingId(t.id);
    setForm({
      tier: t.tier,
      max_users: t.max_users,
      max_companies: t.max_companies,
      subscription_start: toDateInputValue(t.subscription_start),
      subscription_end: toDateInputValue(t.subscription_end),
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await api.patch(`/platform/tenants/${editingId}`, {
        tier: form.tier,
        max_users: form.max_users,
        max_companies: form.max_companies,
        subscription_start: form.subscription_start || null,
        subscription_end: form.subscription_end || null,
      });
      setEditingId(null);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu');
    } finally {
      setSaving(false);
    }
  };

  const filtered = tenants.filter((t) => {
    const matchSearch = !search
      || t.name.toLowerCase().includes(search.toLowerCase())
      || t.slug.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    const status = subscriptionStatus(t);
    if (filter === 'expiring') return status.tone === 'amber';
    if (filter === 'expired') return status.tone === 'red' && t.is_active;
    if (filter === 'active') return status.tone === 'green' && t.is_active;
    return true;
  });

  const expiringCount = tenants.filter((t) => subscriptionStatus(t).tone === 'amber').length;
  const expiredCount = tenants.filter((t) => {
    const s = subscriptionStatus(t);
    return s.tone === 'red' && t.is_active;
  }).length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-teal-600" />
          Quản lý gói thuê bao
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">Theo dõi gói, hạn sử dụng và giới hạn tài nguyên từng hệ sinh thái</p>
      </div>

      {(expiringCount > 0 || expiredCount > 0) && (
        <div className="flex flex-wrap gap-2">
          {expiredCount > 0 && (
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4" />
              {expiredCount} HST đã hết hạn
            </div>
          )}
          {expiringCount > 0 && (
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              {expiringCount} HST sắp hết hạn (≤14 ngày)
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm theo tên hoặc slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border rounded-xl px-3 py-2.5 text-sm min-w-[180px]"
        >
          <option value="all">Tất cả</option>
          <option value="active">Đang hoạt động</option>
          <option value="expiring">Sắp hết hạn</option>
          <option value="expired">Đã hết hạn</option>
        </select>
      </div>

      <div className="bg-white border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-gray-500">Đang tải...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-400">Không có hệ sinh thái phù hợp</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Hệ sinh thái</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Gói</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Bắt đầu</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Hết hạn</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Giới hạn</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Trạng thái</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((t) => {
                  const status = subscriptionStatus(t);
                  const isEditing = editingId === t.id;
                  const statusClass = {
                    green: 'bg-green-50 text-green-700',
                    amber: 'bg-amber-50 text-amber-800',
                    red: 'bg-red-50 text-red-700',
                  }[status.tone];

                  return (
                    <tr key={t.id} className="hover:bg-gray-50/80">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => navigate(`/platform/tenants/${t.id}`)}
                          className="font-medium text-gray-900 hover:text-teal-700 cursor-pointer text-left"
                        >
                          {t.name}
                        </button>
                        <div className="text-xs text-gray-400">{t.slug}</div>
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            value={form.tier}
                            onChange={(e) => setForm((p) => ({ ...p, tier: e.target.value }))}
                            className="border rounded-lg px-2 py-1 text-sm"
                          >
                            {Object.entries(TIER_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${TIER_BADGE_COLORS[t.tier] || 'bg-gray-100'}`}>
                            {TIER_LABELS[t.tier] || t.tier}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {isEditing ? (
                          <input
                            type="date"
                            value={form.subscription_start}
                            onChange={(e) => setForm((p) => ({ ...p, subscription_start: e.target.value }))}
                            className="border rounded-lg px-2 py-1 text-sm"
                          />
                        ) : formatSubscriptionDate(t.subscription_start)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {isEditing ? (
                          <input
                            type="date"
                            value={form.subscription_end}
                            onChange={(e) => setForm((p) => ({ ...p, subscription_end: e.target.value }))}
                            className="border rounded-lg px-2 py-1 text-sm"
                          />
                        ) : formatSubscriptionDate(t.subscription_end)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {isEditing ? (
                          <div className="flex gap-1">
                            <input
                              type="number"
                              value={form.max_users}
                              onChange={(e) => setForm((p) => ({ ...p, max_users: +e.target.value }))}
                              className="border rounded-lg px-2 py-1 w-16 text-sm"
                              title="Max users"
                            />
                            <input
                              type="number"
                              value={form.max_companies}
                              onChange={(e) => setForm((p) => ({ ...p, max_companies: +e.target.value }))}
                              className="border rounded-lg px-2 py-1 w-16 text-sm"
                              title="Max companies"
                            />
                          </div>
                        ) : (
                          <span>{t.user_count || 0}/{t.max_users} users · {t.company_count || 0}/{t.max_companies} cty</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${statusClass}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-2">
                            <button type="button" onClick={() => setEditingId(null)} className="text-xs text-gray-500 cursor-pointer">Hủy</button>
                            <button
                              type="button"
                              onClick={saveEdit}
                              disabled={saving}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-teal-600 text-white text-xs rounded-lg cursor-pointer disabled:opacity-50"
                            >
                              <Save className="h-3 w-3" />{saving ? '...' : 'Lưu'}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button type="button" onClick={() => startEdit(t)} className="text-xs text-teal-600 hover:text-teal-800 cursor-pointer">Sửa gói</button>
                            <button type="button" onClick={() => navigate(`/platform/tenants/${t.id}`)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
