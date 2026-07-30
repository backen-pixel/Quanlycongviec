import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../lib/api';
import Modal from './Modal';
import {
  Plus, Trash2, Save, GripVertical, Trophy, XCircle, Eye, EyeOff,
  Pencil, Loader2, X, CheckCircle2, AlertTriangle, Tags, TrendingUp, ChevronRight,
} from 'lucide-react';

function PipelineMiniFlowBar({ stages, className = '' }) {
  const list = (stages || []).filter((s) => s.is_active !== false);
  if (!list.length) return null;
  return (
    <div
      className={`flex h-1.5 rounded-full overflow-hidden gap-px bg-gray-100 ${className}`}
      title="Toàn cảnh flow pipeline"
    >
      {list.map((s) => (
        <div
          key={s.id}
          className="flex-1 min-w-[3px]"
          style={{ backgroundColor: s.color || '#94A3B8' }}
        />
      ))}
    </div>
  );
}

function StageStatusBadges({ stage, transferTabs = [], moduleLinks = [] }) {
  const s = stage;
  const badges = [];
  if (s.is_done) badges.push({ key: 'done', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'Hoàn thành' });
  if (s.is_lost) badges.push({ key: 'lost', cls: 'bg-red-50 text-red-700 border-red-200', text: 'Hủy' });
  if (s.is_active === false) badges.push({ key: 'hidden', cls: 'bg-orange-50 text-orange-700 border-orange-200', text: 'Ẩn' });
  (transferTabs || []).forEach((t) => {
    badges.push({
      key: `tab-${t.id}`,
      cls: 'bg-sky-50 text-sky-700 border-sky-200',
      text: `→ ${t.name}`,
    });
  });
  (moduleLinks || []).forEach((l) => {
    if (l.link_type === 'transfer') {
      badges.push({
        key: `mod-t-${l.target_module_id}`,
        cls: 'bg-violet-50 text-violet-700 border-violet-200',
        text: `→ ${l.target_module?.name || 'Module'}`,
      });
    }
    if (l.link_type === 'notify') {
      badges.push({
        key: `mod-n-${l.target_module_id}`,
        cls: 'bg-amber-50 text-amber-700 border-amber-200',
        text: `🔔 ${l.target_module?.name || 'Module'}`,
      });
    }
  });
  if (!badges.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {badges.map((b) => (
        <span
          key={b.key}
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border text-[9px] font-medium ${b.cls}`}
        >
          {b.text}
        </span>
      ))}
    </div>
  );
}

const emptyForm = () => ({
  name: '',
  icon: '📋',
  color: '#4f46e5',
  is_active: true,
  is_done: false,
  is_lost: false,
});

/**
 * Pipeline setup UI — bố cục giống PipelineSettingsPage (CRM).
 */
export default function AppModulePipelinePanel({ moduleKey, mod, tabs = [] }) {
  const [allStages, setAllStages] = useState([]);
  const [otherModules, setOtherModules] = useState([]);
  const [stageLinks, setStageLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [addingTabId, setAddingTabId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm());

  const showToast = (text, kind = 'ok') => {
    setToast({ text, kind });
    setTimeout(() => setToast(null), 3200);
  };

  const load = useCallback(async ({ silent } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [sRes, modsRes] = await Promise.all([
        api.get(`/app-modules/${moduleKey}/stages`),
        api.get('/app-modules').catch(() => ({ data: { modules: [] } })),
      ]);
      const stages = sRes.data.stages || [];
      setAllStages(stages);
      const mods = (modsRes.data?.modules || []).filter(
        (m) => m.module_key !== moduleKey && m.is_active !== false,
      );
      setOtherModules(mods);
      const ids = stages.map((s) => s.id).filter(Boolean);
      if (ids.length) {
        const linksRes = await api.get('/app-modules/links/by-stages', {
          params: { source_kind: 'custom', stage_ids: ids.join(',') },
        });
        setStageLinks(linksRes.data?.links || []);
      } else {
        setStageLinks([]);
      }
    } catch (e) {
      showToast(e.response?.data?.error || e.message, 'err');
    }
    if (!silent) setLoading(false);
  }, [moduleKey]);

  useEffect(() => { load(); }, [load]);

  const stagesByTab = useMemo(() => {
    const map = {};
    (tabs || []).forEach((t) => { map[String(t.id)] = []; });
    allStages.forEach((s) => {
      const key = String(s.tab_id || '');
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    });
    return map;
  }, [allStages, tabs]);

  const tabById = useMemo(() => {
    const m = {};
    (tabs || []).forEach((t) => { m[String(t.id)] = t; });
    return m;
  }, [tabs]);

  const saveStage = async (stage, patch) => {
    const { data } = await api.put(`/app-modules/${moduleKey}/stages/${stage.id}`, patch);
    setAllStages((prev) => prev.map((s) => (s.id === stage.id ? { ...s, ...(data.stage || patch) } : s)));
    return data.stage;
  };

  const startAdd = (tabId) => {
    setEditId(null);
    setAddingTabId(tabId);
    setForm({
      ...emptyForm(),
      color: mod?.color || '#4f46e5',
    });
  };

  const startEdit = (stage) => {
    setAddingTabId(null);
    setEditId(stage.id);
    setForm({
      name: stage.name || '',
      icon: stage.icon || '📋',
      color: stage.color || '#4f46e5',
      is_active: stage.is_active !== false,
      is_done: !!stage.is_done,
      is_lost: !!stage.is_lost,
    });
  };

  const saveNew = async () => {
    if (!form.name.trim() || !addingTabId) return;
    try {
      await api.post(`/app-modules/${moduleKey}/stages`, {
        name: form.name.trim(),
        icon: form.icon || '📋',
        color: form.color || '#4f46e5',
        tab_id: addingTabId,
        is_active: form.is_active !== false,
        is_done: !!form.is_done,
        is_lost: !!form.is_lost,
      });
      setAddingTabId(null);
      setForm(emptyForm());
      await load({ silent: true });
      showToast('Đã thêm giai đoạn');
    } catch (e) {
      showToast(e.response?.data?.error || e.message, 'err');
    }
  };

  const saveEdit = async () => {
    if (!editId || !form.name.trim()) return;
    try {
      await api.put(`/app-modules/${moduleKey}/stages/${editId}`, {
        name: form.name.trim(),
        icon: form.icon || '📋',
        color: form.color || '#4f46e5',
        is_active: form.is_active !== false,
        is_done: !!form.is_done,
        is_lost: !!form.is_lost,
      });
      setEditId(null);
      await load({ silent: true });
      showToast('Đã lưu giai đoạn');
    } catch (e) {
      showToast(e.response?.data?.error || e.message, 'err');
    }
  };

  const del = async (id) => {
    if (!confirm('Xóa giai đoạn này?')) return;
    try {
      await api.delete(`/app-modules/${moduleKey}/stages/${id}`);
      setAllStages((prev) => prev.filter((s) => s.id !== id));
      showToast('Đã xóa giai đoạn');
    } catch (e) {
      showToast(e.response?.data?.error || e.message, 'err');
    }
  };

  const toggleActive = async (stage) => {
    try {
      await saveStage(stage, { is_active: stage.is_active === false });
      showToast(stage.is_active === false ? `Đã hiện cột «${stage.name}»` : `Đã ẩn cột «${stage.name}»`);
    } catch (e) {
      showToast(e.response?.data?.error || e.message, 'err');
    }
  };

  const toggleDone = async (stage) => {
    const next = !stage.is_done;
    try {
      await saveStage(stage, { is_done: next, is_lost: next ? false : undefined });
      showToast(next ? `«${stage.name}» → Hoàn thành` : `Đã bỏ Hoàn thành`);
      await load({ silent: true });
    } catch (e) {
      showToast(e.response?.data?.error || e.message, 'err');
    }
  };

  const toggleLost = async (stage) => {
    const next = !stage.is_lost;
    try {
      await saveStage(stage, { is_lost: next, is_done: next ? false : undefined });
      showToast(next ? `«${stage.name}» → Hủy` : `Đã bỏ Hủy`);
      await load({ silent: true });
    } catch (e) {
      showToast(e.response?.data?.error || e.message, 'err');
    }
  };

  const toggleTransferTab = async (stage, tab) => {
    const current = (stage.transfer_tab_ids || []).map(String);
    const tid = String(tab.id);
    const next = current.includes(tid) ? current.filter((x) => x !== tid) : [...current, tid];
    try {
      await saveStage(stage, { transfer_tab_ids: next });
      showToast(next.includes(tid) ? `Bật → ${tab.name}` : `Tắt → ${tab.name}`);
      await load({ silent: true });
    } catch (e) {
      showToast(e.response?.data?.error || e.message, 'err');
    }
  };

  const toggleModuleLink = async (stage, targetMod, linkType) => {
    const existing = stageLinks.find(
      (l) =>
        String(l.source_stage_id) === String(stage.id)
        && String(l.target_module_id) === String(targetMod.id)
        && l.link_type === linkType,
    );
    const enable = !existing;
    try {
      await api.put('/app-modules/links', {
        source_kind: 'custom',
        source_stage_id: stage.id,
        target_module_id: targetMod.id,
        link_type: linkType,
        enabled: enable,
      });
      await load({ silent: true });
      showToast(enable
        ? `Bật ${linkType === 'transfer' ? 'chuyển' : '🔔'} «${targetMod.name}»`
        : `Tắt ${linkType === 'transfer' ? 'chuyển' : '🔔'} «${targetMod.name}»`);
    } catch (e) {
      showToast(e.response?.data?.error || e.message, 'err');
    }
  };

  const handleDragStart = (e, stage) => {
    setDraggingId(stage.id);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', stage.id); } catch { /* ignore */ }
  };
  const handleDragEnd = () => { setDraggingId(null); setDragOverId(null); };
  const handleDragOver = (e, stage) => {
    if (!draggingId || draggingId === stage.id) return;
    const dragging = allStages.find((s) => s.id === draggingId);
    if (!dragging || String(dragging.tab_id) !== String(stage.tab_id)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverId !== stage.id) setDragOverId(stage.id);
  };
  const handleDrop = async (e, target) => {
    e.preventDefault();
    const sourceId = draggingId || e.dataTransfer.getData('text/plain');
    setDraggingId(null);
    setDragOverId(null);
    if (!sourceId || sourceId === target.id) return;
    const source = allStages.find((s) => s.id === sourceId);
    if (!source || String(source.tab_id) !== String(target.tab_id)) return;

    const list = (stagesByTab[String(target.tab_id)] || []).slice();
    const fromIdx = list.findIndex((s) => s.id === source.id);
    const toIdx = list.findIndex((s) => s.id === target.id);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

    const newList = [...list];
    const [moved] = newList.splice(fromIdx, 1);
    newList.splice(toIdx, 0, moved);

    setAllStages((prev) => prev.map((s) => {
      const idx = newList.findIndex((x) => x.id === s.id);
      return idx >= 0 ? { ...s, order_index: idx * 10 } : s;
    }));
    try {
      await api.put(`/app-modules/${moduleKey}/stages-reorder`, {
        ids: newList.map((s) => s.id),
      });
      await load({ silent: true });
      showToast('Đã sắp xếp lại giai đoạn');
    } catch (err) {
      showToast(err.response?.data?.error || err.message, 'err');
      await load({ silent: true });
    }
  };

  const renderPipeline = (tab, list) => {
    const isLeadLike = /lead/i.test(tab.tab_key || '') || /lead/i.test(tab.name || '');
    const otherTabs = (tabs || []).filter((t) => String(t.id) !== String(tab.id));

    return (
      <div
        key={tab.id}
        className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col max-h-[min(72vh,680px)] min-h-[360px]"
      >
        <div className="px-4 py-3 border-b border-gray-100 space-y-2 shrink-0 bg-white">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ring-2 ring-offset-1 ${
                isLeadLike ? 'bg-blue-600 ring-blue-200' : 'bg-emerald-600 ring-emerald-200'
              }`}>
                {isLeadLike
                  ? <Tags className="w-4 h-4 text-white" strokeWidth={2} />
                  : <TrendingUp className="w-4 h-4 text-white" strokeWidth={2} />}
              </div>
              <div className="min-w-0">
                <h2 className="text-xs font-semibold text-gray-900">
                  Pipeline {tab.icon ? `${tab.icon} ` : ''}{tab.name}
                </h2>
                <p className="text-[10px] text-gray-400">{list.length} giai đoạn</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => startAdd(tab.id)}
              className="h-7 px-2.5 bg-emerald-600 text-white rounded-lg text-[10px] font-semibold hover:bg-emerald-700 flex items-center gap-1 cursor-pointer shrink-0 shadow-sm ring-1 ring-emerald-500/40"
              title="Thêm giai đoạn"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2} />
              Thêm
            </button>
          </div>
          <PipelineMiniFlowBar stages={list} />
          <div className="flex items-center gap-0.5 overflow-x-auto pb-0.5">
            {list.map((s, i) => (
              <div key={s.id} className="flex items-center shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(s)}
                  className={`px-2 py-1 rounded-md text-[10px] font-medium cursor-pointer transition-all border ${
                    s.is_active === false ? 'opacity-40 border-dashed' : 'border-transparent'
                  } ${editId === s.id ? 'ring-2 ring-violet-400 ring-offset-1' : ''}`}
                  style={{
                    backgroundColor: `${s.color || '#4f46e5'}18`,
                    color: s.color || '#4f46e5',
                    borderColor: editId === s.id ? '#8B5CF6' : 'transparent',
                  }}
                  title={s.name}
                >
                  {s.icon && <span className="mr-0.5">{s.icon}</span>}
                  <span className="max-w-[72px] truncate inline-block align-middle">{s.name}</span>
                </button>
                {i < list.length - 1 && <ChevronRight className="w-3 h-3 text-gray-300 mx-0.5 shrink-0" strokeWidth={2} />}
              </div>
            ))}
          </div>
        </div>

        <div className="divide-y divide-gray-100 overflow-y-auto flex-1 min-h-0 overscroll-contain">
          {list.map((s) => {
            const isDragging = draggingId === s.id;
            const isDragOver = dragOverId === s.id;
            const transferTabIds = (s.transfer_tab_ids || []).map(String);
            const transferTabs = transferTabIds.map((id) => tabById[id]).filter(Boolean);
            const linksForStage = stageLinks.filter((l) => String(l.source_stage_id) === String(s.id));

            return (
              <div
                key={s.id}
                draggable
                onDragStart={(e) => handleDragStart(e, s)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, s)}
                onDragLeave={() => setDragOverId(null)}
                onDrop={(e) => handleDrop(e, s)}
                className={`flex items-start gap-2 px-3 py-2 transition-all
                  ${isDragging ? 'opacity-40 bg-violet-50/50' : 'hover:bg-gray-50/80'}
                  ${isDragOver ? 'bg-violet-50/60 ring-1 ring-inset ring-violet-300' : ''}
                  ${s.is_active === false ? 'opacity-55' : ''}
                  ${editId === s.id ? 'bg-violet-50/40 ring-1 ring-inset ring-violet-200' : ''}`}
              >
                <div className="flex items-center gap-0.5 pt-1 shrink-0">
                  <span className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none" title="Kéo sắp xếp">
                    <GripVertical className="w-4 h-4" strokeWidth={1.5} />
                  </span>
                </div>
                <div
                  className="w-1 self-stretch rounded-full shrink-0 min-h-[2.5rem]"
                  style={{ backgroundColor: s.color || '#94A3B8' }}
                />
                <div className="flex-1 min-w-0 py-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm leading-none">{s.icon || '📋'}</span>
                    <p className="text-xs font-bold text-gray-900 truncate">{s.name}</p>
                    <span className="text-[9px] font-semibold text-violet-600 bg-violet-50 px-1 py-0.5 rounded font-mono">
                      #{s.order_index}
                    </span>
                  </div>
                  <StageStatusBadges stage={s} transferTabs={transferTabs} moduleLinks={linksForStage} />
                </div>
                <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end max-w-[280px] border-l border-gray-200 pl-1.5 ml-1">
                  {!s.is_done && !s.is_lost && null}
                  <button
                    type="button"
                    onClick={() => toggleLost(s)}
                    className={`h-7 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer border ${
                      s.is_lost
                        ? 'bg-red-600 text-white border-red-700'
                        : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-red-300 hover:text-red-700'
                    }`}
                    title={s.is_lost ? 'Đang là cột Hủy. Nhấn để bỏ.' : 'Đánh dấu cột Hủy'}
                  >
                    <XCircle className="h-3 w-3" />
                    {s.is_lost ? 'Cột Hủy' : 'Hủy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleDone(s)}
                    className={`h-7 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer border ${
                      s.is_done
                        ? 'bg-emerald-600 text-white border-emerald-700'
                        : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-emerald-300 hover:text-emerald-700'
                    }`}
                    title={s.is_done ? 'Đang là cột Hoàn thành. Nhấn để bỏ.' : 'Đánh dấu cột Hoàn thành'}
                  >
                    <Trophy className="h-3 w-3" />
                    {s.is_done ? 'Hoàn thành' : 'HT'}
                  </button>

                  {otherTabs.map((t) => {
                    const on = transferTabIds.includes(String(t.id));
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTransferTab(s, t)}
                        className={`h-7 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer border ${
                          on
                            ? 'bg-sky-600 text-white border-sky-700'
                            : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-sky-300 hover:text-sky-700'
                        }`}
                        title={on ? `Đang hiện chuyển → ${t.name}` : `Bật chuyển sang tab ${t.name}`}
                      >
                        <span>{t.icon || '📋'}</span>
                        {on ? `→ ${t.name}` : t.name}
                      </button>
                    );
                  })}

                  {otherModules.map((cm) => {
                    const hasTransfer = linksForStage.some(
                      (l) => String(l.target_module_id) === String(cm.id) && l.link_type === 'transfer',
                    );
                    const hasNotify = linksForStage.some(
                      (l) => String(l.target_module_id) === String(cm.id) && l.link_type === 'notify',
                    );
                    return (
                      <span key={cm.id} className="inline-flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => toggleModuleLink(s, cm, 'transfer')}
                          className={`h-7 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer border ${
                            hasTransfer
                              ? 'bg-violet-600 text-white border-violet-700'
                              : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-violet-300 hover:text-violet-700'
                          }`}
                          title={hasTransfer ? `Tắt chuyển → ${cm.name}` : `Bật chuyển → ${cm.name}`}
                        >
                          <span className="text-[11px] leading-none">{cm.icon || '📦'}</span>
                          {hasTransfer ? `→ ${cm.name}` : cm.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleModuleLink(s, cm, 'notify')}
                          className={`h-7 px-1.5 rounded-lg text-[10px] font-semibold cursor-pointer border ${
                            hasNotify
                              ? 'bg-amber-500 text-white border-amber-600'
                              : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-amber-300'
                          }`}
                          title={hasNotify ? `Tắt 🔔 ${cm.name}` : `Bật 🔔 ${cm.name}`}
                        >
                          🔔
                        </button>
                      </span>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => toggleActive(s)}
                    className={`h-7 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer border shadow-sm transition-colors ${
                      s.is_active !== false
                        ? 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-orange-50 hover:text-orange-800 hover:border-orange-300'
                        : 'bg-orange-100 text-orange-800 border-orange-300 ring-1 ring-orange-200'
                    }`}
                    title={s.is_active !== false ? 'Ẩn cột trên Kanban' : 'Hiện lại cột'}
                  >
                    {s.is_active !== false ? <Eye className="w-3.5 h-3.5" strokeWidth={2} /> : <EyeOff className="w-3.5 h-3.5" strokeWidth={2} />}
                    {s.is_active !== false ? 'Ẩn' : 'Hiện'}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(s)}
                    className="h-7 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer border shadow-sm bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 ring-1 ring-blue-100 transition-colors"
                    title="Sửa giai đoạn"
                  >
                    <Pencil className="w-3.5 h-3.5" strokeWidth={2} />
                    Sửa
                  </button>
                  <button
                    type="button"
                    onClick={() => del(s.id)}
                    className="h-7 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer border shadow-sm bg-red-50 text-red-700 border-red-200 hover:bg-red-100 ring-1 ring-red-100 transition-colors"
                    title="Xóa giai đoạn"
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                    Xóa
                  </button>
                </div>
              </div>
            );
          })}
          {list.length === 0 && (
            <div className="px-4 py-10 text-center text-xs text-gray-400">
              Chưa có giai đoạn. Bấm <strong>Thêm</strong> để tạo cột pipeline.
            </div>
          )}
        </div>
      </div>
    );
  };

  const editingStage = allStages.find((s) => s.id === editId);
  const addingTab = tabs.find((t) => String(t.id) === String(addingTabId));

  return (
    <div className="space-y-4">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[80] max-w-sm px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-start gap-2 ${
            toast.kind === 'err' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
          }`}
          role="status"
        >
          {toast.kind === 'err'
            ? <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            : <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />}
          <span className="leading-snug">{toast.text}</span>
          <button type="button" className="ml-1 opacity-80 hover:opacity-100 shrink-0" onClick={() => setToast(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-xs flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin" strokeWidth={2} />
          Đang tải giai đoạn…
        </div>
      ) : tabs.length === 0 ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Chưa có tab. Vào «Tab Lead/Deal» để tạo Lead / Deal rồi cấu hình giai đoạn.
        </p>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 min-h-0">
          {tabs.map((tab) => renderPipeline(tab, stagesByTab[String(tab.id)] || []))}
        </div>
      )}

      <Modal
        open={!!addingTabId}
        onClose={() => setAddingTabId(null)}
        title={`Thêm giai đoạn ${addingTab?.name || ''}`}
        size="lg"
      >
        <div className="mb-4">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200">
            Pipeline {addingTab?.icon} {addingTab?.name}
          </span>
        </div>
        <StageForm form={form} setForm={setForm} onSave={saveNew} onCancel={() => setAddingTabId(null)} />
      </Modal>

      <Modal
        open={!!editId}
        onClose={() => setEditId(null)}
        title={`Sửa giai đoạn ${editingStage?.name || ''}`}
        size="lg"
      >
        <div className="mb-4">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-violet-100 text-violet-800 ring-1 ring-violet-200">
            {editingStage?.icon} {tabById[String(editingStage?.tab_id)]?.name || 'Pipeline'}
          </span>
        </div>
        <StageForm form={form} setForm={setForm} onSave={saveEdit} onCancel={() => setEditId(null)} />
      </Modal>
    </div>
  );
}

function StageForm({ form, setForm, onSave, onCancel }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-xs text-gray-600 space-y-1">
          Icon
          <input
            className="h-9 w-14 px-2 border rounded-lg text-center text-base block"
            value={form.icon}
            onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
          />
        </label>
        <label className="text-xs text-gray-600 space-y-1 flex-1 min-w-[180px]">
          Tên giai đoạn
          <input
            className="h-9 px-3 border rounded-lg text-sm w-full"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Tên cột…"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && onSave()}
          />
        </label>
        <label className="text-xs text-gray-600 space-y-1">
          Màu
          <input
            type="color"
            className="h-9 w-12 border rounded-lg cursor-pointer block"
            value={form.color || '#4f46e5'}
            onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-gray-700">
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_active !== false}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
          />
          Hiện trên Kanban
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={!!form.is_done}
            onChange={(e) => setForm((f) => ({
              ...f,
              is_done: e.target.checked,
              is_lost: e.target.checked ? false : f.is_lost,
            }))}
          />
          Cột Hoàn thành
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={!!form.is_lost}
            onChange={(e) => setForm((f) => ({
              ...f,
              is_lost: e.target.checked,
              is_done: e.target.checked ? false : f.is_done,
            }))}
          />
          Cột Hủy
        </label>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t">
        <button type="button" onClick={onCancel} className="h-9 px-3 rounded-lg text-sm bg-gray-100 hover:bg-gray-200">
          Hủy
        </button>
        <button
          type="button"
          onClick={onSave}
          className="h-9 px-4 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1"
        >
          <Save className="h-3.5 w-3.5" /> Lưu
        </button>
      </div>
    </div>
  );
}
