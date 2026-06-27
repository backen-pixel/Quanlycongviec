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
  lost_lead_count?: number;
  won_value?: number;
  won_or_later_deal_count?: number;
  won_or_later_value?: number;
  expected_value?: number;
  weighted_value?: number;
  completed_deal_count?: number;
  completed_value?: number;
  overdue_count?: number;
  overdue_rate_pct?: number | null;
  kpi_ledger_net?: number;
  conversion_rate?: number;
  pipeline_value?: number;
  /** GT hồ sơ tạo trong kỳ (BC org-overview gốc). */
  cohort_pipeline_value?: number;
  /** GT pipeline mở — deal ở cột dự kiến, snapshot CRM Hub. */
  open_pipeline_value?: number;
  /** GT dự kiến chưa trọng số (snapshot Hub). */
  open_pipeline_raw_value?: number;
  open_weighted_pipeline_value?: number;
  quote_deal_count?: number;
  quote_value?: number;
  quote_win_rate_pct?: number | null;
  quote_close_value_rate_pct?: number | null;
  deal_close_value_rate_pct?: number | null;
  cancel_rate_pct?: number | null;
  monthly_growth_pct?: number | null;
  reception_eligible_count?: number;
  reception_overdue_count?: number;
  reception_overdue_rate_pct?: number | null;
  first_stage_on_time_rate_pct?: number | null;
  first_stage_overdue_rate_pct?: number | null;
  first_stage_open_count?: number;
  first_stage_on_time_count?: number;
  first_stage_overdue_count?: number;
};

export type EmployeePipelineRow = {
  pipeline_id?: string | null;
  pipeline_name?: string;
  lead_count?: number;
  deal_count?: number;
  won_deal_count?: number;
  lost_deal_count?: number;
  completed_deal_count?: number;
  completion_rate_pct?: number | null;
  total_value?: number;
  open_deal_count?: number;
  open_value?: number;
  won_value?: number;
};

export type EmployeeTimelineRow = {
  date: string;
  lead_count?: number;
  deal_count?: number;
  lead_value?: number;
  deal_value?: number;
};

export type LeadTypeReportRow = {
  lead_type_id?: string | null;
  lead_type_name?: string;
  applies_to?: string | null;
  lead_type_color?: string | null;
  lead_count?: number;
  deal_count?: number;
  lead_value?: number;
  deal_value?: number;
  pipeline_value?: number;
};

export type FirstStageSla = {
  open_count?: number;
  on_time_count?: number;
  overdue_count?: number;
  on_time_rate_pct?: number | null;
  overdue_rate_pct?: number | null;
  stage_labels?: string[];
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
  timeline?: EmployeeTimelineRow[];
  by_lead_type?: LeadTypeReportRow[];
  first_stage_sla?: FirstStageSla | null;
};

export type EmployeeReportQuery = {
  date_from: string;
  date_to: string;
  type?: 'all' | 'lead' | 'deal';
  company_id?: string;
  region_id?: string;
};

export type OrgReportRow = EmployeeReportRow & {
  company_id?: string | null;
  company_name?: string | null;
  region_id?: string | null;
  region_name?: string | null;
  region_code?: string | null;
  open_count?: number;
  completed_deal_count?: number;
  pipeline_value?: number;
  /** Tab Deal CRM Hub (có SĐT) — chỉ tham chiếu KPI Kanban, không dùng cho tỷ lệ chốt. */
  hub_deal_kpi?: number;
  /** Deal có SĐT gộp mọi công ty — stage-counts global, khớp Hub sau gộp (296). */
  deal_has_phone_total?: number;
};

export type ReportTimelineRow = {
  date: string;
  lead_count?: number;
  deal_count?: number;
  won_value?: number;
  pipeline_value?: number;
};

export type ReportPipelineFunnelRow = {
  stage_id?: string;
  name?: string;
  color?: string;
  icon?: string;
  count?: number;
  lead_count?: number;
  deal_count?: number;
  value?: number;
};

export type OrgReportCompareMetric = {
  previous?: number;
  delta?: number;
  pct?: number | null;
};

export type OrgReportCompare = Record<string, OrgReportCompareMetric>;

export type OrgOverviewReport = {
  date_from: string;
  date_to: string;
  summary: OrgReportRow;
  compare?: OrgReportCompare | null;
  period_previous?: {
    date_from: string;
    date_to: string;
    summary?: OrgReportRow;
  } | null;
  timeline: ReportTimelineRow[];
  pipeline_funnel: ReportPipelineFunnelRow[];
  by_company: OrgReportRow[];
  by_region: OrgReportRow[];
  by_employee: EmployeeReportRow[];
  by_lead_type: LeadTypeReportRow[];
};

export async function fetchOrgOverviewReport(params: EmployeeReportQuery): Promise<OrgOverviewReport> {
  const { data } = await api.get<{
    date_from: string;
    date_to: string;
    summary?: OrgReportRow;
    compare?: OrgReportCompare | null;
    period_previous?: OrgOverviewReport['period_previous'];
    timeline?: ReportTimelineRow[];
    pipeline_funnel?: ReportPipelineFunnelRow[];
    by_company?: OrgReportRow[];
    by_region?: OrgReportRow[];
    by_employee?: EmployeeReportRow[];
    by_lead_type?: LeadTypeReportRow[];
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
    summary: data.summary ?? { user_id: null, full_name: 'Tổng' },
    compare: data.compare ?? null,
    period_previous: data.period_previous ?? null,
    timeline: data.timeline || [],
    pipeline_funnel: data.pipeline_funnel || [],
    by_company: data.by_company || [],
    by_region: data.by_region || [],
    by_employee: (data.by_employee || []).filter((r) => r.user_id),
    by_lead_type: data.by_lead_type || [],
  };
}

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
