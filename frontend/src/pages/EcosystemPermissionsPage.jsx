import { useState, useEffect } from 'react';
import { Shield, Plus, Check, X, Building2, Layers, Users, ChevronRight, ChevronDown } from 'lucide-react';
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

export default function EcosystemPermissionsPage() {
  const [ecosystemUnits, setEcosystemUnits] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [unitPermissions, setUnitPermissions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedUnits, setExpandedUnits] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [unitsRes, permsRes, usersRes] = await Promise.all([
        api.get('/ecosystem/units'),
        api.get('/permissions/permissions'),
        api.get('/users'),
      ]);
      
      setEcosystemUnits(unitsRes.data.units || []);
      setPermissions(permsRes.data.permissions || []);
      setUsers(usersRes.data.users || []);
    } catch (e) {
      console.error('Load data error:', e);
    }
    setLoading(false);
  };

  const loadUnitPermissions = async (unitId) => {
    try {
      // Get all user_permissions for this unit
      const { data } = await api.get(`/permissions/ecosystem-units/${unitId}/permissions`);
      setUnitPermissions(data.permissions || []);
      setSelectedUnit(ecosystemUnits.find(u => u.id === unitId));
    } catch (e) {
      console.error('Load unit permissions error:', e);
      setUnitPermissions([]);
      setSelectedUnit(ecosystemUnits.find(u => u.id === unitId));
    }
  };

  const toggleExpand = (unitId) => {
    setExpandedUnits(prev => ({
      ...prev,
      [unitId]: !prev[unitId],
    }));
  };

  // Build tree structure
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
          className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-purple-50 rounded-lg transition-colors ${
            isSelected ? 'bg-purple-100 border-l-4 border-purple-600' : ''
          }`}
          style={{ paddingLeft: `${depth * 20 + 12}px` }}
        >
          {hasChildren && (
            isExpanded ? 
              <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" /> : 
              <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
          )}
          {!hasChildren && <div className="w-4" />}
          
          <span className="text-base shrink-0">{icon}</span>
          <span className="flex-1 text-sm font-medium text-gray-900 truncate">{unit.name}</span>
          <span className="text-xs text-gray-400 shrink-0">{LEVEL_LABELS[unit.level]}</span>
        </button>
        
        {hasChildren && isExpanded && (
          <div>
            {children.map(child => renderUnit(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-purple-200 border-t-purple-600 rounded-full" />
      </div>
    );
  }

  const rootUnits = buildTree(null);

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Shield className="h-5 w-5 text-purple-600" />
          Phân quyền theo hệ sinh thái
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Quản lý quyền hạn chi tiết cho từng cấp và từng đơn vị trong tổ chức
        </p>
      </div>

      {/* Info Box */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-purple-200 rounded-lg p-4">
        <p className="text-sm text-gray-800">
          💡 <strong>Phân quyền phân cấp:</strong> Chọn đơn vị (Khối/Công ty/Phòng ban/Team) → 
          Gán nhân viên vào đơn vị → Bật/tắt quyền cụ thể cho từng người.
          Ví dụ: Nhân viên A gán vào Công ty A có quyền "Xem dự án", Nhân viên B gán vào Khối A có quyền "Quản lý" tất cả.
        </p>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Left: Ecosystem Tree */}
        <div className="col-span-4 bg-white rounded-xl border p-4 max-h-[700px] overflow-y-auto">
          <h2 className="text-sm font-bold text-gray-700 mb-3">Cây hệ sinh thái</h2>
          <div className="space-y-1">
            {rootUnits.map(unit => renderUnit(unit))}
          </div>
        </div>

        {/* Right: Unit Permissions */}
        <div className="col-span-8 bg-white rounded-xl border p-4">
          {selectedUnit ? (
            <UnitPermissionsPanel
              unit={selectedUnit}
              permissions={permissions}
              unitPermissions={unitPermissions}
              users={users}
              onReload={() => loadUnitPermissions(selectedUnit.id)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Building2 className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Chọn đơn vị để quản lý phân quyền</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Unit Permissions Panel
function UnitPermissionsPanel({ unit, permissions, unitPermissions, users, onReload }) {
  const [selectedUser, setSelectedUser] = useState(null);
  const [userPermissions, setUserPermissions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);

  const icon = LEVEL_ICONS[unit.level] || '📦';
  const levelLabel = LEVEL_LABELS[unit.level] || 'Đơn vị';

  // Get users assigned to this unit
  const unitUsers = unitPermissions.reduce((acc, up) => {
    if (!acc.find(u => u.user_id === up.user_id)) {
      const user = users.find(u => u.id === up.user_id);
      if (user) {
        acc.push({
          user_id: up.user_id,
          user_name: user.full_name,
          email: user.email,
        });
      }
    }
    return acc;
  }, []);

  const handleSelectUser = (userId) => {
    setSelectedUser(userId);
    // Get permissions for this user in this unit
    const userPerms = unitPermissions.filter(up => up.user_id === userId);
    setUserPermissions(userPerms);
  };

  const togglePermission = async (userId, permissionId, currentlyGranted) => {
    setSaving(true);
    try {
      if (currentlyGranted) {
        // Revoke: set granted = false
        await api.post('/permissions/users/custom-permission', {
          user_id: userId,
          permission_id: permissionId,
          ecosystem_unit_id: unit.id,
          granted: false,
        });
      } else {
        // Grant: set granted = true
        await api.post('/permissions/users/custom-permission', {
          user_id: userId,
          permission_id: permissionId,
          ecosystem_unit_id: unit.id,
          granted: true,
        });
      }
      onReload();
      handleSelectUser(userId); // Refresh user permissions
    } catch (e) {
      alert('Lỗi: ' + (e.response?.data?.error || e.message));
    }
    setSaving(false);
  };

  // Group permissions by resource
  const groupedPermissions = {};
  permissions.forEach(p => {
    if (!groupedPermissions[p.resource]) groupedPermissions[p.resource] = [];
    groupedPermissions[p.resource].push(p);
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <span className="text-lg">{icon}</span>
            {unit.name}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {levelLabel} • {unitUsers.length} nhân viên
          </p>
        </div>
        <button
          onClick={() => setShowAddUser(true)}
          className="text-xs px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-1"
        >
          <Plus className="h-3 w-3" /> Gán nhân viên
        </button>
      </div>

      {/* User List */}
      <div className="border-t pt-3">
        <h3 className="text-xs font-bold text-gray-700 mb-2">Nhân viên được gán</h3>
        {unitUsers.length === 0 ? (
          <p className="text-xs text-gray-400 italic">Chưa có nhân viên nào</p>
        ) : (
          <div className="space-y-2">
            {unitUsers.map(u => {
              const isSelected = selectedUser === u.user_id;
              const userPermsCount = unitPermissions.filter(up => up.user_id === u.user_id && up.granted).length;
              
              return (
                <button
                  key={u.user_id}
                  onClick={() => handleSelectUser(u.user_id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-colors ${
                    isSelected ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-purple-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">
                      {u.user_name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">{u.user_name}</p>
                      <p className="text-xs text-gray-500">{u.email}</p>
                    </div>
                  </div>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    {userPermsCount} quyền
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Permissions for Selected User */}
      {selectedUser && (
        <div className="border-t pt-3">
          <h3 className="text-xs font-bold text-gray-700 mb-3">
            Quyền hạn của {unitUsers.find(u => u.user_id === selectedUser)?.user_name}
          </h3>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {Object.entries(groupedPermissions).map(([resource, perms]) => (
              <div key={resource} className="border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-gray-100 border-b">
                  <h4 className="text-xs font-bold text-gray-800 uppercase">{resource}</h4>
                </div>
                <div className="p-2 space-y-1">
                  {perms.map(perm => {
                    const userPerm = unitPermissions.find(
                      up => up.user_id === selectedUser && up.permission_id === perm.id
                    );
                    const isGranted = userPerm?.granted || false;
                    
                    return (
                      <button
                        key={perm.id}
                        onClick={() => togglePermission(selectedUser, perm.id, isGranted)}
                        disabled={saving}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded transition-colors ${
                          isGranted ? 'bg-green-50 border border-green-300' : 'bg-gray-50 border border-gray-200 hover:border-gray-300'
                        } ${saving ? 'opacity-50' : ''}`}
                      >
                        <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                          isGranted ? 'bg-green-600' : 'bg-gray-300'
                        }`}>
                          {isGranted ? <Check className="h-3 w-3 text-white" /> : <X className="h-3 w-3 text-gray-500" />}
                        </div>
                        <span className="text-xs text-gray-900 flex-1 text-left">{perm.action}</span>
                        {perm.description && (
                          <span className="text-[10px] text-gray-500">{perm.description}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddUser && (
        <AddUserToUnitModal
          unit={unit}
          users={users}
          existingUserIds={unitUsers.map(u => u.user_id)}
          onClose={() => setShowAddUser(false)}
          onSaved={() => {
            setShowAddUser(false);
            onReload();
          }}
        />
      )}
    </div>
  );
}

// Add User to Unit Modal
function AddUserToUnitModal({ unit, users, existingUserIds, onClose, onSaved }) {
  const [selectedUser, setSelectedUser] = useState('');
  const [saving, setSaving] = useState(false);

  const availableUsers = users.filter(u => !existingUserIds.includes(u.id));

  const handleAdd = async () => {
    if (!selectedUser) return alert('Chọn nhân viên');
    
    setSaving(true);
    try {
      // Add user to ecosystem_unit_members
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
      <div className="bg-white rounded-xl p-6 max-w-md w-full">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Gán nhân viên vào {unit.name}</h3>
        
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Chọn nhân viên</label>
            <select
              value={selectedUser}
              onChange={e => setSelectedUser(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">-- Chọn nhân viên --</option>
              {availableUsers.map(u => (
                <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
            >
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
    </div>
  );
}
