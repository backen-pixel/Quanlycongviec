import { useState, useEffect } from 'react';
import api from '../lib/api';
import Modal from './Modal';
import { FileUploadButton, FilePreview } from './FileUpload';
import {
  Plus, CheckSquare, ChevronDown, ChevronRight, Building2,
  GitBranch, ArrowRight, Clock, User, ClipboardList, Star
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

  useEffect(() => {
    if (!open) return;
    setForm({ name: '', description: '', customer_id: '', install_address: '', estimated_value: '', priority: 'medium' });
    setSelectedFlow(null);
    setFlowDetail(null);
    setQuotationFiles([]);
    setExpandedSteps({});

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

  // Count total tasks from flow
  const totalTasks = (flowDetail?.steps || []).reduce((s, st) => s + (st.tasks?.length || 0), 0);
  const stepsWithTemplate = (flowDetail?.steps || []).filter(s => s.template_set_id);

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
        flow_assignments: (flowDetail?.steps || []).filter(s => s.company_unit_id && s.template_set_id).map(s => ({
          division_unit_id: s.division_unit_id,
          company_unit_id: s.company_unit_id,
          template_set_id: s.template_set_id,
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
                const fTasks = (f.steps || []).reduce((s, st) => s + (st.task_count || 0), 0);
                return (
                  <button key={f.id} type="button" onClick={() => selectFlow(f)}
                    className={`p-3 rounded-xl border-2 text-left cursor-pointer transition-all ${isSel ? 'border-indigo-500 bg-white shadow-sm' : 'border-transparent bg-white/50 hover:bg-white'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{f.icon || '🔄'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 flex items-center gap-1">
                          {f.name}
                          {f.is_default && <Star className="h-3 w-3 text-amber-500" />}
                          <span className="text-[9px] font-normal bg-gray-100 text-gray-500 px-1.5 rounded-full">{fTasks} NV</span>
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

        {/* ═══ 3. PREVIEW LUỒNG ĐÃ CHỌN ═══ */}
        {flowDetail && (
          <div className="bg-white rounded-xl border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                📋 Nhiệm vụ sẽ được tạo ({totalTasks} NV từ {stepsWithTemplate.length} khối)
              </h3>
            </div>

            {(flowDetail.steps || []).map((step, idx) => {
              const tasks = step.tasks || [];
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
                    {step.template_set && <span className="text-[9px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded shrink-0">{step.template_set.name}</span>}
                    <span className="text-[9px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full font-medium shrink-0">{tasks.length} NV</span>
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                  </button>

                  {isExpanded && tasks.length > 0 && (
                    <div className="border-t bg-gray-50/50 p-2 space-y-0.5 max-h-[200px] overflow-y-auto">
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

                  {isExpanded && tasks.length === 0 && (
                    <div className="border-t p-2 text-[10px] text-gray-400 italic">Chưa setup nhiệm vụ mẫu cho khối này</div>
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
            {loading ? 'Đang tạo...' : `🚀 Tạo dự án${totalTasks > 0 ? ` (${totalTasks} NV)` : ''}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
