'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { META_KEY, classifyVptWebsiteMail: classify, getN8nCode } = require('./vpt-website-mail-owner-v1');

const prefix = '[VPT V1] Tư vấn tủ bếp / thiết bị — ';
const managed = () => ({ subject: prefix + 'Synthetic test — 0000000001', text: 'Thông báo form\r\nMã form: VPT_V1\r\nNội dung thử' });
const legacy = () => ({ subject: 'Yêu cầu tư vấn cũ', text: 'Mã form: OLD_FORM\nNội dung thử' });
const route = (mail, reason) => {
  const result = classify(mail);
  assert.equal(result.route, 'hold');
  if (reason) assert.equal(result.reason, reason);
  assert.deepEqual(Object.keys(result).sort(), ['reason', 'route', 'version']);
  return result;
};
function runCode(items) {
  return vm.runInNewContext(`(function () { ${getN8nCode()} })()`, {
    $input: { all: () => items },
  }, { timeout: 1000 });
}

test('exact CF7 subject and static body line HOLD without claiming receipt or qualification', () => {
  route(managed(), 'bridge_form_reconcile_required');
  assert.equal(JSON.stringify(classify(managed())).includes('0000000001'), false);
});

test('legacy VPT and Phúc Đạt emails without bridge markers keep the legacy route', () => {
  for (const mail of [legacy(), { subject: 'Phúc Đạt - website', text: 'Mã form: PHUCDAT\nThông báo' }]) {
    assert.deepEqual(classify(mail), { version: 1, route: 'legacy', reason: 'no_bridge_markers' });
  }
});

test('one marker only never falls through to legacy creation', () => {
  route({ ...managed(), text: 'Nội dung không có dòng form' }, 'ambiguous_bridge_markers');
  route({ ...managed(), subject: 'Tiêu đề cũ' }, 'ambiguous_bridge_markers');
});

test('malformed, case-changed, quoted and invisible-character markers HOLD', () => {
  for (const subject of ['Re: ' + managed().subject, '[vpt v1] Tư vấn', '[VPT_V1] Tư vấn', '[VPT\u200BV1] Tư vấn']) {
    route({ subject, text: 'Mã form: VPT_V1' }, 'ambiguous_bridge_markers');
  }
  for (const text of [' Mã form: VPT_V1 ', 'Mã form: vpt_v1', 'Ma form: VPT_V1', '> Mã form: VPT_V1']) {
    route({ subject: managed().subject, text }, 'ambiguous_bridge_markers');
  }
});

test('duplicate markers or a customer-quoted marker HOLD as ambiguous', () => {
  route({ ...managed(), text: 'Mã form: VPT_V1\nMã form: VPT_V1' }, 'ambiguous_bridge_markers');
  route({ ...managed(), subject: managed().subject + ' [VPT V1]' }, 'ambiguous_bridge_markers');
  route({ ...legacy(), text: 'Khách trích lại: Mã form: VPT_V1' }, 'ambiguous_bridge_markers');
});

test('mentioning the form identifier alone is not a body marker', () => {
  assert.equal(classify({ ...legacy(), text: 'Tôi có câu hỏi về VPT_V1.' }).route, 'legacy');
});

test('canonical Unicode and CRLF/LF preserve the same managed decision', () => {
  const mail = managed();
  route({ subject: mail.subject.normalize('NFD'), text: mail.text.normalize('NFD').replace(/\r\n/g, '\n') }, 'bridge_form_reconcile_required');
});

test('parsed Gmail Subject wins; a body-forged Subject cannot establish a route', () => {
  assert.equal(classify({ ...legacy(), headers: { subject: managed().subject } }).route, 'legacy');
  route({ text: 'Subject: ' + managed().subject }, 'mail_shape_unreadable');
});

test('Gmail header fallbacks require exactly one structured Subject', () => {
  for (const headers of [
    [{ name: 'Subject', value: managed().subject }],
    { subject: 'Subject: ' + managed().subject },
  ]) route({ text: managed().text, headers }, 'bridge_form_reconcile_required');
  route({ text: managed().text, payload: { headers: [{ name: 'subject', value: managed().subject }] } }, 'bridge_form_reconcile_required');
  route({ text: managed().text, headers: [{ name: 'Subject', value: 'a' }, { name: 'subject', value: 'b' }] }, 'mail_shape_unreadable');
});

test('missing, HTML-only, malformed and oversized input HOLD without guessing', () => {
  for (const mail of [null, [], {}, { subject: 'a' }, { subject: 1, text: '' },
    { subject: 'a', html: '<p>Mã form: VPT_V1</p>' }, { subject: 'a\nb', text: '' },
    { subject: 'x'.repeat(4097), text: '' }, { subject: 'a', text: 'x'.repeat(2097153) }]) {
    route(mail, 'mail_shape_unreadable');
  }
});

test('generated n8n source runs the same decisions, keeps original fields/binary and links each input', () => {
  const mails = [managed(), legacy(), { ...managed(), subject: 'old' }, { subject: 'html only', html: '<p>x</p>' }];
  const items = mails.map((json, index) => ({ json: { ...json, synthetic: index }, binary: { file: { id: 'fixture-' + index } } }));
  const before = JSON.stringify(items);
  const output = runCode(items);
  assert.equal(output.length, items.length);
  assert.equal(JSON.stringify(items), before);
  output.forEach((item, index) => {
    assert.deepEqual(JSON.parse(JSON.stringify(item.json[META_KEY])), classify(items[index].json));
    assert.equal(item.binary, items[index].binary);
    assert.equal(item.pairedItem.item, index);
    assert.deepEqual(Object.fromEntries(Object.entries(item.json).filter(([key]) => key !== META_KEY)), items[index].json);
  });
  // Positive allowlist only: this is the exact condition the IF node must use.
  const legacyItems = output.filter(item => item.json[META_KEY].version === 1 && item.json[META_KEY].route === 'legacy');
  assert.equal(legacyItems.length, 1);
  assert.equal(legacyItems[0].json.synthetic, 1);
});

test('generated source refuses guard-field collisions or invalid n8n item shapes with sanitized error', () => {
  for (const item of [{ json: { ...legacy(), [META_KEY]: { route: 'legacy' } } }, { json: null }, {}]) {
    assert.throws(() => runCode([item]), /VPT_MAIL_OWNER_INPUT_INVALID/);
  }
});

test('a replayed mail has the same HOLD decision with no timers, network or dispatch', () => {
  const source = getN8nCode();
  assert.equal(/\b(?:fetch|require|dispatch|setTimeout|httpRequest)\s*\(/.test(source), false);
  const mail = managed();
  assert.deepEqual(classify(mail), classify(mail));
  assert.equal(runCode([{ json: mail }])[0].json[META_KEY].route, 'hold');
});

test('static form markers with no persisted-job/receipt proof still emit explicit reconciliation HOLD', () => {
  const output = runCode([{ json: managed() }]);
  assert.equal(output.length, 1, 'the guard must not silently drop held mail');
  const metadata = JSON.parse(JSON.stringify(output[0].json[META_KEY]));
  assert.deepEqual(metadata, { version: 1, route: 'hold', reason: 'bridge_form_reconcile_required' });
  for (const word of ['success', 'receipt', 'delivered', 'confirmed', 'qualified']) {
    assert.equal(JSON.stringify(metadata).includes(word), false);
  }
});
