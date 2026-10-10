'use strict';

// Pure config loader for the AI-draft pilot. Receives the environment as a parameter only.
// Any missing or malformed cap makes `caps` null so the service denies (fail closed).
const PILOT_FACTS = Object.freeze([
  'Văn phòng/showroom: 56 Lê Thúc Hoạch, P. Phú Thọ Hòa, Q. Tân Phú, TPHCM',
  'Chi nhánh 3: 20 Nguyễn Cơ Thạch, KĐT Sala, Quận 2, TPHCM',
  'Chi nhánh Cần Thơ: 172 Đường 3/2, P. Hưng Lợi, Q. Ninh Kiều, TP. Cần Thơ',
]);

const list = value => String(value ?? '').split(',').map(s => s.trim()).filter(Boolean);
const intOr = (value, fallback) => {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return /^\d+$/.test(String(value).trim()) ? Number(value) : null;
};
const numberOr = (value, fallback) => {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

function loadDraftConfig(env = {}) {
  const vndPerUsd = /^[1-9]\d*$/.test(String(env.P2_AI_DRAFTS_VND_PER_USD ?? '').trim())
    ? Number(env.P2_AI_DRAFTS_VND_PER_USD) : null;
  const maxUsd = numberOr(env.P2_AI_DRAFTS_MAX_USD_PER_DAY, 5);
  const maxDraftsPerDay = intOr(env.P2_AI_DRAFTS_MAX_PER_DAY, 50);
  const maxDraftsPerLead = intOr(env.P2_AI_DRAFTS_MAX_PER_LEAD, 3);
  const maxTokensPerDay = intOr(env.P2_AI_DRAFTS_MAX_TOKENS_PER_DAY, 200000);
  const usdPer1kIn = numberOr(env.P2_AI_DRAFTS_USD_PER_1K_IN, 0.00015);
  const usdPer1kOut = numberOr(env.P2_AI_DRAFTS_USD_PER_1K_OUT, 0.0006);
  const maxOutputTokens = intOr(env.P2_AI_DRAFTS_MAX_OUTPUT_TOKENS, 300);
  const valid = vndPerUsd !== null && [maxUsd, maxDraftsPerDay, maxDraftsPerLead, maxTokensPerDay,
    usdPer1kIn, usdPer1kOut, maxOutputTokens].every(v => v !== null);
  return {
    enabled: env.P2_AI_DRAFTS_ENABLED === '1',
    companyIds: list(env.P2_AI_DRAFTS_COMPANY_IDS),
    pageIds: list(env.P2_AI_DRAFTS_PAGE_IDS),
    userIds: list(env.P2_AI_DRAFTS_USER_IDS),
    caps: valid ? { maxDraftsPerDay, maxTokensPerDay, maxDraftsPerLead,
      maxVndPerDay: Math.ceil(maxUsd * vndPerUsd) } : null,
    pricing: valid ? { usdPer1kIn, usdPer1kOut, vndPerUsd } : null,
    promptVersion: 'p2-v2',
    pilotFacts: [...PILOT_FACTS],
    maxOutputTokens: valid ? maxOutputTokens : null,
  };
}

module.exports = { loadDraftConfig, PILOT_FACTS };
