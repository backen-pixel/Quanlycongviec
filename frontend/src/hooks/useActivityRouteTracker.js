/**
 * Theo dõi route change → tự log 'navigate' để AI biết user vừa đi đâu.
 *
 * Đặt 1 lần trong ProtectedLayout (sau khi đã login).
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { logNavigate } from '../lib/activityLogger';

const ROUTE_LABELS = [
  { match: /^\/crm\/leads/, module: 'crm', label: 'Trang Lead CRM' },
  { match: /^\/crm\/deals/, module: 'crm', label: 'Trang Deal CRM' },
  { match: /^\/crm\/companies/, module: 'crm', label: 'Trang Công ty' },
  { match: /^\/crm/, module: 'crm', label: 'Trang CRM' },
  { match: /^\/tasks/, module: 'tasks', label: 'Trang công việc' },
  { match: /^\/projects/, module: 'projects', label: 'Trang dự án' },
  { match: /^\/messenger/, module: 'messenger', label: 'Trang Messenger' },
  { match: /^\/dashboard/, module: 'dashboard', label: 'Dashboard' },
  { match: /^\/kpi/, module: 'kpi', label: 'Trang KPI' },
  { match: /^\/reports/, module: 'reports', label: 'Trang báo cáo' },
  { match: /^\/admin/, module: 'admin', label: 'Trang quản trị' },
  { match: /^\/settings/, module: 'admin', label: 'Cấu hình' },
];

function labelFor(pathname) {
  for (const r of ROUTE_LABELS) {
    if (r.match.test(pathname)) return { module: r.module, label: r.label };
  }
  return { module: null, label: pathname };
}

export function useActivityRouteTracker(enabled) {
  const location = useLocation();
  const lastPathRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    const current = location.pathname + location.search;
    if (current === lastPathRef.current) return;
    const prev = lastPathRef.current;
    lastPathRef.current = current;

    const { module, label } = labelFor(location.pathname);
    logNavigate({
      path: current,
      referrer_path: prev,
      label: module ? `Vào ${label}` : `Vào ${current}`,
    });
  }, [enabled, location.pathname, location.search]);
}
