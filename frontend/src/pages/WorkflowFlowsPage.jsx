import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import {
  GitBranch, Plus, Edit, Save, Trash2, Copy, Star, ChevronDown, ChevronRight,
  ArrowRight, Clock, Building2, X, CheckSquare, User, ClipboardList, Layers,
  PlayCircle, FileText, StickyNote
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
          <p className="text-xs text-gray-500 mt-0.5">Luồng → Khối → Công ty → Quy trình nội bộ → Nhiệm vụ → Checklist</p>
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
  const [detail, setDetail] = useState(null);
  const [expandedStepId, setExpandedStepId] = useState(null);
  const [expandedProcessId, setExpandedProcessId] = useState(null);
  const totalTasks = (flow.steps || []).reduce((s, st) => s + (st.task_count || 0), 0);

  const toggleExpand = async () => {
    if (!expanded && !detail) {
      try { const { data } = await api.get(`/flows/${flow.id}`); setDetail(data.flow); } catch {}
    }
    setExpanded(!expanded);
  };

  const steps = detail?.steps || flow.steps || [];

  return (
    <div className="bg-white rounded-xl border overflow-hidden hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3 p-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
          style={{ backgroundColor: (flow.color || '#6366F1') + '15' }}>{flow.icon || '🔄'}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-gray-900">{flow.name}</h3>
            {flow.is_default && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Star className="h-2.5 w-2.5" /> Mặc định</span>}
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
        <button onClick={toggleExpand} className="cursor-pointer shrink-0">
          {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t px-4 py-3 space-y-2 bg-gray-50/50">
          {steps.map((step, i) => {
            const processes = step.processes || [];
            const tasks = step.tasks || [];
            const isStepExpanded = expandedStepId === step.id;
            const divColor = step.division?.level?.color || '#6b7280';
            return (
              <div key={step.id} className="bg-white rounded-lg border overflow-hidden" style={{ borderLeft: `3px solid ${divColor}` }}>
                <button onClick={() => setExpandedStepId(isStepExpanded ? null : step.id)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ backgroundColor: divColor }}>{i + 1}</div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-medium text-gray-900">{step.division?.level?.icon} {step.division?.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {step.company && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded"><Building2 className="h-2 w-2 inline" /> {step.company.short_name || step.company.name}</span>}
                      {processes.length > 0 && <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded"><Layers className="h-2 w-2 inline" /> {processes.length} quy trình</span>}
                    </div>
                  </div>
                  {isStepExpanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                </button>

                {isStepExpanded && (
                  <div className="border-t bg-gray-50/50 p-2 space-y-2">
                    {processes.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold text-purple-600 uppercase px-1 flex items-center gap-1"><Layers className="h-3 w-3" /> Quy trình nội bộ ({processes.length})</p>
                        {processes.map(proc => (
                          <ProcessCard key={proc.id} process={proc}
                            expanded={expandedProcessId === proc.id}
                            onToggle={() => setExpandedProcessId(expandedProcessId === proc.id ? null : proc.id)} />
                        ))}
                      </div>
                    )}
                    {tasks.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-indigo-600 uppercase px-1"><ClipboardList className="h-3 w-3 inline" /> NV mẫu ({tasks.length})</p>
                        <div className="mt-1 space-y-0.5">{tasks.map(t => (
                          <div key={t.id} className="flex items-center gap-1.5 py-1 px-2 bg-white rounded text-[10px]">
                            <CheckSquare className="h-2.5 w-2.5 text-gray-300 shrink-0" />
                            <span className="flex-1 text-gray-800">{t.title}</span>
                            {t.default_assignee && <span className="bg-blue-50 text-blue-600 px-1 rounded text-[9px]"><User className="h-2 w-2 inline" /> {t.default_assignee.full_name?.split(' ').pop()}</span>}
                          </div>
                        ))}</div>
                      </div>
                    )}
                    {processes.length === 0 && tasks.length === 0 && <p className="text-[10px] text-gray-400 italic text-center py-2">Chưa có quy trình hoặc NV mẫu</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══ PROCESS CARD — inline view ═══ */
function ProcessCard({ process, expanded, onToggle }) {
  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const loadTasks = async () => {
    if (loaded) return;
    try {
      const { data } = await api.get(`/company-processes/${process.id}/tasks`);
      setTasks(data.tasks || []);
      setLoaded(true);
    } catch {}
  };

  const handleToggle = () => { if (!expanded) loadTasks(); onToggle(); };

  return (
    <div className="bg-white rounded-lg border overflow-hidden" style={{ borderLeft: `3px solid ${process.color || '#8B5CF6'}` }}>
      <button onClick={handleToggle} className="w-full flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer">
        <span className="text-sm">{process.icon || '📋'}</span>
        <span className="flex-1 text-left text-xs font-medium text-gray-800">{process.name}</span>
        <span className="text-[9px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full">{process.task_count || 0} NV</span>
        {expanded ? <ChevronDown className="h-3 w-3 text-gray-400" /> : <ChevronRight className="h-3 w-3 text-gray-400" />}
      </button>
      {expanded && (
        <div className="border-t bg-purple-50/30 p-2 space-y-0.5">
          {tasks.map(t => (
            <div key={t.id} className="bg-white rounded p-1.5">
              <div className="flex items-center gap-1.5 text-[10px]">
                <CheckSquare className="h-2.5 w-2.5 text-purple-400 shrink-0" />
                <span className="flex-1 font-medium text-gray-800">{t.title}</span>
                {t.default_assignee && <span className="bg-blue-50 text-blue-600 px-1 rounded text-[9px]">{t.default_assignee.full_name?.split(' ').pop()}</span>}
                {(t.deadline_days > 0 || t.deadline_hours > 0) && <span className="bg-orange-50 text-orange-600 px-1 rounded text-[9px]"><Clock className="h-2 w-2 inline" /> {t.deadline_days > 0 ? `${t.deadline_days}d` : ''}{t.deadline_hours > 0 ? `${t.deadline_hours}h` : ''}</span>}
              </div>
              {t.checklists?.length > 0 && (
                <div className="ml-4 mt-0.5 space-y-0">
                  {t.checklists.map(c => (
                    <div key={c.id} className="flex items-center gap-1 text-[9px] text-gray-500">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                      <span>{c.title}</span>
                      {c.require_file && <FileText className="h-2 w-2 text-blue-400" />}
                      {c.require_note && <StickyNote className="h-2 w-2 text-amber-400" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {tasks.length === 0 && <p className="text-[9px] text-gray-400 italic text-center py-1">Chưa có nhiệm vụ</p>}
        </div>
      )}
    </div>
  );
}

/* ═══ FLOW FORM ═══ */
function FlowForm({ flow, divisions, onSaved, onCancel }) {
  const [name, setName] = useState(flow?.name || '');
  const [desc, setDesc] = useState(flow?.description || '');
  const [color, setColor] = useState(flow?.color || '#6366F1');
  const [icon, setIcon] = useState(flow?.icon || '🔄');
  const [isDefault, setIsDefault] = useState(flow?.is_default || false);
  const [steps, setSteps] = useState([]);
  const [saving, setSaving] = useState(false);
  const [companiesMap, setCompaniesMap] = useState({});
  const [processesMap, setProcessesMap] = useState({});
  const [expandedStep, setExpandedStep] = useState(null);

  useEffect(() => {
    if (flow?.steps?.length) {
      setSteps(flow.steps.map(s => ({
        _key: s.id || Math.random().toString(36).slice(2),
        _dbId: s.id,
        division_unit_id: s.division_unit_id,
        company_unit_id: s.company_unit_id || '',
        description: s.description || '',
        selected_process_ids: (s.processes || []).map(p => p.id),
      })));
      flow.steps.forEach(s => {
        loadCompanies(s.division_unit_id);
        if (s.company_unit_id) loadProcesses(s.company_unit_id);
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

  const loadProcesses = async (companyUnitId) => {
    if (processesMap[companyUnitId]) return;
    try {
      const { data } = await api.get(`/company-processes/unit/${companyUnitId}`);
      setProcessesMap(p => ({ ...p, [companyUnitId]: data.processes || [] }));
    } catch {}
  };

  const addStep = (divId) => {
    if (!divId) return;
    setSteps(prev => [...prev, { _key: Math.random().toString(36).slice(2), division_unit_id: divId, company_unit_id: '', description: '', selected_process_ids: [] }]);
    loadCompanies(divId);
  };

  const updateStep = (key, field, value) => {
    setSteps(prev => prev.map(s => {
      if (s._key !== key) return s;
      const updated = { ...s, [field]: value };
      if (field === 'division_unit_id') { updated.company_unit_id = ''; updated.selected_process_ids = []; loadCompanies(value); }
      if (field === 'company_unit_id') { updated.selected_process_ids = []; if (value) loadProcesses(value); }
      return updated;
    }));
  };

  const toggleProcess = (key, processId) => {
    setSteps(prev => prev.map(s => {
      if (s._key !== key) return s;
      const ids = s.selected_process_ids || [];
      return { ...s, selected_process_ids: ids.includes(processId) ? ids.filter(id => id !== processId) : [...ids, processId] };
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

  const generateProcesses = async (companyUnitId, stepKey) => {
    try {
      const { data } = await api.post(`/company-processes/generate-suggestions/${companyUnitId}`);
      alert(`✅ Đã tạo ${data.count} quy trình gợi ý`);
      await loadProcesses(companyUnitId);
      // Auto-select all newly created
      setProcessesMap(prev => {
        const procs = prev[companyUnitId] || [];
        // force reload
        return { ...prev };
      });
      // Reload
      const { data: d2 } = await api.get(`/company-processes/unit/${companyUnitId}`);
      setProcessesMap(p => ({ ...p, [companyUnitId]: d2.processes || [] }));
      // Auto-select all
      setSteps(prev => prev.map(s => s._key === stepKey ? { ...s, selected_process_ids: (d2.processes || []).map(p => p.id) } : s));
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
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
        template_set_id: null,
        order_index: i,
        description: s.description || null,
      }));

      let flowId = flow?.id;
      if (flowId) {
        await api.put(`/flows/${flowId}`, { name, description: desc, color, icon, is_default: isDefault });
        await api.put(`/flows/${flowId}/steps`, { steps: stepsData });
      } else {
        const { data } = await api.post('/flows', { name, description: desc, color, icon, is_default: isDefault, steps: stepsData });
        flowId = data.flow.id;
      }

      // Save process links per step
      const { data: flowData } = await api.get(`/flows/${flowId}`);
      const savedSteps = flowData.flow?.steps || [];
      for (let i = 0; i < steps.length; i++) {
        const stepConfig = steps[i];
        const savedStep = savedSteps[i];
        if (!savedStep) continue;
        const procIds = stepConfig.selected_process_ids || [];
        await api.put(`/company-processes/flow-step/${savedStep.id}/processes`, {
          processes: procIds.map((pid, j) => ({ process_id: pid, order_index: j, is_required: true })),
        });
      }
      onSaved();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  return (
    <div className="bg-indigo-50 rounded-xl border border-indigo-200 p-4 space-y-4">
      <h3 className="text-sm font-bold text-indigo-900">{flow ? '✏️ Sửa luồng' : '➕ Tạo luồng mới'}</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1"><label className="text-[11px] font-medium text-gray-600 block mb-1">Tên luồng *</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm" placeholder="VD: Luồng tủ bếp chuẩn" /></div>
        <div className="col-span-2 sm:col-span-1"><label className="text-[11px] font-medium text-gray-600 block mb-1">Mô tả</label>
          <input value={desc} onChange={e => setDesc(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm" /></div>
        <div><label className="text-[11px] font-medium text-gray-600 block mb-1">Màu</label>
          <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-full h-9 border rounded-lg cursor-pointer" /></div>
        <div><label className="text-[11px] font-medium text-gray-600 block mb-1">Icon</label>
          <div className="flex flex-wrap gap-1">{ICONS.map(i => <button key={i} type="button" onClick={() => setIcon(i)} className={`w-7 h-7 rounded text-sm cursor-pointer ${icon === i ? 'bg-indigo-200 ring-2 ring-indigo-400' : 'bg-white border hover:bg-gray-50'}`}>{i}</button>)}</div></div>
        <div className="col-span-2"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} className="accent-indigo-600" /><span className="text-xs text-gray-700">Luồng mặc định</span></label></div>
      </div>

      {/* Steps builder */}
      <div>
        <label className="text-[11px] font-semibold text-gray-500 uppercase block mb-2">Các bước ({steps.length})</label>
        <div className="space-y-3">
          {steps.map((step, i) => {
            const div = divisions.find(d => d.id === step.division_unit_id);
            const companies = companiesMap[step.division_unit_id] || [];
            const processes = processesMap[step.company_unit_id] || [];
            const divColor = div?.level?.color || '#6b7280';
            const isExpanded = expandedStep === step._key;

            return (
              <div key={step._key} className="bg-white rounded-xl border overflow-hidden" style={{ borderLeft: `4px solid ${divColor}` }}>
                <div className="p-3 space-y-2">
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

                  {step.division_unit_id && (
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      <select value={step.company_unit_id} onChange={e => updateStep(step._key, 'company_unit_id', e.target.value)} className="flex-1 h-8 px-2 border rounded-lg text-xs">
                        <option value="">— Chọn Công ty —</option>
                        {companies.map(c => <option key={c.id} value={c.id}>{c.short_name || c.name}</option>)}
                      </select>
                    </div>
                  )}

                  {step.company_unit_id && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold text-purple-600 flex items-center gap-1"><Layers className="h-3 w-3" /> Quy trình nội bộ ({(step.selected_process_ids || []).length}/{processes.length})</span>
                        {processes.length === 0 && (
                          <button type="button" onClick={() => generateProcesses(step.company_unit_id, step._key)}
                            className="text-[9px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded hover:bg-purple-200 cursor-pointer">⚡ Tạo QT gợi ý</button>
                        )}
                      </div>
                      {processes.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                          {processes.map(p => {
                            const checked = (step.selected_process_ids || []).includes(p.id);
                            return (
                              <label key={p.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs ${checked ? 'border-purple-400 bg-purple-50/50' : 'border-gray-200 hover:border-gray-300'}`}>
                                <input type="checkbox" checked={checked} onChange={() => toggleProcess(step._key, p.id)} className="accent-purple-600" />
                                <span>{p.icon}</span>
                                <span className="flex-1 font-medium">{p.name}</span>
                                <span className="text-[9px] text-gray-400">{p.task_count || 0} NV</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[10px] text-gray-400 italic">Công ty chưa có quy trình — bấm "Tạo QT gợi ý" hoặc tạo thủ công trong trang Quy trình Cty</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {divisions.map(d => (
            <button key={d.id} type="button" onClick={() => addStep(d.id)}
              className="text-[10px] px-2 py-1 rounded-lg border border-dashed hover:bg-white cursor-pointer flex items-center gap-1"
              style={{ borderColor: (d.level?.color || '#6b7280') + '60', color: d.level?.color || '#6b7280' }}>
              <Plus className="h-2.5 w-2.5" /> {d.level?.icon} {d.short_name || d.name}
            </button>
          ))}
        </div>

        {steps.length > 0 && (
          <div className="mt-3 bg-white rounded-lg border p-3">
            <p className="text-[10px] font-medium text-gray-500 mb-1">Preview:</p>
            <div className="flex items-center flex-wrap gap-1">
              {steps.map((step, i) => {
                const div = divisions.find(d => d.id === step.division_unit_id);
                const procs = processesMap[step.company_unit_id] || [];
                const selCount = (step.selected_process_ids || []).length;
                return (
                  <span key={step._key} className="flex items-center gap-1">
                    {i > 0 && <ArrowRight className="h-3 w-3 text-gray-300" />}
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: (div?.level?.color || '#6b7280') + '20', color: div?.level?.color || '#6b7280' }}>
                      {div?.level?.icon} {div?.short_name || div?.name || '?'}
                      {selCount > 0 && <span className="ml-0.5 font-bold">({selCount} QT)</span>}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

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
