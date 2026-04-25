import { useState, useEffect, useRef } from 'react';
import { X, Search } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';

export default function NewLogisticsProjectModal({ onClose }) {
  const { user } = useAuth();
  const [workTypes, setWorkTypes] = useState([]);
  const [formData, setFormData] = useState({
    name: '', estimated_value: '', priority: 'medium', deadline: '', logistics_person_id: '', workshop_type_id: '',
  });
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [users, setUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef(null);

  useEffect(() => {
    nameRef.current?.focus();
    api.get('/users').then(r => setUsers(r.data?.users || r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const cid = user?.company_id;
    if (!cid) {
      setWorkTypes([]);
      return;
    }
    api.get('/workshop/project-types', { params: { company_id: cid, module: 'logistics' } })
      .then((r) => setWorkTypes(Array.isArray(r.data) ? r.data : []))
      .catch(() => setWorkTypes([]));
  }, [user?.company_id]);

  useEffect(() => {
    if (!customerSearch.trim()) { setCustomerResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await api.get('/customers', { params: { search: customerSearch, limit: 8 } });
        setCustomerResults(r.data?.customers || r.data?.data || []);
      } catch { setCustomerResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [customerSearch]);

  const set = (k, v) => setFormData(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) { setError('Vui lòng nhập tên dự án'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post('/projects', {
        name: formData.name.trim(),
        customer_id: selectedCustomer?.id || null,
        company_id: user?.company_id || null,
        estimated_value: formData.estimated_value ? Number(formData.estimated_value) : null,
        priority: formData.priority,
        deadline: formData.deadline || null,
        logistics_person_id: formData.logistics_person_id || null,
        workshop_type_id: formData.workshop_type_id || null,
        status: 'shipping',
      });
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Lỗi tạo dự án');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">🚚 Tạo dự án vận chuyển mới</h2>
            <p className="text-xs text-gray-500 mt-0.5">Điền thông tin để tạo dự án VC</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 cursor-pointer transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tên dự án <span className="text-red-500">*</span></label>
            <input ref={nameRef} type="text" value={formData.name} onChange={e => set('name', e.target.value)}
              placeholder="VD: Vận chuyển tủ bếp anh Minh - 123 Lê Văn Việt"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm" required />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Khách hàng</label>
            {selectedCustomer ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
                <span className="text-sm font-medium text-orange-800 flex-1">{selectedCustomer.full_name}</span>
                {selectedCustomer.phone && <span className="text-xs text-orange-600">📞 {selectedCustomer.phone}</span>}
                <button type="button" onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); }} className="text-orange-400 hover:text-orange-600 cursor-pointer">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input type="text" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                  placeholder="Tìm tên hoặc SĐT khách hàng..."
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm" />
                {customerResults.length > 0 && (
                  <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 overflow-hidden">
                    {customerResults.map(c => (
                      <button key={c.id} type="button"
                        onClick={() => { setSelectedCustomer(c); setCustomerSearch(''); setCustomerResults([]); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-orange-50 transition text-left border-b border-gray-50 last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{c.full_name}</p>
                          {c.phone && <p className="text-xs text-green-600">📞 {c.phone}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {workTypes.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Loại dự án</label>
              <select
                value={formData.workshop_type_id}
                onChange={(e) => set('workshop_type_id', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 text-sm bg-white"
              >
                <option value="">— Không chọn —</option>
                {workTypes.map((wt) => <option key={wt.id} value={wt.id}>{wt.name}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Giá trị (VND)</label>
              <input type="number" value={formData.estimated_value} onChange={e => set('estimated_value', e.target.value)}
                placeholder="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Ưu tiên</label>
              <select value={formData.priority} onChange={e => set('priority', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 text-sm">
                <option value="high">🔴 Cao</option>
                <option value="medium">🟡 Trung bình</option>
                <option value="low">🟢 Thấp</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Phụ trách vận chuyển</label>
              <select value={formData.logistics_person_id} onChange={e => set('logistics_person_id', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 text-sm">
                <option value="">-- Chọn người --</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Deadline</label>
              <input type="date" value={formData.deadline} onChange={e => set('deadline', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 text-sm" />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 transition-all disabled:opacity-50 text-sm cursor-pointer">
              {saving ? 'Đang tạo...' : '🚚 Tạo dự án VC'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg transition text-sm cursor-pointer">Hủy</button>
          </div>
        </form>
      </div>
    </div>
  );
}
