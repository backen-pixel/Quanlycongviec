import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import Modal from '../components/Modal';
import { Plus, Search, Phone, Mail, MapPin, Building2, Trash2, Users as UsersIcon, ScanSearch } from 'lucide-react';
import LeadDuplicateScanner from '../components/LeadDuplicateScanner';
import { formatDate, formatVND, getInitials, avatarColor } from '../lib/utils';

const SOURCE_LABELS = { facebook: 'Facebook', zalo: 'Zalo', referral: 'Giới thiệu', website: 'Website', walk_in: 'Đến trực tiếp', phone: 'Gọi điện', other: 'Khác' };

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [stats, setStats] = useState({});
  const [search, setSearch] = useState('');
  const [filterStatusId, setFilterStatusId] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState(null);
  const [custStatuses, setCustStatuses] = useState([]);
  const [showDupScanner, setShowDupScanner] = useState(false);
  const [custDeleteModal, setCustDeleteModal] = useState(null); // { id, name, phone }
  const [custDeleteForce, setCustDeleteForce] = useState(false);
  const [custDeleteBlockPhone, setCustDeleteBlockPhone] = useState(true);
  const [custDeleteErr, setCustDeleteErr] = useState('');
  const [custDeleteBusy, setCustDeleteBusy] = useState(false);

  // Load customer statuses from API
  useEffect(() => {
    api.get('/stages/customer-statuses')
      .then(r => setCustStatuses(r.data.statuses || []))
      .catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    const params = { search: search || undefined, limit: 200 };
    if (filterStatusId !== 'all') params.status_id = filterStatusId;
    api.get('/customers', { params })
      .then(r => { setCustomers(r.data.customers || []); setStats(r.data.stats || {}); })
      .catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, [filterStatusId]);

  const openDeleteCustomer = (e, c) => {
    e.stopPropagation();
    e.preventDefault();
    setCustDeleteForce(false);
    setCustDeleteBlockPhone(!!(c.phone && String(c.phone).trim()));
    setCustDeleteErr('');
    setCustDeleteModal({ id: c.id, name: c.full_name, phone: c.phone });
  };

  const runDeleteCustomer = async () => {
    if (!custDeleteModal) return;
    setCustDeleteBusy(true);
    setCustDeleteErr('');
    try {
      const params = new URLSearchParams();
      if (custDeleteForce) params.set('force', 'true');
      if (custDeleteBlockPhone && custDeleteModal.phone) params.set('block_auto_recreate_phone', 'true');
      const qs = params.toString() ? `?${params.toString()}` : '';
      await api.delete(`/customers/${custDeleteModal.id}${qs}`);
      setCustDeleteModal(null);
      load();
    } catch (err) {
      const data = err.response?.data;
      if (data?.linked && !custDeleteForce) {
        const { projects, leads, quotations } = data.linked;
        setCustDeleteErr(`Khách có ${projects} dự án, ${leads} lead/deal, ${quotations} báo giá. Tick «Xóa toàn bộ dữ liệu liên quan» bên dưới rồi thử lại.`);
      } else {
        alert('Lỗi xóa: ' + (data?.error || err.message));
      }
    } finally {
      setCustDeleteBusy(false);
    }
  };

  // Helper: get status display for a customer
  const getStatusDisplay = (c) => {
    // Priority: customer_status (joined from status_id) → fallback to old status field
    if (c.customer_status) {
      return { name: c.customer_status.name, color: c.customer_status.color, icon: c.customer_status.icon };
    }
    return { name: c.status || 'Mới', color: '#6B7280', icon: '' };
  };

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Khách hàng</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">{stats.total || customers.length} khách hàng</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowDupScanner(true)}
            className="h-9 px-3 bg-orange-500 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-orange-600 cursor-pointer">
            <ScanSearch className="h-4 w-4" /> <span className="hidden sm:inline">Quét trùng Lead</span>
          </button>
          <button onClick={() => { setEditId(null); setShowCreate(true); }}
            className="h-9 px-3 sm:px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-blue-700 cursor-pointer">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Thêm KH</span>
          </button>
        </div>
      </div>

      {/* Status tabs from customer_statuses */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar pb-0.5">
        <button onClick={() => setFilterStatusId('all')}
          className={`h-8 px-3 rounded-lg text-xs font-medium shrink-0 cursor-pointer transition-all flex items-center gap-1.5 ${
            filterStatusId === 'all' ? 'bg-gray-900 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'
          }`}>
          Tất cả <span className="text-[10px] opacity-70">{stats.total || ''}</span>
        </button>
        {custStatuses.filter(s => s.is_active !== false).map(s => {
          const cnt = stats[s.id] || 0;
          return (
            <button key={s.id} onClick={() => setFilterStatusId(filterStatusId === s.id ? 'all' : s.id)}
              className={`h-8 px-3 rounded-lg text-xs font-medium shrink-0 cursor-pointer transition-all flex items-center gap-1.5 ${
                filterStatusId === s.id ? 'text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'
              }`}
              style={filterStatusId === s.id ? { backgroundColor: s.color } : {}}>
              <span className="text-sm">{s.icon}</span>
              {s.name}
              {cnt > 0 && <span className={`text-[10px] px-1.5 rounded-full ${filterStatusId === s.id ? 'bg-white/20' : 'bg-gray-100'}`}>{cnt}</span>}
            </button>
          );
        })}
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
          <button onClick={() => setShowCreate(true)} className="mt-2 text-sm text-blue-600 font-medium cursor-pointer">+ Thêm KH</button>
        </div>
      ) : (
        <div className="grid gap-3">
          {customers.map((c, i) => {
            const st = getStatusDisplay(c);
            return (
              <Link to={`/customers/${c.id}`} key={c.id}
                className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 hover:shadow-md hover:border-gray-300 transition-all group">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                    style={{ backgroundColor: avatarColor(c.full_name) }}>
                    {getInitials(c.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <h3 className="text-sm font-semibold text-gray-900">{c.full_name}</h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium text-white"
                        style={{ backgroundColor: st.color }}>
                        {st.icon && <span className="mr-0.5">{st.icon}</span>}{st.name}
                      </span>
                      {c.source && <span className="text-[10px] text-gray-400">{SOURCE_LABELS[c.source] || c.source}</span>}
                    </div>
                    <div className="flex items-center gap-3 sm:gap-4 text-xs text-gray-500 flex-wrap">
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>
                      {c.phone && <a href={`https://zalo.me/${c.phone?.replace(/^0/, '84')}`} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-blue-600 hover:underline">
                        <img src="https://page.zalo.me/favicon.ico" className="h-3 w-3" alt="" />Zalo
                      </a>}
                      {c.email && <span className="flex items-center gap-1 hidden sm:flex"><Mail className="h-3 w-3" />{c.email}</span>}
                      {c.city && <span className="flex items-center gap-1 hidden sm:flex"><MapPin className="h-3 w-3" />{c.city}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-2">
                    {c.total_revenue > 0 && <span className="text-sm font-bold text-emerald-600 hidden sm:inline">{formatVND(c.total_revenue)}</span>}
                    <span className="text-[10px] text-gray-400 hidden sm:inline">{formatDate(c.created_at)}</span>
                    <button type="button" onClick={(e) => openDeleteCustomer(e, c)}
                      className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 cursor-pointer">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <CustomerFormModal open={showCreate} onClose={() => setShowCreate(false)} onSaved={load} editId={editId} custStatuses={custStatuses} />

      {showDupScanner && (
        <LeadDuplicateScanner
          onClose={() => setShowDupScanner(false)}
          onMerged={() => load()}
        />
      )}

      <Modal
        open={!!custDeleteModal}
        onClose={() => !custDeleteBusy && setCustDeleteModal(null)}
        title="Xóa khách hàng"
        size="md"
      >
        {custDeleteModal && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Xóa <strong>{custDeleteModal.name}</strong>
              {custDeleteModal.phone && (
                <span className="block text-xs text-gray-500 mt-1">SĐT: {custDeleteModal.phone}</span>
              )}
              ? Hành động không hoàn tác.
            </p>
            {custDeleteModal.phone && (
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={custDeleteBlockPhone}
                  onChange={(e) => setCustDeleteBlockPhone(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300"
                />
                <span>
                  <strong>Chặn tự tạo lead Facebook</strong> từ SĐT này (quét tin / Auto tool / tạo từ Messenger sẽ bỏ qua).
                </span>
              </label>
            )}
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={custDeleteForce}
                onChange={(e) => { setCustDeleteForce(e.target.checked); setCustDeleteErr(''); }}
                className="mt-0.5 rounded border-gray-300"
              />
              <span>
                <strong>Xóa toàn bộ</strong> dự án, lead/deal, báo giá liên quan (khi hệ thống báo còn dữ liệu gắn KH).
              </span>
            </label>
            {custDeleteErr && (
              <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">{custDeleteErr}</div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={custDeleteBusy}
                onClick={() => setCustDeleteModal(null)}
                className="h-9 px-4 bg-gray-100 rounded-lg text-sm font-medium hover:bg-gray-200 cursor-pointer disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={custDeleteBusy}
                onClick={runDeleteCustomer}
                className="h-9 px-4 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 cursor-pointer disabled:opacity-50"
              >
                {custDeleteBusy ? 'Đang xóa…' : 'Xóa'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Customer Form Modal ──
function CustomerFormModal({ open, onClose, onSaved, editId, custStatuses = [] }) {
  const [form, setForm] = useState({});
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.get('/users').then(r => setUsers(r.data.users || [])).catch(() => {});
    if (editId) {
      api.get(`/customers/${editId}`).then(r => setForm(r.data.customer || {}));
    } else {
      setForm({ full_name: '', phone: '', email: '', company: '', address: '', city: '', source: '', status_id: '', gender: '', notes: '', assigned_to: '' });
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Họ tên *</label>
            <input value={form.full_name || ''} onChange={e => set('full_name', e.target.value)} required className="w-full h-9 px-3 border rounded-lg text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">SĐT *</label>
            <input value={form.phone || ''} onChange={e => set('phone', e.target.value)} required className="w-full h-9 px-3 border rounded-lg text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Công ty</label>
            <input value={form.company || ''} onChange={e => set('company', e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Địa chỉ</label>
            <input value={form.address || ''} onChange={e => set('address', e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Thành phố</label>
            <input value={form.city || ''} onChange={e => set('city', e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Nguồn KH</label>
            <select value={form.source || ''} onChange={e => set('source', e.target.value)} className="w-full h-9 px-2 border rounded-lg text-sm bg-white">
              <option value="">— Chọn —</option>
              {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Trạng thái KH</label>
            <select value={form.status_id || ''} onChange={e => set('status_id', e.target.value || null)} className="w-full h-9 px-2 border rounded-lg text-sm bg-white">
              <option value="">— Chưa chọn —</option>
              {custStatuses.filter(s => s.is_active !== false).map(s => (
                <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
              ))}
            </select></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Giới tính</label>
            <select value={form.gender || ''} onChange={e => set('gender', e.target.value)} className="w-full h-9 px-2 border rounded-lg text-sm bg-white">
              <option value="">— Chọn —</option><option value="male">Nam</option><option value="female">Nữ</option>
            </select></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Phụ trách</label>
            <select value={form.assigned_to || ''} onChange={e => set('assigned_to', e.target.value || null)} className="w-full h-9 px-2 border rounded-lg text-sm bg-white">
              <option value="">— Chọn —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select></div>
        </div>
        <div><label className="block text-xs font-medium text-gray-500 mb-1">Ghi chú</label>
          <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 px-4 bg-gray-100 rounded-lg text-sm font-medium cursor-pointer hover:bg-gray-200">Hủy</button>
          <button type="submit" disabled={loading} className="h-9 px-5 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Đang lưu...' : editId ? 'Cập nhật' : 'Tạo KH'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
