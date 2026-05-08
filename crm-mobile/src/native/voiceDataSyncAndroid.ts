import { NativeModules, Platform } from 'react-native';

export type VoiceDataSyncDebugState = {
  syncEnabled: boolean;
  lastRunMs: number;
  lastUploaded: number;
  lastResult: string;
  lastSyncMs: number;
};

export type LocalCallRecording = {
  id: string;
  name: string;
  size: number;
  dateAddedMs: number;
  mime: string | null;
  relativePath: string | null;
  phoneHint: string | null;
  contentUri: string;
  /** True nếu cache local đã đánh dấu đã upload trước đó. */
  locallyUploaded: boolean;
};

type VoiceDataSyncModuleType = {
  startSync(apiBaseUrl: string, bearerToken: string, lastSyncMs: number): Promise<boolean>;
  stopSync(): Promise<boolean>;
  stopSyncLogout(): Promise<boolean>;
  getDebugState(): Promise<VoiceDataSyncDebugState>;
  listLocalCallRecordings(sinceMs: number, limit: number, includeAll: boolean): Promise<LocalCallRecording[]>;
  getLocallyUploadedNames(): Promise<string[]>;
  markLocallyUploaded(fileName: string): Promise<boolean>;
  unmarkLocallyUploaded(fileName: string): Promise<boolean>;
  reuploadByName(fileName: string, fileSize: number): Promise<boolean>;
  triggerSyncNow(): Promise<boolean>;
};

const VoiceDataSync = NativeModules.VoiceDataSync as VoiceDataSyncModuleType | undefined;

export function isVoiceDataSyncAvailable(): boolean {
  return Platform.OS === 'android' && VoiceDataSync != null;
}

export async function voiceDataSyncStart(apiBaseUrl: string, bearerToken: string, lastSyncMs: number): Promise<void> {
  if (!VoiceDataSync) return;
  await VoiceDataSync.startSync(apiBaseUrl, bearerToken, lastSyncMs);
}

export async function voiceDataSyncStop(): Promise<void> {
  if (!VoiceDataSync) return;
  await VoiceDataSync.stopSync();
}

export async function voiceDataSyncStopLogout(): Promise<void> {
  if (!VoiceDataSync) return;
  await VoiceDataSync.stopSyncLogout();
}

export async function voiceDataSyncGetDebugState(): Promise<VoiceDataSyncDebugState | null> {
  if (!VoiceDataSync) return null;
  return VoiceDataSync.getDebugState();
}

export async function voiceListLocalCallRecordings(
  opts: { sinceMs?: number; limit?: number; includeAll?: boolean } = {},
): Promise<LocalCallRecording[]> {
  if (!VoiceDataSync) return [];
  const sinceMs = Math.max(0, Math.floor(opts.sinceMs ?? 0));
  const limit = Math.max(1, Math.min(500, Math.floor(opts.limit ?? 200)));
  const includeAll = !!opts.includeAll;
  return VoiceDataSync.listLocalCallRecordings(sinceMs, limit, includeAll);
}

export async function voiceGetLocallyUploadedNames(): Promise<string[]> {
  if (!VoiceDataSync) return [];
  return VoiceDataSync.getLocallyUploadedNames();
}

export async function voiceMarkLocallyUploaded(fileName: string): Promise<void> {
  if (!VoiceDataSync) return;
  await VoiceDataSync.markLocallyUploaded(fileName);
}

export async function voiceUnmarkLocallyUploaded(fileName: string): Promise<void> {
  if (!VoiceDataSync) return;
  await VoiceDataSync.unmarkLocallyUploaded(fileName);
}

export async function voiceReuploadByName(fileName: string, fileSize: number): Promise<boolean> {
  if (!VoiceDataSync) return false;
  return VoiceDataSync.reuploadByName(fileName, Math.max(0, Math.floor(fileSize || 0)));
}

export async function voiceTriggerSyncNow(): Promise<void> {
  if (!VoiceDataSync) return;
  await VoiceDataSync.triggerSyncNow();
}
