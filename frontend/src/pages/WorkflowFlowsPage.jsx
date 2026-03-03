import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import {
  GitBranch, Plus, Edit, Save, Trash2, Copy, Star, ChevronDown, ChevronRight,
  ArrowRight, Clock, Building2, X, CheckSquare, User, ClipboardList
} from 'lucide-react';

const ICONS = ['🔄','📋','🏭','🚛','🔧','❤️','💼','⭐','🏗️','🛡️','📊','🏠'];

export default function WorkflowFlowsPage() {
  const [flows, setFlows] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fRes, uRes] = await Promise.all([api.get('/flows'), api.get('/ecosystem/units')]);
      setFlows(fRes.data.flows || []);
      setDivisions((uRes.data.units || []).filter(u => u.level?.depth === 1));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const deleteFlow = async (id) => {
    if (!confirm('Vô hiệu hóa luồng này?')) return;
    try { await api.delete(`/flows/${id}`); load(); } catch {}
  };
  const cloneFlow = async (id) => {
    try { await api.post(`/flows/${id}/clone`); load(); } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };
  const setDefault = async (id) => {
    try { await api.put(`/flows/${id}`, { is_default: true }); load(); } catch {}
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-blue-200 border-t-blue-600 rounded-full" /></div>;

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-indigo-600" /> Quản Lý Luồng
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Mỗi luồng = bản thiết kế hoàn chỉnh cho dự án: Khối → Công ty → Mẫu NV</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="h-9 px-4 bg-indigo-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-indigo-700 cursor-pointer">
          <Plus className="h-4 w-4" /> Tạo luồng
        </button>
      </div>

      {showCreate && <FlowForm divisions={divisions} onSaved={() => { load(); setShowCreate(false); }} onCancel={() => setShowCreate(false)} />}

      <div className="space-y-3">
        {flows.map(f => editId === f.id
          ? <FlowForm key={f.id} flow={f} divisions={divisions} onSaved={() => { load(); setEditId(null); }} onCancel={() => setEditId(null)} />
          : <FlowCard key={f.id} flow={f} onEdit={() => setEditId(f.id)} onDelete={() => deleteFlow(f.id)} onClone={() => cloneFlow(f.id)} onSetDefault={() => setDefault(f.id)} />
        )}
      </div>

      {flows.length === 0 && !showCreate && (
        <div className="text-center py-16 bg-white rounded-2xl border">
          <GitBranch className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-500">Chưa có luồng nào</p>
        </div>
      )}
    </div>
  );
}

/* ═══ FLOW CARD ═══ */
function FlowCard({ flow, onEdit, onDelete, onClone, onSetDefault }) {
  const [expanded, setExpanded] = useState(false);
  const totalTasks = (flow.steps || []).reduce((s, st) => s + (st.task_count || 0), 0);

  return (
    <div className="bg-white rounded-xl border overflow-hidden hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3 p-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
          style={{ backgroundColor: (flow.color || '#6366F1') + '15' }}>{flow.icon || '🔄'}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-gray-900">{flow.name}</h3>
            {flow.is_default && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Star className="h-2.5 w-2.5" /> Mặc định</span>}
            <span className="text-[9px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full">{totalTasks} NV</span>
          </div>
          {flow.description && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{flow.description}</p>}
        </div>

        <div className="hidden sm:flex items-center gap-1 shrink-0 max-w-[450px] overflow-x-auto">
          {(flow.steps || []).map((step, i) => (
            <span key={step.id} className="flex items-center gap-1 shrink-0">
              {i > 0 && <ArrowRight className="h-3 w-3 text-gray-300 shrink-0" />}
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
                style={{ backgroundColor: (step.division?.level?.color || '#6b7280') + '20', color: step.division?.level?.color || '#6b7280' }}>
                {step.division?.level?.icon} {step.division?.short_name || step.division?.name}
                {step.company && <span className="opacity-60"> · {step.company.short_name || step.company.name}</span>}
                {step.task_count > 0 && <span className="ml-0.5 font-bold">({step.task_count})</span>}
              </span>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!flow.is_default && <button onClick={onSetDefault} className="w-7 h-7 rounded-lg hover:bg-amber-50 flex items-center justify-center text-gray-400 hover:text-amber-600 cursor-pointer" title="Mặc định"><Star className="h-3.5 w-3.5" /></button>}
          <button onClick={onClone} className="w-7 h-7 rounded-lg hover:bg-blue-50 flex items-center justify-center text-gray-400 hover:text-blue-600 cursor-pointer" title="Nhân bản"><Copy className="h-3.5 w-3.5" /></button>
          <button onClick={onEdit} className="w-7 h-7 rounded-lg hover:bg-indigo-50 flex items-center justify-center text-gray-400 hover:text-indigo-600 cursor-pointer" title="Sửa"><Edit className="h-3.5 w-3.5" /></button>
          <button onClick={onDelete} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 cursor-pointer" title="Xóa"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>

        <button onClick={() => setExpanded(!expanded)} className="cursor-pointer shrink-0">
          {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t px-4 py-3 space-y-2 bg-gray-50/50">
          {(flow.steps || []).map((step, i) => (
            <div key={step.id} className="flex items-start gap-3 bg-white rounded-lg border p-3">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ backgroundColor: step.division?.level?.color || '#6b7280' }}>{i + 1}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{step.division?.level?.icon} {step.division?.name}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {step.company && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded"><Building2 className="h-2 w-2 inline" /> {step.company.short_name || step.company.name}</span>}
                  {step.template_set && <span className="text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded"><ClipboardList className="h-2 w-2 inline" /> {step.template_set.name}</span>}
                  {step.task_count > 0 && <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">{step.task_count} NV</span>}
                </div>
                {step.description && <p className="text-[10px] text-gray-400 mt-0.5">{step.description}</p>}
              </div>
              {i < (flow.steps || []).length - 1 && <ArrowRight className="h-4 w-4 text-gray-300 shrink-0 mt-1" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══ FLOW FORM — Full setup: Khối → Công ty → Mẫu ═══ */
function FlowForm({ flow, divisions, onSaved, onCancel }) {
  const [name, setName] = useState(flow?.name || '');
  const [desc, setDesc] = useState(flow?.description || '');
  const [color, setColor] = useState(flow?.color || '#6366F1');
  const [icon, setIcon] = useState(flow?.icon || '🔄');
  const [isDefault, setIsDefault] = useState(flow?.is_default || false);
  const [steps, setSteps] = useState([]);
  const [saving, setSaving] = useState(false);
  const [companiesMap, setCompaniesMap] = useState({}); // divId → [companies]
  const [tplSetsMap, setTplSetsMap] = useState({}); // companyId → [template_sets]
  const [tplTasksMap, setTplTasksMap] = useState({}); // setId → [tasks]
  const [expandedStep, setExpandedStep] = useState(null);

  // Init steps from flow
  useEffect(() => {
    if (flow?.steps?.length) {
      setSteps(flow.steps.map(s => ({
        _key: s.id || Math.random().toString(36).slice(2),
        division_unit_id: s.division_unit_id,
        company_unit_id: s.company_unit_id || '',
        template_set_id: s.template_set_id || '',
        description: s.description || '',
      })));
      // Pre-load companies + sets for existing steps
      flow.steps.forEach(s => {
        loadCompanies(s.division_unit_id);
        if (s.company_unit_id) loadTemplateSets(s.company_unit_id, s.division_unit_id);
        if (s.template_set_id) loadTasks(s.template_set_id);
      });
    }
  }, [flow]);

  const loadCompanies = async (divId) => {
    if (companiesMap[divId]) return;
    try {
      const { data } = await api.get('/ecosystem/units');
      const units = (data.units || []).filter(u => u.parent_id === divId);
      setCompaniesMap(p => ({ ...p, [divId]: units }));
    } catch {}
  };

  const loadTemplateSets = async (companyId, divId) => {
    const cacheKey = companyId || divId;
    if (tplSetsMap[cacheKey]) return;
    try {
      // If company selected, load its sets. Otherwise load all in division
      if (companyId) {
        const { data } = await api.get(`/company-templates/units/${companyId}/template-sets`);
        setTplSetsMap(p => ({ ...p, [cacheKey]: data.sets || [] }));
      }
    } catch {}
  };

  const loadTasks = async (setId) => {
    if (!setId || tplTasksMap[setId]) return;
    try {
      const { data } = await api.get(`/company-templates/template-sets/${setId}/tasks`);
      setTplTasksMap(p => ({ ...p, [setId]: data.tasks || [] }));
    } catch {}
  };

  const addStep = (divId) => {
    if (!divId) return;
    const key = Math.random().toString(36).slice(2);
    setSteps(prev => [...prev, { _key: key, division_unit_id: divId, company_unit_id: '', template_set_id: '', description: '' }]);
    loadCompanies(divId);
  };

  const updateStep = (key, field, value) => {
    setSteps(prev => prev.map(s => {
      if (s._key !== key) return s;
      const updated = { ...s, [field]: value };
      // Reset downstream when parent changes
      if (field === 'division_unit_id') {
        updated.company_unit_id = '';
        updated.template_set_id = '';
        loadCompanies(value);
      }
      if (field === 'company_unit_id') {
        updated.template_set_id = '';
        if (value) loadTemplateSets(value, s.division_unit_id);
      }
      if (field === 'template_set_id' && value) {
        loadTasks(value);
      }
      return updated;
    }));
  };

  const removeStep = (key) => setSteps(prev => prev.filter(s => s._key !== key));
  const moveStep = (key, dir) => {
    setSteps(prev => {
      const idx = prev.findIndex(s => s._key === key);
      if (idx < 0) return prev;
      const ni = idx + dir;
      if (ni < 0 || ni >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[ni]] = [arr[ni], arr[idx]];
      return arr;
    });
  };

  const save = async () => {
    if (!name.trim()) return alert('Nhập tên luồng');
    if (steps.length === 0) return alert('Thêm ít nhất 1 bước');
    setSaving(true);
    try {
      const opt = v => (v && v.trim && v.trim()) ? v.trim() : null;
      const stepsData = steps.map((s, i) => ({
        division_unit_id: s.division_unit_id,
        company_unit_id: opt(s.company_unit_id),
        template_set_id: opt(s.template_set_id),
        order_index: i,
        description: s.description || null,
      }));
      if (flow?.id) {
        await api.put(`/flows/${flow.id}`, { name, description: desc, color, icon, is_default: isDefault });
        await api.put(`/flows/${flow.id}/steps`, { steps: stepsData });
      } else {
        await api.post('/flows', { name, description: desc, color, icon, is_default: isDefault, steps: stepsData });
      }
      onSaved();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  return (
    <div className="bg-indigo-50 rounded-xl border border-indigo-200 p-4 space-y-4">
      <h3 className="text-sm font-bold text-indigo-900">{flow ? '✏️ Sửa luồng' : '➕ Tạo luồng mới'}</h3>

      {/* Basic info */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="text-[11px] font-medium text-gray-600 block mb-1">Tên luồng *</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm" placeholder="VD: Luồng tủ bếp chuẩn" />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="text-[11px] font-medium text-gray-600 block mb-1">Mô tả</label>
          <input value={desc} onChange={e => setDesc(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm" />
        </div>
        <div>
          <label className="text-[11px] font-medium text-gray-600 block mb-1">Màu</label>
          <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-full h-9 border rounded-lg cursor-pointer" />
        </div>
        <div>
          <label className="text-[11px] font-medium text-gray-600 block mb-1">Icon</label>
          <div className="flex flex-wrap gap-1">
            {ICONS.map(i => <button key={i} type="button" onClick={() => setIcon(i)} className={`w-7 h-7 rounded text-sm cursor-pointer ${icon === i ? 'bg-indigo-200 ring-2 ring-indigo-400' : 'bg-white border hover:bg-gray-50'}`}>{i}</button>)}
          </div>
        </div>
        <div className="col-span-2">
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} className="accent-indigo-600" /><span className="text-xs text-gray-700">Luồng mặc định</span></label>
        </div>
      </div>

      {/* Steps builder */}
      <div>
        <label className="text-[11px] font-semibold text-gray-500 uppercase block mb-2">Các bước ({steps.length})</label>
        <div className="space-y-3">
          {steps.map((step, i) => {
            const div = divisions.find(d => d.id === step.division_unit_id);
            const companies = companiesMap[step.division_unit_id] || [];
            const tplSets = tplSetsMap[step.company_unit_id] || [];
            const tasks = tplTasksMap[step.template_set_id] || [];
            const isExpanded = expandedStep === step._key;
            const divColor = div?.level?.color || '#6b7280';

            return (
              <div key={step._key} className="bg-white rounded-xl border overflow-hidden" style={{ borderLeft: `4px solid ${divColor}` }}>
                <div className="p-3 space-y-2">
                  {/* Row 1: step number + division + move/delete */}
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: divColor }}>{i + 1}</div>
                    <select value={step.division_unit_id} onChange={e => updateStep(step._key, 'division_unit_id', e.target.value)} className="flex-1 h-8 px-2 border rounded-lg text-xs font-medium">
                      <option value="">— Chọn Khối —</option>
                      {divisions.map(d => <option key={d.id} value={d.id}>{d.level?.icon} {d.name}</option>)}
                    </select>
                    <div className="flex gap-0.5 shrink-0">
                      <button type="button" onClick={() => moveStep(step._key, -1)} disabled={i === 0} className="w-6 h-6 rounded text-gray-400 hover:bg-gray-100 flex items-center justify-center cursor-pointer disabled:opacity-30 text-[10px]">▲</button>
                      <button type="button" onClick={() => moveStep(step._key, 1)} disabled={i === steps.length - 1} className="w-6 h-6 rounded text-gray-400 hover:bg-gray-100 flex items-center justify-center cursor-pointer disabled:opacity-30 text-[10px]">▼</button>
                      <button type="button" onClick={() => removeStep(step._key)} className="w-6 h-6 rounded text-red-400 hover:bg-red-50 flex items-center justify-center cursor-pointer"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  </div>

                  {/* Row 2: Company select */}
                  {step.division_unit_id && (
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      <select value={step.company_unit_id} onChange={e => updateStep(step._key, 'company_unit_id', e.target.value)} className="flex-1 h-8 px-2 border rounded-lg text-xs">
                        <option value="">— Chọn công ty —</option>
                        {companies.map(c => <option key={c.id} value={c.id}>{c.short_name || c.name}</option>)}
                      </select>
                      {companies.length === 0 && <span className="text-[9px] text-gray-400 italic">Chưa có CTy trong khối</span>}
                    </div>
                  )}

                  {/* Row 3: Template set select */}
                  {step.company_unit_id && (
                    <div className="flex items-center gap-2">
                      <ClipboardList className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      <select value={step.template_set_id} onChange={e => updateStep(step._key, 'template_set_id', e.target.value)} className="flex-1 h-8 px-2 border rounded-lg text-xs">
                        <option value="">— Chọn dự án mẫu —</option>
                        {tplSets.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_default ? ' ⭐' : ''}{s.project_type ? ` (${s.project_type})` : ''}</option>)}
                      </select>
                      {tplSets.length === 0 && <span className="text-[9px] text-gray-400 italic">Chưa có mẫu</span>}
                    </div>
                  )}

                  {/* Row 4: Tasks preview */}
                  {step.template_set_id && tasks.length > 0 && (
                    <div>
                      <button type="button" onClick={() => setExpandedStep(isExpanded ? null : step._key)}
                        className="flex items-center gap-1 text-[10px] font-medium text-indigo-600 cursor-pointer">
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        {tasks.length} nhiệm vụ mẫu
                      </button>
                      {isExpanded && (
                        <div className="mt-1 bg-gray-50 rounded-lg p-2 space-y-0.5 max-h-[180px] overflow-y-auto">
                          {tasks.map(t => (
                            <div key={t.id} className="flex items-center gap-1.5 py-1 px-2 bg-white rounded text-[10px]">
                              <CheckSquare className="h-2.5 w-2.5 text-gray-300 shrink-0" />
                              <span className="flex-1 truncate text-gray-800">{t.title}</span>
                              {t.default_assignee && <span className="bg-blue-50 text-blue-600 px-1 rounded shrink-0"><User className="h-2 w-2 inline" /> {t.default_assignee.full_name?.split(' ').pop()}</span>}
                              {(t.deadline_days > 0 || t.deadline_hours > 0) && <span className="bg-orange-50 text-orange-600 px-1 rounded shrink-0"><Clock className="h-2 w-2 inline" /> {t.deadline_days > 0 ? `${t.deadline_days}d` : ''}{t.deadline_hours > 0 ? `${t.deadline_hours}h` : ''}</span>}
                              {t.checklists?.length > 0 && <span className="text-gray-400 shrink-0">📋{t.checklists.length}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add step buttons */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {divisions.map(d => (
            <button key={d.id} type="button" onClick={() => addStep(d.id)}
              className="text-[10px] px-2 py-1 rounded-lg border border-dashed hover:bg-white cursor-pointer flex items-center gap-1 transition-colors"
              style={{ borderColor: (d.level?.color || '#6b7280') + '60', color: d.level?.color || '#6b7280' }}>
              <Plus className="h-2.5 w-2.5" /> {d.level?.icon} {d.short_name || d.name}
            </button>
          ))}
        </div>

        {/* Preview bar */}
        {steps.length > 0 && (
          <div className="mt-3 bg-white rounded-lg border p-3">
            <p className="text-[10px] font-medium text-gray-500 mb-1">Preview luồng:</p>
            <div className="flex items-center flex-wrap gap-1">
              {steps.map((step, i) => {
                const div = divisions.find(d => d.id === step.division_unit_id);
                const companies = companiesMap[step.division_unit_id] || [];
                const comp = companies.find(c => c.id === step.company_unit_id);
                const tasks = tplTasksMap[step.template_set_id] || [];
                return (
                  <span key={step._key} className="flex items-center gap-1">
                    {i > 0 && <ArrowRight className="h-3 w-3 text-gray-300" />}
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: (div?.level?.color || '#6b7280') + '20', color: div?.level?.color || '#6b7280' }}>
                      {div?.level?.icon} {div?.short_name || div?.name || '?'}
                      {comp && <span className="opacity-60"> · {comp.short_name || comp.name}</span>}
                      {tasks.length > 0 && <span className="ml-0.5 font-bold">({tasks.length})</span>}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="h-8 px-3 border rounded-lg text-xs text-gray-600 cursor-pointer">Hủy</button>
        <button type="button" onClick={save} disabled={saving}
          className="h-8 px-4 bg-indigo-600 text-white rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
          {saving ? 'Đang lưu...' : <><Save className="h-3.5 w-3.5" /> Lưu</>}
        </button>
      </div>
    </div>
  );
}
