import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, Save, RotateCcw, Users, AlertCircle, CheckSquare, Square,
} from 'lucide-react';
import api from '../lib/api';
import PermissionCatalogPanel, { cascadeTierDraft } from './permissions/PermissionCatalogPanel';
import PermissionAccessSummary from './permissions/PermissionAccessSummary';
import PermissionProjectScopePanel from './permissions/PermissionProjectScopePanel';

function buildChangePayload(permissionId, desired, original) {
  const fromRole = original?.from_role === true;
  if (desired === fromRole && original?.override == null) {
    return { permission_id: permissionId, clear: true };
  }
  if (desired === fromRole && original?.override != null) {
    return { permission_id: permissionId, clear: true };
  }
  return { permission_id: permissionId, granted: desired };
}

/** Thu thập mọi permission id từ catalog */
function collectCatalogPermissionIds(catalog) {
  const ids = [];
  for (const mod of catalog?.modules || []) {
    if (mod.displayMode === 'tiered') {
      for (const grp of mod.groups || []) {
        for (const feat of grp.features || []) {
          for (const level of feat.levels || []) {
            if (level.permission?.id) ids.push(level.permission.id);
          }
        }
      }
    } else {
      for (const feat of mod.features || []) {
        for (const p of feat.permissions || []) ids.push(p.id);
      }
    }
  }
  return ids;
}

export default function UserPermissionsTab({ users: initialUsers, roles: initialRoles = [] }) {
  const [users, setUsers] = useState(initialUsers || []);
  const [roles, setRoles] = useState(initialRoles || []);
  const [catalog, setCatalog] = useState({ modules: [] });
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [activeModuleKey, setActiveModuleKey] = useState('');
  const [effectiveByUser, setEffectiveByUser] = useState({});
  const [draftMap, setDraftMap] = useState({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applyRoleId, setApplyRoleId] = useState('');
  const [templatePreviewIds, setTemplatePreviewIds] = useState(new Set());

  const selectedRoleTemplate = useMemo(
    () => roles.find((r) => r.id === applyRoleId) || null,
    [roles, applyRoleId],
  );

  const isBulk = selectedUserIds.length > 1;
  const singleUserId = selectedUserIds.length === 1 ? selectedUserIds[0] : null;
  const selectedUsers = useMemo(
    () => users.filter((u) => selectedUserIds.includes(u.id)),
    [users, selectedUserIds],
  );
  const singleUser = singleUserId ? users.find((u) => u.id === singleUserId) : null;
  const singleEffective = singleUserId ? effectiveByUser[singleUserId] : null;

  useEffect(() => {
    loadCatalog();
    if (initialUsers?.length) setUsers(initialUsers);
    else loadUsers();
  }, [initialUsers]);

  useEffect(() => {
    if (initialRoles?.length) setRoles(initialRoles);
    else {
      api.get('/permissions/roles').then((r) => setRoles(r.data.roles || [])).catch(() => {});
    }
  }, [initialRoles]);

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/permissions/catalog');
      setCatalog(data);
      if (data.modules?.length && !activeModuleKey) {
        setActiveModuleKey(data.modules[0].key);
      }
    } catch (e) {
      console.error('Load catalog error:', e);
    }
    setLoading(false);
  };

  const loadUsers = async () => {
    try {
      const { data } = await api.get('/users');
      setUsers(data.users || []);
    } catch (e) {
      console.error('Load users error:', e);
    }
  };

  const loadEffectiveForUsers = useCallback(async (userIds) => {
    if (!userIds.length) {
      setEffectiveByUser({});
      return;
    }
    setLoadingPerms(true);
    try {
      const { data } = await api.post('/permissions/users/effective/bulk', {
        user_ids: userIds,
        ecosystem_unit_id: null,
      });
      setEffectiveByUser(data.users || {});
    } catch (e) {
      console.error('Load effective error:', e);
      setEffectiveByUser({});
    }
    setLoadingPerms(false);
  }, []);

  useEffect(() => {
    setDraftMap({});
    loadEffectiveForUsers(selectedUserIds);
  }, [selectedUserIds, loadEffectiveForUsers]);

  useEffect(() => {
    if (!applyRoleId) {
      setTemplatePreviewIds(new Set());
      return undefined;
    }
    let cancelled = false;
    api
      .get(`/permissions/roles/${applyRoleId}/permissions`)
      .then(({ data }) => {
        if (cancelled) return;
        const ids = new Set((data.permissions || []).map((p) => p.id).filter(Boolean));
        setTemplatePreviewIds(ids);
      })
      .catch(() => {
        if (!cancelled) setTemplatePreviewIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [applyRoleId]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter(
      (u) =>
        u.full_name?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term),
    );
  }, [users, search]);

  const toggleSelectUser = (userId) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const selectSingleUser = (userId) => {
    setSelectedUserIds([userId]);
  };

  const selectAllFiltered = () => {
    const ids = filteredUsers.map((u) => u.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedUserIds.includes(id));
    if (allSelected) {
      setSelectedUserIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setSelectedUserIds((prev) => [...new Set([...prev, ...ids])]);
    }
  };

  const getAggregateState = (permissionId) => {
    if (draftMap[permissionId] !== undefined) {
      return { state: draftMap[permissionId] ? 'on' : 'off', dirty: true, source: null };
    }
    const fromPreview = applyRoleId && templatePreviewIds.has(permissionId);
    const states = selectedUserIds.map((uid) => {
      const row = effectiveByUser[uid]?.permissions?.find((p) => p.permission_id === permissionId);
      return row?.effective === true || fromPreview;
    });
    if (!states.length) return { state: 'off', dirty: false, source: null };
    const allOn = states.every(Boolean);
    const allOff = states.every((v) => !v);
    if (allOn) {
      const row = effectiveByUser[selectedUserIds[0]]?.permissions?.find(
        (p) => p.permission_id === permissionId,
      );
      const src = row?.effective ? row.source : fromPreview ? 'template_preview' : null;
      return { state: 'on', dirty: false, source: src };
    }
    if (allOff) return { state: 'off', dirty: false, source: 'none' };
    return { state: 'mixed', dirty: false, source: null };
  };

  const getChecked = (permissionId) => {
    const { state } = getAggregateState(permissionId);
    if (state === 'mixed') return false;
    return state === 'on';
  };

  const isIndeterminate = (permissionId) => getAggregateState(permissionId).state === 'mixed';

  const isDirty = (permissionId) => draftMap[permissionId] !== undefined;

  const getSource = (permissionId) => {
    if (isBulk) return null;
    if (draftMap[permissionId] !== undefined) return null;
    const row = singleEffective?.permissions?.find((p) => p.permission_id === permissionId);
    if (row?.effective) return row.source || null;
    if (applyRoleId && templatePreviewIds.has(permissionId)) return 'template_preview';
    return null;
  };

  const isDuplicateSource = (permissionId) => {
    if (isBulk || draftMap[permissionId] !== undefined) return false;
    const row = singleEffective?.permissions?.find((p) => p.permission_id === permissionId);
    return !!(row?.effective && row.from_system_role && row.from_module_role);
  };

  const onToggle = (permissionId, value) => {
    setDraftMap((prev) => ({ ...prev, [permissionId]: value }));
  };

  const onToggleTier = (feature, action, value) => {
    const updates = cascadeTierDraft(feature.levels, action, value);
    setDraftMap((prev) => ({ ...prev, ...updates }));
  };

  const resetDraft = () => setDraftMap({});

  const dirtyCount = Object.keys(draftMap).length;

  const overrideCount = useMemo(() => {
    if (isBulk || !singleEffective?.permissions) return 0;
    return singleEffective.permissions.filter((p) => p.override != null).length;
  }, [isBulk, singleEffective]);

  const roleOverlapWarning = useMemo(() => {
    if (!applyRoleId || !selectedRoleTemplate || isBulk) return null;
    const name = String(selectedRoleTemplate.name || '').trim().toLowerCase();
    if (!name) return null;
    const systemRole = String(singleEffective?.system_role || singleUser?.role || '').trim().toLowerCase();
    const moduleRoles = Object.values(singleEffective?.module_roles || {}).map((r) =>
      String(r).trim().toLowerCase(),
    );
    const assigned = (singleEffective?.user_roles || []).map((r) =>
      String(r.role_name || '').trim().toLowerCase(),
    );
    const hits = [];
    if (systemRole && systemRole === name) hits.push(`vai trò HT «${systemRole}»`);
    if (moduleRoles.includes(name)) hits.push('vai trò module');
    if (assigned.includes(name)) hits.push('vai trò gán thêm');
    if (!hits.length) return null;
    return `Vai trò mẫu «${selectedRoleTemplate.name}» trùng với ${hits.join(', ')} — quyền catalog sẽ chồng (union), không nhân đôi hiệu lực.`;
  }, [applyRoleId, selectedRoleTemplate, isBulk, singleEffective, singleUser]);

  const resetOverridesToRole = async () => {
    if (!singleUserId || overrideCount === 0) return;
    if (
      !confirm(
        `Xóa ${overrideCount} ghi đè tay — trở về quyền kế thừa từ vai trò (HT / module / gán thêm)?`,
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const changes = singleEffective.permissions
        .filter((p) => p.override != null)
        .map((p) => ({ permission_id: p.permission_id, clear: true }));
      await api.put(`/permissions/users/${singleUserId}/overrides`, {
        ecosystem_unit_id: null,
        changes,
      });
      await loadEffectiveForUsers(selectedUserIds);
      setDraftMap({});
    } catch (e) {
      alert('Lỗi: ' + (e.response?.data?.error || e.message));
    }
    setSaving(false);
  };
  const applyRoleTemplate = async () => {
    if (!applyRoleId || !selectedUserIds.length || !selectedRoleTemplate) return;
    const roleName = selectedRoleTemplate.name;
    if (
      !confirm(
        `Gán vai trò "${selectedRoleTemplate.name}" cho ${selectedUserIds.length} nhân viên?\n` +
          'Hệ thống sẽ cập nhật vai trò hệ thống (users.role) và hiển thị quyền tương ứng.',
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const { data: roleData } = await api.get(`/permissions/roles/${applyRoleId}/permissions`);
      const permIds = (roleData.permissions || []).map((p) => p.id).filter(Boolean);
      if (!permIds.length) {
        alert('Vai trò này chưa có quyền nào — cấu hình ở tab Vai trò mẫu trước');
        setSaving(false);
        return;
      }

      const roleErrors = [];
      for (const userId of selectedUserIds) {
        try {
          await api.put(`/users/${userId}`, { role: roleName });
        } catch (e) {
          roleErrors.push({ userId, error: e.response?.data?.error || e.message });
        }
      }

      if (roleErrors.length === selectedUserIds.length) {
        const changes = permIds.map((permission_id) => ({ permission_id, granted: true }));
        if (isBulk) {
          await api.put('/permissions/users/bulk-overrides', {
            user_ids: selectedUserIds,
            ecosystem_unit_id: null,
            changes,
          });
        } else if (singleUserId) {
          await api.put(`/permissions/users/${singleUserId}/overrides`, {
            ecosystem_unit_id: null,
            changes,
          });
        }
      }

      setUsers((prev) =>
        prev.map((u) =>
          selectedUserIds.includes(u.id) && !roleErrors.find((e) => e.userId === u.id)
            ? { ...u, role: roleName }
            : u,
        ),
      );
      await loadEffectiveForUsers(selectedUserIds);
      setDraftMap({});
      alert(
        `✅ Đã gán vai trò "${roleName}" cho ${selectedUserIds.length - roleErrors.length}/${selectedUserIds.length} nhân viên (${permIds.length} quyền)`,
      );
    } catch (e) {
      alert('Lỗi: ' + (e.response?.data?.error || e.message));
    }
    setSaving(false);
  };

  const saveChanges = async () => {
    if (!selectedUserIds.length || dirtyCount === 0) return;
    if (
      !confirm(
        `Lưu ${dirtyCount} thay đổi quyền cho ${selectedUserIds.length} nhân viên đã chọn?`,
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const changes = Object.entries(draftMap).map(([permissionId, desired]) => {
        if (isBulk) {
          return { permission_id: permissionId, granted: desired };
        }
        const original = singleEffective?.permissions?.find((p) => p.permission_id === permissionId);
        return buildChangePayload(permissionId, desired, original);
      });

      if (isBulk) {
        const { data } = await api.put('/permissions/users/bulk-overrides', {
          user_ids: selectedUserIds,
          ecosystem_unit_id: null,
          changes,
        });
        if (!data.ok) throw new Error(data.errors?.[0]?.errors?.[0]?.error || 'Lỗi lưu hàng loạt');
      } else if (singleUserId) {
        await api.put(`/permissions/users/${singleUserId}/overrides`, {
          ecosystem_unit_id: null,
          changes,
        });
      }

      await loadEffectiveForUsers(selectedUserIds);
      setDraftMap({});
    } catch (e) {
      alert('Lỗi: ' + (e.response?.data?.error || e.message));
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
      </div>
    );
  }

  const allFilteredSelected =
    filteredUsers.length > 0 &&
    filteredUsers.every((u) => selectedUserIds.includes(u.id));

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Sidebar NV — chọn 1 hoặc nhiều */}
      <div className="col-span-4 flex flex-col rounded-xl border bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-sm font-bold text-gray-700">Chọn nhân viên</h2>
          {selectedUserIds.length > 0 && (
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">
              {selectedUserIds.length} đã chọn
            </span>
          )}
        </div>
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm tên, email..."
            className="h-9 w-full rounded-lg border pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <button
          type="button"
          onClick={selectAllFiltered}
          className="mb-2 flex items-center gap-2 rounded-lg border border-dashed px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
        >
          {allFilteredSelected ? (
            <CheckSquare className="h-4 w-4 text-purple-600" />
          ) : (
            <Square className="h-4 w-4" />
          )}
          {allFilteredSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả trong danh sách'}
        </button>
        <div className="max-h-[520px] flex-1 space-y-1 overflow-y-auto">
          {filteredUsers.map((user) => {
            const checked = selectedUserIds.includes(user.id);
            return (
              <div
                key={user.id}
                className={`flex items-center gap-2 rounded-lg border px-2 py-2 transition-colors ${
                  checked ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-purple-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleSelectUser(user.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-4 w-4 shrink-0 accent-purple-600"
                />
                <button
                  type="button"
                  onClick={() => selectSingleUser(user.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700">
                    {user.full_name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{user.full_name}</p>
                    <p className="truncate text-xs text-gray-500">{user.email}</p>
                    {user.role && (
                      <p className="text-[10px] text-gray-400">{user.role}</p>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Panel quyền — toggle theo catalog */}
      <div className="col-span-8 rounded-xl border bg-white p-4 shadow-sm">
        {selectedUserIds.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-gray-400">
            <Users className="mb-2 h-12 w-12 opacity-30" />
            <p className="text-sm">Chọn một hoặc nhiều nhân viên để phân quyền</p>
            <p className="mt-1 text-xs">Bấm thẻ = chọn 1 người · Tick ô = chọn thêm nhiều người</p>
          </div>
        ) : loadingPerms ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
              <div>
                {isBulk ? (
                  <>
                    <h2 className="text-sm font-bold text-gray-900">
                      Phân quyền hàng loạt — {selectedUserIds.length} nhân viên
                    </h2>
                    <p className="mt-1 max-w-md truncate text-xs text-gray-500">
                      {selectedUsers.map((u) => u.full_name).join(', ')}
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="text-sm font-bold text-gray-900">{singleUser?.full_name}</h2>
                    <p className="text-xs text-gray-500">{singleUser?.email}</p>
                    {singleEffective?.system_role && (
                      <p className="mt-1 text-xs text-indigo-700">
                        Vai trò hệ thống: <strong>{singleEffective.system_role}</strong>
                      </p>
                    )}
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!isBulk && overrideCount > 0 && (
                  <button
                    type="button"
                    onClick={resetOverridesToRole}
                    disabled={saving}
                    title="Xóa mọi ghi đè tay — về quyền kế thừa vai trò"
                    className="flex h-9 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-sm text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Đặt lại theo vai trò ({overrideCount})
                  </button>
                )}
                {dirtyCount > 0 && (
                  <button
                    type="button"
                    onClick={resetDraft}
                    className="flex h-9 items-center gap-1 rounded-lg border px-3 text-sm hover:bg-gray-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Hoàn tác nháp
                  </button>
                )}
                <button
                  type="button"
                  onClick={saveChanges}
                  disabled={saving || dirtyCount === 0}
                  className="flex h-9 items-center gap-2 rounded-lg bg-purple-600 px-4 text-sm font-medium text-white hover:bg-purple-700 disabled:bg-gray-300"
                >
                  <Save className="h-4 w-4" />
                  {saving
                    ? 'Đang lưu...'
                    : dirtyCount
                      ? `Lưu (${dirtyCount})`
                      : 'Lưu'}
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                Luồng gán quyền (dễ · rõ nguồn)
              </p>
              <ol className="list-decimal space-y-1 pl-4 text-xs text-slate-700">
                <li>
                  <strong>Chọn vai trò mẫu</strong> bên dưới → bấm Áp dụng (ghi <code className="text-[10px]">users.role</code>).
                </li>
                <li>
                  <strong>Chỉnh từng toggle</strong> nếu cần — lưu thành ghi đè tay (ưu tiên cao nhất).
                </li>
                <li>
                  Dùng <strong>Đặt lại theo vai trò</strong> để xóa ghi đè, trở về kế thừa.
                </li>
              </ol>
              <p className="mt-2 text-[10px] text-slate-500">
                Vai trò theo module (CRM/SX/VC…) chỉnh ở trang Nhân viên. Membership dự án không nằm trong toggle này.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
              <div className="min-w-[200px] flex-1">
                <label className="mb-1 block text-[10px] font-bold uppercase text-indigo-800">
                  1) Áp dụng bộ quyền từ vai trò mẫu
                </label>
                <select
                  value={applyRoleId}
                  onChange={(e) => setApplyRoleId(e.target.value)}
                  className="h-9 w-full rounded-lg border bg-white px-2 text-sm"
                >
                  <option value="">— Chọn vai trò mẫu —</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} {r.description ? `(${r.description})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={applyRoleTemplate}
                disabled={saving || !applyRoleId}
                className="h-9 shrink-0 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-gray-300"
              >
                Áp dụng cho {selectedUserIds.length} người
              </button>
            </div>

            {roleOverlapWarning && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <p className="text-xs text-amber-900">{roleOverlapWarning}</p>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <p className="text-xs text-blue-800">
                <strong>2) Chỉnh tay:</strong> mỗi quyền là nút bật/tắt. Hover để xem nguồn (HT / module / ghi đè…).
                Module CRM/SX/VC: 3 cột Xem · Sửa · Admin.
                {applyRoleId && templatePreviewIds.size > 0 && (
                  <>
                    {' '}
                    Preview mẫu → nhãn &quot;Vai trò mẫu&quot;. Bấm <strong>Áp dụng</strong> mới ghi vai trò HT.
                  </>
                )}
                {isBulk && (
                  <>
                    {' '}
                    Toggle <strong>vàng</strong> = nhân viên đang khác nhau.
                  </>
                )}
              </p>
            </div>

            {!isBulk && singleEffective?.access_summary && (
              <>
                <PermissionAccessSummary summary={singleEffective.access_summary} />
                <PermissionProjectScopePanel scope={singleEffective.access_summary.project_scope} />
              </>
            )}

            <PermissionCatalogPanel
              catalog={catalog}
              activeModuleKey={activeModuleKey}
              onModuleChange={setActiveModuleKey}
              getChecked={getChecked}
              isIndeterminate={isIndeterminate}
              isDirty={isDirty}
              getSource={getSource}
              isDuplicateSource={isDuplicateSource}
              onToggle={onToggle}
              onToggleTier={onToggleTier}
              disabled={saving}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export { collectCatalogPermissionIds, buildChangePayload };
