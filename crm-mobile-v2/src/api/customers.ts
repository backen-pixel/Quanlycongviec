import { api } from './client';

export type CustomerStats = {
  lead_count: number;
  won_count: number;
  quote_count: number;
  order_count: number;
  invoice_count: number;
  total_orders: number;
  total_paid: number;
  total_debt: number;
  lead_value: number;
};

export type CustomersOverviewSummary = {
  total: number;
  active: number;
  leads: number;
  deals: number;
  won: number;
  revenue: number;
  debt: number;
};

export type CrmLeadMini = {
  id: string;
  code?: string | null;
  title?: string | null;
  type?: string | null;
  estimated_value?: number | null;
  created_at?: string | null;
  stage?: { name?: string | null; is_won?: boolean | null } | null;
};

export type QuoteMini = {
  id: string;
  code?: string | null;
  title?: string | null;
  total?: number | null;
  status?: string | null;
  created_at?: string | null;
};

export type OrderMini = {
  id: string;
  code?: string | null;
  title?: string | null;
  total?: number | null;
  status?: string | null;
  created_at?: string | null;
};

export type InvoiceMini = {
  id: string;
  code?: string | null;
  title?: string | null;
  total?: number | null;
  paid_amount?: number | null;
  payment_status?: string | null;
  created_at?: string | null;
};

export type CustomerOverviewRow = {
  id: string;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  created_at?: string | null;
  stats: CustomerStats;
  leads?: CrmLeadMini[];
  quotes?: QuoteMini[];
  orders?: OrderMini[];
  invoices?: InvoiceMini[];
};

export type CustomerDetail = CustomerOverviewRow;

export type CustomerSort = 'newest' | 'oldest';
export type CustomerActivityFilter = 'all' | 'active' | 'debt';

export type FetchCustomersOverviewParams = {
  company_id?: string;
  page?: number;
  limit?: number;
  sort?: CustomerSort;
  search?: string;
  activity?: CustomerActivityFilter;
  signal?: AbortSignal;
};

export type FetchCustomersOverviewPage = {
  customers: CustomerOverviewRow[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  summary?: CustomersOverviewSummary;
};

export const CUSTOMERS_PAGE_SIZE = 30;

/** Web legacy — tải toàn bộ (giữ tương thích). */
export async function fetchCustomersOverview(
  companyId?: string,
  signal?: AbortSignal,
): Promise<CustomerOverviewRow[]> {
  const { data } = await api.get<CustomerOverviewRow[]>('/crm/customers-overview', {
    params: companyId ? { company_id: companyId } : undefined,
    signal,
  });
  return Array.isArray(data) ? data : [];
}

/** Mobile — phân trang + lọc/sắp xếp phía server. */
export async function fetchCustomersOverviewPage(
  params: FetchCustomersOverviewParams = {},
): Promise<FetchCustomersOverviewPage> {
  const { data } = await api.get<FetchCustomersOverviewPage>('/crm/customers-overview', {
    params: {
      page: params.page ?? 1,
      limit: params.limit ?? CUSTOMERS_PAGE_SIZE,
      sort: params.sort ?? 'newest',
      search: params.search?.trim() || undefined,
      activity: params.activity && params.activity !== 'all' ? params.activity : undefined,
      company_id: params.company_id || undefined,
    },
    signal: params.signal,
  });
  return {
    customers: Array.isArray(data?.customers) ? data.customers : [],
    total: data?.total ?? 0,
    page: data?.page ?? 1,
    limit: data?.limit ?? CUSTOMERS_PAGE_SIZE,
    hasMore: Boolean(data?.hasMore),
    summary: data?.summary,
  };
}

export async function fetchCustomerDetail(
  id: string,
  companyId?: string,
  signal?: AbortSignal,
): Promise<CustomerDetail> {
  const { data } = await api.get<CustomerDetail>(`/crm/customers-overview/${id}`, {
    params: companyId ? { company_id: companyId } : undefined,
    signal,
  });
  return data;
}
