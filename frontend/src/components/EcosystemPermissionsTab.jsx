import { useState, useEffect } from 'react';
import { Shield, Plus, Check, X, ChevronRight, ChevronDown, Users, AlertCircle, Search } from 'lucide-react';
import api from '../lib/api';

const LEVEL_LABELS = { 0: 'Tập đoàn', 1: 'Khối', 2: 'Công ty', 3: 'Phòng ban', 4: 'Đội nhóm' };
const LEVEL_ICONS = { 0: '🏢', 1: '📦', 2: '🏭', 3: '👥', 4: '⚡' };

// Helper: Get depth from unit
const getUnitDepth = (unit) => {
  if (!unit) return null;
  if (typeof unit.level === 'number') return unit.level;
  return unit.level?.depth ?? null;
};

// Vai trò TRONG hệ sinh thái
const POSITION_ROLES = [
  { id: 'director', name: 'Giám đốc', level: 'high', color: 'red' },
  { id: 'manager', name: 'Quản lý', level: 'medium', color: 'purple' },
  { id: 'supervisor', name: 'Giám sát', level: 'medium', color: 'blue' },
  { id: 'leader', name: 'Trưởng nhóm', level: 'medium', color: 'indigo' },
  { id: 'employee', name: 'Nhân viên', level: 'low', color: 'green' },
  { id: 'support', name: 'Hỗ trợ', level: 'low', color: 'gray' },
];

// Nhóm quyền với tên tiếng Việt
const PERMISSION_GROUPS = {
  'projects': {
    name: '📁 Dự án',
    permissions: {
      'view': 'Xem danh sách dự án',
      'create': 'Tạo dự án mới',
      'edit': 'Chỉnh sửa thông tin dự án',
      'delete': 'Xóa dự án',
      'all_companies': 'Xem dự án của tất cả công ty (không giới hạn)',
    }
  },
  'workflows': {
    name: '🔀 Quy trình',
    permissions: {
      'view': 'Xem quy trình công việc',
      'create': 'Tạo quy trình mới',
      'edit': 'Chỉnh sửa quy trình',
      'delete': 'Xóa quy trình',
    }
  },
  'templates': {
    name: '📋 Bộ mẫu',
    permissions: {
      'view': 'Xem bộ mẫu dự án',
      'create': 'Tạo bộ mẫu',
      'edit': 'Chỉnh sửa bộ mẫu',
      'delete': 'Xóa bộ mẫu',
    }
  },
  'users': {
    name: '👥 Nhân viên',
    permissions: {
      'view': 'Xem danh sách nhân viên',
      'create': 'Thêm nhân viên mới',
      'edit': 'Chỉnh sửa thông tin nhân viên',
      'delete': 'Xóa nhân viên',
    }
  },
  'ecosystem': {
    name: '🏢 Cấu trúc công ty',
    permissions: {
      'view': 'Xem cấu trúc tổ chức',
      'edit': 'Sửa cấu trúc tổ chức',
    }
  },
  'reports': {
    name: '📊 Báo cáo',
    permissions: {
      'view': 'Xem báo cáo',
      'export': 'Xuất dữ liệu',
    }
  },
  'settings': {
    name: '⚙️ Cài đặt',
    permissions: {
      'view': 'Xem cài đặt hệ thống',
      'edit': 'Thay đổi cài đặt',
    }
  },
};

export default function EcosystemPermissionsTab({ users: allUsers }) {
  const [ecosystemUnits, setEcosystemUnits] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [systemRoles, setSystemRoles] = useState([]); // NEW: Roles from Tab 1
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [roleType, setRoleType] = useState('position'); // 'position' | 'system'
  const [selectedPositionRole, setSelectedPositionRole] = useState(null);
  const [selectedSystemRole, setSelectedSystemRole] = useState(null); // NEW
  const [selectedUser, setSelectedUser] = useState(null);
  const [unitUsers, setUnitUsers] = useState([]);
  const [userPermissions, setUserPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedUnits, setExpandedUnits] = useState({});
  
  // Filters for user list
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [unitsRes, permsRes, rolesRes] = await Promise.all([
        api.get('/ecosystem/units'),
        api.get('/permissions/permissions'),
        api.get('/permissions/roles'), // NEW: Load system roles
      ]);
      
      setEcosystemUnits(unitsRes.data.units || []);
      setPermissions(permsRes.data.permissions || []);
      setSystemRoles(rolesRes.data.roles || []); // NEW
    } catch (e) {
      console.error('Load data error:', e);
    }
    setLoading(false);
  };

  const loadUnitData = async (unitId) => {
    try {
      console.log('🔄 Loading unit data for:', unitId);
      
      const [usersRes] = await Promise.all([
        api.get(`/ecosystem/units/${unitId}/users`),
      ]);
      
      console.log('👥 Users loaded:', usersRes.data.users?.length);
      
      const users = (usersRes.data.users || []).map(u => ({
        ...u,
        user_id: u.id,
        user_name: u.full_name,
      }));
      
      setUnitUsers(users);
      setSelectedUnit(ecosystemUnits.find(u => u.id === unitId));
      setRoleType('position'); // Reset to position roles
      setSelectedPositionRole(null);
      setSelectedSystemRole(null);
      setSelectedUser(null);
      setUserPermissions([]);
      
      // Load filter options
      await loadFilterOptions(unitId);
    } catch (e) {
      console.error('❌ Load unit data error:', e);
      setUnitUsers([]);
      setSelectedUnit(ecosystemUnits.find(u => u.id === unitId));
    }
  };

  const loadFilterOptions = async (unitId) => {
    const unit = ecosystemUnits.find(u => u.id === unitId);
    if (!unit) return;
    
    const unitDepth = getUnitDepth(unit);
    
    try {
      // Load companies if Khối or Tập đoàn
      if (unitDepth <= 1) {
        const { data } = await api.get('/ecosystem/units');
        const allUnits = data.units || [];
        const childCompanies = allUnits.filter(u => {
          const uDepth = getUnitDepth(u);
          if (unitDepth === 0) return uDepth === 2;
          if (unitDepth === 1) return uDepth === 2 && (u.parent_id === unitId);
          return false;
        });
        setCompanies(childCompanies);
      }
      
      // Load departments
      const { data: deptData } = await api.get('/departments');
      setDepartments(deptData.departments || []);
    } catch (e) {
      console.error('Load filter options error:', e);
    }
  };

  const loadUserPermissions = async (userId) => {
    if (!selectedUnit) return;
    
    try {
      const { data } = await api.get(`/permissions/ecosystem-units/${selectedUnit.id}/permissions`);
      const userPerms = (data.permissions || []).filter(p => p.user_id === userId);
      setUserPermissions(userPerms);
      console.log('User permissions loaded:', userPerms.length);
    } catch (e) {
      console.error('Load user permissions error:', e);
      setUserPermissions([]);
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
            loadUnitData(unit.id);
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

  const filteredUsers = unitUsers.filter(u => {
    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const nameMatch = (u.user_name || u.full_name || '').toLowerCase().includes(term);
      const emailMatch = (u.email || '').toLowerCase().includes(term);
      if (!nameMatch && !emailMatch) return false;
    }
    
    // Company filter (if applicable)
    if (filterCompany && selectedUnit && getUnitDepth(selectedUnit) <= 1) {
      const userDept = departments.find(d => d.id === u.department_id);
      if (!userDept || userDept.company_id !== filterCompany) return false;
    }
    
    // Department filter
    if (filterDepartment) {
      if (u.department_id !== filterDepartment) return false;
    }
    
    return true;
  });

  const togglePermission = async (permissionId, grant) => {
    if (!selectedUser || !selectedUnit) return;
    
    setSaving(true);
    try {
      await api.post('/permissions/users/custom-permission', {
        user_id: selectedUser.user_id,
        permission_id: permissionId,
        ecosystem_unit_id: selectedUnit.id,
        position_role: selectedPositionRole,
        granted: grant,
      });
      
      // Reload user permissions
      await loadUserPermissions(selectedUser.user_id);
      
      const action = grant ? 'cấp' : 'thu hồi';
      alert(`✅ Đã ${action} quyền thành công`);
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
  };

  const rootUnits = buildTree(null);
  const selectedPosition = POSITION_ROLES.find(r => r.id === selectedPositionRole);
  const selectedRole = selectedSystemRole ? systemRoles.find(r => r.id === selectedSystemRole) : selectedPosition;
  const roleName = selectedRole ? selectedRole.name : '';
  const unitDepth = selectedUnit ? getUnitDepth(selectedUnit) : null;
  const availableDepartments = filterCompany 
    ? departments.filter(d => d.company_id === filterCompany)
    : (selectedUnit && unitDepth === 2 
        ? departments.filter(d => d.company_id === selectedUnit.company_id)
        : departments);

  return (
    <div className="space-y-4">
      {/* Info */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-purple-200 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-xs text-gray-800">
            <p className="font-bold mb-1">💡 Phân quyền theo 4 bước:</p>
            <ol className="list-decimal ml-4 space-y-0.5">
              <li><strong>Chọn đơn vị</strong> (Khối/Công ty/Phòng ban) từ cây bên trái</li>
              <li><strong>Chọn vai trò</strong> cho nhân viên (Giám đốc/Quản lý/Nhân viên)</li>
              <li><strong>Chọn nhân viên</strong> cần phân quyền (có bộ lọc)</li>
              <li><strong>Bật/tắt quyền</strong> chức năng và quyền quản lý hệ sinh thái</li>
            </ol>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Left: Tree */}
        <div className="col-span-3 bg-white rounded-lg border p-3 max-h-[700px] overflow-y-auto">
          <h3 className="text-xs font-bold text-gray-700 mb-2">Cây hệ sinh thái</h3>
          <div className="space-y-0.5">
            {rootUnits.map(unit => renderUnit(unit))}
          </div>
        </div>

        {/* Right: Role + Users + Permissions */}
        <div className="col-span-9 bg-white rounded-lg border p-4">
          {selectedUnit ? (
            <div className="space-y-4">
              {/* Header */}
              <div className="pb-3 border-b">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <span>{LEVEL_ICONS[unitDepth]}</span>
                  {selectedUnit.name}
                </h3>
                <p className="text-xs text-gray-500">{LEVEL_LABELS[unitDepth]}</p>
              </div>

              {/* Step 1: Select Role */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-gray-700">
                    Bước 1: Chọn vai trò
                  </h4>
                  {/* Toggle between role types */}
                  <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                    <button
                      onClick={() => {
                        setRoleType('position');
                        setSelectedSystemRole(null);
                        setSelectedUser(null);
                      }}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        roleType === 'position' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Vai trò vị trí
                    </button>
                    <button
                      onClick={() => {
                        setRoleType('system');
                        setSelectedPositionRole(null);
                        setSelectedUser(null);
                      }}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        roleType === 'system' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Vai trò hệ thống
                    </button>
                  </div>
                </div>
                
                {/* Position Roles */}
                {roleType === 'position' && (
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
                            setSelectedUser(null);
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
                )}
                
                {/* System Roles */}
                {roleType === 'system' && (
                  <div className="grid grid-cols-2 gap-2">
                    {systemRoles.map(role => {
                      const isSelected = selectedSystemRole === role.id;
                      
                      return (
                        <button
                          key={role.id}
                          onClick={() => {
                            setSelectedSystemRole(role.id);
                            setSelectedUser(null);
                          }}
                          className={`px-3 py-2 rounded-lg border-2 text-xs font-medium transition-all ${
                            isSelected 
                              ? 'border-purple-500 bg-purple-50 text-purple-700' 
                              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            <div className="text-left flex-1">
                              <div className="font-bold">{role.name}</div>
                              {role.description && (
                                <div className="text-[10px] text-gray-500 truncate">{role.description}</div>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {(selectedPositionRole || selectedSystemRole) && (
                <>
                  {/* Step 2: Select User */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-700 mb-2">
                      Bước 2: Chọn nhân viên ({roleName})
                    </h4>
                    
                    {/* Filters */}
                    <div className="space-y-2 mb-3">
                      {/* Search */}
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Tìm kiếm theo tên hoặc email..."
                          value={searchTerm}
                          onChange={e => setSearchTerm(e.target.value)}
                          className="w-full pl-10 pr-3 py-2 border rounded-lg text-sm"
                        />
                      </div>
                      
                      {/* Company + Department filters */}
                      <div className="grid grid-cols-2 gap-2">
                        {/* Company (if Khối or Tập đoàn) */}
                        {unitDepth <= 1 && companies.length > 0 && (
                          <select
                            value={filterCompany}
                            onChange={e => {
                              setFilterCompany(e.target.value);
                              setFilterDepartment('');
                            }}
                            className="px-3 py-2 border rounded-lg text-sm"
                          >
                            <option value="">-- Tất cả công ty --</option>
                            {companies.map(c => (
                              <option key={c.id} value={c.company_id}>{c.name}</option>
                            ))}
                          </select>
                        )}
                        
                        {/* Department */}
                        {(unitDepth <= 2 || filterCompany) && availableDepartments.length > 0 && (
                          <select
                            value={filterDepartment}
                            onChange={e => setFilterDepartment(e.target.value)}
                            className="px-3 py-2 border rounded-lg text-sm"
                          >
                            <option value="">-- Tất cả phòng ban --</option>
                            {availableDepartments.map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                      
                      <p className="text-xs text-gray-500">
                        Tìm thấy {filteredUsers.length} nhân viên
                      </p>
                    </div>
                    
                    {/* User list */}
                    {filteredUsers.length === 0 ? (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                        <Users className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-xs text-gray-600">Không tìm thấy nhân viên</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                        {filteredUsers.map(u => {
                          const userId = u.user_id || u.id;
                          const userName = u.user_name || u.full_name || 'N/A';
                          const isSelected = selectedUser?.user_id === userId;
                          
                          return (
                            <button
                              key={userId}
                              onClick={() => {
                                setSelectedUser(u);
                                loadUserPermissions(userId);
                              }}
                              className={`flex items-center gap-2 px-2 py-1.5 rounded border text-left transition-colors ${
                                isSelected ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-purple-300'
                              }`}
                            >
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                isSelected ? 'bg-purple-200 text-purple-800' : 'bg-purple-100 text-purple-700'
                              }`}>
                                {userName.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-900 truncate">{userName}</p>
                                {u.email && <p className="text-[10px] text-gray-500 truncate">{u.email}</p>}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Step 3: Permissions (only if user selected) */}
                  {selectedUser && (
                    <div>
                      <h4 className="text-xs font-bold text-gray-700 mb-2">
                        Bước 3: Phân quyền cho {selectedUser.user_name || selectedUser.full_name}
                      </h4>
                      
                      <div className="space-y-3 max-h-80 overflow-y-auto">
                        {Object.entries(PERMISSION_GROUPS).map(([resource, group]) => {
                          const resourcePerms = permissions.filter(p => p.resource === resource);
                          
                          return (
                            <div key={resource} className="border rounded-lg overflow-hidden">
                              <div className="px-3 py-2 bg-gray-100 border-b">
                                <h5 className="text-xs font-bold text-gray-800">{group.name}</h5>
                              </div>
                              <div className="p-2 space-y-1">
                                {resourcePerms.map(perm => {
                                  const userPerm = userPermissions.find(up => up.permission_id === perm.id);
                                  const isGranted = userPerm?.granted || false;
                                  const label = group.permissions[perm.action] || perm.action;
                                  
                                  return (
                                    <div key={perm.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                                      <span className="text-xs text-gray-700">{label}</span>
                                      <div className="flex gap-1">
                                        <button
                                          onClick={() => togglePermission(perm.id, true)}
                                          disabled={saving}
                                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                                            isGranted 
                                              ? 'bg-green-600 text-white' 
                                              : 'bg-gray-100 text-gray-600 hover:bg-green-100'
                                          } disabled:opacity-50`}
                                        >
                                          {isGranted ? '✓ Đã cấp' : 'Cấp quyền'}
                                        </button>
                                        {isGranted && (
                                          <button
                                            onClick={() => togglePermission(perm.id, false)}
                                            disabled={saving}
                                            className="px-3 py-1 bg-red-100 text-red-600 rounded text-xs font-medium hover:bg-red-200 disabled:opacity-50"
                                          >
                                            Thu hồi
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Shield className="h-12 w-12 mb-2 opacity-30" />
              <p className="text-sm">Chọn đơn vị để bắt đầu phân quyền</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
