import { dateLabel, resolveMediaUrl, timeLabel } from '../lib/media';
import { api } from './client';
import type { Recording } from '../types';

type ApiRecording = {
  id: string;
  file_name?: string | null;
  duration_sec?: number | null;
  source?: string | null;
  device_label?: string | null;
  created_at?: string | null;
  phone_number?: string | null;
  audio_url?: string | null;
  storage_path?: string | null;
  customer_id?: string | null;
  lead_id?: string | null;
  customer?: { full_name?: string | null } | null;
  uploader?: { full_name?: string | null } | null;
};

export type RecordingItem = Recording & { playUrl: string | null };

function mapRecording(r: ApiRecording): RecordingItem {
  return {
    id: r.id,
    title: r.file_name || 'Ghi âm',
    timeLabel: timeLabel(r.created_at),
    dateLabel: dateLabel(r.created_at),
    ownerName: r.uploader?.full_name || '—',
    phone: r.phone_number || '—',
    device: r.device_label || r.source || 'Thiết bị',
    durationSec: r.duration_sec || 0,
    linked: !!(r.lead_id || r.customer_id),
    customerName: r.customer?.full_name || undefined,
    playUrl: resolveMediaUrl(r.audio_url || r.storage_path),
  };
}

export async function fetchRecordings(signal?: AbortSignal): Promise<RecordingItem[]> {
  const { data } = await api.get<{ recordings?: ApiRecording[] }>('/voice-recordings', { signal });
  const list = Array.isArray(data?.recordings) ? data.recordings : [];
  return list.map(mapRecording);
}
