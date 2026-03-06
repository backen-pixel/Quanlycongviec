import { useState, useEffect, useCallback } from 'react';
import { Search, X, ChevronDown, User, Building2, Users } from 'lucide-react';
import api from '../lib/api';

/**
 * EmployeePicker - Component chọn nhân viên với filter Công ty + Phòng ban
 * 
 * Props:
 *   companyUnitId  - ecosystem_units.id của công ty (required)
 *   value          - user_id đang được chọn
 *   onChange       - callback(userId, userObj)
 *   placeholder    - text hiển thị khi chưa chọn
 *   className      - extra class
 *   size           - 'sm' | 'md' (default 'md')
 *   showLabel      - hiển thị label Công ty/PB hay không
 */
export default function EmployeePicker({
  companyUnitId,
  value,
  onChange,
  placeholder = '👤 Chưa gán',
  className = '',
  size = 'md',
  showLabel = false,
}) {
  const [open, setOpen] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // Load users + departments when companyUnitId changes
  useEffect(() => {
    if (companyUnitId) {
      loadData(companyUnitId);
    } else {
      setAllUsers([]);
      setDepartments([]);
      setSelectedUser(null);
    }
  }, [companyUnitId]);

  // Resolve selected user from allUsers when value changes
  useEffect(() => {
    if (value && allUsers.length) {
      const u = allUsers.find(u => u.id === value);
      setSelectedUser(u || null);
    } else if (!value) {
      setSelectedUser(null);
    }
  }, [value, allUsers]);

  const loadData = async (unitId) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/users?company_unit_id=${unitId}`);
      const users = data.users || [];
      setAllUsers(users);

      // Fetch departments using company_id from response
      const companyId = data.company_id;
      if (companyId) {
        try {
          const { data: deptData } = await api.get(`/departments?company_id=${companyId}`);
          setDepartments(deptData.departments || []);
        } catch {
          // Fallback: extract unique depts from users
          const deptMap = {};
          users.forEach(u => {
            if (u.department_id) deptMap[u.department_id] = u.department_id;
          });
          setDepartments(Object.keys(deptMap).map(id => ({ id, name: id })));
        }
      }
    } catch (e) {
      console.error('EmployeePicker loadData error:', e);
    } finally {
      setLoading(false);
    }
  };

  // Filtered users
  const filtered = allUsers.filter(u => {
    const matchDept = !selectedDept || u.department_id === selectedDept;
    const matchSearch = !search ||
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase());
    return matchDept && matchSearch;
  });

  const handleSelect = (user) => {
    setSelectedUser(user);
    onChange(user?.id || null, user || null);
    setOpen(false);
    setSearch('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    setSelectedUser(null);
    onChange(null, null);
  };

  const sizeClass = size === 'sm'
    ? 'text-xs px-2 py-1 min-h-[28px]'
    : 'text-sm px-3 py-2 min-h-[36px]';

  return (
    <div className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 border border-gray-300 rounded-lg bg-white hover:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400 transition-colors ${sizeClass} ${open ? 'border-purple-400 ring-2 ring-purple-200' : ''}`}
      >
        {selectedUser ? (
          <>
            <div className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
              <User className="w-3 h-3 text-purple-600" />
            </div>
            <span className="flex-1 text-left font-medium text-gray-900 truncate">
              {selectedUser.full_name}
            </span>
            <button
              type="button"
              onClick={handleClear}
              className="shrink-0 p-0.5 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600"
            >
              <X className="w-3 h-3" />
            </button>
          </>
        ) : (
          <>
            <User className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="flex-1 text-left text-gray-400">{placeholder}</span>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          </>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[9998]"
            onClick={() => setOpen(false)}
          />

          {/* Dropdown panel */}
          <div className="absolute z-[9999] mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
            {/* Search */}
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Tìm tên, email..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>
            </div>

            {/* Department filter */}
            {departments.length > 1 && (
              <div className="px-2 py-1.5 border-b border-gray-100 flex items-center gap-1.5 flex-wrap">
                <Users className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <button
                  onClick={() => setSelectedDept('')}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    !selectedDept
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'border-gray-300 text-gray-600 hover:border-purple-400'
                  }`}
                >
                  Tất cả
                </button>
                {departments.map(dept => (
                  <button
                    key={dept.id}
                    onClick={() => setSelectedDept(selectedDept === dept.id ? '' : dept.id)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors truncate max-w-[120px] ${
                      selectedDept === dept.id
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'border-gray-300 text-gray-600 hover:border-purple-400'
                    }`}
                    title={dept.name}
                  >
                    {dept.name}
                  </button>
                ))}
              </div>
            )}

            {/* User list */}
            <div className="max-h-56 overflow-y-auto">
              {loading ? (
                <div className="py-6 text-center text-sm text-gray-400">Đang tải...</div>
              ) : filtered.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-400">
                  {allUsers.length === 0 ? 'Công ty chưa có nhân viên' : 'Không tìm thấy'}
                </div>
              ) : (
                <>
                  {/* Clear option */}
                  <button
                    onClick={() => handleSelect(null)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 border-b border-gray-100"
                  >
                    <X className="w-3.5 h-3.5" />
                    Không gán
                  </button>

                  {filtered.map(user => {
                    const isSelected = value === user.id;
                    const deptName = departments.find(d => d.id === user.department_id)?.name || '';
                    return (
                      <button
                        key={user.id}
                        onClick={() => handleSelect(user)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-purple-50 transition-colors text-left ${
                          isSelected ? 'bg-purple-50' : ''
                        }`}
                      >
                        {/* Avatar */}
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          isSelected ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-600'
                        }`}>
                          {user.full_name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium truncate ${isSelected ? 'text-purple-700' : 'text-gray-900'}`}>
                            {user.full_name}
                          </div>
                          {deptName && (
                            <div className="text-xs text-gray-400 truncate">{deptName}</div>
                          )}
                        </div>
                        {isSelected && (
                          <div className="w-2 h-2 rounded-full bg-purple-600 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </>
              )}
            </div>

            {/* Footer info */}
            {allUsers.length > 0 && (
              <div className="px-3 py-1.5 border-t border-gray-100 text-xs text-gray-400 flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {filtered.length}/{allUsers.length} nhân viên
                {selectedDept && departments.find(d => d.id === selectedDept) && (
                  <span> · {departments.find(d => d.id === selectedDept).name}</span>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
