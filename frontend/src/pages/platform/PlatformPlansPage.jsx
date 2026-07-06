import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { CreditCard, Save, Pencil, X, ToggleLeft, ToggleRight } from 'lucide-react';
import { PLAN_LABELS } from '../../lib/platformConstants';
import { QUOTA_FIELDS, formatQuotaLimit } from '../../lib/saasQuotas';

function formatPrice(n) {
  return Number(n || 0).toLocaleString('vi-VN');
}

export default function PlatformPlansPage() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/platform/saas-plans');
      setPlans(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (p) => {
    setEditing(p.id);
    setForm({
      title: p.title,
      subtitle: p.subtitle || '',
      description: p.description || '',
      price_monthly: p.price_monthly,
      max_users: p.max_users,
      max_companies: p.max_companies,
      highlightsText: (p.highlights || []).join('\n'),
      badge: p.badge || '',
      color: p.color || '#3b82f6',
      trial_days: p.trial_days ?? 14,
      is_active: p.is_active !== false,
      is_purchasable: p.is_purchasable !== false,
      tenant_tier: p.tenant_tier,
      quotas: { ...(p.quotas || {}) },
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/platform/saas-plans/${editing}`, {
        title: form.title,
        subtitle: form.subtitle,
        description: form.description,
        price_monthly: Number(form.price_monthly) || 0,
        max_users: Number(form.max_users) || 5,
        max_companies: Number(form.max_companies) || 1,
        highlights: form.highlightsText.split('\n').map((s) => s.trim()).filter(Boolean),
        badge: form.badge || null,
        color: form.color,
        trial_days: Number(form.trial_days) || 14,
        is_active: form.is_active,
        is_purchasable: form.is_purchasable,
        tenant_tier: form.tenant_tier,
        quotas: Object.fromEntries(
          QUOTA_FIELDS.map(({ key }) => {
            const raw = form.quotas?.[key];
            if (raw === '' || raw == null) return [key, -1];
            const v = Number(raw);
            return [key, Number.isFinite(v) ? v : -1];
          }),
        ),
      });
      setEditing(null);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu');
    } finally {
      setSaving(false);
    }
  };

  const toggleField = async (p, field) => {
    try {
      await api.patch(`/platform/saas-plans/${p.id}`, { [field]: !p[field] });
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-teal-600" />
          4 gói chính (Free · Standard · Pro · Ultra)
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Gói thuê bao nền tảng — khách đăng ký gói trước, sau đó mua modun thêm nếu cần
        </p>
      </div>

      {editing && (
        <div className="bg-white border rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Sửa gói {PLAN_LABELS[editing] || editing}</h3>
            <button type="button" onClick={() => setEditing(null)} className="text-gray-400 cursor-pointer"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block"><span className="text-xs text-gray-500">Tên hiển thị</span>
              <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-0.5" />
            </label>
            <label className="block"><span className="text-xs text-gray-500">Giá/tháng (VNĐ)</span>
              <input type="number" value={form.price_monthly} onChange={(e) => setForm((p) => ({ ...p, price_monthly: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-0.5" />
            </label>
            <label className="block"><span className="text-xs text-gray-500">Phụ đề</span>
              <input value={form.subtitle} onChange={(e) => setForm((p) => ({ ...p, subtitle: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-0.5" />
            </label>
            <label className="block"><span className="text-xs text-gray-500">Tenant tier (DB)</span>
              <input value={form.tenant_tier} onChange={(e) => setForm((p) => ({ ...p, tenant_tier: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-0.5" />
            </label>
            <label className="block"><span className="text-xs text-gray-500">Max users</span>
              <input type="number" value={form.max_users} onChange={(e) => setForm((p) => ({ ...p, max_users: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-0.5" />
            </label>
            <label className="block"><span className="text-xs text-gray-500">Max công ty</span>
              <input type="number" value={form.max_companies} onChange={(e) => setForm((p) => ({ ...p, max_companies: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-0.5" />
            </label>
            <label className="block sm:col-span-2"><span className="text-xs text-gray-500">Điểm nổi bật (mỗi dòng)</span>
              <textarea value={form.highlightsText} onChange={(e) => setForm((p) => ({ ...p, highlightsText: e.target.value }))} rows={5} className="w-full border rounded-lg px-3 py-2 text-sm mt-0.5 font-mono" />
            </label>
            <div className="sm:col-span-2 border-t pt-3">
              <p className="text-xs font-semibold text-gray-700 mb-2">Giới hạn gói (quota)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {QUOTA_FIELDS.map(({ key, label, hint }) => (
                  <label key={key} className="block">
                    <span className="text-xs text-gray-500">{label}</span>
                    <input
                      type="number"
                      value={form.quotas?.[key] ?? ''}
                      onChange={(e) => setForm((p) => ({
                        ...p,
                        quotas: { ...p.quotas, [key]: e.target.value },
                      }))}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm mt-0.5"
                      placeholder="-1"
                    />
                    {hint && <span className="text-[10px] text-gray-400">{hint}</span>}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
              <span className="text-sm">Hiển thị landing</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_purchasable} onChange={(e) => setForm((p) => ({ ...p, is_purchasable: e.target.checked }))} />
              <span className="text-sm">Cho đăng ký online</span>
            </label>
          </div>
          <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm rounded-xl cursor-pointer disabled:opacity-50">
            <Save className="h-4 w-4" />{saving ? 'Đang lưu...' : 'Lưu gói'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {loading ? (
          <div className="col-span-full py-12 text-center text-gray-500">Đang tải...</div>
        ) : plans.map((p) => (
          <div key={p.id} className="bg-white border rounded-2xl p-5 flex flex-col" style={{ borderTopColor: p.color, borderTopWidth: 3 }}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold text-lg">{p.title}</h3>
                <p className="text-xs text-gray-500">{p.subtitle}</p>
              </div>
              {p.badge === 'popular' && <span className="text-[10px] font-bold uppercase bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Phổ biến</span>}
              {p.badge === 'best' && <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Tốt nhất</span>}
            </div>
            <p className="mt-3 text-2xl font-bold" style={{ color: p.color }}>
              {p.price_monthly === 0 ? 'Miễn phí' : `${formatPrice(p.price_monthly)} đ`}
              {p.price_monthly > 0 && <span className="text-xs font-normal text-gray-400"> /tháng</span>}
            </p>
            <ul className="mt-3 space-y-1 flex-1 text-xs text-gray-600">
              {(p.highlights || []).slice(0, 6).map((h) => (
                <li key={h}>• {h}</li>
              ))}
            </ul>
            <p className="mt-2 text-[10px] text-gray-400">Tier DB: {p.tenant_tier} · {p.max_users} user · {p.max_companies} cty</p>
            {p.quotas && (
              <p className="mt-1 text-[10px] text-gray-400">
                {formatQuotaLimit(p.quotas.leads_per_month)} lead/th · {formatQuotaLimit(p.quotas.deals_per_month)} deal/th · {formatQuotaLimit(p.quotas.storage_mb)} MB
              </p>
            )}
            <div className="mt-4 flex items-center justify-between pt-3 border-t">
              <button type="button" onClick={() => toggleField(p, 'is_active')} className="cursor-pointer" title="Hiển thị">
                {p.is_active ? <ToggleRight className="h-6 w-6 text-teal-600" /> : <ToggleLeft className="h-6 w-6 text-gray-300" />}
              </button>
              <button type="button" onClick={() => openEdit(p)} className="inline-flex items-center gap-1 text-teal-600 text-xs cursor-pointer">
                <Pencil className="h-3.5 w-3.5" />Sửa
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
