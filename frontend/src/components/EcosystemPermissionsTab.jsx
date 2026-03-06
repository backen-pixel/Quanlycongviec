import { useState, useEffect } from 'react';
import { Shield, Plus, Check, X, ChevronRight, ChevronDown, Users } from 'lucide-react';
import api from '../lib/api';

const LEVEL_LABELS = { 0: 'Tập đoàn', 1: 'Khối', 2: 'Công ty', 3: 'Phòng ban', 4: 'Đội nhóm' };
const LEVEL_ICONS = { 0: '🏢', 1: '📦', 2: '🏭', 3: '👥', 4: '⚡' };

export default function EcosystemPermissionsTab({ users: allUsers }) {
  const [ecosystemUnits, setEcosystemUnits] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState(null);
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
      const [unitsRes, permsRes] = await Promise.all([
        api.get('/ecosystem/units'),
        api.get('/permissions/permissions'),
      ]);
      
      setEcosystemUnits(unitsRes.data.units || []);
      setPermissions(permsRes.data.permissions || []);
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

  const bulkTogglePermission = async (permissionId, grant) => {
    if (selectedUsers.length === 0 || !selectedUnit) return;
    
    setSaving(true);
    try {
      await Promise.all(
        selectedUsers.map(userId =>
          api.post('/permissions/users/custom-permission', {
            user_id: userId,
            permission_id: permissionId,
            ecosystem_unit_id: selectedUnit.id,
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

  const groupedPermissions = {};
  permissions.forEach(p => {
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

  return (
    <div className="space-y-4">
      {/* Info */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-purple-200 rounded-lg p-3">
        <p className="text-xs text-gray-800">
          💡 <strong>Phân quyền chi tiết:</strong> Chọn đơn vị → Chọn nhiều nhân viên → Bật/tắt quyền hàng loạt
        </p>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Left: Tree */}
        <div className="col-span-3 bg-white rounded-lg border p-3 max-h-[600px] overflow-y-auto">
          <h3 className="text-xs font-bold text-gray-700 mb-2">Cây đơn vị</h3>
          <div className="space-y-0.5">
            {rootUnits.map(unit => renderUnit(unit))}
          </div>
        </div>

        {/* Right: Users + Permissions */}
        <div className="col-span-9 bg-white rounded-lg border p-4">
          {selectedUnit ? (
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between pb-2 border-b">
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

              {/* Users */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-gray-700">Nhân viên ({unitUsers.length})</h4>
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
                  <p className="text-xs text-gray-400 italic">Chưa có nhân viên</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {unitUsers.map(u => {
                      const isSelected = selectedUsers.includes(u.user_id);
                      return (
                        <label
                          key={u.user_id}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer transition-colors ${
                            isSelected ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-purple-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleUserSelection(u.user_id)}
                            className="w-3 h-3 accent-purple-600"
                          />
                          <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-[10px] font-bold shrink-0">
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

              {/* Permissions */}
              {selectedUsers.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-gray-700 mb-2">
                    Bật/tắt quyền cho {selectedUsers.length} người đã chọn
                  </h4>
                  
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
                                className="flex-1 px-2 py-1 bg-green-50 border border-green-300 rounded text-xs hover:bg-green-100 disabled:opacity-50"
                              >
                                <Check className="h-3 w-3 inline mr-1" />
                                {perm.action}
                              </button>
                              <button
                                onClick={() => bulkTogglePermission(perm.id, false)}
                                disabled={saving}
                                className="flex-1 px-2 py-1 bg-red-50 border border-red-300 rounded text-xs hover:bg-red-100 disabled:opacity-50"
                              >
                                <X className="h-3 w-3 inline mr-1" />
                                {perm.action}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Users className="h-12 w-12 mb-2 opacity-30" />
              <p className="text-sm">Chọn đơn vị để quản lý phân quyền</p>
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
