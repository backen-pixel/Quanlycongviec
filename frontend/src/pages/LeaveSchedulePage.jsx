import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { UserMinus, Calendar } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { isSystemAdmin as checkSystemAdmin } from '../lib/adminRole';
import { useScopeFilter } from '../shared/hooks/useScopeFilter';
import EventsOffLeaveSection from '../components/EventsOffLeaveSection';
import { loadLeaveScheduleUi, patchLeaveScheduleUi } from '../lib/leaveScheduleStorage';

export default function LeaveSchedulePage() {
  const { user } = useAuth();
  const isSystemAdmin = checkSystemAdmin(user);
  const saved = useMemo(() => loadLeaveScheduleUi(), []);

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

  const [mode, setMode] = useState(saved.mode);

  const handleModeChange = useCallback((next) => {
    setMode(next);
    patchLeaveScheduleUi({ mode: next });
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <UserMinus className="h-6 w-6 text-purple-600" /> Lịch nghỉ phép
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Lọc theo công ty, khu vực, nhân viên — lưu riêng khỏi trang Sự kiện
          </p>
        </div>
        <Link
          to="/crm/events"
          className="h-9 px-3 border rounded-lg text-sm font-medium flex items-center gap-1.5 text-gray-700 hover:bg-gray-50"
        >
          <Calendar className="h-4 w-4 text-blue-600" /> Sự kiện CRM
        </Link>
      </div>

      <EventsOffLeaveSection
        mode={mode}
        onModeChange={handleModeChange}
        companyId={effectiveCompanyId || null}
        departmentId={scope.departmentId || null}
        isSystemAdmin={isSystemAdmin}
        scope={scope}
        currentUser={user || {}}
        isManager={isLeaveManager}
        persistUi
      />
    </div>
  );
}
