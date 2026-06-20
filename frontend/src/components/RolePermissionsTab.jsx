import { useState, useEffect, useMemo } from 'react';
import { Shield, Save, RotateCcw } from 'lucide-react';
import api from '../lib/api';
import PermissionCatalogPanel, { cascadeTierDraft } from './permissions/PermissionCatalogPanel';

export default function RolePermissionsTab({ roles: initialRoles = [] }) {
  const [roles, setRoles] = useState(initialRoles);
  const [catalog, setCatalog] = useState({ modules: [] });
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [grantedIds, setGrantedIds] = useState(new Set());
  const [draftIds, setDraftIds] = useState(null);
  const [activeModuleKey, setActiveModuleKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingRole, setLoadingRole] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const effectiveSet = draftIds !== null ? draftIds : grantedIds;
  const isSystemLocked = selectedRole?.is_system === true;

  useEffect(() => {
    if (initialRoles?.length) setRoles(initialRoles);
  }, [initialRoles]);

  useEffect(() => {
    loadCatalog();
  }, []);

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/permissions/catalog');
      setCatalog(data);
      if (data.modules?.length && !activeModuleKey) {
        setActiveModuleKey(data.modules[0].key);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const selectRole = async (roleId) => {
    setSelectedRoleId(roleId);
    setDraftIds(null);
    setLoadingRole(true);
    try {
      const { data } = await api.get(`/permissions/roles/${roleId}/permissions`);
      const ids = new Set((data.permissions || []).map((p) => p.id));
      setGrantedIds(ids);
    } catch (e) {
      console.error(e);
      setGrantedIds(new Set());
    }
    setLoadingRole(false);
  };

  const getChecked = (permissionId) => effectiveSet.has(permissionId);

  const isDirty = (permissionId) => {
    if (draftIds === null) return false;
    const was = grantedIds.has(permissionId);
    const now = draftIds.has(permissionId);
    return was !== now;
  };

  const updateDraft = (updater) => {
    setDraftIds((prev) => {
      const base = prev !== null ? new Set(prev) : new Set(grantedIds);
      updater(base);
      return base;
    });
  };

  const onToggle = (permissionId, value) => {
    if (isSystemLocked) return;
    updateDraft((set) => {
      if (value) set.add(permissionId);
      else set.delete(permissionId);
    });
  };

  const onToggleTier = (feature, action, value) => {
    if (isSystemLocked) return;
    const updates = cascadeTierDraft(feature.levels, action, value);
    updateDraft((set) => {
      Object.entries(updates).forEach(([id, v]) => {
        if (v) set.add(id);
        else set.delete(id);
      });
    });
  };

  const dirtyCount = useMemo(() => {
    if (draftIds === null) return 0;
    let n = 0;
    const all = new Set([...grantedIds, ...draftIds]);
    all.forEach((id) => {
      if (grantedIds.has(id) !== draftIds.has(id)) n += 1;
    });
    return n;
  }, [draftIds, grantedIds]);

  const save = async () => {
    if (!selectedRoleId || draftIds === null) return;
    setSaving(true);
    try {
      await api.put(`/permissions/roles/${selectedRoleId}/permissions`, {
        permission_ids: [...draftIds],
      });
      setGrantedIds(new Set(draftIds));
      setDraftIds(null);
      alert('✅ Đã lưu bộ quyền vai trò mẫu');
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

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-4 space-y-2">
        <h2 className="px-1 text-sm font-bold text-gray-700">Vai trò mẫu</h2>
        {roles.map((role) => {
          const isSelected = selectedRoleId === role.id;
          return (
            <button
              key={role.id}
              type="button"
              onClick={() => selectRole(role.id)}
              className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                isSelected
                  ? 'border-purple-500 bg-purple-50 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-purple-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Shield className={`h-4 w-4 ${isSelected ? 'text-purple-600' : 'text-gray-400'}`} />
                <span className="text-sm font-bold text-gray-900">{role.name}</span>
                {role.is_system && (
                  <span className="ml-auto rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] text-blue-700">
                    Hệ thống
                  </span>
                )}
              </div>
              {role.description && (
                <p className="mt-1 text-xs text-gray-500">{role.description}</p>
              )}
            </button>
          );
        })}
      </div>

      <div className="col-span-8 rounded-xl border bg-white p-4 shadow-sm">
        {!selectedRole ? (
          <div className="flex h-64 flex-col items-center justify-center text-gray-400">
            <Shield className="mb-2 h-12 w-12 opacity-30" />
            <p className="text-sm">Chọn vai trò mẫu để cấu hình bộ quyền</p>
          </div>
        ) : loadingRole ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
              <div>
                <h2 className="text-sm font-bold text-gray-900">Bộ quyền: {selectedRole.name}</h2>
                <p className="text-xs text-gray-500">
                  {effectiveSet.size} quyền đang bật — dùng làm mẫu cho users.role và gán NV
                </p>
              </div>
              <div className="flex gap-2">
                {dirtyCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setDraftIds(null)}
                    className="flex h-9 items-center gap-1 rounded-lg border px-3 text-sm"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Hoàn tác
                  </button>
                )}
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || dirtyCount === 0 || isSystemLocked}
                  className="flex h-9 items-center gap-2 rounded-lg bg-purple-600 px-4 text-sm font-medium text-white disabled:bg-gray-300"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Đang lưu...' : dirtyCount ? `Lưu (${dirtyCount})` : 'Lưu'}
                </button>
              </div>
            </div>

            {isSystemLocked && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                Vai trò hệ thống — chỉ xem, không chỉnh sửa bộ quyền mẫu.
              </div>
            )}

            <PermissionCatalogPanel
              catalog={catalog}
              activeModuleKey={activeModuleKey}
              onModuleChange={setActiveModuleKey}
              getChecked={getChecked}
              isDirty={isDirty}
              onToggle={onToggle}
              onToggleTier={onToggleTier}
              disabled={saving || isSystemLocked}
            />
          </div>
        )}
      </div>
    </div>
  );
}
