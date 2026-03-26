import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Plus, Trash2, Save, ChevronDown, ChevronRight, Edit2, X, CheckSquare, ArrowUp, ArrowDown } from 'lucide-react';

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

export default function CRMTemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [editingTpl, setEditingTpl] = useState(null);
  const [newItem, setNewItem] = useState({});
  const [showAddTpl, setShowAddTpl] = useState(false);
  const [newTpl, setNewTpl] = useState({ name: '', stage_slug: '' });
  const [activeTab, setActiveTab] = useState('deal'); // 'lead' | 'deal'
  const [editingChecklist, setEditingChecklist] = useState({}); // { itemId: true }
  const [newCheckItem, setNewCheckItem] = useState({}); // { itemId: 'text' }

  const currentStages = activeTab === 'lead' ? LEAD_STAGES : DEAL_STAGES;

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/crm/task-templates');
      setTemplates(data || []);
      const exp = {};
      (data || []).forEach(t => { exp[t.id] = true; });
      setExpanded(exp);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Filter templates by active tab (lead/deal)
  const filteredTemplates = templates.filter(t => {
    const isDeal = t.stage_slug?.startsWith('deal_');
    return activeTab === 'deal' ? isDeal : !isDeal;
  });

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
    try { await api.delete(`/crm/task-templates/${id}`); load(); } catch (e) { alert('Lỗi'); }
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

  const toggleDefault = async (tpl) => {
    try { await api.put(`/crm/task-templates/${tpl.id}`, { is_default: !tpl.is_default }); load(); } catch {}
  };

  const updateTemplate = async () => {
    if (!editingTpl || !editingTpl.name.trim()) return;
    try {
      await api.put(`/crm/task-templates/${editingTpl.id}`, {
        name: editingTpl.name.trim(),
        stage_slug: editingTpl.stage_slug,
      });
      setEditingTpl(null);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  // ═══ Checklist CRUD for template items ═══
  const updateItemChecklist = async (tplId, itemId, checklist) => {
    try {
      await api.put(`/crm/task-templates/${tplId}/items/${itemId}`, { checklist });
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi cập nhật checklist'); }
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

  // ═══ Reorder items ═══
  const reorderItem = async (tplId, itemId, direction) => {
    const tpl = templates.find(t => t.id === tplId);
    if (!tpl) return;
    const sorted = [...(tpl.items || [])].sort((a, b) => a.order_index - b.order_index);
    const idx = sorted.findIndex(i => i.id === itemId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    try {
      await api.put(`/crm/task-templates/${tplId}/items/${sorted[idx].id}`, { order_index: sorted[swapIdx].order_index });
      await api.put(`/crm/task-templates/${tplId}/items/${sorted[swapIdx].id}`, { order_index: sorted[idx].order_index });
      load();
    } catch {}
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
            {filteredTemplates.length} bộ mẫu {activeTab === 'deal' ? 'Deal' : 'Lead'} — Áp dụng khi tạo công việc
          </p>
        </div>
        <button onClick={() => { setShowAddTpl(true); setNewTpl({ name: '', stage_slug: currentStages[0]?.slug || '' }); }}
          className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer">
          <Plus className="h-4 w-4" /> Thêm bộ mẫu
        </button>
      </div>

      {/* ═══ Tab Lead / Deal ═══ */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {[
          { key: 'deal', label: '🤝 Deal', desc: 'Quy trình xử lý Deal' },
          { key: 'lead', label: '📞 Lead', desc: 'Quy trình tư vấn Lead' },
        ].map(tab => (
          <button key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              activeTab === tab.key
                ? 'bg-white shadow-sm text-blue-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}>
            {tab.label}
            <span className="block text-[10px] font-normal mt-0.5 opacity-70">{tab.desc}</span>
          </button>
        ))}
      </div>

      {/* ═══ Quy trình stages preview ═══ */}
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
                <span className="ml-1 opacity-60">
                  ({filteredTemplates.filter(t => t.stage_slug === s.slug).length})
                </span>
              </div>
              {i < currentStages.length - 1 && <span className="text-gray-300 mx-1">→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ═══ Add Template Form ═══ */}
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

      {/* ═══ Templates grouped by stage ═══ */}
      {currentStages.map(stage => {
        const stageTpls = filteredTemplates.filter(t => t.stage_slug === stage.slug);
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

            <div className="space-y-2 mb-4">
              {stageTpls.map(tpl => (
                <div key={tpl.id} className="border rounded-xl overflow-hidden bg-white">
                  {/* Header — edit mode */}
                  {editingTpl?.id === tpl.id ? (
                    <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border-b border-blue-200">
                      <input value={editingTpl.name} onChange={e => setEditingTpl(p => ({ ...p, name: e.target.value }))}
                        className="flex-1 h-8 px-2 rounded border text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus onKeyDown={e => e.key === 'Enter' && updateTemplate()} />
                      <select value={editingTpl.stage_slug} onChange={e => setEditingTpl(p => ({ ...p, stage_slug: e.target.value }))}
                        className="h-8 px-2 rounded border text-xs bg-white">
                        {ALL_STAGES.map(s => <option key={s.slug} value={s.slug}>{s.icon} {s.label}</option>)}
                      </select>
                      <button onClick={updateTemplate}
                        className="h-8 px-3 bg-blue-600 text-white rounded text-xs cursor-pointer hover:bg-blue-700 flex items-center gap-1">
                        <Save className="h-3 w-3" /> Lưu
                      </button>
                      <button onClick={() => setEditingTpl(null)} className="h-8 px-2 bg-gray-100 rounded text-xs cursor-pointer">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 cursor-pointer"
                      onClick={() => setExpanded(p => ({ ...p, [tpl.id]: !p[tpl.id] }))}>
                      {expanded[tpl.id] ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                      <span className="text-sm font-semibold flex-1">{tpl.name}</span>
                      {tpl.is_default && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">⭐ Mặc định</span>}
                      <span className="text-xs text-gray-400">{tpl.items?.length || 0} việc</span>
                      <button onClick={(e) => { e.stopPropagation(); setEditingTpl({ id: tpl.id, name: tpl.name, stage_slug: tpl.stage_slug }); }}
                        className="p-1 text-gray-400 hover:text-blue-600 cursor-pointer" title="Sửa tên / chuyển quy trình">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); toggleDefault(tpl); }}
                        className="text-[10px] px-2 py-1 rounded hover:bg-blue-50 text-blue-600 cursor-pointer">
                        {tpl.is_default ? 'Bỏ mặc định' : 'Đặt mặc định'}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteTemplate(tpl.id); }}
                        className="p-1 text-gray-400 hover:text-red-500 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  )}

                  {/* Items */}
                  {expanded[tpl.id] && (
                    <div className="px-4 py-2 space-y-1">
                      {(tpl.items || []).sort((a, b) => a.order_index - b.order_index).map((item, i, arr) => (
                        <div key={item.id}>
                          <div className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-50 group">
                            {/* Reorder */}
                            <div className="flex flex-col gap-0.5">
                              <button onClick={() => reorderItem(tpl.id, item.id, 'up')} disabled={i === 0}
                                className="p-0.5 text-gray-300 hover:text-gray-600 cursor-pointer disabled:opacity-20">
                                <ArrowUp className="h-3 w-3" />
                              </button>
                              <button onClick={() => reorderItem(tpl.id, item.id, 'down')} disabled={i === arr.length - 1}
                                className="p-0.5 text-gray-300 hover:text-gray-600 cursor-pointer disabled:opacity-20">
                                <ArrowDown className="h-3 w-3" />
                              </button>
                            </div>

                            <span className="text-xs text-gray-400 w-5">{i + 1}.</span>
                            <span className="text-sm flex-1">{item.title}</span>

                            {/* Checklist count */}
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

                            {/* Toggle checklist editor */}
                            <button onClick={() => setEditingChecklist(p => ({ ...p, [item.id]: !p[item.id] }))}
                              className="p-1 text-gray-400 hover:text-emerald-600 cursor-pointer" title="Checklist mẫu">
                              <CheckSquare className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => deleteItem(tpl.id, item.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 cursor-pointer">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>

                          {/* Inline checklist editor */}
                          {editingChecklist[item.id] && (
                            <div className="ml-10 pl-3 border-l-2 border-emerald-200 mb-2 space-y-1">
                              <p className="text-[10px] text-emerald-600 font-medium uppercase tracking-wider">Checklist mẫu</p>
                              {(Array.isArray(item.checklist) ? item.checklist : []).map((ck, ci) => (
                                <div key={ci} className="flex items-center gap-2 text-xs">
                                  <span className="text-emerald-500">☐</span>
                                  <span className="flex-1">{ck}</span>
                                  <button onClick={() => removeChecklistItem(tpl.id, item.id, ci)}
                                    className="p-0.5 text-gray-300 hover:text-red-500 cursor-pointer">
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                              <div className="flex items-center gap-1 mt-1">
                                <input value={newCheckItem[item.id] || ''} onChange={e => setNewCheckItem(p => ({ ...p, [item.id]: e.target.value }))}
                                  placeholder="Thêm mục checklist..."
                                  className="flex-1 h-7 px-2 text-xs border rounded outline-none focus:ring-1 focus:ring-emerald-400"
                                  onKeyDown={e => e.key === 'Enter' && addChecklistItem(tpl.id, item.id)} />
                                <button onClick={() => addChecklistItem(tpl.id, item.id)}
                                  className="h-7 px-2 bg-emerald-600 text-white rounded text-xs cursor-pointer hover:bg-emerald-700">
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

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
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Empty state */}
      {filteredTemplates.length === 0 && (
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
