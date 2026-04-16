/**
 * Lọc lead/deal pipeline — logic khớp `filterItemsForPipeline` trong `frontend/src/pages/CRMDashboard.jsx`.
 */

import type { CrmLeadListItem } from '../types/crm';

export type TimePresetKey = '' | 'today' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'custom';

export type CrmPipelineClientFilters = {
  searchText: string;
  filterCompany: string;
  filterAssignee: string;
  filterAssigneeName: string;
  filterSource: string;
  filterStage: string;
  /** Giống web CRMDashboard: '' = tất cả (không gửi phone_filter), has_phone | no_phone */
  filterPhone: '' | 'has_phone' | 'no_phone';
};

/** Dropdown thời gian trên web — `frontend/src/pages/CRMDashboard.jsx` TIME_PRESETS */
export const CRM_TIME_PRESETS_WEB: { key: TimePresetKey; label: string }[] = [
  { key: '', label: 'Tất cả' },
  { key: 'this_week', label: 'Tuần này' },
  { key: 'this_month', label: 'Tháng này' },
  { key: 'custom', label: 'Tùy chỉnh' },
];

export function applyTimePresetChange(
  preset: TimePresetKey,
  prevCustomFrom: string,
  prevCustomTo: string,
): { timePreset: TimePresetKey; customDateFrom: string; customDateTo: string } {
  if (preset === 'custom') {
    return { timePreset: 'custom', customDateFrom: prevCustomFrom, customDateTo: prevCustomTo };
  }
  if (preset === '') {
    return { timePreset: '', customDateFrom: '', customDateTo: '' };
  }
  const r = getDateRange(preset);
  return { timePreset: preset, customDateFrom: r.from, customDateTo: r.to };
}

export function getDateRange(preset: TimePresetKey): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case 'today': {
      const d = today.toISOString().split('T')[0];
      return { from: d, to: d };
    }
    case 'this_week': {
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: monday.toISOString().split('T')[0], to: sunday.toISOString().split('T')[0] };
    }
    case 'last_week': {
      const dayOfWeek = today.getDay();
      const thisMonday = new Date(today);
      thisMonday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      return { from: lastMonday.toISOString().split('T')[0], to: lastSunday.toISOString().split('T')[0] };
    }
    case 'this_month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: firstDay.toISOString().split('T')[0], to: lastDay.toISOString().split('T')[0] };
    }
    case 'last_month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: firstDay.toISOString().split('T')[0], to: lastDay.toISOString().split('T')[0] };
    }
    case 'this_quarter': {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      const firstDay = new Date(now.getFullYear(), qMonth, 1);
      const lastDay = new Date(now.getFullYear(), qMonth + 3, 0);
      return { from: firstDay.toISOString().split('T')[0], to: lastDay.toISOString().split('T')[0] };
    }
    case 'this_year': {
      return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
    }
    default:
      return { from: '', to: '' };
  }
}

export function hasPhoneNumber(item: CrmLeadListItem): boolean {
  const p = (item.customer?.phone || (item as { phone?: string }).phone || '').trim();
  return !!p;
}

export function filterPipelineItemsWebLike(
  items: CrmLeadListItem[],
  f: CrmPipelineClientFilters,
  fbPageLeadIds: Set<string>,
): CrmLeadListItem[] {
  let result = [...items];

  if (f.filterCompany) {
    result = result.filter((l) => String(l.company_id || '') === String(f.filterCompany));
  }

  if (f.filterAssignee) {
    const fid = String(f.filterAssignee).trim().toLowerCase();
    result = result.filter((l) => {
      const ids = [
        (l as { assigned_to?: string }).assigned_to,
        (l as { lead_owner_id?: string }).lead_owner_id,
        l.assignee?.id,
        l.lead_owner?.id,
      ]
        .filter(Boolean)
        .map((x) => String(x).trim().toLowerCase());
      return ids.includes(fid);
    });
  }

  if (f.filterAssigneeName.trim()) {
    const qn = f.filterAssigneeName.trim().toLowerCase();
    result = result.filter((l) => {
      const name = (l.assignee?.full_name || l.lead_owner?.full_name || '').toLowerCase();
      return name.includes(qn);
    });
  }

  if (f.filterSource) {
    if (f.filterSource.startsWith('fbp:')) {
      result = result.filter((l) => fbPageLeadIds.has(l.id));
    } else {
      result = result.filter((l) => String(l.source_id || '') === String(f.filterSource));
    }
  }

  if (f.filterStage) {
    result = result.filter((l) => String(l.stage_id || '') === String(f.filterStage));
  }

  if (f.filterPhone === 'has_phone') {
    result = result.filter((l) => hasPhoneNumber(l));
  } else if (f.filterPhone === 'no_phone') {
    result = result.filter((l) => !hasPhoneNumber(l));
  }

  if (f.searchText.trim()) {
    const q = f.searchText.trim().toLowerCase();
    result = result.filter((l) => {
      const fields = [
        l.title,
        l.code,
        (l as { description?: string }).description,
        (l as { install_address?: string }).install_address,
        l.customer?.full_name,
        l.customer?.phone,
        (l as { phone?: string }).phone,
        l.customer?.email,
        l.customer?.address,
        l.customer?.company,
        l.assignee?.full_name,
        l.lead_owner?.full_name,
        l.source?.name,
      ]
        .filter(Boolean)
        .map((s) => String(s).toLowerCase());
      return fields.some((x) => x.includes(q));
    });
  }

  result.sort((a, b) => Number(hasPhoneNumber(b)) - Number(hasPhoneNumber(a)));
  return result;
}

export type CrmSourceRow = { id: string; name?: string | null; icon?: string | null };
export type FbPageRow = { page_id: string; page_name?: string; is_active?: boolean };

export function buildSmartSourceOptions(
  sources: CrmSourceRow[],
  fbPages: FbPageRow[],
  allLeads: CrmLeadListItem[],
  allDeals: CrmLeadListItem[],
): { id: string; label: string }[] {
  const allItems = [...allLeads, ...allDeals];
  const usedIds = new Set(allItems.map((l) => l.source_id).filter(Boolean));
  const nonFb = sources
    .filter((s) => usedIds.has(s.id) && !(s.name || '').toLowerCase().includes('facebook'))
    .map((s) => ({ id: s.id, label: `${s.icon || ''} ${s.name || ''}`.trim() }));
  const seenFb = new Set<string>();
  const fb = (fbPages || [])
    .filter((p) => {
      if (!p.is_active || seenFb.has(p.page_id)) return false;
      seenFb.add(p.page_id);
      return true;
    })
    .map((p) => ({ id: `fbp:${p.page_id}`, label: `[FB] ${p.page_name || p.page_id}` }));
  return [...fb, ...nonFb];
}
