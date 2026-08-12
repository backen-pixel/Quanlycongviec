import { useMemo } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import CRMAssignmentsPage from './CRMAssignmentsPage';

/**
 * Giao việc module tùy chỉnh — cùng UX CRM/SX/VC,
 * lọc assignment_module = app_modules.module_key.
 */
export default function CustomModuleAssignmentsPage() {
  const { moduleKey: paramKey } = useParams();
  const ctx = useOutletContext() || {};
  const moduleKey = String(ctx.moduleKey || paramKey || '').trim().toLowerCase();
  const modName = ctx.mod?.name || moduleKey || 'Module';

  const pageTitle = useMemo(
    () => `Giao việc ${modName}`,
    [modName],
  );

  if (!moduleKey) {
    return (
      <div className="p-6 text-sm text-gray-500">
        Không xác định được module.
      </div>
    );
  }

  return (
    <CRMAssignmentsPage
      apiBase="/crm/assignments"
      pageTitle={pageTitle}
      companiesModule={moduleKey}
      assignmentModule={moduleKey}
      storagePrefix={`m_${moduleKey}_assignments`}
      dashboardLink={`/m/${moduleKey}`}
    />
  );
}
