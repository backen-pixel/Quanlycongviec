import PermissionToggleSwitch from './PermissionToggleSwitch';

export const SOURCE_LABELS = {
  system_role: 'Vai trò HT',
  assigned_role: 'Gán thêm',
  module_role: 'Vai trò module',
  role: 'Vai trò',
  override_grant: 'Ghi đè',
  override_deny: 'Thu hồi',
  template_preview: 'Vai trò mẫu',
  none: '',
};

/** Tooltip giải thích nguồn — không đổi logic quyền. */
export const SOURCE_HINTS = {
  system_role: 'Kế thừa từ users.role (vai trò hệ thống) → role_permissions',
  assigned_role: 'Kế thừa từ vai trò gán thêm (user_roles)',
  module_role: 'Kế thừa từ vai trò theo module (user_module_roles)',
  role: 'Kế thừa từ vai trò',
  override_grant: 'Ghi đè bật tay (user_permissions) — ưu tiên cao hơn vai trò',
  override_deny: 'Ghi đè tắt tay — thu hồi dù vai trò vẫn có',
  template_preview: 'Xem trước quyền của vai trò mẫu — chưa lưu cho đến khi bấm Áp dụng',
  none: '',
};

export function sourceTooltip(source, { duplicate = false, featureLabel = '' } = {}) {
  const base = SOURCE_HINTS[source] || (source && source !== 'none' ? `Nguồn: ${source}` : '');
  const parts = [featureLabel, base].filter(Boolean);
  if (duplicate) {
    parts.push('Trùng HT + module — kết quả vẫn chỉ một lần cho phép');
  }
  return parts.join(' · ');
}

export function cascadeTierDraft(levels, action, value) {
  const byAction = Object.fromEntries(levels.map((l) => [l.action, l]));
  const updates = {};
  const set = (act, v) => {
    const id = byAction[act]?.permission?.id;
    if (id) updates[id] = v;
  };
  set(action, value);
  if (action === 'admin' && value) {
    set('view', true);
    set('edit', true);
  } else if (action === 'edit' && value) {
    set('view', true);
  } else if (action === 'view' && !value) {
    set('edit', false);
    set('admin', false);
  } else if (action === 'edit' && !value) {
    set('admin', false);
  }
  return updates;
}

/**
 * @param {object} props
 * @param {object} props.catalog — { modules: [] }
 * @param {string} props.activeModuleKey
 * @param {function} props.onModuleChange
 * @param {function} props.getChecked — (permissionId) => boolean
 * @param {function} [props.isIndeterminate] — (permissionId) => boolean
 * @param {function} [props.isDirty] — (permissionId) => boolean
 * @param {function} [props.getSource] — (permissionId) => string | null
 * @param {function} [props.isDuplicateSource] — (permissionId) => boolean — cùng lúc system + module
 * @param {function} props.onToggle — (permissionId, boolean) => void
 * @param {function} props.onToggleTier — (feature, action, boolean) => void
 * @param {boolean} props.disabled
 */
export default function PermissionCatalogPanel({
  catalog,
  activeModuleKey,
  onModuleChange,
  getChecked,
  isIndeterminate = () => false,
  isDirty = () => false,
  getSource = () => null,
  isDuplicateSource = () => false,
  onToggle,
  onToggleTier,
  disabled = false,
  emptyHint = 'Không có quyền trong module này',
}) {
  const activeModule = catalog?.modules?.find((m) => m.key === activeModuleKey);

  const renderTierRow = (feat) => (
    <div
      key={feat.key}
      className={`grid grid-cols-[minmax(0,1fr)_80px_80px_80px] items-center gap-2 border-b px-3 py-2.5 last:border-b-0 ${
        feat.levels.some((l) => l.permission && isDirty(l.permission.id))
          ? 'bg-amber-50'
          : 'hover:bg-gray-50/80'
      }`}
    >
      <div>
        <p className="text-sm font-medium text-gray-900">{feat.label}</p>
        <p className="text-[10px] text-gray-400">{feat.resource}</p>
      </div>
      {feat.levels.map((level) => {
        const id = level.permission?.id;
        if (!id) {
          return (
            <span key={level.action} className="text-center text-[10px] text-gray-300">
              —
            </span>
          );
        }
        const checked = getChecked(id);
        const indeterminate = isIndeterminate(id);
        const dirty = isDirty(id);
        const src = getSource(id);
        const dup = !dirty && isDuplicateSource(id);
        const tip = sourceTooltip(dirty ? null : src, {
          duplicate: dup,
          featureLabel: `${feat.label} — ${level.label}`,
        });
        return (
          <div key={level.action} className="flex flex-col items-center gap-1" title={tip || undefined}>
            <PermissionToggleSwitch
              checked={checked}
              indeterminate={indeterminate}
              onChange={(v) => onToggleTier(feat, level.action, v)}
              disabled={disabled}
              label={tip || `${feat.label} — ${level.label}`}
              size="sm"
            />
            <span className="text-[9px] font-medium text-gray-500">{level.label}</span>
            {dirty ? (
              <span className="text-[9px] text-amber-700">mới</span>
            ) : src && src !== 'none' ? (
              <span
                className={`text-[9px] ${dup ? 'font-medium text-amber-700' : 'text-gray-400'}`}
                title={tip || undefined}
              >
                {SOURCE_LABELS[src] || src}
                {dup ? ' · trùng' : ''}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );

  const renderLegacyRow = (perm) => {
    const checked = getChecked(perm.id);
    const indeterminate = isIndeterminate(perm.id);
    const dirty = isDirty(perm.id);
    const src = getSource(perm.id);
    const dup = !dirty && isDuplicateSource(perm.id);
    const tip = sourceTooltip(dirty ? null : src, {
      duplicate: dup,
      featureLabel: perm.label,
    });
    return (
      <div
        key={perm.id}
        className={`flex items-center justify-between gap-3 px-3 py-2.5 ${
          dirty ? 'bg-amber-50' : 'hover:bg-gray-50/80'
        }`}
        title={tip || undefined}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-900">{perm.label}</p>
          <p className="text-[10px] text-gray-400">
            {perm.resource}:{perm.action}
          </p>
          {!dirty && src && src !== 'none' && (
            <span
              className={`text-[10px] ${dup ? 'font-medium text-amber-700' : 'text-gray-400'}`}
              title={tip || undefined}
            >
              {SOURCE_LABELS[src] || src}
              {dup ? ' · trùng nguồn' : ''}
            </span>
          )}
          {dirty && <span className="text-[10px] text-amber-700">Chưa lưu</span>}
        </div>
        <PermissionToggleSwitch
          checked={checked}
          indeterminate={indeterminate}
          onChange={(v) => onToggle(perm.id, v)}
          disabled={disabled}
          label={tip || perm.label}
        />
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {(catalog?.modules || []).map((mod) => (
          <button
            key={mod.key}
            type="button"
            onClick={() => onModuleChange(mod.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeModuleKey === mod.key
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {mod.icon} {mod.label}
          </button>
        ))}
      </div>

      {activeModule ? (
        <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
          {activeModule.displayMode === 'tiered'
            ? (activeModule.groups || []).map((group) => (
                <div key={group.key} className="overflow-hidden rounded-xl border bg-white shadow-sm">
                  <div className="border-b bg-gradient-to-r from-purple-50 to-indigo-50 px-3 py-2">
                    <h3 className="text-xs font-bold text-gray-800">{group.label}</h3>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_80px_80px_80px] gap-2 border-b bg-gray-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-600">
                    <span>Chức năng</span>
                    <span className="text-center">Xem</span>
                    <span className="text-center">Sửa</span>
                    <span className="text-center">Admin</span>
                  </div>
                  {group.features.map(renderTierRow)}
                </div>
              ))
            : (activeModule.features || []).map((feat) => (
                <div key={feat.key} className="overflow-hidden rounded-xl border bg-white shadow-sm">
                  <div className="border-b bg-gray-50 px-3 py-2">
                    <h3 className="text-xs font-bold text-gray-800">{feat.label}</h3>
                  </div>
                  <div className="divide-y">{feat.permissions.map(renderLegacyRow)}</div>
                </div>
              ))}
        </div>
      ) : (
        <p className="py-12 text-center text-sm text-gray-400">{emptyHint}</p>
      )}
    </div>
  );
}
