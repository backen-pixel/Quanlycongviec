import { useState, useEffect } from 'react';
import { Shield, Plus, Check, X, Save, Users as UsersIcon, Settings, Layers, Building2, Users as UsersRound } from 'lucide-react';
import api from '../lib/api';
import UserRolesModal from '../components/UserRolesModal';

// Vietnamese labels for resources
const RESOURCE_LABELS = {
  projects: 'Dự án',
  workflows: 'Quy trình',
  templates: 'Bộ mẫu',
  users: 'Nhân viên',
  ecosystem: 'Cấu trúc công ty',
  reports: 'Báo cáo',
  settings: 'Cài đặt',
};

// Vietnamese labels for actions
const ACTION_LABELS = {
  view: 'Xem',
  create: 'Tạo mới',
  edit: 'Chỉnh sửa',
  delete: 'Xóa',
  all_companies: 'Xem tất cả công ty',
  export: 'Xuất dữ liệu',
};

// Vietnamese descriptions for permissions
const PERMISSION_DESCRIPTIONS = {
  'projects:view': 'Xem danh sách dự án',
  'projects:create': 'Tạo dự án mới',
  'projects:edit': 'Sửa thông tin dự án',
  'projects:delete': 'Xóa dự án',
  'projects:all_companies': 'Xem dự án của tất cả công ty (không giới hạn)',
  
  'workflows:view': 'Xem quy trình công việc',
  'workflows:create': 'Tạo quy trình mới',
  'workflows:edit': 'Sửa quy trình',
  'workflows:delete': 'Xóa quy trình',
  
  'templates:view': 'Xem bộ mẫu dự án',
  'templates:create': 'Tạo bộ mẫu',
  'templates:edit': 'Sửa bộ mẫu',
  'templates:delete': 'Xóa bộ mẫu',
  
  'users:view': 'Xem danh sách nhân viên',
  'users:create': 'Thêm nhân viên mới',
  'users:edit': 'Sửa thông tin nhân viên',
  'users:delete': 'Xóa nhân viên',
  
  'ecosystem:view': 'Xem cấu trúc tổ chức',
  'ecosystem:edit': 'Sửa cấu trúc tổ chức',
  
  'reports:view': 'Xem báo cáo',
  'reports:export': 'Xuất báo cáo',
  
  'settings:view': 'Xem cài đặt hệ thống',
  'settings:edit': 'Thay đổi cài đặt',
};

export default function PermissionsPage() {
  const [activeTab, setActiveTab] = useState('roles'); // 'roles' | 'users'
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState({ permissions: [], grouped: {} });
  const [selectedRole, setSelectedRole] = useState(null);
  const [rolePermissions, setRolePermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreateRole, setShowCreateRole] = useState(false);
  
  // User assignment tab
  const [users, setUsers] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  
  // Filters
  const [filterDivision, setFilterDivision] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterDept, setFilterDept] = useState('');

  useEffect(() => {
    load();
    loadEcosystemData();
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers();
    }
  }, [activeTab, filterDivision, filterCompany, filterDept]);

  const load = async () => {
    setLoading(true);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        api.get('/permissions/roles'),
        api.get('/permissions/permissions'),
      ]);
      setRoles(rolesRes.data.roles || []);
      setPermissions(permsRes.data);
    } catch (e) {
      console.error('Load permissions error:', e);
    }
    setLoading(false);
  };

  const loadEcosystemData = async () => {
    try {
      const [deptRes, compRes, divRes] = await Promise.all([
        api.get('/users/departments'),
        api.get('/ecosystem/units?level=2'), // Companies
        api.get('/ecosystem/units?level=1'), // Divisions
      ]);
      
      setDepartments(deptRes.data.departments || []);
      
      // Companies from ecosystem
      const companyUnits = compRes.data.units || [];
      setCompanies(companyUnits.map(u => ({
        id: u.company_id,
        name: u.name,
        division_unit_id: u.parent_id,
        unit_id: u.id,
      })).filter(c => c.id));
      
      setDivisions(divRes.data.units || []);
    } catch (e) {
      console.error('Load ecosystem data error:', e);
    }
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const params = {};
      
      if (filterDivision) {
        params.ecosystem_unit_id = filterDivision;
      } else if (filterCompany) {
        params.company_id = filterCompany;
      }
      
      if (filterDept) {
        params.department_id = filterDept;
      }
      
      const { data } = await api.get('/users', { params });
      setUsers(data.users || []);
    } catch (e) {
      console.error('Load users error:', e);
    }
    setLoadingUsers(false);
  };

  const loadRolePermissions = async (roleId) => {
    try {
      const { data } = await api.get(`/permissions/roles/${roleId}`);
      setRolePermissions(data.role.permissions || []);
      setSelectedRole(data.role);
    } catch (e) {
      console.error('Load role permissions error:', e);
    }
  };

  const togglePermission = (permissionId) => {
    setRolePermissions(prev => {
      const exists = prev.find(p => p.id === permissionId);
      if (exists) {
        return prev.filter(p => p.id !== permissionId);
      } else {
        const perm = permissions.permissions.find(p => p.id === permissionId);
        return [...prev, perm];
      }
    });
  };

  const saveRolePermissions = async () => {
    if (!selectedRole) return;
    setSaving(true);
    try {
      await api.put(`/permissions/roles/${selectedRole.id}/permissions`, {
        permission_ids: rolePermissions.map(p => p.id),
      });
      alert('✅ Đã lưu phân quyền');
      await load();
    } catch (e) {
      alert('Lỗi: ' + (e.response?.data?.error || e.message));
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-purple-200 border-t-purple-600 rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="h-5 w-5 text-purple-600" /> Phân Quyền Hệ Thống
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Quản lý vai trò, quyền hạn và phân quyền phân cấp hệ sinh thái
          </p>
        </div>
        {activeTab === 'roles' && (
          <button
            onClick={() => setShowCreateRole(true)}
            className="h-9 px-4 bg-purple-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-purple-700"
          >
            <Plus className="h-4 w-4" /> Tạo vai trò mới
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('roles')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'roles'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Settings className="h-4 w-4 inline mr-2" />
          Quản lý vai trò & quyền hạn
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'users'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <UsersIcon className="h-4 w-4 inline mr-2" />
          Gán vai trò cho nhân viên
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'roles' ? (
        <RolesTab
          roles={roles}
          permissions={permissions}
          selectedRole={selectedRole}
          rolePermissions={rolePermissions}
          saving={saving}
          onSelectRole={loadRolePermissions}
          onTogglePermission={togglePermission}
          onSave={saveRolePermissions}
        />
      ) : (
        <UsersTab
          users={users}
          loading={loadingUsers}
          onUserClick={(user) => setSelectedUser(user)}
          // Filters
          divisions={divisions}
          companies={companies}
          departments={departments}
          filterDivision={filterDivision}
          filterCompany={filterCompany}
          filterDept={filterDept}
          onFilterDivision={setFilterDivision}
          onFilterCompany={setFilterCompany}
          onFilterDept={setFilterDept}
        />
      )}

      {/* Create Role Modal */}
      {showCreateRole && (
        <CreateRoleModal
          onClose={() => setShowCreateRole(false)}
          onSaved={() => {
            load();
            setShowCreateRole(false);
          }}
        />
      )}

      {/* User Roles Modal */}
      {selectedUser && (
        <UserRolesModal
          userId={selectedUser.id}
          userName={selectedUser.full_name}
          onClose={() => setSelectedUser(null)}
          onSaved={() => {
            setSelectedUser(null);
            loadUsers();
          }}
        />
      )}
    </div>
  );
}

// Roles & Permissions Tab
function RolesTab({ roles, permissions, selectedRole, rolePermissions, saving, onSelectRole, onTogglePermission, onSave }) {
  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Left: Roles List */}
      <div className="col-span-4 space-y-2">
        <h2 className="text-sm font-bold text-gray-700 px-2">Danh sách vai trò</h2>
        {roles.map(role => {
          const isSelected = selectedRole?.id === role.id;
          return (
            <button
              key={role.id}
              onClick={() => onSelectRole(role.id)}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                isSelected
                  ? 'border-purple-500 bg-purple-50 shadow-sm'
                  : 'border-gray-200 hover:border-purple-300 bg-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <Shield className={`h-4 w-4 ${isSelected ? 'text-purple-600' : 'text-gray-400'}`} />
                <span className="font-bold text-sm text-gray-900">{role.name}</span>
                {role.is_system && (
                  <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full ml-auto">
                    Hệ thống
                  </span>
                )}
              </div>
              {role.description && (
                <p className="text-xs text-gray-500 mt-1">{role.description}</p>
              )}
              <p className="text-[10px] text-gray-400 mt-1">
                {role.role_permissions?.[0]?.count || 0} quyền
              </p>
            </button>
          );
        })}
      </div>

      {/* Right: Permissions Grid */}
      <div className="col-span-8 bg-white rounded-xl border p-4">
        {selectedRole ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-gray-900">
                  Phân quyền cho: {selectedRole.name}
                </h2>
                <p className="text-xs text-gray-500">
                  {rolePermissions.length}/{permissions.permissions.length} quyền đã bật
                </p>
              </div>
              <button
                onClick={onSave}
                disabled={saving || selectedRole.is_system}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-purple-700 disabled:bg-gray-300"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>

            {selectedRole.is_system && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-xs text-blue-800">
                  ℹ️ <strong>Vai trò hệ thống</strong> - không thể chỉnh sửa quyền hạn
                </p>
              </div>
            )}

            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {Object.entries(permissions.grouped).map(([resource, perms]) => (
                <div key={resource} className="border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-gradient-to-r from-purple-50 to-blue-50 border-b">
                    <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                      <span className="text-base">{getResourceIcon(resource)}</span>
                      {RESOURCE_LABELS[resource] || resource}
                    </h3>
                  </div>
                  <div className="p-2 space-y-1">
                    {perms.map(perm => {
                      const isGranted = rolePermissions.some(rp => rp.id === perm.id);
                      const permKey = `${perm.resource}:${perm.action}`;
                      const label = ACTION_LABELS[perm.action] || perm.action;
                      const desc = PERMISSION_DESCRIPTIONS[permKey] || perm.description;
                      
                      return (
                        <button
                          key={perm.id}
                          onClick={() => !selectedRole.is_system && onTogglePermission(perm.id)}
                          disabled={selectedRole.is_system}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                            isGranted
                              ? 'bg-green-50 border-2 border-green-400'
                              : 'bg-gray-50 border border-gray-200 hover:border-gray-300'
                          } ${selectedRole.is_system ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                        >
                          <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                            isGranted ? 'bg-green-600' : 'bg-gray-300'
                          }`}>
                            {isGranted ? <Check className="h-3 w-3 text-white" /> : <X className="h-3 w-3 text-gray-500" />}
                          </div>
                          <div className="flex-1 text-left">
                            <span className="text-sm font-bold text-gray-900">{label}</span>
                            {desc && (
                              <p className="text-xs text-gray-600 mt-0.5">{desc}</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <Shield className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">Chọn vai trò để xem và chỉnh sửa quyền hạn</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Users Assignment Tab
function UsersTab({ 
  users, 
  loading, 
  onUserClick, 
  divisions, 
  companies, 
  departments,
  filterDivision,
  filterCompany,
  filterDept,
  onFilterDivision,
  onFilterCompany,
  onFilterDept,
}) {
  const [search, setSearch] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [showBulkAssign, setShowBulkAssign] = useState(false);

  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleUser = (userId) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const selectAll = () => {
    if (selectedUsers.length === filteredUsers.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(filteredUsers.map(u => u.id));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-purple-200 border-t-purple-600 rounded-full" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Info box */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <p className="text-sm text-purple-900">
            💡 <strong>Phân quyền phân cấp hệ sinh thái:</strong> Click vào nhân viên để gán vai trò với phạm vi 
            (Toàn hệ thống, Khối, Công ty, Phòng ban, Team). Vai trò gán ở cấp cao hơn sẽ bao gồm tất cả cấp con.
          </p>
        </div>

        {/* Filters: Division + Company + Department */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Division */}
          <div className="flex items-center gap-2 bg-white border rounded-lg px-3 h-10">
            <Layers className="h-4 w-4 text-gray-400 shrink-0" />
            <select 
              value={filterDivision} 
              onChange={e => {
                onFilterDivision(e.target.value);
                onFilterCompany(''); // Reset company
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
          <div className="flex items-center gap-2 bg-white border rounded-lg px-3 h-10">
            <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
            <select 
              value={filterCompany} 
              onChange={e => onFilterCompany(e.target.value)} 
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
          <div className="flex items-center gap-2 bg-white border rounded-lg px-3 h-10">
            <UsersRound className="h-4 w-4 text-gray-400 shrink-0" />
            <select 
              value={filterDept} 
              onChange={e => onFilterDept(e.target.value)} 
              className="flex-1 text-sm outline-none bg-transparent"
            >
              <option value="">Tất cả phòng ban</option>
              {departments
                .filter(d => !filterCompany || d.company_id === filterCompany)
                .map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))
              }
            </select>
          </div>
        </div>

        {/* Active Filters */}
        {(filterDivision || filterCompany || filterDept) && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">Đang lọc:</span>
            {filterDivision && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full flex items-center gap-1">
                Khối: {divisions.find(d => d.id === filterDivision)?.name}
                <button onClick={() => onFilterDivision('')} className="hover:text-purple-900">×</button>
              </span>
            )}
            {filterCompany && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full flex items-center gap-1">
                Cty: {companies.find(c => c.id === filterCompany)?.name}
                <button onClick={() => onFilterCompany('')} className="hover:text-blue-900">×</button>
              </span>
            )}
            {filterDept && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full flex items-center gap-1">
                PB: {departments.find(d => d.id === filterDept)?.name}
                <button onClick={() => onFilterDept('')} className="hover:text-green-900">×</button>
              </span>
            )}
            <button 
              onClick={() => {
                onFilterDivision('');
                onFilterCompany('');
                onFilterDept('');
              }}
              className="text-xs text-red-600 hover:text-red-800 font-medium"
            >
              Xóa tất cả
            </button>
          </div>
        )}

        {/* Search + Bulk Actions */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Tìm nhân viên (tên, email)..."
              className="w-full h-10 px-4 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          
          {selectedUsers.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">
                {selectedUsers.length} nhân viên đã chọn
              </span>
              <button
                onClick={() => setShowBulkAssign(true)}
                className="h-10 px-4 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center gap-2"
              >
                <Shield className="h-4 w-4" />
                Gán vai trò hàng loạt
              </button>
              <button
                onClick={() => setSelectedUsers([])}
                className="h-10 px-3 border rounded-lg text-sm hover:bg-gray-50"
              >
                Bỏ chọn
              </button>
            </div>
          )}
          
          <button
            onClick={selectAll}
            className="h-10 px-3 border rounded-lg text-sm hover:bg-gray-50"
          >
            {selectedUsers.length === filteredUsers.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
          </button>
        </div>

        {/* Users Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredUsers.map(user => {
            const isSelected = selectedUsers.includes(user.id);
            return (
              <div
                key={user.id}
                className={`relative flex items-center gap-3 p-3 bg-white border rounded-lg transition-all ${
                  isSelected ? 'border-purple-500 bg-purple-50' : 'hover:border-purple-400 hover:shadow-sm'
                }`}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleUser(user.id)}
                  onClick={e => e.stopPropagation()}
                  className="w-4 h-4 accent-purple-600 shrink-0"
                />
                
                {/* User Info - Clickable */}
                <button
                  onClick={() => onUserClick(user)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm shrink-0">
                    {user.full_name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{user.full_name}</p>
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    {user.department?.name && (
                      <p className="text-xs text-gray-400 mt-0.5">{user.department.name}</p>
                    )}
                  </div>
                  <Shield className="h-4 w-4 text-purple-400 shrink-0" />
                </button>
              </div>
            );
          })}
        </div>

        {filteredUsers.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <UsersIcon className="h-12 w-12 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Không tìm thấy nhân viên</p>
          </div>
        )}
      </div>
      
      {/* Bulk Assign Modal */}
      {showBulkAssign && (
        <BulkRoleAssignModal
          userIds={selectedUsers}
          users={users.filter(u => selectedUsers.includes(u.id))}
          onClose={() => setShowBulkAssign(false)}
          onSaved={() => {
            setShowBulkAssign(false);
            setSelectedUsers([]);
          }}
        />
      )}
    </>
  );
}

// Helper function to get icon for each resource
function getResourceIcon(resource) {
  const icons = {
    projects: '📁',
    workflows: '🔀',
    templates: '📋',
    users: '👥',
    ecosystem: '🏢',
    reports: '📊',
    settings: '⚙️',
  };
  return icons[resource] || '📦';
}

function CreateRoleModal({ onClose, onSaved }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return alert('Nhập tên vai trò');
    setSaving(true);
    try {
      await api.post('/permissions/roles', { name: name.trim(), description: description.trim() });
      onSaved();
    } catch (e) {
      alert('Lỗi: ' + (e.response?.data?.error || e.message));
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-md w-full">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Tạo vai trò mới</h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Tên vai trò *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="VD: Kế toán, Giám sát..."
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Mô tả</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Mô tả vai trò và trách nhiệm..."
              rows={3}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
          >
            Hủy
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:bg-gray-300"
          >
            {saving ? 'Đang tạo...' : 'Tạo vai trò'}
          </button>
        </div>
      </div>
    </div>
  );
}


// Bulk Role Assignment Modal
function BulkRoleAssignModal({ userIds, users, onClose, onSaved }) {
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState("");
  const [ecosystemUnits, setEcosystemUnits] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const LEVEL_LABELS = { 0: "Tập đoàn", 1: "Khối", 2: "Công ty", 3: "Phòng ban", 4: "Đội nhóm" };
  const LEVEL_ICONS = { 0: "🏢", 1: "📦", 2: "🏭", 3: "👥", 4: "⚡" };

  useEffect(() => {
    Promise.all([
      api.get("/permissions/roles"),
      api.get("/ecosystem/units"),
    ]).then(([rolesRes, unitsRes]) => {
      setRoles(rolesRes.data.roles || []);
      setEcosystemUnits(unitsRes.data.units || []);
    }).finally(() => setLoading(false));
  }, []);

  const unitsByLevel = {};
  ecosystemUnits.forEach(u => {
    const level = u.level || 0;
    if (!unitsByLevel[level]) unitsByLevel[level] = [];
    unitsByLevel[level].push(u);
  });

  const currentLevelUnits = selectedLevel ? (unitsByLevel[selectedLevel] || []) : [];

  const handleAssign = async () => {
    if (!selectedRole) return alert("Chọn vai trò");
    if (selectedLevel && !selectedUnit) return alert("Chọn đơn vị");

    setSaving(true);
    try {
      const promises = userIds.map(userId =>
        api.post(`/permissions/users/${userId}/roles`, {
          role_id: selectedRole,
          ecosystem_unit_id: selectedUnit || null,
        })
      );
      await Promise.all(promises);
      alert(`✅ Đã gán vai trò cho ${userIds.length} nhân viên`);
      onSaved();
    } catch (e) {
      alert("Lỗi: " + (e.response?.data?.error || e.message));
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl p-6 max-w-2xl w-full my-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Shield className="h-5 w-5 text-purple-600" />
              Gán vai trò hàng loạt
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {userIds.length} nhân viên được chọn
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin h-8 w-8 border-4 border-purple-200 border-t-purple-600 rounded-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Selected Users Preview */}
            <div className="bg-gray-50 rounded-lg p-3 max-h-32 overflow-y-auto">
              <p className="text-xs font-bold text-gray-700 mb-2">Nhân viên được chọn:</p>
              <div className="flex flex-wrap gap-2">
                {users.map(u => (
                  <span key={u.id} className="text-xs bg-white px-2 py-1 rounded border">
                    {u.full_name}
                  </span>
                ))}
              </div>
            </div>

            {/* Role Selection */}
            <div>
              <label className="text-sm font-bold text-gray-700 block mb-2">Chọn vai trò *</label>
              <select
                value={selectedRole}
                onChange={e => setSelectedRole(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">-- Chọn vai trò --</option>
                {roles.map(r => (
                  <option key={r.id} value={r.id}>{r.name} {r.description ? `(${r.description})` : ""}</option>
                ))}
              </select>
            </div>

            {/* Level Selection */}
            <div>
              <label className="text-sm font-bold text-gray-700 block mb-2">Cấp độ phân quyền</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => { setSelectedLevel(""); setSelectedUnit(""); }}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    selectedLevel === "" 
                      ? "bg-indigo-600 text-white border-indigo-600" 
                      : "bg-white border-gray-300 text-gray-700 hover:border-indigo-400"
                  }`}
                >
                  🌐 Toàn hệ thống
                </button>
                {Object.keys(unitsByLevel).sort((a, b) => +a - +b).map(level => (
                  <button
                    key={level}
                    onClick={() => { setSelectedLevel(level); setSelectedUnit(""); }}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      selectedLevel === level 
                        ? "bg-purple-600 text-white border-purple-600" 
                        : "bg-white border-gray-300 text-gray-700 hover:border-purple-400"
                    }`}
                  >
                    {LEVEL_ICONS[level]} {LEVEL_LABELS[level]}
                  </button>
                ))}
              </div>
            </div>

            {/* Unit Selection */}
            {selectedLevel && (
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-2">
                  Chọn {LEVEL_LABELS[selectedLevel]} *
                </label>
                <select
                  value={selectedUnit}
                  onChange={e => setSelectedUnit(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">-- Chọn {LEVEL_LABELS[selectedLevel]} --</option>
                  {currentLevelUnits.map(unit => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name} {unit.short_name ? `(${unit.short_name})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Summary */}
            {selectedRole && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800">
                  <strong>Xác nhận:</strong> Gán vai trò "{roles.find(r => r.id === selectedRole)?.name}" cho {userIds.length} nhân viên
                  {selectedLevel === "" && " (Toàn hệ thống)"}
                  {selectedUnit && ` (${LEVEL_LABELS[selectedLevel]}: ${currentLevelUnits.find(u => u.id === selectedUnit)?.name})`}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                onClick={handleAssign}
                disabled={!selectedRole || (selectedLevel && !selectedUnit) || saving}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:bg-gray-300"
              >
                {saving ? "Đang gán..." : `Gán vai trò cho ${userIds.length} người`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
