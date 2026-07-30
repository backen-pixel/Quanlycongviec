import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../lib/api';
import {
  Plus, Trash2, Save, ChevronDown, ChevronRight, Edit2, X, CheckSquare,
  GripVertical, Star, Clock, Loader2,
} from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableItem({ id, children, disabled = false }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 50 : 'auto',
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({
        dragHandleProps: disabled ? {} : { ...attributes, ...listeners },
        isDragging,
      })}
    </div>
  );
}

function priorityLabel(p) {
  if (p === 'urgent') return 'Gấp';
  if (p === 'high') return 'Cao';
  if (p === 'medium') return 'TB';
  return 'Thấp';
}

function priorityClass(p) {
  if (p === 'urgent') return 'bg-red-100 text-red-700';
  if (p === 'high') return 'bg-orange-100 text-orange-700';
  if (p === 'medium') return 'bg-blue-100 text-blue-700';
  return 'bg-gray-100 text-gray-600';
}

/**
 * UI bộ nhiệm vụ module — bố cục giống CRMTemplatesPage (Lead/Deal → Tab, gắn cột pipeline).
 */
export default function AppModuleTaskTemplatesPanel({ moduleKey, mod, tabs = [] }) {
  const [templates, setTemplates] = useState([]);
  const [allStages, setAllStages] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState({});
  const [editingTpl, setEditingTpl] = useState(null);
  const [showAddTpl, setShowAddTpl] = useState(false);
  const [newTpl, setNewTpl] = useState({ name: '', stage_id: '', is_default: false });
  const [newItem, setNewItem] = useState({});
  const [editingItemId, setEditingItemId] = useState(null);
  const [itemEditForm, setItemEditForm] = useState({
    title: '', description: '', priority: 'medium', deadline_days: 0,
  });
  const [editingChecklist, setEditingChecklist] = useState({});
  const [newCheckItem, setNewCheckItem] = useState({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const [tRes, sRes] = await Promise.all([
        api.get(`/app-modules/${moduleKey}/task-templates`),
        api.get(`/app-modules/${moduleKey}/stages`),
      ]);
      setTemplates(tRes.data.templates || []);
      setAllStages((sRes.data.stages || []).filter((s) => s.is_active !== false));
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    }
    setLoading(false);
  }, [moduleKey]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!tabs.length) {
      setActiveTabId(null);
      return;
    }
    setActiveTabId((prev) => {
      if (prev && tabs.some((t) => String(t.id) === String(prev))) return prev;
      return tabs[0].id;
    });
  }, [tabs]);

  const stagesForTab = useMemo(
    () => allStages
      .filter((s) => !activeTabId || String(s.tab_id) === String(activeTabId))
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
    [allStages, activeTabId],
  );

  const stageMap = useMemo(() => {
    const m = {};
    allStages.forEach((s) => { m[String(s.id)] = s; });
    return m;
  }, [allStages]);

  const filteredTemplates = useMemo(() => {
    const stageIds = new Set(stagesForTab.map((s) => String(s.id)));
    return templates
      .filter((t) => {
        if (!t.stage_id) return true; // bộ chung (không gắn cột)
        return stageIds.has(String(t.stage_id));
      })
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  }, [templates, stagesForTab]);

  const activeTab = tabs.find((t) => String(t.id) === String(activeTabId));

  const refreshLocalTpl = (tplId, patchOrFn) => {
    setTemplates((prev) => prev.map((t) => {
      if (String(t.id) !== String(tplId)) return t;
      return typeof patchOrFn === 'function' ? patchOrFn(t) : { ...t, ...patchOrFn };
    }));
  };

  const createTemplate = async () => {
    if (!newTpl.name.trim()) {
      setMessage('Nhập tên bộ mẫu');
      return;
    }
    try {
      const { data } = await api.post(`/app-modules/${moduleKey}/task-templates`, {
        name: newTpl.name.trim(),
        stage_id: newTpl.stage_id || null,
        is_default: !!newTpl.is_default,
        items: [],
      });
      setShowAddTpl(false);
      setNewTpl({ name: '', stage_id: '', is_default: false });
      if (data.template) {
        setTemplates((p) => [...p, data.template]);
        setExpanded((p) => ({ ...p, [data.template.id]: true }));
      } else {
        await load();
      }
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    }
  };

  const updateTemplate = async () => {
    if (!editingTpl?.id || !editingTpl.name?.trim()) return;
    try {
      const { data } = await api.put(`/app-modules/${moduleKey}/task-templates/${editingTpl.id}`, {
        name: editingTpl.name.trim(),
        stage_id: editingTpl.stage_id || null,
      });
      refreshLocalTpl(editingTpl.id, data.template || {
        name: editingTpl.name.trim(),
        stage_id: editingTpl.stage_id || null,
      });
      setEditingTpl(null);
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    }
  };

  const toggleDefault = async (tpl) => {
    try {
      const { data } = await api.put(`/app-modules/${moduleKey}/task-templates/${tpl.id}`, {
        is_default: !tpl.is_default,
      });
      refreshLocalTpl(tpl.id, { is_default: data.template?.is_default ?? !tpl.is_default });
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    }
  };

  const deleteTemplate = async (id) => {
    if (!confirm('Xóa bộ mẫu này?')) return;
    try {
      await api.delete(`/app-modules/${moduleKey}/task-templates/${id}`);
      setTemplates((p) => p.filter((t) => t.id !== id));
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    }
  };

  const addItem = async (tplId) => {
    const draft = newItem[tplId] || {};
    if (!String(draft.title || '').trim()) return;
    try {
      const { data } = await api.post(`/app-modules/${moduleKey}/task-templates/${tplId}/items`, {
        title: draft.title.trim(),
        priority: draft.priority || 'medium',
        deadline_days: Number(draft.deadline_days) || 0,
        checklist: [],
      });
      refreshLocalTpl(tplId, (t) => ({
        ...t,
        items: [...(t.items || []), data.item],
      }));
      setNewItem((p) => ({ ...p, [tplId]: { title: '', priority: 'medium', deadline_days: 0 } }));
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    }
  };

  const deleteItem = async (tplId, itemId) => {
    if (!confirm('Xóa nhiệm vụ này?')) return;
    try {
      await api.delete(`/app-modules/${moduleKey}/task-templates/${tplId}/items/${itemId}`);
      refreshLocalTpl(tplId, (t) => ({
        ...t,
        items: (t.items || []).filter((i) => i.id !== itemId),
      }));
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    }
  };

  const saveItemEdit = async (tplId) => {
    if (!editingItemId || !itemEditForm.title.trim()) {
      setMessage('Nhập tên nhiệm vụ');
      return;
    }
    try {
      const { data } = await api.put(
        `/app-modules/${moduleKey}/task-templates/${tplId}/items/${editingItemId}`,
        {
          title: itemEditForm.title.trim(),
          description: itemEditForm.description?.trim() || null,
          priority: itemEditForm.priority,
          deadline_days: Number(itemEditForm.deadline_days) || 0,
        },
      );
      refreshLocalTpl(tplId, (t) => ({
        ...t,
        items: (t.items || []).map((i) => (i.id === editingItemId ? data.item : i)),
      }));
      setEditingItemId(null);
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    }
  };

  const updateItemChecklist = async (tplId, itemId, checklist) => {
    try {
      const { data } = await api.put(
        `/app-modules/${moduleKey}/task-templates/${tplId}/items/${itemId}`,
        { checklist },
      );
      refreshLocalTpl(tplId, (t) => ({
        ...t,
        items: (t.items || []).map((i) => (i.id === itemId ? data.item : i)),
      }));
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    }
  };

  const handleItemDragEnd = async (event, tplId) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const tpl = templates.find((t) => t.id === tplId);
    if (!tpl) return;
    const items = [...(tpl.items || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(items, oldIndex, newIndex).map((it, idx) => ({ ...it, order_index: idx }));
    refreshLocalTpl(tplId, { items: next });
    try {
      await api.put(`/app-modules/${moduleKey}/task-templates/${tplId}/items-reorder`, {
        ids: next.map((i) => i.id),
      });
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
      await load();
    }
  };

  const handleTemplateDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const list = [...filteredTemplates];
    const oldIndex = list.findIndex((t) => t.id === active.id);
    const newIndex = list.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(list, oldIndex, newIndex);
    const nextIds = new Set(next.map((t) => t.id));
    setTemplates((prev) => {
      const others = prev.filter((t) => !nextIds.has(t.id));
      return [...next.map((t, i) => ({ ...t, order_index: i })), ...others];
    });
    try {
      await api.put(`/app-modules/${moduleKey}/task-templates-reorder`, {
        ids: next.map((t) => t.id),
      });
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
      await load();
    }
  };

  const openAddTpl = () => {
    setShowAddTpl(true);
    setNewTpl({
      name: '',
      stage_id: stagesForTab[0]?.id || '',
      is_default: false,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Đang tải bộ nhiệm vụ…
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">📋 Bộ nhiệm vụ mẫu</h2>
          <p className="text-sm text-gray-500">
            {filteredTemplates.length} bộ mẫu {activeTab?.name || ''}
            {' — '}gắn vào <b>cột pipeline</b> của tab. Kéo thả để sắp xếp.
          </p>
          <p className="text-[11px] text-amber-700 mt-1">
            Bộ <b>mặc định</b> / gắn cột sẽ tự sinh nhiệm vụ khi tạo bản ghi hoặc chuyển cột.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddTpl}
          className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer"
        >
          <Plus className="h-4 w-4" /> Thêm bộ mẫu
        </button>
      </div>

      {message && (
        <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex justify-between gap-2">
          <span>{message}</span>
          <button type="button" className="text-gray-400 hover:text-gray-700" onClick={() => setMessage('')}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Phạm vi — giống CRM company/pipeline picker */}
      <div className="rounded-xl border bg-white p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Phạm vi áp dụng
        </div>
        <span className="h-9 px-3 rounded-lg border text-sm bg-gray-50 inline-flex items-center gap-1.5 text-gray-800">
          {mod?.icon || '📦'} {mod?.name || moduleKey}
        </span>
        <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">
          Theo tab pipeline của module
        </span>
      </div>

      {/* Tab Lead / Deal style — segmented control lớn như CRM */}
      {tabs.length > 0 && (
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {tabs.map((t) => {
            const active = String(activeTabId) === String(t.id);
            const count = templates.filter((tpl) => {
              if (!tpl.stage_id) return active;
              return String(stageMap[String(tpl.stage_id)]?.tab_id) === String(t.id);
            }).length;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTabId(t.id)}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  active ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.icon || '📋'} {t.name}
                <span className="block text-[10px] font-normal mt-0.5 opacity-70">
                  {count} bộ mẫu · quy trình {t.name}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Stages preview strip — giống CRM */}
      <div className="rounded-xl p-4 border bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200">
        <h3 className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wider flex items-center gap-2 flex-wrap">
          <span>📊 Quy trình {activeTab?.name || ''}</span>
          <span className="text-[10px] font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
            {stagesForTab.length} bước
          </span>
        </h3>
        {stagesForTab.length === 0 ? (
          <p className="text-xs text-gray-500 italic">
            Tab này chưa có giai đoạn. Vào «Giai đoạn» để thêm cột pipeline.
          </p>
        ) : (
          <div className="flex items-center gap-1 flex-wrap pb-1">
            {stagesForTab.map((s, i) => {
              const n = templates.filter((t) => String(t.stage_id) === String(s.id)).length;
              return (
                <div key={s.id} className="flex items-center">
                  <div
                    className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
                    style={{
                      backgroundColor: `${s.color || '#3B82F6'}18`,
                      color: s.color || '#3B82F6',
                      border: `1px solid ${s.color || '#3B82F6'}55`,
                    }}
                  >
                    {s.icon || '📌'} {s.name}
                    <span className="ml-1 opacity-60">({n})</span>
                  </div>
                  {i < stagesForTab.length - 1 && <span className="text-gray-300 mx-1">→</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {filteredTemplates.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-900">
              Bộ mẫu — {activeTab?.name || mod?.name || 'Module'}
            </p>
            <p className="text-[11px] text-amber-800 mt-0.5">
              {filteredTemplates.length} bộ mẫu ·{' '}
              {filteredTemplates.reduce((n, t) => n + (t.items?.length || 0), 0)} nhiệm vụ
            </p>
          </div>
        </div>
      )}

      {showAddTpl && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-blue-800">
            Tạo bộ mẫu mới ({activeTab?.name || 'Module'})
          </h3>
          <div className="flex gap-2 flex-wrap">
            <input
              value={newTpl.name}
              onChange={(e) => setNewTpl((p) => ({ ...p, name: e.target.value }))}
              placeholder="Tên bộ mẫu..."
              className="flex-1 min-w-[200px] h-9 px-3 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && createTemplate()}
            />
            <select
              value={newTpl.stage_id}
              onChange={(e) => setNewTpl((p) => ({ ...p, stage_id: e.target.value }))}
              className="h-9 px-3 rounded-lg border text-sm bg-white min-w-[220px]"
            >
              <option value="">🌐 Chung (mặc định / mọi cột)</option>
              {stagesForTab.map((s) => (
                <option key={s.id} value={s.id}>{s.icon || '📌'} {s.name}</option>
              ))}
            </select>
            <label className="h-9 px-2 inline-flex items-center gap-1.5 text-xs text-gray-700 bg-white border rounded-lg">
              <input
                type="checkbox"
                checked={!!newTpl.is_default}
                onChange={(e) => setNewTpl((p) => ({ ...p, is_default: e.target.checked }))}
              />
              Mặc định
            </label>
            <button type="button" onClick={createTemplate} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 cursor-pointer">
              Tạo
            </button>
            <button type="button" onClick={() => setShowAddTpl(false)} className="h-9 px-3 bg-gray-100 rounded-lg text-sm cursor-pointer">
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* Template list — giữ phần còn lại bên dưới */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTemplateDragEnd}>
        <SortableContext items={filteredTemplates.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {filteredTemplates.map((tpl) => {
              const stage = tpl.stage_id ? stageMap[String(tpl.stage_id)] : null;
              const stageView = stage
                ? { ...stage, label: stage.name }
                : { color: '#0EA5E9', icon: '🌐', label: 'Chung' };
              const isExp = !!expanded[tpl.id];
              const sortedItems = [...(tpl.items || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

              return (
                <SortableItem key={tpl.id} id={tpl.id}>
                  {({ dragHandleProps, isDragging }) => (
                    <div className={`border rounded-xl overflow-hidden bg-white ${isDragging ? 'shadow-lg ring-2 ring-blue-300' : ''}`}>
                      {editingTpl?.id === tpl.id ? (
                        <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border-b border-blue-200 flex-wrap">
                          <input
                            value={editingTpl.name}
                            onChange={(e) => setEditingTpl((p) => ({ ...p, name: e.target.value }))}
                            className="flex-1 min-w-[180px] h-8 px-2 rounded border text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && updateTemplate()}
                          />
                          <select
                            value={editingTpl.stage_id || ''}
                            onChange={(e) => setEditingTpl((p) => ({ ...p, stage_id: e.target.value }))}
                            className="h-8 px-2 rounded border text-xs bg-white min-w-[200px]"
                          >
                            <option value="">🌐 Chung</option>
                            {allStages
                              .filter((s) => !activeTabId || String(s.tab_id) === String(activeTabId) || String(s.id) === String(editingTpl.stage_id))
                              .map((s) => (
                                <option key={s.id} value={s.id}>{s.icon || '📌'} {s.name}</option>
                              ))}
                          </select>
                          <button type="button" onClick={updateTemplate} className="h-8 px-3 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 inline-flex items-center gap-1 cursor-pointer">
                            <Save className="h-3 w-3" /> Lưu
                          </button>
                          <button type="button" onClick={() => setEditingTpl(null)} className="h-8 px-2 bg-gray-100 rounded text-xs cursor-pointer">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <div
                          className="flex items-center gap-2 px-4 py-3"
                          style={{
                            background: `linear-gradient(90deg, ${stageView.color || '#3B82F6'}14 0%, #F9FAFB 60%)`,
                            borderLeft: `4px solid ${stageView.color || '#3B82F6'}`,
                          }}
                        >
                          <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing p-1 text-gray-300 hover:text-gray-500 touch-none">
                            <GripVertical className="h-4 w-4" />
                          </div>
                          <div
                            className="flex-1 flex items-center gap-2 cursor-pointer flex-wrap"
                            onClick={() => setExpanded((p) => ({ ...p, [tpl.id]: !p[tpl.id] }))}
                          >
                            {isExp ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap"
                              style={{
                                backgroundColor: `${stageView.color}22`,
                                color: stageView.color,
                                border: `1px solid ${stageView.color}55`,
                              }}
                            >
                              {stageView.icon} {stageView.label}
                            </span>
                            <span className="text-sm font-semibold flex-1 min-w-[120px]">{tpl.name}</span>
                            {tpl.stage_id ? (
                              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">📌 Theo cột</span>
                            ) : (
                              <span className="text-[10px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-medium">🌐 Chung</span>
                            )}
                            {tpl.is_default && (
                              <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-0.5">
                                <Star className="h-2.5 w-2.5" /> Mặc định
                              </span>
                            )}
                            <span className="text-xs text-gray-400 whitespace-nowrap">{sortedItems.length} việc</span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTpl({ id: tpl.id, name: tpl.name, stage_id: tpl.stage_id || '' });
                            }}
                            className="p-1 text-gray-400 hover:text-blue-600 cursor-pointer"
                            title="Sửa"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleDefault(tpl); }}
                            className="text-[10px] px-2 py-1 rounded hover:bg-blue-50 text-blue-600 cursor-pointer"
                          >
                            {tpl.is_default ? 'Bỏ mặc định' : 'Đặt mặc định'}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); deleteTemplate(tpl.id); }}
                            className="p-1 text-gray-400 hover:text-red-500 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}

                      {isExp && (
                        <div className="px-4 py-2 space-y-1">
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={(e) => handleItemDragEnd(e, tpl.id)}
                          >
                            <SortableContext items={sortedItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                              {sortedItems.map((item, i) => (
                                <SortableItem
                                  key={item.id}
                                  id={item.id}
                                  disabled={editingItemId === item.id || !!editingChecklist[item.id]}
                                >
                                  {({ dragHandleProps: itemDrag }) => (
                                    <div>
                                      {editingItemId === item.id ? (
                                        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-2 space-y-2 my-1">
                                          <input
                                            className="w-full h-8 px-2 border rounded text-sm"
                                            value={itemEditForm.title}
                                            onChange={(e) => setItemEditForm((f) => ({ ...f, title: e.target.value }))}
                                            placeholder="Tên nhiệm vụ"
                                          />
                                          <textarea
                                            className="w-full px-2 py-1 border rounded text-sm"
                                            rows={2}
                                            value={itemEditForm.description}
                                            onChange={(e) => setItemEditForm((f) => ({ ...f, description: e.target.value }))}
                                            placeholder="Mô tả (tuỳ chọn)"
                                          />
                                          <div className="flex flex-wrap gap-2 items-center">
                                            <select
                                              className="h-8 px-2 border rounded text-xs bg-white"
                                              value={itemEditForm.priority}
                                              onChange={(e) => setItemEditForm((f) => ({ ...f, priority: e.target.value }))}
                                            >
                                              <option value="low">Thấp</option>
                                              <option value="medium">Trung bình</option>
                                              <option value="high">Cao</option>
                                              <option value="urgent">Gấp</option>
                                            </select>
                                            <label className="text-[10px] text-gray-600 inline-flex items-center gap-1">
                                              <Clock className="h-3 w-3" /> Ngày
                                              <input
                                                type="number"
                                                min={0}
                                                className="h-8 w-16 px-1 border rounded text-xs"
                                                value={itemEditForm.deadline_days}
                                                onChange={(e) => setItemEditForm((f) => ({ ...f, deadline_days: e.target.value }))}
                                              />
                                            </label>
                                            <button type="button" onClick={() => saveItemEdit(tpl.id)} className="h-8 px-3 bg-blue-600 text-white rounded text-xs inline-flex items-center gap-1 cursor-pointer">
                                              <Save className="h-3 w-3" /> Lưu
                                            </button>
                                            <button type="button" onClick={() => setEditingItemId(null)} className="h-8 px-2 bg-white border rounded text-xs cursor-pointer">
                                              Hủy
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-50 group">
                                          <div {...itemDrag} className="cursor-grab active:cursor-grabbing p-0.5 text-gray-300 hover:text-gray-500 touch-none">
                                            <GripVertical className="h-3.5 w-3.5" />
                                          </div>
                                          <span className="text-xs text-gray-400 w-5 shrink-0">{i + 1}.</span>
                                          <span className="text-sm flex-1 min-w-0 truncate" title={item.title}>{item.title}</span>
                                          {Array.isArray(item.checklist) && item.checklist.length > 0 && (
                                            <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5">
                                              <CheckSquare className="h-3 w-3" /> {item.checklist.length}
                                            </span>
                                          )}
                                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${priorityClass(item.priority)}`}>
                                            {priorityLabel(item.priority)}
                                          </span>
                                          {Number(item.deadline_days) > 0 && (
                                            <span className="text-[9px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full font-medium inline-flex items-center gap-0.5">
                                              <Clock className="h-2.5 w-2.5" /> {item.deadline_days}d
                                            </span>
                                          )}
                                          <button
                                            type="button"
                                            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-blue-600 cursor-pointer"
                                            onClick={() => {
                                              setEditingItemId(item.id);
                                              setItemEditForm({
                                                title: item.title || '',
                                                description: item.description || '',
                                                priority: item.priority || 'medium',
                                                deadline_days: item.deadline_days ?? 0,
                                              });
                                            }}
                                          >
                                            <Edit2 className="h-3.5 w-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            className="opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                                            onClick={() => setEditingChecklist((p) => ({
                                              ...p,
                                              [item.id]: !p[item.id],
                                            }))}
                                          >
                                            Checklist
                                          </button>
                                          <button
                                            type="button"
                                            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 cursor-pointer"
                                            onClick={() => deleteItem(tpl.id, item.id)}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      )}

                                      {editingChecklist[item.id] && (
                                        <div className="ml-8 mb-2 p-2 rounded-lg border border-emerald-200 bg-emerald-50/40 space-y-1">
                                          {(item.checklist || []).map((c, ci) => (
                                            <div key={ci} className="flex items-center gap-2 text-xs">
                                              <CheckSquare className="h-3 w-3 text-emerald-600" />
                                              <span className="flex-1">{typeof c === 'string' ? c : c.text || c.title}</span>
                                              <button
                                                type="button"
                                                className="text-red-400 hover:text-red-600 cursor-pointer"
                                                onClick={() => {
                                                  const next = (item.checklist || []).filter((_, idx) => idx !== ci);
                                                  updateItemChecklist(tpl.id, item.id, next);
                                                }}
                                              >
                                                <X className="h-3 w-3" />
                                              </button>
                                            </div>
                                          ))}
                                          <div className="flex gap-1 pt-1">
                                            <input
                                              className="flex-1 h-7 px-2 border rounded text-xs bg-white"
                                              placeholder="Thêm checklist…"
                                              value={newCheckItem[item.id] || ''}
                                              onChange={(e) => setNewCheckItem((p) => ({ ...p, [item.id]: e.target.value }))}
                                              onKeyDown={(e) => {
                                                if (e.key !== 'Enter') return;
                                                const text = String(newCheckItem[item.id] || '').trim();
                                                if (!text) return;
                                                const next = [...(item.checklist || []), { text, done: false }];
                                                updateItemChecklist(tpl.id, item.id, next);
                                                setNewCheckItem((p) => ({ ...p, [item.id]: '' }));
                                              }}
                                            />
                                            <button
                                              type="button"
                                              className="h-7 px-2 bg-emerald-600 text-white rounded text-[10px] cursor-pointer"
                                              onClick={() => {
                                                const text = String(newCheckItem[item.id] || '').trim();
                                                if (!text) return;
                                                const next = [...(item.checklist || []), { text, done: false }];
                                                updateItemChecklist(tpl.id, item.id, next);
                                                setNewCheckItem((p) => ({ ...p, [item.id]: '' }));
                                              }}
                                            >
                                              Thêm
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </SortableItem>
                              ))}
                            </SortableContext>
                          </DndContext>

                          <div className="flex flex-wrap gap-2 items-center pt-2 border-t mt-2">
                            <input
                              className="flex-1 min-w-[160px] h-8 px-2 border rounded-lg text-sm"
                              placeholder="Thêm nhiệm vụ…"
                              value={newItem[tpl.id]?.title || ''}
                              onChange={(e) => setNewItem((p) => ({
                                ...p,
                                [tpl.id]: { ...(p[tpl.id] || {}), title: e.target.value },
                              }))}
                              onKeyDown={(e) => e.key === 'Enter' && addItem(tpl.id)}
                            />
                            <select
                              className="h-8 px-2 border rounded-lg text-xs bg-white"
                              value={newItem[tpl.id]?.priority || 'medium'}
                              onChange={(e) => setNewItem((p) => ({
                                ...p,
                                [tpl.id]: { ...(p[tpl.id] || {}), priority: e.target.value },
                              }))}
                            >
                              <option value="low">Thấp</option>
                              <option value="medium">TB</option>
                              <option value="high">Cao</option>
                              <option value="urgent">Gấp</option>
                            </select>
                            <input
                              type="number"
                              min={0}
                              className="h-8 w-16 px-1 border rounded-lg text-xs"
                              title="Deadline (ngày)"
                              placeholder="Ngày"
                              value={newItem[tpl.id]?.deadline_days ?? ''}
                              onChange={(e) => setNewItem((p) => ({
                                ...p,
                                [tpl.id]: { ...(p[tpl.id] || {}), deadline_days: e.target.value },
                              }))}
                            />
                            <button
                              type="button"
                              onClick={() => addItem(tpl.id)}
                              className="h-8 px-3 bg-blue-600 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="h-3.5 w-3.5" /> Thêm
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </SortableItem>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {filteredTemplates.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-400 text-lg mb-2">
            📭 Chưa có bộ mẫu nào cho {activeTab?.name || 'tab này'}
          </p>
          <button
            type="button"
            onClick={openAddTpl}
            className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 inline-flex items-center gap-1 cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Tạo bộ mẫu đầu tiên
          </button>
        </div>
      )}
    </div>
  );
}
