import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../../lib/api';
import { Globe, Plus, Search, Building2, Users, ChevronRight, Copy } from 'lucide-react';
import { TIER_LABELS, TIER_BADGE_COLORS } from '../../lib/platformConstants';

export default function PlatformTenantsPage() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/platform/tenants');
      setTenants(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (location.state?.showCreate) {
      setShowCreate(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  const filtered = tenants.filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Globe className="h-5 w-5 text-teal-600" />
            Quản lý Hệ sinh thái
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">{tenants.length} hệ sinh thái trên nền tảng</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 cursor-pointer text-sm"
        >
          <Plus className="h-4 w-4" />
          Tạo mới
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Tìm kiếm theo tên hoặc slug..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Đang tải...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">Không có hệ sinh thái nào</div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((t) => (
            <div
              key={t.id}
              onClick={() => navigate(`/platform/tenants/${t.id}`)}
              className="bg-white border rounded-xl p-5 hover:shadow-md transition-shadow cursor-pointer flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                {t.logo_url ? (
                  <img src={t.logo_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded-lg bg-teal-100 flex items-center justify-center">
                    <Globe className="h-5 w-5 text-teal-600" />
                  </div>
                )}
                <div>
                  <div className="font-semibold text-gray-900">{t.name}</div>
                  <div className="text-sm text-gray-500">{t.slug}{t.domain ? ` • ${t.domain}` : ''}</div>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${TIER_BADGE_COLORS[t.tier] || 'bg-gray-100 text-gray-600'}`}>
                  {TIER_LABELS[t.tier] || t.tier}
                </span>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span className="flex items-center gap-1"><Users className="h-4 w-4" />{t.user_count || 0}</span>
                  <span className="flex items-center gap-1"><Building2 className="h-4 w-4" />{t.company_count || 0}</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs ${t.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {t.is_active ? 'Hoạt động' : 'Tạm dừng'}
                </span>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateTenantModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}

function CreateTenantModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '', slug: '', tier: 'free', max_users: 50, max_companies: 5,
    admin_email: '', admin_password: '', admin_full_name: '',
    blueprint_key: '', bootstrap_company: true, company_name: '', company_short_name: '',
  });
  const [blueprints, setBlueprints] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/platform/blueprints')
      .then(({ data }) => {
        if (!active) return;
        const rows = data?.blueprints || [];
        setBlueprints(rows);
        setForm((previous) => ({ ...previous, blueprint_key: previous.blueprint_key || rows[0]?.blueprint_key || '' }));
      })
      .catch(() => {
        if (active) setBlueprints([]);
      });
    return () => { active = false; };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim()) return setError('Nhập tên và slug');
    if (form.bootstrap_company && form.blueprint_key && !form.admin_email.trim()) return setError('Cần email Admin để tự tạo công ty theo bộ mẫu');
    if (form.bootstrap_company && form.blueprint_key && !form.company_name.trim()) return setError('Nhập tên công ty đầu tiên');
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/platform/tenants/onboard', form);
      if (data?.blueprint_warning) alert(data.blueprint_warning);
      onCreated();
    } catch (err) {
      setError(err.response?.data?.error || 'Lỗi tạo hệ sinh thái');
    } finally {
      setSaving(false);
    }
  };

  const autoSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} className="bg-white rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-xl">
        <h2 className="text-lg font-bold">Tạo Hệ sinh thái mới</h2>
        {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded-lg">{error}</div>}

        <div>
          <label className="block text-sm font-medium mb-1">Tên hệ sinh thái *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((p) => ({
              ...p,
              name: e.target.value,
              slug: p.slug === autoSlug(p.name) ? autoSlug(e.target.value) : p.slug,
              company_name: !p.company_name || p.company_name === p.name ? e.target.value : p.company_name,
            }))}
            className="w-full border rounded-xl px-3 py-2 text-sm"
            placeholder="VD: Hệ sinh thái ABC"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Slug (URL) *</label>
          <input
            type="text"
            value={form.slug}
            onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm"
            placeholder="abc-company"
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Gói</label>
            <select value={form.tier} onChange={(e) => setForm((p) => ({ ...p, tier: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm">
              {Object.entries(TIER_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Max users</label>
            <input type="number" value={form.max_users} onChange={(e) => setForm((p) => ({ ...p, max_users: +e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Max công ty</label>
            <input type="number" value={form.max_companies} onChange={(e) => setForm((p) => ({ ...p, max_companies: +e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm" />
          </div>
        </div>

        {blueprints.length > 0 && (
          <div className="border-t pt-4 space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Copy className="h-4 w-4 text-teal-600" /> Bộ mẫu vận hành
            </h3>
            <select
              value={form.blueprint_key}
              onChange={(e) => setForm((p) => ({ ...p, blueprint_key: e.target.value }))}
              className="w-full border rounded-xl px-3 py-2 text-sm"
            >
              <option value="">Không áp dụng ngay</option>
              {blueprints.map((blueprint) => (
                <option key={blueprint.id} value={blueprint.blueprint_key}>
                  {blueprint.name} · v{blueprint.published_version?.version_number || '—'}
                </option>
              ))}
            </select>
            {!!form.blueprint_key && (
              <>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.bootstrap_company}
                    onChange={(e) => setForm((p) => ({ ...p, bootstrap_company: e.target.checked }))}
                  />
                  Tự tạo công ty, CRM pipeline và phòng ban mẫu
                </label>
                {form.bootstrap_company && (
                  <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-2">
                    <input
                      value={form.company_name}
                      onChange={(e) => setForm((p) => ({ ...p, company_name: e.target.value }))}
                      className="w-full border rounded-xl px-3 py-2 text-sm"
                      placeholder="Tên công ty đầu tiên"
                    />
                    <input
                      value={form.company_short_name}
                      onChange={(e) => setForm((p) => ({ ...p, company_short_name: e.target.value }))}
                      className="w-full border rounded-xl px-3 py-2 text-sm"
                      placeholder="Viết tắt"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold mb-2">Tài khoản Admin (tùy chọn)</h3>
          <div className="space-y-2">
            <input type="text" placeholder="Họ tên admin" value={form.admin_full_name} onChange={(e) => setForm((p) => ({ ...p, admin_full_name: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm" />
            <input type="email" placeholder="Email admin" value={form.admin_email} onChange={(e) => setForm((p) => ({ ...p, admin_email: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm" />
            <input type="password" placeholder="Mật khẩu" value={form.admin_password} onChange={(e) => setForm((p) => ({ ...p, admin_password: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 cursor-pointer">Hủy</button>
          <button type="submit" disabled={saving} className="px-4 py-2 bg-teal-600 text-white text-sm rounded-xl hover:bg-teal-700 disabled:opacity-50 cursor-pointer">
            {saving ? 'Đang tạo...' : 'Tạo hệ sinh thái'}
          </button>
        </div>
      </form>
    </div>
  );
}
