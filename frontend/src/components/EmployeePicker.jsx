import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ChevronDown, User, Building2, Users, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import { formatStaffDisplayName, getStaffInitials, staffNameMatchesQuery } from '../lib/utils';

// Global cache to prevent re-fetching when components remount
const _cache = { users: {}, departments: {} };

/**
 * EmployeePicker - Component chọn nhân viên với filter Công ty + Phòng ban (+ Khu vực)
 * Uses React Portal to render dropdown outside parent overflow:hidden containers
 *
 * Props:
 *  - companyId: ID từ bảng companies (ưu tiên dùng cái này)
 *  - companyUnitId: ID từ bảng ecosystem_units (backward compat)
 *  - regionId: lọc NV thuộc khu vực (user_company_regions / crm_region_ids)
 *  - requireRegion: true → bắt buộc chọn khu vực trước mới mở picker
 *  - forModule: 'crm' | 'production' | 'logistics' | 'all' — khi load qua employees-by-company
 */
export default function EmployeePicker({
  companyId,
  companyUnitId,
  regionId = null,
  requireRegion = false,
  forModule = 'crm',
  value,
  onChange,
  placeholder = '👤 Chưa gán',
  className = '',
  size = 'md',
  disabled = false,
  /** true: hiển thị full_name gốc thay vì dạng rút gọn (VD «Thời D.T.») */
  displayFullName = false,
  /** Dữ liệu nạp sẵn — bỏ qua fetch khi đủ users */
  preloadUsers = null,
  preloadDepartments = null,
}) {
  const labelForUser = (name) => {
    const full = String(name || '').trim();
    if (!full) return '';
    return displayFullName ? full : formatStaffDisplayName(full);
  };
  const [open, setOpen] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [dropdownStyle, setDropdownStyle] = useState({});

  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);

  // companyId takes priority over companyUnitId
  const effectiveKey = companyId || companyUnitId;
  const regionKey = regionId ? String(regionId) : '';
  const missingRegion = requireRegion && !regionKey;
  const isDisabled = disabled || !effectiveKey || missingRegion;
  const preloadKey = Array.isArray(preloadUsers)
    ? `preload:${effectiveKey || ''}:${preloadUsers.length}:${preloadUsers[0]?.id || ''}`
    : '';

  // Load users + departments when companyId or companyUnitId changes
  useEffect(() => {
    if (Array.isArray(preloadUsers)) {
      setAllUsers(preloadUsers);
      setDepartments(Array.isArray(preloadDepartments) ? preloadDepartments : []);
      return;
    }
    if (effectiveKey) {
      loadData(effectiveKey, !!companyId, forModule);
    } else {
      setAllUsers([]);
      setDepartments([]);
      setSelectedUser(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveKey, companyId, forModule, preloadKey]);

  const regionScopedUsers = useMemo(() => {
    if (!regionKey) return allUsers;
    return allUsers.filter((u) => (u.crm_region_ids || []).map(String).includes(regionKey));
  }, [allUsers, regionKey]);

  // Resolve selected user (có thể ngoài list lọc khu vực — vẫn hiện tên đã chọn)
  useEffect(() => {
    if (value && allUsers.length) {
      const u = allUsers.find((x) => x.id === value);
      setSelectedUser(u || null);
    } else if (!value) {
      setSelectedUser(null);
    }
  }, [value, allUsers]);

  // Calculate position synchronously before paint to avoid flicker
  useLayoutEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      const dropdownHeight = 340;

      const s = {
        position: 'fixed',
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 296)),
        width: 288,
        zIndex: 99999,
      };

      if (spaceBelow < dropdownHeight && rect.top > spaceBelow) {
        s.bottom = viewportHeight - rect.top + 4;
      } else {
        s.top = rect.bottom + 4;
      }

      setDropdownStyle(s);
    }
  }, [open]);

  // Close on outside scroll / resize — but NOT when scrolling inside dropdown
  useEffect(() => {
    if (!open) return;
    const handleScroll = (e) => {
      // If scroll happened inside our dropdown, ignore
      if (dropdownRef.current && dropdownRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const handleResize = () => setOpen(false);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open]);

  const loadData = async (keyId, useCompanyId = false, moduleKey = 'crm') => {
    const cacheKey = useCompanyId
      ? `crm_${moduleKey}_${keyId}`
      : `u_${keyId}`;
    if (_cache.users[cacheKey]) {
      setAllUsers(_cache.users[cacheKey]);
      setDepartments(_cache.departments[cacheKey] || []);
      return;
    }

    setLoading(true);
    try {
      if (useCompanyId) {
        const { data } = await api.get('/crm/employees-by-company', {
          params: { company_id: keyId, for_module: moduleKey || 'crm' },
        });
        const users = data.users || [];
        const depts = data.departments || [];
        setAllUsers(users);
        setDepartments(depts);
        _cache.users[cacheKey] = users;
        _cache.departments[cacheKey] = depts;
        return;
      }

      const param = `company_unit_id=${keyId}`;
      const { data } = await api.get(`/users?${param}`);
      const users = data.users || [];
      setAllUsers(users);
      _cache.users[cacheKey] = users;

      const resolvedCompanyId = data.company_id;
      if (resolvedCompanyId) {
        try {
          const { data: deptData } = await api.get(`/departments?company_id=${resolvedCompanyId}`);
          const depts = deptData.departments || [];
          setDepartments(depts);
          _cache.departments[cacheKey] = depts;
        } catch {
          const deptMap = {};
          users.forEach((u) => { if (u.department_id) deptMap[u.department_id] = u.department_id; });
          const depts = Object.keys(deptMap).map((id) => ({ id, name: id }));
          setDepartments(depts);
          _cache.departments[cacheKey] = depts;
        }
      }
    } catch (e) {
      console.error('EmployeePicker loadData error:', e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = regionScopedUsers.filter((u) => {
    const matchDept = !selectedDept || u.department_id === selectedDept;
    const matchSearch = !search
      || staffNameMatchesQuery(u.full_name, search)
      || u.email?.toLowerCase().includes(search.toLowerCase());
    return matchDept && matchSearch;
  });

  const handleSelect = (user) => {
    setSelectedUser(user);
    onChange(user?.id || null, user || null);
    setOpen(false);
    setSearch('');
    setSelectedDept('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    setSelectedUser(null);
    onChange(null, null);
  };

  const handleToggle = () => {
    if (isDisabled) return;
    setOpen(!open);
  };

  const sizeClass = size === 'sm'
    ? 'text-xs px-2 py-1 min-h-[28px]'
    : 'text-sm px-3 py-2 min-h-[36px]';

  const disabledHint = !effectiveKey
    ? 'Chọn công ty trước'
    : missingRegion
      ? 'Chọn khu vực trước'
      : placeholder;

  const dropdown = open && !isDisabled ? createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0"
        style={{ zIndex: 99998 }}
        onClick={() => setOpen(false)}
      />

      {/* Dropdown panel - rendered via Portal at body level */}
      <div
        ref={dropdownRef}
        style={dropdownStyle}
        className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
      >
        {/* Search */}
        <div className="p-2 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              autoFocus
              placeholder="Tìm tên, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
          </div>
        </div>

        {/* Department filter */}
        {departments.length > 0 && (
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
            {departments.map((dept) => (
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
            <div className="py-6 text-center text-sm text-gray-400 px-3">
              {allUsers.length === 0
                ? 'Công ty chưa có nhân viên'
                : regionKey
                  ? 'Không có nhân viên thuộc khu vực này'
                  : 'Không tìm thấy'}
            </div>
          ) : (
            <>
              {/* Clear option */}
              <button
                onClick={() => handleSelect(null)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 border-b border-gray-100"
              >
                <X className="w-3.5 h-3.5" /> Không gán
              </button>

              {filtered.map((user) => {
                const isSelected = value === user.id;
                const deptName = departments.find((d) => d.id === user.department_id)?.name || '';
                return (
                  <button
                    key={user.id}
                    onClick={() => handleSelect(user)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-purple-50 transition-colors text-left ${
                      isSelected ? 'bg-purple-50' : ''
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isSelected ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-600'
                    }`}
                    >
                      {getStaffInitials(user.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${isSelected ? 'text-purple-700' : 'text-gray-900'}`} title={user.full_name}>
                        {labelForUser(user.full_name)}
                      </div>
                      {deptName && <div className="text-xs text-gray-400 truncate">{deptName}</div>}
                    </div>
                    {isSelected && <div className="w-2 h-2 rounded-full bg-purple-600 shrink-0" />}
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        {regionScopedUsers.length > 0 && (
          <div className="px-3 py-1.5 border-t border-gray-100 text-xs text-gray-400 flex items-center gap-1">
            <Building2 className="w-3 h-3" />
            {filtered.length}/{regionScopedUsers.length} nhân viên
            {regionKey ? ' · theo khu vực' : ''}
            {selectedDept && departments.find((d) => d.id === selectedDept) && (
              <span> · {departments.find((d) => d.id === selectedDept).name}</span>
            )}
          </div>
        )}
      </div>
    </>,
    document.body,
  ) : null;

  return (
    <div className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        disabled={isDisabled}
        className={`w-full flex items-center gap-2 border rounded-lg bg-white transition-colors ${sizeClass} ${
          isDisabled
            ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
            : open
              ? 'border-purple-400 ring-2 ring-purple-200'
              : 'border-gray-300 hover:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400'
        }`}
      >
        {selectedUser && !missingRegion ? (
          <>
            <div className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
              <User className="w-3 h-3 text-purple-600" />
            </div>
            <span className="flex-1 text-left font-medium text-gray-900 truncate" title={selectedUser.full_name}>
              {labelForUser(selectedUser.full_name)}
            </span>
            {!isDisabled && (
              <button
                type="button"
                onClick={handleClear}
                className="shrink-0 p-0.5 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </>
        ) : (
          <>
            <User className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="flex-1 text-left text-gray-400">
              {isDisabled ? disabledHint : placeholder}
            </span>
            {!isDisabled && <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
            {isDisabled && (!effectiveKey || missingRegion) && (
              <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            )}
          </>
        )}
      </button>

      {/* Dropdown rendered via Portal */}
      {dropdown}
    </div>
  );
}
