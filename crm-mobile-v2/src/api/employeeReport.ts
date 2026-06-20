import { api } from './client';

export type EmployeeReportRow = {
  user_id: string | null;
  full_name: string;
  email?: string | null;
  avatar?: string | null;
  department_name?: string | null;
  lead_count?: number;
  deal_count?: number;
  won_deal_count?: number;
  lost_deal_count?: number;
  won_value?: number;
  expected_value?: number;
  weighted_value?: number;
  completed_value?: number;
  overdue_count?: number;
  overdue_rate_pct?: number | null;
  kpi_ledger_net?: number;
  conversion_rate?: number;
  pipeline_value?: number;
};

export type EmployeePipelineRow = {
  pipeline_id?: string | null;
  pipeline_name?: string;
  lead_count?: number;
  deal_count?: number;
  won_deal_count?: number;
  lost_deal_count?: number;
  total_value?: number;
  open_deal_count?: number;
  open_value?: number;
  won_value?: number;
};

export type EmployeePipelineDetail = {
  user_id: string;
  full_name: string;
  email?: string | null;
  department_name?: string | null;
  date_from: string;
  date_to: string;
  summary?: Record<string, number | null>;
  pipelines: EmployeePipelineRow[];
};

export type EmployeeReportQuery = {
  date_from: string;
  date_to: string;
  type?: 'all' | 'lead' | 'deal';
  company_id?: string;
  region_id?: string;
};

export async function fetchEmployeeReportRows(params: EmployeeReportQuery): Promise<{
  date_from: string;
  date_to: string;
  rows: EmployeeReportRow[];
}> {
  const { data } = await api.get<{
    date_from: string;
    date_to: string;
    by_employee?: EmployeeReportRow[];
  }>('/crm/reports/org-overview', {
    params: {
      date_from: params.date_from,
      date_to: params.date_to,
      ...(params.type && params.type !== 'all' ? { type: params.type } : {}),
      ...(params.company_id ? { company_id: params.company_id } : {}),
      ...(params.region_id ? { region_id: params.region_id } : {}),
    },
  });
  return {
    date_from: data.date_from,
    date_to: data.date_to,
    rows: (data.by_employee || []).filter((r) => r.user_id),
  };
}

export async function fetchEmployeePipelineDetail(
  userId: string,
  params: EmployeeReportQuery,
): Promise<EmployeePipelineDetail> {
  const { data } = await api.get<EmployeePipelineDetail>(`/crm/reports/staff-lead-deal/${userId}/pipelines`, {
    params: {
      date_from: params.date_from,
      date_to: params.date_to,
      ...(params.type && params.type !== 'all' ? { type: params.type } : {}),
      ...(params.company_id ? { company_id: params.company_id } : {}),
      ...(params.region_id ? { region_id: params.region_id } : {}),
    },
  });
  return data;
}
