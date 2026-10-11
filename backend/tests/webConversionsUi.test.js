'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const lib = path.resolve(__dirname, '../../frontend/src/lib/webConversions.js');
const component = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/components/WebConversionPanel.jsx'), 'utf8');
const load = () => import(`file:///${lib.split(path.sep).join("/")}`);

test('Google Ads export and plain lines parse to whole VND rows', async () => {
  const { parseSpendCsv } = await load();
  const exported = 'Ngày,Chiến dịch,Chi phí\n2026-10-12,"Tủ bếp, HCM","1.234.567 ₫"\n12/10/2026,Tủ bếp HCM 2,450000\nTổng,,1684567';
  const a = parseSpendCsv(exported, 'GOOGLE');
  assert.deepEqual(a.errors, []);
  assert.deepEqual(a.rows, [
    { provider: 'GOOGLE', campaign_key: 'Tủ bếp, HCM', campaign_name: 'Tủ bếp, HCM', ngay: '2026-10-12', chi_tieu_vnd: 1234567 },
    { provider: 'GOOGLE', campaign_key: 'Tủ bếp HCM 2', campaign_name: 'Tủ bếp HCM 2', ngay: '2026-10-12', chi_tieu_vnd: 450000 }]);
  const en = parseSpendCsv('Day\tCampaign\tCost\n2026-10-11\tA\t1,500,000.00\n2026-10-11\tA\t500', 'CHATGPT');
  assert.deepEqual(en.rows, [{ provider: 'CHATGPT', campaign_key: 'A', campaign_name: 'A', ngay: '2026-10-11', chi_tieu_vnd: 1500500 }]);
  const plain = parseSpendCsv('2026-10-10, Chiến dịch X, 300000\n2026-02-30, Y, 1\nabc', 'GOOGLE');
  assert.equal(plain.rows.length, 1); assert.equal(plain.errors.length, 2);
  assert.match(parseSpendCsv('Foo,Bar\n1,2', 'GOOGLE').errors[0], /Ngày và Chi phí/);
});

test('date range and money format', async () => {
  const { vietnamRange, formatVnd } = await load();
  assert.deepEqual(vietnamRange(7, Date.parse('2026-10-11T18:00:00Z')), { from: '2026-10-06', to: '2026-10-12' });
  assert.equal(formatVnd(null), '—'); assert.match(formatVnd(1500000), /1\.500\.000 đ/);
});

test('panel reads only the web conversions endpoints and hides for non-admins', () => {
  assert.match(component, /ROOT = '\/marketing-web'/);
  assert.match(component, /\/summary/); assert.match(component, /api\.put\(`\$\{ROOT\}\/spend`/);
  assert.match(component, /setHidden\(true\)/);
});
