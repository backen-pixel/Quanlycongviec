import { useState, useEffect } from 'react';
import api from '../lib/api';
import { FileUploadButton, FilePreview } from './FileUpload';
import ProcessTaskEditor from './ProcessTaskEditor';
import {
  Plus, ChevronDown, ChevronRight, X, CheckSquare, User, ClipboardList, Layers,
  FileText, StickyNote, GitBranch, ArrowRight, Clock, Building2, Save
} from 'lucide-react';

export default function ProjectCreateModalFullScreen({ open, onClose, onCreated, dealData }) {
  const [form, setForm] = useState({});
  const [customers, setCustomers] = useState([]);
  const [flows, setFlows] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedFlow, setSelectedFlow] = useState(null);
  const [flowDetail, setFlowDetail] = useState(null);
  const [quotationFiles, setQuotationFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ full_name: '', phone: '', email: '', city: '' });
  const [expandedSteps, setExpandedSteps] = useState({});
  const [expandedProcesses, setExpandedProcesses] = useState({});
  const [assignmentModal, setAssignmentModal] = useState(null); // {type: 'task'|'checklist', id, name, process_id}
  const [selectedAssignee, setSelectedAssignee] = useState('');

  useEffect(() => {
    if (!open) return;
    // Auto-fill from deal if provided
    const initForm = {
      name: dealData?.title || '',
      description: dealData?.description || '',
      customer_id: dealData?.customer_id || '',
      install_address: dealData?.customer?.address || '',
      estimated_value: dealData?.estimated_value || '',
      priority: 'medium',
    };
    setForm(initForm);
    setSelectedFlow(null);
    setFlowDetail(null);
    setQuotationFiles([]);
    setExpandedSteps({});
    setExpandedProcesses({});
    setAssignmentModal(null);

    Promise.all([
      api.get('/customers').then(r => setCustomers(r.data.customers || [])).catch(() => {}),
      api.get('/users').then(r => setUsers(r.data.users || [])).catch(() => {}),
      api.get('/flows').then(r => {
        const list = r.data.flows || [];
        setFlows(list);
        const active = list.filter((f) => f.is_active !== false);
        if (active.length === 1) selectFlow(active[0]);
      }).catch(() => setFlows([])),
    ]);
  }, [open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const selectFlow = async (flow) => {
    setSelectedFlow(flow);
    try {
      const { data } = await api.get(`/flows/${flow.id}`);
      setFlowDetail(data.flow);
    } catch { setFlowDetail(null); }
  };

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

  const toggleStep = (id) => setExpandedSteps(p => ({ ...p, [id]: !p[id] }));
  const toggleProcess = (id) => setExpandedProcesses(p => ({ ...p, [id]: !p[id] }));

  const assignTask = async () => {
    if (!selectedAssignee || !assignmentModal) return;
    try {
      if (assignmentModal.type === 'task') {
        await api.put(`/company-processes/tasks/${assignmentModal.id}`, {
          default_assignee_id: selectedAssignee,
        });
      } else {
        await api.put(`/company-processes/checklists/${assignmentModal.id}`, {
          default_assignee_id: selectedAssignee,
        });
      }
      const { data } = await api.get(`/flows/${selectedFlow.id}`);
      setFlowDetail(data.flow);
      setAssignmentModal(null);
      setSelectedAssignee('');
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const countTotalTasks = () => {
    let count = 0;
    (flowDetail?.steps || []).forEach(step => {
      (step.processes || []).forEach(proc => {
        count += proc.task_count || 0;
      });
    });
    return count;
  };

  const submit = async () => {
    if (!form.name?.trim()) return alert('Nhập tên dự án');
    if (!form.customer_id) return alert('Chọn khách hàng');
    if (!selectedFlow) return alert('Chọn luồng');

    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description || null,
        customer_id: form.customer_id,
        install_address: form.install_address || null,
        estimated_value: form.estimated_value ? +form.estimated_value : null,
        priority: form.priority || 'medium',
        flow_id: selectedFlow.id,
        flow_assignments: (flowDetail?.steps || []).filter(s => s.company_unit_id).map(s => ({
          division_unit_id: s.division_unit_id,
          company_unit_id: s.company_unit_id,
          order_index: s.order_index,
        })),
        quotation_files: quotationFiles,
        deal_id: dealData?.id || null,
      };
      await api.post('/projects/create-with-flow', payload);
      onCreated?.();
      onClose();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi tạo dự án'); }
    setLoading(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between bg-white border-b p-4 shrink-0">
        <h1 className="text-2xl font-bold text-gray-900">
          {dealData ? `🎉 Tạo dự án từ Deal: ${dealData.title || ''}` : 'Tạo dự án mới'}
        </h1>
        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-lg cursor-pointer">
          <X className="h-6 w-6 text-gray-600" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left: Form (25%) */}
        <div className="w-1/4 border-r overflow-y-auto p-4 space-y-4 bg-gray-50">
          {/* Khách hàng */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-900">👤 Khách hàng *</label>
            {showNewCustomer ? (
              <div className="space-y-2">
                <input value={newCust.full_name} onChange={e => setNewCust(c => ({ ...c, full_name: e.target.value }))} placeholder="Họ tên *" className="input text-sm" />
                <input value={newCust.phone} onChange={e => setNewCust(c => ({ ...c, phone: e.target.value }))} placeholder="SĐT *" className="input text-sm" />
                <input value={newCust.email} onChange={e => setNewCust(c => ({ ...c, email: e.target.value }))} placeholder="Email" className="input text-sm" />
                <input value={newCust.city} onChange={e => setNewCust(c => ({ ...c, city: e.target.value }))} placeholder="Thành phố" className="input text-sm" />
                <div className="flex gap-2">
                  <button onClick={createCustomer} className="flex-1 h-8 bg-emerald-600 text-white rounded-lg text-xs font-medium cursor-pointer">Tạo</button>
                  <button onClick={() => setShowNewCustomer(false)} className="flex-1 h-8 bg-gray-100 rounded-lg text-xs cursor-pointer">Hủy</button>
                </div>
              </div>
            ) : (
              <>
                <select value={form.customer_id || ''} onChange={e => set('customer_id', e.target.value)} className="input text-sm">
                  <option value="">— Chọn khách hàng —</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.full_name} — {c.phone}</option>)}
                </select>
                <button onClick={() => setShowNewCustomer(true)} className="w-full h-8 text-xs text-blue-600 font-medium cursor-pointer hover:underline">+ Thêm khách hàng mới</button>
              </>
            )}
          </div>

          {/* Thông tin dự án */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-900">📋 Thông tin dự án</label>
            <input value={form.name || ''} onChange={e => set('name', e.target.value)} className="input text-sm" placeholder="Tên dự án *" />
            <textarea value={form.description || ''} onChange={e => set('description', e.target.value)} className="input text-sm min-h-[60px]" placeholder="Mô tả" />
            <input type="number" value={form.estimated_value || ''} onChange={e => set('estimated_value', e.target.value)} className="input text-sm" placeholder="Giá trị (VNĐ)" />
            <input value={form.install_address || ''} onChange={e => set('install_address', e.target.value)} className="input text-sm" placeholder="Địa chỉ lắp đặt" />
            <select value={form.priority || 'medium'} onChange={e => set('priority', e.target.value)} className="input text-sm">
              <option value="low">Ưu tiên: Thấp</option><option value="medium">Ưu tiên: TB</option><option value="high">Ưu tiên: Cao</option><option value="urgent">Ưu tiên: Gấp</option>
            </select>
          </div>

          {/* File */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-900">📄 File báo giá</label>
            <FileUploadButton onFilesUploaded={(f) => setQuotationFiles(qf => [...qf, ...f])} />
            <FilePreview files={quotationFiles} onRemove={(i) => setQuotationFiles(f => f.filter((_, j) => j !== i))} />
          </div>

          {/* Submit */}
          <div className="flex gap-2 pt-4">
            <button onClick={onClose} className="flex-1 h-10 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium cursor-pointer">Hủy</button>
            <button onClick={submit} disabled={loading} className="flex-1 h-10 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50">
              {loading ? 'Tạo...' : `🚀 Tạo (${countTotalTasks()} NV)`}
            </button>
          </div>
        </div>

        {/* Right: Luồng chi tiết (75%) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Chọn luồng */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-indigo-600" /> Chọn luồng
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {flows.map(f => {
                const isSel = selectedFlow?.id === f.id;
                return (
                  <button key={f.id} onClick={() => selectFlow(f)}
                    className={`p-4 rounded-xl border-2 text-left cursor-pointer transition-all ${isSel ? 'border-indigo-500 bg-white shadow-md' : 'border-transparent bg-white/50 hover:bg-white'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{f.icon || '🔄'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 flex items-center gap-1">
                          {f.name}
                          {f.is_active === false && <span className="text-[9px] font-medium text-slate-400">Tắt</span>}
                        </p>
                        <p className="text-xs text-gray-500">({f.steps?.length || 0} bước)</p>
                      </div>
                      {isSel && <span className="text-indigo-600 text-xl">✓</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Luồng chi tiết */}
          {flowDetail && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Layers className="h-5 w-5" /> Chi tiết luồng ({countTotalTasks()} NV)
              </h2>

              {(flowDetail.steps || []).map((step, idx) => {
                const processes = step.processes || [];
                const isExpanded = expandedSteps[step.id];
                const divColor = step.division?.level?.color || '#6b7280';

                return (
                  <div key={step.id} className="rounded-xl border overflow-hidden bg-white" style={{ borderLeft: `4px solid ${divColor}` }}>
                    <button onClick={() => toggleStep(step.id)}
                      className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 cursor-pointer">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ backgroundColor: divColor }}>{idx + 1}</div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="font-semibold text-gray-900">{step.division?.level?.icon} {step.division?.name}</p>
                        <p className="text-sm text-gray-500">{step.company?.name || step.company?.short_name}</p>
                      </div>
                      <span className="text-sm font-medium bg-purple-50 text-purple-600 px-2 py-1 rounded-full">{processes.length} QT</span>
                      {isExpanded ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />}
                    </button>

                    {isExpanded && (
                      <div className="border-t bg-gray-50/50 p-4 space-y-3">
                        {processes.length > 0 ? (
                          processes.map(proc => {
                            const isProcExpanded = expandedProcesses[proc.id];
                            return (
                              <div key={proc.id} className="rounded-lg border bg-white" style={{ borderLeft: `3px solid ${proc.color || '#8B5CF6'}` }}>
                                <button onClick={() => toggleProcess(proc.id)}
                                  className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer">
                                  <span className="text-xl">{proc.icon || '📋'}</span>
                                  <div className="flex-1 text-left min-w-0">
                                    <p className="font-semibold text-gray-800">{proc.name}</p>
                                  </div>
                                  <span className="text-sm font-medium bg-purple-50 text-purple-600 px-2 py-1 rounded-full">{proc.task_count || 0} NV</span>
                                  {isProcExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                                </button>

                                {isProcExpanded && (
                                  <div className="border-t bg-purple-50/30 p-3 space-y-2">
                                    {proc.tasks && proc.tasks.length > 0 ? (
                                      proc.tasks.map(task => (
                                        <div key={task.id} className="bg-white rounded-lg p-3 space-y-2">
                                          <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                              <CheckSquare className="h-4 w-4 text-purple-400 shrink-0" />
                                              <span className="font-medium text-gray-800 truncate">{task.title}</span>
                                            </div>
                                            <button onClick={() => setAssignmentModal({ type: 'task', id: task.id, name: task.title, process_id: proc.id })}
                                              className="h-7 px-2 text-xs text-blue-600 bg-blue-50 rounded hover:bg-blue-100 cursor-pointer shrink-0 flex items-center gap-1">
                                              <User className="h-3 w-3" /> Gán
                                            </button>
                                          </div>

                                          {task.checklists && task.checklists.length > 0 && (
                                            <div className="ml-6 space-y-1">
                                              {task.checklists.map(cl => (
                                                <div key={cl.id} className="flex items-center justify-between gap-2 text-xs">
                                                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                                    <span className="w-1 h-1 rounded-full bg-gray-400 shrink-0" />
                                                    <span className="text-gray-600 truncate">{cl.title}</span>
                                                    {cl.require_file && <FileText className="h-3 w-3 text-blue-400 shrink-0" />}
                                                    {cl.require_note && <StickyNote className="h-3 w-3 text-amber-400 shrink-0" />}
                                                  </div>
                                                  <button onClick={() => setAssignmentModal({ type: 'checklist', id: cl.id, name: cl.title, process_id: proc.id })}
                                                    className="h-6 px-1.5 text-[10px] text-green-600 bg-green-50 rounded hover:bg-green-100 cursor-pointer shrink-0">
                                                    Gán
                                                  </button>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      ))
                                    ) : (
                                      <p className="text-xs text-gray-400 italic text-center py-2">Chưa có nhiệm vụ</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-sm text-gray-400 italic text-center py-4">Khối này chưa có quy trình</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Assignment Modal */}
      {assignmentModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Gán {assignmentModal.type === 'task' ? 'nhiệm vụ' : 'checklist'}</h3>
              <p className="text-sm text-gray-500 mt-1">{assignmentModal.name}</p>
            </div>
            <select value={selectedAssignee} onChange={e => setSelectedAssignee(e.target.value)} className="input">
              <option value="">— Chọn nhân viên —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setAssignmentModal(null); setSelectedAssignee(''); }} className="h-10 px-4 border rounded-lg text-sm cursor-pointer">Hủy</button>
              <button onClick={assignTask} disabled={!selectedAssignee} className="h-10 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50 flex items-center gap-2">
                <Save className="h-4 w-4" /> Gán
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
