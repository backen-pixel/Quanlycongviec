/** Đồng bộ backend dealParticipantProduction.js — xem SX Metalla + Hucabi. */
export const CROSS_WORKSHOP_PRODUCTION_VIEWER_EMAILS = new Set([
  'ketoanvanphuthanh.vpt@gmail.com',
  'phuongcuc5313@gmail.com',
]);

export function isCrossWorkshopProductionViewer(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  return CROSS_WORKSHOP_PRODUCTION_VIEWER_EMAILS.has(email);
}

export function isMetallaOrHucabiCompany(company) {
  if (!company) return false;
  const sn = String(company.short_name || '').trim().toUpperCase();
  const name = String(company.name || '').trim().toLowerCase();
  return sn === 'HCB' || name.includes('metalla');
}

/** Công ty có thể chọn trên Kanban SX (VPT + Metalla + Hucabi). */
export function workshopCompaniesForCrossViewer(companies, user) {
  if (!isCrossWorkshopProductionViewer(user)) return [];
  const cross = (companies || []).filter(isMetallaOrHucabiCompany);
  const own = user?.company_id
    ? (companies || []).filter((c) => String(c.id) === String(user.company_id))
    : [];
  const byId = new Map();
  [...own, ...cross].forEach((c) => byId.set(String(c.id), c));
  return [...byId.values()];
}

export function canPickWorkshopCompany(user, isAdmin, isCompanyScopedAdmin) {
  if (isAdmin && !isCompanyScopedAdmin) return true;
  return isCrossWorkshopProductionViewer(user);
}
