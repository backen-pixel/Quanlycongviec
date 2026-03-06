import { useState, useEffect } from 'react';
import { Shield, Plus, X, Building2, Layers, Users } from 'lucide-react';
import api from '../lib/api';

const LEVEL_LABELS = {
  0: 'Tập đoàn',
  1: 'Khối',
  2: 'Công ty',
  3: 'Phòng ban',
  4: 'Đội nhóm',
};

const LEVEL_ICONS = {
  0: '🏢',
  1: '📦',
  2: '🏭',
  3: '👥',
  4: '⚡',
};

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
        api.get('/ecosystem/units'), // Get all ecosystem units
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
        granted_by: null,
      });
      await load();
    } catch (e) {
      alert('Lỗi: ' + (e.response?.data?.error || e.message));
    }
    setSaving(false);
  };

  const removeRole = async (userRoleId) => {
    if (!confirm('Xóa vai trò này?')) return;
    setSaving(true);
    try {
      await api.delete(`/permissions/user-roles/${userRoleId}`);
      await load();
    } catch (e) {
      alert('Lỗi: ' + (e.response?.data?.error || e.message));
    }
    setSaving(false);
  };

  // Group units by level for better UX
  const unitsByLevel = {};
  ecosystemUnits.forEach(u => {
    const level = u.level || 0;
    if (!unitsByLevel[level]) unitsByLevel[level] = [];
    unitsByLevel[level].push(u);
  });

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-6 max-w-3xl w-full">
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin h-8 w-8 border-4 border-purple-200 border-t-purple-600 rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl p-6 max-w-3xl w-full my-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Shield className="h-5 w-5 text-purple-600" />
              Phân quyền: {userName}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Gán vai trò và phạm vi hệ sinh thái (Khối → Công ty → Phòng ban → Team)
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Info box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <p className="text-xs text-blue-800">
            💡 <strong>Phân quyền phân cấp:</strong> Gán vai trò ở cấp <strong>Khối</strong> → có quyền trên tất cả Công ty/PB/Team thuộc Khối đó.
            Gán ở cấp <strong>Công ty</strong> → có quyền trên PB/Team thuộc Công ty. Để toàn quyền → chọn "Toàn hệ thống".
          </p>
        </div>

        {/* Current Roles */}
        <div className="mb-6">
          <h3 className="text-sm font-bold text-gray-700 mb-2">Vai trò hiện tại</h3>
          {userRoles.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Chưa có vai trò nào</p>
          ) : (
            <div className="space-y-2">
              {userRoles.map(ur => {
                const unit = ur.ecosystem_unit;
                const levelLabel = unit ? LEVEL_LABELS[unit.level] || 'Cấp ' + unit.level : null;
                const icon = unit ? LEVEL_ICONS[unit.level] : '🌐';
                
                return (
                  <div key={ur.id} className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <Shield className="h-4 w-4 text-purple-600 shrink-0" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-900">{ur.role?.name}</span>
                          {ur.role?.is_system && (
                            <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                              Hệ thống
                            </span>
                          )}
                        </div>
                        {unit ? (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs">{icon}</span>
                            <span className="text-xs text-purple-700 font-medium">{levelLabel}</span>
                            <span className="text-xs text-gray-500">→</span>
                            <span className="text-xs text-gray-600">{unit.name}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs">🌐</span>
                            <span className="text-xs text-gray-500">Toàn hệ thống</span>
                          </div>
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
                );
              })}
            </div>
          )}
        </div>

        {/* Add Role */}
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-2">Thêm vai trò mới</h3>
          <div className="space-y-2">
            {roles.map(role => (
              <RoleAssignRow
                key={role.id}
                role={role}
                unitsByLevel={unitsByLevel}
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

function RoleAssignRow({ role, unitsByLevel, onAssign, disabled }) {
  const [selectedUnit, setSelectedUnit] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [expanded, setExpanded] = useState(false);

  const handleAssign = () => {
    onAssign(selectedUnit || null);
    setSelectedUnit('');
    setSelectedLevel('');
    setExpanded(false);
  };

  const currentLevelUnits = selectedLevel ? (unitsByLevel[selectedLevel] || []) : [];

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
        {role.is_system && (
          <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full ml-2">
            Hệ thống
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="border-2 border-purple-300 rounded-lg p-4 bg-gradient-to-r from-purple-50 to-blue-50">
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-sm font-bold text-gray-900">{role.name}</span>
          {role.description && (
            <p className="text-xs text-gray-500 mt-0.5">{role.description}</p>
          )}
        </div>
        <button
          onClick={() => setExpanded(false)}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      
      <div className="space-y-3">
        {/* Level selector */}
        <div>
          <label className="text-xs font-semibold text-gray-700 block mb-1.5 flex items-center gap-1.5">
            <Layers className="h-3 w-3" />
            Cấp độ phân quyền
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => { setSelectedLevel(''); setSelectedUnit(''); }}
              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                selectedLevel === '' 
                  ? 'bg-indigo-600 text-white border-indigo-600' 
                  : 'bg-white border-gray-300 text-gray-700 hover:border-indigo-400'
              }`}
            >
              🌐 Toàn hệ thống
            </button>
            {Object.keys(unitsByLevel).sort((a, b) => +a - +b).map(level => (
              <button
                key={level}
                onClick={() => { setSelectedLevel(level); setSelectedUnit(''); }}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                  selectedLevel === level 
                    ? 'bg-purple-600 text-white border-purple-600' 
                    : 'bg-white border-gray-300 text-gray-700 hover:border-purple-400'
                }`}
              >
                {LEVEL_ICONS[level]} {LEVEL_LABELS[level]}
              </button>
            ))}
          </div>
        </div>

        {/* Unit selector */}
        {selectedLevel && (
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1.5 flex items-center gap-1.5">
              <Building2 className="h-3 w-3" />
              Chọn {LEVEL_LABELS[selectedLevel]}
            </label>
            <select
              value={selectedUnit}
              onChange={e => setSelectedUnit(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">-- Chọn {LEVEL_LABELS[selectedLevel]} --</option>
              {currentLevelUnits.map(unit => (
                <option key={unit.id} value={unit.id}>
                  {unit.name} {unit.short_name ? `(${unit.short_name})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Summary */}
        {(selectedLevel || selectedLevel === '') && (
          <div className="bg-white border border-purple-200 rounded-lg p-3">
            <p className="text-xs text-gray-700">
              {selectedLevel === '' ? (
                <>
                  🌐 <strong>Phạm vi:</strong> Toàn bộ hệ thống (tất cả Khối, Công ty, Phòng ban, Team)
                </>
              ) : selectedUnit ? (
                <>
                  {LEVEL_ICONS[selectedLevel]} <strong>Phạm vi:</strong>{' '}
                  {LEVEL_LABELS[selectedLevel]} "{currentLevelUnits.find(u => u.id === selectedUnit)?.name}"
                  {+selectedLevel < 4 && (
                    <span className="block mt-1 text-gray-500">
                      → Bao gồm tất cả {LEVEL_LABELS[+selectedLevel + 1]} thuộc {LEVEL_LABELS[selectedLevel]} này
                    </span>
                  )}
                </>
              ) : (
                <>
                  ⚠️ <strong>Chọn {LEVEL_LABELS[selectedLevel]}</strong> để tiếp tục
                </>
              )}
            </p>
          </div>
        )}
        
        <button
          onClick={handleAssign}
          disabled={disabled || (selectedLevel && !selectedUnit)}
          className="w-full px-4 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Gán vai trò
        </button>
      </div>
    </div>
  );
}
