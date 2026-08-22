/**
 * Thanh module deal: CRM › SX › VC/LĐ — quyền click theo cấp xuôi (A).
 * Admin / CRM → hết; SX → SX+VC; VC → chỉ VC.
 */

import { isAdminLike, isSystemAdmin } from './adminRole';
import { memberModulesFromUser } from './memberModuleCounts';
import { getDealResponsibleId } from './fileOwnership';

export const DEAL_MODULE_PATH = [
  { key: 'crm', label: 'CRM', ecoMod: 'crm', title: 'CRM' },
  { key: 'production', label: 'Sản xuất', ecoMod: 'production', title: 'Sản xuất' },
  { key: 'logistics', label: 'VC/LĐ', ecoMod: 'logistics', title: 'Vận chuyển lắp đặt' },
];

/** @typedef {'admin'|'crm'|'production'|'logistics'} DealModuleTier */

/**
 * @param {object|null|undefined} user
 * @returns {DealModuleTier}
 */
export function resolveUserModuleTier(user) {
  if (isAdminLike(user) || isSystemAdmin(user)) return 'admin';
  const mods = memberModulesFromUser(user);
  if (mods.includes('crm')) return 'crm';
  if (mods.includes('production')) return 'production';
  return 'logistics';
}

/**
 * Cascade A: tier nào được click moduleKey nào.
 * @param {DealModuleTier} tier
 * @param {'crm'|'production'|'logistics'|string} moduleKey
 */
export function tierCanAccessModule(tier, moduleKey) {
  const k = String(moduleKey || '').toLowerCase();
  if (tier === 'admin' || tier === 'crm') {
    return k === 'crm' || k === 'production' || k === 'logistics';
  }
  if (tier === 'production') {
    return k === 'production' || k === 'logistics';
  }
  return k === 'logistics';
}

/**
 * @param {object|null|undefined} user
 * @param {object|null|undefined} leadOrDeal
 * @param {Iterable<string>|Array<{user_id?: string, user?: {id?: string}}>|null} membersOrIds
 */
export function isDealMemberOrOwner(user, leadOrDeal, membersOrIds = null) {
  if (!user) return false;
  const uid = String(user.userId || user.id || '').trim();
  if (!uid) return false;
  if (isAdminLike(user) || isSystemAdmin(user)) return true;

  const ownerId = getDealResponsibleId(leadOrDeal);
  if (ownerId && String(ownerId) === uid) return true;

  const prodPerson = leadOrDeal?.production_person_id || leadOrDeal?.production_person?.id;
  if (prodPerson && String(prodPerson) === uid) return true;
  const logisticsPerson = leadOrDeal?.logistics_person_id || leadOrDeal?.logistics_person?.id;
  if (logisticsPerson && String(logisticsPerson) === uid) return true;

  if (!membersOrIds) return false;
  for (const m of membersOrIds) {
    if (m == null) continue;
    if (typeof m === 'string' || typeof m === 'number') {
      if (String(m) === uid) return true;
      continue;
    }
    const mid = String(m.user_id || m.user?.id || m.id || '').trim();
    if (mid && mid === uid) return true;
  }
  return false;
}

/**
 * @param {{
 *   user: object|null|undefined,
 *   moduleKey: 'crm'|'production'|'logistics'|string,
 *   isDealMemberOrOwner: boolean,
 *   canAccessModule?: (mod: string) => boolean,
 *   hasHref?: boolean,
 * }} opts
 * @returns {{ allowed: boolean, reason: string }}
 */
export function canClickDealModule({
  user,
  moduleKey,
  isDealMemberOrOwner: isMember,
  canAccessModule,
  hasHref = true,
}) {
  const k = String(moduleKey || '').toLowerCase();
  if (!hasHref) {
    if (k === 'production' || k === 'logistics') {
      return { allowed: false, reason: 'Chưa có dự án' };
    }
    return { allowed: false, reason: 'Không có liên kết' };
  }
  if (!isMember && !(isAdminLike(user) || isSystemAdmin(user))) {
    return { allowed: false, reason: 'Chỉ người phụ trách / thành viên deal mới mở được' };
  }
  const ecoKey = k === 'crm' ? 'crm' : k === 'production' ? 'production' : 'logistics';
  if (typeof canAccessModule === 'function' && !canAccessModule(ecoKey)) {
    return { allowed: false, reason: 'Không có quyền truy cập module này' };
  }
  const tier = resolveUserModuleTier(user);
  if (!tierCanAccessModule(tier, k)) {
    if (tier === 'production') {
      return { allowed: false, reason: 'Thành viên SX chỉ mở được Sản xuất và Lắp đặt' };
    }
    if (tier === 'logistics') {
      return { allowed: false, reason: 'Thành viên VC/LĐ chỉ mở được Lắp đặt' };
    }
    return { allowed: false, reason: 'Không đủ quyền theo cấp module' };
  }
  return { allowed: true, reason: '' };
}

/**
 * @param {{ leadId?: string|null, projectId?: string|null, currentModule?: string }} opts
 * @returns {Array<{ key: string, label: string, title?: string, href: string|null, active: boolean }>}
 */
export function buildDealModulePath({ leadId, projectId, currentModule = 'crm' } = {}) {
  const cur = String(currentModule || 'crm').toLowerCase();
  const curKey = cur === 'sx' || cur === 'production'
    ? 'production'
    : cur === 'vc' || cur === 'logistics'
      ? 'logistics'
      : 'crm';
  const lid = leadId ? String(leadId) : null;
  const pid = projectId ? String(projectId) : null;

  return DEAL_MODULE_PATH.map((item) => {
    let href = null;
    if (item.key === 'crm' && lid) href = `/crm/leads/${lid}`;
    else if (item.key === 'production' && pid) href = `/sx/projects/${pid}`;
    else if (item.key === 'logistics' && pid) href = `/vc/projects/${pid}`;
    return {
      key: item.key,
      label: item.label,
      title: item.title || item.label,
      href,
      active: item.key === curKey,
    };
  });
}

/** Primary project id từ deal (production_projects hoặc project_id). */
export function resolveDealPrimaryProjectId(lead) {
  if (!lead) return null;
  const rows = Array.isArray(lead.production_projects) ? lead.production_projects : [];
  const primary = rows.find((p) => p?.is_primary && p?.project_id)
    || rows.find((p) => p?.project_id)
    || null;
  return primary?.project_id || lead.project_id || lead.linked_project?.id || null;
}
