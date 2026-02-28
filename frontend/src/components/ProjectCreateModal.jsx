import { useState, useEffect } from 'react';
import api from '../lib/api';
import Modal from './Modal';
import { FileUploadButton, FilePreview } from './FileUpload';
import { Plus, CheckSquare, ChevronDown, ChevronRight, Building2 } from 'lucide-react';
import { PRIORITY_LABELS, PRIORITY_COLORS } from '../lib/utils';

const STAGE_ASSIGNS = [
  { key: 'consulting_person_id', label: 'Tư vấn' },
  { key: 'design_person_id', label: 'Thiết kế' },
  { key: 'quotation_person_id', label: 'Báo giá' },
  { key: 'contract_person_id', label: 'Hợp đồng' },
  { key: 'production_person_id', label: 'Sản xuất' },
  { key: 'shipping_person_id', label: 'Vận chuyển' },
  { key: 'installation_person_id', label: 'Lắp đặt' },
  { key: 'care_person_id', label: 'CSKH' },
];

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
        consulting_person_id: '', design_person_id: '', quotation_person_id: '',
        contract_person_id: '', production_person_id: '', shipping_person_id: '',
        installation_person_id: '', care_person_id: '',
      });
      setQuotationFiles([]);
      setCompanyEmployees([]);
    }
  }, [open]);

  // Load employees when company changes
  useEffect(() => {
    if (form.company_id) {
      api.get(`/companies/${form.company_id}/employees`)
        .then(r => setCompanyEmployees(r.data.employees || []))
        .catch(() => setCompanyEmployees([]));
      // Clear all person assignments when company changes
      setForm(f => ({
        ...f,
        consulting_person_id: '', design_person_id: '', quotation_person_id: '',
        contract_person_id: '', production_person_id: '', shipping_person_id: '',
        installation_person_id: '', care_person_id: '',
      }));
    } else {
      setCompanyEmployees([]);
    }
  }, [form.company_id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Employees to show in dropdowns: company employees if company selected, otherwise all users
  const assignableUsers = form.company_id ? companyEmployees : allUsers;

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
      const payload = { ...form, quotation_files: quotationFiles };
      payload.estimated_value = payload.estimated_value ? +payload.estimated_value : null;
      payload.sales_person_id = payload.consulting_person_id || null;
      payload.designer_id = payload.design_person_id || null;
      payload.project_manager_id = payload.consulting_person_id || null;
      Object.keys(payload).forEach(k => { if (payload[k] === '') payload[k] = null; });
      await api.post('/projects', payload);
      onCreated?.(); onClose();
    } catch { }
    setLoading(false);
  };

  const activeTemplates = templates.filter(s => s.templates?.some(t => t.is_active));

  return (
    <Modal open={open} onClose={onClose} title="Tạo dự án mới" size="lg">
      <form onSubmit={submit} className="space-y-5 max-h-[78vh] overflow-y-auto pr-1">

        {/* Company selector */}
        <div className="bg-indigo-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-semibold text-gray-900">Công ty thực hiện</h3>
          </div>
          <select value={form.company_id || ''} onChange={e => set('company_id', e.target.value)} className="input">
            <option value="">— Chọn công ty —</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}{c.short_name ? ` (${c.short_name})` : ''}</option>
            ))}
          </select>
          {form.company_id && companyEmployees.length > 0 && (
            <p className="text-xs text-indigo-600">✓ {companyEmployees.length} nhân viên thuộc công ty này</p>
          )}
          {form.company_id && companyEmployees.length === 0 && (
            <p className="text-xs text-amber-600">⚠ Chưa có nhân viên nào thuộc công ty này. Vào Quản lý công ty để thêm.</p>
          )}
        </div>

        {/* Customer */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Khách hàng</h3>
            <button type="button" onClick={() => setShowNewCustomer(!showNewCustomer)}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer flex items-center gap-1">
              <Plus className="h-3 w-3" /> Thêm mới
            </button>
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
        <div><label className="block text-sm font-medium mb-1">Tên dự án *</label>
          <input value={form.name || ''} onChange={e => set('name', e.target.value)} required className="input" placeholder="VD: Tủ bếp chữ L anh Minh — Q7" /></div>
        <div><label className="block text-sm font-medium mb-1">Mô tả</label>
          <textarea value={form.description || ''} onChange={e => set('description', e.target.value)} className="input min-h-[50px]" placeholder="Mô tả dự án, yêu cầu đặc biệt..." /></div>

        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Giá trị ước tính (VNĐ)</label>
            <input type="number" value={form.estimated_value || ''} onChange={e => set('estimated_value', e.target.value)} className="input" placeholder="VD: 85000000" /></div>
          <div><label className="block text-sm font-medium mb-1">Địa chỉ lắp đặt</label>
            <input value={form.install_address || ''} onChange={e => set('install_address', e.target.value)} className="input" placeholder="Số nhà, đường, quận..." /></div>
          <div><label className="block text-sm font-medium mb-1">Độ ưu tiên</label>
            <select value={form.priority || 'medium'} onChange={e => set('priority', e.target.value)} className="input">
              <option value="low">Thấp</option><option value="medium">Trung bình</option>
              <option value="high">Cao</option><option value="urgent">Gấp</option>
            </select></div>
        </div>

        {/* Quotation files */}
        <div className="bg-amber-50 rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">📄 File báo giá sản phẩm</h3>
          <p className="text-xs text-gray-500">Upload file báo giá, bản vẽ, catalog sản phẩm...</p>
          <FileUploadButton onFilesUploaded={(f) => setQuotationFiles(qf => [...qf, ...f])} />
          <FilePreview files={quotationFiles} onRemove={(i) => setQuotationFiles(f => f.filter((_, j) => j !== i))} />
        </div>

        {/* Per-stage assignments — filtered by company */}
        <div className="bg-blue-50 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">🔄 Phân công theo quy trình</h3>
          <p className="text-xs text-gray-500">
            {form.company_id
              ? `Chỉ hiển thị nhân viên thuộc công ty đã chọn (${companyEmployees.length} người)`
              : 'Chọn công ty ở trên để lọc nhân viên theo công ty'}
          </p>
          <div className="grid grid-cols-4 gap-3">
            {STAGE_ASSIGNS.map(sa => (
              <div key={sa.key}>
                <label className="block text-[11px] font-medium text-gray-600 mb-1">{sa.label}</label>
                <select value={form[sa.key] || ''} onChange={e => set(sa.key, e.target.value)} className="input text-xs !py-1.5">
                  <option value="">— Chọn —</option>
                  {assignableUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.full_name} {u.role ? `(${u.role})` : ''}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* Template preview */}
        <div className="bg-green-50 rounded-xl p-4 space-y-3">
          <button type="button" onClick={() => setShowTemplates(!showTemplates)}
            className="flex items-center gap-2 w-full cursor-pointer">
            {showTemplates ? <ChevronDown className="h-4 w-4 text-green-600" /> : <ChevronRight className="h-4 w-4 text-green-600" />}
            <h3 className="text-sm font-semibold text-gray-900">📋 Nhiệm vụ mẫu sẽ được tạo tự động</h3>
            <span className="text-xs text-green-600 ml-auto">
              {activeTemplates.length > 0 ? `${activeTemplates.reduce((s, st) => s + st.templates.filter(t => t.is_active).length, 0)} nhiệm vụ` : 'Dùng mặc định'}
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
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${PRIORITY_COLORS[t.priority] || ''}`}>{PRIORITY_LABELS[t.priority]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )) : (
                <p className="text-xs text-gray-500">Chưa có nhiệm vụ mẫu kích hoạt. Hệ thống sẽ dùng mặc định.</p>
              )}
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
