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

function commentHomeModules(user) {
  // Admin truy cập được cả 3 module → để sidebar đang mở quyết định, không mặc định CRM.
  if (isAdminLike(user) || isSystemAdmin(user)) return ['crm', 'production', 'logistics'];
  return memberModulesFromUser(user).filter((m) => m === 'crm' || m === 'production' || m === 'logistics');
}

function sidebarToCommentModule(activeModule) {
  const m = String(activeModule || '').toLowerCase();
  if (m === 'sx' || m === 'production') return 'production';
  if (m === 'vc' || m === 'logistics') return 'logistics';
  if (m === 'crm') return 'crm';
  return null;
}

/** Module do backend stamp trong metadata thông báo bình luận (theo người nhận). */
export function stampedCommentModule(n) {
  const meta = n?.metadata && typeof n.metadata === 'object' ? n.metadata : {};
  const k = String(meta.viewer_module_key || '').trim().toLowerCase();
  return k === 'crm' || k === 'production' || k === 'logistics' ? k : null;
}

function commentPathForModule(mod, { leadId, projectId, query }) {
  if (mod === 'crm' && leadId) return `/crm/leads/${leadId}${query}`;
  if (mod === 'production' && projectId) return `/sx/projects/${projectId}${query}`;
  if (mod === 'logistics' && projectId) return `/vc/projects/${projectId}${query}`;
  return null;
}

/**
 * Module người xem dùng để mở bình luận.
 * Một module thì luôn module đó (NV xưởng không bị đẩy sang CRM/VC).
 * Nhiều module thì theo sidebar đang mở.
 */
export function viewerCommentModuleKey(user, activeModule) {
  const homes = commentHomeModules(user);
  if (homes.length === 1) return homes[0];
  const side = sidebarToCommentModule(activeModule);
  if (side && homes.includes(side)) return side;
  return null;
}

/**
 * Bấm chuông bình luận lead/deal → đúng dự án trong module của người bấm.
 * @returns {string|null}
 */
export function resolveLeadCommentNotificationPath(n, { user, activeModule } = {}) {
  const meta = n?.metadata && typeof n.metadata === 'object' ? n.metadata : {};
  const navTab = String(meta.nav_tab || 'comments').trim() || 'comments';
  const query = `?tab=${encodeURIComponent(navTab)}`;
  const projectId = meta.project_id != null && String(meta.project_id).trim() !== ''
    ? String(meta.project_id).trim()
    : null;
  const et = String(n?.entity_type || '');
  const leadFromEntity = ['lead', 'crm_lead', 'crm_deal'].includes(et) && n?.entity_id
    ? String(n.entity_id)
    : null;
  const leadId = leadFromEntity || (meta.lead_id ? String(meta.lead_id).trim() : null);
  const ids = { leadId, projectId, query };

  // Backend đã stamp module theo từng người nhận (có cả user_module_roles mà frontend không có).
  // Người không phải admin → tin stamp, tránh NV xưởng role staff/manager bị coi là CRM.
  const stampedKey = stampedCommentModule(n);
  if (stampedKey && !(isAdminLike(user) || isSystemAdmin(user))) {
    const stampedPath = commentPathForModule(stampedKey, ids);
    if (stampedPath) return stampedPath;
  }

  const homes = commentHomeModules(user);
  const unique = homes.length ? homes : ['crm'];
  const candidates = unique
    .map((mod) => ({ mod, path: commentPathForModule(mod, ids) }))
    .filter((row) => row.path);
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0].path;

  const side = sidebarToCommentModule(activeModule);
  const sideHit = candidates.find((row) => row.mod === side);
  if (sideHit) return sideHit.path;

  const stamped = String(meta.viewer_module_key || '').trim();
  const stampHit = candidates.find((row) => row.mod === stamped);
  if (stampHit) return stampHit.path;

  const drive = String(user?.drive_module || '').toLowerCase();
  const driveMod = drive === 'sx' || drive === 'production'
    ? 'production'
    : drive === 'vc' || drive === 'logistics'
      ? 'logistics'
      : drive === 'crm'
        ? 'crm'
        : null;
  const driveHit = candidates.find((row) => row.mod === driveMod);
  if (driveHit) return driveHit.path;

  const prod = candidates.find((row) => row.mod === 'production');
  if (prod && side !== 'crm') return prod.path;
  return candidates[0].path;
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
