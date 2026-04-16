import { API_ORIGIN } from '../config';
import type { CrmVoiceRecording } from '../types/crm';

export function voiceRecordingPlayUrl(rec: CrmVoiceRecording): string | null {
  if (rec.audio_url) return rec.audio_url;
  const p = rec.storage_path;
  if (!p || typeof p !== 'string') return null;
  const path = p.startsWith('/') ? p : `/${p}`;
  return `${API_ORIGIN.replace(/\/$/, '')}${path}`;
}
