import { useState, useEffect } from 'react';
import api from '../lib/api';
import Modal from './Modal';
import { FileUploadButton, FilePreview } from './FileUpload';
import { Plus, CheckSquare, ChevronDown, ChevronRight, Building2, GripVertical, Trash2, Copy } from 'lucide-react';
import { PRIORITY_LABELS, PRIORITY_COLORS, getInitials, avatarColor } from '../lib/utils';

const STAGES = [
  { slug: 'consulting', label: 'Tư vấn', color: '#8B5CF6', icon: '💬' },
  { slug: 'design', label: 'Thiết kế', color: '#EC4899', icon: '🎨' },
  { slug: 'quotation', label: 'Báo giá', color: '#F59E0B', icon: '💰' },
  { slug: 'contract', label: 'Hợp đồng', color: '#10B981', icon: '📝' },
  { slug: 'production', label: 'Sản xuất', color: '#F97316', icon: '🏭' },
  { slug: 'shipping', label: 'Vận chuyển', color: '#06B6D4', icon: '🚛' },
  { slug: 'installation', label: 'Lắp đặt', color: '#3B82F6', icon: '🔧' },
  { slug: 'customer-care', label: 'CSKH', color: '#EF4444', icon: '❤️' },
];

let lineIdCounter = 0;
function newLineId() { return `new_${++lineIdCounter}_${Date.now()}`; }

export default function ProjectCreateModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({});
  const [customers, setCustomers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [companyEmployees, setCompanyEmployees] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [quotationFiles, setQuotationFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ full_name: '', phone: '', email: '', city: '' });
  const [showTemplates, setShowTemplates] = useState(false);
  // Workflow lines
  const [workflowLines, setWorkflowLines] = useState([]);

  useEffect(() => {
    if (open) {
      Promise.all([
        api.get('/customers').then(r => setCustomers(r.data.customers || [])).catch(() => {}),
        api.get('/users').then(r => setAllUsers(r.data.users || [])).catch(() => {}),
        api.get('/companies').then(r => setCompanies(r.data.companies || [])).catch(() => setCompanies([])),
        api.get('/templates/by-stage').then(r => setTemplates(r.data.stages || [])).catch(() => {}),
      ]);
      setForm({
        name: '', description: '', customer_id: '', company_id: '',
        install_address: '', estimated_value: '', priority: 'medium',
      });
      setQuotationFiles([]);
      setCompanyEmployees([]);
      // Init default workflow lines (1 per stage)
      setWorkflowLines(STAGES.map((s, i) => ({
        _id: newLineId(), stage_slug: s.slug, label: s.label,
        assignee_id: '', description: '', order_index: i,
      })));
    }
  }, [open]);

  // Load employees when company changes
  useEffect(() => {
    if (form.company_id) {
      api.get(`/companies/${form.company_id}/employees`)
        .then(r => setCompanyEmployees(r.data.employees || []))
        .catch(() => setCompanyEmployees([]));
      // Clear all assignments
      setWorkflowLines(prev => prev.map(l => ({ ...l, assignee_id: '' })));
    } else {
      setCompanyEmployees([]);
    }
  }, [form.company_id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const assignableUsers = form.company_id ? companyEmployees : allUsers;

  // Workflow line operations
  const updateLine = (lineId, key, value) => {
    setWorkflowLines(prev => prev.map(l => l._id === lineId ? { ...l, [key]: value } : l));
  };

  const addLine = (stageSlug) => {
    const stage = STAGES.find(s => s.slug === stageSlug);
    const existingCount = workflowLines.filter(l => l.stage_slug === stageSlug).length;
    setWorkflowLines(prev => {
      // Insert after last line of same stage
      const lastIdx = prev.reduce((acc, l, i) => l.stage_slug === stageSlug ? i : acc, -1);
      const newLine = {
        _id: newLineId(), stage_slug: stageSlug,
        label: `${stage?.label || stageSlug} ${existingCount + 1}`,
        assignee_id: '', description: '', order_index: lastIdx + 1,
      };
      const arr = [...prev];
      arr.splice(lastIdx + 1, 0, newLine);
      return arr.map((l, i) => ({ ...l, order_index: i }));
    });
  };

  const removeLine = (lineId) => {
    setWorkflowLines(prev => {
      const line = prev.find(l => l._id === lineId);
      // Don't allow removing if it's the only line for that stage
      const stageCount = prev.filter(l => l.stage_slug === line?.stage_slug).length;
      if (stageCount <= 1) return prev;
      return prev.filter(l => l._id !== lineId).map((l, i) => ({ ...l, order_index: i }));
    });
  };

  const duplicateLine = (lineId) => {
    setWorkflowLines(prev => {
      const idx = prev.findIndex(l => l._id === lineId);
      if (idx < 0) return prev;
      const orig = prev[idx];
      const copy = { ...orig, _id: newLineId(), label: orig.label + ' (Copy)', assignee_id: '' };
      const arr = [...prev];
      arr.splice(idx + 1, 0, copy);
      return arr.map((l, i) => ({ ...l, order_index: i }));
    });
  };

  const createCustomer = async () => {
    if (!newCust.full_name || !newCust.phone) return;
    try {
      const { data } = await api.post('/customers', newCust);
      setCustomers(c => [data.customer, ...c]);
      setForm(f => ({ ...f, customer_id: data.customer.id }));
      setShowNewCustomer(false); setNewCust({ full_name: '', phone: '', email: '', city: '' });
    } catch { }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.customer_id) return;
    setLoading(true);
    try {
      // Build old-style person fields from first line of each stage (backward compat)
      const personFields = {};
      STAGES.forEach(s => {
        const firstLine = workflowLines.find(l => l.stage_slug === s.slug);
        const key = s.slug === 'customer-care' ? 'care_person_id' : `${s.slug.replace('-','_')}_person_id`;
        personFields[key] = firstLine?.assignee_id || null;
      });

      const payload = {
        ...form, ...personFields,
        quotation_files: quotationFiles,
        workflow_lines: workflowLines.map(l => ({
          stage_slug: l.stage_slug, label: l.label,
          assignee_id: l.assignee_id || null,
          description: l.description || null,
          order_index: l.order_index,
        })),
      };
      payload.estimated_value = payload.estimated_value ? +payload.estimated_value : null;
      payload.sales_person_id = personFields.consulting_person_id || null;
      payload.designer_id = personFields.design_person_id || null;
      payload.project_manager_id = personFields.consulting_person_id || null;
      Object.keys(payload).forEach(k => { if (payload[k] === '') payload[k] = null; });
      await api.post('/projects', payload);
      onCreated?.(); onClose();
    } catch { }
    setLoading(false);
  };

  // Group lines by stage for display
  const linesByStage = {};
  STAGES.forEach(s => { linesByStage[s.slug] = workflowLines.filter(l => l.stage_slug === s.slug); });

  const activeTemplates = templates.filter(s => s.templates?.some(t => t.is_active));

  return (
    <Modal open={open} onClose={onClose} title="Tạo dự án mới" size="xl">
      <form onSubmit={submit} className="space-y-5 max-h-[82vh] overflow-y-auto pr-1">

        {/* Company */}
        <div className="bg-indigo-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-semibold text-gray-900">Công ty thực hiện</h3>
          </div>
          <select value={form.company_id || ''} onChange={e => set('company_id', e.target.value)} className="input">
            <option value="">— Chọn công ty —</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}{c.short_name ? ` (${c.short_name})` : ''}</option>)}
          </select>
          {form.company_id && companyEmployees.length > 0 && <p className="text-xs text-indigo-600">✓ {companyEmployees.length} nhân viên thuộc công ty</p>}
        </div>

        {/* Customer */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Khách hàng</h3>
            <button type="button" onClick={() => setShowNewCustomer(!showNewCustomer)}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer flex items-center gap-1"><Plus className="h-3 w-3" /> Thêm mới</button>
          </div>
          {showNewCustomer ? (
            <div className="bg-white rounded-lg p-3 border space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input value={newCust.full_name} onChange={e => setNewCust(c => ({...c, full_name: e.target.value}))} placeholder="Họ tên *" className="input" />
                <input value={newCust.phone} onChange={e => setNewCust(c => ({...c, phone: e.target.value}))} placeholder="SĐT *" className="input" />
                <input value={newCust.email} onChange={e => setNewCust(c => ({...c, email: e.target.value}))} placeholder="Email" className="input" />
                <input value={newCust.city} onChange={e => setNewCust(c => ({...c, city: e.target.value}))} placeholder="Thành phố" className="input" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={createCustomer} className="h-8 px-3 bg-emerald-600 text-white rounded-lg text-xs font-medium cursor-pointer">Tạo KH</button>
                <button type="button" onClick={() => setShowNewCustomer(false)} className="h-8 px-3 bg-gray-100 text-gray-600 rounded-lg text-xs cursor-pointer">Hủy</button>
              </div>
            </div>
          ) : (
            <select value={form.customer_id || ''} onChange={e => set('customer_id', e.target.value)} required className="input">
              <option value="">— Chọn khách hàng —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.full_name} — {c.phone}</option>)}
            </select>
          )}
        </div>

        {/* Project info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><label className="block text-sm font-medium mb-1">Tên dự án *</label>
            <input value={form.name || ''} onChange={e => set('name', e.target.value)} required className="input" placeholder="VD: Tủ bếp chữ L anh Minh — Q7" /></div>
          <div className="col-span-2"><label className="block text-sm font-medium mb-1">Mô tả</label>
            <textarea value={form.description || ''} onChange={e => set('description', e.target.value)} className="input min-h-[40px]" placeholder="Mô tả, yêu cầu đặc biệt..." /></div>
          <div><label className="block text-sm font-medium mb-1">Giá trị ước tính (VNĐ)</label>
            <input type="number" value={form.estimated_value || ''} onChange={e => set('estimated_value', e.target.value)} className="input" /></div>
          <div><label className="block text-sm font-medium mb-1">Địa chỉ lắp đặt</label>
            <input value={form.install_address || ''} onChange={e => set('install_address', e.target.value)} className="input" /></div>
          <div><label className="block text-sm font-medium mb-1">Độ ưu tiên</label>
            <select value={form.priority || 'medium'} onChange={e => set('priority', e.target.value)} className="input">
              <option value="low">Thấp</option><option value="medium">Trung bình</option>
              <option value="high">Cao</option><option value="urgent">Gấp</option>
            </select></div>
        </div>

        {/* Quotation files */}
        <div className="bg-amber-50 rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">📄 File báo giá sản phẩm</h3>
          <FileUploadButton onFilesUploaded={(f) => setQuotationFiles(qf => [...qf, ...f])} />
          <FilePreview files={quotationFiles} onRemove={(i) => setQuotationFiles(f => f.filter((_, j) => j !== i))} />
        </div>

        {/* ═══ WORKFLOW BUILDER ═══ */}
        <div className="bg-blue-50 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">🔄 Luồng công việc — Phân công linh hoạt</h3>
            <span className="text-xs text-blue-600">{workflowLines.length} bộ phận</span>
          </div>
          <p className="text-xs text-gray-500">
            Mỗi giai đoạn có thể có nhiều bộ phận (VD: 2 xưởng sản xuất). Nhấn [+ Thêm] để thêm bộ phận.
          </p>

          {STAGES.map(stage => {
            const lines = linesByStage[stage.slug] || [];
            return (
              <div key={stage.slug} className="bg-white rounded-lg border overflow-hidden">
                {/* Stage header */}
                <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ backgroundColor: stage.color + '10' }}>
                  <span className="text-base">{stage.icon}</span>
                  <span className="text-sm font-semibold" style={{ color: stage.color }}>{stage.label}</span>
                  <span className="text-[10px] bg-white/70 text-gray-500 px-2 py-0.5 rounded-full">{lines.length} bộ phận</span>
                  <div className="flex-1" />
                  <button type="button" onClick={() => addLine(stage.slug)}
                    className="text-[11px] px-2 py-1 rounded-md hover:bg-white/50 flex items-center gap-1 cursor-pointer font-medium"
                    style={{ color: stage.color }}>
                    <Plus className="h-3 w-3" /> Thêm
                  </button>
                </div>

                {/* Lines */}
                <div className="divide-y">
                  {lines.map((line, lineIdx) => (
                    <div key={line._id} className="px-3 py-2.5 hover:bg-gray-50/50 transition-colors">
                      <div className="flex items-center gap-2">
                        {/* Drag handle */}
                        <GripVertical className="h-3.5 w-3.5 text-gray-300 shrink-0 cursor-grab" />

                        {/* Line number */}
                        <span className="text-[10px] text-gray-400 font-mono w-4 shrink-0">#{lineIdx + 1}</span>

                        {/* Label (editable) */}
                        <input value={line.label} onChange={e => updateLine(line._id, 'label', e.target.value)}
                          className="flex-1 min-w-[100px] h-8 px-2 text-sm border rounded-md bg-white focus:ring-1 focus:ring-blue-400 outline-none"
                          placeholder="Tên bộ phận..." />

                        {/* Assignee */}
                        <select value={line.assignee_id || ''} onChange={e => updateLine(line._id, 'assignee_id', e.target.value)}
                          className="w-44 h-8 px-2 text-xs border rounded-md bg-white">
                          <option value="">— Chọn NV —</option>
                          {assignableUsers.map(u => (
                            <option key={u.id} value={u.id}>{u.full_name}</option>
                          ))}
                        </select>

                        {/* Assignee avatar */}
                        {line.assignee_id && (() => {
                          const u = assignableUsers.find(x => x.id === line.assignee_id);
                          return u ? (
                            <div className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0"
                              style={{ backgroundColor: avatarColor(u.full_name) }}>
                              {getInitials(u.full_name)}
                            </div>
                          ) : null;
                        })()}

                        {/* Duplicate */}
                        <button type="button" onClick={() => duplicateLine(line._id)}
                          className="w-7 h-7 rounded hover:bg-blue-50 flex items-center justify-center text-gray-400 hover:text-blue-500 cursor-pointer" title="Nhân đôi">
                          <Copy className="h-3 w-3" />
                        </button>

                        {/* Delete (only if >1 line in stage) */}
                        {lines.length > 1 && (
                          <button type="button" onClick={() => removeLine(line._id)}
                            className="w-7 h-7 rounded hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 cursor-pointer" title="Xóa">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      {/* Description (expandable) */}
                      {lines.length > 1 && (
                        <input value={line.description || ''} onChange={e => updateLine(line._id, 'description', e.target.value)}
                          className="w-full mt-1.5 ml-10 h-7 px-2 text-xs border border-dashed rounded bg-gray-50 outline-none focus:ring-1 focus:ring-blue-300 focus:bg-white"
                          placeholder={`Mô tả: VD "Sản xuất bếp nhôm chữ L"...`} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Template preview */}
        <div className="bg-green-50 rounded-xl p-4 space-y-3">
          <button type="button" onClick={() => setShowTemplates(!showTemplates)} className="flex items-center gap-2 w-full cursor-pointer">
            {showTemplates ? <ChevronDown className="h-4 w-4 text-green-600" /> : <ChevronRight className="h-4 w-4 text-green-600" />}
            <h3 className="text-sm font-semibold text-gray-900">📋 Nhiệm vụ mẫu</h3>
            <span className="text-xs text-green-600 ml-auto">
              {activeTemplates.length > 0 ? `${activeTemplates.reduce((s, st) => s + st.templates.filter(t => t.is_active).length, 0)} nhiệm vụ` : 'Mặc định'}
            </span>
          </button>
          {showTemplates && (
            <div className="space-y-3 mt-2">
              {activeTemplates.length > 0 ? activeTemplates.map(stage => (
                <div key={stage.id}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color || '#3b82f6' }} />
                    <span className="text-xs font-semibold text-gray-700">{stage.name}</span>
                  </div>
                  <div className="pl-4 space-y-1">
                    {stage.templates.filter(t => t.is_active).map(t => (
                      <div key={t.id} className="flex items-center gap-2 text-xs text-gray-600">
                        <CheckSquare className="h-3 w-3 text-gray-400" />
                        <span>{t.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )) : <p className="text-xs text-gray-500">Chưa có NV mẫu. Hệ thống dùng mặc định.</p>}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-10 px-4 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium cursor-pointer">Hủy</button>
          <button type="submit" disabled={loading} className="h-10 px-6 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50">
            {loading ? 'Đang tạo...' : 'Tạo dự án'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
