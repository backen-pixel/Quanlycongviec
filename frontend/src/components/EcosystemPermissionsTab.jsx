import { useState, useEffect } from 'react';
import { Shield, Plus, Check, X, ChevronRight, ChevronDown, Users, AlertCircle } from 'lucide-react';
import api from '../lib/api';

const LEVEL_LABELS = { 0: 'Tập đoàn', 1: 'Khối', 2: 'Công ty', 3: 'Phòng ban', 4: 'Đội nhóm' };
const LEVEL_ICONS = { 0: '🏢', 1: '📦', 2: '🏭', 3: '👥', 4: '⚡' };

// Helper: Get depth from unit
const getUnitDepth = (unit) => {
  if (!unit) return null;
  if (typeof unit.level === 'number') return unit.level; // Legacy
  return unit.level?.depth ?? null; // New schema
};

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
  const [selectedPositionRole, setSelectedPositionRole] = useState(null);
  const [unitPermissions, setUnitPermissions] = useState([]);
  const [unitUsers, setUnitUsers] = useState([]); // NEW: Users in this unit
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
      // Load permissions AND users for this unit
      const [permsRes, usersRes] = await Promise.all([
        api.get(`/permissions/ecosystem-units/${unitId}/permissions`),
        api.get(`/ecosystem/units/${unitId}/users`), // NEW endpoint
      ]);
      
      setUnitPermissions(permsRes.data.permissions || []);
      setUnitUsers(usersRes.data.users || []); // Users in this unit (hierarchical)
      setSelectedUnit(ecosystemUnits.find(u => u.id === unitId));
      setSelectedUsers([]);
      setSelectedPositionRole(null);
    } catch (e) {
      console.error('Load unit data error:', e);
      // Fallback: try to get users from ecosystem_unit_members
      try {
        const { data } = await api.get(`/ecosystem/units/${unitId}/members`);
        setUnitUsers(data.users || []);
      } catch (err) {
        setUnitUsers([]);
      }
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
    const icon = LEVEL_ICONS[getUnitDepth(unit)] || '📦';

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

    const unitLevel = getUnitDepth(selectedUnit);
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
                      <span>{LEVEL_ICONS[getUnitDepth(selectedUnit)]}</span>
                      {selectedUnit.name}
                    </h3>
                    <p className="text-xs text-gray-500">{LEVEL_LABELS[getUnitDepth(selectedUnit)]} • {unitUsers.length} nhân viên</p>
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
                            ⚠️ Vai trò <strong>{selectedPosition.name}</strong> trong <strong>{LEVEL_LABELS[getUnitDepth(selectedUnit)]}</strong> không có quyền nào khả dụng.
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

function AddUserModal({ unit, users: propUsers, existingUserIds, onClose, onSaved }) {
  const [selectedUser, setSelectedUser] = useState('');
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [allUsers, unit, selectedCompany, selectedDepartment, searchTerm]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load users first
      const { data: usersData } = await api.get('/users');
      setAllUsers(usersData.users || []);
      
      // Load all departments (for filtering)
      const { data: deptData } = await api.get('/departments');
      const allDepts = deptData.departments || [];
      
      // If unit is Khối (level 1) or higher, load companies under it
      if (getUnitDepth(unit) <= 1) {
        const { data } = await api.get('/ecosystem/units');
        const allUnits = data.units || [];
        
        // Get child companies of this unit
        const childCompanies = allUnits.filter(u => {
          const uDepth = getUnitDepth(u);
          if (getUnitDepth(unit) === 0) return uDepth === 2; // Tập đoàn → all companies
          if (getUnitDepth(unit) === 1) {
            // Khối → companies that are children or have parent_id = this unit
            return uDepth === 2 && (u.parent_id === unit.id || allUnits.find(p => p.id === u.parent_id && p.parent_id === unit.id));
          }
          return false;
        });
        
        setCompanies(childCompanies);
        
        // Get departments of these companies
        const companyIds = childCompanies.map(c => c.company_id).filter(Boolean);
        const relevantDepts = allDepts.filter(d => companyIds.includes(d.company_id));
        setDepartments(relevantDepts);
      } else if (getUnitDepth(unit) === 2) {
        // If unit is Company, load its departments
        const relevantDepts = allDepts.filter(d => d.company_id === unit.company_id);
        setDepartments(relevantDepts);
      } else if (getUnitDepth(unit) === 3) {
        // Phòng ban: no filters needed (will filter by department directly)
        setDepartments(allDepts);
      }
    } catch (e) {
      console.error('Load data error:', e);
    }
    setLoading(false);
  };

  const applyFilters = () => {
    let filtered = allUsers.filter(u => !existingUserIds.includes(u.id));

    // Filter by ecosystem hierarchy
    if (getUnitDepth(unit) === 0) {
      // Tập đoàn: all users (no filter)
    } else if (getUnitDepth(unit) === 1) {
      // Khối: users in companies under this Khối
      const relevantDeptIds = departments.map(d => d.id);
      filtered = filtered.filter(u => relevantDeptIds.includes(u.department_id));
      
      // If company selected, narrow down
      if (selectedCompany) {
        const companyDepts = departments.filter(d => d.company_id === selectedCompany);
        const companyDeptIds = companyDepts.map(d => d.id);
        filtered = filtered.filter(u => companyDeptIds.includes(u.department_id));
        
        // Update department dropdown
        setDepartments(companyDepts);
      }
      
      // If department selected, narrow down further
      if (selectedDepartment) {
        filtered = filtered.filter(u => u.department_id === selectedDepartment);
      }
    } else if (getUnitDepth(unit) === 2) {
      // Công ty: users in this company
      const companyDeptIds = departments.map(d => d.id);
      filtered = filtered.filter(u => companyDeptIds.includes(u.department_id));
      
      if (selectedDepartment) {
        filtered = filtered.filter(u => u.department_id === selectedDepartment);
      }
    } else if (getUnitDepth(unit) === 3) {
      // Phòng ban: users in this department
      // Find department by matching company_id + name (or use ecosystem link)
      const dept = departments.find(d => d.company_id === unit.company_id);
      if (dept) {
        filtered = filtered.filter(u => u.department_id === dept.id);
      }
    } else if (getUnitDepth(unit) === 4) {
      // Team: show all for now (will be refined with ecosystem_unit_members)
    }

    // Search by name
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(u =>
        u.full_name?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term)
      );
    }

    setFilteredUsers(filtered);
  };

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
      <div className="bg-white rounded-xl p-4 max-w-xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <h3 className="text-sm font-bold mb-3">Gán nhân viên vào {unit.name}</h3>
        
        {/* Filters */}
        <div className="space-y-3 mb-3">
          {/* Search */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Tìm kiếm</label>
            <input
              type="text"
              placeholder="Gõ tên hoặc email..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>

          {/* Company filter (if Khối or higher) */}
          {getUnitDepth(unit) <= 1 && companies.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Công ty</label>
              <select
                value={selectedCompany}
                onChange={e => {
                  setSelectedCompany(e.target.value);
                  setSelectedDepartment('');
                }}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="">-- Tất cả công ty --</option>
                {companies.map(c => (
                  <option key={c.id} value={c.company_id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Department filter (if Company or has selected company) */}
          {(getUnitDepth(unit) === 2 || selectedCompany) && departments.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Phòng ban</label>
              <select
                value={selectedDepartment}
                onChange={e => setSelectedDepartment(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="">-- Tất cả phòng ban --</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* User count */}
          <p className="text-xs text-gray-500">
            Tìm thấy {filteredUsers.length} nhân viên
          </p>
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto border rounded-lg mb-3">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin h-6 w-6 border-2 border-purple-200 border-t-purple-600 rounded-full" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400">
              <Users className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-xs">Không tìm thấy nhân viên</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filteredUsers.map(u => (
                <label
                  key={u.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                    selectedUser === u.id ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-purple-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="user"
                    value={u.id}
                    checked={selectedUser === u.id}
                    onChange={() => setSelectedUser(u.id)}
                    className="w-4 h-4 accent-purple-600"
                  />
                  <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold shrink-0">
                    {u.full_name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{u.full_name}</p>
                    <p className="text-xs text-gray-500 truncate">{u.email}</p>
                    {u.department_name && (
                      <p className="text-xs text-gray-400">{u.department_name}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
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
