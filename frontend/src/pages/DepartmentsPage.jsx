import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import Modal from '../components/Modal';
import { useAuth } from '../lib/auth';
import { getInitials, avatarColor, ROLE_LABELS, formatDate } from '../lib/utils';
import {
  Plus, Search, Users, Trash2, Edit, UserPlus, Building, MessageCircle,
  Send, Pin, Reply, MoreVertical, ChevronLeft, Paperclip, X, ArrowLeft
} from 'lucide-react';

// ═══════════════════════════════════════════════
// DEPARTMENTS PAGE — CRUD + Members
// ═══════════════════════════════════════════════
export default function DepartmentsPage() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editDept, setEditDept] = useState(null);
  const [selectedDept, setSelectedDept] = useState(null);
  const [deptDetail, setDeptDetail] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [addUserId, setAddUserId] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    api.get('/departments')
      .then(r => setDepartments(r.data.departments || []))
      .catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const loadDetail = async (id) => {
    setSelectedDept(id);
    try {
      const [detailRes, usersRes] = await Promise.all([
        api.get(`/departments/${id}`),
        api.get('/users'),
      ]);
      setDeptDetail(detailRes.data);
      setAllUsers(usersRes.data.users || []);
    } catch { }
  };

  const addMember = async () => {
    if (!addUserId || !selectedDept) return;
    try {
      await api.post(`/departments/${selectedDept}/members`, { user_id: addUserId });
      setAddUserId('');
      loadDetail(selectedDept); load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const removeMember = async (userId) => {
    if (!confirm('Xóa nhân viên khỏi phòng ban?')) return;
    await api.delete(`/departments/${selectedDept}/members/${userId}`);
    loadDetail(selectedDept); load();
  };

  const isAdmin = ['admin', 'manager'].includes(user?.role);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building className="h-6 w-6 text-gray-400" /> Quản lý phòng ban
          </h1>
          <p className="text-sm text-gray-500">{departments.length} phòng ban</p>
        </div>
        {isAdmin && (
          <button onClick={() => { setEditDept(null); setShowCreate(true); }}
            className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer">
            <Plus className="h-4 w-4" /> Thêm phòng ban
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Department list */}
        <div className="lg:col-span-1 space-y-2">
          {loading ? (
            <div className="text-center py-10"><svg className="animate-spin h-6 w-6 text-gray-400 mx-auto" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg></div>
          ) : departments.map(d => (
            <div key={d.id} onClick={() => loadDetail(d.id)}
              className={`bg-white rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md ${selectedDept === d.id ? 'ring-2 ring-blue-500 border-blue-300' : 'border-gray-200'}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: d.color + '20' }}>
                  <Building className="h-5 w-5" style={{ color: d.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{d.name}</h3>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{d.member_count || 0} người</span>
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); navigate(`/departments/${d.id}/chat`); }}
                  className="w-8 h-8 rounded-lg hover:bg-blue-50 flex items-center justify-center text-gray-400 hover:text-blue-500 cursor-pointer"
                  title="Trao đổi">
                  <MessageCircle className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          {!loading && departments.length === 0 && (
            <div className="text-center py-10 text-gray-400">
              <Building className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Chưa có phòng ban</p>
            </div>
          )}
        </div>

        {/* Right: Department detail */}
        <div className="lg:col-span-2">
          {deptDetail ? (
            <div className="bg-white rounded-xl border p-5 space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: deptDetail.department.color + '20' }}>
                    <Building className="h-6 w-6" style={{ color: deptDetail.department.color }} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{deptDetail.department.name}</h2>
                    {deptDetail.department.description && <p className="text-xs text-gray-500">{deptDetail.department.description}</p>}
                    {deptDetail.department.manager && (
                      <p className="text-xs text-indigo-600 mt-0.5">👤 Trưởng phòng: {deptDetail.department.manager.full_name}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => navigate(`/departments/${selectedDept}/chat`)}
                    className="h-8 px-3 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 cursor-pointer flex items-center gap-1">
                    <MessageCircle className="h-3 w-3" /> Trao đổi
                    {deptDetail.unread > 0 && (
                      <span className="ml-1 bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">{deptDetail.unread}</span>
                    )}
                  </button>
                  {isAdmin && (
                    <>
                      <button onClick={() => { setEditDept(deptDetail.department); setShowCreate(true); }}
                        className="h-8 px-3 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 cursor-pointer flex items-center gap-1">
                        <Edit className="h-3 w-3" /> Sửa
                      </button>
                      <button onClick={async () => {
                        if (!confirm(`Vô hiệu hóa phòng ban "${deptDetail.department.name}"?`)) return;
                        await api.delete(`/departments/${selectedDept}`);
                        setSelectedDept(null); setDeptDetail(null); load();
                      }}
                        className="h-8 px-3 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 cursor-pointer flex items-center gap-1">
                        <Trash2 className="h-3 w-3" /> Xóa
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg p-3" style={{ backgroundColor: deptDetail.department.color + '10' }}>
                  <p className="text-xs font-medium" style={{ color: deptDetail.department.color }}>Nhân viên</p>
                  <p className="text-xl font-bold text-gray-900">{deptDetail.members?.length || 0}</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-blue-600">Tin chưa đọc</p>
                  <p className="text-xl font-bold text-blue-900">{deptDetail.unread || 0}</p>
                </div>
              </div>

              {/* Members */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4" /> Nhân viên ({deptDetail.members?.length || 0})
                </h3>
                {isAdmin && (
                  <div className="flex gap-2 mb-3">
                    <select value={addUserId} onChange={e => setAddUserId(e.target.value)} className="flex-1 h-9 px-3 border rounded-lg text-sm bg-white">
                      <option value="">— Thêm nhân viên —</option>
                      {allUsers
                        .filter(u => !deptDetail.members?.find(m => m.id === u.id) && u.is_active)
                        .map(u => <option key={u.id} value={u.id}>{u.full_name} ({ROLE_LABELS[u.role] || u.role})</option>)}
                    </select>
                    <button onClick={addMember} disabled={!addUserId}
                      className="h-9 px-3 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50 flex items-center gap-1">
                      <UserPlus className="h-4 w-4" /> Thêm
                    </button>
                  </div>
                )}
                <div className="space-y-1">
                  {deptDetail.members?.map(m => (
                    <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 group">
                      <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                        style={{ backgroundColor: avatarColor(m.full_name) }}>
                        {getInitials(m.full_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{m.full_name}</p>
                        <p className="text-xs text-gray-500">{m.position || ROLE_LABELS[m.role] || m.role} · {m.email}</p>
                      </div>
                      {isAdmin && (
                        <button onClick={() => removeMember(m.id)}
                          className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 cursor-pointer">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {!deptDetail.members?.length && <p className="text-xs text-gray-400 py-3 text-center">Chưa có nhân viên</p>}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border p-10 text-center text-gray-400">
              <Building className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Chọn phòng ban bên trái để xem chi tiết</p>
            </div>
          )}
        </div>
      </div>

      <DeptFormModal
        open={showCreate || !!editDept}
        department={editDept}
        allUsers={allUsers.length ? allUsers : []}
        onClose={() => { setShowCreate(false); setEditDept(null); }}
        onSaved={() => { load(); if (selectedDept) loadDetail(selectedDept); }}
      />
    </div>
  );
}

// ═══ Department Form Modal ═══
function DeptFormModal({ open, department, allUsers, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (open) {
      setForm(department || { name: '', slug: '', description: '', color: '#6366F1', manager_id: '' });
      if (!allUsers.length) api.get('/users').then(r => setUsers(r.data.users || []));
      else setUsers(allUsers);
    }
  }, [open, department, allUsers]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    if (!form.name?.trim()) return;
    setLoading(true);
    try {
      if (department?.id) await api.put(`/departments/${department.id}`, form);
      else await api.post('/departments', form);
      onSaved(); onClose();
    } catch { }
    setLoading(false);
  };

  const COLORS = ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#F97316', '#06B6D4', '#3B82F6', '#EF4444', '#84CC16'];

  return (
    <Modal open={open} onClose={onClose} title={department ? 'Sửa phòng ban' : 'Thêm phòng ban'}>
      <form onSubmit={submit} className="space-y-4">
        <div><label className="block text-sm font-medium mb-1">Tên phòng ban *</label>
          <input value={form.name || ''} onChange={e => set('name', e.target.value)} required className="input" placeholder="Phòng Kinh doanh" /></div>
        <div><label className="block text-sm font-medium mb-1">Mô tả</label>
          <input value={form.description || ''} onChange={e => set('description', e.target.value)} className="input" placeholder="Mô tả ngắn..." /></div>
        <div><label className="block text-sm font-medium mb-1">Trưởng phòng</label>
          <select value={form.manager_id || ''} onChange={e => set('manager_id', e.target.value || null)} className="input">
            <option value="">— Chọn —</option>
            {users.filter(u => u.is_active).map(u => <option key={u.id} value={u.id}>{u.full_name} ({ROLE_LABELS[u.role] || u.role})</option>)}
          </select></div>
        <div><label className="block text-sm font-medium mb-1">Màu sắc</label>
          <div className="flex gap-2 flex-wrap">
            {COLORS.map(c => (
              <button key={c} type="button" onClick={() => set('color', c)}
                className={`w-8 h-8 rounded-lg cursor-pointer transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-gray-900 scale-110' : 'hover:scale-105'}`}
                style={{ backgroundColor: c }} />
            ))}
          </div></div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 px-4 bg-gray-100 text-gray-700 rounded-lg text-sm cursor-pointer">Hủy</button>
          <button type="submit" disabled={loading} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50">
            {loading ? 'Đang lưu...' : department ? 'Cập nhật' : 'Tạo mới'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
