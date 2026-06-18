import type { PendingChatFile } from './messengerMedia';

let pending: PendingChatFile[] = [];

export function setPendingShareFiles(files: PendingChatFile[]): void {
  pending = files;
}

export function takePendingShareFiles(): PendingChatFile[] {
  const out = pending;
  pending = [];
  return out;
}

export function peekPendingShareFiles(): PendingChatFile[] {
  return pending;
}

export function hasPendingShareFiles(): boolean {
  return pending.length > 0;
}
