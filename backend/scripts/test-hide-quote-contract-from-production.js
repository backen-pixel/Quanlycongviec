/**
 * Test ẩn Báo giá / Hợp đồng khỏi SX (VPT & Phúc Đạt).
 * Chạy: node backend/scripts/test-hide-quote-contract-from-production.js
 */
const assert = require('assert');
const {
  isQuoteContractCommercialTask,
  isHideQuoteContractCompany,
  shouldHideQuoteContractFromProduction,
  shouldBlockAutoShareQuoteContract,
  isQuoteContractActivityComment,
  isQuoteContractLeadDocument,
  VPT_COMPANY_ID,
  PHUC_DAT_COMPANY_ID,
} = require('../src/helpers/hideQuoteContractFromProduction');
const { getDefaultCrmAttachmentShare } = require('../src/helpers/crmTaskLeadDocumentMeta');
const {
  crmAttachmentVisibleForModuleAndUser,
  crmTaskVisibleForModuleAndUser,
  leadDocVisibleForModuleAndUser,
} = require('../src/helpers/documentShareScope');

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log('✓', msg);
}

const taskBg = { title: 'Báo giá', stage_slug: 'deal_quote_contract', shared_to_project: true };
const taskHd = { title: ' Bản hợp đồng', stage_slug: 'pl_a_ky_hop_ong_dc1fbdfe', shared_to_project: true };
const taskSx = { title: 'Báo giá', stage_slug: 'sx_tiep_nhan', shared_to_project: true };
const userSx = { role: 'user', company_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };

ok(isHideQuoteContractCompany(VPT_COMPANY_ID), 'VPT trong danh sách ẩn');
ok(isHideQuoteContractCompany(PHUC_DAT_COMPANY_ID), 'Phúc Đạt trong danh sách ẩn');
ok(isQuoteContractCommercialTask(taskBg), 'Task Báo giá = commercial');
ok(isQuoteContractCommercialTask(taskHd), 'Task Bản hợp đồng = commercial');
ok(!isQuoteContractCommercialTask(taskSx), 'Task SX cùng tên không ẩn theo rule CRM');

ok(
  shouldBlockAutoShareQuoteContract({ companyId: VPT_COMPANY_ID, task: taskBg }),
  'Chặn auto-share VPT Báo giá',
);
ok(
  !shouldBlockAutoShareQuoteContract({ companyId: 'other', task: taskBg }),
  'Công ty khác vẫn auto-share được',
);

const shareBlocked = getDefaultCrmAttachmentShare(taskBg, {
  linkToProject: true,
  leadCompanyId: VPT_COMPANY_ID,
});
ok(shareBlocked.shared_to_project === false, 'getDefaultCrmAttachmentShare không chia sẻ BG VPT');

const shareOk = getDefaultCrmAttachmentShare(taskBg, {
  linkToProject: true,
  leadCompanyId: '11111111-1111-4111-8111-111111111111',
});
ok(shareOk.shared_to_project === true, 'Công ty khác vẫn auto-share khi có project');

const att = { shared_to_project: true, allowed_share_modules: ['production'] };
ok(
  !crmAttachmentVisibleForModuleAndUser(att, 'production', userSx, taskBg, { leadCompanyId: VPT_COMPANY_ID }),
  'Attachment BG ẩn trên SX VPT',
);
ok(
  crmAttachmentVisibleForModuleAndUser(att, 'production', userSx, taskBg, { leadCompanyId: 'other' }),
  'Attachment BG hiện trên SX công ty khác',
);
ok(
  !crmTaskVisibleForModuleAndUser(taskBg, 'production', userSx, { leadCompanyId: PHUC_DAT_COMPANY_ID }),
  'Ghi chú task BG ẩn Phúc Đạt SX',
);

const doc = {
  shared_to_workshop: true,
  name: '[Báo giá] BG A TRỰC',
  crm_stage_slug: 'deal_quote_contract',
  crm_stage_group_label: 'Báo giá & Hợp đồng',
};
ok(isQuoteContractLeadDocument(doc), 'lead_document BG nhận diện');
ok(
  !leadDocVisibleForModuleAndUser(doc, 'production', userSx, { leadCompanyId: VPT_COMPANY_ID }),
  'lead_document BG ẩn SX VPT',
);

ok(
  isQuoteContractActivityComment('📎 Lê Khang đã tải lên «BG.xlsx» (nhiệm vụ: Báo giá)'),
  'Comment upload BG',
);
ok(
  isQuoteContractActivityComment('✅ Lê Khang đã hoàn thành nhiệm vụ «Báo giá».'),
  'Comment hoàn thành BG',
);
ok(
  isQuoteContractActivityComment('✅ Huỳnh Văn Nghĩa đã hoàn thành nhiệm vụ « Bản hợp đồng».'),
  'Comment hoàn thành Bản hợp đồng',
);
ok(
  !isQuoteContractActivityComment('Xin chào đội SX, kiểm tra bản vẽ giúp em'),
  'Comment thường không bị ẩn',
);

ok(
  shouldHideQuoteContractFromProduction({
    companyId: VPT_COMPANY_ID,
    task: taskBg,
    moduleKey: 'production',
  }),
  'shouldHide production VPT',
);
ok(
  shouldHideQuoteContractFromProduction({
    companyId: VPT_COMPANY_ID,
    task: taskBg,
    moduleKey: 'logistics',
  }),
  'shouldHide logistics VPT (giống SX)',
);
ok(
  !shouldHideQuoteContractFromProduction({
    companyId: VPT_COMPANY_ID,
    task: taskBg,
    moduleKey: 'workshop',
  }),
  'Không ẩn module workshop',
);

console.log(`\n${passed} assertions passed`);
