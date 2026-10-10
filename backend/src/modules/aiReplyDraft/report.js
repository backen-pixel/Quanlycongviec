'use strict';

// Pure summary of AI-draft events: how many drafts staff actually used, edited or dropped,
// and what they cost. Input rows carry no draft text; the result carries counts only.
const toCount = value => (Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0);

function summarizeDrafts(rows = []) {
  const drafts = new Map();
  let costVnd = 0, tokens = 0;
  const discardReasons = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row.draft_id !== 'string') continue;
    const d = drafts.get(row.draft_id) || { first: null, last: null, edited: false };
    if (!d.first || row.revision < d.first.revision) d.first = row;
    if (!d.last || row.revision > d.last.revision) d.last = row;
    if (row.kind === 'EDITED') d.edited = true;
    drafts.set(row.draft_id, d);
    if (row.kind === 'GENERATED' || row.kind === 'DISCARDED') {
      costVnd += toCount(row.cost_vnd);
      tokens += toCount(row.prompt_tokens) + toCount(row.completion_tokens);
    }
    if (row.kind === 'DISCARDED')
      for (const code of Array.isArray(row.policy_reasons) ? row.policy_reasons : [])
        discardReasons[code] = (discardReasons[code] || 0) + 1;
  }
  const out = { generated: 0, discarded: 0, sent_unchanged: 0, sent_edited: 0, rejected: 0, pending: 0 };
  for (const { first, last, edited } of drafts.values()) {
    if (first?.kind === 'DISCARDED') { out.discarded += 1; continue; }
    if (first?.kind !== 'GENERATED') continue;
    out.generated += 1;
    if (last.kind === 'SENT_BY_HUMAN') out[edited ? 'sent_edited' : 'sent_unchanged'] += 1;
    else if (last.kind === 'REJECTED') out.rejected += 1;
    else out.pending += 1;
  }
  const sent = out.sent_unchanged + out.sent_edited;
  const decided = sent + out.rejected;
  return { ...out, sent, cost_vnd: costVnd, tokens, discard_reasons: discardReasons,
    // Share of drafts staff decided on that ended up sent; null until something was decided.
    use_rate_pct: decided ? Math.round((sent * 100) / decided) : null };
}

module.exports = { summarizeDrafts };
