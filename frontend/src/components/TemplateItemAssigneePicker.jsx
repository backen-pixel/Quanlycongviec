import { useState, useEffect, useMemo } from 'react';
import { Search, User, Building2, Users, X } from 'lucide-react';
import api from '../lib/api';
import { templateItemAssigneeIds } from '../lib/templateItemAssignees';

/**
 * Chọn nhiều NV cho mục bộ nhiệm vụ mẫu — lọc công ty, phòng ban, tìm tên.
 */
export default function TemplateItemAssigneePicker({
  item,
  companies = [],
  defaultCompanyId = '',
  onSave,
  compact = false,
}) {
  const selectedIds = useMemo(() => new Set(templateItemAssigneeIds(item)), [item]);
  const [filterCompanyId, setFilterCompanyId] = useState(defaultCompanyId || '');
  const [filterDeptId, setFilterDeptId] = useState('');
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (defaultCompanyId && !filterCompanyId) setFilterCompanyId(defaultCompanyId);
  }, [defaultCompanyId, filterCompanyId]);

  useEffect(() => {
    setFilterDeptId('');
  }, [filterCompanyId]);

  useEffect(() => {
    if (!filterCompanyId) {
      setUsers([]);
      setDepartments([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get('/users', { params: { company_id: filterCompanyId } }),
      api.get('/departments', { params: { company_id: filterCompanyId } }),
    ])
      .then(([uRes, dRes]) => {
        if (cancelled) return;
        setUsers(uRes.data?.users || uRes.data || []);
        const depts = dRes.data?.departments || dRes.data || [];
        setDepartments(Array.isArray(depts) ? depts : []);
      })
      .catch(() => {
        if (!cancelled) {
          setUsers([]);
          setDepartments([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [filterCompanyId]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (users || []).filter((u) => {
      if (filterDeptId && String(u.department_id || '') !== String(filterDeptId)) return false;
      if (!q) return true;
      const name = String(u.full_name || '').toLowerCase();
      const email = String(u.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [users, filterDeptId, search]);

  const selectedUsers = useMemo(
    () => (users || []).filter((u) => selectedIds.has(String(u.id))),
    [users, selectedIds],
  );

  const persist = async (nextIds) => {
    setSaving(true);
    try {
      await onSave?.(nextIds);
    } finally {
      setSaving(false);
    }
  };

  const toggleUser = (userId) => {
    const sid = String(userId);
    const next = new Set(selectedIds);
    if (next.has(sid)) next.delete(sid);
    else next.add(sid);
    void persist([...next]);
  };

  const clearAll = () => void persist([]);

  const padClass = compact ? 'p-2' : 'p-2.5';
  const textClass = compact ? 'text-[10px]' : 'text-xs';

  return (
    <div className={`rounded-lg border border-indigo-200 bg-indigo-50/70 space-y-2 ${padClass}`} onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`font-bold text-indigo-800 uppercase tracking-wide shrink-0 flex items-center gap-1 ${textClass}`}>
          <User className="h-3 w-3" /> Gán NV ({selectedIds.size})
        </span>
        {selectedIds.size > 0 && (
          <button
            type="button"
            disabled={saving}
            onClick={clearAll}
            className={`ml-auto text-red-600 hover:text-red-700 font-medium ${textClass}`}
          >
            Bỏ hết
          </button>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedUsers.map((u) => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1 max-w-[160px] truncate rounded-full bg-white border border-indigo-200 px-2 py-0.5 text-[10px] text-indigo-800"
              title={u.full_name || u.email}
            >
              {u.full_name?.split(' ').pop() || u.email || u.id}
              <button type="button" onClick={() => toggleUser(u.id)} className="text-indigo-400 hover:text-red-500">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          {selectedIds.size > selectedUsers.length && (
            <span className="text-[10px] text-indigo-600 italic self-center">
              +{selectedIds.size - selectedUsers.length} NV (khác công ty đang lọc)
            </span>
          )}
        </div>
      )}

      <div className={`grid gap-2 ${compact ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-3'}`}>
        <label className="flex flex-col gap-0.5 min-w-0">
          <span className={`text-gray-500 font-medium flex items-center gap-1 ${textClass}`}>
            <Building2 className="h-3 w-3" /> Công ty
          </span>
          <select
            value={filterCompanyId}
            onChange={(e) => setFilterCompanyId(e.target.value)}
            className="h-8 px-2 rounded border border-indigo-200 text-xs bg-white outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="">— Chọn công ty —</option>
            {(companies || []).map((c) => (
              <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 min-w-0">
          <span className={`text-gray-500 font-medium flex items-center gap-1 ${textClass}`}>
            <Users className="h-3 w-3" /> Phòng ban
          </span>
          <select
            value={filterDeptId}
            disabled={!filterCompanyId}
            onChange={(e) => setFilterDeptId(e.target.value)}
            className="h-8 px-2 rounded border border-indigo-200 text-xs bg-white outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50"
          >
            <option value="">Tất cả phòng ban</option>
            {(departments || []).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 min-w-0 sm:col-span-1">
          <span className={`text-gray-500 font-medium flex items-center gap-1 ${textClass}`}>
            <Search className="h-3 w-3" /> Tìm tên
          </span>
          <input
            value={search}
            disabled={!filterCompanyId}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tên hoặc email…"
            className="h-8 px-2 rounded border border-indigo-200 text-xs bg-white outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50"
          />
        </label>
      </div>

      {!filterCompanyId ? (
        <p className={`text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1.5 ${textClass}`}>
          Chọn công ty để xem danh sách nhân viên.
        </p>
      ) : (
        <div className="max-h-44 overflow-y-auto rounded border border-indigo-100 bg-white divide-y divide-gray-50">
          {loading ? (
            <p className={`px-3 py-4 text-center text-gray-400 ${textClass}`}>Đang tải…</p>
          ) : !filteredUsers.length ? (
            <p className={`px-3 py-4 text-center text-gray-400 ${textClass}`}>Không có nhân viên phù hợp.</p>
          ) : (
            filteredUsers.map((u) => {
              const checked = selectedIds.has(String(u.id));
              const deptName = (departments || []).find((d) => String(d.id) === String(u.department_id))?.name || '';
              return (
                <label
                  key={u.id}
                  className={`flex items-center gap-2 px-2.5 py-2 cursor-pointer ${checked ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={saving}
                    onChange={() => toggleUser(u.id)}
                    className="rounded border-indigo-300 text-indigo-600"
                  />
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium text-gray-900 truncate ${textClass}`}>{u.full_name || u.email}</div>
                    {deptName && <div className="text-[10px] text-gray-400 truncate">{deptName}</div>}
                  </div>
                </label>
              );
            })
          )}
        </div>
      )}

      {filterCompanyId && !loading && (
        <p className={`text-gray-400 ${textClass}`}>
          {filteredUsers.length}/{users.length} nhân viên
          {filterDeptId && departments.find((d) => String(d.id) === String(filterDeptId))?.name
            ? ` · ${departments.find((d) => String(d.id) === String(filterDeptId)).name}`
            : ''}
        </p>
      )}
    </div>
  );
}
