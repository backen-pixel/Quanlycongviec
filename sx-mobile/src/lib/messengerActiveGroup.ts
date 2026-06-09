let activeGroupId: string | null = null;

export function setMessengerActiveGroupId(groupId: string | null): void {
  activeGroupId = groupId;
}

export function getMessengerActiveGroupId(): string | null {
  return activeGroupId;
}
