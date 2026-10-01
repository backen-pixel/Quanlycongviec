import { describe, expect, test } from 'vitest';
import {
  canPickAnyCompany,
  canSeeAllRegions,
  canSeeAllWorkshopCompanies,
  canViewTeamWork,
  hasCompanyId,
  isAdminLike,
  isCompanyScopedAdmin,
  isProductionAdmin,
  isProductionStaff,
  isStrictAdmin,
  isSystemAdmin,
  lockedCompanyIdFor,
  normalizeRole,
  roleLabel,
} from '../src/lib/roles';
import type { RoleUser } from '../src/lib/roles';

/**
 * Chốt mô hình vai trò của app. Trước khi dọn về `lib/roles.ts`, logic này nằm
 * rải rác ở 8 file dưới dạng so chuỗi `role === 'admin'` — sai một ký tự là âm
 * thầm cấp quyền hoặc ẩn mất chức năng.
 */

const CO = 'c0000000-0000-0000-0000-000000000001';

function u(role?: string | null, company_id?: string | null): RoleUser {
  return { role, company_id };
}

describe('normalizeRole / hasCompanyId', () => {
  test('cắt khoảng trắng và hạ chữ thường', () => {
    expect(normalizeRole('  Admin ')).toBe('admin');
    expect(normalizeRole('SALES_ADMIN')).toBe('sales_admin');
  });

  test('null / undefined / rỗng đều ra chuỗi rỗng', () => {
    expect(normalizeRole(null)).toBe('');
    expect(normalizeRole(undefined)).toBe('');
    expect(normalizeRole('   ')).toBe('');
  });

  test('company_id rỗng hoặc toàn khoảng trắng coi như không có', () => {
    expect(hasCompanyId(u('admin', CO))).toBe(true);
    expect(hasCompanyId(u('admin', ''))).toBe(false);
    expect(hasCompanyId(u('admin', '   '))).toBe(false);
    expect(hasCompanyId(u('admin', null))).toBe(false);
    expect(hasCompanyId(null)).toBe(false);
  });
});

describe('isAdminLike', () => {
  test.each(['admin', 'sales_admin', 'platform_admin', 'ecosystem_admin'])('%s → true', (r) => {
    expect(isAdminLike(u(r, CO))).toBe(true);
  });

  test.each(['manager', 'production_admin', 'production_staff', 'sales', 'logistics_admin', ''])(
    '%s → false',
    (r) => {
      expect(isAdminLike(u(r, CO))).toBe(false);
    },
  );
});

describe('isStrictAdmin — không gồm sales_admin', () => {
  test('admin và ecosystem_admin', () => {
    expect(isStrictAdmin(u('admin', CO))).toBe(true);
    expect(isStrictAdmin(u('ecosystem_admin', CO))).toBe(true);
  });

  test('sales_admin bị loại — đây là khác biệt chính so với isAdminLike', () => {
    expect(isAdminLike(u('sales_admin', CO))).toBe(true);
    expect(isStrictAdmin(u('sales_admin', CO))).toBe(false);
  });
});

describe('isSystemAdmin', () => {
  test('admin không gắn công ty → admin hệ thống', () => {
    expect(isSystemAdmin(u('admin', null))).toBe(true);
    expect(isSystemAdmin(u('admin', ''))).toBe(true);
  });

  test('admin có gắn công ty → KHÔNG phải admin hệ thống', () => {
    expect(isSystemAdmin(u('admin', CO))).toBe(false);
  });

  test('ecosystem_admin luôn là admin hệ thống, kể cả khi gắn công ty', () => {
    expect(isSystemAdmin(u('ecosystem_admin', CO))).toBe(true);
  });

  test('sales_admin không gắn công ty vẫn không phải admin hệ thống', () => {
    expect(isSystemAdmin(u('sales_admin', null))).toBe(false);
  });
});

describe('isCompanyScopedAdmin', () => {
  test('admin / sales_admin có công ty → bị khoá phạm vi', () => {
    expect(isCompanyScopedAdmin(u('admin', CO))).toBe(true);
    expect(isCompanyScopedAdmin(u('sales_admin', CO))).toBe(true);
  });

  test('ecosystem_admin không bao giờ bị khoá một công ty', () => {
    expect(isCompanyScopedAdmin(u('ecosystem_admin', CO))).toBe(false);
  });

  test('nhân viên thường không phải admin dù có công ty', () => {
    expect(isCompanyScopedAdmin(u('production_staff', CO))).toBe(false);
  });
});

describe('vai trò sản xuất', () => {
  test('crm_production_staff vừa là admin SX vừa là nhân viên SX — đúng như backend', () => {
    expect(isProductionAdmin(u('crm_production_staff', CO))).toBe(true);
    expect(isProductionStaff(u('crm_production_staff', CO))).toBe(true);
  });

  test('production_admin là admin SX, không phải nhân viên SX', () => {
    expect(isProductionAdmin(u('production_admin', CO))).toBe(true);
    expect(isProductionStaff(u('production_admin', CO))).toBe(false);
  });

  test('production_staff là nhân viên SX, không phải admin SX', () => {
    expect(isProductionStaff(u('production_staff', CO))).toBe(true);
    expect(isProductionAdmin(u('production_staff', CO))).toBe(false);
  });
});

describe('canViewTeamWork — ai thấy việc của cả nhóm', () => {
  test.each(['admin', 'sales_admin', 'manager', 'crm_production_admin', 'production_admin'])(
    '%s → thấy việc nhóm',
    (r) => {
      expect(canViewTeamWork(u(r, CO))).toBe(true);
    },
  );

  test('nhân viên SX chỉ thấy việc của mình', () => {
    expect(canViewTeamWork(u('production_staff', CO))).toBe(false);
  });

  test('không đăng nhập / không vai trò → chỉ việc của mình', () => {
    expect(canViewTeamWork(null)).toBe(false);
    expect(canViewTeamWork(u(null, null))).toBe(false);
  });
});

describe('năng lực chọn công ty', () => {
  test('canPickAnyCompany chỉ dành cho admin hệ thống', () => {
    expect(canPickAnyCompany(u('admin', null))).toBe(true);
    expect(canPickAnyCompany(u('admin', CO))).toBe(false);
    expect(canPickAnyCompany(u('sales_admin', null))).toBe(false);
  });

  test('lockedCompanyIdFor: admin hệ thống không bị khoá', () => {
    expect(lockedCompanyIdFor(u('admin', null))).toBeUndefined();
  });

  test('lockedCompanyIdFor: người có công ty bị khoá đúng công ty đó', () => {
    expect(lockedCompanyIdFor(u('production_staff', CO))).toBe(CO);
    expect(lockedCompanyIdFor(u('admin', CO))).toBe(CO);
  });

  test('lockedCompanyIdFor: không vai trò, không công ty → undefined, không trả chuỗi rỗng', () => {
    expect(lockedCompanyIdFor(u(null, null))).toBeUndefined();
    expect(lockedCompanyIdFor(u('production_staff', ''))).toBeUndefined();
  });

  test('canSeeAllWorkshopCompanies bám isStrictAdmin, canSeeAllRegions bám isAdminLike', () => {
    const sa = u('sales_admin', CO);
    expect(canSeeAllRegions(sa)).toBe(true);
    expect(canSeeAllWorkshopCompanies(sa)).toBe(false);
  });
});

describe('roleLabel', () => {
  test('admin hệ thống có nhãn riêng, khác admin công ty', () => {
    expect(roleLabel(u('admin', null))).toBe('Quản trị hệ thống');
    expect(roleLabel(u('admin', CO))).toBe('Quản trị viên');
  });

  test.each([
    ['sales_admin', 'Sales Admin'],
    ['production_admin', 'Quản trị SX'],
    ['production_staff', 'Nhân viên SX'],
  ])('%s → %s (giữ nguyên nhãn cũ)', (r, label) => {
    expect(roleLabel(u(r, CO))).toBe(label);
  });

  test('không có vai trò → "Nhân viên"', () => {
    expect(roleLabel(u(null, CO))).toBe('Nhân viên');
    expect(roleLabel(null)).toBe('Nhân viên');
  });

  test('vai trò lạ vẫn hiện ra nguyên văn, không nuốt mất', () => {
    expect(roleLabel(u('vai_tro_moi', CO))).toBe('vai_tro_moi');
  });
});

/**
 * Ba thay đổi hành vi có chủ ý khi dọn về `roles.ts` — khoá lại ở đây để lần sau
 * ai sửa cũng biết là cố ý, không phải tai nạn.
 */
describe('Thay đổi có chủ ý so với code cũ', () => {
  test('1) ecosystem_admin / platform_admin nay được coi là admin (trước bị bỏ sót)', () => {
    expect(isAdminLike(u('ecosystem_admin', CO))).toBe(true);
    expect(isAdminLike(u('platform_admin', CO))).toBe(true);
    expect(isSystemAdmin(u('ecosystem_admin', CO))).toBe(true);
  });

  test('2) vai trò viết hoa / thừa khoảng trắng vẫn nhận đúng', () => {
    expect(isSystemAdmin(u(' Admin ', null))).toBe(true);
    expect(canViewTeamWork(u('MANAGER', CO))).toBe(true);
  });

  test('3) các vai trò trước đây hiện chuỗi thô nay có nhãn tiếng Việt', () => {
    expect(roleLabel(u('crm_production_staff', CO))).toBe('Nhân viên CRM + SX');
    expect(roleLabel(u('logistics_admin', CO))).toBe('Quản trị vận chuyển');
    expect(roleLabel(u('manager', CO))).toBe('Quản lý');
  });
});
