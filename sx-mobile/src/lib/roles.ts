/**
 * Mô hình vai trò phía app — phản chiếu backend `src/helpers/adminRole.js`.
 *
 * Quy ước dùng:
 *  - Màn hình nên hỏi NĂNG LỰC (`can*`) thay vì so sánh vai trò trực tiếp.
 *    Đổi chính sách thì sửa đúng file này, không phải đi sửa từng màn hình.
 *  - Ẩn nút chỉ là UX. Mọi thứ ẩn ở đây PHẢI được backend chặn lại
 *    (`middleware/newPermission.js`) — không coi đây là lớp bảo mật.
 */

/** Các vai trò backend đang phát hành. Giữ đồng bộ với `adminRole.js`. */
export type Role =
  | 'platform_admin'
  | 'ecosystem_admin'
  | 'admin'
  | 'sales_admin'
  | 'sales'
  | 'manager'
  | 'production_admin'
  | 'production_staff'
  | 'crm_production_admin'
  | 'crm_production_staff'
  | 'logistics_admin';

/** Phần thông tin user mà mọi hàm ở đây cần — khớp `AuthUser` nhưng lỏng hơn. */
export type RoleUser = {
  role?: string | null;
  company_id?: string | null;
  email?: string | null;
};

/** Khớp `normalizeRole` của backend: cắt khoảng trắng + hạ chữ thường. */
export function normalizeRole(role?: string | null): string {
  return String(role ?? '').trim().toLowerCase();
}

export function hasCompanyId(user?: RoleUser | null): boolean {
  return user?.company_id != null && String(user.company_id).trim() !== '';
}

function roleOf(user?: RoleUser | null): string {
  return normalizeRole(user?.role);
}

// ── Nhóm vai trò ───────────────────────────────────────────────────────────

/** Có quyền thao tác admin. Khớp `isAdminLike` của backend. */
export function isAdminLike(user?: RoleUser | null): boolean {
  const r = roleOf(user);
  return r === 'admin' || r === 'sales_admin' || r === 'platform_admin' || r === 'ecosystem_admin';
}

/** Chỉ `admin` / `ecosystem_admin` — KHÔNG gồm sales_admin. Khớp `isStrictAdmin`. */
export function isStrictAdmin(user?: RoleUser | null): boolean {
  const r = roleOf(user);
  return r === 'admin' || r === 'ecosystem_admin';
}

/** Admin hệ thống: `ecosystem_admin`, hoặc `admin` không khoá công ty. */
export function isSystemAdmin(user?: RoleUser | null): boolean {
  if (roleOf(user) === 'ecosystem_admin') return true;
  return roleOf(user) === 'admin' && !hasCompanyId(user);
}

/** Admin nhưng bị khoá trong một công ty (admin công ty hoặc sales_admin). */
export function isCompanyScopedAdmin(user?: RoleUser | null): boolean {
  if (roleOf(user) === 'ecosystem_admin') return false;
  return isAdminLike(user) && hasCompanyId(user);
}

export function isProductionAdmin(user?: RoleUser | null): boolean {
  const r = roleOf(user);
  return r === 'production_admin' || r === 'crm_production_admin' || r === 'crm_production_staff';
}

export function isProductionStaff(user?: RoleUser | null): boolean {
  const r = roleOf(user);
  return r === 'production_staff' || r === 'crm_production_staff';
}

// ── Năng lực (màn hình nên dùng nhóm này) ──────────────────────────────────

/**
 * Xem việc của cả nhóm, không chỉ việc mình.
 * Giữ nguyên danh sách vai trò của trang «Giao việc SX» trên web.
 */
export function canViewTeamWork(user?: RoleUser | null): boolean {
  const r = roleOf(user);
  return isAdminLike(user)
    || r === 'manager'
    || r === 'crm_production_admin'
    || r === 'production_admin';
}

/** Chọn công ty bất kỳ. Người bị khoá công ty luôn dùng công ty của mình. */
export function canPickAnyCompany(user?: RoleUser | null): boolean {
  return isSystemAdmin(user);
}

/** Xem mọi khu vực, không chỉ khu vực được phân (`crm_region_ids`). */
export function canSeeAllRegions(user?: RoleUser | null): boolean {
  return isAdminLike(user);
}

/** Xem toàn bộ danh sách công ty xưởng, không lọc theo công ty đặt hàng. */
export function canSeeAllWorkshopCompanies(user?: RoleUser | null): boolean {
  return isStrictAdmin(user);
}

/** Công ty bị khoá cho user này — `undefined` nghĩa là được chọn tự do. */
export function lockedCompanyIdFor(user?: RoleUser | null): string | undefined {
  if (canPickAnyCompany(user)) return undefined;
  return user?.company_id || undefined;
}

// ── Hiển thị ───────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  platform_admin: 'Quản trị nền tảng',
  ecosystem_admin: 'Quản trị hệ sinh thái',
  admin: 'Quản trị viên',
  sales_admin: 'Sales Admin',
  sales: 'Nhân viên kinh doanh',
  manager: 'Quản lý',
  production_admin: 'Quản trị SX',
  production_staff: 'Nhân viên SX',
  crm_production_admin: 'Quản trị CRM + SX',
  crm_production_staff: 'Nhân viên CRM + SX',
  logistics_admin: 'Quản trị vận chuyển',
};

export function roleLabel(user?: RoleUser | null): string {
  const r = roleOf(user);
  if (!r) return 'Nhân viên';
  if (isSystemAdmin(user)) return 'Quản trị hệ thống';
  return ROLE_LABELS[r] || String(user?.role);
}
