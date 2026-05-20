/**
 * Khóa bubble cho native overlay — lead dùng prefix `lead:`.
 */
export const BUBBLE_LEAD_PREFIX = 'lead:';

export function toBubbleStorageKey(
  type: 'messenger_chat' | 'lead_chat' | string | undefined,
  entityId: string,
): string {
  if (type === 'lead_chat') return `${BUBBLE_LEAD_PREFIX}${entityId}`;
  return entityId;
}

export function parseBubbleStorageKey(
  key: string,
): { kind: 'messenger' | 'lead'; entityId: string } {
  if (key.startsWith(BUBBLE_LEAD_PREFIX)) {
    return { kind: 'lead', entityId: key.slice(BUBBLE_LEAD_PREFIX.length) };
  }
  return { kind: 'messenger', entityId: key };
}
