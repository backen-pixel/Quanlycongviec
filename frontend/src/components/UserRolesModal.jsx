import { useState, useEffect, useMemo } from 'react';
import { Shield, Plus, X, Building2, Layers } from 'lucide-react';
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

/** API ecosystem: `level` là object { depth, name, slug, ... } */
function unitDepth(u) {
  const d = u.level?.depth;
  return typeof d === 'number' && !Number.isNaN(d) ? d : null;
}

function sortUnitsByOrder(units) {
  return [...units].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
}

/** Con trực tiếp thuộc parent và đúng cấp depth (Khối → Công ty → Phòng ban …). */
function childrenAtDepth(allUnits, parentId, depth) {
  const norm =
    parentId === undefined || parentId === null || parentId === ''
      ? null
      : String(parentId);
  const strict = allUnits.filter((u) => {
    const p = u.parent_id == null ? null : String(u.parent_id);
    const sameParent = norm == null ? p == null : p === norm;
    return sameParent && unitDepth(u) === depth;
  });
  if (strict.length) return sortUnitsByOrder(strict);
  const loose = allUnits.filter((u) => {
    const p = u.parent_id == null ? null : String(u.parent_id);
    return norm == null ? p == null : p === norm;
  });
  return sortUnitsByOrder(loose);
}

export default function UserRolesModal({ userId, userName, onClose, onSaved }) {
  const [roles, setRoles] = useState([]);
  const [userRoles, setUserRoles] = useState([]);
  const [ecosystemUnits, setEcosystemUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [rolesRes, userRolesRes, unitsRes] = await Promise.all([
        api.get('/permissions/roles'),
        api.get(`/permissions/users/${userId}/roles`),
        api.get('/ecosystem/units'), // Get all ecosystem units
      ]);
      
      setRoles(rolesRes.data.roles || []);
      setUserRoles(userRolesRes.data.user_roles || []);
      setEcosystemUnits(unitsRes.data.units || []);
    } catch (e) {
      console.error('Load user roles error:', e);
    }
    setLoading(false);
  };

  const assignRole = async (roleId, ecosystemUnitId = null) => {
    setSaving(true);
    try {
      await api.post(`/permissions/users/${userId}/roles`, {
        role_id: roleId,
        ecosystem_unit_id: ecosystemUnitId,
        granted_by: null,
      });
      await load();
    } catch (e) {
      alert('Lỗi: ' + (e.response?.data?.error || e.message));
    }
    setSaving(false);
  };

  const removeRole = async (userRoleId) => {
    if (!confirm('Xóa vai trò này?')) return;
    setSaving(true);
    try {
      await api.delete(`/permissions/user-roles/${userRoleId}`);
      await load();
    } catch (e) {
      alert('Lỗi: ' + (e.response?.data?.error || e.message));
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-6 max-w-3xl w-full">
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin h-8 w-8 border-4 border-purple-200 border-t-purple-600 rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl p-6 max-w-3xl w-full my-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Shield className="h-5 w-5 text-purple-600" />
              Phân quyền: {userName}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Gán vai trò theo cây: Khối → Công ty → Phòng ban → Team (lọc nối tiếp theo từng cấp)
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Info box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <p className="text-xs text-blue-800">
            💡 <strong>Phân quyền phân cấp:</strong> Chọn cấp gán (Khối / Công ty / …) rồi chọn đơn vị theo thứ tự từ trên xuống — mỗi bước chỉ hiện đơn vị con thuộc bước trước.
            Gán ở <strong>Khối</strong> → quyền trên toàn bộ cây con; gán <strong>Công ty</strong> → quyền trên PB/Team thuộc công ty đó. Toàn hệ thống → nút «Toàn hệ thống».
          </p>
        </div>

        {/* Current Roles */}
        <div className="mb-6">
          <h3 className="text-sm font-bold text-gray-700 mb-2">Vai trò hiện tại</h3>
          {userRoles.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Chưa có vai trò nào</p>
          ) : (
            <div className="space-y-2">
              {userRoles.map(ur => {
                const unit = ur.ecosystem_unit;
                const levelLabel = unit ? LEVEL_LABELS[unit.level] || 'Cấp ' + unit.level : null;
                const icon = unit ? LEVEL_ICONS[unit.level] : '🌐';
                
                return (
                  <div key={ur.id} className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <Shield className="h-4 w-4 text-purple-600 shrink-0" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-900">{ur.role?.name}</span>
                          {ur.role?.is_system && (
                            <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                              Hệ thống
                            </span>
                          )}
                        </div>
                        {unit ? (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs">{icon}</span>
                            <span className="text-xs text-purple-700 font-medium">{levelLabel}</span>
                            <span className="text-xs text-gray-500">→</span>
                            <span className="text-xs text-gray-600">{unit.name}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs">🌐</span>
                            <span className="text-xs text-gray-500">Toàn hệ thống</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => removeRole(ur.id)}
                      disabled={saving}
                      className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50"
                    >
                      Xóa
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add Role */}
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-2">Thêm vai trò mới</h3>
          <div className="space-y-2">
            {roles.map(role => (
              <RoleAssignRow
                key={role.id}
                role={role}
                ecosystemUnits={ecosystemUnits}
                onAssign={(unitId) => assignRole(role.id, unitId)}
                disabled={saving}
              />
            ))}
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

function RoleAssignRow({ role, ecosystemUnits, onAssign, disabled }) {
  const [targetDepth, setTargetDepth] = useState(null);
  /** Gốc cây khi có nhiều đơn vị không cha (cần trước khi chọn Khối). */
  const [anchorRootId, setAnchorRootId] = useState('');
  /** depth (0–4) → ecosystem_unit id đã chọn ở bước đó */
  const [pickByDepth, setPickByDepth] = useState({});
  const [expanded, setExpanded] = useState(false);

  const roots = useMemo(
    () => sortUnitsByOrder(ecosystemUnits.filter((u) => !u.parent_id)),
    [ecosystemUnits],
  );

  const depthsPresent = useMemo(() => {
    const s = new Set();
    ecosystemUnits.forEach((u) => {
      const d = unitDepth(u);
      if (d != null && d >= 0) s.add(d);
    });
    return [...s].sort((a, b) => a - b);
  }, [ecosystemUnits]);

  const resetScopePicks = () => {
    setPickByDepth({});
    setAnchorRootId(roots.length === 1 ? roots[0].id : '');
  };

  const setPickAtDepth = (depth, id) => {
    setPickByDepth((prev) => {
      const next = { ...prev, [depth]: id };
      for (const k of Object.keys(next)) {
        const d = Number(k);
        if (d > depth) delete next[k];
      }
      return next;
    });
  };

  const handleAssign = () => {
    let unitId = null;
    if (targetDepth === null) unitId = null;
    else if (targetDepth === 0) unitId = pickByDepth[0] || null;
    else unitId = pickByDepth[targetDepth] || null;
    onAssign(unitId);
    setTargetDepth(null);
    resetScopePicks();
    setExpanded(false);
  };

  const effectiveAnchor =
    roots.length === 1 ? roots[0]?.id || '' : anchorRootId;

  const canAssignScoped =
    targetDepth !== null &&
    (targetDepth === 0
      ? Boolean(pickByDepth[0])
      : (roots.length <= 1 || Boolean(effectiveAnchor)) &&
        Array.from({ length: targetDepth }, (_, i) => i + 1).every((d) => Boolean(pickByDepth[d])));

  const assignedUnitSummary = useMemo(() => {
    if (targetDepth === null) return null;
    if (targetDepth === 0) {
      const id = pickByDepth[0];
      return id ? ecosystemUnits.find((u) => u.id === id) : null;
    }
    const id = pickByDepth[targetDepth];
    return id ? ecosystemUnits.find((u) => u.id === id) : null;
  }, [targetDepth, pickByDepth, ecosystemUnits]);

  if (!expanded) {
    return (
      <button
        onClick={() => {
          setExpanded(true);
          setTargetDepth(null);
          setPickByDepth({});
          setAnchorRootId(roots.length === 1 ? roots[0]?.id || '' : '');
        }}
        disabled={disabled}
        className="w-full flex items-center gap-3 px-3 py-2 border border-gray-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-colors disabled:opacity-50"
      >
        <Plus className="h-4 w-4 text-purple-600" />
        <span className="text-sm font-medium text-gray-700">{role.name}</span>
        {role.description && (
          <span className="text-xs text-gray-400 ml-auto">{role.description}</span>
        )}
        {role.is_system && (
          <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full ml-2">
            Hệ thống
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="border-2 border-purple-300 rounded-lg p-4 bg-gradient-to-r from-purple-50 to-blue-50">
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-sm font-bold text-gray-900">{role.name}</span>
          {role.description && (
            <p className="text-xs text-gray-500 mt-0.5">{role.description}</p>
          )}
        </div>
        <button
          onClick={() => {
            setExpanded(false);
            setTargetDepth(null);
            resetScopePicks();
          }}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      
      <div className="space-y-3">
        {/* Level selector */}
        <div>
          <label className="text-xs font-semibold text-gray-700 block mb-1.5 flex items-center gap-1.5">
            <Layers className="h-3 w-3" />
            Cấp độ phân quyền
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                setTargetDepth(null);
                resetScopePicks();
              }}
              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                targetDepth === null
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white border-gray-300 text-gray-700 hover:border-indigo-400'
              }`}
            >
              🌐 Toàn hệ thống
            </button>
            {depthsPresent.map((depth) => (
              <button
                type="button"
                key={depth}
                onClick={() => {
                  setTargetDepth(depth);
                  resetScopePicks();
                  if (roots.length === 1) setAnchorRootId(roots[0].id);
                }}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                  targetDepth === depth
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-purple-400'
                }`}
              >
                {LEVEL_ICONS[depth]} {LEVEL_LABELS[depth] ?? `Cấp ${depth}`}
              </button>
            ))}
          </div>
        </div>

        {/* Nối tiếp: gốc (nếu nhiều) → Khối → Công ty → … */}
        {targetDepth !== null && targetDepth >= 1 && roots.length > 1 && (
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1.5 flex items-center gap-1.5">
              <Building2 className="h-3 w-3" />
              Chọn gốc (Tập đoàn)
            </label>
            <select
              value={anchorRootId}
              onChange={(e) => {
                const v = e.target.value;
                setAnchorRootId(v);
                setPickByDepth({});
              }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">-- Chọn đơn vị gốc --</option>
              {roots.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                  {unit.short_name ? ` (${unit.short_name})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {targetDepth === 0 && (
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1.5 flex items-center gap-1.5">
              <Building2 className="h-3 w-3" />
              Chọn {LEVEL_LABELS[0]}
            </label>
            <select
              value={pickByDepth[0] || ''}
              onChange={(e) => setPickAtDepth(0, e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">-- Chọn {LEVEL_LABELS[0]} --</option>
              {sortUnitsByOrder(ecosystemUnits.filter((u) => unitDepth(u) === 0)).map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                  {unit.short_name ? ` (${unit.short_name})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {targetDepth !== null &&
          targetDepth >= 1 &&
          (roots.length <= 1 || effectiveAnchor) &&
          Array.from({ length: targetDepth }, (_, idx) => idx + 1).map((depth) => {
            const parentId = depth === 1 ? effectiveAnchor : pickByDepth[depth - 1];
            const options = parentId ? childrenAtDepth(ecosystemUnits, parentId, depth) : [];
            const label = LEVEL_LABELS[depth] ?? `Cấp ${depth}`;
            return (
              <div key={depth}>
                <label className="text-xs font-semibold text-gray-700 block mb-1.5 flex items-center gap-1.5">
                  <Building2 className="h-3 w-3" />
                  Chọn {label}
                  {depth > 1 && (
                    <span className="font-normal text-gray-400">(theo {LEVEL_LABELS[depth - 1]?.toLowerCase() || 'cấp trên'} đã chọn)</span>
                  )}
                </label>
                <select
                  value={pickByDepth[depth] || ''}
                  onChange={(e) => setPickAtDepth(depth, e.target.value)}
                  disabled={!parentId}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100 disabled:text-gray-400"
                >
                  <option value="">-- Chọn {label} --</option>
                  {options.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                      {unit.short_name ? ` (${unit.short_name})` : ''}
                    </option>
                  ))}
                </select>
                {parentId && options.length === 0 && (
                  <p className="text-[11px] text-amber-700 mt-1">Không có {label.toLowerCase()} con trực tiếp dưới đơn vị đã chọn.</p>
                )}
              </div>
            );
          })}

        {/* Summary */}
        <div className="bg-white border border-purple-200 rounded-lg p-3">
          <p className="text-xs text-gray-700">
            {targetDepth === null ? (
              <>
                🌐 <strong>Phạm vi:</strong> Toàn bộ hệ thống (tất cả Khối, Công ty, Phòng ban, Team)
              </>
            ) : assignedUnitSummary ? (
              <>
                {LEVEL_ICONS[targetDepth]}{' '}
                <strong>Phạm vi:</strong> {LEVEL_LABELS[targetDepth] ?? `Cấp ${targetDepth}`} «
                {assignedUnitSummary.name}»
                {targetDepth < 4 && LEVEL_LABELS[targetDepth + 1] && (
                  <span className="block mt-1 text-gray-500">
                    → Bao gồm tất cả {LEVEL_LABELS[targetDepth + 1]} thuộc phạm vi này
                  </span>
                )}
              </>
            ) : (
              <>
                ⚠️ <strong>Chọn đủ các bước</strong> từ trên xuống (Khối → Công ty → …) để gán đúng phạm vi.
              </>
            )}
          </p>
        </div>
        
        <button
          onClick={handleAssign}
          disabled={disabled || (targetDepth !== null && !canAssignScoped)}
          className="w-full px-4 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Gán vai trò
        </button>
      </div>
    </div>
  );
}
