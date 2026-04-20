import { NativeModules, Platform } from 'react-native';

export type VoiceDataSyncDebugState = {
  syncEnabled: boolean;
  lastRunMs: number;
  lastUploaded: number;
  lastResult: string;
  lastSyncMs: number;
};

type VoiceDataSyncModuleType = {
  startSync(apiBaseUrl: string, bearerToken: string, lastSyncMs: number): Promise<boolean>;
  stopSync(): Promise<boolean>;
  stopSyncLogout(): Promise<boolean>;
  getDebugState(): Promise<VoiceDataSyncDebugState>;
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
