import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { api, getStoredToken } from './client';
import { API_PREFIX } from '../config';

export type QuotationStatus =
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'converted';

export type QuotationLead = {
  id: string;
  code?: string | null;
  title?: string | null;
  type?: string | null;
};

export type QuotationRow = {
  id: string;
  code?: string | null;
  title?: string | null;
  customer_name?: string | null;
  total?: number | null;
  status?: QuotationStatus | string | null;
  created_at?: string | null;
  lead_id?: string | null;
  is_orphan?: boolean;
  company_id?: string | null;
  region_id?: string | null;
  created_by?: string | null;
  company?: { id: string; name?: string | null; short_name?: string | null } | null;
  region?: { id: string; name?: string | null; code?: string | null } | null;
  creator?: { id: string; full_name?: string | null } | null;
  lead?: QuotationLead | null;
};

export const QUOTATION_STATUS_LABEL: Record<string, string> = {
  draft: 'Nháp',
  sent: 'Đã gửi',
  accepted: 'Chấp nhận',
  rejected: 'Từ chối',
  expired: 'Hết hạn',
  converted: 'Đã chuyển ĐH',
};

export type FetchQuotationsParams = {
  search?: string;
  status?: string;
  companyId?: string;
  regionId?: string;
  createdBy?: string;
  orphan?: 'only' | 'exclude';
  limit?: number;
  signal?: AbortSignal;
};

export async function fetchQuotations(params: FetchQuotationsParams = {}): Promise<QuotationRow[]> {
  const { data } = await api.get<QuotationRow[]>('/crm/quotations', {
    params: {
      limit: params.limit ?? 500,
      search: params.search?.trim() || undefined,
      status: params.status || undefined,
      company_id: params.companyId || undefined,
      region_id: params.regionId || undefined,
      created_by: params.createdBy || undefined,
      orphan: params.orphan || undefined,
    },
    signal: params.signal,
  });
  return Array.isArray(data) ? data : [];
}

export async function deleteQuotation(id: string): Promise<void> {
  await api.delete(`/crm/quotations/${id}`);
}

/** Tải PDF báo giá về cache và trả về đường dẫn local. */
export async function downloadQuotationPdf(id: string, code?: string | null): Promise<string> {
  const token = await getStoredToken();
  const safeCode = (code || 'bao-gia').replace(/[^a-zA-Z0-9\-]/g, '_');
  const dest = `${FileSystem.cacheDirectory}${safeCode}.pdf`;
  const url = `${API_PREFIX}/crm/quotations/${id}/pdf`;
  const result = await FileSystem.downloadAsync(url, dest, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Không tải được PDF (${result.status})`);
  }
  if (Platform.OS === 'android') {
    try {
      const IntentLauncher = await import('expo-intent-launcher');
      const contentUri = await FileSystem.getContentUriAsync(result.uri);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1,
        type: 'application/pdf',
      });
    } catch {
      /* file đã lưu cache */
    }
  }
  return result.uri;
}
