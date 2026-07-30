import { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import {
  Loader2, Plus, Trash2, Save, Columns3, ListChecks, Building2, LayoutList,
  Settings, RefreshCw,
} from 'lucide-react';
import AppModuleTaskTemplatesPanel from '../components/AppModuleTaskTemplatesPanel';
import AppModulePipelinePanel from '../components/AppModulePipelinePanel';

const SETTINGS_TABS = [
  { key: 'pipeline', label: 'Giai đoạn', Icon: Columns3 },
  { key: 'templates', label: 'Bộ nhiệm vụ', Icon: ListChecks },
  { key: 'tabs', label: 'Tab Lead/Deal', Icon: LayoutList },
  { key: 'companies', label: 'Công ty', Icon: Building2 },
];

const VALID_SETTINGS_TABS = new Set(SETTINGS_TABS.map((t) => t.key));

export default function AppModuleSettingsPage() {
  const { moduleKey } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const tabFromUrl = searchParams.get('tab');
  const [settingsTab, setSettingsTab] = useState(
    () => (VALID_SETTINGS_TABS.has(tabFromUrl) ? tabFromUrl : 'pipeline'),
  );

  useEffect(() => {
    if (VALID_SETTINGS_TABS.has(tabFromUrl) && tabFromUrl !== settingsTab) {
      setSettingsTab(tabFromUrl);
    }
  }, [tabFromUrl, settingsTab]);

  const selectSettingsTab = (key) => {
    setSettingsTab(key);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (key && key !== 'pipeline') next.set('tab', key);
      else next.delete('tab');
      return next;
    }, { replace: true });
  };
  const [mod, setMod] = useState(null);
  const [pipelineTabs, setPipelineTabs] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  const [sharedAll, setSharedAll] = useState(false);
  const [savingCompanies, setSavingCompanies] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [newTab, setNewTab] = useState({ name: '', tab_key: '', icon: '📋' });

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const [mRes, tabRes, coRes] = await Promise.all([
        api.get(`/app-modules/${moduleKey}`),
        api.get(`/app-modules/${moduleKey}/tabs`),
        api.get('/companies').catch(() => ({ data: { companies: [] } })),
      ]);
      const module = mRes.data.module;
      setMod(module);
      setPipelineTabs(tabRes.data.tabs || []);
      const cos = coRes.data?.companies || coRes.data || [];
      setCompanies(Array.isArray(cos) ? cos : []);
      const ids = (module?.company_ids || []).map(String);
      setSelectedCompanyIds(ids);
      setSharedAll(!!module?.shared_all || ids.length === 0);
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    }
    setLoading(false);
  }, [moduleKey]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const addPipelineTab = async (e) => {
    e.preventDefault();
    if (!newTab.name.trim()) return;
    try {
      const { data } = await api.post(`/app-modules/${moduleKey}/tabs`, {
        name: newTab.name.trim(),
        tab_key: newTab.tab_key.trim() || undefined,
        icon: newTab.icon || '📋',
        seed_stages: true,
      });
      setNewTab({ name: '', tab_key: '', icon: '📋' });
      await load();
      setMessage(`Đã thêm tab «${data.tab.name}» với 3 cột mặc định.`);
      selectSettingsTab('pipeline');
    } catch (err) {
      setMessage(err.response?.data?.error || err.message);
    }
  };

  const savePipelineTab = async (tab, patch) => {
    try {
      await api.put(`/app-modules/${moduleKey}/tabs/${tab.id}`, patch);
      await load();
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    }
  };

  const deletePipelineTab = async (tab) => {
    if (pipelineTabs.length <= 1) {
      setMessage('Cần giữ ít nhất một tab.');
      return;
    }
    if (!confirm(`Xóa tab «${tab.name}»? Cột và bản ghi sẽ chuyển sang tab còn lại.`)) return;
    try {
      await api.delete(`/app-modules/${moduleKey}/tabs/${tab.id}`);
      await load();
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    }
  };

  const toggleCompanyId = (id) => {
    const sid = String(id);
    setSharedAll(false);
    setSelectedCompanyIds((prev) => (
      prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]
    ));
  };

  const saveCompanies = async () => {
    if (!sharedAll && !selectedCompanyIds.length) {
      setMessage('Chọn ít nhất một công ty hoặc bật dùng chung mọi công ty.');
      return;
    }
    setSavingCompanies(true);
    setMessage('');
    try {
      await api.put(`/app-modules/${moduleKey}`, {
        company_ids: sharedAll ? [] : selectedCompanyIds,
        shared_all: sharedAll,
      });
      setMessage('Đã lưu phạm vi công ty — App Switcher sẽ cập nhật theo công ty được chọn.');
      await load();
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    }
    setSavingCompanies(false);
  };

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-sm text-gray-600">Chỉ admin được cấu hình.</div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Đang tải…
      </div>
    );
  }

  if (!mod) {
    return (
      <div className="p-8 text-center text-sm text-gray-600">
        Không tìm thấy module. <Link to="/ecosystem/app-modules" className="text-blue-600">← Danh sách</Link>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-white">
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Settings className="w-6 h-6 text-violet-600 shrink-0" strokeWidth={1.75} />
            <div>
              <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                <span style={{ color: mod.color }}>{mod.icon || '📦'}</span>
                Cài đặt Pipeline — {mod.name}
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Quản lý giai đoạn, bộ nhiệm vụ mẫu và phạm vi công ty — bố cục giống Lead / Deal CRM
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/ecosystem/app-modules/${mod.module_key}?tab=templates`}
              className="h-8 px-3 text-xs font-medium text-violet-700 hover:text-violet-900 border border-violet-200 rounded-lg bg-white inline-flex items-center gap-1.5"
            >
              <ListChecks className="h-3.5 w-3.5" /> Bộ mẫu nhiệm vụ
            </Link>
            <Link
              to={`/m/${mod.module_key}`}
              className="h-8 px-3 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg bg-white inline-flex items-center"
            >
              ← Dashboard
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-violet-200 bg-violet-50/30 px-4 py-3 flex flex-wrap gap-3 items-end shadow-sm">
          <div className="flex flex-col gap-1 text-[10px] text-violet-800 min-w-[180px]">
            <span className="font-semibold uppercase tracking-wide">Module</span>
            <div className="h-8 px-2.5 rounded-lg border border-violet-200 bg-white text-xs font-semibold text-gray-900 inline-flex items-center gap-1.5">
              <span>{mod.icon || '📦'}</span>
              {mod.name}
              <span className="font-mono font-normal text-gray-400">/{mod.module_key}</span>
            </div>
          </div>
          <div className="flex flex-col gap-1 text-[10px] text-violet-800 min-w-[140px]">
            <span className="font-semibold uppercase tracking-wide">Số tab</span>
            <div className="h-8 px-2.5 rounded-lg border border-violet-200 bg-white text-xs text-gray-800 inline-flex items-center">
              {pipelineTabs.length} tab pipeline
            </div>
          </div>
          <button
            type="button"
            onClick={() => load()}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 cursor-pointer"
            title="Tải lại"
          >
            <RefreshCw className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        {message && (
          <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{message}</div>
        )}

        <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
          {SETTINGS_TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => selectSettingsTab(key)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px whitespace-nowrap transition-colors cursor-pointer ${
                settingsTab === key
                  ? 'border-violet-600 text-violet-700'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={2} />
              {label}
            </button>
          ))}
        </div>

        {settingsTab === 'pipeline' && (
          <AppModulePipelinePanel
            moduleKey={moduleKey}
            mod={mod}
            tabs={pipelineTabs}
          />
        )}

        {settingsTab === 'templates' && (
          <AppModuleTaskTemplatesPanel
            moduleKey={moduleKey}
            mod={mod}
            tabs={pipelineTabs}
          />
        )}

        {settingsTab === 'tabs' && (
          <div className="space-y-3 max-w-3xl">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
              <h2 className="text-xs font-semibold text-gray-900 flex items-center gap-2">
                <LayoutList className="w-4 h-4 text-violet-600" strokeWidth={2} />
                Tab pipeline (giống Lead / Deal CRM)
              </h2>
              <p className="text-[11px] text-gray-500">
                Mỗi tab có pipeline cột riêng. Thêm Lead / Deal rồi vào «Giai đoạn» để cấu hình.
              </p>
              <div className="space-y-2">
                {pipelineTabs.map((t) => (
                  <div key={t.id} className="rounded-xl border border-gray-200 bg-gray-50/40 p-3 flex flex-wrap gap-2 items-center">
                    <input
                      className="h-8 w-10 border rounded-lg text-center text-sm bg-white"
                      defaultValue={t.icon || '📋'}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== (t.icon || '📋')) savePipelineTab(t, { icon: v });
                      }}
                      title="Icon"
                    />
                    <input
                      className="h-8 px-2 border rounded-lg text-sm flex-1 min-w-[120px] bg-white"
                      defaultValue={t.name}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== t.name) savePipelineTab(t, { name: v });
                      }}
                    />
                    <span className="text-[10px] font-mono text-gray-400 px-1">{t.tab_key}</span>
                    <button
                      type="button"
                      onClick={() => selectSettingsTab('pipeline')}
                      className="h-8 px-2 rounded-lg text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200"
                    >
                      Giai đoạn →
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePipelineTab(t)}
                      className="text-red-500 hover:text-red-700 p-1"
                      disabled={pipelineTabs.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <form onSubmit={addPipelineTab} className="rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-3 space-y-2">
                <p className="text-xs font-semibold text-violet-800 flex items-center gap-1">
                  <Plus className="h-3.5 w-3.5" /> Thêm tab
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    className="h-8 px-2 border rounded-lg text-sm bg-white flex-1 min-w-[120px]"
                    placeholder="Tên (vd: Lead, Deal)"
                    value={newTab.name}
                    onChange={(e) => setNewTab((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                  <input
                    className="h-8 px-2 border rounded-lg text-sm bg-white w-28"
                    placeholder="key (lead)"
                    value={newTab.tab_key}
                    onChange={(e) => setNewTab((f) => ({ ...f, tab_key: e.target.value }))}
                  />
                  <input
                    className="h-8 w-12 border rounded-lg text-center text-sm bg-white"
                    value={newTab.icon}
                    onChange={(e) => setNewTab((f) => ({ ...f, icon: e.target.value }))}
                  />
                  <button type="submit" className="h-8 px-3 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700">
                    Thêm
                  </button>
                </div>
                <p className="text-[10px] text-gray-500">Tab mới tự tạo 3 cột: Tiếp nhận / Đang xử lý / Hoàn thành.</p>
              </form>
            </div>
          </div>
        )}

        {settingsTab === 'companies' && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4 shadow-sm max-w-2xl">
            <h2 className="text-xs font-semibold text-gray-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-violet-600" strokeWidth={2} />
              Phạm vi công ty
            </h2>
            <p className="text-[11px] text-gray-500">
              Module chỉ hiện trên App Switcher của user thuộc các công ty được chọn. Dùng chung = mọi công ty đều thấy.
            </p>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5 bg-gray-50/40 cursor-pointer">
              <div>
                <div className="text-xs font-semibold text-gray-900">Dùng chung mọi công ty</div>
                <div className="text-[10px] text-gray-500">Bật để bỏ giới hạn công ty</div>
              </div>
              <input
                type="checkbox"
                checked={sharedAll}
                onChange={(e) => {
                  setSharedAll(e.target.checked);
                  if (e.target.checked) setSelectedCompanyIds([]);
                }}
              />
            </label>
            {!sharedAll && (
              <div className="grid gap-1.5 sm:grid-cols-2 max-h-64 overflow-y-auto border rounded-xl p-2 bg-white">
                {companies.map((c) => {
                  const id = String(c.id);
                  const on = selectedCompanyIds.includes(id);
                  return (
                    <label
                      key={id}
                      className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg border cursor-pointer ${
                        on ? 'border-violet-300 bg-violet-50' : 'border-gray-100'
                      }`}
                    >
                      <input type="checkbox" checked={on} onChange={() => toggleCompanyId(id)} />
                      <span className="truncate font-medium">{c.short_name || c.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              onClick={saveCompanies}
              disabled={savingCompanies}
              className="h-8 px-3 rounded-lg bg-violet-700 text-white text-xs font-medium hover:bg-violet-800 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1"
            >
              {savingCompanies ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Lưu phạm vi công ty
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
