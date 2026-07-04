/**
 * Nhãn tiếng Việt cho canonical_slug pipeline CRM (báo cáo bot, task meta…).
 */
const { getCrmStageGroupLabel } = require('./crmTaskLeadDocumentMeta');

const PIPELINE_SLUG_LABELS = {
  lead_new: 'Tiếp nhận lead',
  not_contacted: 'Chưa liên hệ',
  cold: 'Lead lạnh',
  warm: 'Lead ấm',
  hot: 'Lead nóng',
  survey_scheduled: 'Hẹn khảo sát',
  survey_done: 'Đã khảo sát',
  designing: 'Thiết kế',
  quoted: 'Báo giá',
  negotiating: 'Đàm phán',
  waiting_deposit: 'Chờ cọc',
  contract_signed: 'Ký hợp đồng',
  producing: 'Sản xuất',
  installing: 'Lắp đặt',
  completed: 'Hoàn thành',
  lost: 'Thua',
  won: 'Thắng',
  consulting: 'Tư vấn',
  quoting: 'Báo giá',
  shipping: 'Vận chuyển',
  warranty: 'Bảo hành',
};

function formatCanonicalSlugLabel(slug, stageNameFromDb = null) {
  if (stageNameFromDb) return String(stageNameFromDb).trim();
  if (!slug) return '—';
  const s = String(slug).trim();
  if (PIPELINE_SLUG_LABELS[s]) return PIPELINE_SLUG_LABELS[s];
  const fromMeta = getCrmStageGroupLabel(s);
  if (fromMeta && fromMeta !== s) return fromMeta;
  return s.replace(/_/g, ' ');
}

function formatStageTransitionLabel(fromSlug, toSlug, stageNameMap = null) {
  const fromLabel = fromSlug
    ? formatCanonicalSlugLabel(fromSlug, stageNameMap?.get?.(fromSlug))
    : 'Không rõ';
  const toLabel = toSlug
    ? formatCanonicalSlugLabel(toSlug, stageNameMap?.get?.(toSlug))
    : 'Không rõ';
  return `${fromLabel} → ${toLabel}`;
}

module.exports = {
  PIPELINE_SLUG_LABELS,
  formatCanonicalSlugLabel,
  formatStageTransitionLabel,
};
