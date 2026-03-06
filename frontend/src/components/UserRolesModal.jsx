import { useState, useEffect } from 'react';
import { Shield, Plus, X, Building2 } from 'lucide-react';
import api from '../lib/api';

export default function UserRolesModal({ userId, userName, onClose, onSaved }) {
  const [roles, setRoles] = useState([]);
  const [userRoles, setUserRoles] = useState([]);
  const [ecosystemUnits, setEcosystemUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [rolesRes, userRolesRes, unitsRes] = await Promise.all([
        api.get('/permissions/roles'),
        api.get(`/permissions/users/${userId}/roles`),
        api.get('/ecosystem/units'), // Get all ecosystem units for scope selection
      ]);
      
      setRoles(rolesRes.data.roles || []);
      setUserRoles(userRolesRes.data.user_roles || []);
      setEcosystemUnits(unitsRes.data.units || []);
    } catch (e) {
      console.error('Load user roles error:', e);
    }
    setLoading(false);
  };

  const assignRole = async (roleId, ecosystemUnitId = null) => {
    setSaving(true);
    try {
      await api.post(`/permissions/users/${userId}/roles`, {
        role_id: roleId,
        ecosystem_unit_id: ecosystemUnitId,
        granted_by: null, // TODO: pass current user ID
      });
      await load();
    } catch (e) {
      alert('Lỗi: ' + (e.response?.data?.error || e.message));
    }
    setSaving(false);
  };

  const removeRole = async (userRoleId) => {
    if (!confirm('Xóa role này?')) return;
    setSaving(true);
    try {
      await api.delete(`/permissions/user-roles/${userRoleId}`);
      await load();
    } catch (e) {
      alert('Lỗi: ' + (e.response?.data?.error || e.message));
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-6 max-w-2xl w-full">
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin h-8 w-8 border-4 border-purple-200 border-t-purple-600 rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Shield className="h-5 w-5 text-purple-600" />
              Phân Quyền: {userName}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Gán roles và giới hạn phạm vi (ecosystem unit)
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Current Roles */}
        <div className="mb-6">
          <h3 className="text-sm font-bold text-gray-700 mb-2">Roles hiện tại</h3>
          {userRoles.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Chưa có role nào</p>
          ) : (
            <div className="space-y-2">
              {userRoles.map(ur => (
                <div key={ur.id} className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <Shield className="h-4 w-4 text-purple-600" />
                    <div>
                      <span className="text-sm font-bold text-gray-900">{ur.role?.name}</span>
                      {ur.ecosystem_unit && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Building2 className="h-3 w-3 text-gray-400" />
                          <span className="text-xs text-gray-500">{ur.ecosystem_unit.name}</span>
                        </div>
                      )}
                      {!ur.ecosystem_unit && (
                        <span className="text-xs text-gray-400">Toàn hệ thống</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => removeRole(ur.id)}
                    disabled={saving}
                    className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50"
                  >
                    Xóa
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Role */}
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-2">Thêm role mới</h3>
          <div className="space-y-2">
            {roles.map(role => (
              <RoleAssignRow
                key={role.id}
                role={role}
                ecosystemUnits={ecosystemUnits}
                onAssign={(unitId) => assignRole(role.id, unitId)}
                disabled={saving}
              />
            ))}
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

function RoleAssignRow({ role, ecosystemUnits, onAssign, disabled }) {
  const [selectedUnit, setSelectedUnit] = useState('');
  const [expanded, setExpanded] = useState(false);

  const handleAssign = () => {
    onAssign(selectedUnit || null);
    setSelectedUnit('');
    setExpanded(false);
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        disabled={disabled}
        className="w-full flex items-center gap-3 px-3 py-2 border border-gray-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-colors disabled:opacity-50"
      >
        <Plus className="h-4 w-4 text-purple-600" />
        <span className="text-sm font-medium text-gray-700">{role.name}</span>
        {role.description && (
          <span className="text-xs text-gray-400 ml-auto">{role.description}</span>
        )}
      </button>
    );
  }

  return (
    <div className="border border-purple-300 rounded-lg p-3 bg-purple-50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-gray-900">{role.name}</span>
        <button
          onClick={() => setExpanded(false)}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      
      <div className="space-y-2">
        <div>
          <label className="text-xs text-gray-600 block mb-1">Phạm vi áp dụng (tùy chọn)</label>
          <select
            value={selectedUnit}
            onChange={e => setSelectedUnit(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
          >
            <option value="">Toàn hệ thống</option>
            {ecosystemUnits.map(unit => (
              <option key={unit.id} value={unit.id}>
                {unit.name} ({unit.short_name || 'N/A'})
              </option>
            ))}
          </select>
        </div>
        
        <button
          onClick={handleAssign}
          disabled={disabled}
          className="w-full px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:bg-gray-300"
        >
          Gán role
        </button>
      </div>
    </div>
  );
}
