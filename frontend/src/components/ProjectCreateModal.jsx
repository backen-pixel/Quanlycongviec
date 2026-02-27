import { useState, useEffect } from 'react';
import api from '../lib/api';
import Modal from './Modal';
import { Plus } from 'lucide-react';

export default function ProjectCreateModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '', description: '', customer_id: '', kitchen_type: '', material: '',
    install_address: '', estimated_value: '', priority: 'medium',
    sales_person_id: '', designer_id: '', project_manager_id: '',
  });
  const [customers, setCustomers] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ full_name: '', phone: '', email: '', city: '' });

  useEffect(() => {
    if (open) {
      api.get('/customers').then(r => setCustomers(r.data.customers || []));
      api.get('/users').then(r => setUsers(r.data.users || []));
      setForm({ name: '', description: '', customer_id: '', kitchen_type: '', material: '', install_address: '', estimated_value: '', priority: 'medium', sales_person_id: '', designer_id: '', project_manager_id: '' });
    }
  }, [open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const createCustomer = async () => {
    if (!newCust.full_name || !newCust.phone) return;
    try {
      const { data } = await api.post('/customers', newCust);
      setCustomers(c => [data.customer, ...c]);
      setForm(f => ({ ...f, customer_id: data.customer.id }));
      setShowNewCustomer(false);
      setNewCust({ full_name: '', phone: '', email: '', city: '' });
    } catch { }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.customer_id) return;
    setLoading(true);
    try {
      await api.post('/projects', {
        ...form,
        estimated_value: form.estimated_value ? +form.estimated_value : null,
        sales_person_id: form.sales_person_id || null,
        designer_id: form.designer_id || null,
        project_manager_id: form.project_manager_id || null,
      });
      onCreated?.();
      onClose();
    } catch { }
    setLoading(false);
  };

  const kitchenTypes = [
    { value: 'i-shape', label: 'Chữ I' },
    { value: 'l-shape', label: 'Chữ L' },
    { value: 'u-shape', label: 'Chữ U' },
    { value: 'island', label: 'Bếp đảo' },
    { value: 'parallel', label: 'Song song' },
  ];

  const materials = [
    { value: 'mdf-paint', label: 'MDF sơn' },
    { value: 'mdf-laminate', label: 'MDF Laminate' },
    { value: 'acrylic', label: 'Acrylic' },
    { value: 'natural-wood', label: 'Gỗ tự nhiên' },
    { value: 'plywood', label: 'Plywood' },
    { value: 'inox', label: 'Inox' },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Tạo dự án mới" size="lg">
      <form onSubmit={submit} className="space-y-5">
        {/* Customer section */}
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
                <input value={newCust.full_name} onChange={e => setNewCust(c => ({...c, full_name: e.target.value}))}
                  placeholder="Họ tên *" className="input" />
                <input value={newCust.phone} onChange={e => setNewCust(c => ({...c, phone: e.target.value}))}
                  placeholder="SĐT *" className="input" />
                <input value={newCust.email} onChange={e => setNewCust(c => ({...c, email: e.target.value}))}
                  placeholder="Email" className="input" />
                <input value={newCust.city} onChange={e => setNewCust(c => ({...c, city: e.target.value}))}
                  placeholder="Thành phố" className="input" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={createCustomer} className="h-8 px-3 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 cursor-pointer">Tạo KH</button>
                <button type="button" onClick={() => setShowNewCustomer(false)} className="h-8 px-3 bg-gray-100 text-gray-600 rounded-lg text-xs cursor-pointer">Hủy</button>
              </div>
            </div>
          ) : (
            <select value={form.customer_id} onChange={e => set('customer_id', e.target.value)} required className="input">
              <option value="">— Chọn khách hàng —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.full_name} — {c.phone}</option>)}
            </select>
          )}
        </div>

        {/* Project info */}
        <Field label="Tên dự án *">
          <input value={form.name} onChange={e => set('name', e.target.value)} required className="input" placeholder="VD: Tủ bếp chữ L anh Minh" />
        </Field>

        <Field label="Mô tả">
          <textarea value={form.description} onChange={e => set('description', e.target.value)} className="input min-h-[60px]" placeholder="Mô tả dự án..." />
        </Field>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Loại tủ bếp">
            <select value={form.kitchen_type} onChange={e => set('kitchen_type', e.target.value)} className="input">
              <option value="">— Chọn —</option>
              {kitchenTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Chất liệu">
            <select value={form.material} onChange={e => set('material', e.target.value)} className="input">
              <option value="">— Chọn —</option>
              {materials.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
          <Field label="Độ ưu tiên">
            <select value={form.priority} onChange={e => set('priority', e.target.value)} className="input">
              <option value="low">Thấp</option>
              <option value="medium">Trung bình</option>
              <option value="high">Cao</option>
              <option value="urgent">Gấp</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Giá trị ước tính (VNĐ)">
            <input type="number" value={form.estimated_value} onChange={e => set('estimated_value', e.target.value)} className="input" placeholder="VD: 85000000" />
          </Field>
          <Field label="Địa chỉ lắp đặt">
            <input value={form.install_address} onChange={e => set('install_address', e.target.value)} className="input" placeholder="Địa chỉ..." />
          </Field>
        </div>

        {/* Assign people */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Phân công</h3>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Sales">
              <select value={form.sales_person_id} onChange={e => set('sales_person_id', e.target.value)} className="input">
                <option value="">— Chọn —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </Field>
            <Field label="Thiết kế">
              <select value={form.designer_id} onChange={e => set('designer_id', e.target.value)} className="input">
                <option value="">— Chọn —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </Field>
            <Field label="Quản lý DA">
              <select value={form.project_manager_id} onChange={e => set('project_manager_id', e.target.value)} className="input">
                <option value="">— Chọn —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </Field>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-10 px-4 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 cursor-pointer">Hủy</button>
          <button type="submit" disabled={loading} className="h-10 px-6 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 cursor-pointer">
            {loading ? 'Đang tạo...' : 'Tạo dự án'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
