import { api } from './client';

export type OrderStatus =
  | 'draft'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export type PaymentStatus = 'unpaid' | 'partial' | 'paid';

export type OrderRow = {
  id: string;
  code?: string | null;
  title?: string | null;
  customer_name?: string | null;
  total?: number | null;
  paid_amount?: number | null;
  status?: OrderStatus | string | null;
  payment_status?: PaymentStatus | string | null;
  created_at?: string | null;
  created_by?: string | null;
  creator?: { id: string; full_name?: string | null } | null;
  customer?: { id: string; full_name?: string | null; phone?: string | null } | null;
};

export const ORDER_STATUS_LABEL: Record<string, string> = {
  draft: 'Nháp',
  confirmed: 'Xác nhận',
  processing: 'Đang SX',
  shipped: 'Đang giao',
  delivered: 'Đã giao',
  cancelled: 'Đã hủy',
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  unpaid: 'Chưa TT',
  partial: 'TT 1 phần',
  paid: 'Đã TT',
};

export type FetchOrdersParams = {
  search?: string;
  status?: string;
  limit?: number;
  signal?: AbortSignal;
};

export async function fetchOrders(params: FetchOrdersParams = {}): Promise<OrderRow[]> {
  const { data } = await api.get<OrderRow[]>('/crm/orders', {
    params: {
      limit: params.limit ?? 500,
      search: params.search?.trim() || undefined,
      status: params.status || undefined,
    },
    signal: params.signal,
  });
  return Array.isArray(data) ? data : [];
}
