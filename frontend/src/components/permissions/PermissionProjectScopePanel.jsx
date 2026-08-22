/**
 * Panel read-only: membership dự án / deal — tách khỏi toggle quyền catalog.
 * Dữ liệu từ access_summary.project_scope.
 */

function labelOf(item) {
  if (item.name) return item.name;
  if (item.title) return item.title;
  if (item.code) return item.code;
  return item.project_id || item.lead_id || '—';
}

export default function PermissionProjectScopePanel({ scope, compact = false }) {
  if (!scope) return null;

  const staffCount = scope.production_staff_count || 0;
  const leadCount = scope.lead_member_count || 0;
  const projects = scope.production_projects || [];
  const leads = scope.lead_memberships || [];
  const sampleLimit = scope.sample_limit || 8;

  if (staffCount === 0 && leadCount === 0) {
    return (
      <div className={`rounded-lg border border-dashed border-slate-200 bg-white ${compact ? 'p-2.5' : 'p-3'}`}>
        <p className={`font-bold text-slate-700 ${compact ? 'text-[11px]' : 'text-xs'}`}>
          Dự án / deal được gán
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          Chưa có membership trên <code className="text-[10px]">project_production_staff</code> /{' '}
          <code className="text-[10px]">lead_members</code>. Đây là phạm vi dữ liệu, không phải toggle quyền.
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-teal-200 bg-teal-50/60 ${compact ? 'p-2.5' : 'p-3'} space-y-2.5`}>
      <div>
        <p className={`font-bold text-teal-900 ${compact ? 'text-[11px]' : 'text-xs'}`}>
          Dự án / deal được gán
        </p>
        <p className="mt-0.5 text-[10px] text-teal-800/80">
          Phạm vi dữ liệu (membership) — không hiện trên checkbox quyền catalog. Chỉ xem, không sửa tại đây.
        </p>
      </div>

      {staffCount > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-teal-900">
            NV SX trên dự án · {staffCount}
            {projects.length < staffCount ? ` (hiện ${projects.length}/${staffCount})` : ''}
          </p>
          <ul className="mt-1 max-h-28 space-y-0.5 overflow-y-auto">
            {projects.map((p) => (
              <li
                key={p.project_id}
                className="flex items-center gap-1.5 truncate rounded bg-white/80 px-2 py-1 text-[11px] text-slate-700"
              >
                <span className="truncate font-medium">{labelOf(p)}</span>
                {p.code && p.name && (
                  <span className="shrink-0 text-[10px] text-slate-400">{p.code}</span>
                )}
                {p.is_primary && (
                  <span className="shrink-0 rounded bg-teal-100 px-1 text-[9px] font-semibold text-teal-800">
                    chính
                  </span>
                )}
              </li>
            ))}
          </ul>
          {staffCount > sampleLimit && (
            <p className="mt-0.5 text-[10px] text-teal-700/70">
              Còn {staffCount - projects.length} dự án khác (không liệt kê đủ).
            </p>
          )}
        </div>
      )}

      {leadCount > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-teal-900">
            Thành viên deal/lead · {leadCount}
            {leads.length < leadCount ? ` (hiện ${leads.length}/${leadCount})` : ''}
          </p>
          <ul className="mt-1 max-h-28 space-y-0.5 overflow-y-auto">
            {leads.map((l) => (
              <li
                key={l.lead_id}
                className="flex items-center gap-1.5 truncate rounded bg-white/80 px-2 py-1 text-[11px] text-slate-700"
              >
                <span className="truncate font-medium">{labelOf(l)}</span>
                {l.type && (
                  <span className="shrink-0 rounded bg-slate-100 px-1 text-[9px] text-slate-600">
                    {l.type}
                  </span>
                )}
                {l.role && l.role !== 'member' && (
                  <span className="shrink-0 text-[10px] text-slate-400">{l.role}</span>
                )}
              </li>
            ))}
          </ul>
          {leadCount > sampleLimit && (
            <p className="mt-0.5 text-[10px] text-teal-700/70">
              Còn {leadCount - leads.length} membership khác (không liệt kê đủ).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
