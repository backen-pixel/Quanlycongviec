import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import {
  Package, Plus, Save, Pencil, X, Check, ToggleLeft, ToggleRight, Search,
} from 'lucide-react';
import { FEATURE_LABELS, PLAN_LABELS } from '../../lib/platformConstants';

const BADGE_OPTIONS = [
  { value: 'bestSeller', label: 'Best seller' },
  { value: 'new', label: 'Mới' },
  { value: 'comingSoon', label: 'Sắp ra mắt' },
];

const CATEGORY_OPTIONS = [
  { value: 'production', label: 'Sản xuất' },
  { value: 'sales', label: 'Kinh doanh' },
  { value: 'management', label: 'Quản lý' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'tech', label: 'Công nghệ' },
];

const EMPTY_FORM = {
  id: '',
  title: '',
  description: '',
  featuresText: '',
  price_monthly: 0,
  category: 'management',
  color: '#3b82f6',
  icon_key: '',
  badge: 'comingSoon',
  featured: 99,
  feature_key: '',
  tier_on_purchase: 'starter',
  trial_days: 14,
  is_active: true,
  is_purchasable: false,
  min_plan_id: 'free',
  is_addon: true,
};

function formatPrice(n) {
  return Number(n || 0).toLocaleString('vi-VN');
}

export default function PlatformModulesPage() {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/platform/saas-modules');
      setModules(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (m) => {
    setEditing(m.id);
    setForm({
      id: m.id,
      title: m.title,
      description: m.description || '',
      featuresText: (m.features || []).join('\n'),
      price_monthly: m.price_monthly,
      category: m.category,
      color: m.color || '#3b82f6',
      icon_key: m.icon_key || '',
      badge: m.badge || 'comingSoon',
      featured: m.featured ?? 99,
      feature_key: m.feature_key || '',
      tier_on_purchase: m.tier_on_purchase || 'starter',
      trial_days: m.trial_days ?? 14,
      is_active: m.is_active !== false,
      is_purchasable: !!m.is_purchasable,
      min_plan_id: m.min_plan_id || 'free',
      is_addon: m.is_addon !== false,
      sort_order: m.sort_order ?? 0,
    });
    setShowCreate(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowCreate(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        features: form.featuresText.split('\n').map((s) => s.trim()).filter(Boolean),
        price_monthly: Number(form.price_monthly) || 0,
        category: form.category,
        color: form.color,
        icon_key: form.icon_key || null,
        badge: form.badge,
        featured: Number(form.featured),
        feature_key: form.feature_key || null,
        tier_on_purchase: form.tier_on_purchase,
        trial_days: Number(form.trial_days) || 14,
        is_active: form.is_active,
        is_purchasable: form.is_purchasable,
        min_plan_id: form.min_plan_id || 'free',
        is_addon: form.is_addon !== false,
        sort_order: Number(form.sort_order) || 0,
      };

      if (showCreate) {
        await api.post('/platform/saas-modules', { ...payload, id: form.id });
      } else {
        await api.patch(`/platform/saas-modules/${editing}`, payload);
      }
      setEditing(null);
      setShowCreate(false);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu');
    } finally {
      setSaving(false);
    }
  };

  const toggleField = async (m, field) => {
    try {
      await api.patch(`/platform/saas-modules/${m.id}`, { [field]: !m[field] });
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  const filtered = modules.filter((m) =>
    !search || m.title.toLowerCase().includes(search.toLowerCase()) || m.id.includes(search.toLowerCase()));

  const formPanel = (showCreate || editing) && (
    <div className="bg-white border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{showCreate ? 'Thêm gói modun' : `Sửa: ${form.title}`}</h3>
        <button type="button" onClick={() => { setEditing(null); setShowCreate(false); }} className="text-gray-400 hover:text-gray-600 cursor-pointer">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {showCreate && (
          <label className="block">
            <span className="text-xs text-gray-500">ID (slug)</span>
            <input value={form.id} onChange={(e) => setForm((p) => ({ ...p, id: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-0.5" placeholder="vd: crm" />
          </label>
        )}
        <label className="block">
          <span className="text-xs text-gray-500">Tên gói</span>
          <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-0.5" />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Giá / tháng (VNĐ)</span>
          <input type="number" value={form.price_monthly} onChange={(e) => setForm((p) => ({ ...p, price_monthly: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-0.5" />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Danh mục</span>
          <select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-0.5">
            {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Badge</span>
          <select value={form.badge} onChange={(e) => setForm((p) => ({ ...p, badge: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-0.5">
            {BADGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Gói tối thiểu để mua add-on</span>
          <select value={form.min_plan_id || 'free'} onChange={(e) => setForm((p) => ({ ...p, min_plan_id: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-0.5">
            {Object.entries(PLAN_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Tính năng SaaS (feature_key)</span>
          <select value={form.feature_key} onChange={(e) => setForm((p) => ({ ...p, feature_key: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-0.5">
            <option value="">— Không liên kết (luôn add-on) —</option>
            {Object.entries(FEATURE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs text-gray-500">Mô tả</span>
          <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm mt-0.5" />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs text-gray-500">Tính năng (mỗi dòng một mục)</span>
          <textarea value={form.featuresText} onChange={(e) => setForm((p) => ({ ...p, featuresText: e.target.value }))} rows={4} className="w-full border rounded-lg px-3 py-2 text-sm mt-0.5 font-mono" />
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
          <span className="text-sm">Hiển thị trên landing</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.is_purchasable} onChange={(e) => setForm((p) => ({ ...p, is_purchasable: e.target.checked }))} />
          <span className="text-sm">Cho phép mua ngay</span>
        </label>
      </div>
      <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm rounded-xl cursor-pointer disabled:opacity-50">
        <Save className="h-4 w-4" />{saving ? 'Đang lưu...' : 'Lưu gói'}
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Package className="h-5 w-5 text-teal-600" />
          Quản lý modun mua thêm (Landing)
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Chỉ modun add-on — tính năng đã có trong gói chính sẽ không bán lẻ (logic tự ẩn trên landing)
        </p>
        </div>
        <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm rounded-xl cursor-pointer">
          <Plus className="h-4 w-4" />Thêm gói
        </button>
      </div>

      {formPanel}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm gói..." className="w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm" />
      </div>

      <div className="bg-white border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-gray-500">Đang tải...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Gói</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Giá/tháng</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Feature</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Landing</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Mua ngay</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50/80">
                    <td className="px-4 py-3">
                      <div className="font-medium">{m.title}</div>
                      <div className="text-xs text-gray-400">{m.id} · {m.badge}</div>
                    </td>
                    <td className="px-4 py-3">{formatPrice(m.price_monthly)} đ</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{m.feature_key || '—'}</td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => toggleField(m, 'is_active')} className="cursor-pointer" title="Bật/tắt hiển thị">
                        {m.is_active ? <ToggleRight className="h-6 w-6 text-teal-600" /> : <ToggleLeft className="h-6 w-6 text-gray-300" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => toggleField(m, 'is_purchasable')} className="cursor-pointer">
                        {m.is_purchasable ? <Check className="h-5 w-5 text-green-600" /> : <span className="text-gray-300">—</span>}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => openEdit(m)} className="inline-flex items-center gap-1 text-teal-600 text-xs cursor-pointer">
                        <Pencil className="h-3.5 w-3.5" />Sửa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
