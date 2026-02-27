import { useState, useEffect } from 'react';
import api from '../lib/api';
import Modal from './Modal';
import { FileUploadButton, FilePreview } from './FileUpload';
import { Plus } from 'lucide-react';

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
  const [users, setUsers] = useState([]);
  const [quotationFiles, setQuotationFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ full_name: '', phone: '', email: '', city: '' });

  useEffect(() => {
    if (open) {
      api.get('/customers').then(r => setCustomers(r.data.customers || []));
      api.get('/users').then(r => setUsers(r.data.users || []));
      setForm({
        name: '', description: '', customer_id: '', kitchen_type: '', material: '',
        install_address: '', estimated_value: '', priority: 'medium',
        sales_person_id: '', designer_id: '', project_manager_id: '',
        consulting_person_id: '', design_person_id: '', quotation_person_id: '',
        contract_person_id: '', production_person_id: '', shipping_person_id: '',
        installation_person_id: '', care_person_id: '',
      });
      setQuotationFiles([]);
    }
  }, [open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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
      // Nullify empty strings
      Object.keys(payload).forEach(k => { if (payload[k] === '') payload[k] = null; });
      await api.post('/projects', payload);
      onCreated?.(); onClose();
    } catch { }
    setLoading(false);
  };

  const kitchenTypes = [
    { value: 'i-shape', label: 'Chữ I' }, { value: 'l-shape', label: 'Chữ L' },
    { value: 'u-shape', label: 'Chữ U' }, { value: 'island', label: 'Bếp đảo' },
    { value: 'parallel', label: 'Song song' },
  ];
  const materials = [
    { value: 'mdf-paint', label: 'MDF sơn' }, { value: 'mdf-laminate', label: 'MDF Laminate' },
    { value: 'acrylic', label: 'Acrylic' }, { value: 'natural-wood', label: 'Gỗ tự nhiên' },
    { value: 'plywood', label: 'Plywood' }, { value: 'inox', label: 'Inox' },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Tạo dự án mới" size="lg">
      <form onSubmit={submit} className="space-y-5 max-h-[78vh] overflow-y-auto pr-1">
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
          <input value={form.name || ''} onChange={e => set('name', e.target.value)} required className="input" placeholder="VD: Tủ bếp chữ L anh Minh" /></div>
        <div><label className="block text-sm font-medium mb-1">Mô tả</label>
          <textarea value={form.description || ''} onChange={e => set('description', e.target.value)} className="input min-h-[50px]" /></div>

        <div className="grid grid-cols-3 gap-4">
          <div><label className="block text-sm font-medium mb-1">Loại tủ bếp</label>
            <select value={form.kitchen_type || ''} onChange={e => set('kitchen_type', e.target.value)} className="input">
              <option value="">— Chọn —</option>{kitchenTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select></div>
          <div><label className="block text-sm font-medium mb-1">Chất liệu</label>
            <select value={form.material || ''} onChange={e => set('material', e.target.value)} className="input">
              <option value="">— Chọn —</option>{materials.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select></div>
          <div><label className="block text-sm font-medium mb-1">Độ ưu tiên</label>
            <select value={form.priority || 'medium'} onChange={e => set('priority', e.target.value)} className="input">
              <option value="low">Thấp</option><option value="medium">Trung bình</option>
              <option value="high">Cao</option><option value="urgent">Gấp</option>
            </select></div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Giá trị ước tính (VNĐ)</label>
            <input type="number" value={form.estimated_value || ''} onChange={e => set('estimated_value', e.target.value)} className="input" /></div>
          <div><label className="block text-sm font-medium mb-1">Địa chỉ lắp đặt</label>
            <input value={form.install_address || ''} onChange={e => set('install_address', e.target.value)} className="input" /></div>
        </div>

        {/* Quotation files */}
        <div className="bg-amber-50 rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">📄 File báo giá sản phẩm</h3>
          <p className="text-xs text-gray-500">Upload file báo giá, bản vẽ, catalog sản phẩm...</p>
          <FileUploadButton onFilesUploaded={(f) => setQuotationFiles(qf => [...qf, ...f])} />
          <FilePreview files={quotationFiles} onRemove={(i) => setQuotationFiles(f => f.filter((_, j) => j !== i))} />
        </div>

        {/* Main assignments */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">👤 Quản lý chung</h3>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs font-medium mb-1">Sales chính</label>
              <select value={form.sales_person_id || ''} onChange={e => set('sales_person_id', e.target.value)} className="input">
                <option value="">—</option>{users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select></div>
            <div><label className="block text-xs font-medium mb-1">Thiết kế chính</label>
              <select value={form.designer_id || ''} onChange={e => set('designer_id', e.target.value)} className="input">
                <option value="">—</option>{users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select></div>
            <div><label className="block text-xs font-medium mb-1">Quản lý DA</label>
              <select value={form.project_manager_id || ''} onChange={e => set('project_manager_id', e.target.value)} className="input">
                <option value="">—</option>{users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select></div>
          </div>
        </div>

        {/* Per-stage assignments */}
        <div className="bg-blue-50 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">🔄 Phân công theo quy trình</h3>
          <p className="text-xs text-gray-500">Gán người chịu trách nhiệm cho từng giai đoạn</p>
          <div className="grid grid-cols-4 gap-3">
            {STAGE_ASSIGNS.map(sa => (
              <div key={sa.key}>
                <label className="block text-[11px] font-medium text-gray-600 mb-1">{sa.label}</label>
                <select value={form[sa.key] || ''} onChange={e => set(sa.key, e.target.value)} className="input text-xs !py-1.5">
                  <option value="">— Chọn —</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
            ))}
          </div>
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
