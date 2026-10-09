'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { anonymizeConversation, restore } = require('../src/modules/aiReplyDraft/anonymize');
const { buildSystemPrompt, validateDraft, MAX_DRAFT_CHARS } = require('../src/modules/aiReplyDraft/policy');
const { checkBudget, estimateVnd } = require('../src/modules/aiReplyDraft/budget');
const { ProviderError, createMockProvider, createOpenAiProvider } = require('../src/modules/aiReplyDraft/provider');

const customer = { name: 'Nguyễn Văn Tuấn', address: '12 Nguyễn Huệ, Quận 1' };
const inbound = text => ({ direction: 'inbound', text, at: '2026-10-08T01:00:00Z' });
const anon = (texts, c = customer) => anonymizeConversation({ messages: texts.map(inbound), customer: c });

test('anonymize: Vietnamese phone formats, email, links, long digits and known name/address are removed', () => {
  const r = anon([
    'SĐT của anh 0912345678 nhé', 'hoặc +84 912 345 678', '0912.345.678 / 09 123 45678',
    'mail tuan@gmail.com', 'fb https://facebook.com/tuan.nguyen.99 và m.me/tuan', 'mã 123456789012',
    'Anh Tuấn nhà ở 12 Nguyễn Huệ, Quận 1', 'tuan nguyen van',
  ]);
  assert.equal(r.safe, true, r.reasons.join());
  for (const bad of ['0912', '912 345', 'tuan@', 'facebook.com', 'm.me', '123456789012', 'Tuấn', 'Nguyễn Huệ', 'tuan']) {
    assert.ok(!r.text.toLowerCase().includes(bad.toLowerCase()), `${bad} still present: ${r.text}`);
  }
  for (const label of ['{SO_DIEN_THOAI}', '{EMAIL}', '{LIEN_KET}', '{SO}', '{TEN_KHACH}', '{DIA_CHI}'])
    assert.ok(r.text.includes(label), `${label} missing`);
});

test('anonymize: keeps the need (area, rooms, month) while removing PII', () => {
  const r = anon(['Bếp nhà em 15m2, 3 phòng ngủ, muốn làm tháng 3, gọi 0987654321']);
  assert.ok(r.text.includes('15m2') && r.text.includes('3 phòng ngủ') && r.text.includes('tháng 3'));
  assert.ok(!r.text.includes('0987654321'));
  assert.equal(r.safe, true);
});

test('anonymize: spoken phone numbers, street addresses typed by the customer and split phones are removed', () => {
  const spoken = anon(['số em là không chín một hai ba bốn năm sáu bảy tám']);
  assert.ok(spoken.text.includes('{SO_DIEN_THOAI}') && !/chín|bảy|tám/.test(spoken.text), spoken.text);
  const street = anon(['nhà em ở 45 đường Lê Lợi quận 3, hẻm 20', 'số nhà 7/12 ngõ Hoa Sen']);
  assert.ok(!/Lê Lợi|Hoa Sen|45|7\/12|hẻm 20/.test(street.text), street.text);
  const split = anon(['0912', '345678']);
  assert.ok(!/0912|345678/.test(split.text), split.text);
  assert.ok(split.text.startsWith('KHACH:'));
});

test('anonymize: does not erase a short need that only looks like digit words', () => {
  const r = anon(['em cần một tủ bếp ba mét, hai tầng, sáu cánh, năm nay làm']);
  assert.ok(r.text.includes('ba mét') && r.text.includes('hai tầng') && r.text.includes('sáu cánh'), r.text);
});

test('anonymize: names match without diacritics and in any case', () => {
  const r = anon(['TUAN oi', 'anh nguyen van tuan day', 'Tuấn'], { name: 'Nguyễn Văn Tuấn' });
  assert.ok(!/tu[aấ]n/i.test(r.text.replace(/\{TEN_KHACH\}/g, '')), r.text);
});

test('anonymize: limits messages and characters; ignores non-text and unknown directions', () => {
  const many = Array.from({ length: 30 }, (_, i) => inbound(`tin ${i}`));
  const r = anonymizeConversation({ messages: [...many, { direction: 'inbound', text: '' }, { direction: 'x', text: 'bỏ' },
    { direction: 'inbound', text: null }], customer: {}, maxMessages: 5 });
  assert.equal(r.messageCount, 5);
  const long = anonymizeConversation({ messages: [inbound('a'.repeat(5000))], customer: {}, maxChars: 100 });
  assert.ok(long.text.length <= 100);
});

test('anonymize: fail closed when there is nothing safe to send', () => {
  const empty = anonymizeConversation({ messages: [], customer: {} });
  assert.deepEqual(empty.reasons, ['NO_MESSAGES']);
  assert.equal(empty.safe, false);
});

test('restore fills only the short customer name', () => {
  const r = anon(['Tuấn cần tư vấn']);
  assert.equal(restore('Chào {TEN_KHACH}, {DIA_CHI}', r.placeholders), 'Chào Tuấn, {DIA_CHI}');
  assert.equal(restore('Chào {TEN_KHACH}', {}), 'Chào {TEN_KHACH}');
});

test('policy: a clean Vietnamese draft passes, with the system prompt forbidding promises', () => {
  assert.deepEqual(validateDraft('Chào {TEN_KHACH}, anh cho em biết diện tích bếp để em hẹn khảo sát nhé?'), { ok: true, reasons: [] });
  const prompt = buildSystemPrompt({ companyName: 'VPT' });
  assert.match(prompt, /Không báo giá/);
  assert.match(buildSystemPrompt({ pilotFacts: ['Khảo sát tại nhà'] }), /Khảo sát tại nhà/);
});

test('policy: every rule has a positive and a negative case and reports all reasons', () => {
  const cases = [
    ['PRICE_MENTION', 'Bếp này khoảng 25 triệu', 'Bếp 3 phòng, diện tích 15m2'],
    ['PRICE_MENTION', 'Giảm 10% hôm nay', 'Mình làm tháng 10'],
    ['PRICE_MENTION', 'Chỉ 1.200.000đ', 'Anh cần bao nhiêu mét'],
    ['PII_LEAK', 'Gọi 0912345678 nhé', 'Anh cho em xin địa điểm'],
    ['LINK', 'Xem https://example.com', 'Xem mẫu bên em'],
    ['UNFILLED_PLACEHOLDER', 'Chào {SO_DIEN_THOAI}', 'Chào {TEN_KHACH}'],
    ['RISKY_PROMISE', 'Bên em cam kết giá tốt nhất', 'Bên em tư vấn kỹ'],
    ['IDENTITY_CLAIM', 'Em là người thật đó anh', 'Em hỗ trợ anh nhé'],
    ['PROMPT_LEAK', 'As an AI I cannot', 'Em hỗ trợ anh nhé'],
    ['NOT_VIETNAMESE', 'Please tell you the size and the style for your kitchen', 'Anh cho em biết kiểu tủ'],
    ['TOO_LONG', 'a '.repeat(MAX_DRAFT_CHARS), 'Ngắn gọn'],
    ['EMPTY', '   ', 'Có nội dung'],
  ];
  for (const [code, bad, good] of cases) {
    assert.ok(validateDraft(bad).reasons.includes(code), `${code} should flag: ${bad}`);
    assert.ok(!validateDraft(good).reasons.includes(code), `${code} should not flag: ${good}`);
  }
  const multi = validateDraft('Em là người thật, cam kết giảm 10%, gọi 0912345678');
  assert.ok(['IDENTITY_CLAIM', 'RISKY_PROMISE', 'PRICE_MENTION', 'PII_LEAK'].every(c => multi.reasons.includes(c)), multi.reasons.join());
  assert.equal(validateDraft('Khảo sát miễn phí tại nhà', { allowedFacts: ['Khảo sát miễn phí tại nhà'] }).ok, true);
});

test('budget: integer VND rounded up; every cap denies; any missing field denies', () => {
  const caps = { maxDraftsPerDay: 5, maxTokensPerDay: 10000, maxVndPerDay: 5000, maxDraftsPerLead: 2 };
  const used = { drafts: 0, tokens: 0, vnd: 0, draftsForLead: 0 };
  const estimate = { promptTokens: 1000, maxOutputTokens: 300, usdPer1kIn: 0.00015, usdPer1kOut: 0.0006, vndPerUsd: 26000 };
  assert.equal(checkBudget({ usedToday: used, caps, estimate }).allowed, true);
  assert.equal(estimateVnd({ promptTokens: 1000, maxOutputTokens: 0, usdPer1kIn: 0.001, usdPer1kOut: 0, vndPerUsd: 25000 }), 25);
  assert.equal(estimateVnd({ promptTokens: 1, maxOutputTokens: 0, usdPer1kIn: 0.001, usdPer1kOut: 0, vndPerUsd: 25000 }), 1);
  assert.equal(checkBudget({ usedToday: { ...used, draftsForLead: 2 }, caps, estimate }).reason, 'LEAD_CAP');
  assert.equal(checkBudget({ usedToday: { ...used, drafts: 5 }, caps, estimate }).reason, 'DRAFT_CAP');
  assert.equal(checkBudget({ usedToday: { ...used, tokens: 9000 }, caps, estimate }).reason, 'TOKEN_CAP');
  assert.equal(checkBudget({ usedToday: { ...used, vnd: 4999 }, caps, estimate }).reason, 'VND_CAP');
  assert.equal(checkBudget({ usedToday: used, caps, estimate: { ...estimate, vndPerUsd: undefined } }).reason, 'ESTIMATE_MISSING');
  assert.equal(checkBudget({ usedToday: used, caps: { ...caps, maxVndPerDay: undefined }, estimate }).reason, 'CAPS_MISSING');
  assert.equal(checkBudget({ usedToday: { drafts: 0 }, caps, estimate }).reason, 'USAGE_MISSING');
  assert.equal(checkBudget({}).allowed, false);
});

const KEY = 'sk-SENTINEL-KEY';
const PROMPT = 'NOI DUNG SENTINEL';
const reply = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('openai provider: sends the expected request and parses text and usage (fake fetch)', async () => {
  let seen;
  const provider = createOpenAiProvider({ getApiKey: () => KEY,
    fetchImpl: async (url, init) => { seen = { url, init }; return reply(200, { model: 'gpt-4o-mini',
      choices: [{ message: { content: 'Chào anh' } }], usage: { prompt_tokens: 11, completion_tokens: 4 } })(); } });
  const out = await provider.generate({ system: 'S', user: PROMPT, maxOutputTokens: 120 });
  assert.deepEqual(out, { text: 'Chào anh', model: 'gpt-4o-mini', usage: { promptTokens: 11, completionTokens: 4 } });
  assert.equal(seen.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(seen.init.headers.Authorization, `Bearer ${KEY}`);
  const body = JSON.parse(seen.init.body);
  assert.equal(body.max_tokens, 120); assert.equal(body.store, false); assert.equal(body.messages[1].content, PROMPT);
});

test('openai provider: failures become safe codes that never carry the key or the content', async () => {
  for (const [status, code] of [[401, 'PROVIDER_AUTH'], [403, 'PROVIDER_AUTH'], [429, 'PROVIDER_RATE_LIMIT'], [500, 'PROVIDER_ERROR']]) {
    const p = createOpenAiProvider({ getApiKey: () => KEY, fetchImpl: reply(status, { error: { message: KEY + PROMPT } }) });
    await assert.rejects(p.generate({ system: 'S', user: PROMPT }),
      e => e.code === code && !JSON.stringify(e).includes(KEY) && !String(e.message).includes(PROMPT));
  }
  const slow = createOpenAiProvider({ getApiKey: () => KEY, timeoutMs: 5,
    fetchImpl: (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort',
      () => reject(Object.assign(Error(KEY), { name: 'AbortError' })))) });
  await assert.rejects(slow.generate({ system: 'S', user: PROMPT }), { code: 'PROVIDER_TIMEOUT' });
  const net = createOpenAiProvider({ getApiKey: () => KEY, fetchImpl: async () => { throw Error(KEY); } });
  await assert.rejects(net.generate({ system: 'S', user: PROMPT }), e => e.code === 'PROVIDER_ERROR' && !String(e.message).includes(KEY));
  await assert.rejects(createOpenAiProvider({ getApiKey: () => '' }).generate({ system: 'S', user: 'U' }), { code: 'PROVIDER_AUTH' });
  assert.throws(() => createOpenAiProvider({}), ProviderError);
});

test('mock provider records calls and replays a script', async () => {
  const mock = createMockProvider(['một', 'hai']);
  assert.equal((await mock.generate({ user: 'a' })).text, 'một');
  assert.equal((await mock.generate({ user: 'b' })).text, 'hai');
  assert.equal(mock.calls.length, 2);
});

test('static: the module never reads env, sends messages or logs content', () => {
  const dir = path.join(__dirname, '../src/modules/aiReplyDraft');
  for (const file of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.doesNotMatch(text, /process\.env/, file);
    assert.doesNotMatch(text, /sendMessengerReply|require\(['"]\.\.\/\.\.\/routes|require\(['"].*facebook/, file);
    assert.doesNotMatch(text, /console\.(log|info|warn|error|debug)/, file);
  }
});
