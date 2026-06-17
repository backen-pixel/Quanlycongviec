import { Platform } from 'react-native';
import { dateLabel, resolveMediaUrl, timeLabel } from '../lib/media';
import { normalizeVoiceRecordingFileName, voiceRecordingDisplayTitle } from '../lib/voiceRecordingName';
import { api, postMultipart } from './client';
import type { Recording } from '../types';

type ApiRecording = {
  id: string;
  user_id?: string | null;
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
  notes?: string | null;
  customer?: { full_name?: string | null } | null;
  lead?: { id?: string; code?: string | null; title?: string | null; type?: string | null } | null;
  uploader?: { full_name?: string | null } | null;
};

export type RecordingItem = Recording & {
  playUrl: string | null;
  userId?: string | null;
  phoneNumber?: string | null;
  leadId?: string | null;
  customerId?: string | null;
  notes?: string | null;
  leadCode?: string | null;
  leadTitle?: string | null;
  leadType?: string | null;
};

function mapRecording(r: ApiRecording): RecordingItem {
  return {
    id: r.id,
    title: voiceRecordingDisplayTitle(r.file_name),
    timeLabel: timeLabel(r.created_at),
    dateLabel: dateLabel(r.created_at),
    ownerName: r.uploader?.full_name || '—',
    phone: r.phone_number || '—',
    device: r.device_label || r.source || 'Thiết bị',
    durationSec: r.duration_sec || 0,
    linked: !!(r.lead_id || r.customer_id),
    customerName: r.customer?.full_name || undefined,
    playUrl: resolveMediaUrl(r.audio_url || r.storage_path),
    userId: r.user_id,
    phoneNumber: r.phone_number,
    leadId: r.lead_id,
    customerId: r.customer_id,
    notes: r.notes || undefined,
    leadCode: r.lead?.code || undefined,
    leadTitle: r.lead?.title || undefined,
    leadType: r.lead?.type || undefined,
  };
}

export async function fetchRecordings(signal?: AbortSignal): Promise<RecordingItem[]> {
  const { data } = await api.get<{ recordings?: ApiRecording[] }>('/voice-recordings', { signal });
  const list = Array.isArray(data?.recordings) ? data.recordings : [];
  return list.map(mapRecording);
}

export async function uploadRecording(opts: {
  localUri: string;
  fileName: string;
  mime: string;
  durationSec?: number;
  notes?: string;
  phoneNumber?: string | null;
  source?: string;
  deviceLabel?: string;
}): Promise<RecordingItem> {
  const form = new FormData();
  const safeName = normalizeVoiceRecordingFileName(opts.fileName) || opts.fileName;
  form.append('audio', {
    uri: opts.localUri,
    name: safeName,
    type: opts.mime,
  } as unknown as Parameters<FormData['append']>[1]);
  form.append('source', opts.source || 'crm_mobile_v2');
  form.append('device_label', opts.deviceLabel || `${Platform.OS} crm-mobile-v2`);
  if (opts.notes?.trim()) form.append('notes', opts.notes.trim().slice(0, 2000));
  if (opts.durationSec != null && opts.durationSec > 0) {
    form.append('duration_sec', String(Math.round(opts.durationSec * 10) / 10));
  }
  const phone = opts.phoneNumber?.replace(/\s+/g, '').trim();
  if (phone) form.append('phone_number', phone.slice(0, 32));

  const { data } = await postMultipart<{ recording?: ApiRecording }>('/voice-recordings', form);
  if (!data?.recording?.id) throw new Error('Thiếu id bản ghi sau upload');
  return mapRecording(data.recording);
}

export async function deleteRecording(id: string): Promise<void> {
  await api.delete(`/voice-recordings/${id}`);
}

export async function relinkRecording(id: string): Promise<RecordingItem> {
  const { data } = await api.patch<{ recording?: ApiRecording }>(`/voice-recordings/${id}`, {
    action: 'relink_from_phone',
  });
  if (!data?.recording) throw new Error('Không cập nhật được bản ghi');
  return mapRecording(data.recording);
}

export async function relinkUnassigned(allUsers = false): Promise<{ scanned: number; updated: number }> {
  const { data } = await api.post<{ scanned?: number; updated?: number }>(
    '/voice-recordings/relink-unassigned',
    allUsers ? { all_users: true } : {},
  );
  return {
    scanned: typeof data?.scanned === 'number' ? data.scanned : 0,
    updated: typeof data?.updated === 'number' ? data.updated : 0,
  };
}

export async function bootstrapCrmFromRecording(
  id: string,
  body: { full_name?: string; title?: string; type?: 'lead' | 'deal'; company_id?: string; phone_number?: string; force_new?: boolean },
): Promise<RecordingItem> {
  const { data } = await api.post<{ recording?: ApiRecording }>(`/voice-recordings/${id}/bootstrap-crm`, body);
  if (!data?.recording) throw new Error('Không tạo được KH/Lead');
  return mapRecording(data.recording);
}
