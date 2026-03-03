import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import Modal from '../components/Modal';
import { useAuth } from '../lib/auth';
import { getInitials, avatarColor, ROLE_LABELS } from '../lib/utils';
import { Plus, Search, Users, Trash2, Edit, Building, MoreVertical, UsersRound, UserPlus, X } from 'lucide-react';

export default function TeamsPage() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTeam, setEditTeam] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [teamDetail, setTeamDetail] = useState(null);
  const [menuTeam, setMenuTeam] = useState(null);

  // Filter
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [filterCompany, setFilterCompany] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const { user } = useAuth();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterDept) params.department_id = filterDept;
      else if (filterCompany) params.company_id = filterCompany;
      const [tRes, cRes, dRes] = await Promise.all([
        api.get('/teams', { params }),
        api.get('/companies'),
        api.get('/departments'),
      ]);
      setTeams(tRes.data.teams || []);
      setCompanies(cRes.data.companies || []);
      setDepartments(dRes.data.departments || []);
    } catch {}
    setLoading(false);
  }, [filterCompany, filterDept]);

  useEffect(() => { load(); }, [load]);

  const loadDetail = async (id) => {
    setSelectedTeam(id);
    try {
      const { data } = await api.get(`/teams/${id}`);
      setTeamDetail(data);
    } catch {}
  };

  const deleteTeam = async (id, name) => {
    if (!confirm(`Vô hiệu hóa team "${name}"?`)) return;
    await api.delete(`/teams/${id}`);
    if (selectedTeam === id) { setSelectedTeam(null); setTeamDetail(null); }
    setMenuTeam(null); load();
  };

  const isAdmin = ['admin', 'manager'].includes(user?.role);
  const filteredDepts = filterCompany ? departments.filter(d => d.company_id === filterCompany) : departments;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><UsersRound className="h-6 w-6 text-gray-400" /> Quản lý Team</h1>
          <p className="text-sm text-gray-500">{teams.length} team</p>
        </div>
        {isAdmin && (
          <button onClick={() => { setEditTeam(null); setShowCreate(true); }}
            className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer">
            <Plus className="h-4 w-4" /> Thêm team
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={filterCompany} onChange={e => { setFilterCompany(e.target.value); setFilterDept(''); }} className="h-8 px-3 border rounded-lg text-sm">
          <option value="">Tất cả Cty</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="h-8 px-3 border rounded-lg text-sm">
          <option value="">Tất cả PB</option>
          {filteredDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Team list */}
        <div className="lg:col-span-1 space-y-2">
          {loading ? (
            <div className="text-center py-10"><div className="animate-spin h-6 w-6 border-2 border-gray-200 border-t-gray-600 rounded-full mx-auto" /></div>
          ) : teams.map(t => {
            const dept = departments.find(d => d.id === t.department_id);
            return (
              <div key={t.id} onClick={() => loadDetail(t.id)}
                className={`bg-white rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md ${selectedTeam === t.id ? 'ring-2 ring-blue-500' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: (t.color || '#3b82f6') + '20' }}>
                    <UsersRound className="h-5 w-5" style={{ color: t.color || '#3b82f6' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{t.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" />{t.member_count || 0}</span>
                      {dept && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: dept.color + '20', color: dept.color }}>{dept.name}</span>}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="relative">
                      <button onClick={e => { e.stopPropagation(); setMenuTeam(menuTeam === t.id ? null : t.id); }}
                        className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 cursor-pointer"><MoreVertical className="h-4 w-4" /></button>
                      {menuTeam === t.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setMenuTeam(null)} />
                          <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg shadow-lg border z-50 py-1">
                            <button onClick={e => { e.stopPropagation(); setMenuTeam(null); setEditTeam(t); setShowCreate(true); }}
                              className="w-full px-3 py-2 text-xs text-left hover:bg-gray-50 cursor-pointer text-gray-700"><Edit className="h-3 w-3 inline mr-1" /> Sửa</button>
                            <button onClick={e => { e.stopPropagation(); deleteTeam(t.id, t.name); }}
                              className="w-full px-3 py-2 text-xs text-left hover:bg-red-50 cursor-pointer text-red-600"><Trash2 className="h-3 w-3 inline mr-1" /> Xóa</button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {!loading && teams.length === 0 && <p className="text-center text-sm text-gray-400 py-8">Chưa có team nào</p>}
        </div>

        {/* Right: Detail */}
        <div className="lg:col-span-2">
          {teamDetail ? (
            <div className="bg-white rounded-xl border p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: (teamDetail.team?.color || '#3b82f6') + '20' }}>
                  <UsersRound className="h-6 w-6" style={{ color: teamDetail.team?.color || '#3b82f6' }} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{teamDetail.team?.name}</h2>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {teamDetail.team?.department && <span style={{ color: teamDetail.team.department.color }}>{teamDetail.team.department.name}</span>}
                    {teamDetail.team?.leader && <span>· TN: {teamDetail.team.leader.full_name}</span>}
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-gray-900">Thành viên ({teamDetail.members?.length || 0})</h3>
                </div>
                <div className="space-y-2">
                  {(teamDetail.members || []).map(m => (
                    <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 group">
                      <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: avatarColor(m.full_name) }}>{getInitials(m.full_name)}</div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{m.full_name}</p>
                        <p className="text-xs text-gray-400">{m.email}{m.position ? ` · ${m.position}` : ''}</p>
                      </div>
                      {isAdmin && (
                        <button onClick={async () => {
                          if (!confirm(`Xóa ${m.full_name} khỏi team?`)) return;
                          try { await api.delete(`/teams/${selectedTeam}/members/${m.id}`); loadDetail(selectedTeam); load(); } catch {}
                        }} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-gray-300 hover:text-red-500 cursor-pointer opacity-0 group-hover:opacity-100">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {teamDetail.members?.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Chưa có thành viên</p>}
                </div>

                {/* Add member form */}
                {isAdmin && selectedTeam && <AddTeamMember teamId={selectedTeam} existingIds={(teamDetail.members || []).map(m => m.id)} onAdded={() => { loadDetail(selectedTeam); load(); }} />}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border p-10 text-center">
              <UsersRound className="h-12 w-12 mx-auto text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">Chọn team để xem chi tiết</p>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showCreate && <TeamFormModal open={showCreate} team={editTeam} companies={companies} departments={departments}
        onClose={() => { setShowCreate(false); setEditTeam(null); }} onSaved={load} />}
    </div>
  );
}

function TeamFormModal({ open, team, companies, departments: allDepts, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [filterCo, setFilterCo] = useState('');
  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (open) {
      setForm(team || { name: '', short_name: '', department_id: '', leader_id: '', description: '', color: '#3B82F6' });
      if (team?.department_id) {
        const dept = allDepts.find(d => d.id === team.department_id);
        if (dept?.company_id) setFilterCo(dept.company_id);
      }
      api.get('/users').then(r => setUsers(r.data.users || [])).catch(() => {});
    }
  }, [open, team]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const depts = filterCo ? allDepts.filter(d => d.company_id === filterCo) : allDepts;

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name?.trim() || !form.department_id) return alert('Cần tên và phòng ban');
    setLoading(true);
    try {
      if (team?.id) await api.put(`/teams/${team.id}`, form);
      else await api.post('/teams', form);
      onSaved(); onClose();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setLoading(false);
  };

  const COLORS = ['#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#F97316', '#06B6D4', '#EF4444', '#84CC16'];

  return (
    <Modal open={open} onClose={onClose} title={team ? 'Sửa team' : 'Thêm team'}>
      <form onSubmit={submit} className="space-y-4">
        <div><label className="block text-sm font-medium mb-1">Tên team *</label>
          <input value={form.name || ''} onChange={e => set('name', e.target.value)} required className="input" placeholder="Team A" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-sm font-medium mb-1">Công ty</label>
            <select value={filterCo} onChange={e => { setFilterCo(e.target.value); set('department_id', ''); }} className="input">
              <option value="">Tất cả Cty</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div><label className="block text-sm font-medium mb-1">Phòng ban *</label>
            <select value={form.department_id || ''} onChange={e => set('department_id', e.target.value)} required className="input">
              <option value="">— Chọn PB —</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select></div>
        </div>
        <div><label className="block text-sm font-medium mb-1">Trưởng nhóm</label>
          <select value={form.leader_id || ''} onChange={e => set('leader_id', e.target.value || null)} className="input">
            <option value="">— Chọn —</option>
            {users.filter(u => u.is_active).map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
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
          <button type="button" onClick={onClose} className="h-9 px-4 bg-gray-100 rounded-lg text-sm cursor-pointer">Hủy</button>
          <button type="submit" disabled={loading} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50">{loading ? '...' : team ? 'Cập nhật' : 'Tạo team'}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ═══ ADD TEAM MEMBER — Hiện NV của PB để chọn nhiều ═══ */
function AddTeamMember({ teamId, existingIds, onAdded }) {
  const [deptUsers, setDeptUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');

  const loadAvailable = async () => {
    setLoading(true);
    try {
      const [dRes, uRes] = await Promise.all([
        api.get(`/teams/${teamId}/available-members`),
        api.get('/users'),
      ]);
      setDeptUsers(dRes.data.users || []);
      setAllUsers(uRes.data.users || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    if (showForm) { loadAvailable(); setSelectedIds([]); setSearch(''); }
  }, [showForm, teamId]);

  const available = deptUsers.filter(u => !existingIds.includes(u.id));
  const otherUsers = allUsers.filter(u => u.is_active && !existingIds.includes(u.id) && !deptUsers.find(d => d.id === u.id));

  const filtered = (list) => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(u => u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
  };

  const toggle = (uid) => {
    setSelectedIds(prev => prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid]);
  };

  const addMembers = async () => {
    if (!selectedIds.length) return;
    setAdding(true);
    try {
      await api.post(`/teams/${teamId}/members`, { user_ids: selectedIds });
      setSelectedIds([]);
      onAdded();
      loadAvailable();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setAdding(false);
  };

  if (!showForm) {
    return (
      <button onClick={() => setShowForm(true)}
        className="w-full mt-3 h-9 border-2 border-dashed border-gray-300 rounded-xl text-xs text-gray-500 flex items-center justify-center gap-2 hover:border-blue-400 hover:text-blue-600 cursor-pointer transition-colors">
        <UserPlus className="h-4 w-4" /> Thêm nhân viên vào team
      </button>
    );
  }

  const deptAvailable = filtered(available);
  const otherFiltered = filtered(otherUsers);

  return (
    <div className="mt-3 bg-blue-50 rounded-xl border border-blue-200 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-blue-800 flex items-center gap-1.5">
          <UserPlus className="h-3.5 w-3.5" /> Thêm NV vào team
          {selectedIds.length > 0 && (
            <span className="ml-1 bg-blue-600 text-white text-[9px] px-1.5 py-0.5 rounded-full">{selectedIds.length} đã chọn</span>
          )}
        </h4>
        <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer"><X className="h-3.5 w-3.5" /></button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          className="w-full h-8 pl-8 pr-3 border rounded-lg text-xs" placeholder="Tìm nhân viên..." />
      </div>

      {loading ? (
        <div className="py-3 text-center"><div className="animate-spin h-4 w-4 border-2 border-blue-200 border-t-blue-600 rounded-full mx-auto" /></div>
      ) : (
        <div className="max-h-[250px] overflow-y-auto space-y-0.5">
          {/* NV cùng phòng ban */}
          {deptAvailable.length > 0 && (
            <>
              <p className="text-[9px] font-semibold text-gray-500 uppercase px-1 pt-1">Cùng phòng ban ({deptAvailable.length})</p>
              {deptAvailable.map(u => {
                const sel = selectedIds.includes(u.id);
                const inOther = u.team_id && u.team_id !== teamId;
                return (
                  <label key={u.id} className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer transition-colors ${sel ? 'bg-blue-100' : 'hover:bg-white'}`}>
                    <input type="checkbox" checked={sel} onChange={() => toggle(u.id)} className="accent-blue-600 shrink-0" />
                    <div className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                      style={{ backgroundColor: avatarColor(u.full_name) }}>{getInitials(u.full_name)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">{u.full_name}</p>
                      <p className="text-[10px] text-gray-400 truncate">{u.email}{u.position ? ` · ${u.position}` : ''}</p>
                    </div>
                    {inOther && <span className="text-[8px] bg-amber-100 text-amber-600 px-1 rounded shrink-0">team khác</span>}
                  </label>
                );
              })}
            </>
          )}

          {/* NV khác phòng ban */}
          {otherFiltered.length > 0 && search.trim() && (
            <>
              <p className="text-[9px] font-semibold text-gray-500 uppercase px-1 pt-2">Nhân viên khác ({otherFiltered.length})</p>
              {otherFiltered.slice(0, 20).map(u => {
                const sel = selectedIds.includes(u.id);
                return (
                  <label key={u.id} className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer transition-colors ${sel ? 'bg-blue-100' : 'hover:bg-white'}`}>
                    <input type="checkbox" checked={sel} onChange={() => toggle(u.id)} className="accent-blue-600 shrink-0" />
                    <div className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                      style={{ backgroundColor: avatarColor(u.full_name) }}>{getInitials(u.full_name)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">{u.full_name}</p>
                      <p className="text-[10px] text-gray-400 truncate">{u.email}</p>
                    </div>
                    <span className="text-[8px] bg-gray-100 text-gray-500 px-1 rounded shrink-0">PB khác</span>
                  </label>
                );
              })}
              {otherFiltered.length > 20 && <p className="text-[9px] text-gray-400 text-center py-1">+{otherFiltered.length - 20} NV khác...</p>}
            </>
          )}

          {deptAvailable.length === 0 && (!search.trim() || otherFiltered.length === 0) && (
            <p className="text-xs text-gray-500 text-center py-3">
              {search.trim() ? 'Không tìm thấy nhân viên' : 'Tất cả NV trong PB đã thuộc team này'}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between pt-1 border-t border-blue-200">
          <p className="text-[10px] text-blue-600">{selectedIds.length} nhân viên được chọn</p>
          <div className="flex gap-2">
            <button onClick={() => setSelectedIds([])} className="h-7 px-2 text-[10px] text-gray-500 hover:text-gray-700 cursor-pointer">Bỏ chọn</button>
            <button onClick={addMembers} disabled={adding}
              className="h-7 px-4 bg-blue-600 text-white rounded-lg text-[10px] font-medium cursor-pointer disabled:opacity-50 flex items-center gap-1">
              <UserPlus className="h-3 w-3" /> {adding ? 'Đang thêm...' : `Thêm ${selectedIds.length} NV`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
