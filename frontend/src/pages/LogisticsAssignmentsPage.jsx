import CRMAssignmentsPage from './CRMAssignmentsPage';

/**
 * Giao việc Lắp đặt — cùng UX với Giao việc CRM/SX, lọc assignment_module=logistics.
 */
export default function LogisticsAssignmentsPage() {
  return (
    <CRMAssignmentsPage
      apiBase="/crm/assignments"
      pageTitle="Giao việc Lắp đặt"
      companiesModule="logistics"
      assignmentModule="logistics"
      storagePrefix="vc_assignments"
      dashboardLink="/vc/dashboard"
    />
  );
}
