const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const TOKEN = '<TOKEN_GIA>';
const saved = { catalog: [], spend: [], results: [], calls: [] };
const supabase = {
  from(table) {
    return {
      select() {
        return { in: async () => ({ data: [] }) };
      },
      upsert(rows) {
        if (table === 'fb_ad_catalog') saved.catalog.push(...rows);
        if (table === 'fb_ad_spend_daily') saved.spend.push(...rows);
        return Promise.resolve({ error: null });
      },
      update(value) {
        return { eq: async () => {
          if (table === 'fb_ad_accounts') saved.results.push(value.ket_qua_cuoi);
          return { error: null };
        } };
      },
    };
  },
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '../config/supabase' && parent?.filename.endsWith('fbMarketingSync.js')) {
    return { supabase };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const { dongBoMot } = require('../src/helpers/fbMarketingSync');
Module._load = originalLoad;

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function row(overrides = {}) {
  return {
    ad_id: 'ad_1', date_start: '2026-10-06', spend: '123.45',
    impressions: '10', clicks: '2', ...overrides,
  };
}

async function run({ currency = 'VND', currencyResponse, ads = [], insights = [row()],
  insightResponse, now } = {}) {
  saved.catalog.length = 0;
  saved.spend.length = 0;
  saved.results.length = 0;
  saved.calls.length = 0;
  const warnings = [];
  const oldFetch = global.fetch;
  const oldWarn = console.warn;
  const oldNow = Date.now;
  console.warn = (...args) => warnings.push(args.join(' '));
  if (now !== undefined) Date.now = () => now;
  global.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`);
    saved.calls.push(url);
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/ads')) return response({ data: ads });
    if (parsed.pathname.endsWith('/insights')) {
      return insightResponse ? insightResponse(parsed) : response({ data: insights });
    }
    return currencyResponse || response({ currency });
  };
  try {
    const result = await dongBoMot({ ad_account_id: 'act_1', access_token: TOKEN }, { ngay: 30 });
    assert.deepEqual(saved.results, [result]);
    return { result, catalog: [...saved.catalog], spend: [...saved.spend],
      calls: [...saved.calls], warnings };
  } finally {
    global.fetch = oldFetch;
    console.warn = oldWarn;
    Date.now = oldNow;
  }
}

test('VND một trang: ghi chi tiêu và giữ trường kết quả cũ', async () => {
  const { result, catalog, spend } = await run({ ads: [{ id: 'ad_1', name: 'Ad 1' }] });
  assert.equal(result.ok, true);
  assert.equal(result.complete, true);
  assert.equal(result.currency, 'VND');
  assert.equal(result.so_ad, 1);
  assert.equal(result.so_dong_chi_tieu, 1);
  assert.equal(result.tong_chi_tieu, 123);
  assert.equal(result.rows_written, 1);
  assert.equal(result.pages, 2);
  assert.equal(result.error_code, null);
  assert.equal(catalog[0].ad_name, 'Ad 1');
  assert.equal(spend[0].chi_tieu, 123.45);
  assert.equal(spend[0].tien_te, 'VND');
});

test('trang 51 còn next: giữ dòng đã lấy và đánh dấu thiếu', async () => {
  const { result, spend, warnings } = await run({
    insightResponse(parsed) {
      const page = Number(parsed.searchParams.get('page') || 1);
      return response({
        data: page === 1 ? [row()] : [],
        paging: { next: `https://graph.facebook.com/v22.0/act_1/insights?page=${page + 1}` },
      });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.complete, false);
  assert.equal(result.truncated, true);
  assert.equal(result.pages, 51);
  assert.equal(result.rows_written, 1);
  assert.equal(spend.length, 1);
  assert.match(warnings.join(' '), /TRUNCATED/);
});

test('lỗi đọc currency: không ghi chi tiêu, CURRENCY_UNKNOWN', async () => {
  const { result, spend, calls } = await run({
    currencyResponse: response({ error: { code: 190, message: 'bí mật' } }, 400),
  });
  assert.equal(result.complete, false);
  assert.equal(result.error_code, 'CURRENCY_UNKNOWN');
  assert.equal(result.currency, null);
  assert.equal(spend.length, 0);
  assert.equal(calls.length, 1);
});

test('currency thiếu: không ghi chi tiêu, CURRENCY_UNKNOWN', async () => {
  const { result, spend } = await run({ currencyResponse: response({}) });
  assert.equal(result.error_code, 'CURRENCY_UNKNOWN');
  assert.equal(result.complete, false);
  assert.equal(spend.length, 0);
});

test('currency USD: ghi đúng nhãn và đánh dấu mismatch', async () => {
  const { result, spend } = await run({ currency: 'USD' });
  assert.equal(result.ok, true);
  assert.equal(result.complete, false);
  assert.equal(result.currency, 'USD');
  assert.equal(result.currency_mismatch, true);
  assert.equal(spend[0].tien_te, 'USD');
});

test('spend sai, null, âm và thiếu khóa: bỏ dòng, đếm, không ghi 0 giả', async () => {
  const { result, spend } = await run({ insights: [
    row({ ad_id: 'good' }), row({ ad_id: 'bad_text', spend: 'abc' }),
    row({ ad_id: 'bad_null', spend: null }), row({ ad_id: 'bad_negative', spend: '-1' }),
    row({ ad_id: 'bad_clicks', clicks: 'abc' }),
    row({ ad_id: 'no_counts', clicks: undefined, impressions: null }),
    row({ ad_id: null }), row({ date_start: null }),
  ] });
  assert.equal(result.invalid_rows, 4);
  assert.equal(result.skipped_rows, 2);
  assert.equal(result.rows_written, 2);
  assert.equal(result.complete, false);
  assert.deepEqual(spend.map((x) => x.ad_id), ['good', 'no_counts']);
  const noCounts = spend.find((x) => x.ad_id === 'no_counts');
  assert.equal(noCounts.hien_thi, 0);
  assert.equal(noCounts.nhap, 0);
  assert.equal(noCounts.chi_tieu, 123.45);
  assert.ok(spend.every((x) => x.chi_tieu > 0));
});

test('23:30 Việt Nam lấy until theo ngày Việt Nam', async () => {
  const now = Date.parse('2026-10-06T16:30:00Z');
  const { result, calls } = await run({ now });
  assert.equal(result.until, '2026-10-06');
  assert.equal(result.since, '2026-09-07');
  const url = new URL(calls.find((x) => x.includes('/insights')));
  assert.deepEqual(JSON.parse(url.searchParams.get('time_range')),
    { since: '2026-09-07', until: '2026-10-06' });
});

test('Meta 190: chỉ mã lọc đi vào kết quả và log', async () => {
  const raw = `raw secret ${TOKEN}`;
  const { result, spend, warnings } = await run({
    insightResponse: () => response({ error: { code: 190, message: raw } }, 400),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error_code, 'META_AUTH');
  assert.equal(result.loi, 'META_AUTH');
  assert.equal(spend.length, 0);
  assert.doesNotMatch(JSON.stringify(result) + warnings.join(' '), /raw secret|TOKEN_GIA/);
});
