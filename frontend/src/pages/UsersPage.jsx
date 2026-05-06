import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import Modal from '../components/Modal';
import UserRolesModal from '../components/UserRolesModal';
import { Plus, Search, Mail, Phone, Trash2, Edit, Users as UsersIcon, MoreVertical, Building2, Layers, UsersRound, Shield, MapPin } from 'lucide-react';
import { formatDate, getInitials, avatarColor } from '../lib/utils';

const ROLES = { admin: 'Admin', manager: 'Quản lý', region_admin: 'Admin khu vực', sales: 'Kinh doanh', designer: 'Thiết kế', production: 'Sản xuất', driver: 'Tài xế', installer: 'Lắp đặt', customer_care: 'CSKH', staff: 'Nhân viên' };
const ROLE_COLORS = { admin: 'bg-red-100 text-red-700', manager: 'bg-purple-100 text-purple-700', region_admin: 'bg-rose-100 text-rose-800', sales: 'bg-blue-100 text-blue-700', designer: 'bg-pink-100 text-pink-700', production: 'bg-orange-100 text-orange-700', installer: 'bg-cyan-100 text-cyan-700', customer_care: 'bg-green-100 text-green-700', driver: 'bg-amber-100 text-amber-700', staff: 'bg-gray-100 text-gray-600' };

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({});
  const [departments, setDepartments] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterDivision, setFilterDivision] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [showDetail, setShowDetail] = useState(null);
  const [menuUser, setMenuUser] = useState(null);
  const [showRolesModal, setShowRolesModal] = useState(null); // { userId, userName }

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (search) params.search = search;
    if (filterRole) params.role = filterRole;
    if (filterDept) params.department_id = filterDept;
    
    // Division filter: use ecosystem_unit_id (backend will get all children)
    if (filterDivision) {
      params.ecosystem_unit_id = filterDivision;
    } else if (filterCompany) {
      // No division selected, but company selected
      params.company_id = filterCompany;
    }
    
    api.get('/users', { params })
      .then(r => { setUsers(r.data.users || []); setStats(r.data.stats || {}); })
      .catch(() => {}).finally(() => setLoading(false));
  }, [search, filterRole, filterDept, filterCompany, filterDivision]);

  useEffect(() => {
    load();
    // Load departments, companies (from ecosystem level 2), divisions (level 1)
    Promise.all([
      api.get('/users/departments'),
      api.get('/ecosystem/units?level=2'), // Level 2 = companies
      api.get('/ecosystem/units?level=1'), // Level 1 = divisions (khối)
    ]).then(([deptRes, compRes, divRes]) => {
      setDepartments(deptRes.data.departments || []);
      
      // Companies from ecosystem (have parent_id = division)
      const companyUnits = compRes.data.units || [];
      setCompanies(companyUnits.map(u => ({
        id: u.company_id, // actual companies table id
        name: u.name,
        division_unit_id: u.parent_id, // parent = division
        unit_id: u.id, // ecosystem_units.id
      })).filter(c => c.id)); // Only units that have company_id
      
      setDivisions(divRes.data.units || []);
    }).catch(() => {});
  }, []);
  
  useEffect(() => { load(); }, [filterRole, filterDept, filterCompany, filterDivision]);

  const deactivate = async (id, name) => {
    if (!confirm(`Vô hiệu hóa nhân viên "${name}"?`)) return;
    await api.delete(`/users/${id}`);
    setMenuUser(null); load();
  };

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><UsersIcon className="h-6 w-6 text-gray-400" /> Quản lý nhân viên</h1>
          <p className="text-sm text-gray-500 mt-0.5">{stats.total || users.length} nhân viên</p>
        </div>
        <div className="flex items-center gap-2">
          <button data-tour="add-user" onClick={() => { setEditUser(null); setShowCreate(true); }}
          className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer">
          <Plus className="h-4 w-4" /> Thêm NV
        </button>
        </div>
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

      {/* Filters: Division + Company + Department + Search */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Division (Khối) */}
        <div className="flex items-center gap-2 bg-white border rounded-lg px-3 h-9">
          <Layers className="h-4 w-4 text-gray-400 shrink-0" />
          <select 
            value={filterDivision} 
            onChange={e => {
              setFilterDivision(e.target.value);
              setFilterCompany(''); // Reset company when division changes
            }} 
            className="flex-1 text-sm outline-none bg-transparent"
          >
            <option value="">Tất cả khối</option>
            {divisions.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        {/* Company */}
        <div className="flex items-center gap-2 bg-white border rounded-lg px-3 h-9">
          <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
          <select 
            value={filterCompany} 
            onChange={e => setFilterCompany(e.target.value)} 
            className="flex-1 text-sm outline-none bg-transparent"
          >
            <option value="">Tất cả công ty</option>
            {companies
              .filter(c => !filterDivision || c.division_unit_id === filterDivision)
              .map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))
            }
          </select>
        </div>

        {/* Department */}
        <div className="flex items-center gap-2 bg-white border rounded-lg px-3 h-9">
          <UsersRound className="h-4 w-4 text-gray-400 shrink-0" />
          <select 
            value={filterDept} 
            onChange={e => setFilterDept(e.target.value)} 
            className="flex-1 text-sm outline-none bg-transparent"
          >
            <option value="">Tất cả phòng ban</option>
            <option value="none">⚠️ Chưa có phòng ban</option>
            {departments
              .filter(d => !filterCompany || d.company_id === filterCompany)
              .map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))
            }
          </select>
        </div>

        {/* Search */}
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            onKeyDown={e => e.key === 'Enter' && load()}
            placeholder="Tìm tên, email, SĐT..." 
            className="w-full h-9 pl-10 pr-3 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white" 
          />
        </div>
      </div>

      {/* Active filters summary */}
      {(filterDivision || filterCompany || filterDept || filterRole) && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">Đang lọc:</span>
          {filterDivision && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full flex items-center gap-1">
              Khối: {divisions.find(d => d.id === filterDivision)?.name}
              <button onClick={() => setFilterDivision('')} className="hover:text-purple-900">×</button>
            </span>
          )}
          {filterCompany && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full flex items-center gap-1">
              Cty: {companies.find(c => c.id === filterCompany)?.name}
              <button onClick={() => setFilterCompany('')} className="hover:text-blue-900">×</button>
            </span>
          )}
          {filterDept && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full flex items-center gap-1">
              PB: {departments.find(d => d.id === filterDept)?.name}
              <button onClick={() => setFilterDept('')} className="hover:text-green-900">×</button>
            </span>
          )}
          {filterRole && (
            <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full flex items-center gap-1">
              Role: {ROLES[filterRole]}
              <button onClick={() => setFilterRole('')} className="hover:text-gray-900">×</button>
            </span>
          )}
          <button 
            onClick={() => {
              setFilterDivision('');
              setFilterCompany('');
              setFilterDept('');
              setFilterRole('');
            }}
            className="text-xs text-red-600 hover:text-red-800 font-medium"
          >
            Xóa tất cả
          </button>
        </div>
      )}

      {/* Users grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><div className="animate-spin h-6 w-6 border-2 border-gray-200 border-t-gray-600 rounded-full" /></div>
      ) : users.length === 0 ? (
        <div className="text-center py-16"><UsersIcon className="h-12 w-12 mx-auto text-gray-300 mb-3" /><p className="text-sm text-gray-400">Không tìm thấy nhân viên</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {users.map((u, i) => (
            <div key={u.id} className="bg-white rounded-xl border p-4 flex items-center gap-4 hover:shadow-md transition-all cursor-pointer group relative">
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
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {u.department ? (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: u.department.color + '20', color: u.department.color }}>{u.department.name}</span>
                  ) : (
                    <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Chưa có PB</span>
                  )}
                  {u.team && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: (u.team.color || '#3b82f6') + '20', color: u.team.color || '#3b82f6' }}>
                      👥 {u.team.name}
                    </span>
                  )}
                </div>
              </div>
              <div className="relative shrink-0">
                <button onClick={(e) => { e.stopPropagation(); setMenuUser(menuUser === u.id ? null : u.id); }}
                  className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer"><MoreVertical className="h-4 w-4" /></button>
                {menuUser === u.id && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuUser(null)} />
                    <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg shadow-lg border z-50 py-1">
                      <button onClick={() => { setMenuUser(null); setShowRolesModal({ userId: u.id, userName: u.full_name }); }}
                        className="w-full px-3 py-2 text-xs text-left hover:bg-purple-50 flex items-center gap-2 cursor-pointer text-purple-700"><Shield className="h-3 w-3" /> Phân quyền</button>
                      <button onClick={() => { setMenuUser(null); setEditUser(u); setShowCreate(true); }}
                        className="w-full px-3 py-2 text-xs text-left hover:bg-gray-50 flex items-center gap-2 cursor-pointer text-gray-700"><Edit className="h-3 w-3" /> Chỉnh sửa</button>
                      <button onClick={() => deactivate(u.id, u.full_name)}
                        className="w-full px-3 py-2 text-xs text-left hover:bg-red-50 flex items-center gap-2 cursor-pointer text-red-600"><Trash2 className="h-3 w-3" /> Vô hiệu hóa</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <StaffFormModal open={showCreate} onClose={() => { setShowCreate(false); setEditUser(null); }} onSaved={load} editUser={editUser} />
      
      {showRolesModal && (
        <UserRolesModal
          userId={showRolesModal.userId}
          userName={showRolesModal.userName}
          onClose={() => setShowRolesModal(null)}
          onSaved={() => { setShowRolesModal(null); load(); }}
        />
      )}
      <StaffDetailModal userId={showDetail} open={!!showDetail} onClose={() => setShowDetail(null)} />
    </div>
  );
}

// ═══ Staff Form Modal — Cascade: Khối → Cty → PB → Team ═══
function StaffFormModal({ open, onClose, onSaved, editUser }) {
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);

  // Cascade data — Khối lấy level=1 (khớp bộ lọc trang); không phụ thuộc level.depth có trong payload hay không
  const [divisions, setDivisions] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [teams, setTeams] = useState([]);
  /** Khu vực CRM theo công ty (company_regions) */
  const [companyRegions, setCompanyRegions] = useState([]);

  // Selection
  const [selDivision, setSelDivision] = useState('');
  const [selCompany, setSelCompany] = useState('');

  useEffect(() => {
    if (!open) return;
    Promise.all([
      api.get('/ecosystem/units?level=1').catch(() => ({ data: { units: [] } })),
      api.get('/companies').catch(() => ({ data: { companies: [] } })),
    ]).then(([divRes, cRes]) => {
      setDivisions(divRes.data.units || []);
      setCompanies(cRes.data.companies || []);
    });

    if (editUser) {
      setForm({
        ...editUser,
        department_id: editUser.department_id || editUser.department?.id || '',
        team_id: editUser.team_id || editUser.team?.id || '',
        password: '',
        crm_region_ids: [],
      });
      if (editUser.department?.company_id) {
        setSelCompany(editUser.department.company_id);
      }
    } else {
      setForm({
        full_name: '',
        email: '',
        phone: '',
        role: 'staff',
        position: '',
        department_id: '',
        team_id: '',
        password: '',
        date_of_birth: '',
        hire_date: '',
        address: '',
        emergency_contact: '',
        notes: '',
        crm_region_ids: [],
      });
      setSelDivision('');
      setSelCompany('');
    }
    setCompanyRegions([]);
  }, [open, editUser]);

  useEffect(() => {
    if (!open || !editUser?.id) return;
    let cancelled = false;
    api
      .get(`/users/${editUser.id}`)
      .then((r) => {
        if (cancelled) return;
        const ids = r.data?.user?.crm_region_ids;
        if (Array.isArray(ids)) setForm((f) => ({ ...f, crm_region_ids: ids }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, editUser?.id]);

  /** Sau khi có danh sách công ty — suy ra Khối từ company.division_unit_id (không cần chờ load PB) */
  useEffect(() => {
    if (!open || !editUser || !companies.length) return;
    const companyId = editUser.department?.company_id;
    if (!companyId) return;
    setSelCompany(companyId);
    const comp = companies.find((c) => c.id === companyId);
    if (comp?.division_unit_id) setSelDivision(comp.division_unit_id);
  }, [open, editUser, companies]);

  // Load departments when company changes
  useEffect(() => {
    if (selCompany) {
      api.get('/departments').then((r) => {
        setDepartments((r.data.departments || []).filter((d) => d.company_id === selCompany));
      });
    } else {
      setDepartments([]);
    }
    if (!editUser) {
      setForm((f) => ({ ...f, department_id: '', team_id: '' }));
      setTeams([]);
    }
  }, [selCompany, editUser]);

  useEffect(() => {
    if (!selCompany) {
      setCompanyRegions([]);
      return;
    }
    let cancelled = false;
    api
      .get('/crm/company-regions', { params: { company_id: selCompany } })
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r.data) ? r.data : [];
        setCompanyRegions(list.filter((x) => x.is_active !== false));
      })
      .catch(() => {
        if (!cancelled) setCompanyRegions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selCompany]);

  useEffect(() => {
    if (!companyRegions.length) return;
    setForm((f) => ({
      ...f,
      crm_region_ids: (f.crm_region_ids || []).filter((id) => companyRegions.some((r) => String(r.id) === String(id))),
    }));
  }, [companyRegions]);

  // Load teams when department changes
  useEffect(() => {
    if (form.department_id) {
      api
        .get(`/teams?department_id=${form.department_id}`)
        .then((r) => setTeams(r.data.teams || []))
        .catch(() => setTeams([]));
    } else {
      setTeams([]);
    }
    if (!editUser) setForm((f) => ({ ...f, team_id: '' }));
  }, [form.department_id, editUser]);

  const divCompanies = selDivision ? companies.filter((c) => c.division_unit_id === selDivision) : companies;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleCrmRegion = (regionId) => {
    const id = String(regionId);
    setForm((f) => {
      const cur = Array.isArray(f.crm_region_ids) ? [...f.crm_region_ids] : [];
      const i = cur.findIndex((x) => String(x) === id);
      if (i >= 0) cur.splice(i, 1);
      else cur.push(regionId);
      return { ...f, crm_region_ids: cur };
    });
  };

  const submit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      payload.department_id = payload.department_id || null;
      payload.team_id = payload.team_id || null;
      payload.crm_region_ids = Array.isArray(form.crm_region_ids) ? form.crm_region_ids : [];
      if (editUser) await api.put(`/users/${editUser.id}`, payload);
      else await api.post('/users', payload);
      onSaved?.(); onClose();
    } catch (err) { alert(err.response?.data?.error || 'Lỗi'); }
    setLoading(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={editUser ? 'Sửa nhân viên' : 'Thêm nhân viên mới'} size="lg">
      <form onSubmit={submit} autoComplete="off" className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {/* Hidden fields to trick browser autofill */}
        <input type="text" name="prevent_autofill" id="prevent_autofill" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />
        <input type="password" name="prevent_autofill_pass" id="prevent_autofill_pass" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Họ tên *</label><input value={form.full_name || ''} onChange={e => set('full_name', e.target.value)} required className="input" autoComplete="off" /></div>
          <div><label className="block text-sm font-medium mb-1">Email *</label><input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} required className="input" disabled={!!editUser} autoComplete="off" readOnly={!!editUser} /></div>
          <div><label className="block text-sm font-medium mb-1">SĐT</label><input value={form.phone || ''} onChange={e => set('phone', e.target.value)} className="input" autoComplete="off" /></div>
          <div><label className="block text-sm font-medium mb-1">Mật khẩu {editUser ? '(trống = giữ)' : '*'}</label><input type="password" value={form.password || ''} onChange={e => set('password', e.target.value)} className="input" required={!editUser} placeholder={editUser ? '••••••' : 'admin123'} autoComplete="new-password" /></div>
          <div><label className="block text-sm font-medium mb-1">Vai trò</label>
            <select value={form.role || 'staff'} onChange={e => set('role', e.target.value)} className="input">
              {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div><label className="block text-sm font-medium mb-1">Chức vụ</label><input value={form.position || ''} onChange={e => set('position', e.target.value)} className="input" placeholder="VD: Trưởng phòng" /></div>
        </div>

        {/* ═══ Cascade: Khối → Cty → PB → Team ═══ */}
        <div className="bg-blue-50/50 rounded-xl border border-blue-100 p-4 space-y-3">
          <h4 className="text-xs font-bold text-blue-700 uppercase flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> Phân công tổ chức</h4>
          <div className="grid grid-cols-2 gap-3">
            {/* Khối */}
            <div>
              <label className="text-[11px] font-medium text-gray-600 block mb-1">Khối</label>
              <select
                value={selDivision}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelDivision(v);
                  setSelCompany('');
                  setForm((f) => ({ ...f, department_id: '', team_id: '', crm_region_ids: [] }));
                  setTeams([]);
                }}
                className="w-full h-9 px-3 border rounded-lg text-sm"
              >
                <option value="">— Tất cả Khối —</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.level?.icon} {d.name}
                  </option>
                ))}
              </select>
            </div>
            {/* Công ty */}
            <div>
              <label className="text-[11px] font-medium text-gray-600 block mb-1">Công ty</label>
              <select
                value={selCompany}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelCompany(v);
                  setForm((f) => ({ ...f, department_id: '', team_id: '', crm_region_ids: [] }));
                  setTeams([]);
                }}
                className="w-full h-9 px-3 border rounded-lg text-sm"
              >
                <option value="">— Chọn Cty —</option>
                {divCompanies.map((c) => (
                  <option key={c.id} value={c.id}>
                    🏢 {c.name}
                    {c.short_name ? ` (${c.short_name})` : ''}
                  </option>
                ))}
              </select>
            </div>
            {/* Phòng ban */}
            <div>
              <label className="text-[11px] font-medium text-gray-600 block mb-1">Phòng ban</label>
              <select value={form.department_id || ''} onChange={e => set('department_id', e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm" disabled={!selCompany}>
                <option value="">— Chọn PB —</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              {!selCompany && <p className="text-[9px] text-gray-400 mt-0.5">Chọn Cty trước</p>}
            </div>
            {/* Team */}
            <div>
              <label className="text-[11px] font-medium text-gray-600 block mb-1">Team</label>
              <select value={form.team_id || ''} onChange={e => set('team_id', e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm" disabled={!form.department_id}>
                <option value="">— Chọn Team —</option>
                {teams.map(t => <option key={t.id} value={t.id}>👥 {t.name} ({t.member_count || 0} NV)</option>)}
              </select>
              {!form.department_id && <p className="text-[9px] text-gray-400 mt-0.5">Chọn PB trước</p>}
            </div>
          </div>

          {/* Khu vực CRM — theo công ty đã chọn */}
          <div className="pt-1 border-t border-blue-100">
            <label className="text-[11px] font-semibold text-gray-700 flex items-center gap-1.5 mb-2">
              <MapPin className="h-3.5 w-3.5 text-blue-600" />
              Khu vực CRM (pipeline / lead theo vùng)
            </label>
            {!selCompany ? (
              <p className="text-[11px] text-gray-500">Chọn <strong>Công ty</strong> phía trên để gán khu vực.</p>
            ) : companyRegions.length === 0 ? (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
                Công ty chưa có khu vực CRM. Tạo khu vực qua API hoặc cấu hình DB (migration 131).
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
                {companyRegions.map((reg) => {
                  const checked = (form.crm_region_ids || []).some((id) => String(id) === String(reg.id));
                  return (
                    <label
                      key={reg.id}
                      className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg border cursor-pointer select-none ${
                        checked ? 'bg-blue-100 border-blue-300 text-blue-900' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCrmRegion(reg.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>{reg.name}</span>
                      {reg.code ? <span className="text-[10px] text-gray-400">({reg.code})</span> : null}
                    </label>
                  );
                })}
              </div>
            )}
            <p className="text-[10px] text-gray-500 mt-1.5">
              Gán một hoặc nhiều khu vực để lọc lead/deal CRM. Vai trò «Admin khu vực» chỉ thấy dữ liệu các khu vực được chọn.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Ngày sinh</label><input type="date" value={form.date_of_birth || ''} onChange={e => set('date_of_birth', e.target.value)} className="input" /></div>
          <div><label className="block text-sm font-medium mb-1">Ngày vào làm</label><input type="date" value={form.hire_date || ''} onChange={e => set('hire_date', e.target.value)} className="input" /></div>
        </div>
        <div><label className="block text-sm font-medium mb-1">Địa chỉ</label><input value={form.address || ''} onChange={e => set('address', e.target.value)} className="input" /></div>
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
  const [userRoles, setUserRoles] = useState([]);
  const [ecosystemPath, setEcosystemPath] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRolesModal, setShowRolesModal] = useState(false);
  
  useEffect(() => { 
    if (!open || !userId) return; 
    setLoading(true);
    
    Promise.all([
      api.get(`/users/${userId}`),
      api.get(`/permissions/users/${userId}/roles`),
    ]).then(([userRes, rolesRes]) => {
      const userData = userRes.data.user;
      setUser(userData);
      setUserRoles(rolesRes.data.user_roles || []);
      
      // Build ecosystem path (Team → Dept → Company → Division)
      const path = [];
      if (userData.team) path.push({ type: 'Team', name: userData.team.name, icon: '⚡' });
      if (userData.department) {
        path.push({ type: 'Phòng ban', name: userData.department.name, icon: '👥' });
        // Load company from department
        if (userData.department.company_id) {
          api.get(`/companies/${userData.department.company_id}`).then(compRes => {
            const company = compRes.data.company;
            if (company) {
              setEcosystemPath(prev => {
                const newPath = [...prev];
                newPath.push({ type: 'Công ty', name: company.name, icon: '🏭' });
                // Load division if exists
                if (company.division_unit_id) {
                  api.get(`/ecosystem/units/${company.division_unit_id}`).then(divRes => {
                    const div = divRes.data.unit;
                    if (div) {
                      setEcosystemPath(p => [...p, { type: 'Khối', name: div.name, icon: '📦' }]);
                    }
                  });
                }
                return newPath;
              });
            }
          });
        }
      }
      setEcosystemPath(path);
    }).catch(() => {}).finally(() => setLoading(false)); 
  }, [open, userId]);
  
  if (!open) return null;
  
  return (
    <>
      <Modal open={open} onClose={onClose} title={user?.full_name || 'Nhân viên'} size="lg">
        {loading || !user ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin h-6 w-6 border-2 border-gray-200 border-t-gray-600 rounded-full" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full flex items-center justify-center text-white font-bold text-2xl" 
                style={{ backgroundColor: avatarColor(user.full_name) }}>
                {getInitials(user.full_name)}
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold">{user.full_name}</h2>
                <p className="text-sm text-gray-500">{user.position || ROLES[user.role]}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[user.role] || ''}`}>
                    {ROLES[user.role]}
                  </span>
                  {user.department && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded" 
                      style={{ backgroundColor: user.department.color + '20', color: user.department.color }}>
                      {user.department.name}
                    </span>
                  )}
                  {user.team && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded" 
                      style={{ backgroundColor: (user.team.color || '#3b82f6') + '20', color: user.team.color || '#3b82f6' }}>
                      👥 {user.team.name}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Ecosystem Path */}
            {ecosystemPath.length > 0 && (
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-3 border border-purple-200">
                <p className="text-xs font-bold text-gray-700 mb-2">🏢 Cấu trúc tổ chức</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {[...ecosystemPath].reverse().map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs bg-white px-2 py-1 rounded border flex items-center gap-1.5">
                        <span>{item.icon}</span>
                        <span className="font-medium text-gray-700">{item.type}:</span>
                        <span className="text-gray-900">{item.name}</span>
                      </span>
                      {idx < ecosystemPath.length - 1 && (
                        <span className="text-gray-400">→</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Roles Section */}
            <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-purple-600" />
                  Vai trò & Phân quyền
                </p>
                <button
                  onClick={() => setShowRolesModal(true)}
                  className="text-xs px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Gán vai trò
                </button>
              </div>
              
              {userRoles.length === 0 ? (
                <p className="text-xs text-gray-500 italic">Chưa có vai trò nào được gán</p>
              ) : (
                <div className="space-y-2">
                  {userRoles.map(ur => {
                    const unit = ur.ecosystem_unit;
                    const levelLabels = { 0: 'Tập đoàn', 1: 'Khối', 2: 'Công ty', 3: 'Phòng ban', 4: 'Team' };
                    const levelLabel = unit ? levelLabels[unit.level] : null;
                    const icons = { 0: '🏢', 1: '📦', 2: '🏭', 3: '👥', 4: '⚡' };
                    const icon = unit ? icons[unit.level] : '🌐';
                    
                    return (
                      <div key={ur.id} className="bg-white border border-purple-200 rounded-lg p-2.5 flex items-center gap-2">
                        <Shield className="h-4 w-4 text-purple-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-900">{ur.role?.name}</p>
                          {unit ? (
                            <p className="text-[10px] text-gray-600 flex items-center gap-1">
                              <span>{icon}</span>
                              <span className="font-medium">{levelLabel}</span>
                              <span>→</span>
                              <span className="truncate">{unit.name}</span>
                            </p>
                          ) : (
                            <p className="text-[10px] text-gray-500">🌐 Toàn hệ thống</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Contact Info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[11px] text-gray-500">Email</p>
                <p className="font-medium">{user.email}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[11px] text-gray-500">SĐT</p>
                <p className="font-medium">{user.phone || '—'}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[11px] text-gray-500">Ngày sinh</p>
                <p className="font-medium">{formatDate(user.date_of_birth) || '—'}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[11px] text-gray-500">Ngày vào làm</p>
                <p className="font-medium">{formatDate(user.hire_date) || '—'}</p>
              </div>
            </div>

            {/* Task Stats */}
            {user.taskStats && (
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-blue-600">{user.taskStats.assigned}</p>
                  <p className="text-[10px] text-gray-500">Được giao</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-amber-600">{user.taskStats.in_progress}</p>
                  <p className="text-[10px] text-gray-500">Đang làm</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-emerald-600">{user.taskStats.done}</p>
                  <p className="text-[10px] text-gray-500">Hoàn thành</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-purple-600">{user.taskStats.created}</p>
                  <p className="text-[10px] text-gray-500">Đã tạo</p>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
      
      {showRolesModal && user && (
        <UserRolesModal
          userId={user.id}
          userName={user.full_name}
          onClose={() => setShowRolesModal(false)}
          onSaved={() => {
            setShowRolesModal(false);
            // Reload roles
            api.get(`/permissions/users/${userId}/roles`).then(res => {
              setUserRoles(res.data.user_roles || []);
            });
          }}
        />
      )}
    </>
  );
}
