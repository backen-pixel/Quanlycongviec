import { useState, useEffect } from 'react';
import { Shield, Plus, Check, X, Save, Users as UsersIcon, Settings } from 'lucide-react';
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
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers();
    }
  }, [activeTab]);

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

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data } = await api.get('/users');
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
function UsersTab({ users, loading, onUserClick }) {
  const [search, setSearch] = useState('');

  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-purple-200 border-t-purple-600 rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info box */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <p className="text-sm text-purple-900">
          💡 <strong>Phân quyền phân cấp hệ sinh thái:</strong> Click vào nhân viên để gán vai trò với phạm vi 
          (Toàn hệ thống, Khối, Công ty, Phòng ban, Team). Vai trò gán ở cấp cao hơn sẽ bao gồm tất cả cấp con.
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Tìm nhân viên (tên, email)..."
          className="w-full h-10 px-4 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {/* Users Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredUsers.map(user => (
          <button
            key={user.id}
            onClick={() => onUserClick(user)}
            className="flex items-center gap-3 p-3 bg-white border rounded-lg hover:border-purple-400 hover:shadow-sm transition-all text-left"
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
        ))}
      </div>

      {filteredUsers.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <UsersIcon className="h-12 w-12 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Không tìm thấy nhân viên</p>
        </div>
      )}
    </div>
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
