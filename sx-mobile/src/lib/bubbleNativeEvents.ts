/** Khóa bubble cho native overlay — messenger dùng groupId trực tiếp. */
export function toBubbleStorageKey(_type: string | undefined, entityId: string): string {
  return entityId;
}

export function parseBubbleStorageKey(
  key: string,
): { kind: 'messenger'; entityId: string } {
  return { kind: 'messenger', entityId: key };
}
