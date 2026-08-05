import CRMAssignmentsPage from './CRMAssignmentsPage';

/**
 * Giao việc Sản xuất — cùng UX với Giao việc CRM, lọc assignment_module=production.
 * Nhiệm vụ tự sinh khi thẻ vào cột pipeline (bộ mẫu + Bàn giao CRM → SX).
 */
export default function ProductionAssignmentsPage() {
  return (
    <CRMAssignmentsPage
      apiBase="/crm/assignments"
      pageTitle="Giao việc Sản xuất"
      companiesModule="production"
      assignmentModule="production"
      storagePrefix="sx_assignments"
      dashboardLink="/sx/dashboard"
    />
  );
}
