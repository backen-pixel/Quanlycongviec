import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { Puzzle, Plus, Loader2, ArrowLeft, Settings, ToggleLeft, ToggleRight, Building2, Upload } from 'lucide-react';
import {
  APP_MODULE_CATEGORY_PRESETS,
  APP_MODULE_EMOJI_PRESETS,
  APP_MODULE_IMAGE_PRESETS,
  categoryAccentFor,
} from '../lib/appModulePresets';

const COLORS = ['#4f46e5', '#0f766e', '#ea580c', '#db2777', '#2563eb', '#7c3aed', '#0891b2'];

const emptyForm = (user) => ({
  name: '',
  module_key: '',
  icon: '📦',
  icon_image: '',
  category: 'Tùy chỉnh',
  color: COLORS[0],
  description: '',
  shared_all: false,
  company_ids: user?.company_id ? [String(user.company_id)] : [],
});

export default function AppModulesAdminPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const navigate = useNavigate();
  const [modules, setModules] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(() => emptyForm(user));
  const iconFileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, cRes] = await Promise.all([
        api.get('/app-modules', { params: { include_inactive: 1 } }),
        api.get('/companies').catch(() => ({ data: { companies: [] } })),
      ]);
      setModules(mRes.data.modules || []);
      const cos = cRes.data?.companies || cRes.data || [];
      setCompanies(Array.isArray(cos) ? cos : []);
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const toggleCompany = (id) => {
    const sid = String(id);
    setForm((f) => {
      const set = new Set(f.company_ids || []);
      if (set.has(sid)) set.delete(sid);
      else set.add(sid);
      return { ...f, company_ids: [...set], shared_all: false };
    });
  };

  const uploadIconFromDevice = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage('Chỉ chọn file ảnh (PNG, JPG, WEBP, GIF…).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage('Ảnh icon nên nhỏ hơn 2MB.');
      return;
    }
    setUploadingIcon(true);
    setMessage('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('entity_type', 'app_module_icons');
      const { data } = await api.post('/upload/single', fd, { timeout: 120000 });
      if (!data?.file_url) throw new Error('Không nhận được URL ảnh');
      setForm((f) => ({ ...f, icon_image: data.file_url }));
    } catch (err) {
      setMessage(err.response?.data?.error || err.message || 'Lỗi upload ảnh');
    } finally {
      setUploadingIcon(false);
      if (iconFileRef.current) iconFileRef.current.value = '';
    }
  };

  const create = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (!form.shared_all && !(form.company_ids || []).length) {
      setMessage('Chọn ít nhất một công ty, hoặc bật «Dùng chung mọi công ty».');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const payload = {
        name: form.name,
        module_key: form.module_key,
        icon: form.icon || '📦',
        icon_image: form.icon_image || null,
        category: form.category || 'Tùy chỉnh',
        color: form.color || categoryAccentFor(form.category),
        description: form.description,
        company_ids: form.shared_all ? [] : form.company_ids,
        shared_all: form.shared_all,
      };
      const { data } = await api.post('/app-modules', payload);
      setForm(emptyForm(user));
      setMessage(`Đã tạo module «${data.module?.name}» — sẽ hiện trên App Switcher của công ty được chọn.`);
      await load();
      if (data.module?.module_key) {
        navigate(`/ecosystem/app-modules/${data.module.module_key}`);
      }
    } catch (err) {
      setMessage(err.response?.data?.error || err.message);
    }
    setSaving(false);
  };

  const toggleActive = async (mod) => {
    try {
      await api.put(`/app-modules/${mod.module_key}`, { is_active: !mod.is_active });
      await load();
    } catch (err) {
      setMessage(err.response?.data?.error || err.message);
    }
  };

  const companyLabel = (id) => {
    const c = companies.find((x) => String(x.id) === String(id));
    return c?.short_name || c?.name || String(id).slice(0, 8);
  };

  if (!isAdmin) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center text-gray-600">
        <p className="text-sm">Chỉ quản trị viên được cấu hình module tùy chỉnh.</p>
        <Link to="/ecosystem" className="text-blue-600 text-sm font-medium mt-4 inline-block">← Về Cấu trúc công ty</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl px-4 py-4">
      <div>
        <Link to="/ecosystem" className="inline-flex items-center gap-1 text-sm text-blue-600 font-medium mb-2">
          <ArrowLeft className="h-4 w-4" /> Cấu trúc công ty
        </Link>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Puzzle className="h-6 w-6 text-indigo-600" />
          Module tùy chỉnh
        </h1>
        <p className="text-xs text-gray-500 mt-1 max-w-2xl">
          Sau khi tạo, module hiện trong App Switcher theo công ty được gắn. Có thể chọn 1 công ty, nhiều công ty, hoặc dùng chung tất cả.
        </p>
      </div>

      {message && (
        <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-gray-800">{message}</div>
      )}

      <form onSubmit={create} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> Tạo module mới
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs text-gray-600 space-y-1">
            <span>Tên hiển thị *</span>
            <input
              className="w-full h-9 px-2 border rounded-lg text-sm"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="VD: QC, Bảo hành nội bộ…"
              required
            />
          </label>
          <label className="text-xs text-gray-600 space-y-1">
            <span>Key (slug, để trống = tự tạo)</span>
            <input
              className="w-full h-9 px-2 border rounded-lg text-sm font-mono"
              value={form.module_key}
              onChange={(e) => setForm((f) => ({ ...f, module_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
              placeholder="qc_noi_bo"
            />
          </label>
          <label className="text-xs text-gray-600 space-y-1 sm:col-span-2">
            <span>Phân loại (App Switcher)</span>
            <select
              className="w-full h-9 px-2 border rounded-lg text-sm bg-white"
              value={form.category}
              onChange={(e) => setForm((f) => ({
                ...f,
                category: e.target.value,
                color: categoryAccentFor(e.target.value),
              }))}
            >
              {APP_MODULE_CATEGORY_PRESETS.map((c) => (
                <option key={c.key} value={c.key}>{c.key}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div
              className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl shadow-sm ring-1 ring-black/5 shrink-0 overflow-hidden bg-white"
              style={{ background: form.icon_image ? '#fff' : `${form.color}18` }}
            >
              {form.icon_image ? (
                <img src={form.icon_image} alt="" className="h-10 w-10 object-contain" />
              ) : (
                <span>{form.icon || '📦'}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-800">Icon hiển thị trên App Switcher</p>
              <p className="text-[10px] text-gray-500">Chọn ảnh brand (giống CRM/SX) hoặc emoji.</p>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-gray-600 mb-1.5">Ảnh icon (kiểu module sẵn có)</p>
            <div className="flex flex-wrap gap-1.5 items-center">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, icon_image: '' }))}
                className={`h-10 px-2 rounded-lg border text-[10px] font-medium ${
                  !form.icon_image ? 'border-indigo-400 ring-1 ring-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white'
                }`}
              >
                Dùng emoji
              </button>
              <button
                type="button"
                disabled={uploadingIcon}
                onClick={() => iconFileRef.current?.click()}
                className="h-10 px-2.5 rounded-lg border border-dashed border-indigo-300 bg-white text-[10px] font-semibold text-indigo-700 inline-flex items-center gap-1 hover:bg-indigo-50 disabled:opacity-50"
                title="Tải ảnh PNG/JPG từ máy (khuyến nghị vuông, nền trong suốt)"
              >
                {uploadingIcon ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Tải từ máy
              </button>
              <input
                ref={iconFileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                className="hidden"
                onChange={(e) => uploadIconFromDevice(e.target.files?.[0])}
              />
              {APP_MODULE_IMAGE_PRESETS.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  title={img.label}
                  onClick={() => setForm((f) => ({ ...f, icon_image: img.url }))}
                  className={`h-10 w-10 rounded-lg border flex items-center justify-center bg-white overflow-hidden ${
                    form.icon_image === img.url ? 'border-indigo-400 ring-1 ring-indigo-300' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <img src={img.url} alt={img.label} className="h-8 w-8 object-contain" />
                </button>
              ))}
            </div>
            {form.icon_image && !APP_MODULE_IMAGE_PRESETS.some((p) => p.url === form.icon_image) && (
              <p className="text-[10px] text-emerald-700 mt-1 truncate">Đã chọn ảnh tải lên</p>
            )}
          </div>

          {!form.icon_image && (
            <div>
              <p className="text-[10px] font-semibold text-gray-600 mb-1.5">Emoji</p>
              <div className="flex flex-wrap gap-1">
                {APP_MODULE_EMOJI_PRESETS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, icon: em }))}
                    className={`h-8 w-8 rounded-lg border text-base leading-none ${
                      form.icon === em ? 'border-indigo-400 ring-1 ring-indigo-300 bg-white' : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-[10px] font-semibold text-gray-600 mb-1.5">Màu accent</p>
            <div className="flex flex-wrap gap-1.5 items-center">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className={`h-7 w-7 rounded-full border-2 ${form.color === c ? 'border-gray-900' : 'border-transparent'}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-violet-100 bg-violet-50/40 p-3 space-y-2">
          <p className="text-xs font-semibold text-violet-900 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> Phạm vi công ty (App Switcher)
          </p>
          <label className="flex items-center gap-2 text-xs text-gray-800 cursor-pointer">
            <input
              type="checkbox"
              checked={form.shared_all}
              onChange={(e) => setForm((f) => ({
                ...f,
                shared_all: e.target.checked,
                company_ids: e.target.checked ? [] : (user?.company_id ? [String(user.company_id)] : []),
              }))}
            />
            Dùng chung mọi công ty
          </label>
          {!form.shared_all && (
            <div className="grid gap-1.5 sm:grid-cols-2 max-h-40 overflow-y-auto">
              {companies.map((c) => {
                const id = String(c.id);
                const on = (form.company_ids || []).includes(id);
                return (
                  <label
                    key={id}
                    className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg border cursor-pointer ${
                      on ? 'border-violet-300 bg-white' : 'border-gray-100 bg-white/60'
                    }`}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggleCompany(id)} />
                    <span className="truncate font-medium">{c.short_name || c.name}</span>
                  </label>
                );
              })}
              {companies.length === 0 && (
                <p className="text-[11px] text-gray-500 col-span-full">Chưa tải được danh sách công ty.</p>
              )}
            </div>
          )}
        </div>

        <label className="text-xs text-gray-600 space-y-1 block">
          <span>Mô tả</span>
          <textarea
            className="w-full px-2 py-1.5 border rounded-lg text-sm"
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="h-9 px-4 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Tạo module
        </button>
      </form>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 py-10 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" /> Đang tải…
        </div>
      ) : modules.length === 0 ? (
        <p className="text-sm text-gray-500">Chưa có module tùy chỉnh.</p>
      ) : (
        <div className="space-y-2">
          {modules.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5"
            >
              <span
                className="h-9 w-9 rounded-lg flex items-center justify-center text-lg shrink-0 overflow-hidden bg-white ring-1 ring-black/5"
                style={{ background: m.icon_image ? '#fff' : `${m.color || '#4f46e5'}22` }}
              >
                {m.icon_image ? (
                  <img src={m.icon_image} alt="" className="h-7 w-7 object-contain" />
                ) : (
                  m.icon || '📦'
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">{m.name}</p>
                <p className="text-[11px] text-gray-500 font-mono">/m/{m.module_key}</p>
                <p className="text-[10px] text-violet-700 mt-0.5">
                  {m.category || 'Tùy chỉnh'}
                  {' · '}
                  {m.shared_all || !(m.company_ids || []).length
                    ? 'Dùng chung mọi công ty'
                    : `Công ty: ${(m.company_ids || []).map(companyLabel).join(', ')}`}
                </p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${m.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                {m.is_active ? 'Đang bật' : 'Đã tắt'}
              </span>
              <button
                type="button"
                onClick={() => toggleActive(m)}
                className="text-gray-500 hover:text-gray-800"
                title={m.is_active ? 'Tắt' : 'Bật'}
              >
                {m.is_active ? <ToggleRight className="h-5 w-5 text-emerald-600" /> : <ToggleLeft className="h-5 w-5" />}
              </button>
              <Link
                to={`/ecosystem/app-modules/${m.module_key}`}
                className="h-8 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 hover:bg-gray-50"
              >
                <Settings className="h-3.5 w-3.5" /> Cấu hình
              </Link>
              <Link
                to={`/m/${m.module_key}`}
                className="h-8 px-2.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100"
              >
                Mở Kanban
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
