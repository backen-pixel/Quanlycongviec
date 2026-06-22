/** Màu stack Deal theo pipeline — tách Hoàn thành để nhìn SL trực quan */
export const PIPELINE_DEAL_STACK_COLORS = {
  Chốt: '#059669',
  'Hoàn thành': '#7c3aed',
  Thua: '#e11d48',
  Mở: '#0284c7',
};

export const PIPELINE_DEAL_STACK_ORDER = ['Chốt', 'Hoàn thành', 'Thua', 'Mở'];

/**
 * Chia deal pipeline thành 4 phần không chồng lấn (tổng = deal_count).
 * Hoàn thành có thể nằm trong chốt hoặc đang mở — trừ ra khỏi bucket gốc.
 */
export function buildPipelineDealStackRow(p, name) {
  const won = p.won_deal_count || 0;
  const lost = p.lost_deal_count || 0;
  const deal = p.deal_count || 0;
  const ht = p.completed_deal_count ?? 0;
  const open = p.open_deal_count ?? Math.max(0, deal - won - lost);
  const htFromWon = Math.min(ht, won);
  const htFromOpen = Math.max(0, ht - won);

  return {
    name,
    Chốt: Math.max(0, won - htFromWon),
    'Hoàn thành': ht,
    Thua: lost,
    Mở: Math.max(0, open - htFromOpen),
    completed_count: ht,
    completion_rate_pct: p.completion_rate_pct ?? null,
  };
}
