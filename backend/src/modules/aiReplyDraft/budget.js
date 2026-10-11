'use strict';

// Pure daily cost guard for AI draft calls. Integer VND, rounded UP; any missing input denies.
const CAP_KEYS = ['maxDraftsPerDay', 'maxTokensPerDay', 'maxVndPerDay', 'maxDraftsPerLead'];
const USED_KEYS = ['drafts', 'tokens', 'vnd', 'draftsForLead'];
const isCount = value => Number.isSafeInteger(value) && value >= 0;
const deny = reason => ({ allowed: false, reason, remaining: null });

// micro-USD per 1k tokens, as an integer (e.g. 0.00015 USD -> 150).
const microPer1k = usd => Number.isFinite(usd) && usd >= 0 ? Math.round(usd * 1e6) : null;

function estimateVnd({ promptTokens, maxOutputTokens, usdPer1kIn, usdPer1kOut, vndPerUsd }) {
  const inMicro = microPer1k(usdPer1kIn), outMicro = microPer1k(usdPer1kOut);
  if (inMicro === null || outMicro === null || !isCount(promptTokens) || !isCount(maxOutputTokens)
    || !isCount(vndPerUsd) || vndPerUsd === 0) return null;
  const numerator = (BigInt(promptTokens) * BigInt(inMicro) + BigInt(maxOutputTokens) * BigInt(outMicro))
    * BigInt(vndPerUsd);
  const billion = 1000000000n;
  const vnd = (numerator + billion - 1n) / billion;
  return vnd <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(vnd) : null;
}

function checkBudget({ usedToday, caps, estimate } = {}) {
  if (!caps || !CAP_KEYS.every(k => isCount(caps[k]))) return deny('CAPS_MISSING');
  if (!usedToday || !USED_KEYS.every(k => isCount(usedToday[k]))) return deny('USAGE_MISSING');
  const cost = estimateVnd(estimate ?? {});
  if (cost === null) return deny('ESTIMATE_MISSING');
  const tokens = estimate.promptTokens + estimate.maxOutputTokens;
  if (usedToday.draftsForLead + 1 > caps.maxDraftsPerLead) return deny('LEAD_CAP');
  if (usedToday.drafts + 1 > caps.maxDraftsPerDay) return deny('DRAFT_CAP');
  if (usedToday.tokens + tokens > caps.maxTokensPerDay) return deny('TOKEN_CAP');
  if (usedToday.vnd + cost > caps.maxVndPerDay) return deny('VND_CAP');
  return { allowed: true, reason: null, estimatedVnd: cost, remaining: {
    drafts: caps.maxDraftsPerDay - usedToday.drafts - 1,
    tokens: caps.maxTokensPerDay - usedToday.tokens - tokens,
    vnd: caps.maxVndPerDay - usedToday.vnd - cost,
  } };
}

module.exports = { checkBudget, estimateVnd };
