import type { OrgReportCompare } from '../api/employeeReport';

export type CompareMetric = {
  previous?: number;
  delta?: number;
  pct?: number | null;
};

export function getCompareMetric(
  compare: OrgReportCompare | null | undefined,
  key: string,
): CompareMetric | null {
  if (!compare) return null;
  const m = compare[key];
  if (!m || typeof m !== 'object') return null;
  return m as CompareMetric;
}

export function formatComparePct(
  pct?: number | null,
  delta?: number | null,
  compareKey?: string,
): string | null {
  if (pct != null && Number.isFinite(pct)) {
    const sign = pct > 0 ? '+' : '';
    return `${sign}${Math.round(pct)}%`;
  }
  if (compareKey === 'conversion_rate' && delta != null && Number.isFinite(delta)) {
    const sign = delta > 0 ? '+' : '';
    return `${sign}${Math.round(delta * 10) / 10} điểm`;
  }
  if (delta != null && Number.isFinite(delta)) {
    const sign = delta > 0 ? '+' : '';
    return `${sign}${Math.round(delta)}`;
  }
  return null;
}

export function compareTrendUp(pct?: number | null, delta?: number | null): boolean | null {
  if (pct != null && Number.isFinite(pct)) return pct >= 0;
  if (delta != null && Number.isFinite(delta)) return delta >= 0;
  return null;
}

export function formatCompareTrend(
  compare: OrgReportCompare | null | undefined,
  key: string,
): { text: string | null; up: boolean | null } {
  const cmp = getCompareMetric(compare, key);
  if (!cmp) return { text: null, up: null };
  return {
    text: formatComparePct(cmp.pct, cmp.delta, key),
    up: compareTrendUp(cmp.pct, cmp.delta),
  };
}
