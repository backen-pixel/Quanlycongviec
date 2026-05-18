/** Tham số tính KPI — merge mặc định theo code + calc_params từ DB. */

const DEFAULT_CALC_PARAMS_BY_CODE = {
  A1: { sla_minutes: 15 },
};

function resolveCalcParams(definition) {
  const code = definition?.code;
  const base = code && DEFAULT_CALC_PARAMS_BY_CODE[code]
    ? { ...DEFAULT_CALC_PARAMS_BY_CODE[code] }
    : {};
  const raw = definition?.calc_params;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...base, ...raw };
  }
  return base;
}

function positiveNumberParam(params, key, fallback) {
  const n = Number(params?.[key]);
  if (Number.isFinite(n) && n > 0) return n;
  return fallback;
}

module.exports = {
  DEFAULT_CALC_PARAMS_BY_CODE,
  resolveCalcParams,
  positiveNumberParam,
};
