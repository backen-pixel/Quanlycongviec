'use strict';

const DAY = 86400000;
const APPROVED_PLAN = Object.freeze({
  version: 'VPT-MS-20261002-v1', currency: 'VND', trialDays: 30,
  trialCapVnd: 100000000, targetRatio: 0.07, targetRevenueVnd: 1428571429,
  regionCapsVnd: Object.freeze({ hcm: 80000000, can_tho: 20000000 }),
  channelCapsVnd: Object.freeze({ google: 35000000, facebook: 30000000, tiktok: 20000000, zalo: 10000000, chatgpt: 5000000 }),
  holdDays: 7, minimumQualifiedLeads: 10, maxChangeBps: 1000, cooldownHours: 48,
  humanHours: Object.freeze({ start: 8, end: 20, timezone: 'Asia/Ho_Chi_Minh', slaMinutes: 15 }),
  salesAuthority: 'ADVISE_AND_BOOK_SURVEY', automaticRenewal: false,
});
const money = (x) => Number.isSafeInteger(x) && x >= 0;
const instant = (x) => typeof x === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(x) && Number.isFinite(Date.parse(x));
const deny = (reason) => ({ status: 'DENIED', reason });

// Domain result is not an execution grant. Application must recheck trusted
// policy, source snapshots, revocation and reservations inside its transaction.
function evaluateBudgetMove(c) {
  if (!c || !instant(c.now) || !instant(c.trialStart)) return deny('INVALID_TIME');
  if (c.policyVersion !== APPROVED_PLAN.version || c.authorized !== true || c.released !== true) return deny('POLICY_NOT_RELEASED');
  if (!c.companyId || c.companyId !== c.authorizedCompanyId) return deny('COMPANY_SCOPE');
  if (!Object.hasOwn(APPROVED_PLAN.regionCapsVnd, c.region) || c.region !== c.destinationRegion) return deny('REGION_SCOPE');
  if (!Object.hasOwn(APPROVED_PLAN.channelCapsVnd, c.sourceChannel) || !Object.hasOwn(APPROVED_PLAN.channelCapsVnd, c.destinationChannel) || c.sourceChannel === c.destinationChannel) return deny('CHANNEL_SCOPE');
  const age = (Date.parse(c.now) - Date.parse(c.trialStart)) / DAY;
  if (age < APPROVED_PLAN.holdDays) return deny('INITIAL_HOLD');
  if (age >= APPROVED_PLAN.trialDays) return deny('TRIAL_ENDED');
  if (c.currency !== 'VND' || c.coverage !== 'COMPLETE' || c.spendFresh !== true || c.intakeHealthy !== true) return deny('UNVERIFIED_SOURCE');
  if (c.platformCapVerified !== true) return deny('PLATFORM_CAP_UNVERIFIED');
  if (c.sourceProductGroup !== c.destinationProductGroup || !c.sourceProductGroup) return deny('INCOMPARABLE_PRODUCT_GROUPS');
  if (![c.sourceQualifiedLeads, c.destinationQualifiedLeads, c.sourceObservedDays, c.destinationObservedDays].every(money)) return deny('INVALID_EVIDENCE');
  if (Math.min(c.sourceQualifiedLeads, c.destinationQualifiedLeads) < 10 || Math.min(c.sourceObservedDays, c.destinationObservedDays) < 7) return deny('INSUFFICIENT_EVIDENCE');
  if (!['RECONCILED_REVENUE', 'QUALIFIED_SURVEY_EXPERIMENT'].includes(c.basis)) return deny('INVALID_BASIS');
  if (c.basis === 'RECONCILED_REVENUE' && (c.revenueCoverage !== 'COMPLETE' || c.comparableMaturity !== true)) return deny('REVENUE_NOT_READY');
  if (c.destinationImproved !== true) return deny('NO_VERIFIED_IMPROVEMENT');
  const amounts = [c.amountVnd, c.sourceDailyVnd, c.destinationDailyVnd, c.totalExposureAfterVnd, c.regionExposureAfterVnd];
  if (!amounts.every(money) || c.amountVnd === 0) return deny('INVALID_MONEY');
  const maximum = Math.floor(Math.min(c.sourceDailyVnd, c.destinationDailyVnd) / 10);
  if (c.amountVnd > maximum) return deny('CHANGE_OVER_TEN_PERCENT');
  if (c.totalExposureAfterVnd > APPROVED_PLAN.trialCapVnd || c.regionExposureAfterVnd > APPROVED_PLAN.regionCapsVnd[c.region]) return deny('BUDGET_CAP');
  for (const last of [c.sourceLastChangedAt, c.destinationLastChangedAt]) {
    if (last != null && (!instant(last) || Date.parse(c.now) - Date.parse(last) < 48 * 3600000)) return deny('COOLDOWN');
  }
  if (c.decreaseConfirmed !== true) return { status: 'PENDING', reason: 'CONFIRM_DECREASE_FIRST' };
  return { status: 'ALLOWED', reason: c.basis, amountVnd: c.amountVnd, achievesSevenPercent: false };
}

function humanDeadline(receivedAt, minutes = 15) {
  if (!instant(receivedAt) || !Number.isSafeInteger(minutes) || minutes < 0 || minutes > 720) throw new Error('INVALID_SLA_INPUT');
  let local = new Date(Date.parse(receivedAt) + 7 * 3600000);
  const start = new Date(local); start.setUTCHours(8, 0, 0, 0);
  const end = new Date(local); end.setUTCHours(20, 0, 0, 0);
  if (local < start) local = start;
  if (local >= end) { local = new Date(start); local.setUTCDate(local.getUTCDate() + 1); }
  const shiftEnd = new Date(local); shiftEnd.setUTCHours(20, 0, 0, 0);
  let target = new Date(local.getTime() + minutes * 60000);
  if (target > shiftEnd) target = new Date(target.getTime() + 12 * 3600000);
  return new Date(target.getTime() - 7 * 3600000).toISOString();
}
module.exports = { APPROVED_PLAN, evaluateBudgetMove, humanDeadline, money, instant };
