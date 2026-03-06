import { useState, useEffect } from 'react';
import { Shield, Plus, Check, X, ChevronRight, ChevronDown, Users, AlertCircle } from 'lucide-react';
import api from '../lib/api';

const LEVEL_LABELS = { 0: 'Tập đoàn', 1: 'Khối', 2: 'Công ty', 3: 'Phòng ban', 4: 'Đội nhóm' };
const LEVEL_ICONS = { 0: '🏢', 1: '📦', 2: '🏭', 3: '👥', 4: '⚡' };

// Vai trò TRONG hệ sinh thái (position-based roles)
const POSITION_ROLES = [
  { id: 'director', name: 'Giám đốc', level: 'high', color: 'red' },
  { id: 'manager', name: 'Quản lý', level: 'medium', color: 'purple' },
  { id: 'supervisor', name: 'Giám sát', level: 'medium', color: 'blue' },
  { id: 'leader', name: 'Trưởng nhóm', level: 'medium', color: 'indigo' },
  { id: 'employee', name: 'Nhân viên', level: 'low', color: 'green' },
  { id: 'support', name: 'Hỗ trợ', level: 'low', color: 'gray' },
];

export default function EcosystemPermissionsTab({ users: allUsers }) {
  const [ecosystemUnits, setEcosystemUnits] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [roles, setRoles] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [selectedPositionRole, setSelectedPositionRole] = useState(null); // NEW
  const [unitPermissions, setUnitPermissions] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedUnits, setExpandedUnits] = useState({});
  const [showAddUser, setShowAddUser] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [unitsRes, permsRes, rolesRes] = await Promise.all([
        api.get('/ecosystem/units'),
        api.get('/permissions/permissions'),
        api.get('/permissions/roles'),
      ]);
      
      setEcosystemUnits(unitsRes.data.units || []);
      setPermissions(permsRes.data.permissions || []);
      setRoles(rolesRes.data.roles || []);
    } catch (e) {
      console.error('Load data error:', e);
    }
    setLoading(false);
  };

  const loadUnitPermissions = async (unitId) => {
    try {
      const { data } = await api.get(`/permissions/ecosystem-units/${unitId}/permissions`);
      setUnitPermissions(data.permissions || []);
      setSelectedUnit(ecosystemUnits.find(u => u.id === unitId));
      setSelectedUsers([]);
      setSelectedPositionRole(null); // Reset position role
    } catch (e) {
      console.error('Load unit permissions error:', e);
      setUnitPermissions([]);
      setSelectedUnit(ecosystemUnits.find(u => u.id === unitId));
    }
  };

  const toggleExpand = (unitId) => {
    setExpandedUnits(prev => ({ ...prev, [unitId]: !prev[unitId] }));
  };

  const buildTree = (parentId = null) => {
    return ecosystemUnits
      .filter(u => u.parent_id === parentId)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  };

  const renderUnit = (unit, depth = 0) => {
    const children = buildTree(unit.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedUnits[unit.id];
    const isSelected = selectedUnit?.id === unit.id;
    const icon = LEVEL_ICONS[unit.level] || '📦';

    return (
      <div key={unit.id}>
        <button
          onClick={() => {
            if (hasChildren) toggleExpand(unit.id);
            loadUnitPermissions(unit.id);
          }}
          className={`w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-purple-50 rounded transition-colors ${
            isSelected ? 'bg-purple-100 border-l-2 border-purple-600' : ''
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" /> : <ChevronRight className="h-3 w-3 text-gray-400 shrink-0" />
          ) : <div className="w-3" />}
          
          <span className="text-sm shrink-0">{icon}</span>
          <span className="flex-1 text-xs font-medium text-gray-900 truncate">{unit.name}</span>
        </button>
        
        {hasChildren && isExpanded && (
          <div>{children.map(child => renderUnit(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  const unitUsers = unitPermissions.reduce((acc, up) => {
    if (!acc.find(u => u.user_id === up.user_id)) {
      const user = allUsers.find(u => u.id === up.user_id);
      if (user) {
        acc.push({ user_id: up.user_id, user_name: user.full_name, email: user.email });
      }
    }
    return acc;
  }, []);

  const toggleUserSelection = (userId) => {
    setSelectedUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const selectAllUsers = () => {
    if (selectedUsers.length === unitUsers.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(unitUsers.map(u => u.user_id));
    }
  };

  // Get allowed permissions based on unit level and position role
  const getAllowedPermissions = () => {
    if (!selectedUnit || !selectedPositionRole) return [];

    const unitLevel = selectedUnit.level;
    const positionLevel = POSITION_ROLES.find(r => r.id === selectedPositionRole)?.level;

    // Filter permissions based on hierarchical rules
    return permissions.filter(perm => {
      // Ecosystem permissions: only allow for current level or below
      if (perm.resource === 'ecosystem') {
        // Giám đốc/Quản lý: có thể CRUD cấp hiện tại và cấp dưới
        if (positionLevel === 'high' || positionLevel === 'medium') {
          return ['view', 'create', 'edit'].includes(perm.action); // Không cho delete
        }
        // Nhân viên: chỉ xem
        return perm.action === 'view';
      }

      // Projects: depends on position
      if (perm.resource === 'projects') {
        if (positionLevel === 'high') return true; // All permissions
        if (positionLevel === 'medium') return perm.action !== 'all_companies'; // No cross-company
        return ['view'].includes(perm.action); // Employee: view only
      }

      // Users: cannot manage higher levels
      if (perm.resource === 'users') {
        if (positionLevel === 'high') return true;
        if (positionLevel === 'medium') return perm.action !== 'delete';
        return perm.action === 'view';
      }

      // Other resources
      return true;
    });
  };

  const bulkTogglePermission = async (permissionId, grant) => {
    if (selectedUsers.length === 0 || !selectedUnit || !selectedPositionRole) return;
    
    setSaving(true);
    try {
      await Promise.all(
        selectedUsers.map(userId =>
          api.post('/permissions/users/custom-permission', {
            user_id: userId,
            permission_id: permissionId,
            ecosystem_unit_id: selectedUnit.id,
            position_role: selectedPositionRole, // Save position role
            granted: grant,
          })
        )
      );
      await loadUnitPermissions(selectedUnit.id);
      alert(`✅ Đã ${grant ? 'bật' : 'tắt'} quyền cho ${selectedUsers.length} nhân viên`);
    } catch (e) {
      alert('Lỗi: ' + (e.response?.data?.error || e.message));
    }
    setSaving(false);
  };

  const allowedPermissions = getAllowedPermissions();
  const groupedPermissions = {};
  allowedPermissions.forEach(p => {
    if (!groupedPermissions[p.resource]) groupedPermissions[p.resource] = [];
    groupedPermissions[p.resource].push(p);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-purple-200 border-t-purple-600 rounded-full" />
      </div>
    );
  }

  const rootUnits = buildTree(null);
  const selectedPosition = POSITION_ROLES.find(r => r.id === selectedPositionRole);

  return (
    <div className="space-y-4">
      {/* Info */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-purple-200 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-xs text-gray-800">
            <p className="font-bold mb-1">💡 Workflow phân quyền theo hệ sinh thái:</p>
            <ol className="list-decimal ml-4 space-y-0.5">
              <li>Chọn đơn vị (Khối/Công ty/Phòng ban/Team)</li>
              <li>Chọn vai trò TRONG đơn vị (Giám đốc/Quản lý/Nhân viên...)</li>
              <li>Chọn nhân viên cần gán vai trò đó</li>
              <li>Bật/tắt quyền phù hợp với vai trò (hệ thống tự lọc quyền hợp lệ)</li>
            </ol>
            <p className="mt-2 text-red-600 font-medium">⚠️ Bảo vệ phân cấp: Cấp dưới KHÔNG thể CRUD cấp trên!</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Left: Tree */}
        <div className="col-span-3 bg-white rounded-lg border p-3 max-h-[600px] overflow-y-auto">
          <h3 className="text-xs font-bold text-gray-700 mb-2">Cây đơn vị</h3>
          <div className="space-y-0.5">
            {rootUnits.map(unit => renderUnit(unit))}
          </div>
        </div>

        {/* Right: Position Roles + Users + Permissions */}
        <div className="col-span-9 bg-white rounded-lg border p-4">
          {selectedUnit ? (
            <div className="space-y-3">
              {/* Header */}
              <div className="pb-2 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <span>{LEVEL_ICONS[selectedUnit.level]}</span>
                      {selectedUnit.name}
                    </h3>
                    <p className="text-xs text-gray-500">{LEVEL_LABELS[selectedUnit.level]} • {unitUsers.length} nhân viên</p>
                  </div>
                  <button
                    onClick={() => setShowAddUser(true)}
                    className="text-xs px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                  >
                    <Plus className="h-3 w-3 inline mr-1" /> Gán nhân viên
                  </button>
                </div>
              </div>

              {/* Step 1: Select Position Role */}
              <div>
                <h4 className="text-xs font-bold text-gray-700 mb-2">
                  Bước 1: Chọn vai trò trong {selectedUnit.name}
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  {POSITION_ROLES.map(role => {
                    const isSelected = selectedPositionRole === role.id;
                    const colorClasses = {
                      red: 'border-red-500 bg-red-50 text-red-700',
                      purple: 'border-purple-500 bg-purple-50 text-purple-700',
                      blue: 'border-blue-500 bg-blue-50 text-blue-700',
                      indigo: 'border-indigo-500 bg-indigo-50 text-indigo-700',
                      green: 'border-green-500 bg-green-50 text-green-700',
                      gray: 'border-gray-500 bg-gray-50 text-gray-700',
                    };
                    const colorClass = colorClasses[role.color] || colorClasses.gray;
                    
                    return (
                      <button
                        key={role.id}
                        onClick={() => {
                          setSelectedPositionRole(role.id);
                          setSelectedUsers([]); // Reset selection
                        }}
                        className={`px-3 py-2 rounded-lg border-2 text-xs font-medium transition-all ${
                          isSelected ? colorClass : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {role.name}
                      </button>
                    );
                  })}
                </div>
                {selectedPosition && (
                  <p className="text-xs text-gray-500 mt-2 italic">
                    Đã chọn: <strong>{selectedPosition.name}</strong> - Quyền hạn được lọc tự động theo cấp bậc
                  </p>
                )}
              </div>

              {selectedPositionRole && (
                <>
                  {/* Step 2: Select Users */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold text-gray-700">
                        Bước 2: Chọn nhân viên làm {selectedPosition.name}
                      </h4>
                      {unitUsers.length > 0 && (
                        <button
                          onClick={selectAllUsers}
                          className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                        >
                          {selectedUsers.length === unitUsers.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                        </button>
                      )}
                    </div>
                    
                    {unitUsers.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">Chưa có nhân viên. Click "Gán nhân viên" để thêm.</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {unitUsers.map(u => {
                          const isSelected = selectedUsers.includes(u.user_id);
                          return (
                            <label
                              key={u.user_id}
                              className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer transition-colors ${
                                isSelected ? `border-${selectedPosition.color}-500 bg-${selectedPosition.color}-50` : 'border-gray-200 hover:border-purple-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleUserSelection(u.user_id)}
                                className="w-3 h-3 accent-purple-600"
                              />
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                isSelected ? `bg-${selectedPosition.color}-200 text-${selectedPosition.color}-800` : 'bg-purple-100 text-purple-700'
                              }`}>
                                {u.user_name?.charAt(0)?.toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-900 truncate">{u.user_name}</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Step 3: Permissions */}
                  {selectedUsers.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-gray-700 mb-2">
                        Bước 3: Bật/tắt quyền cho {selectedUsers.length} {selectedPosition.name} đã chọn
                      </h4>
                      
                      {Object.keys(groupedPermissions).length === 0 ? (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <p className="text-xs text-yellow-800">
                            ⚠️ Vai trò <strong>{selectedPosition.name}</strong> trong <strong>{LEVEL_LABELS[selectedUnit.level]}</strong> không có quyền nào khả dụng.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                          {Object.entries(groupedPermissions).map(([resource, perms]) => (
                            <div key={resource} className="border rounded">
                              <div className="px-2 py-1 bg-gray-100 border-b">
                                <h5 className="text-xs font-bold text-gray-800 uppercase">{resource}</h5>
                              </div>
                              <div className="p-1 grid grid-cols-2 gap-1">
                                {perms.map(perm => (
                                  <div key={perm.id} className="flex items-center gap-1">
                                    <button
                                      onClick={() => bulkTogglePermission(perm.id, true)}
                                      disabled={saving}
                                      className="flex-1 px-2 py-1 bg-green-50 border border-green-300 rounded text-xs hover:bg-green-100 disabled:opacity-50 flex items-center justify-center gap-1"
                                    >
                                      <Check className="h-3 w-3" />
                                      {perm.action}
                                    </button>
                                    <button
                                      onClick={() => bulkTogglePermission(perm.id, false)}
                                      disabled={saving}
                                      className="flex-1 px-2 py-1 bg-red-50 border border-red-300 rounded text-xs hover:bg-red-100 disabled:opacity-50 flex items-center justify-center gap-1"
                                    >
                                      <X className="h-3 w-3" />
                                      {perm.action}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Users className="h-12 w-12 mb-2 opacity-30" />
              <p className="text-sm">Chọn đơn vị để bắt đầu phân quyền</p>
            </div>
          )}
        </div>
      </div>

      {/* Add User Modal */}
      {showAddUser && selectedUnit && (
        <AddUserModal
          unit={selectedUnit}
          users={allUsers}
          existingUserIds={unitUsers.map(u => u.user_id)}
          onClose={() => setShowAddUser(false)}
          onSaved={() => {
            setShowAddUser(false);
            loadUnitPermissions(selectedUnit.id);
          }}
        />
      )}
    </div>
  );
}

function AddUserModal({ unit, users, existingUserIds, onClose, onSaved }) {
  const [selectedUser, setSelectedUser] = useState('');
  const [saving, setSaving] = useState(false);

  const availableUsers = users.filter(u => !existingUserIds.includes(u.id));

  const handleAdd = async () => {
    if (!selectedUser) return alert('Chọn nhân viên');
    
    setSaving(true);
    try {
      await api.post('/ecosystem/units/members', {
        unit_id: unit.id,
        user_id: selectedUser,
      });
      onSaved();
    } catch (e) {
      alert('Lỗi: ' + (e.response?.data?.error || e.message));
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-4 max-w-md w-full">
        <h3 className="text-sm font-bold mb-3">Gán nhân viên vào {unit.name}</h3>
        <select
          value={selectedUser}
          onChange={e => setSelectedUser(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg text-sm mb-3"
        >
          <option value="">-- Chọn nhân viên --</option>
          {availableUsers.map(u => (
            <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
          ))}
        </select>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
            Hủy
          </button>
          <button
            onClick={handleAdd}
            disabled={!selectedUser || saving}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:bg-gray-300"
          >
            {saving ? 'Đang thêm...' : 'Thêm'}
          </button>
        </div>
      </div>
    </div>
  );
}
