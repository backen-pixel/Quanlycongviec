import { useState, useEffect } from 'react';
import api from '../lib/api';
import Modal from './Modal';
import { FileUploadButton, FilePreview } from './FileUpload';
import {
  Plus, CheckSquare, ChevronDown, ChevronRight, Building2,
  GitBranch, ArrowRight, Clock, User, ClipboardList, Star, Trash2, Edit, Save, Layers, FileText, StickyNote
} from 'lucide-react';

export default function ProjectCreateModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({});
  const [customers, setCustomers] = useState([]);
  const [flows, setFlows] = useState([]);
  const [selectedFlow, setSelectedFlow] = useState(null);
  const [flowDetail, setFlowDetail] = useState(null);
  const [quotationFiles, setQuotationFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ full_name: '', phone: '', email: '', city: '' });
  const [expandedSteps, setExpandedSteps] = useState({});
  const [expandedProcesses, setExpandedProcesses] = useState({});
  const [editingTask, setEditingTask] = useState(null);
  const [editingChecklist, setEditingChecklist] = useState(null);

  useEffect(() => {
    if (!open) return;
    setForm({ name: '', description: '', customer_id: '', install_address: '', estimated_value: '', priority: 'medium' });
    setSelectedFlow(null);
    setFlowDetail(null);
    setQuotationFiles([]);
    setExpandedSteps({});
    setExpandedProcesses({});

    Promise.all([
      api.get('/customers').then(r => setCustomers(r.data.customers || [])).catch(() => {}),
      api.get('/flows').then(r => {
        const list = r.data.flows || [];
        setFlows(list);
        const def = list.find(f => f.is_default);
        if (def) selectFlow(def);
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

  const deleteTask = async (taskId) => {
    if (!confirm('Xóa nhiệm vụ này?')) return;
    try {
      await api.delete(`/company-processes/tasks/${taskId}`);
      const { data } = await api.get(`/flows/${selectedFlow.id}`);
      setFlowDetail(data.flow);
    } catch {}
  };

  const deleteChecklist = async (checklistId) => {
    try {
      await api.delete(`/company-processes/checklists/${checklistId}`);
      const { data } = await api.get(`/flows/${selectedFlow.id}`);
      setFlowDetail(data.flow);
    } catch {}
  };

  // Đếm tổng tasks từ quy trình (không phải template)
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
      };
      await api.post('/projects/create-with-flow', payload);
      onCreated?.();
      onClose();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi tạo dự án'); }
    setLoading(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Tạo dự án mới" size="xl">
      <div className="max-h-[82vh] overflow-y-auto pr-1 space-y-4">

        {/* ═══ 1. KHÁCH HÀNG ═══ */}
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

        {/* ═══ 2. CHỌN LUỒNG ═══ */}
        <div className="bg-indigo-50 rounded-xl p-3 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-indigo-600" /> Chọn luồng *
          </h3>
          {flows.length === 0 ? (
            <p className="text-xs text-gray-500 italic">Chưa có luồng nào. Vào Quản lý luồng để tạo.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {flows.map(f => {
                const isSel = selectedFlow?.id === f.id;
                return (
                  <button key={f.id} type="button" onClick={() => selectFlow(f)}
                    className={`p-3 rounded-xl border-2 text-left cursor-pointer transition-all ${isSel ? 'border-indigo-500 bg-white shadow-sm' : 'border-transparent bg-white/50 hover:bg-white'}`}>
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
                      {isSel && <span className="text-indigo-600 text-lg">✓</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ═══ 3. PREVIEW LUỒNG + QUY TRÌNH NỘI BỘ ═══ */}
        {flowDetail && (
          <div className="bg-white rounded-xl border p-3 space-y-2">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Layers className="h-4 w-4" /> Quy trình theo Luồng ({countTotalTasks()} NV)
            </h3>

            {(flowDetail.steps || []).map((step, idx) => {
              const processes = step.processes || [];
              const isExpanded = expandedSteps[step.id];
              const divColor = step.division?.level?.color || '#6b7280';

              return (
                <div key={step.id} className="rounded-lg border overflow-hidden" style={{ borderLeft: `3px solid ${divColor}` }}>
                  <button type="button" onClick={() => toggleStep(step.id)}
                    className="w-full flex items-center gap-2 p-2.5 hover:bg-gray-50 cursor-pointer">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: divColor }}>{idx + 1}</div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-xs font-semibold text-gray-900">
                        {step.division?.level?.icon} {step.division?.name}
                        {step.company && <span className="text-gray-400 font-normal"> · {step.company.short_name || step.company.name}</span>}
                      </p>
                    </div>
                    <span className="text-[9px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full font-medium shrink-0">{processes.length} QT</span>
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                  </button>

                  {isExpanded && (
                    <div className="border-t bg-gray-50/50 p-2 space-y-1.5 max-h-[400px] overflow-y-auto">
                      {processes.length > 0 ? (
                        processes.map(proc => {
                          const isProcExpanded = expandedProcesses[proc.id];
                          return (
                            <div key={proc.id} className="bg-white rounded border" style={{ borderLeft: `3px solid ${proc.color || '#8B5CF6'}` }}>
                              <button type="button" onClick={() => toggleProcess(proc.id)}
                                className="w-full flex items-center gap-2 p-1.5 hover:bg-gray-50 cursor-pointer">
                                <span className="text-sm">{proc.icon || '📋'}</span>
                                <span className="flex-1 text-xs font-medium text-gray-800">{proc.name}</span>
                                <span className="text-[9px] bg-purple-50 text-purple-600 px-1 rounded">{proc.task_count || 0} NV</span>
                                {isProcExpanded ? <ChevronDown className="h-3 w-3 text-gray-400" /> : <ChevronRight className="h-3 w-3 text-gray-400" />}
                              </button>

                              {isProcExpanded && (
                                <div className="border-t bg-purple-50/30 p-1.5 space-y-1">
                                  {proc.tasks && proc.tasks.length > 0 ? (
                                    proc.tasks.map(task => (
                                      <div key={task.id} className="bg-white rounded p-1.5 group">
                                        <div className="flex items-center gap-1.5 text-[10px]">
                                          <CheckSquare className="h-2.5 w-2.5 text-purple-400 shrink-0" />
                                          <span className="flex-1 font-medium text-gray-800">{task.title}</span>
                                          <button type="button" onClick={() => deleteTask(task.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 cursor-pointer"><Trash2 className="h-2.5 w-2.5" /></button>
                                        </div>
                                        {task.checklists && task.checklists.length > 0 && (
                                          <div className="ml-4 mt-0.5 space-y-0">
                                            {task.checklists.map(cl => (
                                              <div key={cl.id} className="flex items-center gap-1 text-[9px] text-gray-500 group/cl">
                                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                                                <span>{cl.title}</span>
                                                {cl.require_file && <FileText className="h-2 w-2 text-blue-400" />}
                                                {cl.require_note && <StickyNote className="h-2 w-2 text-amber-400" />}
                                                <button type="button" onClick={() => deleteChecklist(cl.id)} className="ml-auto opacity-0 group-hover/cl:opacity-100 text-red-400 cursor-pointer"><Trash2 className="h-2 w-2" /></button>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-[9px] text-gray-400 italic py-1">Chưa có nhiệm vụ</p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-[10px] text-gray-400 italic py-2">Khối này chưa setup quy trình nội bộ</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ 4. THÔNG TIN DỰ ÁN ═══ */}
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
              <option value="low">Thấp</option><option value="medium">TB</option><option value="high">Cao</option><option value="urgent">Gấp</option>
            </select>
          </div>
        </div>

        {/* File upload */}
        <div className="bg-amber-50 rounded-xl p-3 space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">📄 File báo giá</h3>
          <FileUploadButton onFilesUploaded={(f) => setQuotationFiles(qf => [...qf, ...f])} />
          <FilePreview files={quotationFiles} onRemove={(i) => setQuotationFiles(f => f.filter((_, j) => j !== i))} />
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-10 px-4 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium cursor-pointer">Hủy</button>
          <button type="button" onClick={submit} disabled={loading}
            className="h-10 px-6 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50">
            {loading ? 'Đang tạo...' : `🚀 Tạo dự án (${countTotalTasks()} NV)`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
