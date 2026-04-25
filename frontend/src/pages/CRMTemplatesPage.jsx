import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Plus, Trash2, Save, ChevronDown, ChevronRight, Edit2, X, CheckSquare, GripVertical, Shield } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ═══ STAGES cho Lead & Deal ═══
const LEAD_STAGES = [
  { slug: 'consulting', label: 'Tư vấn', icon: '💬', color: '#3B82F6' },
  { slug: 'design', label: 'Thiết kế', icon: '🎨', color: '#8B5CF6' },
  { slug: 'quotation', label: 'Báo giá', icon: '💰', color: '#F59E0B' },
  { slug: 'contract', label: 'Hợp đồng', icon: '📝', color: '#10B981' },
];

const DEAL_STAGES = [
  { slug: 'deal_new', label: 'Nhiệm vụ Deal mới', icon: '📋', color: '#3B82F6' },
  { slug: 'deal_quote_contract', label: 'Báo giá & Hợp đồng', icon: '📄', color: '#8B5CF6' },
  { slug: 'deal_ordering', label: 'Tiến hành đặt hàng', icon: '🛒', color: '#F59E0B' },
  { slug: 'deal_schedule', label: 'Hẹn ngày lắp đặt', icon: '📅', color: '#10B981' },
  { slug: 'deal_shipping', label: 'Đặt Vận chuyển', icon: '🚛', color: '#EF4444' },
  { slug: 'deal_notes', label: 'Ghi chú khác', icon: '📝', color: '#6B7280' },
];

const ALL_STAGES = [...LEAD_STAGES, ...DEAL_STAGES];

// ═══ Sortable Item component ═══
function SortableItem({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 50 : 'auto',
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ dragHandleProps: { ...attributes, ...listeners }, isDragging })}
    </div>
  );
}

export default function CRMTemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [editingTpl, setEditingTpl] = useState(null);
  const [newItem, setNewItem] = useState({});
  const [showAddTpl, setShowAddTpl] = useState(false);
  const [newTpl, setNewTpl] = useState({ name: '', stage_slug: '' });
  const [activeTab, setActiveTab] = useState('deal');
  const [editingChecklist, setEditingChecklist] = useState({});
  const [newCheckItem, setNewCheckItem] = useState({});
  const [editingVisibility, setEditingVisibility] = useState({}); // {itemId: true/false}
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);

  const currentStages = activeTab === 'lead' ? LEAD_STAGES : DEAL_STAGES;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const load = async () => {
    setLoading(true);
    try {
      const [tplRes, compRes, deptRes] = await Promise.all([
        api.get('/crm/task-templates'),
        api.get('/companies', { params: { for_module: 'crm' } }).catch(() => ({ data: [] })),
        api.get('/departments').catch(() => ({ data: [] })),
      ]);
      setTemplates(tplRes.data || []);
      setCompanies(compRes.data?.companies || compRes.data || []);
      setDepartments(deptRes.data?.departments || deptRes.data || []);
      const exp = {};
      (tplRes.data || []).forEach(t => { exp[t.id] = true; });
      setExpanded(exp);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filteredTemplates = templates.filter(t => {
    const isDeal = t.stage_slug?.startsWith('deal_');
    return activeTab === 'deal' ? isDeal : !isDeal;
  });

  // ═══ CRUD ═══
  const createTemplate = async () => {
    if (!newTpl.name.trim() || !newTpl.stage_slug) return;
    try {
      await api.post('/crm/task-templates', newTpl);
      setNewTpl({ name: '', stage_slug: '' });
      setShowAddTpl(false);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const deleteTemplate = async (id) => {
    if (!confirm('Xóa bộ mẫu này?')) return;
    try { await api.delete(`/crm/task-templates/${id}`); load(); } catch { alert('Lỗi'); }
  };

  const addItem = async (tplId) => {
    const item = newItem[tplId];
    if (!item?.title?.trim()) return;
    try {
      await api.post(`/crm/task-templates/${tplId}/items`, { ...item, checklist: item.checklist || [] });
      setNewItem(p => ({ ...p, [tplId]: { title: '', priority: 'medium', deadline_days: 0 } }));
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const deleteItem = async (tplId, itemId) => {
    try { await api.delete(`/crm/task-templates/${tplId}/items/${itemId}`); load(); } catch {}
  };

  const updateTemplateItemFields = async (tplId, itemId, body) => {
    try {
      await api.put(`/crm/task-templates/${tplId}/items/${itemId}`, body);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cập nhật mục mẫu');
      throw e;
    }
  };

  const toggleDefault = async (tpl) => {
    try { await api.put(`/crm/task-templates/${tpl.id}`, { is_default: !tpl.is_default }); load(); } catch {}
  };

  const updateTemplate = async () => {
    if (!editingTpl || !editingTpl.name.trim()) return;
    try {
      await api.put(`/crm/task-templates/${editingTpl.id}`, { name: editingTpl.name.trim(), stage_slug: editingTpl.stage_slug });
      setEditingTpl(null);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  // ═══ Checklist CRUD ═══
  const updateItemChecklist = async (tplId, itemId, checklist) => {
    try {
      await api.put(`/crm/task-templates/${tplId}/items/${itemId}`, { checklist });
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const updateItemVisibility = async (tplId, itemId, allowedCompanies, allowedDepts) => {
    try {
      await api.put(`/crm/task-templates/${tplId}/items/${itemId}`, {
        default_allowed_companies: allowedCompanies?.length ? allowedCompanies : null,
        default_allowed_departments: allowedDepts?.length ? allowedDepts : null,
      });
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const toggleItemCompany = (tplId, itemId, companyId, item) => {
    const current = item.default_allowed_companies || [];
    const next = current.includes(companyId) ? current.filter(x => x !== companyId) : [...current, companyId];
    updateItemVisibility(tplId, itemId, next, item.default_allowed_departments);
  };

  const toggleItemDept = (tplId, itemId, deptId, item) => {
    const current = item.default_allowed_departments || [];
    const next = current.includes(deptId) ? current.filter(x => x !== deptId) : [...current, deptId];
    updateItemVisibility(tplId, itemId, item.default_allowed_companies, next);
  };

  const addChecklistItem = async (tplId, itemId) => {
    const text = newCheckItem[itemId]?.trim();
    if (!text) return;
    const tpl = templates.find(t => t.id === tplId);
    const item = tpl?.items?.find(i => i.id === itemId);
    const current = Array.isArray(item?.checklist) ? item.checklist : [];
    await updateItemChecklist(tplId, itemId, [...current, text]);
    setNewCheckItem(p => ({ ...p, [itemId]: '' }));
  };

  const removeChecklistItem = async (tplId, itemId, idx) => {
    const tpl = templates.find(t => t.id === tplId);
    const item = tpl?.items?.find(i => i.id === itemId);
    const current = Array.isArray(item?.checklist) ? [...item.checklist] : [];
    current.splice(idx, 1);
    await updateItemChecklist(tplId, itemId, current);
  };

  // ═══ DRAG & DROP: Reorder items within a template ═══
  const handleItemDragEnd = async (event, tplId) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    
    const tpl = templates.find(t => t.id === tplId);
    if (!tpl) return;
    const sorted = [...(tpl.items || [])].sort((a, b) => a.order_index - b.order_index);
    const oldIdx = sorted.findIndex(i => i.id === active.id);
    const newIdx = sorted.findIndex(i => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;

    // Reorder locally first for instant feedback
    const reordered = [...sorted];
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);

    // Update local state immediately
    setTemplates(prev => prev.map(t => {
      if (t.id !== tplId) return t;
      return { ...t, items: reordered.map((item, i) => ({ ...item, order_index: i })) };
    }));

    // Save to backend
    try {
      await Promise.all(reordered.map((item, i) =>
        api.put(`/crm/task-templates/${tplId}/items/${item.id}`, { order_index: i })
      ));
    } catch { load(); } // Reload on error
  };

  // ═══ DRAG & DROP: Reorder templates within a stage ═══
  const handleTemplateDragEnd = async (event, stageSlug) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const stageTpls = filteredTemplates
      .filter(t => t.stage_slug === stageSlug)
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    
    const oldIdx = stageTpls.findIndex(t => t.id === active.id);
    const newIdx = stageTpls.findIndex(t => t.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;

    const reordered = [...stageTpls];
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);

    // Update local state
    setTemplates(prev => {
      const updated = [...prev];
      reordered.forEach((tpl, i) => {
        const idx = updated.findIndex(t => t.id === tpl.id);
        if (idx >= 0) updated[idx] = { ...updated[idx], order_index: i };
      });
      return updated;
    });

    // Save to backend
    try {
      await Promise.all(reordered.map((tpl, i) =>
        api.put(`/crm/task-templates/${tpl.id}`, { order_index: i })
      ));
    } catch { load(); }
  };

  // ═══ DRAG & DROP: Reorder checklist items ═══
  const handleChecklistDragEnd = async (event, tplId, itemId) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const tpl = templates.find(t => t.id === tplId);
    const item = tpl?.items?.find(i => i.id === itemId);
    const checklist = Array.isArray(item?.checklist) ? [...item.checklist] : [];

    const oldIdx = parseInt(active.id.split('-').pop());
    const newIdx = parseInt(over.id.split('-').pop());
    if (isNaN(oldIdx) || isNaN(newIdx)) return;

    const [moved] = checklist.splice(oldIdx, 1);
    checklist.splice(newIdx, 0, moved);

    // Update local
    setTemplates(prev => prev.map(t => {
      if (t.id !== tplId) return t;
      return { ...t, items: (t.items || []).map(i => i.id === itemId ? { ...i, checklist } : i) };
    }));

    // Save
    await updateItemChecklist(tplId, itemId, checklist);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin h-8 w-8 border-3 border-blue-600 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📋 Bộ nhiệm vụ mẫu CRM</h1>
          <p className="text-sm text-gray-500">
            {filteredTemplates.length} bộ mẫu {activeTab === 'deal' ? 'Deal' : 'Lead'} — Kéo thả để sắp xếp
          </p>
        </div>
        <button onClick={() => { setShowAddTpl(true); setNewTpl({ name: '', stage_slug: currentStages[0]?.slug || '' }); }}
          className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer">
          <Plus className="h-4 w-4" /> Thêm bộ mẫu
        </button>
      </div>

      {/* Tab Lead / Deal */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {[
          { key: 'deal', label: '🤝 Deal', desc: 'Quy trình xử lý Deal' },
          { key: 'lead', label: '📞 Lead', desc: 'Quy trình tư vấn Lead' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              activeTab === tab.key ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {tab.label}
            <span className="block text-[10px] font-normal mt-0.5 opacity-70">{tab.desc}</span>
          </button>
        ))}
      </div>

      {/* Stages preview */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4 border border-blue-100">
        <h3 className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wider">
          📊 Quy trình {activeTab === 'deal' ? 'Deal' : 'Lead'} ({currentStages.length} bước)
        </h3>
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {currentStages.map((s, i) => (
            <div key={s.slug} className="flex items-center">
              <div className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
                style={{ backgroundColor: s.color + '18', color: s.color, border: `1px solid ${s.color}30` }}>
                {s.icon} {s.label}
                <span className="ml-1 opacity-60">({filteredTemplates.filter(t => t.stage_slug === s.slug).length})</span>
              </div>
              {i < currentStages.length - 1 && <span className="text-gray-300 mx-1">→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Add Template Form */}
      {showAddTpl && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-blue-800">Tạo bộ mẫu mới ({activeTab === 'deal' ? 'Deal' : 'Lead'})</h3>
          <div className="flex gap-2">
            <input value={newTpl.name} onChange={e => setNewTpl(p => ({...p, name: e.target.value}))}
              placeholder="Tên bộ mẫu..." className="flex-1 h-9 px-3 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500" autoFocus
              onKeyDown={e => e.key === 'Enter' && createTemplate()} />
            <select value={newTpl.stage_slug} onChange={e => setNewTpl(p => ({...p, stage_slug: e.target.value}))}
              className="h-9 px-3 rounded-lg border text-sm bg-white">
              {currentStages.map(s => <option key={s.slug} value={s.slug}>{s.icon} {s.label}</option>)}
            </select>
            <button onClick={createTemplate} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-700">Tạo</button>
            <button onClick={() => setShowAddTpl(false)} className="h-9 px-3 bg-gray-100 rounded-lg text-sm cursor-pointer">Hủy</button>
          </div>
        </div>
      )}

      {/* Templates grouped by stage */}
      {currentStages.map(stage => {
        const stageTpls = filteredTemplates
          .filter(t => t.stage_slug === stage.slug)
          .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
        return (
          <div key={stage.slug}>
            <h2 className="text-sm font-bold mb-2 flex items-center gap-2" style={{ color: stage.color }}>
              {stage.icon} {stage.label}
              <span className="text-gray-400 font-normal">({stageTpls.length} bộ mẫu)</span>
            </h2>

            {stageTpls.length === 0 && (
              <div className="border-2 border-dashed rounded-xl p-4 text-center text-gray-400 text-xs mb-3">
                Chưa có bộ mẫu nào — Nhấn "Thêm bộ mẫu" để tạo
              </div>
            )}

            {/* Drag & Drop for templates */}
            <DndContext sensors={sensors} collisionDetection={closestCenter}
              onDragEnd={(e) => handleTemplateDragEnd(e, stage.slug)}>
              <SortableContext items={stageTpls.map(t => t.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2 mb-4">
                  {stageTpls.map(tpl => (
                    <SortableItem key={tpl.id} id={tpl.id}>
                      {({ dragHandleProps, isDragging }) => (
                        <TemplateCard
                          tpl={tpl} stage={stage} isDragging={isDragging}
                          dragHandleProps={dragHandleProps}
                          expanded={expanded[tpl.id]} onToggleExpand={() => setExpanded(p => ({ ...p, [tpl.id]: !p[tpl.id] }))}
                          editingTpl={editingTpl} setEditingTpl={setEditingTpl} updateTemplate={updateTemplate}
                          toggleDefault={toggleDefault} deleteTemplate={deleteTemplate}
                          newItem={newItem} setNewItem={setNewItem} addItem={addItem} deleteItem={deleteItem}
                          editingChecklist={editingChecklist} setEditingChecklist={setEditingChecklist}
                          newCheckItem={newCheckItem} setNewCheckItem={setNewCheckItem}
                          addChecklistItem={addChecklistItem} removeChecklistItem={removeChecklistItem}
                          sensors={sensors} handleItemDragEnd={handleItemDragEnd}
                          handleChecklistDragEnd={handleChecklistDragEnd}
                          templates={templates} setTemplates={setTemplates}
                          updateItemChecklist={updateItemChecklist}
                          updateTemplateItemFields={updateTemplateItemFields}
                          editingVisibility={editingVisibility} setEditingVisibility={setEditingVisibility}
                          companies={companies} departments={departments}
                          toggleItemCompany={toggleItemCompany} toggleItemDept={toggleItemDept}
                        />
                      )}
                    </SortableItem>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        );
      })}

      {filteredTemplates.length === 0 && !loading && (
        <div className="text-center py-12">
          <p className="text-gray-400 text-lg mb-2">📭 Chưa có bộ mẫu nào cho {activeTab === 'deal' ? 'Deal' : 'Lead'}</p>
          <button onClick={() => { setShowAddTpl(true); setNewTpl({ name: '', stage_slug: currentStages[0]?.slug || '' }); }}
            className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-700">
            <Plus className="h-4 w-4 inline mr-1" /> Tạo bộ mẫu đầu tiên
          </button>
        </div>
      )}
    </div>
  );
}

// ═══ Template Card with drag-drop items ═══
function TemplateCard({
  tpl, stage, isDragging, dragHandleProps, expanded, onToggleExpand,
  editingTpl, setEditingTpl, updateTemplate, toggleDefault, deleteTemplate,
  newItem, setNewItem, addItem, deleteItem,
  editingChecklist, setEditingChecklist, newCheckItem, setNewCheckItem,
  addChecklistItem, removeChecklistItem,
  sensors, handleItemDragEnd, handleChecklistDragEnd,
  editingVisibility, setEditingVisibility,
  companies, departments, toggleItemCompany, toggleItemDept,
  updateTemplateItemFields,
}) {
  const [editingItemId, setEditingItemId] = useState(null);
  const [itemEditForm, setItemEditForm] = useState({ title: '', description: '', priority: 'medium', deadline_days: 0 });

  const sortedItems = [...(tpl.items || [])].sort((a, b) => a.order_index - b.order_index);

  const openItemEdit = (item) => {
    setEditingItemId(item.id);
    setItemEditForm({
      title: item.title || '',
      description: item.description || '',
      priority: item.priority || 'medium',
      deadline_days: item.deadline_days ?? 0,
    });
  };

  const saveItemEdit = async () => {
    if (!editingItemId || !itemEditForm.title.trim()) {
      alert('Nhập tên nhiệm vụ');
      return;
    }
    try {
      await updateTemplateItemFields(tpl.id, editingItemId, {
        title: itemEditForm.title.trim(),
        description: itemEditForm.description?.trim() || null,
        priority: itemEditForm.priority,
        deadline_days: Math.max(0, parseInt(String(itemEditForm.deadline_days), 10) || 0),
      });
      setEditingItemId(null);
    } catch { /* alert trong updateTemplateItemFields */ }
  };

  return (
    <div className={`border rounded-xl overflow-hidden bg-white ${isDragging ? 'shadow-lg ring-2 ring-blue-300' : ''}`}>
      {/* Header */}
      {editingTpl?.id === tpl.id ? (
        <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border-b border-blue-200">
          <input value={editingTpl.name} onChange={e => setEditingTpl(p => ({ ...p, name: e.target.value }))}
            className="flex-1 h-8 px-2 rounded border text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus onKeyDown={e => e.key === 'Enter' && updateTemplate()} />
          <select value={editingTpl.stage_slug} onChange={e => setEditingTpl(p => ({ ...p, stage_slug: e.target.value }))}
            className="h-8 px-2 rounded border text-xs bg-white">
            {ALL_STAGES.map(s => <option key={s.slug} value={s.slug}>{s.icon} {s.label}</option>)}
          </select>
          <button onClick={updateTemplate} className="h-8 px-3 bg-blue-600 text-white rounded text-xs cursor-pointer hover:bg-blue-700 flex items-center gap-1">
            <Save className="h-3 w-3" /> Lưu
          </button>
          <button onClick={() => setEditingTpl(null)} className="h-8 px-2 bg-gray-100 rounded text-xs cursor-pointer"><X className="h-3 w-3" /></button>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50">
          <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing p-1 text-gray-300 hover:text-gray-500 touch-none">
            <GripVertical className="h-4 w-4" />
          </div>
          <div className="flex-1 flex items-center gap-2 cursor-pointer" onClick={onToggleExpand}>
            {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
            <span className="text-sm font-semibold flex-1">{tpl.name}</span>
            {tpl.is_default && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">⭐ Mặc định</span>}
            <span className="text-xs text-gray-400">{tpl.items?.length || 0} việc</span>
          </div>
          <button onClick={(e) => { e.stopPropagation(); setEditingTpl({ id: tpl.id, name: tpl.name, stage_slug: tpl.stage_slug }); }}
            className="p-1 text-gray-400 hover:text-blue-600 cursor-pointer" title="Sửa"><Edit2 className="h-3.5 w-3.5" /></button>
          <button onClick={(e) => { e.stopPropagation(); toggleDefault(tpl); }}
            className="text-[10px] px-2 py-1 rounded hover:bg-blue-50 text-blue-600 cursor-pointer">
            {tpl.is_default ? 'Bỏ mặc định' : 'Đặt mặc định'}
          </button>
          <button onClick={(e) => { e.stopPropagation(); deleteTemplate(tpl.id); }}
            className="p-1 text-gray-400 hover:text-red-500 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Items with drag & drop */}
      {expanded && (
        <div className="px-4 py-2 space-y-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter}
            onDragEnd={(e) => handleItemDragEnd(e, tpl.id)}>
            <SortableContext items={sortedItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
              {sortedItems.map((item, i) => (
                <SortableItem key={item.id} id={item.id}>
                  {({ dragHandleProps: itemDrag }) => (
                    <div>
                      <div className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-50 group">
                        <div {...itemDrag} className="cursor-grab active:cursor-grabbing p-0.5 text-gray-300 hover:text-gray-500 touch-none">
                          <GripVertical className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-xs text-gray-400 w-5 shrink-0">{i + 1}.</span>
                        <span className="text-sm flex-1 min-w-0 truncate" title={item.title}>{item.title}</span>
                        {Array.isArray(item.checklist) && item.checklist.length > 0 && (
                          <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            <CheckSquare className="h-3 w-3" /> {item.checklist.length}
                          </span>
                        )}
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                          item.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                          item.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                          item.priority === 'medium' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                        }`}>{item.priority === 'urgent' ? 'Gấp' : item.priority === 'high' ? 'Cao' : item.priority === 'medium' ? 'TB' : 'Thấp'}</span>
                        {item.deadline_days > 0 && <span className="text-[10px] text-gray-400">+{item.deadline_days}d</span>}
                        {(item.default_allowed_companies?.length > 0 || item.default_allowed_departments?.length > 0) && (
                          <span className="text-[9px] bg-red-50 text-red-600 px-1 py-0.5 rounded-full">🔒</span>
                        )}
                        <button type="button" onClick={() => setEditingVisibility(p => ({ ...p, [item.id]: !p[item.id] }))}
                          className={`p-1 rounded cursor-pointer shrink-0 ${(item.default_allowed_companies?.length > 0 || item.default_allowed_departments?.length > 0) ? 'text-red-500 hover:bg-red-50' : 'text-gray-400 hover:bg-purple-50 hover:text-purple-600'}`} title="Phân quyền xem">
                          <Shield className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => setEditingChecklist(p => ({ ...p, [item.id]: !p[item.id] }))}
                          className="p-1 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer shrink-0" title="Checklist mẫu">
                          <CheckSquare className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); if (editingItemId === item.id) setEditingItemId(null); else openItemEdit(item); }}
                          className={`p-1 rounded cursor-pointer shrink-0 ${editingItemId === item.id ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'}`} title="Sửa nhiệm vụ mẫu">
                          <Edit2 className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => deleteItem(tpl.id, item.id)}
                          className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer shrink-0" title="Xóa mục">
                          <Trash2 className="h-3 w-3" /></button>
                      </div>
                      {editingItemId === item.id && (
                        <div className="mx-2 mb-2 p-3 bg-sky-50 rounded-lg border border-sky-200 space-y-2" onClick={e => e.stopPropagation()}>
                          <p className="text-[10px] text-sky-700 font-bold uppercase tracking-wide">✏️ Sửa nhiệm vụ mẫu</p>
                          <input
                            value={itemEditForm.title}
                            onChange={e => setItemEditForm(f => ({ ...f, title: e.target.value }))}
                            className="w-full h-8 px-2 rounded border text-sm outline-none focus:ring-2 focus:ring-sky-400"
                            placeholder="Tên nhiệm vụ..."
                          />
                          <textarea
                            value={itemEditForm.description || ''}
                            onChange={e => setItemEditForm(f => ({ ...f, description: e.target.value }))}
                            rows={2}
                            className="w-full px-2 py-1.5 rounded border text-xs outline-none focus:ring-2 focus:ring-sky-400 resize-y min-h-[48px]"
                            placeholder="Mô tả (tuỳ chọn)..."
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={itemEditForm.priority}
                              onChange={e => setItemEditForm(f => ({ ...f, priority: e.target.value }))}
                              className="h-8 px-2 rounded border text-xs bg-white"
                            >
                              <option value="low">Thấp</option>
                              <option value="medium">TB</option>
                              <option value="high">Cao</option>
                              <option value="urgent">Gấp</option>
                            </select>
                            <label className="flex items-center gap-1.5 text-[11px] text-gray-600">
                              <span className="whitespace-nowrap">Hạn +N ngày</span>
                              <input
                                type="number"
                                min={0}
                                value={itemEditForm.deadline_days}
                                onChange={e => setItemEditForm(f => ({ ...f, deadline_days: e.target.value }))}
                                className="h-8 w-16 px-2 rounded border text-xs text-right"
                                title="Số ngày từ khi gắn mẫu đến deadline mặc định"
                              />
                            </label>
                            <span className="flex-1" />
                            <button type="button" onClick={() => setEditingItemId(null)} className="h-8 px-3 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer">
                              Hủy
                            </button>
                            <button type="button" onClick={saveItemEdit} className="h-8 px-3 rounded-lg text-xs font-medium bg-sky-600 text-white hover:bg-sky-700 cursor-pointer flex items-center gap-1">
                              <Save className="h-3 w-3" /> Lưu
                            </button>
                          </div>
                        </div>
                      )}
                      {editingVisibility[item.id] && (
                        <div className="mx-2 mb-2 p-3 bg-purple-50 rounded-lg border border-purple-200 space-y-2">
                          <p className="text-[10px] text-purple-600 font-bold uppercase">🔒 Phân quyền mặc định — tài liệu upload ở nhiệm vụ này</p>
                          <div>
                            <p className="text-[10px] font-semibold text-gray-500 mb-1">🏢 Công ty</p>
                            <div className="flex flex-wrap gap-1">
                              {companies.map(c => (
                                <button key={c.id} type="button" onClick={() => toggleItemCompany(tpl.id, item.id, c.id, item)}
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium cursor-pointer ${
                                    (item.default_allowed_companies || []).includes(c.id) ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border'
                                  }`}>{c.name}</button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold text-gray-500 mb-1">🏬 Phòng ban</p>
                            <div className="flex flex-wrap gap-1">
                              {departments.map(d => (
                                <button key={d.id} type="button" onClick={() => toggleItemDept(tpl.id, item.id, d.id, item)}
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium cursor-pointer ${
                                    (item.default_allowed_departments || []).includes(d.id) ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'
                                  }`}>{d.name}</button>
                              ))}
                            </div>
                          </div>
                          {!(item.default_allowed_companies?.length) && !(item.default_allowed_departments?.length) && (
                            <p className="text-[10px] text-gray-400 italic">Chưa giới hạn — tất cả đều xem được</p>
                          )}
                        </div>
                      )}
                      {editingChecklist[item.id] && (
                        <ChecklistEditor tplId={tpl.id} itemId={item.id}
                          checklist={Array.isArray(item.checklist) ? item.checklist : []}
                          sensors={sensors} handleChecklistDragEnd={handleChecklistDragEnd}
                          removeChecklistItem={removeChecklistItem} addChecklistItem={addChecklistItem}
                          newCheckItem={newCheckItem} setNewCheckItem={setNewCheckItem} />
                      )}
                    </div>
                  )}
                </SortableItem>
              ))}
            </SortableContext>
          </DndContext>

          {/* Add item form */}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t">
            <input value={newItem[tpl.id]?.title || ''} onChange={e => setNewItem(p => ({ ...p, [tpl.id]: { ...(p[tpl.id] || {}), title: e.target.value } }))}
              placeholder="Thêm công việc mẫu..." className="flex-1 h-8 px-2 rounded border text-xs outline-none focus:ring-1 focus:ring-blue-400"
              onKeyDown={e => e.key === 'Enter' && addItem(tpl.id)} />
            <select value={newItem[tpl.id]?.priority || 'medium'} onChange={e => setNewItem(p => ({ ...p, [tpl.id]: { ...(p[tpl.id] || {}), priority: e.target.value } }))}
              className="h-8 px-2 rounded border text-xs bg-white">
              <option value="low">Thấp</option><option value="medium">TB</option><option value="high">Cao</option><option value="urgent">Gấp</option>
            </select>
            <input type="number" value={newItem[tpl.id]?.deadline_days || 0}
              onChange={e => setNewItem(p => ({ ...p, [tpl.id]: { ...(p[tpl.id] || {}), deadline_days: parseInt(e.target.value) || 0 } }))}
              className="h-8 w-16 px-2 rounded border text-xs text-right" placeholder="Ngày" title="Deadline (ngày)" />
            <button onClick={() => addItem(tpl.id)} className="h-8 px-3 bg-blue-600 text-white rounded text-xs cursor-pointer hover:bg-blue-700">
              <Plus className="h-3 w-3" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ Checklist Editor with drag & drop ═══
function ChecklistEditor({ tplId, itemId, checklist, sensors, handleChecklistDragEnd, removeChecklistItem, addChecklistItem, newCheckItem, setNewCheckItem }) {
  const checkIds = checklist.map((_, i) => `ck-${itemId}-${i}`);
  return (
    <div className="ml-10 pl-3 border-l-2 border-emerald-200 mb-2 space-y-1">
      <p className="text-[10px] text-emerald-600 font-medium uppercase tracking-wider">Checklist mẫu — kéo thả để sắp xếp</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter}
        onDragEnd={(e) => handleChecklistDragEnd(e, tplId, itemId)}>
        <SortableContext items={checkIds} strategy={verticalListSortingStrategy}>
          {checklist.map((ck, ci) => (
            <SortableItem key={checkIds[ci]} id={checkIds[ci]}>
              {({ dragHandleProps: ckDrag }) => (
                <div className="flex items-center gap-2 text-xs">
                  <div {...ckDrag} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none">
                    <GripVertical className="h-3 w-3" />
                  </div>
                  <span className="text-emerald-500">☐</span>
                  <span className="flex-1">{ck}</span>
                  <button onClick={() => removeChecklistItem(tplId, itemId, ci)}
                    className="p-0.5 text-gray-300 hover:text-red-500 cursor-pointer"><X className="h-3 w-3" /></button>
                </div>
              )}
            </SortableItem>
          ))}
        </SortableContext>
      </DndContext>
      <div className="flex items-center gap-1 mt-1">
        <input value={newCheckItem[itemId] || ''} onChange={e => setNewCheckItem(p => ({ ...p, [itemId]: e.target.value }))}
          placeholder="Thêm mục checklist..."
          className="flex-1 h-7 px-2 text-xs border rounded outline-none focus:ring-1 focus:ring-emerald-400"
          onKeyDown={e => e.key === 'Enter' && addChecklistItem(tplId, itemId)} />
        <button onClick={() => addChecklistItem(tplId, itemId)}
          className="h-7 px-2 bg-emerald-600 text-white rounded text-xs cursor-pointer hover:bg-emerald-700">
          <Plus className="h-3 w-3" /></button>
      </div>
    </div>
  );
}