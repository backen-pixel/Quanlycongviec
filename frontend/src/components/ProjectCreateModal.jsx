import { useState, useEffect, useMemo } from 'react';
import api from '../lib/api';
import Modal from './Modal';
import UserSelect from './UserSelect';
import { FileUploadButton, FilePreview } from './FileUpload';
import {
  Plus, CheckSquare, ChevronDown, ChevronRight, Building2, Trash2,
  AlertTriangle, GitBranch, ArrowRight, Clock, User, ClipboardList, Star
} from 'lucide-react';
import { getInitials, avatarColor } from '../lib/utils';

const PRIORITIES = [
  { value: 'low', label: 'Thấp' },
  { value: 'medium', label: 'TB' },
  { value: 'high', label: 'Cao' },
  { value: 'urgent', label: 'Gấp' },
];

export default function ProjectCreateModal({ open, onClose, onCreated }) {
  // ═══ STATE ═══
  const [step, setStep] = useState(1); // wizard step: 1=KH+Luồng, 2=Chọn Cty+Mẫu, 3=Preview+Info
  const [form, setForm] = useState({});
  const [customers, setCustomers] = useState([]);
  const [flows, setFlows] = useState([]);
  const [selectedFlow, setSelectedFlow] = useState(null);
  const [flowAssignments, setFlowAssignments] = useState([]); // per-step: { division_unit_id, company_unit_id, template_set_id }
  const [stepCompanies, setStepCompanies] = useState({}); // division_id → [companies]
  const [stepTemplateSets, setStepTemplateSets] = useState({}); // division_id → [template_sets]
  const [stepTemplateTasks, setStepTemplateTasks] = useState({}); // template_set_id → [tasks]
  const [quotationFiles, setQuotationFiles] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ full_name: '', phone: '', email: '', city: '' });
  const [expandedSteps, setExpandedSteps] = useState({});

  // ═══ LOAD DATA ═══
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setForm({ name: '', description: '', customer_id: '', install_address: '', estimated_value: '', priority: 'medium' });
    setSelectedFlow(null);
    setFlowAssignments([]);
    setStepCompanies({});
    setStepTemplateSets({});
    setStepTemplateTasks({});
    setQuotationFiles([]);
    setExpandedSteps({});

    Promise.all([
      api.get('/customers').then(r => setCustomers(r.data.customers || [])).catch(() => {}),
      api.get('/flows').then(r => setFlows(r.data.flows || [])).catch(() => setFlows([])),
      api.get('/users').then(r => setAllUsers(r.data.users || [])).catch(() => {}),
    ]);
  }, [open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // ═══ FLOW SELECTION ═══
  const selectFlow = async (flow) => {
    setSelectedFlow(flow);
    const assignments = (flow.steps || []).map((s, i) => ({
      division_unit_id: s.division_unit_id,
      division: s.division,
      company_unit_id: '',
      template_set_id: '',
      order_index: i,
    }));
    setFlowAssignments(assignments);

    // Load companies + template sets for each division
    const compMap = {};
    const tplMap = {};
    for (const s of (flow.steps || [])) {
      try {
        // Get company units under this division
        const { data } = await api.get('/ecosystem/units');
        const units = data.units || [];
        const divChildren = units.filter(u => u.parent_id === s.division_unit_id);
        compMap[s.division_unit_id] = divChildren;

        // Get template sets for all companies under this division
        const sets = [];
        for (const comp of divChildren) {
          try {
            const { data: sData } = await api.get(`/company-templates/units/${comp.id}/template-sets`);
            sets.push(...(sData.sets || []).map(ts => ({ ...ts, company_name: comp.short_name || comp.name })));
          } catch {}
        }
        tplMap[s.division_unit_id] = sets;
      } catch {}
    }
    setStepCompanies(compMap);
    setStepTemplateSets(tplMap);
  };

  // ═══ TEMPLATE SET SELECTION → load tasks ═══
  const selectTemplateSet = async (divId, setId, compId) => {
    setFlowAssignments(prev => prev.map(a =>
      a.division_unit_id === divId ? { ...a, template_set_id: setId, company_unit_id: compId } : a
    ));

    if (setId && !stepTemplateTasks[setId]) {
      try {
        const { data } = await api.get(`/company-templates/template-sets/${setId}/tasks`);
        setStepTemplateTasks(prev => ({ ...prev, [setId]: data.tasks || [] }));
      } catch {}
    }
  };

  // ═══ CREATE CUSTOMER ═══
  const createCustomer = async () => {
    if (!newCust.full_name || !newCust.phone) return;
    try {
      const { data } = await api.post('/customers', newCust);
      setCustomers(c => [data.customer, ...c]);
      setForm(f => ({ ...f, customer_id: data.customer.id }));
      setShowNewCustomer(false);
      setNewCust({ full_name: '', phone: '', email: '', city: '' });
    } catch {}
  };

  // ═══ SUBMIT ═══
  const submit = async () => {
    if (!form.name?.trim()) return alert('Nhập tên dự án');
    if (!form.customer_id) return alert('Chọn khách hàng');

    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description || null,
        customer_id: form.customer_id,
        install_address: form.install_address || null,
        estimated_value: form.estimated_value ? +form.estimated_value : null,
        priority: form.priority || 'medium',
        flow_id: selectedFlow?.id || null,
        flow_assignments: flowAssignments.filter(a => a.company_unit_id && a.template_set_id).map(a => ({
          division_unit_id: a.division_unit_id,
          company_unit_id: a.company_unit_id,
          template_set_id: a.template_set_id,
          order_index: a.order_index,
        })),
        quotation_files: quotationFiles,
      };

      await api.post('/projects/create-with-flow', payload);
      onCreated?.();
      onClose();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi tạo dự án');
    }
    setLoading(false);
  };

  // ═══ COMPUTED ═══
  const totalTasks = flowAssignments.reduce((sum, a) => {
    const tasks = stepTemplateTasks[a.template_set_id] || [];
    return sum + tasks.length;
  }, 0);

  const defaultFlow = flows.find(f => f.is_default);
  const toggleStep = (divId) => setExpandedSteps(p => ({ ...p, [divId]: !p[divId] }));

  return (
    <Modal open={open} onClose={onClose} title="Tạo dự án mới" size="xl">
      <div className="max-h-[82vh] overflow-y-auto pr-1 space-y-4">

        {/* ═══ STEP INDICATOR ═══ */}
        <div className="flex items-center gap-2 pb-2 border-b">
          {[
            { n: 1, label: 'Khách hàng & Luồng' },
            { n: 2, label: 'Chọn công ty & Mẫu' },
            { n: 3, label: 'Xác nhận & Tạo' },
          ].map(s => (
            <button key={s.n} onClick={() => {
              if (s.n === 1) setStep(1);
              else if (s.n === 2 && form.customer_id && selectedFlow) setStep(2);
              else if (s.n === 3 && flowAssignments.some(a => a.template_set_id)) setStep(3);
            }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-all ${
                step === s.n ? 'bg-indigo-600 text-white' :
                step > s.n ? 'bg-green-100 text-green-700' :
                'bg-gray-100 text-gray-400'
              }`}
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border border-current">
                {step > s.n ? '✓' : s.n}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          ))}
        </div>

        {/* ═══ STEP 1: KHÁCH HÀNG + LUỒNG ═══ */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Customer */}
            <div className="bg-gray-50 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">👤 Khách hàng *</h3>
                <button type="button" onClick={() => setShowNewCustomer(!showNewCustomer)} className="text-xs text-blue-600 font-medium cursor-pointer flex items-center gap-1"><Plus className="h-3 w-3" /> Thêm mới</button>
              </div>
              {showNewCustomer ? (
                <div className="bg-white rounded-lg p-3 border space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input value={newCust.full_name} onChange={e => setNewCust(c => ({ ...c, full_name: e.target.value }))} placeholder="Họ tên *" className="input" />
                    <input value={newCust.phone} onChange={e => setNewCust(c => ({ ...c, phone: e.target.value }))} placeholder="SĐT *" className="input" />
                    <input value={newCust.email} onChange={e => setNewCust(c => ({ ...c, email: e.target.value }))} placeholder="Email" className="input" />
                    <input value={newCust.city} onChange={e => setNewCust(c => ({ ...c, city: e.target.value }))} placeholder="Thành phố" className="input" />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={createCustomer} className="h-8 px-3 bg-emerald-600 text-white rounded-lg text-xs font-medium cursor-pointer">Tạo KH</button>
                    <button type="button" onClick={() => setShowNewCustomer(false)} className="h-8 px-3 bg-gray-100 rounded-lg text-xs cursor-pointer">Hủy</button>
                  </div>
                </div>
              ) : (
                <select value={form.customer_id || ''} onChange={e => set('customer_id', e.target.value)} className="input">
                  <option value="">— Chọn khách hàng —</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.full_name} — {c.phone}</option>)}
                </select>
              )}
            </div>

            {/* Flow selection */}
            <div className="bg-indigo-50 rounded-xl p-3 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-indigo-600" /> Chọn luồng *
              </h3>

              {flows.length === 0 ? (
                <p className="text-xs text-gray-500 italic">Chưa có luồng nào. Tạo trong Quản lý luồng trước.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {flows.map(f => (
                    <button key={f.id} type="button" onClick={() => selectFlow(f)}
                      className={`p-3 rounded-xl border-2 text-left cursor-pointer transition-all ${
                        selectedFlow?.id === f.id
                          ? 'border-indigo-500 bg-white shadow-sm'
                          : 'border-transparent bg-white/50 hover:bg-white hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{f.icon || '🔄'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 flex items-center gap-1">
                            {f.name}
                            {f.is_default && <Star className="h-3 w-3 text-amber-500" />}
                          </p>
                          <div className="flex items-center gap-0.5 mt-1 flex-wrap">
                            {(f.steps || []).map((s, i) => (
                              <span key={s.id} className="flex items-center gap-0.5">
                                {i > 0 && <ArrowRight className="h-2.5 w-2.5 text-gray-300" />}
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full"
                                  style={{ backgroundColor: (s.division?.level?.color || '#6b7280') + '20', color: s.division?.level?.color || '#6b7280' }}>
                                  {s.division?.short_name || s.division?.name}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                        {selectedFlow?.id === f.id && <span className="text-indigo-600 text-lg">✓</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button type="button" onClick={() => {
                if (!form.customer_id) return alert('Chọn khách hàng');
                if (!selectedFlow) return alert('Chọn luồng');
                setStep(2);
              }}
                className="h-9 px-6 bg-indigo-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-indigo-700">
                Tiếp theo →
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 2: CHỌN CÔNG TY + MẪU CHO MỖI KHỐI ═══ */}
        {step === 2 && selectedFlow && (
          <div className="space-y-4">
            <div className="bg-indigo-50 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <GitBranch className="h-4 w-4 text-indigo-600" />
                <h3 className="text-sm font-semibold text-gray-900">Luồng: {selectedFlow.icon} {selectedFlow.name}</h3>
              </div>
              <p className="text-xs text-gray-500">Chọn công ty và dự án mẫu cho từng khối trong luồng</p>
            </div>

            {flowAssignments.map((assignment, idx) => {
              const div = assignment.division;
              const companies = stepCompanies[assignment.division_unit_id] || [];
              const templateSets = stepTemplateSets[assignment.division_unit_id] || [];
              const selectedSetId = assignment.template_set_id;
              const tasks = stepTemplateTasks[selectedSetId] || [];
              const isExpanded = expandedSteps[assignment.division_unit_id];
              const divColor = div?.level?.color || '#6b7280';

              return (
                <div key={assignment.division_unit_id} className="bg-white rounded-xl border overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center gap-3 p-4" style={{ borderLeft: `4px solid ${divColor}` }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ backgroundColor: divColor }}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-gray-900">
                        {div?.level?.icon} {div?.name || 'Khối'}
                      </h4>
                    </div>
                    {selectedSetId && (
                      <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        ✓ {tasks.length} NV
                      </span>
                    )}
                    {idx < flowAssignments.length - 1 && (
                      <ArrowRight className="h-4 w-4 text-gray-300 shrink-0" />
                    )}
                  </div>

                  {/* Selection area */}
                  <div className="px-4 pb-4 space-y-3">
                    {/* Select template set (grouped by company) */}
                    <div>
                      <label className="text-[11px] font-medium text-gray-600 block mb-1">Dự án mẫu *</label>
                      {templateSets.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">Chưa có dự án mẫu cho khối này</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {templateSets.map(ts => {
                            const isSelected = selectedSetId === ts.id;
                            return (
                              <button key={ts.id} type="button"
                                onClick={() => selectTemplateSet(assignment.division_unit_id, ts.id, ts.unit_id)}
                                className={`p-2.5 rounded-lg border-2 text-left cursor-pointer transition-all ${
                                  isSelected ? 'border-indigo-500 bg-indigo-50/50' : 'border-gray-200 hover:border-gray-300'
                                }`}
                              >
                                <p className="text-xs font-semibold text-gray-900 flex items-center gap-1">
                                  <ClipboardList className="h-3 w-3 text-indigo-500" />
                                  {ts.name}
                                  {ts.is_default && <Star className="h-2.5 w-2.5 text-amber-500" />}
                                </p>
                                <p className="text-[10px] text-gray-400 mt-0.5">
                                  {ts.company_name} · {ts.task_count || 0} NV
                                  {ts.project_type && ` · ${ts.project_type}`}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Preview tasks from selected template */}
                    {selectedSetId && tasks.length > 0 && (
                      <div>
                        <button type="button" onClick={() => toggleStep(assignment.division_unit_id)}
                          className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 cursor-pointer">
                          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          Xem {tasks.length} nhiệm vụ mẫu
                        </button>

                        {isExpanded && (
                          <div className="mt-2 bg-gray-50 rounded-lg p-2 space-y-1 max-h-[200px] overflow-y-auto">
                            {tasks.map(t => (
                              <div key={t.id} className="flex items-center gap-2 py-1 px-2 bg-white rounded">
                                <CheckSquare className="h-3 w-3 text-gray-300 shrink-0" />
                                <span className="text-xs text-gray-800 flex-1 truncate">{t.title}</span>
                                {t.default_assignee && (
                                  <span className="text-[8px] bg-blue-50 text-blue-600 px-1 rounded flex items-center gap-0.5 shrink-0">
                                    <User className="h-2 w-2" />
                                    {t.default_assignee.full_name?.split(' ').pop()}
                                  </span>
                                )}
                                {(t.deadline_days > 0 || t.deadline_hours > 0) && (
                                  <span className="text-[8px] bg-orange-50 text-orange-600 px-1 rounded flex items-center gap-0.5 shrink-0">
                                    <Clock className="h-2 w-2" />
                                    {t.deadline_days > 0 && `${t.deadline_days}d`}{t.deadline_hours > 0 && `${t.deadline_hours}h`}
                                  </span>
                                )}
                                <span className={`text-[8px] px-1 rounded ${
                                  t.priority === 'urgent' ? 'bg-red-50 text-red-600' :
                                  t.priority === 'high' ? 'bg-orange-50 text-orange-600' :
                                  'bg-gray-50 text-gray-500'
                                }`}>
                                  {t.priority === 'urgent' ? 'Gấp' : t.priority === 'high' ? 'Cao' : t.priority === 'medium' ? 'TB' : 'Thấp'}
                                </span>
                                {t.checklists?.length > 0 && (
                                  <span className="text-[8px] text-gray-400 shrink-0">📋{t.checklists.length}</span>
                                )}
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

            <div className="flex justify-between">
              <button type="button" onClick={() => setStep(1)}
                className="h-9 px-4 bg-gray-100 text-gray-700 rounded-lg text-sm cursor-pointer">← Quay lại</button>
              <button type="button" onClick={() => {
                if (!flowAssignments.some(a => a.template_set_id)) return alert('Chọn ít nhất 1 dự án mẫu');
                setStep(3);
              }}
                className="h-9 px-6 bg-indigo-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-indigo-700">
                Tiếp theo →
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 3: THÔNG TIN DỰ ÁN + XÁC NHẬN ═══ */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Project info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium mb-1">Tên dự án *</label>
                <input value={form.name || ''} onChange={e => set('name', e.target.value)} className="input" placeholder="VD: Tủ bếp anh Minh — Q7" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium mb-1">Mô tả</label>
                <textarea value={form.description || ''} onChange={e => set('description', e.target.value)} className="input min-h-[40px]" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Giá trị (VNĐ)</label>
                <input type="number" value={form.estimated_value || ''} onChange={e => set('estimated_value', e.target.value)} className="input" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Địa chỉ lắp đặt</label>
                <input value={form.install_address || ''} onChange={e => set('install_address', e.target.value)} className="input" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Ưu tiên</label>
                <select value={form.priority || 'medium'} onChange={e => set('priority', e.target.value)} className="input">
                  {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>

            {/* Quotation files */}
            <div className="bg-amber-50 rounded-xl p-3 space-y-2">
              <h3 className="text-sm font-semibold text-gray-900">📄 File báo giá</h3>
              <FileUploadButton onFilesUploaded={(f) => setQuotationFiles(qf => [...qf, ...f])} />
              <FilePreview files={quotationFiles} onRemove={(i) => setQuotationFiles(f => f.filter((_, j) => j !== i))} />
            </div>

            {/* Summary */}
            <div className="bg-green-50 rounded-xl p-3 space-y-2">
              <h3 className="text-sm font-semibold text-gray-900">📋 Tóm tắt</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-gray-500">Khách hàng:</span> <span className="font-medium">{customers.find(c => c.id === form.customer_id)?.full_name || '—'}</span></div>
                <div><span className="text-gray-500">Luồng:</span> <span className="font-medium">{selectedFlow?.icon} {selectedFlow?.name || '—'}</span></div>
                <div><span className="text-gray-500">Tổng NV mẫu:</span> <span className="font-bold text-indigo-600">{totalTasks}</span></div>
                <div><span className="text-gray-500">Khối:</span> <span className="font-medium">{flowAssignments.filter(a => a.template_set_id).length}/{flowAssignments.length}</span></div>
              </div>

              {/* Flow preview */}
              <div className="flex items-center flex-wrap gap-1 mt-2">
                {flowAssignments.map((a, i) => {
                  const tasks = stepTemplateTasks[a.template_set_id] || [];
                  const tplSet = (stepTemplateSets[a.division_unit_id] || []).find(s => s.id === a.template_set_id);
                  const divColor = a.division?.level?.color || '#6b7280';
                  return (
                    <span key={a.division_unit_id} className="flex items-center gap-1">
                      {i > 0 && <ArrowRight className="h-3 w-3 text-gray-300" />}
                      <span className="text-[10px] px-2 py-1 rounded-lg border" style={{ borderColor: divColor + '40', backgroundColor: divColor + '10', color: divColor }}>
                        {a.division?.level?.icon} {a.division?.short_name || a.division?.name}
                        {tplSet && <span className="ml-1 opacity-60">· {tplSet.name}</span>}
                        {tasks.length > 0 && <span className="ml-1 font-bold">({tasks.length} NV)</span>}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-between pt-2">
              <button type="button" onClick={() => setStep(2)}
                className="h-9 px-4 bg-gray-100 text-gray-700 rounded-lg text-sm cursor-pointer">← Quay lại</button>
              <button type="button" onClick={submit} disabled={loading}
                className="h-10 px-6 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50">
                {loading ? 'Đang tạo...' : `🚀 Tạo dự án (${totalTasks} NV)`}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
