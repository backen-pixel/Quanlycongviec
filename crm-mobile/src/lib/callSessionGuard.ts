/** Trạng thái cuộc gọi in-memory — tránh nhận trùng / reo lại cùng callId. */
type CallPhase = 'idle' | 'incoming' | 'connecting' | 'active' | 'outgoing';

let activeCallId: string | null = null;
let callPhase: CallPhase = 'idle';
const answeredCallIds = new Map<string, number>();
const claimedIncomingIds = new Map<string, number>();
const TTL_MS = 120_000;

export function setCallSession(callId: string | null, phase: CallPhase): void {
  activeCallId = callId;
  callPhase = phase;
}

export function markCallAnswered(callId: string): void {
  if (!callId) return;
  answeredCallIds.set(callId, Date.now());
}

export function isCallInProgress(): boolean {
  return callPhase !== 'idle' && !!activeCallId;
}

export function getActiveCallSession(): { callId: string | null; phase: CallPhase } {
  return { callId: activeCallId, phase: callPhase };
}

function pruneMap(map: Map<string, number>): void {
  const now = Date.now();
  for (const [id, at] of map.entries()) {
    if (now - at > TTL_MS) map.delete(id);
  }
}

/** Chỉ một nguồn (socket / FCM / pending) được xử lý incoming cho callId. */
export function tryClaimIncomingCall(callId: string): boolean {
  if (!callId) return false;
  pruneMap(claimedIncomingIds);
  pruneMap(answeredCallIds);
  if (shouldSuppressIncomingRing(callId)) return false;
  if (claimedIncomingIds.has(callId)) return false;
  claimedIncomingIds.set(callId, Date.now());
  return true;
}

export function releaseIncomingClaim(callId?: string | null): void {
  if (!callId) {
    claimedIncomingIds.clear();
    return;
  }
  claimedIncomingIds.delete(callId);
}

/** Không hiện chuông khi đã trả lời hoặc đang xử lý cuộc gọi này. */
export function shouldSuppressIncomingRing(callId: string): boolean {
  if (!callId) return false;
  const answeredAt = answeredCallIds.get(callId);
  if (answeredAt != null && Date.now() - answeredAt < TTL_MS) return true;
  if (activeCallId === callId && callPhase !== 'idle') return true;
  return false;
}

/** Đã có nguồn khác claim incoming — chặn FCM/native trùng. */
export function isIncomingClaimed(callId: string): boolean {
  if (!callId) return false;
  return claimedIncomingIds.has(callId);
}
