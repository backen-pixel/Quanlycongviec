import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/** Giám đốc / quản lý xem KPI — khớp EXEC_ROLES trong ExecutiveKpiPage */
const EXEC_ROLES = ['admin', 'manager', 'director', 'supervisor'];

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
  if (user.role !== 'admin') return <Navigate to="/crm/dashboard" replace />;
  return children;
}
