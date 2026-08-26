import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { Globe, Users, Building2, BarChart3, Puzzle, Save, CreditCard, ChevronLeft, Network, Copy, CheckCircle2, AlertTriangle, Eye, ArrowRight, ShieldCheck } from 'lucide-react';
import {
  TIER_LABELS, FEATURE_LABELS, formatSubscriptionDate,
  subscriptionStatus, toDateInputValue,
} from '../../lib/platformConstants';
import TenantEcosystemDiagram from '../../components/platform/TenantEcosystemDiagram';

function ChangeList({ label, items, tone = 'teal' }) {
  if (!items?.length) return null;
  const toneClass = tone === 'amber'
    ? 'border-amber-200 bg-amber-50 text-amber-800'
    : tone === 'red'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-teal-200 bg-teal-50 text-teal-800';
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold text-gray-500">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => <span key={item} className={`rounded-lg border px-2 py-1 text-[11px] font-medium ${toneClass}`}>{item}</span>)}
      </div>
    </div>
  );
}

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
  const [blueprints, setBlueprints] = useState([]);
  const [blueprintInstallations, setBlueprintInstallations] = useState([]);
  const [blueprintError, setBlueprintError] = useState('');
  const [blueprintSuccess, setBlueprintSuccess] = useState('');
  const [blueprintPreview, setBlueprintPreview] = useState(null);
  const [previewingBlueprint, setPreviewingBlueprint] = useState(false);
  const [applyingBlueprint, setApplyingBlueprint] = useState(false);
  const [blueprintForm, setBlueprintForm] = useState({
    blueprint_key: '',
    bootstrap_company: false,
    company_name: '',
    company_short_name: '',
  });

  const load = useCallback(async () => {
    try {
      const [tRes, uRes, cRes, sRes, bpRes, biRes] = await Promise.all([
        api.get(`/platform/tenants/${id}`),
        api.get(`/platform/tenants/${id}/users`),
        api.get(`/platform/tenants/${id}/companies`),
        api.get(`/platform/tenants/${id}/stats`).catch(() => ({ data: null })),
        api.get('/platform/blueprints').catch((error) => ({ blueprintError: error.response?.data?.error || 'Không tải được bộ mẫu' })),
        api.get(`/platform/tenants/${id}/blueprints`).catch((error) => ({ blueprintError: error.response?.data?.error || 'Không tải được trạng thái bộ mẫu' })),
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
      const availableBlueprints = bpRes.data?.blueprints || [];
      setBlueprints(availableBlueprints);
      setBlueprintInstallations(biRes.data?.installations || []);
      setBlueprintError(bpRes.blueprintError || biRes.blueprintError || '');
      setBlueprintForm((previous) => ({
        ...previous,
        blueprint_key: previous.blueprint_key || availableBlueprints[0]?.blueprint_key || '',
        bootstrap_company: previous.bootstrap_company || !(cRes.data || []).length,
        company_name: previous.company_name || t.name,
      }));
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

  const previewBlueprint = async () => {
    if (!blueprintForm.blueprint_key) return;
    setPreviewingBlueprint(true);
    setBlueprintError('');
    setBlueprintSuccess('');
    try {
      const { data } = await api.get(`/platform/tenants/${id}/blueprints/preview`, {
        params: { blueprint_key: blueprintForm.blueprint_key },
      });
      setBlueprintPreview(data?.preview || null);
    } catch (error) {
      setBlueprintPreview(null);
      setBlueprintError(error.response?.data?.error || 'Không lập được kế hoạch thay đổi.');
    } finally {
      setPreviewingBlueprint(false);
    }
  };

  const applyBlueprint = async () => {
    if (!blueprintForm.blueprint_key) return;
    if (!blueprintPreview || blueprintPreview.blueprint?.blueprint_key !== blueprintForm.blueprint_key) {
      setBlueprintError('Hãy xem trước thay đổi trước khi áp dụng bộ mẫu.');
      return;
    }
    if (blueprintForm.bootstrap_company && !blueprintForm.company_name.trim()) {
      setBlueprintError('Nhập tên công ty đầu tiên trước khi áp dụng bộ mẫu.');
      return;
    }
    if (!confirm(`Áp dụng Blueprint v${blueprintPreview.target?.version_number}? Không có dữ liệu hiện tại nào bị xoá.`)) return;
    setApplyingBlueprint(true);
    setBlueprintError('');
    setBlueprintSuccess('');
    try {
      await api.post(`/platform/tenants/${id}/blueprints/apply`, {
        ...blueprintForm,
        expected_current_version: blueprintPreview.current?.version_number ?? null,
      });
      setBlueprintSuccess(`Đã áp dụng Blueprint v${blueprintPreview.target?.version_number} thành công.`);
      setBlueprintPreview(null);
      await load();
    } catch (error) {
      setBlueprintError(error.response?.data?.error || 'Không áp dụng được bộ mẫu.');
    } finally {
      setApplyingBlueprint(false);
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
    { key: 'blueprint', label: 'Bộ mẫu vận hành', icon: Copy },
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

      {tab === 'blueprint' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
          <div className="bg-white border rounded-2xl p-5 space-y-4">
            <div>
              <h3 className="font-semibold">Bộ mẫu đang áp dụng</h3>
              <p className="text-sm text-gray-500 mt-1">Nhân bản cấu hình module, phòng ban và quy trình; không sao chép dữ liệu giao dịch.</p>
            </div>

            {blueprintError && (
              <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{blueprintError}</span>
              </div>
            )}
            {blueprintSuccess && (
              <div className="flex items-start gap-2 rounded-xl bg-green-50 px-3 py-2.5 text-sm text-green-800">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{blueprintSuccess}</span>
              </div>
            )}

            {blueprintInstallations.length === 0 ? (
              <div className="rounded-xl border border-dashed p-5 text-sm text-gray-500">Hệ sinh thái chưa được gắn bộ mẫu vận hành.</div>
            ) : (
              <div className="space-y-2">
                {blueprintInstallations.map((installation) => (
                  <div key={installation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                    <div>
                      <div className="font-medium text-gray-900">{installation.blueprint?.name}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Phiên bản {installation.version?.version_number || '—'}
                        {installation.applied_at ? ` • Áp dụng ${new Date(installation.applied_at).toLocaleString('vi-VN')}` : ''}
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium ${installation.status === 'active' ? 'bg-green-50 text-green-700' : installation.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                      {installation.status === 'active' && <CheckCircle2 className="h-3.5 w-3.5" />}
                      {{ active: 'Đang hoạt động', applying: 'Đang áp dụng', pending: 'Chờ áp dụng', failed: 'Cần xử lý' }[installation.status] || installation.status}
                    </span>
                    {installation.last_error && <p className="w-full text-xs text-red-600">{installation.last_error}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border rounded-2xl p-5 space-y-4">
            <div>
              <h3 className="font-semibold">Áp dụng hoặc nâng cấp</h3>
              <p className="text-xs text-gray-500 mt-1">Thao tác có tính lặp an toàn và giữ các dữ liệu đang có.</p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Bộ mẫu</label>
              <select
                value={blueprintForm.blueprint_key}
                onChange={(event) => {
                  setBlueprintForm((previous) => ({ ...previous, blueprint_key: event.target.value }));
                  setBlueprintPreview(null);
                  setBlueprintError('');
                  setBlueprintSuccess('');
                }}
                className="w-full border rounded-xl px-3 py-2.5 text-sm"
              >
                {blueprints.map((blueprint) => (
                  <option key={blueprint.id} value={blueprint.blueprint_key}>
                    {blueprint.name} · v{blueprint.published_version?.version_number || '—'}
                  </option>
                ))}
              </select>
            </div>

            {!companies.length && (
              <>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={blueprintForm.bootstrap_company}
                    onChange={(event) => setBlueprintForm((previous) => ({ ...previous, bootstrap_company: event.target.checked }))}
                  />
                  Tạo công ty và phòng ban mẫu
                </label>
                {blueprintForm.bootstrap_company && (
                  <div className="space-y-2">
                    <input
                      value={blueprintForm.company_name}
                      onChange={(event) => setBlueprintForm((previous) => ({ ...previous, company_name: event.target.value }))}
                      className="w-full border rounded-xl px-3 py-2.5 text-sm"
                      placeholder="Tên công ty đầu tiên"
                    />
                    <input
                      value={blueprintForm.company_short_name}
                      onChange={(event) => setBlueprintForm((previous) => ({ ...previous, company_short_name: event.target.value }))}
                      className="w-full border rounded-xl px-3 py-2.5 text-sm"
                      placeholder="Tên viết tắt"
                    />
                  </div>
                )}
              </>
            )}

            {blueprintPreview && (
              <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <span>{blueprintPreview.current ? `v${blueprintPreview.current.version_number}` : 'Chưa cài'}</span>
                    <ArrowRight className="h-4 w-4 text-teal-600" />
                    <span>v{blueprintPreview.target?.version_number}</span>
                  </div>
                  <span className="rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-teal-700">
                    {blueprintPreview.plan?.change_count || 0} thay đổi
                  </span>
                </div>
                {!blueprintPreview.plan?.has_changes && (
                  <p className="text-xs text-gray-600">Tenant đã ở cùng cấu hình Blueprint. Có thể áp dụng lại để đồng bộ trạng thái.</p>
                )}
                <ChangeList label="Bật module" items={blueprintPreview.plan?.modules?.enable} />
                <ChangeList label="Tắt module" items={blueprintPreview.plan?.modules?.disable} tone="red" />
                <ChangeList label="Cập nhật cấu hình module" items={blueprintPreview.plan?.modules?.reconfigure} tone="amber" />
                <ChangeList label="Thêm mẫu phòng ban" items={blueprintPreview.plan?.departments?.add_templates} />
                <ChangeList label="Thêm quy trình" items={blueprintPreview.plan?.processes?.add} />
                <ChangeList label="Cập nhật quy trình" items={blueprintPreview.plan?.processes?.update} tone="amber" />
                {!!blueprintPreview.plan?.retained_count && (
                  <p className="text-[11px] leading-5 text-gray-600">{blueprintPreview.plan.retained_count} cấu hình ngoài Blueprint vẫn được giữ nguyên.</p>
                )}
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-green-700">
                  <ShieldCheck className="h-3.5 w-3.5" /> Không có thao tác xoá dữ liệu
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={previewBlueprint}
              disabled={!blueprintForm.blueprint_key || previewingBlueprint || applyingBlueprint}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-teal-200 bg-white px-4 py-2.5 text-sm font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-50"
            >
              <Eye className="h-4 w-4" /> {previewingBlueprint ? 'Đang lập kế hoạch…' : 'Xem trước thay đổi'}
            </button>

            <button
              type="button"
              onClick={applyBlueprint}
              disabled={!blueprintForm.blueprint_key || !blueprintPreview || applyingBlueprint || previewingBlueprint}
              className="w-full rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {applyingBlueprint ? 'Đang áp dụng…' : blueprintInstallations.length ? 'Cập nhật bộ mẫu' : 'Áp dụng bộ mẫu'}
            </button>
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
