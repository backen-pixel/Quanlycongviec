'use strict';

const DAY_MS = 86400000;
const MAX_PAGES = 200;
const ACCOUNT_COLUMNS = 'ad_account_id, bat, lan_dong_bo_cuoi, ket_qua_cuoi';
const SPEND_COLUMNS = 'ad_id, ngay, ad_account_id, chi_tieu, tien_te';

function toWholeVnd(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : null;
  if (typeof value !== 'string' || !/^\d+(?:\.0+)?$/.test(value)) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function dayNumber(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const day = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(day) && new Date(day).toISOString().slice(0, 10) === value ? day / DAY_MS : null;
}

function result(status, spendVnd, asOf, daysCovered, reasons, daily = []) {
  // There is no Meta account-level total here to reconcile against ad-level spend.
  return { status, spendVnd, asOf, daysCovered, reasons, reconciliation: 'AD_LEVEL_ONLY', daily };
}

function evaluateSpendCoverage({ accountId, from, to, rows, sync, nowMs, today } = {}) {
  const first = dayNumber(from), last = dayNumber(to), current = dayNumber(today);
  const asOf = sync?.lan_dong_bo_cuoi ?? null;
  if (!accountId || first === null || last === null || current === null || first > last ||
      !Array.isArray(rows) || !Number.isFinite(nowMs))
    return result('FAILED', null, asOf, 0, ['INVALID_INPUT']);

  const report = sync?.ket_qua_cuoi;
  const since = dayNumber(report?.since), until = dayNumber(report?.until);
  const requiredLast = Math.min(last, current);
  const daysCovered = since === null || until === null || requiredLast < first ? 0 :
    Math.max(0, Math.min(until, requiredLast) - Math.max(since, first) + 1);
  const reasons = [];
  let failed = false, currencyMismatch = false;
  let spend = 0, validRows = 0;
  const byDay = new Map();
  const seen = new Set();
  for (const row of rows) {
    if (!row || row.ad_account_id !== accountId || dayNumber(row.ngay) === null ||
        row.ngay < from || row.ngay > to || !row.ad_id) {
      failed = true; reasons.push('INVALID_ROW_SCOPE'); continue;
    }
    const key = JSON.stringify([row.ad_id, row.ngay]);
    if (seen.has(key)) { failed = true; reasons.push('DUPLICATE_AD_DAY'); continue; }
    seen.add(key);
    if (row.tien_te !== 'VND') { currencyMismatch = true; reasons.push('ROW_CURRENCY'); continue; }
    const amount = toWholeVnd(row.chi_tieu);
    if (amount === null) { failed = true; reasons.push('INVALID_AMOUNT'); continue; }
    validRows++;
    spend += amount;
    if (!Number.isSafeInteger(spend)) return result('FAILED', null, asOf, daysCovered, ['AMOUNT_OVERFLOW']);
    const dayTotal = (byDay.get(row.ngay) || 0) + amount;
    if (!Number.isSafeInteger(dayTotal)) return result('FAILED', null, asOf, daysCovered, ['AMOUNT_OVERFLOW']);
    byDay.set(row.ngay, dayTotal);
  }

  if (report?.currency !== 'VND') { currencyMismatch = true; reasons.push('SYNC_CURRENCY'); }
  if (report?.ok !== true) { failed = true; reasons.push('SYNC_FAILED'); }
  const partial = report?.complete !== true || report?.truncated === true ||
    report?.invalid_rows !== 0 || report?.skipped_rows !== 0;
  if (partial) reasons.push('INCOMPLETE_SYNC');
  const uncovered = since === null || until === null || since > first || until < requiredLast || requiredLast < first;
  if (uncovered) reasons.push('SYNC_WINDOW_UNPROVEN');
  const syncMs = asOf instanceof Date ? asOf.getTime() : Date.parse(asOf);
  const stale = last >= current && (!Number.isFinite(syncMs) || syncMs > nowMs || nowMs - syncMs > 8 * 3600000);
  if (stale) reasons.push('STALE_SYNC');
  const status = failed ? 'FAILED' : currencyMismatch ? 'CURRENCY_MISMATCH' :
    partial ? 'PARTIAL' : uncovered ? 'UNPROVEN' : stale ? 'STALE' : 'COMPLETE';
  const provenZero = rows.length === 0 && status === 'COMPLETE';
  if (provenZero) reasons.push('NO_ROWS_CONFIRMED_ZERO');
  // Without rows or a complete account sync, zero is not evidence of no spend.
  const spendVnd = validRows === 0 && !provenZero ? null : spend;
  return result(status, spendVnd, asOf, daysCovered, [...new Set(reasons)],
    status === 'COMPLETE' ? [...byDay].map(([day, vnd]) => ({ account_id: accountId, day, vnd })) : []);
}

function vietnamToday(nowMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(nowMs));
  const part = name => parts.find(item => item.type === name).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

async function readFacebookSpend(db, { accountId, from, to, pageSize = 1000 } = {}) {
  const nowMs = Date.now();
  const fail = reason => result('FAILED', null, null, 0, [reason]);
  if (!db?.from || !accountId || dayNumber(from) === null || dayNumber(to) === null ||
      from > to || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000)
    return fail('INVALID_INPUT');
  try {
    const accountResult = await db.from('fb_ad_accounts').select(ACCOUNT_COLUMNS)
      .eq('ad_account_id', accountId).maybeSingle();
    if (accountResult.error) return fail('DB_ERROR');
    const account = accountResult.data;
    if (!account || account.bat !== true) return result('UNPROVEN', null, null, 0, ['ACCOUNT_UNAVAILABLE']);
    const rows = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await db.from('fb_ad_spend_daily').select(SPEND_COLUMNS)
        .eq('ad_account_id', accountId).gte('ngay', from).lte('ngay', to)
        .order('ngay', { ascending: true }).order('ad_id', { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (response.error || !Array.isArray(response.data)) return fail('DB_ERROR');
      if (response.data.length > pageSize) return fail('DB_ERROR');
      rows.push(...response.data);
      if (response.data.length < pageSize) return evaluateSpendCoverage({
        accountId, from, to, rows, sync: account, nowMs, today: vietnamToday(nowMs),
      });
    }
    return fail('PAGE_LIMIT');
  } catch {
    return fail('DB_ERROR');
  }
}

module.exports = { toWholeVnd, evaluateSpendCoverage, readFacebookSpend };
