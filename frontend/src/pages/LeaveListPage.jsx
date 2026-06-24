import { useMemo } from 'react';
import { useAuth } from '../lib/auth';
import { isSystemAdmin as checkSystemAdmin } from '../lib/adminRole';
import { useScopeFilter } from '../shared/hooks/useScopeFilter';
import LeaveScheduleShell from '../components/LeaveScheduleShell';
import LeaveListSection from '../components/LeaveListSection';

export default function LeaveListPage() {
  const { user } = useAuth();
  const isSystemAdmin = checkSystemAdmin(user);

  const scope = useScopeFilter({
    storageKey: 'leave_schedule',
    showCompany: true,
    showDepartment: true,
    showSearch: false,
    autoDefaultCompany: false,
    persist: true,
    departmentByCompany: true,
  });

  const effectiveCompanyId = useMemo(() => {
    if (isSystemAdmin && scope.companyId) return scope.companyId;
    const cid = user?.company_id != null ? String(user.company_id).trim() : '';
    return cid || '';
  }, [isSystemAdmin, scope.companyId, user?.company_id]);

  const isLeaveManager = useMemo(() => {
    const r = String(user?.role || '').toLowerCase();
    return ['admin', 'manager', 'director', 'supervisor', 'superadmin', 'super_admin', 'administrator', 'region_admin'].includes(r);
  }, [user?.role]);

  return (
    <LeaveScheduleShell>
      <LeaveListSection
        companyId={effectiveCompanyId || null}
        departmentId={scope.departmentId || null}
        isSystemAdmin={isSystemAdmin}
        scope={scope}
        currentUser={user || {}}
        isManager={isLeaveManager}
        persistUi
      />
    </LeaveScheduleShell>
  );
}
