/**
 * Client-side: ẩn bình luận/tài liệu Báo giá / Hợp đồng khi xem từ SX hoặc VC/LĐ (VPT & Phúc Đạt).
 * Khớp backend/src/helpers/hideQuoteContractFromProduction.js
 */

export const PHUC_DAT_COMPANY_ID = '29677f68-967e-4256-92fd-492bb580e888';
export const VPT_COMPANY_ID = '991dc79d-cbf5-49f9-a364-35227cb47635';

const HIDE_COMPANY_IDS = new Set([PHUC_DAT_COMPANY_ID, VPT_COMPANY_ID]);
const HIDE_QUOTE_CONTRACT_MODULES = new Set(['production', 'logistics']);

function stripDiacritics(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function normalizeTitle(title) {
  return stripDiacritics(title)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isHideQuoteContractCompany(companyId) {
  if (!companyId) return false;
  return HIDE_COMPANY_IDS.has(String(companyId));
}

export function isQuoteContractActivityComment(body) {
  const n = normalizeTitle(body);
  if (!n) return false;
  if (/nhiem vu[:\s«"]+\s*bao gia\b/.test(n)) return true;
  if (/nhiem vu[:\s«"]+\s*hop dong\b/.test(n)) return true;
  if (/nhiem vu[:\s«"]+\s*ban hop dong\b/.test(n)) return true;
  if (/hoan thanh nhiem vu\s*«?\s*bao gia/.test(n)) return true;
  if (/hoan thanh nhiem vu\s*«?\s*hop dong/.test(n)) return true;
  if (/hoan thanh nhiem vu\s*«?\s*ban hop dong/.test(n)) return true;
  if (/xoa nhiem vu\s*«?\s*bao gia/.test(n)) return true;
  if (/xoa nhiem vu\s*«?\s*hop dong/.test(n)) return true;
  if (/xoa nhiem vu\s*«?\s*ban hop dong/.test(n)) return true;
  return false;
}

function isQuoteContractCommercialStage(stageSlug) {
  const s = String(stageSlug || '').toLowerCase().trim();
  if (!s || s.startsWith('sx_')) return false;
  if (s === 'deal_quote_contract' || s === 'quotation' || s === 'contract' || s === 'quoted') {
    return true;
  }
  if (/bao[_ ]?gia|hop[_ ]?ong|ky[_ ]?hop/.test(s)) return true;
  return false;
}

/** lead_documents đồng bộ từ nhiệm vụ BG/HĐ */
export function isQuoteContractLeadDocument(doc) {
  if (!doc) return false;
  const label = normalizeTitle(doc.crm_stage_group_label);
  if (label.includes('bao gia') && label.includes('hop dong')) return true;
  if (isQuoteContractCommercialStage(doc.crm_stage_slug)) {
    const name = normalizeTitle(doc.name);
    if (/^\[?\s*(bao gia|hop dong|ban hop dong)/.test(name)) return true;
    if (name.startsWith('ghi chu:') && /bao gia|hop dong/.test(name)) return true;
  }
  const name = normalizeTitle(doc.name);
  if (/^\[(bao gia|hop dong|ban hop dong)\]/.test(name)) return true;
  return false;
}

/** Ẩn BG/HĐ trên SX hoặc VC/LĐ khi công ty thuộc VPT/Phúc Đạt. */
export function shouldHideQuoteContractDoc(doc, moduleKey, leadCompanyId) {
  const mod = String(moduleKey || '').toLowerCase().trim();
  if (!HIDE_QUOTE_CONTRACT_MODULES.has(mod)) return false;
  if (!isHideQuoteContractCompany(leadCompanyId)) return false;
  return isQuoteContractLeadDocument(doc);
}

export function shouldHideQuoteContractComments(moduleKey) {
  const mod = String(moduleKey || '').toLowerCase().trim();
  return HIDE_QUOTE_CONTRACT_MODULES.has(mod);
}
