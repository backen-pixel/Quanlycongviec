/** Xác định kênh inbox (Facebook / Zalo) của lead/deal — khớp logic web LeadDetail.jsx */

export type InboxChannel = 'facebook' | 'zalo' | null;

export function resolveInboxChannel(lead: {
  inbox_channel?: string | null;
  source?: { name?: string | null } | string | null;
  title?: string | null;
} | null | undefined): InboxChannel {
  if (!lead) return null;
  const ch = String(lead.inbox_channel || '').trim().toLowerCase();
  if (ch === 'facebook' || ch === 'zalo') return ch;
  const srcName =
    typeof lead.source === 'string'
      ? lead.source
      : String(lead.source?.name || '');
  const src = srcName.toLowerCase();
  if (/facebook|messenger|\[fb\]/i.test(srcName) || src.includes('facebook')) return 'facebook';
  if (/zalo|\[zalo\]/i.test(srcName) || src.includes('zalo')) return 'zalo';
  const title = String(lead.title || '');
  if (/^\[zalo/i.test(title)) return 'zalo';
  if (/^\[fb/i.test(title) || /^\[facebook/i.test(title)) return 'facebook';
  return null;
}
