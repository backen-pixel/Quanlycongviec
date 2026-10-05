'use strict';

const APPROVED_PLAN = Object.freeze({
  version: 'VPT-MS-20261002-v2', currency: 'VND', trialDays: 30,
  primaryMetric: 'COST_PER_QUALIFIED_PAID_LEAD', targetQualifiedLeadCostVnd: 250000,
  trialCapVnd: 100000000, targetRatio: 0.07, targetRevenueVnd: 1428571429,
  regionCapsVnd: Object.freeze({ hcm: 80000000, can_tho: 20000000 }),
  channelCapsVnd: Object.freeze({ google: 35000000, facebook: 30000000, tiktok: 20000000, zalo: 10000000, chatgpt: 5000000 }),
  holdDays: 7, minimumQualifiedLeads: 10, maxChangeBps: 1000, cooldownHours: 48,
  humanHours: Object.freeze({ start: 8, end: 20, timezone: 'Asia/Ho_Chi_Minh', slaMinutes: 15 }),
  salesAuthority: 'ADVISE_AND_BOOK_SURVEY', automaticRenewal: false,
});
const money = (x) => Number.isSafeInteger(x) && x >= 0;
const instant = (x) => typeof x === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(x) && Number.isFinite(Date.parse(x));
module.exports = { APPROVED_PLAN, money, instant };
