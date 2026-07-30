import LeadMemberAssignmentsPanel from './LeadMemberAssignmentsPanel';
import CRMTasksTab from './CRMTasksTab';

/**
 * Tab «Không gian chung» — phân công thành viên deal + nhiệm vụ giao chéo công ty.
 */
export default function DealSharedWorkspaceTab({
  leadId,
  leadType = 'deal',
  users = [],
  taskScope = 'production',
  /** Tab phân công mặc định: all | crm | production | logistics */
  defaultAssignModule = null,
  /** Công ty CRM của deal */
  companyId = null,
  /** Công ty xưởng SX (nếu khác CRM) */
  sxCompanyId = null,
  /** Công ty VC (nếu khác CRM) */
  vcCompanyId = null,
  onArtifactsSynced = null,
  linkedProjectId = null,
  embeddedSxKanbanStages = null,
  embeddedVcKanbanStages = null,
  embeddedWorkshopTypeId = null,
  sxTemplateCompanyId = null,
  vcTemplateCompanyId = null,
  dealResponsible = null,
  workshopProject = null,
  refreshKey = null,
}) {
  if (!leadId) {
    return (
      <p className="text-sm text-gray-500 text-center py-8">
        Cần deal CRM gắn dự án để dùng Không gian chung.
      </p>
    );
  }

  const sharedLabel = taskScope === 'logistics'
    ? 'Nhiệm vụ giao chéo (VC/LĐ)'
    : taskScope === 'production'
      ? 'Nhiệm vụ giao chéo công ty (SX)'
      : 'Nhiệm vụ giao chéo công ty';

  const assignModule = defaultAssignModule
    || (taskScope === 'logistics' ? 'logistics'
      : taskScope === 'production' ? 'production'
        : 'crm');

  const resolvedCompanyId = companyId
    || dealResponsible?.company_id
    || null;
  const resolvedSxCompanyId = sxCompanyId || sxTemplateCompanyId || resolvedCompanyId;
  const resolvedVcCompanyId = vcCompanyId || vcTemplateCompanyId || resolvedCompanyId;

  return (
    <div className="space-y-8">
      <LeadMemberAssignmentsPanel
        leadId={leadId}
        defaultModule={assignModule}
        companyId={resolvedCompanyId}
        sxCompanyId={resolvedSxCompanyId}
        vcCompanyId={resolvedVcCompanyId}
      />

      <div className="border-t border-gray-100 pt-6 space-y-3">
        <div>
          <p className="text-sm font-semibold text-indigo-900">{sharedLabel}</p>
          <p className="text-[11px] text-indigo-700/80 mt-0.5">
            Nhiệm vụ / checklist được giao cho công ty đối tác — xem và cập nhật tại đây.
          </p>
        </div>
        <CRMTasksTab
          key={`shared-workspace-${leadId}-${taskScope}`}
          leadId={leadId}
          leadType={leadType}
          users={users}
          taskScope={taskScope}
          taskCompanyScope="shared"
          onArtifactsSynced={onArtifactsSynced}
          linkedProjectId={linkedProjectId}
          embeddedSxKanbanStages={embeddedSxKanbanStages}
          embeddedVcKanbanStages={embeddedVcKanbanStages}
          embeddedWorkshopTypeId={embeddedWorkshopTypeId}
          sxTemplateCompanyId={sxTemplateCompanyId}
          vcTemplateCompanyId={vcTemplateCompanyId}
          dealResponsible={dealResponsible}
          workshopProject={workshopProject}
          refreshKey={refreshKey}
        />
      </div>
    </div>
  );
}
