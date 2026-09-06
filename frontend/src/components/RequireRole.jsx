import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import {
  isCrmModuleAdmin,
  canAccessCrmSocialInbox,
  isPlatformAdmin,
  isStrictAdmin,
} from '../lib/adminRole';

/** Giám đốc / quản lý / admin KV / sales_admin xem KPI & báo cáo nhân viên — khớp backend CRM report */
const EXEC_ROLES = ['admin', 'manager', 'director', 'supervisor', 'superadmin', 'super_admin', 'region_admin', 'sales_admin', 'crm_production_admin'];

/**
 * Trang KPI Giám đốc và báo cáo cấp cao
 */
export function RequireExecutive({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin h-8 w-8 border-3 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!EXEC_ROLES.includes(user.role)) return <Navigate to="/crm/dashboard" replace />;
  return children;
}

/** Founder Cockpit contains cross-domain executive data: strict admin only. */
export function RequireFounder({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-indigo-600 border-t-transparent" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!isStrictAdmin(user)) return <Navigate to="/dashboard" replace />;
  return children;
}

/**
 * Chức năng CRM chỉ admin (báo cáo, cấu hình pipeline, MISA, API, mẫu task…)
 */
export function RequireCrmElevated({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin h-8 w-8 border-3 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!isCrmModuleAdmin(user)) return <Navigate to="/crm/dashboard" replace />;
  return children;
}

/**
 * Platform Admin — chỉ platform_admin mới vào được trang quản lý SaaS.
 */
export function RequirePlatformAdmin({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin h-8 w-8 border-3 border-teal-600 border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!isPlatformAdmin(user)) return <Navigate to="/dashboard" replace />;
  return children;
}

/**
 * Facebook / Zalo OA — admin CRM hoặc user được cấp quyền hộp thư riêng.
 */
export function RequireCrmSocialInbox({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin h-8 w-8 border-3 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!canAccessCrmSocialInbox(user)) return <Navigate to="/crm/dashboard" replace />;
  return children;
}
