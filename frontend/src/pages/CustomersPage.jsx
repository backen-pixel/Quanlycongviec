import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import Modal from '../components/Modal';
import { Plus, Search, Phone, Mail, MapPin, Building2, Trash2, Edit, Users as UsersIcon } from 'lucide-react';
import { formatDate, formatVND, getInitials, avatarColor } from '../lib/utils';

const SOURCE_LABELS = { facebook: 'Facebook', zalo: 'Zalo', referral: 'Giới thiệu', website: 'Website', walk_in: 'Đến trực tiếp', phone: 'Gọi điện', other: 'Khác' };
const STATUS_LABELS = { new: 'Mới', contacted: 'Đã liên hệ', qualified: 'Tiềm năng', negotiating: 'Đang đàm phán', won: 'Đã chốt', lost: 'Đã mất', inactive: 'Không HĐ' };
const STATUS_COLORS = { new: 'bg-blue-100 text-blue-700', contacted: 'bg-purple-100 text-purple-700', qualified: 'bg-amber-100 text-amber-700', negotiating: 'bg-orange-100 text-orange-700', won: 'bg-emerald-100 text-emerald-700', lost: 'bg-red-100 text-red-700', inactive: 'bg-gray-100 text-gray-500' };

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [stats, setStats] = useState({});
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/customers', { params: { search: search || undefined, status: filter } })
      .then(r => { setCustomers(r.data.customers || []); setStats(r.data.stats || {}); })
      .catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, [filter]);

  const deleteCustomer = async (e, id, name) => {
    e.stopPropagation();
    if (!confirm(`Xóa khách hàng "${name}"?`)) return;
    try { await api.delete(`/customers/${id}`); load(); } catch (err) { alert(err.response?.data?.error || 'Lỗi'); }
  };

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Khách hàng</h1>
          <p className="text-sm text-gray-500 mt-0.5">{stats.total || 0} khách hàng</p>
        </div>
        <button onClick={() => { setEditId(null); setShowCreate(true); }}
          className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer">
          <Plus className="h-4 w-4" /> Thêm KH
        </button>
      </div>

      {/* Stats row */}
      <div className="flex gap-2 overflow-x-auto">
        {Object.entries(STATUS_LABELS).map(([k, v]) => (
          <button key={k} onClick={() => setFilter(k === filter ? 'all' : k)}
            className={`h-8 px-3 rounded-lg text-xs font-medium shrink-0 cursor-pointer transition-all flex items-center gap-1.5 ${filter === k ? 'bg-gray-900 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
            {v} {stats[k] > 0 && <span className="bg-white/20 px-1.5 rounded-full text-[10px]">{stats[k]}</span>}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="Tìm tên, SĐT, email, công ty..." className="w-full h-9 pl-10 pr-3 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg></div>
      ) : customers.length === 0 ? (
        <div className="text-center py-16">
          <UsersIcon className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">Chưa có khách hàng</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {customers.map((c, i) => (
            <Link to={`/customers/${c.id}`} key={c.id}
              className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-gray-300 transition-all animate-fade-in group"
              style={{ animationDelay: `${i * 20}ms` }}>
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                  style={{ backgroundColor: avatarColor(c.full_name) }}>
                  {getInitials(c.full_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-sm font-semibold text-gray-900">{c.full_name}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-500'}`}>
                      {STATUS_LABELS[c.status] || c.status || 'Mới'}
                    </span>
                    {c.source && <span className="text-[10px] text-gray-400">{SOURCE_LABELS[c.source] || c.source}</span>}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>
                    {c.phone && <a href={`https://zalo.me/${c.phone?.replace(/^0/, '84')}`} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-blue-600 hover:underline">
                      <img src="https://page.zalo.me/favicon.ico" className="h-3 w-3" alt="" />Zalo
                    </a>}
                    {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                    {c.company && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{c.company}</span>}
                    {c.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{c.city}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0 flex items-center gap-2">
                  {c.total_revenue > 0 && <span className="text-sm font-bold text-emerald-600">{formatVND(c.total_revenue)}</span>}
                  <span className="text-[10px] text-gray-400">{formatDate(c.created_at)}</span>
                  <button onClick={(e) => deleteCustomer(e, c.id, c.full_name)}
                    className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 cursor-pointer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <CustomerFormModal open={showCreate} onClose={() => setShowCreate(false)} onSaved={load} editId={editId} />
    </div>
  );
}

// ─── Customer Form Modal ──
function CustomerFormModal({ open, onClose, onSaved, editId }) {
  const [form, setForm] = useState({});
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.get('/users').then(r => setUsers(r.data.users || []));
    if (editId) {
      api.get(`/customers/${editId}`).then(r => setForm(r.data.customer || {}));
    } else {
      setForm({ full_name: '', phone: '', email: '', company: '', address: '', city: '', source: '', status: 'new', gender: '', notes: '', assigned_to: '' });
    }
  }, [open, editId]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editId) await api.put(`/customers/${editId}`, form);
      else await api.post('/customers', form);
      onSaved?.();
      onClose();
    } catch { }
    setLoading(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={editId ? 'Sửa khách hàng' : 'Thêm khách hàng mới'} size="md">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Họ tên *</label>
            <input value={form.full_name || ''} onChange={e => set('full_name', e.target.value)} required className="input" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">SĐT *</label>
            <input value={form.phone || ''} onChange={e => set('phone', e.target.value)} required className="input" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} className="input" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Công ty</label>
            <input value={form.company || ''} onChange={e => set('company', e.target.value)} className="input" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Địa chỉ</label>
            <input value={form.address || ''} onChange={e => set('address', e.target.value)} className="input" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Thành phố</label>
            <input value={form.city || ''} onChange={e => set('city', e.target.value)} className="input" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Nguồn KH</label>
            <select value={form.source || ''} onChange={e => set('source', e.target.value)} className="input">
              <option value="">— Chọn —</option>
              {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái</label>
            <select value={form.status || 'new'} onChange={e => set('status', e.target.value)} className="input">
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Giới tính</label>
            <select value={form.gender || ''} onChange={e => set('gender', e.target.value)} className="input">
              <option value="">— Chọn —</option><option value="male">Nam</option><option value="female">Nữ</option>
            </select></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Phụ trách</label>
            <select value={form.assigned_to || ''} onChange={e => set('assigned_to', e.target.value || null)} className="input">
              <option value="">— Chọn —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select></div>
        </div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
          <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} className="input min-h-[60px]" /></div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-10 px-4 bg-gray-100 rounded-lg text-sm font-medium cursor-pointer hover:bg-gray-200">Hủy</button>
          <button type="submit" disabled={loading} className="h-10 px-6 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Đang lưu...' : editId ? 'Cập nhật' : 'Tạo KH'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
