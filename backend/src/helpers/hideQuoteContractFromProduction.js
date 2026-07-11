/**
 * Ẩn file/ghi chú nhiệm vụ Báo giá & hợp đồng khỏi module Sản xuất
 * cho công ty VPT và Phúc Đạt (kể cả bình luận hoạt động tự sinh).
 */

const PHUC_DAT_COMPANY_ID = '29677f68-967e-4256-92fd-492bb580e888';
const VPT_COMPANY_ID = '991dc79d-cbf5-49f9-a364-35227cb47635';

const HIDE_COMPANY_IDS = new Set([PHUC_DAT_COMPANY_ID, VPT_COMPANY_ID]);

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

/** Tiêu đề nhiệm vụ mẫu CRM: Báo giá / Hợp đồng / Bản hợp đồng */
function isQuoteContractCommercialTaskTitle(title) {
  const t = normalizeTitle(title);
  if (!t) return false;
  return t === 'bao gia'
    || t === 'hop dong'
    || t === 'ban hop dong'
    || t === 'ban hop dong.';
}

function isQuoteContractCommercialStage(stageSlug) {
  const s = String(stageSlug || '').toLowerCase().trim();
  if (!s || s.startsWith('sx_')) return false;
  if (s === 'deal_quote_contract' || s === 'quotation' || s === 'contract' || s === 'quoted') {
    return true;
  }
  // Pipeline slug động: pl_bao_gia_*, pl_a_gui_bao_gia_*, pl_ky_hop_ong_*, …
  if (/bao[_ ]?gia|hop[_ ]?ong|ky[_ ]?hop/.test(s)) return true;
  return false;
}

/**
 * Nhiệm vụ CRM thương mại (báo giá / hợp đồng) — không gồm nhiệm vụ SX (sx_*).
 * @param {{ title?: string, stage_slug?: string }|null|undefined} task
 */
function isQuoteContractCommercialTask(task) {
  if (!task) return false;
  const slug = String(task.stage_slug || '');
  if (slug.startsWith('sx_')) return false;
  if (isQuoteContractCommercialTaskTitle(task.title)) return true;
  // Stage báo giá/HĐ nhưng tiêu đề khác (vd. «Cọc») — chỉ ẩn khi tiêu đề cũng commercial
  return false;
}

function isHideQuoteContractCompany(companyId) {
  if (!companyId) return false;
  return HIDE_COMPANY_IDS.has(String(companyId));
}

/**
 * @param {{ companyId?: string|null, task?: object|null, moduleKey?: string|null }} opts
 */
function shouldHideQuoteContractFromProduction(opts = {}) {
  const mod = String(opts.moduleKey || '').toLowerCase().trim();
  if (mod && mod !== 'production') return false;
  if (!isHideQuoteContractCompany(opts.companyId)) return false;
  return isQuoteContractCommercialTask(opts.task);
}

/** Không auto-chia sẻ file/ghi chú sang xưởng khi upload. */
function shouldBlockAutoShareQuoteContract(opts = {}) {
  if (!isHideQuoteContractCompany(opts.companyId)) return false;
  return isQuoteContractCommercialTask(opts.task);
}

/**
 * Bình luận hoạt động tự sinh về nhiệm vụ Báo giá / hợp đồng.
 * Ví dụ: «đã tải lên … (nhiệm vụ: Báo giá)», «đã hoàn thành nhiệm vụ «Báo giá».»
 */
function isQuoteContractActivityComment(body) {
  const raw = String(body || '');
  if (!raw) return false;
  const n = normalizeTitle(raw);

  // «nhiệm vụ: Báo giá» / «nhiệm vụ «Báo giá»»
  if (/nhiem vu[:\s«"]+\s*bao gia\b/.test(n)) return true;
  if (/nhiem vu[:\s«"]+\s*hop dong\b/.test(n)) return true;
  if (/nhiem vu[:\s«"]+\s*ban hop dong\b/.test(n)) return true;

  // Hoàn thành / xóa nhiệm vụ «Báo giá»
  if (/hoan thanh nhiem vu\s*«?\s*bao gia/.test(n)) return true;
  if (/hoan thanh nhiem vu\s*«?\s*hop dong/.test(n)) return true;
  if (/hoan thanh nhiem vu\s*«?\s*ban hop dong/.test(n)) return true;
  if (/xoa nhiem vu\s*«?\s*bao gia/.test(n)) return true;
  if (/xoa nhiem vu\s*«?\s*hop dong/.test(n)) return true;
  if (/xoa nhiem vu\s*«?\s*ban hop dong/.test(n)) return true;

  return false;
}

/** lead_documents đồng bộ từ nhiệm vụ BG/HĐ */
function isQuoteContractLeadDocument(doc) {
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

module.exports = {
  PHUC_DAT_COMPANY_ID,
  VPT_COMPANY_ID,
  HIDE_COMPANY_IDS,
  normalizeTitle,
  isQuoteContractCommercialTaskTitle,
  isQuoteContractCommercialStage,
  isQuoteContractCommercialTask,
  isHideQuoteContractCompany,
  shouldHideQuoteContractFromProduction,
  shouldBlockAutoShareQuoteContract,
  isQuoteContractActivityComment,
  isQuoteContractLeadDocument,
};
