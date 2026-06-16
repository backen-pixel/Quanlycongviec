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

function computeClientSummary(rows: CustomerOverviewRow[]): CustomersOverviewSummary {
  let leads = 0;
  let deals = 0;
  let won = 0;
  let revenue = 0;
  let debt = 0;
  let active = 0;
  for (const c of rows) {
    const st = c.stats;
    if (st.lead_count > 0 || st.order_count > 0) active += 1;
    revenue += st.total_paid || 0;
    debt += st.total_debt || 0;
    won += st.won_count || 0;
    for (const l of c.leads || []) {
      if (l.type === 'deal') deals += 1;
      else leads += 1;
    }
  }
  return { total: rows.length, active, leads, deals, won, revenue, debt };
}

function filterLegacyRows(
  rows: CustomerOverviewRow[],
  search?: string,
  activity?: CustomerActivityFilter,
): CustomerOverviewRow[] {
  let list = [...rows];
  if (search) {
    const s = search.toLowerCase();
    list = list.filter(
      (c) =>
        (c.full_name || '').toLowerCase().includes(s) ||
        (c.phone || '').includes(s) ||
        (c.email || '').toLowerCase().includes(s) ||
        (c.company || '').toLowerCase().includes(s),
    );
  }
  if (activity === 'active') {
    list = list.filter((c) => c.stats.lead_count > 0 || c.stats.order_count > 0);
  } else if (activity === 'debt') {
    list = list.filter((c) => (c.stats.total_debt || 0) > 0);
  }
  return list;
}

function paginateLegacyOverview(
  rows: CustomerOverviewRow[],
  params: FetchCustomersOverviewParams,
): FetchCustomersOverviewPage {
  const sort = params.sort ?? 'newest';
  const page = params.page ?? 1;
  const limit = params.limit ?? CUSTOMERS_PAGE_SIZE;
  const filtered = filterLegacyRows(rows, params.search, params.activity);
  filtered.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return sort === 'oldest' ? ta - tb : tb - ta;
  });
  const from = (page - 1) * limit;
  const slice = filtered.slice(from, from + limit);
  return {
    customers: slice,
    total: filtered.length,
    page,
    limit,
    hasMore: from + slice.length < filtered.length,
    summary: page === 1 ? computeClientSummary(filtered) : undefined,
  };
}

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

/** Mobile — phân trang + lọc/sắp xếp phía server (fallback client nếu API trả mảng legacy). */
export async function fetchCustomersOverviewPage(
  params: FetchCustomersOverviewParams = {},
): Promise<FetchCustomersOverviewPage> {
  try {
    const { data } = await api.get<FetchCustomersOverviewPage | CustomerOverviewRow[]>(
      '/crm/customers-overview',
      {
        params: {
          page: params.page ?? 1,
          limit: params.limit ?? CUSTOMERS_PAGE_SIZE,
          sort: params.sort ?? 'newest',
          search: params.search?.trim() || undefined,
          activity: params.activity && params.activity !== 'all' ? params.activity : undefined,
          company_id: params.company_id || undefined,
        },
        signal: params.signal,
      },
    );

    if (Array.isArray(data)) {
      return paginateLegacyOverview(data, params);
    }

    return {
      customers: Array.isArray(data?.customers) ? data.customers : [],
      total: data?.total ?? 0,
      page: data?.page ?? 1,
      limit: data?.limit ?? CUSTOMERS_PAGE_SIZE,
      hasMore: Boolean(data?.hasMore),
      summary: data?.summary,
    };
  } catch (e) {
    const status = (e as { response?: { status?: number } })?.response?.status;
    if (status === 401 || status === 403) throw e;
    const legacy = await fetchCustomersOverview(params.company_id, params.signal);
    return paginateLegacyOverview(legacy, params);
  }
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
