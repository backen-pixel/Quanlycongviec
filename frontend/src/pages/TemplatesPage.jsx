import { useState, useEffect } from 'react';
import api from '../lib/api';
import Modal from '../components/Modal';
import { Plus, Trash2, Edit, FileText, GripVertical, CheckSquare, ChevronDown, ChevronRight } from 'lucide-react';
import { PRIORITY_LABELS, PRIORITY_COLORS } from '../lib/utils';

export default function TemplatesPage() {
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTemplate, setEditTemplate] = useState(null);
  const [createStageId, setCreateStageId] = useState(null);
  const [expandedStages, setExpandedStages] = useState({});

  const load = () => {
    setLoading(true);
    api.get('/templates/by-stage').then(r => {
      const s = r.data.stages || [];
      setStages(s);
      // Expand all by default
      const ex = {};
      s.forEach(st => { ex[st.id] = true; });
      setExpandedStages(ex);
    }).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const toggle = (id) => setExpandedStages(e => ({ ...e, [id]: !e[id] }));

  const deleteTemplate = async (id) => {
    if (!confirm('Xóa nhiệm vụ mẫu?')) return;
    await api.delete(`/templates/${id}`); load();
  };

  const totalTemplates = stages.reduce((s, st) => s + (st.templates?.length || 0), 0);

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nhiệm vụ mẫu</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Quản lý nhiệm vụ mẫu cho từng quy trình — {totalTemplates} mẫu · {stages.length} giai đoạn
          </p>
        </div>
        <button onClick={() => { setEditTemplate(null); setCreateStageId(null); setShowCreate(true); }}
          className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer">
          <Plus className="h-4 w-4" /> Thêm mẫu
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>💡 Cách hoạt động:</strong> Khi dự án chuyển sang giai đoạn mới, hệ thống tự động tạo các công việc theo mẫu đã cấu hình. Nếu giai đoạn chưa có mẫu, sẽ dùng nhiệm vụ mặc định.
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg></div>
      ) : (
        <div className="space-y-3">
          {stages.map(stage => (
            <div key={stage.id} className="bg-white rounded-xl border overflow-hidden">
              {/* Stage header */}
              <button onClick={() => toggle(stage.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer">
                {expandedStages[stage.id] ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: stage.color || '#3b82f6' }} />
                <span className="text-sm font-semibold text-gray-900 flex-1 text-left">{stage.name}</span>
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{stage.templates?.length || 0} mẫu</span>
                <button onClick={(e) => { e.stopPropagation(); setCreateStageId(stage.id); setEditTemplate(null); setShowCreate(true); }}
                  className="h-7 px-2 bg-blue-50 text-blue-600 rounded-lg text-xs hover:bg-blue-100 cursor-pointer flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Thêm
                </button>
              </button>

              {/* Templates */}
              {expandedStages[stage.id] && (
                <div className="border-t divide-y">
                  {stage.templates?.length > 0 ? stage.templates.map((t, i) => (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 group">
                      <GripVertical className="h-4 w-4 text-gray-300 shrink-0" />
                      <span className="text-xs text-gray-400 font-mono w-5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{t.title}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${PRIORITY_COLORS[t.priority] || ''}`}>{PRIORITY_LABELS[t.priority]}</span>
                          {t.estimated_hours && <span className="text-[10px] text-gray-400">{t.estimated_hours}h</span>}
                          {t.assignee_role && <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded">→ {t.assignee_role}</span>}
                        </div>
                        {t.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
                        {t.checklist_items?.length > 0 && (
                          <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                            <CheckSquare className="h-3 w-3" /> {t.checklist_items.length} checklist items
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                        <button onClick={() => { setEditTemplate(t); setCreateStageId(t.stage_id); setShowCreate(true); }}
                          className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-blue-500 cursor-pointer">
                          <Edit className="h-3.5 w-3.5" /></button>
                        <button onClick={() => deleteTemplate(t.id)}
                          className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 cursor-pointer">
                          <Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  )) : (
                    <div className="px-4 py-6 text-center text-xs text-gray-400">
                      Chưa có nhiệm vụ mẫu — sẽ dùng mặc định khi chuyển giai đoạn
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <TemplateFormModal open={showCreate} onClose={() => { setShowCreate(false); setEditTemplate(null); }}
        onSaved={load} editTemplate={editTemplate} preStageId={createStageId} stages={stages} />
    </div>
  );
}

function TemplateFormModal({ open, onClose, onSaved, editTemplate, preStageId, stages }) {
  const [form, setForm] = useState({});
  const [checkItems, setCheckItems] = useState([]);
  const [newCheck, setNewCheck] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editTemplate) {
      setForm({ ...editTemplate });
      setCheckItems(editTemplate.checklist_items || []);
    } else {
      setForm({ title: '', description: '', priority: 'medium', stage_id: preStageId || '', estimated_hours: '', assignee_role: '' });
      setCheckItems([]);
    }
  }, [open, editTemplate, preStageId]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const addCheck = () => { if (!newCheck.trim()) return; setCheckItems(c => [...c, newCheck.trim()]); setNewCheck(''); };

  const submit = async (e) => {
    e.preventDefault(); if (!form.title?.trim() || !form.stage_id) return;
    setLoading(true);
    try {
      const payload = { ...form, checklist_items: checkItems, estimated_hours: form.estimated_hours ? +form.estimated_hours : null };
      if (editTemplate) await api.put(`/templates/${editTemplate.id}`, payload);
      else await api.post('/templates', payload);
      onSaved?.(); onClose();
    } catch { }
    setLoading(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={editTemplate ? 'Sửa nhiệm vụ mẫu' : 'Thêm nhiệm vụ mẫu'} size="md">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><label className="block text-sm font-medium mb-1">Tên nhiệm vụ *</label><input value={form.title || ''} onChange={e => set('title', e.target.value)} required className="input" /></div>
          <div><label className="block text-sm font-medium mb-1">Giai đoạn *</label>
            <select value={form.stage_id || ''} onChange={e => set('stage_id', e.target.value)} required className="input">
              <option value="">— Chọn —</option>
              {stages?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
          <div><label className="block text-sm font-medium mb-1">Ưu tiên</label>
            <select value={form.priority || 'medium'} onChange={e => set('priority', e.target.value)} className="input">
              <option value="low">Thấp</option><option value="medium">TB</option><option value="high">Cao</option><option value="urgent">Gấp</option>
            </select></div>
          <div><label className="block text-sm font-medium mb-1">Giờ ước tính</label><input type="number" step="0.5" value={form.estimated_hours || ''} onChange={e => set('estimated_hours', e.target.value)} className="input" /></div>
          <div><label className="block text-sm font-medium mb-1">Vai trò phụ trách</label>
            <select value={form.assignee_role || ''} onChange={e => set('assignee_role', e.target.value)} className="input">
              <option value="">— Không chỉ định —</option>
              <option value="sales">Sales</option><option value="designer">Thiết kế</option>
              <option value="production">Sản xuất</option><option value="installer">Lắp đặt</option>
              <option value="customer_care">CSKH</option><option value="manager">Quản lý</option>
            </select></div>
        </div>
        <div><label className="block text-sm font-medium mb-1">Mô tả</label><textarea value={form.description || ''} onChange={e => set('description', e.target.value)} className="input min-h-[50px]" /></div>
        {/* Checklist template */}
        <div><label className="block text-sm font-medium mb-1">Checklist mẫu</label>
          <div className="space-y-1">{checkItems.map((c, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
              <CheckSquare className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-sm flex-1">{typeof c === 'string' ? c : c.title}</span>
              <button type="button" onClick={() => setCheckItems(ci => ci.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 cursor-pointer text-xs">✕</button>
            </div>
          ))}</div>
          <div className="flex gap-2 mt-2">
            <input value={newCheck} onChange={e => setNewCheck(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCheck())} placeholder="Thêm mục..." className="input flex-1" />
            <button type="button" onClick={addCheck} className="h-9 px-3 bg-gray-100 rounded-lg text-sm cursor-pointer">+</button>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-10 px-4 bg-gray-100 rounded-lg text-sm cursor-pointer">Hủy</button>
          <button type="submit" disabled={loading} className="h-10 px-6 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer">{loading ? 'Lưu...' : editTemplate ? 'Cập nhật' : 'Tạo mẫu'}</button>
        </div>
      </form>
    </Modal>
  );
}
