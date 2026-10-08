'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const lib = path.resolve(__dirname, '../../frontend/src/lib/p1Qualification.js');
const component = fs.readFileSync(path.resolve(__dirname,
  '../../frontend/src/components/P1QualificationPanel.jsx'), 'utf8');
test('pure helpers validate forms and whitelist command fields', async () => {
  const q = await import(`file:///${lib.replace(/\\/g, '/')}`);
  assert.equal(q.stateLabel('QUALIFIED'), 'Hợp lệ'); assert.equal(q.errorLabel('REVISION_CONFLICT'), 'Dữ liệu đã đổi, đã tải lại');
  assert.ok(q.validateForm('QUALIFIED', {})); assert.ok(q.validateForm('REJECTED', {})); assert.ok(q.validateForm('revoke', {}));
  const form = { contact_usable: true, need_in_scope: true, area_in_service: true,
    evidence_ref: ' ref ', reason: ' lý do ', company_id: 'forged' };
  assert.equal(q.validateForm('QUALIFIED', form), null);
  assert.deepEqual(q.commandBody('QUALIFIED', form, 2, 'request'), {
    request_id: 'request', expected_revision: 2, status: 'QUALIFIED',
    contact_usable: true, need_in_scope: true, area_in_service: true, evidence_ref: 'ref' });
  assert.deepEqual(q.commandBody('revoke', form, 2, 'request'),
    { request_id: 'request', expected_revision: 2, reason: 'lý do' });
  let n = 0;
  const identity = q.createRequestIdentity(() => `id-${++n}`);
  assert.equal(identity.current(), identity.current());
  identity.reset(); assert.equal(identity.current(), 'id-2');
});
test('component gates on config and reads only qualification endpoints', () => {
  assert.match(component, /ROOT}\/config/);
  assert.match(component, /if \(!enabled\) return null/);
  assert.doesNotMatch(component, /\bphone\b|so_dien_thoai|\bemail\b/i);
  assert.doesNotMatch(component, /api\.(?:get|put|post)\(\s*['"`]\/(?!marketing-p1\/qualification)/);
});
test('summary helpers show provisional money and explain unknown states in Vietnamese', async () => {
  const q = await import(`file:///${lib.replace(/\\/g, '/')}`);
  assert.equal(q.formatVnd(1000001), '1.000.001 đ');
  assert.equal(q.formatVnd(null), 'Chưa biết');
  assert.equal(q.summaryReasonLabel('NO_FACEBOOK_SCOPE'), 'Đợt thử chưa có tài khoản Facebook');
  assert.equal(q.summaryReasonLabel('IDENTITY_NOT_RECONCILED'), 'Chưa gộp khách trùng');
  assert.equal(q.summaryCostLabel({ status: 'PROVISIONAL', vnd_ceil: 333334, target_vnd: 250000 }),
    'Chi phí mỗi khách hợp lệ (TẠM TÍNH): 333.334 đ — mục tiêu ≤ 250.000 đ');
  assert.equal(q.summaryCostLabel({ status: 'NO_QUALIFIED_LEADS' }), 'Chưa có khách hợp lệ');
  assert.equal(q.summaryCostLabel({ status: 'UNKNOWN' }), 'Chưa biết');
  assert.doesNotMatch(q.summaryCostLabel({ status: 'UNKNOWN' }), /Đạt/);
  assert.match(component, /ROOT}\/summary/);
});
