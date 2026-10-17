/**
 * Theo dõi route change → tự log 'navigate' để AI biết user vừa đi đâu.
 *
 * Đặt 1 lần trong ProtectedLayout (sau khi đã login).
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { logNavigate } from '../lib/activityLogger';

/**
 * Danh sách này từng chỉ phủ ~9 tiền tố route (crm/tasks/projects/messenger/dashboard/kpi/reports/
 * admin/settings) trong khi app thật có hơn 30 (management/sx/vc/ketoan/mua-hang/calc/drive/
 * knowledge/social...). Mọi route không khớp rơi vào module=null → báo cáo hành vi hiện "(không
 * rõ)" — từng chiếm SỐ LƯỢNG LỚN NHẤT trong "Phân hệ hay dùng" vì chính module Dự án
 * (`/management/work-unified`) và Sản xuất (`/sx`) đều chưa được liệt kê. Thêm route mới thì thêm
 * vào đây, đặt quy tắc CỤ THỂ hơn lên trước quy tắc chung (khớp đầu tiên thắng).
 */
const ROUTE_LABELS = [
  // CRM — các khu cụ thể trước, bắt chung /crm sau cùng
  { match: /^\/crm\/leads/, module: 'crm', label: 'Trang Lead CRM' },
  { match: /^\/crm\/deals/, module: 'crm', label: 'Trang Deal CRM' },
  { match: /^\/crm\/companies/, module: 'crm', label: 'Trang Công ty' },
  { match: /^\/crm\/kpi/, module: 'kpi', label: 'KPI CRM' },
  { match: /^\/crm\/reports/, module: 'reports', label: 'Báo cáo CRM' },
  { match: /^\/crm\/(facebook|zalo)/, module: 'crm', label: 'Kênh MXH (CRM)' },
  { match: /^\/crm\/messenger/, module: 'messenger', label: 'Messenger CRM' },
  { match: /^\/crm/, module: 'crm', label: 'Trang CRM' },

  // Dự án (Work Unified) — module chính của công việc/dự án, trước đây KHÔNG có trong danh sách
  { match: /^\/management\/work-unified/, module: 'projects', label: 'Trang dự án (Work Unified)' },
  { match: /^\/management\/production-overview/, module: 'production', label: 'Tổng quan sản xuất' },
  { match: /^\/management\/(behavior|backup-sync|mcp-api)/, module: 'admin', label: 'Giám sát / báo cáo quản trị' },
  { match: /^\/management\/project-tasks/, module: 'tasks', label: 'Tổng quan công việc dự án' },
  { match: /^\/management\/crm-overview/, module: 'crm', label: 'Tổng quan CRM' },
  { match: /^\/management/, module: 'management', label: 'Trang quản lý' },

  // Sản xuất / vận chuyển — layout riêng (`ProductionLayout`), trước đây KHÔNG có trong danh sách
  { match: /^\/sx/, module: 'production', label: 'Trang sản xuất' },
  { match: /^\/vc/, module: 'logistics', label: 'Trang vận chuyển' },

  { match: /^\/ketoan/, module: 'accounting', label: 'Trang kế toán' },
  { match: /^\/mua-hang/, module: 'purchasing', label: 'Trang mua hàng' },
  { match: /^\/calc/, module: 'calc', label: 'Công cụ tính toán' },

  { match: /^\/personal-tasks/, module: 'tasks', label: 'Việc cá nhân' },
  { match: /^\/tasks/, module: 'tasks', label: 'Trang công việc' },
  { match: /^\/projects/, module: 'projects', label: 'Trang dự án' },
  { match: /^\/messenger/, module: 'messenger', label: 'Trang Messenger' },
  { match: /^\/social/, module: 'social', label: 'Mạng nội bộ' },
  { match: /^\/drive/, module: 'drive', label: 'Lưu trữ file' },
  { match: /^\/knowledge/, module: 'knowledge', label: 'Đào tạo / kiến thức' },
  { match: /^\/dashboard/, module: 'dashboard', label: 'Dashboard' },
  { match: /^\/kpi/, module: 'kpi', label: 'Trang KPI' },
  { match: /^\/reports/, module: 'reports', label: 'Trang báo cáo' },

  // Danh mục / tổ chức / cấu hình hệ thống — gộp chung vào 'admin', ít lưu lượng hơn nên không cần tách riêng
  { match: /^\/(users|customers|products|companies|departments|teams|templates)/, module: 'admin', label: 'Danh mục / tổ chức' },
  { match: /^\/(admin|settings|ecosystem|platform|permissions|workflow|stage-groups|template-sets|m)/, module: 'admin', label: 'Trang quản trị' },
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
