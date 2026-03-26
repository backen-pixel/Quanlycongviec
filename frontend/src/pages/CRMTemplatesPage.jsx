import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Plus, Trash2, Save, ChevronDown, ChevronRight, GripVertical, Edit2, X } from 'lucide-react';

const STAGES = [
  { slug: 'consulting', label: 'Tư vấn', icon: '💬', color: '#3B82F6' },
  { slug: 'design', label: 'Thiết kế', icon: '🎨', color: '#8B5CF6' },
  { slug: 'quotation', label: 'Báo giá', icon: '💰', color: '#F59E0B' },
  { slug: 'contract', label: 'Hợp đồng', icon: '📝', color: '#10B981' },
];

export default function CRMTemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [editingTpl, setEditingTpl] = useState(null); // { id, name, stage_slug }
  const [newItem, setNewItem] = useState({});
  const [showAddTpl, setShowAddTpl] = useState(false);
  const [newTpl, setNewTpl] = useState({ name: '', stage_slug: 'consulting' });

  const load = async () => {
    setLoading(true);
    const { data } = await api.get('/crm/task-templates');
    setTemplates(data || []);
    const exp = {};
    (data || []).forEach(t => { exp[t.id] = true; });
    setExpanded(exp);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const createTemplate = async () => {
    if (!newTpl.name.trim()) return;
    try {
      await api.post('/crm/task-templates', newTpl);
      setNewTpl({ name: '', stage_slug: 'consulting' });
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
      await api.post(`/crm/task-templates/${tplId}/items`, item);
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

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-3 border-blue-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📋 Bộ nhiệm vụ mẫu CRM</h1>
          <p className="text-sm text-gray-500">{templates.length} bộ mẫu — Áp dụng khi tạo công việc cho Lead/Deal</p>
        </div>
        <button onClick={() => setShowAddTpl(true)} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer">
          <Plus className="h-4 w-4" /> Thêm bộ mẫu
        </button>
      </div>

      {showAddTpl && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-blue-800">Tạo bộ mẫu mới</h3>
          <div className="flex gap-2">
            <input value={newTpl.name} onChange={e => setNewTpl(p => ({...p, name: e.target.value}))}
              placeholder="Tên bộ mẫu..." className="flex-1 h-9 px-3 rounded-lg border text-sm outline-none" autoFocus />
            <select value={newTpl.stage_slug} onChange={e => setNewTpl(p => ({...p, stage_slug: e.target.value}))}
              className="h-9 px-3 rounded-lg border text-sm">
              {STAGES.map(s => <option key={s.slug} value={s.slug}>{s.icon} {s.label}</option>)}
            </select>
            <button onClick={createTemplate} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-700">Tạo</button>
            <button onClick={() => setShowAddTpl(false)} className="h-9 px-3 bg-gray-100 rounded-lg text-sm cursor-pointer">Hủy</button>
          </div>
        </div>
      )}

      {/* Templates grouped by stage */}
      {STAGES.map(stage => {
        const stageTpls = templates.filter(t => t.stage_slug === stage.slug);
        if (!stageTpls.length) return null;
        return (
          <div key={stage.slug}>
            <h2 className="text-sm font-bold mb-2 flex items-center gap-2" style={{color: stage.color}}>
              {stage.icon} {stage.label} <span className="text-gray-400 font-normal">({stageTpls.length} bộ mẫu)</span>
            </h2>
            <div className="space-y-2">
              {stageTpls.map(tpl => (
                <div key={tpl.id} className="border rounded-xl overflow-hidden">
                  {/* Header — edit mode or view mode */}
                  {editingTpl?.id === tpl.id ? (
                    <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border-b border-blue-200">
                      <input value={editingTpl.name} onChange={e => setEditingTpl(p => ({...p, name: e.target.value}))}
                        className="flex-1 h-8 px-2 rounded border text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus onKeyDown={e => e.key === 'Enter' && updateTemplate()} />
                      <select value={editingTpl.stage_slug} onChange={e => setEditingTpl(p => ({...p, stage_slug: e.target.value}))}
                        className="h-8 px-2 rounded border text-xs">
                        {STAGES.map(s => <option key={s.slug} value={s.slug}>{s.icon} {s.label}</option>)}
                      </select>
                      <button onClick={updateTemplate} className="h-8 px-3 bg-blue-600 text-white rounded text-xs cursor-pointer hover:bg-blue-700 flex items-center gap-1">
                        <Save className="h-3 w-3" /> Lưu
                      </button>
                      <button onClick={() => setEditingTpl(null)} className="h-8 px-2 bg-gray-100 rounded text-xs cursor-pointer">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                  <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 cursor-pointer"
                    onClick={() => setExpanded(p => ({...p, [tpl.id]: !p[tpl.id]}))}>
                    {expanded[tpl.id] ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                    <span className="text-sm font-semibold flex-1">{tpl.name}</span>
                    {tpl.is_default && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">⭐ Mặc định</span>}
                    <span className="text-xs text-gray-400">{tpl.items?.length || 0} việc</span>
                    <button onClick={(e) => { e.stopPropagation(); setEditingTpl({ id: tpl.id, name: tpl.name, stage_slug: tpl.stage_slug }); }}
                      className="p-1 text-gray-400 hover:text-blue-600 cursor-pointer" title="Sửa tên"><Edit2 className="h-3.5 w-3.5" /></button>
                    <button onClick={(e) => { e.stopPropagation(); toggleDefault(tpl); }}
                      className="text-[10px] px-2 py-1 rounded hover:bg-blue-50 text-blue-600 cursor-pointer">
                      {tpl.is_default ? 'Bỏ mặc định' : 'Đặt mặc định'}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteTemplate(tpl.id); }}
                      className="p-1 text-gray-400 hover:text-red-500 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  )}
                  {expanded[tpl.id] && (
                    <div className="px-4 py-2 space-y-1">
                      {(tpl.items || []).sort((a,b) => a.order_index - b.order_index).map((item, i) => (
                        <div key={item.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-50 group">
                          <span className="text-xs text-gray-400 w-5">{i + 1}.</span>
                          <span className="text-sm flex-1">{item.title}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                            item.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                            item.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                            item.priority === 'medium' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                          }`}>{item.priority}</span>
                          {item.deadline_days > 0 && <span className="text-[10px] text-gray-400">+{item.deadline_days} ngày</span>}
                          <button onClick={() => deleteItem(tpl.id, item.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 cursor-pointer">
                            <Trash2 className="h-3 w-3" /></button>
                        </div>
                      ))}
                      {/* Add item form */}
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t">
                        <input value={newItem[tpl.id]?.title || ''} onChange={e => setNewItem(p => ({...p, [tpl.id]: {...(p[tpl.id]||{}), title: e.target.value}}))}
                          placeholder="Thêm công việc..." className="flex-1 h-8 px-2 rounded border text-xs outline-none" 
                          onKeyDown={e => e.key === 'Enter' && addItem(tpl.id)} />
                        <select value={newItem[tpl.id]?.priority || 'medium'} onChange={e => setNewItem(p => ({...p, [tpl.id]: {...(p[tpl.id]||{}), priority: e.target.value}}))}
                          className="h-8 px-2 rounded border text-xs">
                          <option value="low">Thấp</option><option value="medium">TB</option><option value="high">Cao</option><option value="urgent">Gấp</option>
                        </select>
                        <input type="number" value={newItem[tpl.id]?.deadline_days || 0} onChange={e => setNewItem(p => ({...p, [tpl.id]: {...(p[tpl.id]||{}), deadline_days: parseInt(e.target.value)||0}}))}
                          className="h-8 w-16 px-2 rounded border text-xs text-right" placeholder="Ngày" title="Deadline (ngày)" />
                        <button onClick={() => addItem(tpl.id)} className="h-8 px-3 bg-blue-600 text-white rounded text-xs cursor-pointer hover:bg-blue-700">
                          <Plus className="h-3 w-3" /></button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
