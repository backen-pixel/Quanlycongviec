import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isCompanyScopedAdmin } from '../lib/adminRole';
import {
  Bell, Building2, Check, Copy, ExternalLink, MapPin, Pencil, Plus, RefreshCw, Save, Send, Trash2,
} from 'lucide-react';

const MODULES = [
  { v: 'crm', l: 'CRM' },
  { v: 'production', l: 'Sản xuất (SX)' },
  { v: 'logistics', l: 'Vận chuyển / Lắp đặt (VC)' },
];

const STATUSES = [
  { v: 'overdue', l: 'Quá hạn' },
  { v: 'upcoming', l: 'Sắp hạn' },
  { v: 'all', l: 'Quá hạn + sắp hạn' },
];

const PUBLIC_API_ORIGIN = 'https://tubep-backend.onrender.com';
const API_BASE = `${PUBLIC_API_ORIGIN}/api/external`;

function moduleBadgeClass(mod) {
  if (mod === 'production') return 'bg-amber-50 text-amber-800';
  if (mod === 'logistics') return 'bg-sky-50 text-sky-800';
  return 'bg-violet-50 text-violet-800';
}

function buildQuery({ status, daysAhead, modules, companyIds, regionIds }) {
  const qs = new URLSearchParams();
  qs.set('status', status || 'overdue');
  qs.set('days_ahead', String(status === 'overdue' ? 0 : (daysAhead ?? 7)));
  qs.set('limit', '200');
  if (modules.length && modules.length < MODULES.length) qs.set('modules', modules.join(','));
  if (companyIds.length) qs.set('company_ids', companyIds.join(','));
  if (regionIds.length) qs.set('region_ids', regionIds.join(','));
  return qs.toString();
}

function apiUrlForConfig(id) {
  if (!id) return `${API_BASE}/project-deadlines`;
  return `${API_BASE}/project-deadlines?config_id=${encodeURIComponent(id)}`;
}

function summarizeConfig(cfg, companies = []) {
  if (!cfg) return '—';
  const modLabels = (cfg.modules || [])
    .map((v) => MODULES.find((m) => m.v === v)?.l || v)
    .join(', ') || 'Tất cả khối';
  const statusLabel = STATUSES.find((s) => s.v === cfg.status)?.l || cfg.status;
  let co = 'Tất cả công ty';
  if (cfg.company_ids?.length === 1) {
    const c = companies.find((x) => String(x.id) === String(cfg.company_ids[0]));
    co = c?.short_name || c?.name || '1 công ty';
  } else if (cfg.company_ids?.length) {
    co = `${cfg.company_ids.length} công ty`;
  }
  const rg = cfg.region_ids?.length ? `${cfg.region_ids.length} khu vực` : 'Tất cả khu vực';
  return `${modLabels} · ${statusLabel} · ${co} · ${rg}`;
}

function emptyForm() {
  return {
    name: '',
    companyIds: [],
    regionIds: [],
    allCompanies: true,
    allRegions: true,
    modules: ['crm', 'production', 'logistics'],
    status: 'overdue',
    daysAhead: 7,
    zaloEnabled: false,
    zaloBotToken: '',
    zaloChatId: '',
    zaloTokenSet: false,
    zaloTokenHint: '',
  };
}

export default function ProjectDeadlineDispatchPage() {
  const { user } = useAuth();
  const companyLocked = isCompanyScopedAdmin(user);

  const [companies, setCompanies] = useState([]);
  const [regions, setRegions] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null); // null = tạo mới
  const [form, setForm] = useState(emptyForm());
  const [configLoaded, setConfigLoaded] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState('');
  const [items, setItems] = useState([]);
  const [previewMeta, setPreviewMeta] = useState(null);

  const scopedCompanyId = user?.company_id ? String(user.company_id) : '';
  const companyIdList = useMemo(() => companies.map((c) => String(c.id)).filter(Boolean), [companies]);
  const regionIdList = useMemo(() => regions.map((r) => String(r.id)).filter(Boolean), [regions]);
  const allCompaniesChecked = form.allCompanies
    || (companyIdList.length > 0 && companyIdList.every((id) => form.companyIds.includes(id)));
  const allRegionsChecked = form.allRegions
    || (regionIdList.length > 0 && regionIdList.every((id) => form.regionIds.includes(id)));

  const selected = useMemo(
    () => configs.find((c) => String(c.id) === String(selectedId)) || null,
    [configs, selectedId],
  );

  useEffect(() => {
    api.get('/companies')
      .then((r) => {
        const list = r.data?.companies || r.data || [];
        setCompanies(Array.isArray(list) ? list : []);
      })
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    const ids = companyLocked && scopedCompanyId
      ? [scopedCompanyId]
      : (form.allCompanies || !form.companyIds.length ? companyIdList : form.companyIds);
    if (!ids.length) { setRegions([]); return; }
    let cancelled = false;
    api.get('/crm/company-regions', { params: { company_ids: ids.join(',') } })
      .then((r) => {
        if (cancelled) return;
        const rows = Array.isArray(r.data) ? r.data : (r.data?.regions || []);
        setRegions(rows);
      })
      .catch(() => { if (!cancelled) setRegions([]); });
    return () => { cancelled = true; };
  }, [companyLocked, scopedCompanyId, form.companyIds, form.allCompanies, companyIdList]);

  const loadPreview = useCallback(async (cfg) => {
    if (!cfg) {
      setItems([]);
      setPreviewMeta(null);
      return;
    }
    setPreviewing(true);
    setErr(null);
    try {
      const qs = buildQuery({
        status: cfg.status,
        daysAhead: cfg.days_ahead,
        modules: cfg.modules || [],
        companyIds: cfg.company_ids || [],
        regionIds: cfg.region_ids || [],
      });
      const { data } = await api.get('/dashboard/project-deadlines', {
        params: Object.fromEntries(new URLSearchParams(qs)),
      });
      setItems(data?.notifications || []);
      setPreviewMeta({
        count: data?.count || 0,
        truncated: data?.truncated,
        name: cfg.name,
        id: cfg.id,
      });
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setPreviewing(false);
    }
  }, []);

  const applyFormFromConfig = useCallback((cfg, coList = companyIdList, rgList = regionIdList) => {
    const co = Array.isArray(cfg?.company_ids) ? cfg.company_ids.map(String) : [];
    const rg = Array.isArray(cfg?.region_ids) ? cfg.region_ids.map(String) : [];
    const allCompanies = !co.length;
    const allRegions = !rg.length;
    setForm({
      name: cfg?.name || '',
      companyIds: allCompanies
        ? [...coList]
        : co.filter((id) => !coList.length || coList.includes(id)),
      regionIds: allRegions
        ? [...rgList]
        : rg.filter((id) => !rgList.length || rgList.includes(id)),
      allCompanies,
      allRegions,
      modules: Array.isArray(cfg?.modules) && cfg.modules.length
        ? cfg.modules.filter(Boolean)
        : ['crm', 'production', 'logistics'],
      status: cfg?.status || 'overdue',
      daysAhead: cfg?.days_ahead ?? 7,
      zaloEnabled: !!cfg?.zalo_enabled,
      zaloBotToken: '',
      zaloChatId: cfg?.zalo_chat_id || '',
      zaloTokenSet: !!cfg?.zalo_bot_token_set,
      zaloTokenHint: cfg?.zalo_bot_token_hint || '',
    });
  }, [companyIdList, regionIdList]);

  const loadConfigs = async ({ selectId } = {}) => {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await api.get('/dashboard/project-deadlines/configs');
      const list = Array.isArray(data?.configs) ? data.configs : [];
      setConfigs(list);
      setConfigLoaded(true);
      const pick = selectId
        ? list.find((c) => String(c.id) === String(selectId))
        : (list.find((c) => String(c.id) === String(selectedId)) || list[0] || null);
      if (pick) {
        setSelectedId(pick.id);
        setEditingId(pick.id);
        applyFormFromConfig(pick);
        await loadPreview(pick);
      } else {
        setSelectedId(null);
        setEditingId(null);
        setForm(emptyForm());
        setItems([]);
        setPreviewMeta(null);
      }
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
      setConfigLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadConfigs(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Khi danh sách công ty/khu vực tải xong: giữ “tất cả” bằng cách tick đủ checkbox
  useEffect(() => {
    if (!configLoaded || !companyIdList.length) return;
    if (companyLocked && scopedCompanyId) {
      setForm((prev) => ({
        ...prev,
        allCompanies: false,
        companyIds: [scopedCompanyId],
      }));
      return;
    }
    setForm((prev) => {
      if (prev.allCompanies) {
        const same = prev.companyIds.length === companyIdList.length
          && companyIdList.every((id) => prev.companyIds.includes(id));
        if (same) return prev;
        return { ...prev, companyIds: [...companyIdList] };
      }
      const next = prev.companyIds.filter((id) => companyIdList.includes(id));
      if (next.length === prev.companyIds.length) return prev;
      return { ...prev, companyIds: next };
    });
  }, [configLoaded, companyIdList, companyLocked, scopedCompanyId]);

  useEffect(() => {
    if (!configLoaded || !regionIdList.length) return;
    setForm((prev) => {
      if (prev.allRegions) {
        const same = prev.regionIds.length === regionIdList.length
          && regionIdList.every((id) => prev.regionIds.includes(id));
        if (same) return prev;
        return { ...prev, regionIds: [...regionIdList] };
      }
      const next = prev.regionIds.filter((id) => regionIdList.includes(id));
      if (next.length === prev.regionIds.length) return prev;
      return { ...prev, regionIds: next };
    });
  }, [configLoaded, regionIdList]);

  const effectiveCompanyIds = (form.allCompanies || allCompaniesChecked) ? [] : form.companyIds;
  const effectiveRegionIds = (form.allRegions || allRegionsChecked) ? [] : form.regionIds;

  const selectedUrl = selected ? apiUrlForConfig(selected.id) : '';
  const selectedCurl = selected ? `curl -s "${selectedUrl}"` : '';

  const startCreate = () => {
    setEditingId(null);
    setSelectedId(null);
    setForm({
      ...emptyForm(),
      name: `API ${configs.length + 1}`,
      companyIds: companyLocked && scopedCompanyId ? [scopedCompanyId] : [...companyIdList],
      regionIds: [...regionIdList],
      allCompanies: !(companyLocked && scopedCompanyId),
      allRegions: true,
    });
    setItems([]);
    setPreviewMeta(null);
    setMsg(null);
  };

  const selectConfig = async (cfg) => {
    setSelectedId(cfg.id);
    setEditingId(cfg.id);
    applyFormFromConfig(cfg);
    setMsg(null);
    await loadPreview(cfg);
  };

  const save = async () => {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const body = {
        name: (form.name || '').trim() || 'API mới',
        company_ids: effectiveCompanyIds,
        region_ids: effectiveRegionIds,
        modules: form.modules,
        status: form.status,
        days_ahead: form.status === 'overdue' ? 0 : form.daysAhead,
        zalo_enabled: !!form.zaloEnabled,
        zalo_chat_id: (form.zaloChatId || '').trim(),
      };
      if ((form.zaloBotToken || '').trim()) {
        body.zalo_bot_token = form.zaloBotToken.trim();
      }
      let saved;
      if (editingId) {
        const { data } = await api.put(`/dashboard/project-deadlines/configs/${encodeURIComponent(editingId)}`, body);
        saved = data;
        setMsg('Đã cập nhật cấu hình API.');
      } else {
        const { data } = await api.post('/dashboard/project-deadlines/configs', body);
        saved = data;
        setMsg('Đã tạo cấu hình API mới.');
      }
      setConfigs((prev) => {
        const idx = prev.findIndex((c) => String(c.id) === String(saved.id));
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved];
      });
      setSelectedId(saved.id);
      setEditingId(saved.id);
      applyFormFromConfig(saved);
      await loadPreview(saved);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const sendZalo = async (cfg) => {
    const id = cfg?.id || editingId;
    if (!id) return;
    setSending(true);
    setErr(null);
    setMsg(null);
    try {
      const { data } = await api.post(`/dashboard/project-deadlines/configs/${encodeURIComponent(id)}/send`, {
        force: false,
      });
      if (data?.skipped) {
        setErr(data.error || data.reason || 'Không gửi được');
      } else {
        setMsg(`Đã gửi Zalo: ${data?.sent || 0} tin mới${data?.failed ? `, lỗi ${data.failed}` : ''}${data?.skipped_dup ? ` (bỏ qua ${data.skipped_dup} đã gửi)` : ''}.`);
      }
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setSending(false);
    }
  };

  const remove = async (cfg) => {
    if (!cfg?.id) return;
    if (!window.confirm(`Xóa cấu hình «${cfg.name}»?`)) return;
    setErr(null);
    setMsg(null);
    try {
      const { data } = await api.delete(`/dashboard/project-deadlines/configs/${cfg.id}`);
      setConfigs(data?.configs || []);
      setMsg('Đã xóa cấu hình.');
      const next = (data?.configs || [])[0] || null;
      if (next) await selectConfig(next);
      else {
        setSelectedId(null);
        setEditingId(null);
        setForm(emptyForm());
        setItems([]);
        setPreviewMeta(null);
      }
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    }
  };

  const copy = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  const toggleCompany = (id) => {
    setForm((prev) => {
      const companyIds = prev.companyIds.includes(id)
        ? prev.companyIds.filter((x) => x !== id)
        : [...prev.companyIds, id];
      const allCompanies = companyIdList.length > 0
        && companyIdList.every((x) => companyIds.includes(x));
      return { ...prev, companyIds, allCompanies };
    });
  };

  const toggleRegion = (id) => {
    setForm((prev) => {
      const regionIds = prev.regionIds.includes(id)
        ? prev.regionIds.filter((x) => x !== id)
        : [...prev.regionIds, id];
      const allRegions = regionIdList.length > 0
        && regionIdList.every((x) => regionIds.includes(x));
      return { ...prev, regionIds, allRegions };
    });
  };

  const toggleModule = (v) => {
    setForm((prev) => {
      if (prev.modules.includes(v)) {
        const next = prev.modules.filter((x) => x !== v);
        return { ...prev, modules: next.length ? next : prev.modules };
      }
      return { ...prev, modules: [...prev.modules, v] };
    });
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-start gap-3 mb-5">
        <div className="h-10 w-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
          <Bell className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Cảnh báo hạn công trình</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Tạo nhiều API (mỗi bộ lọc một URL). Gắn Zalo Bot Token + Chat ID để hệ thống tự gửi tin quá hạn, hoặc bấm «Gửi Zalo ngay».
          </p>
        </div>
      </div>

      {err && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}
      {msg && <div className="mb-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{msg}</div>}

      {/* Danh sách API đã cấu hình */}
      <div className="bg-white rounded-xl border p-4 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-gray-900">API đã cấu hình</h2>
          <button type="button" onClick={startCreate}
            className="h-9 px-3 bg-blue-600 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer">
            <Plus className="h-3.5 w-3.5" /> Tạo API mới
          </button>
        </div>
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Tên</th>
                <th className="text-left px-3 py-2 font-medium">Phạm vi</th>
                <th className="text-left px-3 py-2 font-medium">Zalo</th>
                <th className="text-left px-3 py-2 font-medium">URL</th>
                <th className="text-left px-3 py-2 font-medium w-44">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {!configs.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                    {loading ? 'Đang tải…' : 'Chưa có API. Bấm «Tạo API mới».'}
                  </td>
                </tr>
              )}
              {configs.map((cfg) => {
                const url = apiUrlForConfig(cfg.id);
                const active = String(cfg.id) === String(selectedId);
                return (
                  <tr
                    key={cfg.id}
                    className={`border-t cursor-pointer ${active ? 'bg-orange-50/80' : 'hover:bg-gray-50'}`}
                    onClick={() => selectConfig(cfg)}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{cfg.name}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{cfg.id}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">{summarizeConfig(cfg, companies)}</td>
                    <td className="px-3 py-2 text-xs">
                      {cfg.zalo_bot_token_set ? (
                        <div>
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.zalo_enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                            {cfg.zalo_enabled ? 'Tự gửi' : 'Đã gắn'}
                          </span>
                          <div className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[120px]">
                            {cfg.zalo_bot_token_hint} · {cfg.zalo_chat_id || '—'}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">Chưa gắn</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <code className="text-[10px] text-gray-600 break-all">{url}</code>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                        <button type="button" title="Sửa" onClick={() => selectConfig(cfg)}
                          className="h-8 w-8 border rounded-lg inline-flex items-center justify-center hover:bg-gray-50 cursor-pointer">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" title="Gửi Zalo ngay" onClick={() => sendZalo(cfg)} disabled={sending || !cfg.zalo_bot_token_set}
                          className="h-8 w-8 border rounded-lg inline-flex items-center justify-center hover:bg-sky-50 text-sky-700 disabled:opacity-40 cursor-pointer">
                          <Send className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" title="Copy URL" onClick={() => copy(url, `u-${cfg.id}`)}
                          className="h-8 w-8 border rounded-lg inline-flex items-center justify-center hover:bg-gray-50 cursor-pointer">
                          {copied === `u-${cfg.id}` ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                        <button type="button" title="Xóa" onClick={() => remove(cfg)}
                          className="h-8 w-8 border rounded-lg inline-flex items-center justify-center hover:bg-red-50 text-red-600 cursor-pointer">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form tạo / sửa */}
      <div className="bg-white rounded-xl border p-4 mb-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900">
            {editingId ? `Chỉnh sửa: ${form.name || editingId}` : 'Tạo API mới'}
          </h2>
          {editingId && (
            <span className="text-[11px] text-gray-400 font-mono">{editingId}</span>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Tên API</label>
          <input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="VD: VPT CRM quá hạn"
            className="w-full h-10 px-3 border rounded-lg text-sm"
          />
        </div>

        <div className="rounded-lg border border-sky-100 bg-sky-50/50 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-sky-900">Zalo Bot — gửi tin khi quá hạn</div>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Backend gọi <code className="bg-white/80 px-1 rounded">POST …/bot{'{TOKEN}'}/sendMessage</code> với <code className="bg-white/80 px-1 rounded">parse_mode: markdown</code> và field <code className="bg-white/80 px-1 rounded">text</code>.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={form.zaloEnabled}
                onChange={(e) => setForm((p) => ({ ...p, zaloEnabled: e.target.checked }))}
              />
              Tự gửi (cron ~30′)
            </label>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1">Bot Token</label>
            <input
              type="password"
              autoComplete="off"
              value={form.zaloBotToken}
              onChange={(e) => setForm((p) => ({ ...p, zaloBotToken: e.target.value }))}
              placeholder={form.zaloTokenSet ? `Đã lưu ${form.zaloTokenHint} — nhập mới để thay` : 'YOUR_BOT_TOKEN'}
              className="w-full h-10 px-3 border rounded-lg text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1">Chat ID</label>
            <input
              value={form.zaloChatId}
              onChange={(e) => setForm((p) => ({ ...p, zaloChatId: e.target.value }))}
              placeholder="CHAT_ID (có thể nhiều, cách nhau dấu phẩy)"
              className="w-full h-10 px-3 border rounded-lg text-sm bg-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-2">Khối (module) — chọn nhiều</label>
          <div className="flex flex-wrap gap-3">
            {MODULES.map((m) => (
              <label key={m.v} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.modules.includes(m.v)} onChange={() => toggleModule(m.v)} />
                {m.l}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> Công ty — chọn nhiều
          </label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={allCompaniesChecked}
                disabled={companyLocked}
                onChange={(e) => setForm((p) => ({
                  ...p,
                  allCompanies: e.target.checked,
                  companyIds: e.target.checked ? [...companyIdList] : [],
                }))}
              />
              Tất cả công ty
            </label>
            <div className="max-h-52 overflow-auto border rounded-lg p-2 grid sm:grid-cols-2 gap-1">
              {!companies.length && (
                <p className="text-xs text-gray-400 col-span-2 px-1">{loading ? 'Đang tải…' : 'Không có công ty'}</p>
              )}
              {companies.map((c) => {
                const id = String(c.id);
                return (
                  <label key={id} className="flex items-center gap-2 text-sm px-1 py-1 rounded hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.companyIds.includes(id)}
                      disabled={companyLocked}
                      onChange={() => toggleCompany(id)}
                    />
                    <span className="truncate">{c.short_name || c.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" /> Khu vực — chọn nhiều
          </label>
          <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allRegionsChecked}
              onChange={(e) => setForm((p) => ({
                ...p,
                allRegions: e.target.checked,
                regionIds: e.target.checked ? [...regionIdList] : [],
              }))}
            />
            Tất cả khu vực
          </label>
          <div className="max-h-52 overflow-auto border rounded-lg p-2 grid sm:grid-cols-2 gap-1">
            {!regions.length && (
              <p className="text-xs text-gray-400 col-span-2 px-1">
                {(form.allCompanies || form.companyIds.length)
                  ? 'Công ty đang chọn chưa có khu vực.'
                  : 'Chọn công ty để hiện khu vực.'}
              </p>
            )}
            {regions.map((rg) => {
              const id = String(rg.id);
              return (
                <label key={id} className="flex items-center gap-2 text-sm px-1 py-1 rounded hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.regionIds.includes(id)}
                    onChange={() => toggleRegion(id)}
                  />
                  <span className="truncate">{rg.name || rg.code || id}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Trạng thái hạn</label>
            <select
              value={form.status}
              onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
              className="w-full h-10 px-3 border rounded-lg text-sm"
            >
              {STATUSES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
            </select>
          </div>
          {form.status !== 'overdue' && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Sắp hạn trong (ngày)</label>
              <input
                type="number"
                min={0}
                max={90}
                value={form.daysAhead}
                onChange={(e) => setForm((p) => ({ ...p, daysAhead: Number(e.target.value) || 0 }))}
                className="w-full h-10 px-3 border rounded-lg text-sm"
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={save} disabled={saving || loading}
            className="h-10 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer">
            <Save className="h-4 w-4" /> {saving ? 'Đang lưu…' : (editingId ? 'Lưu thay đổi' : 'Tạo API')}
          </button>
          {editingId && (
            <button type="button" onClick={() => sendZalo({ id: editingId, zalo_bot_token_set: form.zaloTokenSet || !!form.zaloBotToken })}
              disabled={sending || saving || (!form.zaloTokenSet && !form.zaloBotToken.trim())}
              className="h-10 px-4 bg-sky-600 text-white rounded-lg text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer">
              <Send className="h-4 w-4" /> {sending ? 'Đang gửi…' : 'Gửi Zalo ngay'}
            </button>
          )}
          {editingId && (
            <button type="button" onClick={startCreate}
              className="h-10 px-4 border rounded-lg text-sm inline-flex items-center gap-2 cursor-pointer hover:bg-gray-50">
              <Plus className="h-4 w-4" /> Tạo cái khác
            </button>
          )}
        </div>
      </div>

      {/* URL + preview của API đang chọn */}
      {selected && (
        <div className="bg-white rounded-xl border p-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">
            URL API: {selected.name}
          </h2>
          <p className="text-[11px] text-gray-500 mb-2">
            Không cần token. Mặc định <code className="bg-gray-100 px-1 rounded">only_new=1</code>: mỗi lần gọi chỉ trả mục chưa gửi;
            lần gọi đó cũng đánh dấu đã giao nên lần sau không lặp. Xem toàn bộ: thêm <code className="bg-gray-100 px-1 rounded">only_new=0</code>.
          </p>
          <pre className="text-[11px] bg-slate-950 text-slate-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{selectedCurl}</pre>
          <div className="flex flex-wrap gap-2 mt-2">
            <button type="button" onClick={() => copy(selectedCurl, 'curl')}
              className="h-9 px-3 border rounded-lg text-xs inline-flex items-center gap-1 cursor-pointer hover:bg-gray-50">
              {copied === 'curl' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              Copy curl
            </button>
            <button type="button" onClick={() => copy(selectedUrl, 'url')}
              className="h-9 px-3 border rounded-lg text-xs inline-flex items-center gap-1 cursor-pointer hover:bg-gray-50">
              {copied === 'url' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              Copy URL
            </button>
            <a href={selectedUrl} target="_blank" rel="noreferrer"
              className="h-9 px-3 border rounded-lg text-xs inline-flex items-center gap-1 hover:bg-gray-50">
              Mở API <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border p-4 mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button
            type="button"
            onClick={() => loadPreview(selected)}
            disabled={previewing || !selected}
            className="h-10 px-4 bg-gray-900 text-white rounded-lg text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${previewing ? 'animate-spin' : ''}`} />
            Tải lại danh sách
          </button>
          <span className="text-xs text-gray-500">
            {previewMeta
              ? `${previewMeta.count} mục · ${previewMeta.name || ''} (xem trước đầy đủ, không đánh dấu đã gửi)${previewMeta.truncated ? ' (cắt limit)' : ''}`
              : 'Chọn một API ở bảng trên để xem danh sách'}
          </span>
        </div>
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Mã / tên</th>
                <th className="text-left px-3 py-2 font-medium">Module</th>
                <th className="text-left px-3 py-2 font-medium">Hạn</th>
                <th className="text-left px-3 py-2 font-medium">Người</th>
                <th className="text-left px-3 py-2 font-medium">Link</th>
              </tr>
            </thead>
            <tbody>
              {!items.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                    {previewing || loading
                      ? 'Đang tải…'
                      : selected
                        ? 'Không có hạn trong cấu hình này.'
                        : 'Chọn hoặc tạo API để xem danh sách.'}
                  </td>
                </tr>
              )}
              {items.map((n, i) => (
                <tr key={`${n.project?.id}-${n.deadline?.module}-${n.deadline?.source}-${i}`} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{n.project?.code || n.deal?.code || '—'}</div>
                    <div className="text-xs text-gray-500 truncate max-w-[220px]">{n.project?.name || n.deal?.title}</div>
                    {n.project?.status_label && (
                      <div className="text-[10px] text-gray-400">{n.project.status_label}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${moduleBadgeClass(n.deadline?.module)}`}>
                      {n.links?.label || n.deadline?.module}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div>{n.deadline?.label}</div>
                    <div className={`text-xs ${n.deadline?.is_overdue ? 'text-red-600' : 'text-gray-500'}`}>{n.deadline?.at_vi}</div>
                  </td>
                  <td className="px-3 py-2">{n.responsible?.full_name || 'Chưa gán'}</td>
                  <td className="px-3 py-2">
                    {n.links?.url ? (
                      <a href={n.links.url} target="_blank" rel="noreferrer" className="text-blue-600 inline-flex items-center gap-0.5 text-xs">
                        Mở <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
