import {
  canViewAllCrm,
  isSystemAdmin,
} from '../lib/crmAssignee';
import { readStoredDealKhSplitPreference } from '../lib/crmDealKhSplit';
import { hydrateCrmHubFilters, peekCrmHubFiltersForUser } from '../lib/crmHubFilterStore';
import {
  applyCrmFilterLocks,
  buildStageFetchOpts,
  resetSharedCrmFilters,
  type CrmHubFilters,
} from '../lib/crmFilters';
import {
  setDeadlineOverdueBreakdown,
  type DeadlineOverdueBreakdown,
} from '../lib/deadlineOverdueStore';
import {
  fetchDeadlineBucketCounts,
  fetchDeadlineConfig,
} from './crm';
import { fetchCrmCompanies } from './crmMeta';

type FetchUser = {
  id?: string | null;
  user_id?: string | null;
  company_id?: string | null;
  role?: string | null;
} | null;

function resolveUserId(user: FetchUser): string {
  return String(user?.id || user?.user_id || '');
}

/** Cache key bucket-counts — chung Overview + tab Deadline (cùng RPC). */
export function deadlineBucketFilterKey(opts: {
  phone: string;
  assignee: string;
  assigneeUserId: string;
  companyId: string;
  regionId?: string;
  dateFrom?: string;
  dateTo?: string;
  dealKhSplit: boolean;
  viewAll: boolean;
  userId: string;
}): string {
  return [
    opts.phone,
    opts.assignee,
    opts.assigneeUserId,
    opts.companyId,
    opts.regionId || '',
    opts.dateFrom || '',
    opts.dateTo || '',
    opts.dealKhSplit ? '1' : '0',
    opts.viewAll ? '1' : '0',
    opts.userId,
  ].join('|');
}

function scopeLabelOf(filters: CrmHubFilters, companyId: string): string {
  const phone = filters.phone === 'has_phone'
    ? 'Có SĐT'
    : filters.phone === 'no_phone'
      ? 'Chưa SĐT'
      : 'Mọi SĐT';
  const who = filters.assignee === 'mine' ? 'của tôi' : 'mọi NV';
  const co = companyId ? '1 công ty' : 'mọi công ty';
  return `${phone} · ${who} · ${co}`;
}

/** Cùng snapshot bộ lọc Hub/Deadline — badge tab = số trên màn Deadline. */
async function resolveDeadlineScope(user: FetchUser, signal?: AbortSignal) {
  const userId = resolveUserId(user);
  const viewAll = canViewAllCrm(user);
  if (userId) await hydrateCrmHubFilters(userId, user);
  const live = userId ? peekCrmHubFiltersForUser(userId) : null;
  const filters: CrmHubFilters = applyCrmFilterLocks(
    user,
    live?.filters || resetSharedCrmFilters(user),
  );

  const listOpts = buildStageFetchOpts(filters, '', userId);
  let companyId = String(listOpts.companyId || filters.companyId || '').trim();
  let allowedCompanyIds: string[] | null = null;

  const needCompanies = !companyId;
  if (needCompanies) {
    const [companies, cfgEarly] = await Promise.all([
      fetchCrmCompanies(signal).catch(() => [] as Awaited<ReturnType<typeof fetchCrmCompanies>>),
      companyId ? Promise.resolve(null) : fetchDeadlineConfig(undefined, signal),
    ]);
    if (!isSystemAdmin(user)) {
      companyId = companies[0]?.id || '';
      if (!companyId && companies.length) {
        allowedCompanyIds = companies.map((c) => c.id).filter(Boolean);
      }
    } else if (companies.length) {
      allowedCompanyIds = companies.map((c) => c.id).filter(Boolean);
    }
    const cfg = companyId
      ? await fetchDeadlineConfig(companyId, signal)
      : (cfgEarly || await fetchDeadlineConfig(undefined, signal));
    const dealKhSplitEnabled = await readStoredDealKhSplitPreference(viewAll);
    const base = {
      ...listOpts,
      companyId: companyId || listOpts.companyId,
      signal,
      deadlineConfig: cfg,
      dealKhSplitEnabled,
      allowedCompanyIds,
    };
    const fk = deadlineBucketFilterKey({
      phone: filters.phone,
      assignee: filters.assignee,
      assigneeUserId: filters.assigneeUserId,
      companyId: companyId || '',
      regionId: listOpts.regionId,
      dateFrom: listOpts.dateFrom,
      dateTo: listOpts.dateTo,
      dealKhSplit: dealKhSplitEnabled,
      viewAll,
      userId,
    });
    return { base, fk, viewAll, filters, companyId, scopeLabel: scopeLabelOf(filters, companyId) };
  }

  const cfg = await fetchDeadlineConfig(companyId || undefined, signal);
  const dealKhSplitEnabled = await readStoredDealKhSplitPreference(viewAll);

  const base = {
    ...listOpts,
    companyId: companyId || listOpts.companyId,
    signal,
    deadlineConfig: cfg,
    dealKhSplitEnabled,
    allowedCompanyIds,
  };

  const fk = deadlineBucketFilterKey({
    phone: filters.phone,
    assignee: filters.assignee,
    assigneeUserId: filters.assigneeUserId,
    companyId: companyId || '',
    regionId: listOpts.regionId,
    dateFrom: listOpts.dateFrom,
    dateTo: listOpts.dateTo,
    dealKhSplit: dealKhSplitEnabled,
    viewAll,
    userId,
  });

  return { base, fk, viewAll, filters, companyId, scopeLabel: scopeLabelOf(filters, companyId) };
}

/**
 * Đếm Lead/Deal quá hạn cùng bộ lọc tab Deadline (snapshot Hub) —
 * dùng bucket-counts RPC, không quét nghìn dòng.
 */
export async function fetchDeadlineOverdueBreakdown(
  user: FetchUser,
  signal?: AbortSignal,
): Promise<DeadlineOverdueBreakdown> {
  const { base, fk } = await resolveDeadlineScope(user, signal);

  const [leadCounts, dealCounts] = await Promise.all([
    fetchDeadlineBucketCounts('lead', fk, base),
    fetchDeadlineBucketCounts('deal', fk, base),
  ]);

  const lead = Number(leadCounts.overdue) || 0;
  const deal = Number(dealCounts.overdue) || 0;
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

export type DeadlineFocusBreakdown = {
  overdue: number;
  today: number;
  tomorrow: number;
  leadOverdue: number;
  dealOverdue: number;
  at: number;
  /** Mô tả bộ lọc đang áp (khớp tab Deadline). */
  scopeLabel: string;
};

/**
 * Đếm Quá hạn / Hôm nay / Ngày mai (Lead + Deal) — cùng phạm vi tab Deadline.
 * Dùng cho trang Tổng quan sale.
 */
export async function fetchDeadlineFocusBreakdown(
  user: FetchUser,
  signal?: AbortSignal,
): Promise<DeadlineFocusBreakdown> {
  const { base, fk, scopeLabel } = await resolveDeadlineScope(user, signal);

  const [leadCounts, dealCounts] = await Promise.all([
    fetchDeadlineBucketCounts('lead', fk, base),
    fetchDeadlineBucketCounts('deal', fk, base),
  ]);

  const leadOverdue = Number(leadCounts.overdue) || 0;
  const dealOverdue = Number(dealCounts.overdue) || 0;
  const overdue = leadOverdue + dealOverdue;
  const today =
    (Number(leadCounts.counts.today) || 0) + (Number(dealCounts.counts.today) || 0);
  const tomorrow =
    (Number(leadCounts.counts.tomorrow) || 0) + (Number(dealCounts.counts.tomorrow) || 0);

  const next: DeadlineOverdueBreakdown = {
    lead: leadOverdue,
    deal: dealOverdue,
    total: overdue,
    at: Date.now(),
    source: 'fetch',
  };
  setDeadlineOverdueBreakdown(next);

  return {
    overdue,
    today,
    tomorrow,
    leadOverdue,
    dealOverdue,
    at: Date.now(),
    scopeLabel,
  };
}
