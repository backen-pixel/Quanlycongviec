/**
 * Panel giải thích nguồn quyền (read-only) — không đổi enforcement.
 * Dữ liệu từ access_summary của GET /permissions/users/:id/effective.
 */

const MODULE_LABELS = {
  crm: 'CRM',
  production: 'SX',
  logistics: 'VC',
  accounting: 'Kế toán',
  purchasing: 'Mua hàng',
  tinhtoan: 'Tính toán',
};

function FlagChip({ on, children }) {
  if (!on) return null;
  return (
    <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
      {children}
    </span>
  );
}

export default function PermissionAccessSummary({ summary, compact = false }) {
  if (!summary) return null;

  const flags = summary.flags || {};
  const bypass = summary.middleware_bypass || {};
  const moduleRoles = summary.module_roles || {};
  const assigned = summary.assigned_roles || [];
  const scope = summary.project_scope || {};
  const notes = summary.notes || [];
  const precedence = summary.catalog_precedence || [];

  const moduleEntries = Object.entries(moduleRoles);
  const hasBypass = bypass.full_admin || bypass.workshop_resources;

  return (
    <div
      className={`rounded-lg border ${
        hasBypass ? 'border-amber-200 bg-amber-50/80' : 'border-slate-200 bg-slate-50'
      } ${compact ? 'p-2.5' : 'p-3'} space-y-2`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className={`font-bold text-slate-800 ${compact ? 'text-[11px]' : 'text-xs'}`}>
          Vì sao có quyền
        </p>
        {summary.system_role && (
          <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-800">
            HT: {summary.system_role}
          </span>
        )}
        <FlagChip on={flags.is_platform_admin}>platform_admin</FlagChip>
        <FlagChip on={flags.is_system_admin}>system admin</FlagChip>
        <FlagChip on={flags.is_tenant_admin}>admin HST</FlagChip>
        <FlagChip on={flags.is_company_scoped_admin}>admin công ty</FlagChip>
        <FlagChip on={flags.is_admin_like && !flags.is_platform_admin && !flags.is_system_admin}>
          admin-like
        </FlagChip>
        <FlagChip on={flags.is_production_admin}>SX admin</FlagChip>
        <FlagChip on={flags.is_production_staff}>SX staff</FlagChip>
        <FlagChip on={flags.is_logistics_admin}>VC admin</FlagChip>
      </div>

      {hasBypass && (
        <p className="text-[11px] leading-snug text-amber-900">
          {bypass.full_admin
            ? 'Middleware đang bypass hầu hết API (admin-like). Toggle catalog không phản ánh đủ quyền thực tế.'
            : 'Middleware mở một số resource xưởng theo role SX/VC — ngoài matrix checkbox.'}
        </p>
      )}

      {moduleEntries.length > 0 && (
        <p className="text-[11px] text-slate-700">
          <span className="font-semibold">Module:</span>{' '}
          {moduleEntries
            .map(([k, r]) => `${MODULE_LABELS[k] || k}:${r}`)
            .join(' · ')}
        </p>
      )}

      {assigned.length > 0 && (
        <p className="text-[11px] text-slate-700">
          <span className="font-semibold">Vai trò gán thêm:</span>{' '}
          {assigned.map((r) => r.role_name || r.role_id).filter(Boolean).join(', ')}
        </p>
      )}

      {(scope.production_staff_count > 0 || scope.lead_member_count > 0) && (
        <p className="text-[11px] text-slate-700">
          <span className="font-semibold">Phạm vi dự án:</span>{' '}
          {scope.production_staff_count > 0 && (
            <>{scope.production_staff_count} dự án SX</>
          )}
          {scope.production_staff_count > 0 && scope.lead_member_count > 0 && ' · '}
          {scope.lead_member_count > 0 && (
            <>{scope.lead_member_count} deal/lead</>
          )}
          <span className="text-slate-500"> — chi tiết ở khung bên dưới</span>
        </p>
      )}

      {!compact && precedence.length > 0 && (
        <p className="text-[10px] text-slate-500">
          Thứ tự catalog: {precedence.join(' → ')}
        </p>
      )}

      {notes.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-[10px] text-slate-600">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
