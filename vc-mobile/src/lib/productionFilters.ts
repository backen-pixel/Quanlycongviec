/**
 * Helper bộ lọc Kanban SX — đồng bộ logic với frontend/src/lib/crossWorkshopProduction.js
 * và ProductionDashboard.jsx (web).
 */
import type { ProductionProject } from '../types';

export type CompanyRow = {
  id: string;
  name: string;
  short_name?: string | null;
};

export type ClientCompanyOption = {
  id: string;
  name: string;
  short_name?: string | null;
  client_company_id?: string | null;
  external_catalog_id?: string | null;
  source?: string;
};

export type AuthUserLite = {
  role?: string | null;
  company_id?: string | null;
  email?: string | null;
};

export function isSystemAdmin(user?: AuthUserLite | null): boolean {
  return String(user?.role || '').trim() === 'admin'
    && (user?.company_id == null || String(user.company_id).trim() === '');
}

export function isMetallaOrHucabiCompany(company?: CompanyRow | null): boolean {
  if (!company) return false;
  const sn = String(company.short_name || '').trim().toUpperCase();
  const name = String(company.name || '').trim().toLowerCase();
  return sn === 'HCB' || name.includes('metalla') || name.includes('hucabi');
}

export function isMetallaOrHucabiCompanyId(companyId: string | null | undefined, companies: CompanyRow[]): boolean {
  if (!companyId) return false;
  const c = companies.find((x) => String(x.id) === String(companyId));
  return c ? isMetallaOrHucabiCompany(c) : false;
}

/** Hiện bộ lọc «Công ty đặt hàng» khi NV thuộc công ty CRM (không phải xưởng HCB/Metalla). */
export function shouldShowDealCompanyFilter(user: AuthUserLite | null | undefined, companies: CompanyRow[]): boolean {
  if (isSystemAdmin(user)) return true;
  if (!user?.company_id) return false;
  return !isMetallaOrHucabiCompanyId(user.company_id, companies);
}

/** Xưởng HCB/Metalla — dùng làm company_id khi gọi GET /production/client-companies. */
export function productionCreateCompanyOptions(companies: CompanyRow[]): CompanyRow[] {
  return companies.filter(isMetallaOrHucabiCompany);
}

export function workshopCompaniesForCrossViewer(companies: CompanyRow[], user: AuthUserLite | null | undefined): CompanyRow[] {
  if (isSystemAdmin(user)) return companies;
  return productionCreateCompanyOptions(companies);
}

export function resolveDealCompanyParam(opts: {
  filterDealCompany: string;
  dealCompanyOptions: ClientCompanyOption[];
  showDealCompanyFilter: boolean;
  user: AuthUserLite | null | undefined;
  isAdmin: boolean;
}): string | undefined {
  const pick = opts.filterDealCompany
    ? opts.dealCompanyOptions.find((c) => String(c.id) === String(opts.filterDealCompany))
    : null;
  if (pick?.client_company_id) return String(pick.client_company_id);
  if (opts.filterDealCompany && !String(opts.filterDealCompany).startsWith('ext:')) {
    return String(opts.filterDealCompany);
  }
  if (opts.showDealCompanyFilter && !opts.isAdmin && !isSystemAdmin(opts.user) && opts.user?.company_id) {
    return String(opts.user.company_id);
  }
  return undefined;
}

export function resolveDealCompanyExternalFilter(
  filterDealCompany: string,
  dealCompanyOptions: ClientCompanyOption[],
): { catalogId?: string | null; name?: string } | null {
  const pick = filterDealCompany
    ? dealCompanyOptions.find((c) => String(c.id) === String(filterDealCompany))
    : null;
  if (!pick || pick.client_company_id) return null;
  const rawId = String(pick.id || '');
  const catalogId = pick.external_catalog_id || (rawId.startsWith('ext:') ? rawId.slice(4) : null);
  return {
    catalogId,
    name: String(pick.short_name || pick.name || '').trim(),
  };
}

/** Lọc client-side công ty đặt hàng ngoài CRM (ext:...) — khớp web. */
export function projectMatchesDealCompanyExternalFilter(
  project: ProductionProject,
  externalFilter: { catalogId?: string | null; name?: string } | null,
): boolean {
  if (!externalFilter) return true;
  const deals = project.crm_deals || [];
  const deal = deals.find((d) => String(d?.type || '') === 'deal') || deals[0] || null;
  if (!deal) return false;
  if (externalFilter.catalogId && deal.external_catalog_id
    && String(deal.external_catalog_id) === String(externalFilter.catalogId)) {
    return true;
  }
  if (externalFilter.name) {
    const dealName = String(deal.external_company_name || '').trim();
    if (dealName && dealName === externalFilter.name) return true;
  }
  return false;
}
