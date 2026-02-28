import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import Modal from '../components/Modal';
import { Plus, Search, Mail, Phone, Trash2, Edit, Users as UsersIcon, MoreVertical } from 'lucide-react';
import { formatDate, getInitials, avatarColor } from '../lib/utils';

const ROLES = { admin: 'Admin', manager: 'Quản lý', sales: 'Kinh doanh', designer: 'Thiết kế', production: 'Sản xuất', driver: 'Tài xế', installer: 'Lắp đặt', customer_care: 'CSKH', staff: 'Nhân viên' };
const ROLE_COLORS = { admin: 'bg-red-100 text-red-700', manager: 'bg-purple-100 text-purple-700', sales: 'bg-blue-100 text-blue-700', designer: 'bg-pink-100 text-pink-700', production: 'bg-orange-100 text-orange-700', installer: 'bg-cyan-100 text-cyan-700', customer_care: 'bg-green-100 text-green-700', driver: 'bg-amber-100 text-amber-700', staff: 'bg-gray-100 text-gray-600' };

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({});
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [showDetail, setShowDetail] = useState(null);
  const [menuUser, setMenuUser] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (search) params.search = search;
    if (filterRole) params.role = filterRole;
    if (filterDept) params.department_id = filterDept; // 'none' or UUID

    api.get('/users', { params })
      .then(r => {
        setUsers(r.data.users || []);
        setStats(r.data.stats || {});
      })
      .catch(err => { console.error('Load users error:', err); })
      .finally(() => setLoading(false));
  }, [search, filterRole, filterDept]);

  useEffect(() => {
    load();
    api.get('/users/departments').then(r => setDepartments(r.data.departments || [])).catch(() => {});
  }, []);

  // Re-load when filters change
  useEffect(() => { load(); }, [filterRole, filterDept]);

  const searchSubmit = () => load();

  const deactivate = async (id, name) => {
    if (!confirm(`Vô hiệu hóa nhân viên "${name}"?`)) return;
    await api.delete(`/users/${id}`);
    setMenuUser(null);
    load();
  };

  // Count NV chưa có phòng ban
  const noDeptCount = users.filter(u => !u.department_id).length;

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><UsersIcon className="h-6 w-6 text-gray-400" /> Quản lý nhân viên</h1>
          <p className="text-sm text-gray-500 mt-0.5">{stats.total || users.length} nhân viên</p>
        </div>
        <button onClick={() => { setEditUser(null); setShowCreate(true); }}
          className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer">
          <Plus className="h-4 w-4" /> Thêm NV
        </button>
      </div>

      {/* Role filter chips */}
      <div className="flex gap-2 overflow-x-auto">
        <button onClick={() => setFilterRole('')} className={`h-8 px-3 rounded-lg text-xs font-medium shrink-0 cursor-pointer ${!filterRole ? 'bg-gray-900 text-white' : 'bg-white border text-gray-600'}`}>Tất cả</button>
        {Object.entries(ROLES).map(([k, v]) => (
          <button key={k} onClick={() => setFilterRole(k === filterRole ? '' : k)}
            className={`h-8 px-3 rounded-lg text-xs font-medium shrink-0 cursor-pointer flex items-center gap-1.5 ${filterRole === k ? 'bg-gray-900 text-white' : 'bg-white border text-gray-600'}`}>
            {v} {stats.byRole?.[k] > 0 && <span className="text-[10px] opacity-60">{stats.byRole[k]}</span>}
          </button>
        ))}
      </div>

      {/* Search + dept filter */}
      <div className="flex gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchSubmit()}
            placeholder="Tìm tên, email, SĐT..." className="w-full h-9 pl-10 pr-3 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        </div>
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="h-9 px-3 border rounded-lg text-sm bg-white">
          <option value="">Tất cả phòng ban</option>
          <option value="none">⚠️ Chưa có phòng ban</option>
          {departments.map(d => (
            <option key={d.id} value={d.id}>
              {d.name} {stats.byDept?.[d.name] ? `(${stats.byDept[d.name]})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Active filter banner */}
      {filterDept === 'none' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 flex items-center gap-2">
          ⚠️ Đang hiển thị nhân viên <strong>chưa được gán phòng ban</strong> — {users.length} người
        </div>
      )}

      {/* Users grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg></div>
      ) : users.length === 0 ? (
        <div className="text-center py-16"><UsersIcon className="h-12 w-12 mx-auto text-gray-300 mb-3" /><p className="text-sm text-gray-400">
          {filterDept === 'none' ? 'Tất cả nhân viên đều đã có phòng ban 👍' : 'Không tìm thấy nhân viên'}
        </p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {users.map((u, i) => (
            <div key={u.id}
              className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer animate-fade-in group relative"
              style={{ animationDelay: `${i * 20}ms` }}>
              <div className="h-11 w-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                style={{ backgroundColor: avatarColor(u.full_name) }}>{getInitials(u.full_name)}</div>
              <div className="flex-1 min-w-0" onClick={() => setShowDetail(u.id)}>
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{u.full_name}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role] || 'bg-gray-100'}`}>{ROLES[u.role] || u.role}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1 truncate"><Mail className="h-3 w-3 shrink-0" />{u.email}</span>
                  {u.phone && <span className="flex items-center gap-1 shrink-0"><Phone className="h-3 w-3" />{u.phone}</span>}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {u.position && <span className="text-[10px] text-gray-400">{u.position}</span>}
                  {u.position && <span className="text-[10px] text-gray-300">·</span>}
                  {u.department ? (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: u.department.color + '20', color: u.department.color }}>
                      {u.department.name}
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Chưa có phòng ban</span>
                  )}
                </div>
              </div>

              {/* 3-dot menu */}
              <div className="relative shrink-0">
                <button onClick={(e) => { e.stopPropagation(); setMenuUser(menuUser === u.id ? null : u.id); }}
                  className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer">
                  <MoreVertical className="h-4 w-4" />
                </button>
                {menuUser === u.id && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuUser(null)} />
                    <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg shadow-lg border z-50 py-1">
                      <button onClick={() => { setMenuUser(null); setShowDetail(u.id); }}
                        className="w-full px-3 py-2 text-xs text-left hover:bg-gray-50 flex items-center gap-2 cursor-pointer text-gray-700">
                        <UsersIcon className="h-3 w-3" /> Xem chi tiết
                      </button>
                      <button onClick={() => { setMenuUser(null); setEditUser(u); setShowCreate(true); }}
                        className="w-full px-3 py-2 text-xs text-left hover:bg-gray-50 flex items-center gap-2 cursor-pointer text-gray-700">
                        <Edit className="h-3 w-3" /> Chỉnh sửa
                      </button>
                      <button onClick={() => deactivate(u.id, u.full_name)}
                        className="w-full px-3 py-2 text-xs text-left hover:bg-red-50 flex items-center gap-2 cursor-pointer text-red-600">
                        <Trash2 className="h-3 w-3" /> Vô hiệu hóa
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <StaffFormModal open={showCreate} onClose={() => { setShowCreate(false); setEditUser(null); }} onSaved={load} editUser={editUser} departments={departments} />
      <StaffDetailModal userId={showDetail} open={!!showDetail} onClose={() => setShowDetail(null)} />
    </div>
  );
}

// ═══ Staff Form Modal ═══
function StaffFormModal({ open, onClose, onSaved, editUser, departments }) {
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    if (editUser) {
      setForm({ ...editUser, department_id: editUser.department_id || editUser.department?.id || '', password: '' });
    } else {
      setForm({ full_name: '', email: '', phone: '', role: 'staff', position: '', department_id: '', password: '', date_of_birth: '', hire_date: '', address: '', emergency_contact: '', notes: '' });
    }
  }, [open, editUser]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      payload.department_id = payload.department_id || null; // ensure null, not empty string
      if (editUser) await api.put(`/users/${editUser.id}`, payload);
      else await api.post('/users', payload);
      onSaved?.(); onClose();
    } catch (err) { alert(err.response?.data?.error || 'Lỗi'); }
    setLoading(false);
  };
  return (
    <Modal open={open} onClose={onClose} title={editUser ? 'Sửa nhân viên' : 'Thêm nhân viên mới'} size="md">
      <form onSubmit={submit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Họ tên *</label><input value={form.full_name || ''} onChange={e => set('full_name', e.target.value)} required className="input" /></div>
          <div><label className="block text-sm font-medium mb-1">Email *</label><input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} required className="input" disabled={!!editUser} /></div>
          <div><label className="block text-sm font-medium mb-1">SĐT</label><input value={form.phone || ''} onChange={e => set('phone', e.target.value)} className="input" /></div>
          <div><label className="block text-sm font-medium mb-1">Mật khẩu {editUser ? '(trống = giữ nguyên)' : '*'}</label><input type="password" value={form.password || ''} onChange={e => set('password', e.target.value)} className="input" required={!editUser} placeholder={editUser ? '••••••' : 'admin123'} /></div>
          <div><label className="block text-sm font-medium mb-1">Vai trò</label>
            <select value={form.role || 'staff'} onChange={e => set('role', e.target.value)} className="input">
              {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div><label className="block text-sm font-medium mb-1">Chức vụ</label><input value={form.position || ''} onChange={e => set('position', e.target.value)} className="input" placeholder="VD: Trưởng phòng" /></div>
          <div className="col-span-2"><label className="block text-sm font-medium mb-1">Phòng ban</label>
            <select value={form.department_id || ''} onChange={e => set('department_id', e.target.value)} className="input">
              <option value="">— Chưa có phòng ban —</option>
              {departments?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select></div>
          <div><label className="block text-sm font-medium mb-1">Ngày sinh</label><input type="date" value={form.date_of_birth || ''} onChange={e => set('date_of_birth', e.target.value)} className="input" /></div>
          <div><label className="block text-sm font-medium mb-1">Ngày vào làm</label><input type="date" value={form.hire_date || ''} onChange={e => set('hire_date', e.target.value)} className="input" /></div>
          <div><label className="block text-sm font-medium mb-1">Liên hệ khẩn cấp</label><input value={form.emergency_contact || ''} onChange={e => set('emergency_contact', e.target.value)} className="input" /></div>
        </div>
        <div><label className="block text-sm font-medium mb-1">Địa chỉ</label><input value={form.address || ''} onChange={e => set('address', e.target.value)} className="input" /></div>
        <div><label className="block text-sm font-medium mb-1">Ghi chú</label><textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} className="input min-h-[50px]" /></div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-10 px-4 bg-gray-100 rounded-lg text-sm cursor-pointer">Hủy</button>
          <button type="submit" disabled={loading} className="h-10 px-6 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer">{loading ? 'Lưu...' : editUser ? 'Cập nhật' : 'Tạo NV'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ═══ Staff Detail Modal ═══
function StaffDetailModal({ userId, open, onClose }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (!open || !userId) return; setLoading(true); api.get(`/users/${userId}`).then(r => setUser(r.data.user)).catch(() => {}).finally(() => setLoading(false)); }, [open, userId]);
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={user?.full_name || 'Nhân viên'} size="md">
      {loading || !user ? <div className="flex items-center justify-center h-32"><svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg></div> : (
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full flex items-center justify-center text-white font-bold text-2xl" style={{ backgroundColor: avatarColor(user.full_name) }}>{getInitials(user.full_name)}</div>
            <div>
              <h2 className="text-lg font-bold">{user.full_name}</h2>
              <p className="text-sm text-gray-500">{user.position || ROLES[user.role]}{user.department?.name ? ` · ${user.department.name}` : ''}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[user.role] || ''}`}>{ROLES[user.role]}</span>
                {user.department ? (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded" style={{ backgroundColor: user.department.color + '20', color: user.department.color }}>
                    {user.department.name}
                  </span>
                ) : (
                  <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded">Chưa có phòng ban</span>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3"><p className="text-[11px] text-gray-500">Email</p><p className="font-medium">{user.email}</p></div>
            <div className="bg-gray-50 rounded-lg p-3"><p className="text-[11px] text-gray-500">SĐT</p><p className="font-medium">{user.phone || '—'}</p></div>
            <div className="bg-gray-50 rounded-lg p-3"><p className="text-[11px] text-gray-500">Ngày sinh</p><p className="font-medium">{formatDate(user.date_of_birth) || '—'}</p></div>
            <div className="bg-gray-50 rounded-lg p-3"><p className="text-[11px] text-gray-500">Ngày vào làm</p><p className="font-medium">{formatDate(user.hire_date) || '—'}</p></div>
          </div>
          {user.taskStats && (
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-blue-50 rounded-lg p-3 text-center"><p className="text-lg font-bold text-blue-600">{user.taskStats.assigned}</p><p className="text-[10px] text-gray-500">Được giao</p></div>
              <div className="bg-amber-50 rounded-lg p-3 text-center"><p className="text-lg font-bold text-amber-600">{user.taskStats.in_progress}</p><p className="text-[10px] text-gray-500">Đang làm</p></div>
              <div className="bg-emerald-50 rounded-lg p-3 text-center"><p className="text-lg font-bold text-emerald-600">{user.taskStats.done}</p><p className="text-[10px] text-gray-500">Hoàn thành</p></div>
              <div className="bg-purple-50 rounded-lg p-3 text-center"><p className="text-lg font-bold text-purple-600">{user.taskStats.created}</p><p className="text-[10px] text-gray-500">Đã tạo</p></div>
            </div>
          )}
          {user.recentTasks?.length > 0 && (
            <div><h4 className="text-sm font-semibold mb-2">Công việc đang thực hiện</h4>
              <div className="space-y-1">{user.recentTasks.map(t => (
                <div key={t.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{t.title}</p>{t.projects && <p className="text-[10px] text-gray-400">{t.projects.code}</p>}</div>
                  {t.due_date && <span className={`text-[10px] ${new Date(t.due_date) < new Date() ? 'text-red-500' : 'text-gray-400'}`}>{formatDate(t.due_date)}</span>}
                </div>
              ))}</div>
            </div>
          )}
          {user.address && <p className="text-xs text-gray-500">📍 {user.address}</p>}
        </div>
      )}
    </Modal>
  );
}
