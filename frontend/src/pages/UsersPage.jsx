import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import api from '../lib/api';
import Modal from '../components/Modal';
import { useAuth } from '../lib/auth';
import { canCreateStaff, isSystemAdmin, hasCompanyId } from '../lib/adminRole';
import { Plus, Search, Mail, Phone, Trash2, Edit, Users as UsersIcon, MoreVertical, Building2, Layers, UsersRound, Shield, MapPin, Camera, AlertTriangle, ChevronLeft, ChevronRight, UserRound, Sparkles, Loader2 } from 'lucide-react';
import { formatDate, getInitials, avatarColor } from '../lib/utils';
import PermissionCatalogPanel, { cascadeTierDraft } from '../components/permissions/PermissionCatalogPanel';

const ROLES = { admin: 'Admin', manager: 'Quản lý', region_admin: 'Admin khu vực', sales_admin: 'Sales Admin', sales: 'Kinh doanh (SAE)', designer: 'Thiết kế', production: 'Sản xuất', production_staff: 'NV Sản xuất (Admin CV+SX)', production_admin: 'Admin Sản xuất', crm_production_staff: 'NV CRM + Admin SX', crm_production_admin: 'Admin CRM + Sản xuất', logistics_admin: 'Admin Lắp đặt', driver: 'Tài xế', installer: 'Lắp đặt', customer_care: 'CSKH', accounting: 'Kế toán', staff: 'Nhân viên' };
const ROLE_COLORS = { admin: 'bg-red-100 text-red-700', manager: 'bg-purple-100 text-purple-700', region_admin: 'bg-rose-100 text-rose-800', sales_admin: 'bg-indigo-100 text-indigo-700', sales: 'bg-blue-100 text-blue-700', designer: 'bg-pink-100 text-pink-700', production: 'bg-orange-100 text-orange-700', production_staff: 'bg-teal-100 text-teal-800', production_admin: 'bg-orange-200 text-orange-900', crm_production_staff: 'bg-sky-100 text-sky-800', crm_production_admin: 'bg-violet-100 text-violet-800', logistics_admin: 'bg-amber-100 text-amber-800', installer: 'bg-cyan-100 text-cyan-700', customer_care: 'bg-green-100 text-green-700', driver: 'bg-amber-100 text-amber-700', accounting: 'bg-emerald-100 text-emerald-800', staff: 'bg-gray-100 text-gray-600' };

/** Role theo module — mỗi module chỉ chọn 1 role trong danh sách này. */
const MODULE_ROLE_OPTIONS = {
  crm: ['sales', 'sales_admin', 'designer', 'customer_care', 'region_admin', 'manager', 'crm_production_staff', 'crm_production_admin', 'staff'],
  production: ['production_staff', 'production_admin', 'production', 'crm_production_staff', 'crm_production_admin'],
  logistics: ['logistics_admin', 'driver', 'installer'],
  accounting: ['accounting'],
  purchasing: ['staff'],
  tinhtoan: ['staff'],
};

const MODULE_DEFAULT_ROLE = {
  crm: 'sales',
  production: 'production_staff',
  logistics: 'driver',
  accounting: 'accounting',
  purchasing: 'staff',
  tinhtoan: 'staff',
};

const PRIMARY_ROLE_PRIORITY = [
  'admin', 'platform_admin', 'sales_admin', 'crm_production_admin', 'production_admin',
  'logistics_admin', 'crm_production_staff', 'production_staff', 'region_admin', 'manager',
  'accounting', 'production', 'sales', 'designer', 'customer_care', 'driver', 'installer', 'staff',
];

function derivePrimaryRoleFromModules(moduleRoles = {}, isSystemAdminFlag = false) {
  if (isSystemAdminFlag) return 'admin';
  const roles = Object.values(moduleRoles || {}).filter(Boolean);
  for (const p of PRIMARY_ROLE_PRIORITY) {
    if (roles.includes(p)) return p;
  }
  return roles[0] || 'staff';
}

/** Suy map module→role từ 1 role hệ thống (AI fill / backfill UI). */
function inferModuleRolesFromPrimaryRole(role) {
  const r = String(role || '').toLowerCase();
  if (!r || r === 'admin' || r === 'platform_admin') return {};
  if (r === 'crm_production_staff' || r === 'crm_production_admin') {
    return { crm: r, production: r };
  }
  if (MODULE_ROLE_OPTIONS.crm.includes(r)) return { crm: r };
  if (MODULE_ROLE_OPTIONS.production.includes(r)) return { production: r };
  if (MODULE_ROLE_OPTIONS.logistics.includes(r)) return { logistics: r };
  if (r === 'accounting' || r === 'ketoan') return { accounting: 'accounting' };
  return { crm: 'staff' };
}

/** Vai trò CRM thấy dữ liệu cả công ty (không bị khóa theo khu vực JWT). */
const COMPANY_WIDE_CRM_ROLES = new Set(['admin', 'sales_admin', 'crm_production_admin']);

function inferCrmScopeMode(role, regionIds) {
  if (role === 'region_admin') return 'regions';
  if (COMPANY_WIDE_CRM_ROLES.has(role)) return 'company';
  return (regionIds || []).length > 0 ? 'regions' : 'company';
}

function collectCatalogPermissionMeta(catalog) {
  const byId = new Map();
  for (const mod of catalog?.modules || []) {
    if (mod.displayMode === 'tiered') {
      for (const grp of mod.groups || []) {
        for (const feat of grp.features || []) {
          for (const level of feat.levels || []) {
            if (level.permission?.id) {
              byId.set(level.permission.id, {
                id: level.permission.id,
                resource: feat.resource || level.permission.resource,
                action: level.action,
              });
            }
          }
        }
      }
    } else {
      for (const feat of mod.features || []) {
        for (const p of feat.permissions || []) {
          byId.set(p.id, { id: p.id, resource: p.resource, action: p.action });
        }
      }
    }
  }
  return byId;
}

function draftFromPermissionIds(ids) {
  const out = {};
  for (const id of ids || []) out[id] = true;
  return out;
}

function buildPermissionOverrideChanges(baselineIds, draft) {
  const baseline = new Set((baselineIds || []).map(String));
  const allIds = new Set([...baseline, ...Object.keys(draft || {}).map(String)]);
  const changes = [];
  for (const id of allIds) {
    const desired = draft?.[id] === true || draft?.[String(id)] === true;
    const fromRole = baseline.has(String(id));
    if (desired === fromRole) {
      // Xóa ghi đè cũ để quay về đúng mẫu vai trò
      changes.push({ permission_id: id, clear: true });
    } else {
      changes.push({ permission_id: id, granted: desired });
    }
  }
  return changes;
}

function resourceMatchesPreset(resource, family) {
  const res = String(resource || '');
  if (family === 'drive') return res === 'drive';
  if (family === 'production') return res.startsWith('sx_') || res === 'projects';
  if (family === 'crm') return res.startsWith('crm_');
  if (family === 'vc') return res.startsWith('vc_');
  if (family === 'accounting') return res.startsWith('ketoan_');
  if (family === 'purchasing') return res.startsWith('mua_hang_');
  if (family === 'calc') return res.startsWith('calc_');
  if (family === 'knowledge') return res.startsWith('knowledge_');
  if (family === 'congviec') return res === 'work_unified' || res === 'personal_tasks';
  return false;
}

const VIEW_ONLY_ACTIONS = new Set(['view']);

/** Áp preset/tweak phân quyền lên draft (giữ nguyên quyền module khác trừ preset toàn cục). */
function applyPermissionIntentsToDraft(draft, metaById, presets = [], tweaks = []) {
  const next = { ...(draft || {}) };
  const list = Array.isArray(presets) ? presets : [];

  const applyFamilyView = (family, { forceOffWrite = false, adminAll = false } = {}) => {
    for (const [id, meta] of metaById.entries()) {
      if (!resourceMatchesPreset(meta.resource, family)) continue;
      if (adminAll) {
        next[id] = true;
        continue;
      }
      if (meta.action === 'view') next[id] = true;
      else if (forceOffWrite) next[id] = false;
    }
  };

  for (const preset of list) {
    if (preset === 'all_modules_view_only') {
      // Xem hết — tắt mọi quyền tương tác (sửa/tạo/xóa/admin/upload…)
      for (const [id, meta] of metaById.entries()) {
        next[id] = VIEW_ONLY_ACTIONS.has(meta.action);
      }
    } else if (preset === 'drive_view_only') {
      for (const [id, meta] of metaById.entries()) {
        if (!resourceMatchesPreset(meta.resource, 'drive')) continue;
        next[id] = meta.action === 'view';
      }
    } else if (preset === 'drive_view_all') {
      for (const [id, meta] of metaById.entries()) {
        if (!resourceMatchesPreset(meta.resource, 'drive')) continue;
        if (meta.action === 'view') next[id] = true;
      }
    } else if (preset === 'production_view_all') {
      applyFamilyView('production');
    } else if (preset === 'production_admin_all') {
      applyFamilyView('production', { adminAll: true });
    } else if (preset === 'crm_view_all') {
      applyFamilyView('crm');
    } else if (preset === 'crm_admin_all') {
      applyFamilyView('crm', { adminAll: true });
    } else if (preset === 'vc_view_all') {
      applyFamilyView('vc');
    } else if (preset === 'vc_admin_all') {
      applyFamilyView('vc', { adminAll: true });
    } else if (preset === 'accounting_view_all') {
      // Module kế toán: xem + sửa BG/ĐH/HĐ (sau all_modules_view_only vẫn khôi phục edit)
      for (const [id, meta] of metaById.entries()) {
        if (!resourceMatchesPreset(meta.resource, 'accounting')) continue;
        if (meta.action === 'view' || meta.action === 'edit') next[id] = true;
      }
    } else if (preset === 'accounting_admin_all') {
      applyFamilyView('accounting', { adminAll: true });
    }
  }

  for (const tw of tweaks || []) {
    for (const [id, meta] of metaById.entries()) {
      if (meta.resource === tw.resource && meta.action === tw.action) {
        next[id] = tw.granted === true;
      }
    }
  }
  return next;
}

function preferModuleKeyFromPresets(presets) {
  const list = presets || [];
  if (list.some((p) => p === 'all_modules_view_only')) return 'accounting';
  if (list.some((p) => String(p).startsWith('accounting'))) return 'accounting';
  if (list.some((p) => String(p).startsWith('drive'))) return 'drive';
  if (list.some((p) => String(p).startsWith('production'))) return 'production';
  if (list.some((p) => String(p).startsWith('crm'))) return 'crm';
  if (list.some((p) => String(p).startsWith('vc'))) return 'logistics';
  return null;
}

/** Chip form (company module key) → family trong resourceMatchesPreset */
const MODULE_KEY_TO_PERM_FAMILY = {
  crm: 'crm',
  production: 'production',
  logistics: 'vc',
  accounting: 'accounting',
  purchasing: 'purchasing',
  tinhtoan: 'calc',
};

/**
 * Chip form / ecosystem module_key → key trong permission catalog UI.
 * (tinhtoan ↔ calc; congviec/knowledge luôn hiện).
 */
const COMPANY_MODULE_TO_CATALOG_KEY = {
  crm: 'crm',
  production: 'production',
  logistics: 'logistics',
  accounting: 'accounting',
  purchasing: 'purchasing',
  tinhtoan: 'calc',
};

/** Chip form → users.drive_module */
const MODULE_KEY_TO_DRIVE = {
  crm: 'crm',
  production: 'sx',
  logistics: 'vc',
  accounting: 'crm',
  purchasing: 'crm',
  tinhtoan: 'crm',
};

/** Module catalog luôn hiện trên form NV (không phụ thuộc chip công ty). */
const CATALOG_ALWAYS_MODULE_KEYS = new Set([
  'drive',
  'work',
  'hr',
  'reports',
  'system',
  'congviec',
  'knowledge',
  'platform',
]);

/** Áp chọn module công ty lên draft: chọn = view+edit; bỏ chọn = tắt hết family đó. */
function applySelectedModulesToDraft(draft, metaById, companyModuleKeys = [], selectedKeys = []) {
  const selected = new Set((selectedKeys || []).map(String));
  const company = (companyModuleKeys || []).map(String);
  if (!company.length || !metaById?.size) return { ...(draft || {}) };
  const next = { ...(draft || {}) };
  for (const key of company) {
    const family = MODULE_KEY_TO_PERM_FAMILY[key];
    if (!family) continue;
    const on = selected.has(key);
    for (const [id, meta] of metaById.entries()) {
      if (!resourceMatchesPreset(meta.resource, family)) continue;
      if (!on) {
        next[id] = false;
      } else if (meta.action === 'view' || meta.action === 'edit') {
        next[id] = true;
      } else if (meta.action === 'admin') {
        next[id] = false;
      }
    }
  }
  return next;
}

function filterCatalogBySelectedModules(catalog, selectedKeys = []) {
  const mods = catalog?.modules || [];
  if (!mods.length) return catalog || { modules: [] };
  if (!(selectedKeys || []).length) {
    return {
      ...catalog,
      modules: mods.filter((m) => CATALOG_ALWAYS_MODULE_KEYS.has(m.key)),
    };
  }
  const allow = new Set([...CATALOG_ALWAYS_MODULE_KEYS]);
  for (const key of selectedKeys) {
    const catalogKey = COMPANY_MODULE_TO_CATALOG_KEY[String(key)] || String(key);
    allow.add(catalogKey);
  }
  return {
    ...catalog,
    modules: mods.filter((m) => allow.has(m.key)),
  };
}

function driveModuleFromSelection(selectedKeys = []) {
  for (const key of selectedKeys) {
    const d = MODULE_KEY_TO_DRIVE[key];
    if (d) return d;
  }
  return null;
}

const employeeCardClass =
  'group relative flex items-center gap-3.5 overflow-hidden rounded-2xl border border-slate-200/75 bg-gradient-to-b from-white via-white to-slate-50/90 p-4 transition-all duration-300 ease-out cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_2px_4px_rgba(15,23,42,0.05),0_10px_24px_-8px_rgba(15,23,42,0.12)] hover:-translate-y-1 hover:border-violet-300/70 hover:from-violet-50/50 hover:via-white hover:to-violet-50/30 hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_6px_14px_-4px_rgba(124,58,237,0.2),0_22px_38px_-14px_rgba(124,58,237,0.28)]';

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const canAddStaff = canCreateStaff(currentUser);
  /** Admin/NV gắn công ty — khóa danh sách theo đúng công ty đó (admin hệ thống không khóa). */
  const lockedCompanyId = (!isSystemAdmin(currentUser) && hasCompanyId(currentUser))
    ? String(currentUser.company_id)
    : '';
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({});
  const [departments, setDepartments] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterCompany, setFilterCompany] = useState(lockedCompanyId);
  const [filterDivision, setFilterDivision] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [showDetail, setShowDetail] = useState(null);
  const [menuUser, setMenuUser] = useState(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const menuRef = useRef(null);
  const [hardDeleteTarget, setHardDeleteTarget] = useState(null); // { id, full_name, email, role }
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    if (lockedCompanyId) {
      setFilterCompany(lockedCompanyId);
      setFilterDivision('');
    }
  }, [lockedCompanyId]);

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (search) params.search = search;
    if (filterRole) params.role = filterRole;
    if (filterDept) params.department_id = filterDept;

    const effectiveCompany = lockedCompanyId || filterCompany;
    if (lockedCompanyId) {
      params.company_id = lockedCompanyId;
    } else if (filterDivision) {
      params.ecosystem_unit_id = filterDivision;
    } else if (effectiveCompany) {
      params.company_id = effectiveCompany;
    }

    api.get('/users', { params })
      .then(r => { setUsers(r.data.users || []); setStats(r.data.stats || {}); })
      .catch(() => {}).finally(() => setLoading(false));
  }, [search, filterRole, filterDept, filterCompany, filterDivision, lockedCompanyId]);

  useEffect(() => {
    load();
    // Load departments, companies (from ecosystem level 2), divisions (level 1)
    Promise.all([
      api.get('/users/departments'),
      api.get('/ecosystem/units?level=2'), // Level 2 = companies
      api.get('/ecosystem/units?level=1'), // Level 1 = divisions (khối)
    ]).then(([deptRes, compRes, divRes]) => {
      const allDepts = deptRes.data.departments || [];
      setDepartments(lockedCompanyId
        ? allDepts.filter((d) => String(d.company_id) === lockedCompanyId)
        : allDepts);

      const companyUnits = (compRes.data.units || []).map(u => ({
        id: u.company_id,
        name: u.name,
        division_unit_id: u.parent_id,
        unit_id: u.id,
      })).filter(c => c.id);

      setCompanies(lockedCompanyId
        ? companyUnits.filter((c) => String(c.id) === lockedCompanyId)
        : companyUnits);

      setDivisions(lockedCompanyId ? [] : (divRes.data.units || []));
    }).catch(() => {});
  }, [lockedCompanyId]);
  
  useEffect(() => { load(); }, [filterRole, filterDept, filterCompany, filterDivision]);
  useEffect(() => { setPage(1); }, [search, filterRole, filterDept, filterCompany, filterDivision, pageSize]);

  const totalUsers = users.length;
  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));
  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return users.slice(start, start + pageSize);
  }, [users, page, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageStart = totalUsers === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, totalUsers);

  const deactivate = async (id, name) => {
    if (!confirm(`Vô hiệu hóa nhân viên "${name}"?`)) return;
    await api.delete(`/users/${id}`);
    setMenuUser(null); load();
  };

  const onHardDeleted = () => {
    setHardDeleteTarget(null);
    setMenuUser(null);
    load();
  };

  const menuUserData = menuUser ? users.find((u) => u.id === menuUser) : null;

  const openUserMenu = (e, u) => {
    e.stopPropagation();
    if (menuUser === u.id) {
      setMenuUser(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = isAdmin && String(u.id) !== String(currentUser?.id) ? 148 : 116;
    let top = rect.bottom + 4;
    let left = rect.right - menuWidth;
    if (top + menuHeight > window.innerHeight - 8) top = rect.top - menuHeight - 4;
    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
    setMenuPos({ top, left });
    setMenuUser(u.id);
  };

  useEffect(() => {
    if (!menuUser) return;
    const close = () => setMenuUser(null);
    const onPointer = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      close();
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('mousedown', onPointer);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [menuUser]);

  return (
    <div className="w-full min-w-0 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-md shadow-violet-200">
            <UserRound className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Quản lý nhân viên</h1>
            <p className="text-sm text-slate-500 mt-0.5">{stats.total || totalUsers} nhân viên</p>
          </div>
        </div>
        {canAddStaff && (
        <button
          data-tour="add-user"
          onClick={() => { setEditUser(null); setShowCreate(true); }}
          className="h-10 px-4 bg-violet-600 text-white rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-violet-700 shadow-sm shadow-violet-200 cursor-pointer shrink-0"
        >
          <Plus className="h-4 w-4" /> Thêm NV
        </button>
        )}
      </div>

      {/* Role tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-1 overflow-x-auto pb-px [scrollbar-width:thin]">
          <button
            type="button"
            onClick={() => setFilterRole('')}
            className={`shrink-0 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              !filterRole
                ? 'border-violet-600 text-violet-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Tất cả
            <span className={`ml-1.5 text-xs ${!filterRole ? 'text-violet-500' : 'text-slate-400'}`}>
              {stats.total || totalUsers}
            </span>
          </button>
          {Object.entries(ROLES).map(([k, v]) => {
            const count = stats.byRole?.[k] || 0;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setFilterRole(k === filterRole ? '' : k)}
                className={`shrink-0 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  filterRole === k
                    ? 'border-violet-600 text-violet-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {v}
                {count > 0 && (
                  <span className={`ml-1.5 text-xs ${filterRole === k ? 'text-violet-500' : 'text-slate-400'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2.5">
          {!lockedCompanyId && (
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 h-10 min-w-[148px]">
            <Layers className="h-4 w-4 text-slate-400 shrink-0" />
            <select
              value={filterDivision}
              onChange={(e) => {
                setFilterDivision(e.target.value);
                setFilterCompany('');
              }}
              className="flex-1 text-sm outline-none bg-transparent text-slate-700"
            >
              <option value="">Tất cả khối</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          )}

          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 h-10 min-w-[156px]">
            <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
            {lockedCompanyId ? (
              <span className="flex-1 text-sm text-slate-700 truncate">
                {companies.find((c) => String(c.id) === lockedCompanyId)?.name || 'Công ty của bạn'}
              </span>
            ) : (
            <select
              value={filterCompany}
              onChange={(e) => setFilterCompany(e.target.value)}
              className="flex-1 text-sm outline-none bg-transparent text-slate-700"
            >
              <option value="">Tất cả công ty</option>
              {companies
                .filter((c) => !filterDivision || c.division_unit_id === filterDivision)
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>
            )}
          </div>

          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 h-10 min-w-[168px]">
            <UsersRound className="h-4 w-4 text-slate-400 shrink-0" />
            <select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="flex-1 text-sm outline-none bg-transparent text-slate-700"
            >
              <option value="">Tất cả phòng ban</option>
              <option value="none">Chưa có phòng ban</option>
              {departments
                .filter((d) => !(lockedCompanyId || filterCompany) || d.company_id === (lockedCompanyId || filterCompany))
                .map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
            </select>
          </div>

          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              placeholder="Tìm tên, email, SĐT..."
              className="w-full h-10 pl-10 pr-3 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-300 bg-white text-slate-900"
            />
          </div>
      </div>

      {/* Users grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-7 w-7 border-2 border-violet-100 border-t-violet-600 rounded-full" />
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-100">
          <UsersIcon className="h-12 w-12 mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">Không tìm thấy nhân viên</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-visible">
          {paginatedUsers.map((u) => (
            <div
              key={u.id}
              className={`${employeeCardClass} ${menuUser === u.id ? 'z-20 ring-2 ring-violet-200/80' : ''}`}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-90" />
              {u.avatar ? (
                <img
                  src={u.avatar}
                  alt=""
                  className="h-12 w-12 rounded-full object-cover border-2 border-white shrink-0 shadow-[0_4px_10px_rgba(15,23,42,0.14)] ring-1 ring-slate-200/80"
                />
              ) : (
                <div
                  className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 border-2 border-white shadow-[0_4px_10px_rgba(15,23,42,0.18)] ring-1 ring-black/5"
                  style={{ backgroundColor: avatarColor(u.full_name) }}
                >
                  {getInitials(u.full_name)}
                </div>
              )}
              <div className="flex-1 min-w-0" onClick={() => setShowDetail(u.id)}>
                <div className="flex items-center gap-2 mb-1 min-w-0">
                  <h3 className="text-[15px] font-bold text-slate-900 truncate transition-colors group-hover:text-violet-900">{u.full_name}</h3>
                  <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold ${ROLE_COLORS[u.role] || 'bg-gray-100 text-gray-600'}`}>
                    {ROLES[u.role] || u.role}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 truncate">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">{u.email}</span>
                </div>
                <div className="mt-1.5">
                  {u.department ? (
                    <span
                      className="inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${u.department.color}18`, color: u.department.color }}
                    >
                      {u.department.name}
                    </span>
                  ) : (
                    <span className="inline-flex text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                      Chưa có PB
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => openUserMenu(e, u)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 shrink-0 transition-colors hover:bg-violet-100 hover:text-violet-700 cursor-pointer"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {!loading && totalUsers > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
          <p className="text-sm text-slate-500">
            Hiển thị <span className="font-medium text-slate-700">{pageStart}</span>
            {' - '}
            <span className="font-medium text-slate-700">{pageEnd}</span>
            {' trong tổng số '}
            <span className="font-medium text-slate-700">{totalUsers}</span> nhân viên
          </p>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="h-9 w-9 rounded-full border border-slate-200 bg-white text-slate-600 flex items-center justify-center disabled:opacity-40 cursor-pointer hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce((acc, p, idx, arr) => {
                if (idx > 0 && p - arr[idx - 1] > 1) acc.push('…');
                acc.push(p);
                return acc;
              }, [])
              .map((p, idx) => (
                typeof p === 'number' ? (
                  <button
                    key={`page-${p}`}
                    type="button"
                    onClick={() => setPage(p)}
                    className={`h-9 min-w-9 px-2 rounded-full text-sm font-semibold cursor-pointer transition-colors ${
                      page === p
                        ? 'bg-violet-600 text-white shadow-sm shadow-violet-200'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {p}
                  </button>
                ) : (
                  <span key={`gap-${idx}`} className="px-1 text-slate-400">…</span>
                )
              ))}

            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="h-9 w-9 rounded-full border border-slate-200 bg-white text-slate-600 flex items-center justify-center disabled:opacity-40 cursor-pointer hover:bg-slate-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-9 ml-1 px-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 outline-none cursor-pointer"
            >
              {[10, 20, 30, 50].map((n) => (
                <option key={n} value={n}>{n} / trang</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <StaffFormModal key={editUser?.id ?? 'new'} open={showCreate} onClose={() => { setShowCreate(false); setEditUser(null); }} onSaved={load} editUser={editUser} />
      
      <StaffDetailModal userId={showDetail} open={!!showDetail} onClose={() => setShowDetail(null)} />
      <HardDeleteUserModal target={hardDeleteTarget} onClose={() => setHardDeleteTarget(null)} onDeleted={onHardDeleted} />

      {menuUserData && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0" style={{ zIndex: 99998 }} onClick={() => setMenuUser(null)} />
          <div
            ref={menuRef}
            className="fixed w-44 bg-white rounded-lg shadow-lg border py-1"
            style={{ zIndex: 99999, top: menuPos.top, left: menuPos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { setMenuUser(null); setEditUser(menuUserData); setShowCreate(true); }}
              className="w-full px-3 py-2 text-xs text-left hover:bg-gray-50 flex items-center gap-2 cursor-pointer text-gray-700"
            >
              <Edit className="h-3 w-3" /> Chỉnh sửa
            </button>
            <button
              onClick={() => deactivate(menuUserData.id, menuUserData.full_name)}
              className="w-full px-3 py-2 text-xs text-left hover:bg-red-50 flex items-center gap-2 cursor-pointer text-red-600"
            >
              <Trash2 className="h-3 w-3" /> Vô hiệu hóa
            </button>
            {isAdmin && String(menuUserData.id) !== String(currentUser?.id) && (
              <>
                <div className="border-t border-gray-100 my-1" />
                <button
                  onClick={() => { setMenuUser(null); setHardDeleteTarget(menuUserData); }}
                  className="w-full px-3 py-2 text-xs text-left hover:bg-red-50 flex items-center gap-2 cursor-pointer text-red-700 font-semibold"
                  title="Xóa vĩnh viễn — không thể hoàn tác"
                >
                  <AlertTriangle className="h-3 w-3" /> Xóa vĩnh viễn
                </button>
              </>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

// ═══ Hard delete confirmation modal — gõ tên để xác nhận ═══
function HardDeleteUserModal({ target, onClose, onDeleted }) {
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const open = !!target;

  useEffect(() => {
    if (open) { setConfirmText(''); setErr(''); }
  }, [open]);

  if (!open) return null;
  const expected = (target.full_name || target.email || '').trim();
  const ok = confirmText.trim() === expected && expected.length > 0;

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true); setErr('');
    try {
      await api.delete(`/users/${target.id}/permanent`);
      onDeleted?.();
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Lỗi xóa nhân viên');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} title="Xóa vĩnh viễn nhân viên" size="md">
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-900 space-y-1.5">
            <p className="font-semibold">Hành động KHÔNG THỂ hoàn tác</p>
            <p className="text-xs text-red-800">
              Xóa vĩnh viễn <strong>«{target.full_name}»</strong> ({target.email}) khỏi hệ thống.
              Các nhiệm vụ / lead / dự án mà nhân viên này được giao hoặc tạo sẽ
              <strong> bị bỏ trống người phụ trách</strong> (set null), riêng các bình luận,
              ghi chú, log hoạt động cá nhân của họ sẽ bị xóa hẳn.
            </p>
            <p className="text-xs text-red-800">
              Nên cân nhắc dùng <strong>«Vô hiệu hóa»</strong> để chặn đăng nhập mà vẫn giữ lại lịch sử.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Để xác nhận, nhập đúng họ tên: <span className="font-mono text-red-600">{expected}</span>
          </label>
          <input
            type="text"
            autoFocus
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={expected}
            className="w-full h-10 px-3 border-2 rounded-lg text-sm outline-none focus:border-red-500"
            disabled={busy}
          />
        </div>

        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{err}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-10 px-4 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm cursor-pointer disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!ok || busy}
            className="h-10 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
            {busy ? 'Đang xóa…' : 'Xóa vĩnh viễn'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ═══ Staff Form Modal — Cascade: Khối → Cty → PB → Team ═══
const STAFF_EMPTY_FORM = {
  full_name: '',
  email: '',
  phone: '',
  zalo_id: '',
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
  avatar: null,
};

function mapUserToForm(user) {
  const dateOnly = (v) => (v ? String(v).slice(0, 10) : '');
  return {
    full_name: user.full_name || '',
    email: user.email || '',
    phone: user.phone || '',
    zalo_id: user.zalo_id || '',
    role: user.role || 'staff',
    position: user.position || '',
    department_id: user.department_id || user.department?.id || '',
    team_id: user.team_id || user.team?.id || '',
    password: '',
    date_of_birth: dateOnly(user.date_of_birth),
    hire_date: dateOnly(user.hire_date),
    address: user.address || '',
    emergency_contact: user.emergency_contact || '',
    notes: user.notes || '',
    avatar: user.avatar || null,
    crm_region_ids: Array.isArray(user.crm_region_ids) ? [...user.crm_region_ids] : [],
  };
}

/** Export để dùng tại trang «Thiết lập tổ chức nhanh» — preset Khối/Cty khi mở từ đó */
export function StaffFormModal({
  open,
  onClose,
  onSaved,
  editUser,
  presetDivisionId,
  presetCompanyId,
  /** Khi tạo mới: điền sẵn mật khẩu (vd: thiết lập tổ chức nhanh dùng 123456) */
  defaultNewUserPassword,
}) {
  const { user: currentUser } = useAuth();
  const lockedCompanyId = (!isSystemAdmin(currentUser) && hasCompanyId(currentUser))
    ? String(currentUser.company_id)
    : '';
  const editUserId = editUser?.id ?? null;
  const [form, setForm] = useState(STAFF_EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [userLoading, setUserLoading] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInputRef = useRef(null);
  /** Giữ department/region/permission AI vừa điền — tránh bị effect cascade xóa khi đổi Cty */
  const aiPendingRef = useRef({
    department_id: null,
    crm_region_ids: null,
    permission_presets: null,
    permission_tweaks: null,
  });

  // Cascade data — Khối lấy level=1 (khớp bộ lọc trang); không phụ thuộc level.depth có trong payload hay không
  const [divisions, setDivisions] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [teams, setTeams] = useState([]);
  /** Khu vực CRM theo công ty (company_regions) */
  const [companyRegions, setCompanyRegions] = useState([]);
  /** Preview quyền theo vai trò đã chọn */
  const [rolePermPreview, setRolePermPreview] = useState(null);
  const [rolePermLoading, setRolePermLoading] = useState(false);
  /** Phạm vi dữ liệu CRM: company | regions — kết hợp với vai trò */
  const [crmScopeMode, setCrmScopeMode] = useState('company');
  /** AI điền form */
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSummary, setAiSummary] = useState([]);
  const [aiWarnings, setAiWarnings] = useState([]);
  /** Bật/tắt phân quyền theo catalog */
  const [permCatalog, setPermCatalog] = useState({ modules: [] });
  const [permCatalogLoading, setPermCatalogLoading] = useState(false);
  const [permCatalogError, setPermCatalogError] = useState('');
  const [permModuleKey, setPermModuleKey] = useState('drive');
  const [permBaselineIds, setPermBaselineIds] = useState([]);
  const [permDraft, setPermDraft] = useState({});
  const [permPanelOpen, setPermPanelOpen] = useState(true);
  const [permTouched, setPermTouched] = useState(false);
  /** Module công ty — map module_key → role (mỗi module 1 role) */
  const [companyModules, setCompanyModules] = useState([]);
  const [moduleRoles, setModuleRoles] = useState({});
  const [isSystemAdminFlag, setIsSystemAdminFlag] = useState(false);
  const [companyModulesLoading, setCompanyModulesLoading] = useState(false);
  const selectedModuleKeys = useMemo(() => Object.keys(moduleRoles), [moduleRoles]);
  const actorIsSystemAdmin = isSystemAdmin(currentUser);

  // Selection
  const [selDivision, setSelDivision] = useState('');
  const [selCompany, setSelCompany] = useState('');

  const permMetaById = useMemo(() => collectCatalogPermissionMeta(permCatalog), [permCatalog]);

  const filteredPermCatalog = useMemo(
    () => filterCatalogBySelectedModules(permCatalog, selectedModuleKeys),
    [permCatalog, selectedModuleKeys],
  );
  const permDirtyCount = useMemo(() => {
    const baseline = new Set(permBaselineIds.map(String));
    let n = 0;
    const ids = new Set([...baseline, ...Object.keys(permDraft)]);
    for (const id of ids) {
      const desired = permDraft[id] === true;
      if (desired !== baseline.has(String(id))) n += 1;
    }
    return n;
  }, [permBaselineIds, permDraft]);

  const resetCascade = () => {
    setSelDivision('');
    setSelCompany(lockedCompanyId || '');
    setDepartments([]);
    setTeams([]);
    setCompanyRegions([]);
    setCompanyModules([]);
    setModuleRoles({});
    setIsSystemAdminFlag(false);
    aiPendingRef.current = {
      department_id: null,
      crm_region_ids: null,
      permission_presets: null,
      permission_tweaks: null,
    };
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    // Catalog tách riêng — không chờ /ecosystem/units (có thể >20s) kẻo panel hiện «không tải được».
    setPermCatalogLoading(true);
    setPermCatalogError('');
    api.get('/permissions/catalog', {
      params: { _ts: Date.now() },
      headers: { 'x-no-cache': '1' },
    })
      .then((catRes) => {
        if (cancelled) return;
        const catalog = catRes?.data && Array.isArray(catRes.data.modules)
          ? catRes.data
          : { modules: [] };
        setPermCatalog(catalog);
        if (!catalog.modules.length) {
          setPermCatalogError('Catalog quyền trống hoặc không đọc được. Thử lại.');
        } else {
          const prefer = catalog.modules.find((m) => m.key === 'drive')
            || catalog.modules.find((m) => m.key === 'production')
            || catalog.modules[0];
          if (prefer?.key) setPermModuleKey(prefer.key);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setPermCatalog({ modules: [] });
        setPermCatalogError(err?.response?.data?.error || err?.message || 'Không tải được catalog quyền');
      })
      .finally(() => {
        if (!cancelled) setPermCatalogLoading(false);
      });

    Promise.all([
      api.get('/ecosystem/units?level=1').catch(() => ({ data: { units: [] } })),
      api.get('/companies').catch(() => ({ data: { companies: [] } })),
    ]).then(([divRes, cRes]) => {
      if (cancelled) return;
      const allCompanies = cRes.data.companies || [];
      setDivisions(lockedCompanyId ? [] : (divRes.data.units || []));
      setCompanies(lockedCompanyId
        ? allCompanies.filter((c) => String(c.id) === lockedCompanyId)
        : allCompanies);
    });

    return () => { cancelled = true; };
  }, [open, lockedCompanyId]);

  /** Mỗi lần mở modal / đổi nhân viên: reset form và tải đủ dữ liệu từ API (tránh dính thông tin NV trước) */
  useEffect(() => {
    if (!open) return;

    resetCascade();

    if (!editUserId) {
      setUserLoading(false);
      setForm({
        ...STAFF_EMPTY_FORM,
        password: defaultNewUserPassword || '',
      });
      setModuleRoles({});
      setIsSystemAdminFlag(false);
      setCrmScopeMode('company');
      setRolePermPreview(null);
      setAiPrompt('');
      setAiSummary([]);
      setAiWarnings([]);
      setPermBaselineIds([]);
      setPermDraft({});
      setPermTouched(false);
      if (lockedCompanyId) setSelCompany(lockedCompanyId);
      return;
    }

    setUserLoading(true);
    setForm({ ...STAFF_EMPTY_FORM, email: editUser?.email || '' });
    setModuleRoles({});
    setIsSystemAdminFlag(false);
    setPermTouched(false);
    setAiPrompt('');
    setAiSummary([]);
    setAiWarnings([]);

    let cancelled = false;
    api
      .get(`/users/${editUserId}`)
      .then((r) => {
        if (cancelled) return;
        const user = r.data?.user;
        if (!user || String(user.id) !== String(editUserId)) return;
        setForm(mapUserToForm(user));
        const mr = user.module_roles && typeof user.module_roles === 'object' ? user.module_roles : {};
        setModuleRoles(mr);
        setIsSystemAdminFlag(user.role === 'admin' || user.role === 'platform_admin');
        setCrmScopeMode(inferCrmScopeMode(
          derivePrimaryRoleFromModules(mr, user.role === 'admin'),
          user.crm_region_ids,
        ));
        const companyId = user.department?.company_id;
        if (companyId) setSelCompany(companyId);
      })
      .catch(() => {
        if (cancelled || !editUser) return;
        setForm(mapUserToForm(editUser));
        setCrmScopeMode(inferCrmScopeMode(editUser.role || 'staff', editUser.crm_region_ids));
        const companyId = editUser.department?.company_id;
        if (companyId) setSelCompany(companyId);
      })
      .finally(() => {
        if (!cancelled) setUserLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, editUserId, defaultNewUserPassword]);

  useEffect(() => {
    if (!open || editUserId) return;
    if (presetDivisionId) setSelDivision(String(presetDivisionId));
    if (presetCompanyId) setSelCompany(String(presetCompanyId));
  }, [open, editUserId, presetDivisionId, presetCompanyId]);

  // Reload company list when selecting a Khối (include companies linked via company_division_units)
  useEffect(() => {
    if (!open) return;
    const params = selDivision ? { division_unit_id: selDivision } : {};
    api
      .get('/companies', { params })
      .then((r) => setCompanies(r.data.companies || []))
      .catch(() => setCompanies([]));
  }, [open, selDivision]);

  /** Sau khi có danh sách công ty — suy ra Khối từ company.division_unit_id */
  useEffect(() => {
    if (!open || !selCompany || !companies.length) return;
    const comp = companies.find((c) => String(c.id) === String(selCompany));
    if (comp?.division_unit_id) setSelDivision(comp.division_unit_id);
  }, [open, selCompany, companies]);

  // Load departments when company changes
  useEffect(() => {
    if (selCompany) {
      api
        .get('/departments', { params: { company_id: selCompany, division_unit_id: selDivision || undefined } })
        .then((r) => {
          const list = r.data.departments || [];
          setDepartments(list);
          const pendingDept = aiPendingRef.current.department_id;
          if (pendingDept && list.some((d) => String(d.id) === String(pendingDept))) {
            setForm((f) => ({ ...f, department_id: pendingDept }));
            aiPendingRef.current.department_id = null;
          }
        })
        .catch(() => setDepartments([]));
    } else {
      setDepartments([]);
    }
    if (!editUserId && !aiPendingRef.current.department_id) {
      setForm((f) => ({ ...f, department_id: '', team_id: '' }));
      setTeams([]);
    }
  }, [selCompany, selDivision, editUserId]);

  useEffect(() => {
    if (!selCompany) {
      setCompanyRegions([]);
      return;
    }
    let cancelled = false;
    api
      .get('/crm/company-regions', { params: { company_id: selCompany, division_unit_id: selDivision || undefined } })
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r.data) ? r.data : [];
        setCompanyRegions(list.filter((x) => x.is_active !== false));
        const pendingRegions = aiPendingRef.current.crm_region_ids;
        if (Array.isArray(pendingRegions) && pendingRegions.length) {
          setForm((f) => ({ ...f, crm_region_ids: pendingRegions }));
          aiPendingRef.current.crm_region_ids = null;
        }
      })
      .catch(() => {
        if (!cancelled) setCompanyRegions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selCompany, selDivision]);

  // Module công ty → chip + 1 role / module
  useEffect(() => {
    if (!open) return;
    if (!selCompany) {
      setCompanyModules([]);
      if (!editUserId) setModuleRoles({});
      return;
    }
    let cancelled = false;
    setCompanyModulesLoading(true);
    api
      .get('/ecosystem/company-modules', {
        params: { company_id: selCompany, _ts: Date.now() },
        headers: { 'x-no-cache': '1' },
      })
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r.data?.modules) ? r.data.modules : [];
        setCompanyModules(list);
        setModuleRoles((prev) => {
          if (Object.keys(prev || {}).length) {
            const next = {};
            for (const [k, v] of Object.entries(prev)) {
              if (list.some((m) => m.key === k)) next[k] = v;
            }
            return next;
          }
          if (!editUserId) {
            const next = {};
            for (const m of list) {
              next[m.key] = MODULE_DEFAULT_ROLE[m.key] || 'staff';
            }
            return next;
          }
          return prev || {};
        });
        if (list[0]?.key) setPermModuleKey(list[0].key);
      })
      .catch(() => {
        if (cancelled) return;
        setCompanyModules([]);
        if (!editUserId) setModuleRoles({});
      })
      .finally(() => {
        if (!cancelled) setCompanyModulesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, selCompany, editUserId]);

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
    if (!editUserId) setForm((f) => ({ ...f, team_id: '' }));
  }, [form.department_id, editUserId]);

  const applyPendingAiPermissions = useCallback((catalogOverride, baseDraft) => {
    const presets = aiPendingRef.current.permission_presets;
    const tweaks = aiPendingRef.current.permission_tweaks;
    if (!(presets?.length || tweaks?.length)) return false;
    const catalog = catalogOverride || permCatalog;
    const meta = collectCatalogPermissionMeta(catalog);
    if (!meta.size) return false;
    setPermDraft((prev) => {
      const base = baseDraft
        || (Object.keys(prev || {}).length ? prev : {});
      let next = applyPermissionIntentsToDraft(base, meta, presets || [], tweaks || []);
      const companyKeys = companyModules.map((m) => m.key);
      if (companyKeys.length && selectedModuleKeys.length) {
        next = applySelectedModulesToDraft(next, meta, companyKeys, selectedModuleKeys);
      }
      return next;
    });
    setPermTouched(true);
    setPermPanelOpen(true);
    const mod = preferModuleKeyFromPresets(presets || []) || selectedModuleKeys[0];
    if (mod) setPermModuleKey(mod);
    aiPendingRef.current.permission_presets = null;
    aiPendingRef.current.permission_tweaks = null;
    return true;
  }, [permCatalog, companyModules, selectedModuleKeys]);

  const applyModuleChipsToDraft = useCallback((keys) => {
    const companyKeys = companyModules.map((m) => m.key);
    if (!companyKeys.length || !permMetaById.size) return;
    setPermDraft((prev) => applySelectedModulesToDraft(prev, permMetaById, companyKeys, keys));
    setPermTouched(true);
    if (keys[0]) setPermModuleKey(keys[0]);
    else {
      const fallback = filteredPermCatalog?.modules?.[0]?.key;
      if (fallback) setPermModuleKey(fallback);
    }
  }, [companyModules, permMetaById, filteredPermCatalog]);

  const toggleCompanyModule = (key) => {
    setModuleRoles((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = MODULE_DEFAULT_ROLE[key] || 'staff';
      }
      const keys = Object.keys(next);
      queueMicrotask(() => {
        applyModuleChipsToDraft(keys);
        setPermTouched(false);
        setForm((f) => ({
          ...f,
          role: derivePrimaryRoleFromModules(next, isSystemAdminFlag),
        }));
      });
      return next;
    });
  };

  const setModuleRole = (moduleKey, role) => {
    setModuleRoles((prev) => {
      const next = { ...prev, [moduleKey]: role };
      queueMicrotask(() => {
        setPermTouched(false);
        setForm((f) => ({
          ...f,
          role: derivePrimaryRoleFromModules(next, isSystemAdminFlag),
        }));
        if (role === 'region_admin') setCrmScopeMode('regions');
        else if (COMPANY_WIDE_CRM_ROLES.has(role)) setCrmScopeMode('company');
      });
      return next;
    });
  };

  const moduleSelRef = useRef({ company: [], selected: [] });
  moduleSelRef.current = {
    company: companyModules.map((m) => m.key),
    selected: selectedModuleKeys,
  };

  // Tạo mới: sau khi có chip module → đồng bộ draft (role có thể đã seed trước)
  useEffect(() => {
    if (!open || editUserId) return;
    if (!companyModules.length || !permMetaById.size) return;
    applyModuleChipsToDraft(selectedModuleKeys);
  }, [open, editUserId, companyModules, selectedModuleKeys, permMetaById, applyModuleChipsToDraft]);

  // Tab panel phải luôn khớp catalog đã lọc
  useEffect(() => {
    const mods = filteredPermCatalog?.modules || [];
    if (!mods.length) return;
    if (!mods.some((m) => m.key === permModuleKey)) {
      setPermModuleKey(mods[0].key);
    }
  }, [filteredPermCatalog, permModuleKey]);

  // Khi catalog quyền tải xong — áp pending từ AI (nếu còn)
  useEffect(() => {
    if (!open) return;
    if (!(permCatalog?.modules || []).length) return;
    applyPendingAiPermissions(permCatalog);
  }, [open, permCatalog, applyPendingAiPermissions]);

  // Preview quyền khi đổi module roles → seed union mẫu vai trò
  useEffect(() => {
    if (!open) return;
    const roles = [
      ...new Set([
        ...Object.values(moduleRoles || {}),
        ...(isSystemAdminFlag ? ['admin'] : []),
      ]),
    ].filter(Boolean);
    if (!roles.length) {
      setRolePermPreview(null);
      if (!permTouched && !editUserId) {
        setPermBaselineIds([]);
        setPermDraft({});
      }
      return;
    }
    let cancelled = false;
    setRolePermLoading(true);
    Promise.all(
      roles.map((role) =>
        api.get(`/permissions/roles/by-name/${encodeURIComponent(role)}`).catch(() => ({ data: null })),
      ),
    )
      .then((responses) => {
        if (cancelled) return;
        const idSet = new Set();
        let first = null;
        for (const r of responses) {
          const data = r.data || null;
          if (!first && data) first = data;
          for (const p of data?.permissions || []) {
            if (p?.id) idSet.add(p.id);
          }
        }
        setRolePermPreview(first);
        const ids = [...idSet];
        setPermBaselineIds(ids);
        const pendingPresets = aiPendingRef.current.permission_presets;
        const pendingTweaks = aiPendingRef.current.permission_tweaks;
        const hasPendingPerms = (pendingPresets && pendingPresets.length)
          || (pendingTweaks && pendingTweaks.length);
        const base = draftFromPermissionIds(ids);
        const meta = collectCatalogPermissionMeta(permCatalog);
        const { company: companyKeys, selected: selKeys } = moduleSelRef.current;
        const withModules = (d) => (
          companyKeys.length
            ? applySelectedModulesToDraft(d, meta, companyKeys, selKeys)
            : d
        );

        if (editUserId && permTouched) return;

        if (hasPendingPerms) {
          const applied = applyPendingAiPermissions(undefined, base);
          if (!applied) setPermDraft(withModules(base));
        } else if (!permTouched) {
          setPermDraft(withModules(base));
        } else {
          setPermDraft((prev) => {
            const next = { ...prev };
            for (const id of ids) {
              if (next[id] === undefined) next[id] = true;
            }
            return withModules(next);
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRolePermPreview(null);
          if (!permTouched) {
            setPermBaselineIds([]);
            setPermDraft({});
          }
        }
      })
      .finally(() => {
        if (!cancelled) setRolePermLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, moduleRoles, isSystemAdminFlag, applyPendingAiPermissions]);

  // Edit: nạp quyền hiệu lực hiện tại
  useEffect(() => {
    if (!open || !editUserId) return;
    let cancelled = false;
    api
      .get(`/permissions/users/${editUserId}/effective`)
      .then((r) => {
        if (cancelled) return;
        const rows = r.data?.permissions || [];
        const draft = {};
        for (const p of rows) {
          if (p.permission_id) draft[p.permission_id] = p.effective === true;
        }
        setPermDraft(draft);
        setPermTouched(true);
        if (Array.isArray(r.data?.role_permission_ids)) {
          setPermBaselineIds(r.data.role_permission_ids);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, editUserId]);

  // companies state is already filtered by selDivision via API above
  const divCompanies = companies;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const applyCrmScopeMode = (mode) => {
    setCrmScopeMode(mode);
    if (mode === 'regions') {
      if (COMPANY_WIDE_CRM_ROLES.has(form.role) || moduleRoles.crm) {
        setModuleRole('crm', 'region_admin');
      }
    } else if (mode === 'company' && (form.role === 'region_admin' || moduleRoles.crm === 'region_admin')) {
      setModuleRole('crm', 'sales_admin');
    }
  };

  const onTogglePerm = (permissionId, value) => {
    setPermTouched(true);
    setPermDraft((d) => ({ ...d, [permissionId]: value }));
  };

  const onTogglePermTier = (feat, action, value) => {
    setPermTouched(true);
    const updates = cascadeTierDraft(feat.levels || [], action, value);
    setPermDraft((d) => ({ ...d, ...updates }));
  };

  const resetPermsToRole = () => {
    setPermTouched(true);
    setPermDraft(draftFromPermissionIds(permBaselineIds));
  };

  /** Preset: Drive chỉ xem — tắt upload/sửa/xóa */
  const presetDriveViewOnly = () => {
    setPermTouched(true);
    setPermDraft((d) => {
      const next = { ...d };
      for (const [id, meta] of permMetaById.entries()) {
        if (meta.resource !== 'drive') continue;
        next[id] = meta.action === 'view';
      }
      return next;
    });
    setPermModuleKey('drive');
  };

  /** Preset: bật Xem mọi chức năng Sản xuất */
  const presetProductionViewAll = () => {
    setPermTouched(true);
    setPermDraft((d) => {
      const next = { ...d };
      for (const [id, meta] of permMetaById.entries()) {
        const res = String(meta.resource || '');
        if (res.startsWith('sx_') || res === 'projects') {
          if (meta.action === 'view') next[id] = true;
        }
      }
      return next;
    });
    setPermModuleKey('production');
  };

  const savePermissionOverrides = async (userId) => {
    if (!userId || !permTouched) return;
    const changes = buildPermissionOverrideChanges(permBaselineIds, permDraft);
    if (!changes.length) return;
    await api.put(`/permissions/users/${userId}/overrides`, { changes });
  };

  const runAiFill = async () => {
    const prompt = aiPrompt.trim();
    if (!prompt || aiBusy) return;
    setAiBusy(true);
    setAiSummary([]);
    setAiWarnings([]);
    try {
      const { data } = await api.post('/users/ai-fill-form', {
        prompt,
        default_password: defaultNewUserPassword || '123456',
      });
      const fields = data?.fields || {};
      const role = fields.role && ROLES[fields.role] ? fields.role : (form.role || 'staff');
      const scope = fields.crm_scope_mode === 'regions' ? 'regions' : 'company';

      aiPendingRef.current = {
        department_id: fields.department_id || null,
        crm_region_ids: Array.isArray(fields.crm_region_ids) ? fields.crm_region_ids : null,
        permission_presets: Array.isArray(fields.permission_presets) ? fields.permission_presets : null,
        permission_tweaks: Array.isArray(fields.permission_tweaks) ? fields.permission_tweaks : null,
      };

      const roleChanged = role !== (form.role || 'staff');
      setForm((f) => ({
        ...f,
        full_name: fields.full_name != null && fields.full_name !== '' ? fields.full_name : f.full_name,
        email: (!editUserId && fields.email) ? fields.email : f.email,
        phone: fields.phone != null ? fields.phone : f.phone,
        password: (!editUserId && fields.password) ? fields.password : f.password,
        role,
        position: fields.position != null ? fields.position : f.position,
        department_id: fields.department_id || f.department_id || '',
        team_id: fields.team_id || '',
        crm_region_ids: Array.isArray(fields.crm_region_ids) ? fields.crm_region_ids : f.crm_region_ids,
      }));
      if (role === 'admin' || role === 'platform_admin') {
        setIsSystemAdminFlag(true);
      } else {
        setIsSystemAdminFlag(false);
        setModuleRoles(inferModuleRolesFromPrimaryRole(role));
      }
      setCrmScopeMode(scope);
      if (fields.company_id && !lockedCompanyId) {
        setSelCompany(String(fields.company_id));
      } else if (fields.company_id && lockedCompanyId && String(fields.company_id) === lockedCompanyId) {
        setSelCompany(lockedCompanyId);
      } else if (!fields.company_id && fields.department_id) {
        setForm((f) => ({ ...f, department_id: fields.department_id }));
      }

      const presets = Array.isArray(fields.permission_presets) ? fields.permission_presets : [];
      const tweaks = Array.isArray(fields.permission_tweaks) ? fields.permission_tweaks : [];
      if (presets.length || tweaks.length) {
        setPermPanelOpen(true);
        const mod = preferModuleKeyFromPresets(presets);
        if (mod) setPermModuleKey(mod);
        if (!roleChanged) {
          const applied = applyPendingAiPermissions();
          if (!applied) {
            // catalog chưa sẵn — giữ pending trong ref
            setPermTouched(true);
          }
        } else {
          setPermTouched(false);
        }
      }

      setAiSummary(Array.isArray(data?.summary) ? data.summary : []);
      setAiWarnings(Array.isArray(data?.warnings) ? data.warnings : []);
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'AI điền form thất bại');
    } finally {
      setAiBusy(false);
    }
  };

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
      if (!Object.keys(moduleRoles).length && !isSystemAdminFlag) {
        alert('Chọn ít nhất một module và role tương ứng.');
        setLoading(false);
        return;
      }
      if (crmScopeMode === 'regions' && !(form.crm_region_ids || []).length) {
        alert('Chọn ít nhất một khu vực CRM khi phạm vi là «Chỉ khu vực chỉ định».');
        setLoading(false);
        return;
      }
      const derivedRole = derivePrimaryRoleFromModules(moduleRoles, isSystemAdminFlag);
      const payload = { ...form, role: derivedRole };
      if (!payload.password) delete payload.password;
      if (editUserId) delete payload.email;
      payload.department_id = payload.department_id || null;
      payload.team_id = payload.team_id || null;
      ['date_of_birth', 'hire_date', 'address', 'emergency_contact', 'notes', 'position', 'zalo_id'].forEach((k) => {
        if (payload[k] === '') payload[k] = null;
      });
      if (payload.salary === '' || payload.salary == null) payload.salary = null;
      payload.crm_region_ids = Array.isArray(form.crm_region_ids) ? form.crm_region_ids : [];
      if (crmScopeMode === 'company' && derivedRole === 'region_admin') {
        payload.role = 'sales_admin';
        if (moduleRoles.crm === 'region_admin') {
          payload.module_roles = { ...moduleRoles, crm: 'sales_admin' };
        } else {
          payload.module_roles = { ...moduleRoles };
        }
      } else {
        payload.module_roles = { ...moduleRoles };
      }
      payload.is_system_admin = isSystemAdminFlag === true;
      if (payload.avatar === undefined) delete payload.avatar;
      else if (payload.avatar === null || payload.avatar === '') payload.avatar = null;
      else if (typeof payload.avatar === 'string') payload.avatar = payload.avatar.trim() || null;
      if (!editUserId && payload.avatar == null) delete payload.avatar;
      const driveMod = driveModuleFromSelection(selectedModuleKeys);
      if (driveMod) payload.drive_module = driveMod;
      let savedUserId = editUserId;
      if (editUserId) {
        await api.put(`/users/${editUserId}`, payload);
      } else {
        const { data } = await api.post('/users', payload);
        savedUserId = data?.user?.id || data?.id || null;
      }
      try {
        await savePermissionOverrides(savedUserId);
      } catch (permErr) {
        console.warn('Lưu phân quyền NV:', permErr);
        alert(permErr.response?.data?.error || 'Đã lưu NV nhưng chưa ghi được phân quyền tùy chỉnh — mở menu Phân quyền để chỉnh lại.');
      }
      onSaved?.(); onClose();
    } catch (err) { alert(err.response?.data?.error || 'Lỗi'); }
    setLoading(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={editUserId ? 'Sửa nhân viên' : 'Thêm nhân viên mới'} size="xl" bodyClassName="overflow-hidden flex flex-col">
      {userLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin h-6 w-6 border-2 border-gray-200 border-t-gray-600 rounded-full" />
        </div>
      ) : (
      <form key={editUserId ?? 'new'} onSubmit={submit} autoComplete="off" className="flex flex-col md:flex-row gap-4 flex-1 min-h-0 max-h-[75vh]">
        {/* Hidden fields to trick browser autofill */}
        <input type="text" name="prevent_autofill" id="prevent_autofill" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />
        <input type="password" name="prevent_autofill_pass" id="prevent_autofill_pass" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />

        {/* Cột trái: thông tin NV */}
        <div className="flex-1 min-w-0 space-y-4 overflow-y-auto pr-1 order-1">
        {/* AI điền form */}
        <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-3.5 space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600 shrink-0" />
            <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wide">AI điền form</h4>
            <span className="text-[10px] text-emerald-700/70">Mô tả → tự điền từng ô (bạn kiểm tra rồi lưu)</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runAiFill();
                }
              }}
              disabled={aiBusy}
              className="input flex-1 text-sm"
              placeholder='VD: NV kế toán Metalla — quyền xem, không tương tác'
              autoComplete="off"
            />
            <button
              type="button"
              onClick={runAiFill}
              disabled={aiBusy || !aiPrompt.trim()}
              className="h-10 px-3.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5 shrink-0"
            >
              {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {aiBusy ? 'Đang chạy…' : 'Điền'}
            </button>
          </div>
          <p className="text-[10px] text-gray-500 leading-relaxed">
            Quy định nghề: <span className="font-medium text-gray-600">Kế toán / kiểm soát / quan sát</span> → xem hết module, tắt sửa·tạo·xóa.
            Module: Drive chỉ xem · SX/CRM/VC xem tất cả · «không tương tác / không tham gia».
          </p>
          {(aiSummary.length > 0 || aiWarnings.length > 0) && (
            <div className="space-y-1 pt-1 border-t border-emerald-100">
              {aiSummary.map((s, i) => (
                <p key={`s-${i}`} className="text-[11px] text-emerald-900">✓ {s}</p>
              ))}
              {aiWarnings.map((w, i) => (
                <p key={`w-${i}`} className="text-[11px] text-amber-800">⚠ {w}</p>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-start gap-4 pb-4 border-b border-gray-100">
          <div className="relative shrink-0">
            {form.avatar ? (
              <img src={form.avatar} alt="" className="h-20 w-20 rounded-full object-cover border-2 border-gray-200 bg-gray-50" />
            ) : (
              <div
                className="h-20 w-20 rounded-full flex items-center justify-center text-white text-xl font-bold"
                style={{ backgroundColor: avatarColor(form.full_name || form.email || 'U') }}
              >
                {getInitials(form.full_name || form.email || '?')}
              </div>
            )}
            {avatarBusy && (
              <div className="absolute inset-0 rounded-full bg-black/35 flex items-center justify-center">
                <span className="text-white text-xs font-medium">…</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <p className="text-sm font-medium text-gray-900">Ảnh đại diện</p>
            <p className="text-xs text-gray-500">JPG, PNG, WebP… Dùng ở bảng tin nội bộ, chọn nhân viên, hồ sơ.</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={avatarBusy}
                onClick={() => avatarInputRef.current?.click()}
                className="h-9 px-3 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
              >
                <Camera className="h-4 w-4 shrink-0" />
                {form.avatar ? 'Đổi ảnh' : 'Tải ảnh lên'}
              </button>
              {form.avatar && (
                <button type="button" onClick={() => set('avatar', null)} className="text-sm text-red-600 hover:underline">
                  Gỡ ảnh
                </button>
              )}
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={async (ev) => {
                const file = ev.target.files?.[0];
                ev.target.value = '';
                if (!file) return;
                if (!file.type.startsWith('image/')) {
                  alert('Chỉ chọn file ảnh');
                  return;
                }
                setAvatarBusy(true);
                try {
                  const fd = new FormData();
                  fd.append('file', file);
                  fd.append('entity_type', 'user_avatars');
                  if (editUserId) fd.append('entity_id', editUserId);
                  const { data } = await api.post('/upload/single', fd, { timeout: 120000 });
                  if (!data?.file_url) throw new Error('Không nhận được URL');
                  set('avatar', data.file_url);
                } catch (err) {
                  alert(err.response?.data?.error || err.message || 'Lỗi upload');
                } finally {
                  setAvatarBusy(false);
                }
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Họ tên *</label><input value={form.full_name || ''} onChange={e => set('full_name', e.target.value)} required className="input" autoComplete="off" /></div>
          <div><label className="block text-sm font-medium mb-1">Email *</label><input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} required className="input" disabled={!!editUserId} autoComplete="off" readOnly={!!editUserId} /></div>
          <div><label className="block text-sm font-medium mb-1">SĐT</label><input value={form.phone || ''} onChange={e => set('phone', e.target.value)} className="input" autoComplete="off" /></div>
          <div>
            <label className="block text-sm font-medium mb-1">ID Zalo</label>
            <input
              value={form.zalo_id || ''}
              onChange={e => set('zalo_id', e.target.value)}
              className="input"
              autoComplete="off"
              placeholder="UID Zalo để @mention"
            />
            <p className="text-[11px] text-gray-500 mt-1">API nhắc hạn gửi ID này để bot @ đúng nhân viên trên nhóm Zalo.</p>
          </div>
          <div><label className="block text-sm font-medium mb-1">Mật khẩu {editUserId ? '(trống = giữ)' : '*'}</label><input type="password" value={form.password || ''} onChange={e => set('password', e.target.value)} className="input" required={!editUserId} placeholder={editUserId ? '••••••' : (defaultNewUserPassword || '123456')} autoComplete="new-password" /></div>
          <div><label className="block text-sm font-medium mb-1">Chức vụ</label><input value={form.position || ''} onChange={e => set('position', e.target.value)} className="input" placeholder="VD: Trưởng phòng" /></div>
        </div>
        {actorIsSystemAdmin && (
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={isSystemAdminFlag}
              onChange={(e) => {
                const on = e.target.checked;
                setIsSystemAdminFlag(on);
                setForm((f) => ({
                  ...f,
                  role: derivePrimaryRoleFromModules(moduleRoles, on),
                }));
                setPermTouched(false);
              }}
              className="rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <span>Admin hệ thống <span className="text-xs text-gray-500">(không gắn module nghiệp vụ)</span></span>
          </label>
        )}
        {Object.keys(moduleRoles).length > 0 && (
          <p className="text-xs text-gray-500">
            Vai trò hệ thống (JWT): <span className="font-medium text-gray-800">{ROLES[derivePrimaryRoleFromModules(moduleRoles, isSystemAdminFlag)] || derivePrimaryRoleFromModules(moduleRoles, isSystemAdminFlag)}</span>
          </p>
        )}

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
                  setSelCompany(lockedCompanyId || '');
                  setForm((f) => ({ ...f, department_id: '', team_id: '', crm_region_ids: [] }));
                  setTeams([]);
                }}
                disabled={!!lockedCompanyId}
                className="w-full h-9 px-3 border rounded-lg text-sm disabled:bg-gray-50 disabled:text-gray-500"
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
                disabled={!!lockedCompanyId}
                className="w-full h-9 px-3 border rounded-lg text-sm disabled:bg-gray-50 disabled:text-gray-500"
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

          {/* Module theo công ty — mỗi module 1 role */}
          <div className="pt-1 border-t border-blue-100 space-y-1.5">
            <label className="text-[11px] font-semibold text-gray-700 block">
              Module &amp; vai trò {selCompany ? '' : '(chọn công ty trước)'}
            </label>
            {!selCompany ? (
              <p className="text-[10px] text-gray-400">Chọn công ty để hiện module CRM / SX / VC…</p>
            ) : companyModulesLoading ? (
              <p className="text-[10px] text-gray-500">Đang tải module…</p>
            ) : !companyModules.length ? (
              <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
                Công ty chưa gắn khối / không có module. Kiểm tra cấu hình Module ↔ Khối.
              </p>
            ) : (
              <div className="space-y-2">
                {companyModules.map((m) => {
                  const checked = !!moduleRoles[m.key];
                  const roleOpts = MODULE_ROLE_OPTIONS[m.key] || ['staff'];
                  return (
                    <div
                      key={m.key}
                      className={`flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-2 ${
                        checked
                          ? 'bg-blue-50 border-blue-300'
                          : 'bg-white border-gray-200'
                      }`}
                    >
                      <label className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer select-none min-w-[7rem]">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCompanyModule(m.key)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="font-medium text-gray-800">{m.label}</span>
                      </label>
                      {checked && (
                        <select
                          value={moduleRoles[m.key] || roleOpts[0]}
                          onChange={(e) => setModuleRole(m.key, e.target.value)}
                          className="h-8 flex-1 min-w-[10rem] px-2 border rounded-lg text-[11px] bg-white"
                        >
                          {roleOpts.map((rk) => (
                            <option key={rk} value={rk}>{ROLES[rk] || rk}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-[10px] text-gray-500">
              Bật module + chọn đúng 1 role. Công việc &amp; Kiến thức luôn hiện bên phải. Tick module = làm việc (xem+sửa).
            </p>
          </div>

          {/* Phạm vi CRM: cả công ty vs khu vực chỉ định */}
          <div className="pt-1 border-t border-blue-100 space-y-2">
            <label className="text-[11px] font-semibold text-gray-700 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-blue-600" />
              Phạm vi dữ liệu CRM
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer text-[11px] ${
                  crmScopeMode === 'company' ? 'bg-blue-100 border-blue-300 text-blue-950' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="crm_scope_mode"
                  className="mt-0.5"
                  checked={crmScopeMode === 'company'}
                  onChange={() => applyCrmScopeMode('company')}
                />
                <span>
                  <span className="font-semibold block">Cả công ty</span>
                  <span className="text-gray-600">Xem lead/deal trong phạm vi công ty (Admin / Sales Admin / Admin CRM+SX).</span>
                </span>
              </label>
              <label
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer text-[11px] ${
                  crmScopeMode === 'regions' ? 'bg-rose-50 border-rose-300 text-rose-950' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="crm_scope_mode"
                  className="mt-0.5"
                  checked={crmScopeMode === 'regions'}
                  onChange={() => applyCrmScopeMode('regions')}
                />
                <span>
                  <span className="font-semibold block">Chỉ khu vực chỉ định</span>
                  <span className="text-gray-600">Khóa theo khu vực CRM đã chọn (thường dùng với «Admin khu vực»).</span>
                </span>
              </label>
            </div>

            {crmScopeMode === 'regions' && (
              <>
                <label className="text-[11px] font-semibold text-gray-700 block mt-1">
                  Khu vực CRM được phép quản lý *
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
                <p className="text-[10px] text-gray-500">
                  Bắt buộc chọn ≥1 khu vực. Vai trò «Admin khu vực» chỉ thấy dữ liệu các khu vực này.
                </p>
              </>
            )}

            {crmScopeMode === 'company' && selCompany && companyRegions.length > 0 && (
              <div className="pt-1">
                <label className="text-[11px] font-medium text-gray-600 block mb-1.5">
                  Khu vực CRM (tuỳ chọn — gắn nhãn, không khóa phạm vi admin công ty)
                </label>
                <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                  {companyRegions.map((reg) => {
                    const checked = (form.crm_region_ids || []).some((id) => String(id) === String(reg.id));
                    return (
                      <label
                        key={reg.id}
                        className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg border cursor-pointer select-none ${
                          checked ? 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCrmRegion(reg.id)}
                          className="rounded border-gray-300 text-slate-600 focus:ring-slate-400"
                        />
                        <span>{reg.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Ngày sinh</label><input type="date" value={form.date_of_birth || ''} onChange={e => set('date_of_birth', e.target.value)} className="input" /></div>
          <div><label className="block text-sm font-medium mb-1">Ngày vào làm</label><input type="date" value={form.hire_date || ''} onChange={e => set('hire_date', e.target.value)} className="input" /></div>
        </div>
        <div><label className="block text-sm font-medium mb-1">Địa chỉ</label><input value={form.address || ''} onChange={e => set('address', e.target.value)} className="input" /></div>
        <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-white/95 backdrop-blur-sm pb-1">
          <button type="button" onClick={onClose} className="h-10 px-4 bg-gray-100 rounded-lg text-sm cursor-pointer">Hủy</button>
          <button type="submit" disabled={loading} className="h-10 px-6 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer">{loading ? 'Lưu...' : editUserId ? 'Cập nhật' : 'Tạo NV'}</button>
        </div>
        </div>

        {/* Cột phải: phân quyền module */}
        <aside className="order-2 w-full md:w-[380px] lg:w-[420px] shrink-0 flex flex-col min-h-0 rounded-xl border border-violet-200 bg-violet-50/40 overflow-hidden">
          <div className="shrink-0 p-3.5 space-y-2.5 border-b border-violet-100 bg-violet-50/80">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-violet-800 uppercase flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 shrink-0" />
                  Phân quyền «{Object.keys(moduleRoles).length
                    ? Object.entries(moduleRoles).map(([k, r]) => `${k}:${ROLES[r] || r}`).join(' · ')
                    : (ROLES[form.role] || form.role || '—')}»
                </h4>
                <p className="text-[10px] text-violet-700/80 mt-0.5 leading-snug">
                  Bật/tắt từng quyền. Drive chỉ xem · SX xem tất cả · Reset theo vai trò.
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {permDirtyCount > 0 && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                    {permDirtyCount} chỉnh tay
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setPermPanelOpen((v) => !v)}
                  className="md:hidden text-[11px] font-medium text-violet-700 hover:underline"
                >
                  {permPanelOpen ? 'Thu gọn' : 'Mở'}
                </button>
              </div>
            </div>

            {rolePermPreview?.scope_note && (
              <p className="text-[10px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-2 py-1.5">
                {rolePermPreview.scope_note}
              </p>
            )}

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={presetDriveViewOnly}
                className="h-7 px-2 rounded-lg border border-slate-200 bg-white text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                title="Chỉ bật xem Drive — tắt upload/sửa/xóa"
              >
                Drive: chỉ xem
              </button>
              <button
                type="button"
                onClick={presetProductionViewAll}
                className="h-7 px-2 rounded-lg border border-slate-200 bg-white text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                title="Bật quyền Xem mọi chức năng Sản xuất"
              >
                SX: xem tất cả
              </button>
              <button
                type="button"
                onClick={resetPermsToRole}
                className="h-7 px-2 rounded-lg border border-violet-200 bg-violet-100/80 text-[10px] font-medium text-violet-800 hover:bg-violet-100"
              >
                Reset theo vai trò
              </button>
            </div>
          </div>

          {permPanelOpen && (
          <div className="flex-1 min-h-0 overflow-y-auto p-2.5 bg-white/90 max-h-[52vh] md:max-h-none md:!block">
              {(rolePermLoading || permCatalogLoading) ? (
                <p className="text-[11px] text-gray-500 p-2">Đang tải quyền…</p>
              ) : !(permCatalog?.modules || []).length ? (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                  {permCatalogError || 'Không tải được catalog quyền. Kiểm tra quyền admin hoặc thử lại.'}
                </p>
              ) : (
                <PermissionCatalogPanel
                  catalog={filteredPermCatalog}
                  activeModuleKey={permModuleKey}
                  onModuleChange={setPermModuleKey}
                  getChecked={(id) => permDraft[id] === true}
                  isDirty={(id) => {
                    const desired = permDraft[id] === true;
                    const fromRole = permBaselineIds.some((x) => String(x) === String(id));
                    return desired !== fromRole;
                  }}
                  getSource={(id) => {
                    if (permDraft[id] === true && permBaselineIds.some((x) => String(x) === String(id))) return 'system_role';
                    if (permDraft[id] === true) return 'override_grant';
                    if (permBaselineIds.some((x) => String(x) === String(id))) return 'override_deny';
                    return 'none';
                  }}
                  onToggle={onTogglePerm}
                  onToggleTier={onTogglePermTier}
                  disabled={loading}
                  emptyHint="Không có quyền trong module này"
                />
              )}
            </div>
          )}
        </aside>
      </form>
      )}
    </Modal>
  );
}

// ═══ Staff Detail Modal ═══
function StaffDetailModal({ userId, open, onClose }) {
  const [user, setUser] = useState(null);
  const [ecosystemPath, setEcosystemPath] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => { 
    if (!open || !userId) return; 
    setLoading(true);
    
    api.get(`/users/${userId}`).then((userRes) => {
      const userData = userRes.data.user;
      setUser(userData);
      
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
              {user.avatar ? (
                <img src={user.avatar} alt="" className="h-16 w-16 rounded-full object-cover border-2 border-gray-200 shrink-0" />
              ) : (
                <div className="h-16 w-16 rounded-full flex items-center justify-center text-white font-bold text-2xl shrink-0"
                  style={{ backgroundColor: avatarColor(user.full_name) }}>
                  {getInitials(user.full_name)}
                </div>
              )}
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

            {/* Module roles */}
            <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
              <p className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3">
                <Shield className="h-4 w-4 text-purple-600" />
                Module &amp; vai trò
              </p>
              {!(user.module_roles && Object.keys(user.module_roles).length) ? (
                <p className="text-xs text-gray-500 italic">
                  Chưa cấu hình module — primary: {ROLES[user.role] || user.role}
                </p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(user.module_roles).map(([mk, role]) => (
                    <div key={mk} className="bg-white border border-purple-200 rounded-lg p-2.5 flex items-center gap-2">
                      <Shield className="h-4 w-4 text-purple-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-900 capitalize">{mk}</p>
                        <p className="text-[10px] text-gray-600">{ROLES[role] || role}</p>
                      </div>
                    </div>
                  ))}
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
                <p className="text-[11px] text-gray-500">ID Zalo</p>
                <p className="font-medium">{user.zalo_id ? `@${String(user.zalo_id).replace(/^@+/, '')}` : '—'}</p>
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
    </>
  );
}
