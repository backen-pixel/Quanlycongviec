import { canViewAllCrm } from '../lib/crmAssignee';
import { readStoredDealKhSplitPreference } from '../lib/crmDealKhSplit';
import { buildStageFetchOpts, DEFAULT_CRM_FILTERS } from '../lib/crmFilters';
import {
  setDeadlineOverdueBreakdown,
  type DeadlineOverdueBreakdown,
} from '../lib/deadlineOverdueStore';
import {
  fetchDeadlineConfig,
  fetchDeadlineSectionPage,
} from './crm';
import { fetchCrmCompanies } from './crmMeta';

/** Trần quét cho badge/nhắc — đã sort theo hạn, quá hạn nằm đầu. */
const OVERDUE_COUNT_BUFFER = 1000;

type FetchUser = {
  id?: string | null;
  user_id?: string | null;
  company_id?: string | null;
  role?: string | null;
} | null;

function resolveUserId(user: FetchUser): string {
  return String(user?.id || user?.user_id || '');
}

/**
 * Đếm Lead/Deal quá hạn cùng phạm vi mặc định tab Deadline
 * (Có SĐT; NV → của tôi; admin → tất cả).
 */
export async function fetchDeadlineOverdueBreakdown(
  user: FetchUser,
  signal?: AbortSignal,
): Promise<DeadlineOverdueBreakdown> {
  const userId = resolveUserId(user);
  const viewAll = canViewAllCrm(user);
  const filters = {
    ...DEFAULT_CRM_FILTERS,
    companyId: user?.company_id || '',
    assignee: viewAll ? ('all' as const) : ('mine' as const),
    assigneeUserId: '',
  };
  const listOpts = buildStageFetchOpts(filters, '', userId);
  let companyId = listOpts.companyId;
  if (!companyId && !viewAll) {
    try {
      const companies = await fetchCrmCompanies(signal);
      companyId = companies[0]?.id;
    } catch {
      /* bỏ qua */
    }
  }

  const cfg = await fetchDeadlineConfig(companyId, signal);
  const dealKhSplitEnabled = await readStoredDealKhSplitPreference(viewAll);

  const base = {
    ...listOpts,
    companyId,
    signal,
    deadlineConfig: cfg,
    dealKhSplitEnabled,
  };

  const [leadPage, dealPage] = await Promise.all([
    fetchDeadlineSectionPage('lead', 0, OVERDUE_COUNT_BUFFER, base),
    fetchDeadlineSectionPage('deal', 0, OVERDUE_COUNT_BUFFER, base),
  ]);

  const lead = leadPage.items.reduce((n, i) => n + (i.overdue ? 1 : 0), 0);
  const deal = dealPage.items.reduce((n, i) => n + (i.overdue ? 1 : 0), 0);
  const next: DeadlineOverdueBreakdown = {
    lead,
    deal,
    total: lead + deal,
    at: Date.now(),
    source: 'fetch',
  };
  setDeadlineOverdueBreakdown(next);
  return next;
}
