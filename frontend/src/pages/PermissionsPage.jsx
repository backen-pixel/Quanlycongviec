import { useState, useEffect } from 'react';
import { Shield, Plus, Edit, Trash2, Users, Check, X, Save } from 'lucide-react';
import api from '../lib/api';

export default function PermissionsPage() {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState({ permissions: [], grouped: {} });
  const [selectedRole, setSelectedRole] = useState(null);
  const [rolePermissions, setRolePermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreateRole, setShowCreateRole] = useState(false);

  useEffect(() => {
    load();
  }, []);

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
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="h-5 w-5 text-purple-600" /> Phân Quyền Hệ Thống
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Quản lý roles và permissions - kiểm soát quyền truy cập
          </p>
        </div>
        <button
          onClick={() => setShowCreateRole(true)}
          className="h-9 px-4 bg-purple-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-purple-700"
        >
          <Plus className="h-4 w-4" /> Tạo role mới
        </button>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Left: Roles List */}
        <div className="col-span-4 space-y-2">
          <h2 className="text-sm font-bold text-gray-700 px-2">Danh sách Roles</h2>
          {roles.map(role => {
            const isSelected = selectedRole?.id === role.id;
            return (
              <button
                key={role.id}
                onClick={() => loadRolePermissions(role.id)}
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
                      System
                    </span>
                  )}
                </div>
                {role.description && (
                  <p className="text-xs text-gray-500 mt-1">{role.description}</p>
                )}
                <p className="text-[10px] text-gray-400 mt-1">
                  {role.role_permissions?.[0]?.count || 0} permissions
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
                    {rolePermissions.length}/{permissions.permissions.length} permissions đã bật
                  </p>
                </div>
                <button
                  onClick={saveRolePermissions}
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
                    ℹ️ <strong>Role hệ thống</strong> - không thể chỉnh sửa permissions
                  </p>
                </div>
              )}

              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {Object.entries(permissions.grouped).map(([resource, perms]) => (
                  <div key={resource} className="border rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-gray-100 border-b">
                      <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                        {resource}
                      </h3>
                    </div>
                    <div className="p-2 space-y-1">
                      {perms.map(perm => {
                        const isGranted = rolePermissions.some(rp => rp.id === perm.id);
                        return (
                          <button
                            key={perm.id}
                            onClick={() => !selectedRole.is_system && togglePermission(perm.id)}
                            disabled={selectedRole.is_system}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                              isGranted
                                ? 'bg-green-50 border border-green-300'
                                : 'bg-gray-50 border border-gray-200 hover:border-gray-300'
                            } ${selectedRole.is_system ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                          >
                            <div className={`w-5 h-5 rounded flex items-center justify-center ${
                              isGranted ? 'bg-green-600' : 'bg-gray-300'
                            }`}>
                              {isGranted ? <Check className="h-3 w-3 text-white" /> : <X className="h-3 w-3 text-gray-500" />}
                            </div>
                            <div className="flex-1 text-left">
                              <span className="text-sm font-medium text-gray-900">{perm.action}</span>
                              {perm.description && (
                                <p className="text-xs text-gray-500">{perm.description}</p>
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
              <p className="text-sm">Chọn role để xem và chỉnh sửa permissions</p>
            </div>
          )}
        </div>
      </div>

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
    </div>
  );
}

function CreateRoleModal({ onClose, onSaved }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return alert('Nhập tên role');
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
        <h2 className="text-lg font-bold text-gray-900 mb-4">Tạo Role Mới</h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Tên role *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="VD: accountant, supervisor..."
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Mô tả</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Mô tả vai trò..."
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
            {saving ? 'Đang lưu...' : 'Tạo role'}
          </button>
        </div>
      </div>
    </div>
  );
}
