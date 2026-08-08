/**
 * Kiểm tra phân quyền xem file/ghi chú CRM → SX (documentShareScope + audience bình luận).
 * Chạy: node backend/scripts/test-crm-share-visibility.js
 */

const assert = require('assert');
const {
  canViewerSeeByCompanyAndDept,
  crmAttachmentVisibleForModuleAndUser,
  crmTaskVisibleForModuleAndUser,
  leadDocVisibleForModuleAndUser,
} = require('../src/helpers/documentShareScope');

const HCB = '11111111-1111-4111-8111-111111111111';
const VPT = '22222222-2222-4222-8222-222222222222';
const PB_HCB = '33333333-3333-4333-8333-333333333333';

const userHcb = { role: 'user', company_id: HCB, department_id: null };
const userVpt = { role: 'user', company_id: VPT, department_id: null };
const admin = { role: 'admin', company_id: VPT, department_id: null };

const taskWithVis = {
  shared_to_project: true,
  allowed_share_modules: ['production'],
  default_allowed_companies: [HCB],
  default_allowed_departments: null,
};

const attShared = {
  shared_to_project: true,
  allowed_share_modules: ['production'],
  allowed_companies: null,
  allowed_departments: null,
};

const leadDoc = {
  shared_to_workshop: true,
  allowed_share_modules: ['production'],
  allowed_companies: [HCB],
  allowed_departments: null,
};

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log('  ✓', msg);
}

console.log('\n=== documentShareScope — phân quyền công ty ===\n');

ok(canViewerSeeByCompanyAndDept(taskWithVis, userHcb) === true, 'NV HCB xem task có allowed_companies HCB');
ok(canViewerSeeByCompanyAndDept(taskWithVis, userVpt) === false, 'NV VPT không xem task chỉ HCB');
ok(canViewerSeeByCompanyAndDept(taskWithVis, admin) === true, 'Admin xem mọi task');

ok(crmTaskVisibleForModuleAndUser(taskWithVis, 'production', userHcb) === true, 'NV HCB xem ghi chú task chia sẻ SX');
ok(crmTaskVisibleForModuleAndUser(taskWithVis, 'production', userVpt) === false, 'NV VPT không xem ghi chú task HCB-only');
ok(crmTaskVisibleForModuleAndUser(taskWithVis, 'logistics', userHcb) === true, 'VC/LĐ xem task đã chia sẻ dù chỉ gắn production');
ok(crmTaskVisibleForModuleAndUser({ ...taskWithVis, stage_slug: 'sx_san_xuat' }, 'logistics', userHcb) === false, 'VC/LĐ ẩn task giai đoạn SX');
ok(leadDocVisibleForModuleAndUser(leadDoc, 'logistics', userHcb) === true, 'VC/LĐ xem lead_documents dù chỉ gắn production');
ok(leadDocVisibleForModuleAndUser({ ...leadDoc, crm_stage_slug: 'sx_cat' }, 'logistics', userHcb) === false, 'VC/LĐ ẩn tài liệu giai đoạn SX');

ok(
  crmAttachmentVisibleForModuleAndUser(attShared, 'production', userHcb, taskWithVis) === true,
  'File đính kèm kế thừa phân quyền từ task',
);
ok(
  crmAttachmentVisibleForModuleAndUser(attShared, 'production', userVpt, taskWithVis) === false,
  'File đính kèm ẩn với NV ngoài phạm vi công ty',
);

ok(leadDocVisibleForModuleAndUser(leadDoc, 'production', userHcb) === true, 'lead_documents HCB hiện SX');
ok(leadDocVisibleForModuleAndUser(leadDoc, 'production', userVpt) === false, 'lead_documents HCB ẩn VPT');

const taskNoShare = { ...taskWithVis, shared_to_project: false };
ok(crmTaskVisibleForModuleAndUser(taskNoShare, 'production', userHcb) === false, 'Task chưa bật chia sẻ → ẩn SX');

console.log('\n=== Tất cả kiểm tra passed ===\n');
