/**
 * Thứ tự rank của canonical_slug trong phễu CRM.
 * Rank cao hơn = giai đoạn xa hơn trong phễu.
 *
 * Quy tắc:
 *   - "Đạt rank X" = lead đã từng có ít nhất 1 row history với to_canonical_slug có rank >= X.
 *   - "Nhảy cóc" được hiểu là đi qua: nếu lead đến rank 9 (quoted), coi như đã qua 7 (survey_done), 6, 5...
 *   - "Đi lùi" KHÔNG làm giảm max_rank — KPI nhóm B đo "đã từng đạt", không reset.
 *   - 'lost' là trạng thái terminal, không tham gia rank phễu (rank null).
 */

const CANONICAL_RANK = {
  // Lead pipeline (rank 1-7)
  lead_new: 1,
  not_contacted: 2,
  cold: 3,
  warm: 4,
  hot: 5,
  survey_scheduled: 6,
  survey_done: 7,
  // Deal pipeline (rank 8-15)
  designing: 8,
  quoted: 9,
  negotiating: 10,
  waiting_deposit: 11,
  contract_signed: 12,
  producing: 13,
  installing: 14,
  completed: 15,
  // Terminal — không xếp rank
  lost: null,
};

const RANK_TO_SLUG = Object.entries(CANONICAL_RANK)
  .filter(([, r]) => r != null)
  .reduce((acc, [s, r]) => { acc[r] = s; return acc; }, {});

/**
 * Phân tích lịch sử của 1 lead để lấy max_rank, current_rank, first_entered times.
 * @param {Array} historyOfLead - đã được filter cho 1 lead, sorted ASC theo entered_at
 */
function getLeadProgress(historyOfLead) {
  let maxRank = 0;
  let currentRank = 0;
  let currentSlug = null;
  let wasLost = false;
  const firstEntered = {};   // slug -> ISO time first time entering this slug

  for (const h of historyOfLead) {
    const slug = h.to_canonical_slug;
    if (!slug) continue;

    // Ghi lần đầu vào slug
    if (!firstEntered[slug]) firstEntered[slug] = h.entered_at;

    if (slug === 'lost') { wasLost = true; continue; }
    const r = CANONICAL_RANK[slug];
    if (r == null) continue;

    if (r > maxRank) maxRank = r;
    currentRank = r;
    currentSlug = slug;
  }

  return {
    max_rank: maxRank,
    max_slug: maxRank > 0 ? RANK_TO_SLUG[maxRank] : null,
    current_rank: currentRank,
    current_slug: currentSlug,
    was_lost: wasLost,
    first_entered: firstEntered,
    // Đã đạt tới rank X chưa (kể cả nhảy cóc)
    hasReached: (rank) => maxRank >= rank,
  };
}

/**
 * Group history by lead_id, sort each group by entered_at ASC, trả về Map<leadId, progress>.
 */
function buildProgressMap(history) {
  const byLead = new Map();
  for (const h of history) {
    if (!byLead.has(h.lead_id)) byLead.set(h.lead_id, []);
    byLead.get(h.lead_id).push(h);
  }
  const result = new Map();
  for (const [leadId, arr] of byLead.entries()) {
    arr.sort((a, b) => new Date(a.entered_at) - new Date(b.entered_at));
    result.set(leadId, getLeadProgress(arr));
  }
  return result;
}

module.exports = { CANONICAL_RANK, RANK_TO_SLUG, getLeadProgress, buildProgressMap };
