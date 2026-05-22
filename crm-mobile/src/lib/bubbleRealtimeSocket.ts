/**
 * Tracker đơn giản cho lead đang được người dùng MỞ NGUYÊN MÀN HÌNH (LeadChatPanel).
 *
 * Khi user đang ngồi đọc lead chat trong app, các nơi khác (SystemBubbleSync,
 * peek notification…) cần biết để bỏ qua việc bật peek bubble cho chính lead đó —
 * tránh thông báo trùng / spam UI.
 *
 * Hiện chỉ là module trạng thái tại RAM — đủ cho parity với behaviour của Messenger
 * ("suppress notification due to user in same thread"). Không persist sang native;
 * native overlay panel có cơ chế riêng (xem `OverlayBubbleService.activeExpandedKey`).
 */

type Listener = (leadId: string | null) => void;

let foregroundLead: string | null = null;
const listeners = new Set<Listener>();

export function setForegroundLead(leadId: string | null): void {
  if (foregroundLead === leadId) return;
  foregroundLead = leadId;
  for (const l of listeners) {
    try { l(leadId); } catch { /* ignore */ }
  }
}

export function getForegroundLead(): string | null {
  return foregroundLead;
}

export function subscribeForegroundLead(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
