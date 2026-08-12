/**
 * Slot «Tư liệu đơn hàng» (File sketchup / Bảng mô tả / …):
 * chỉ là chỗ sales nộp file → đồng bộ sang tab Tài liệu xưởng (xem/tải).
 * Không chuyển thành Giao việc CRM / không giao việc xưởng.
 */
const ORDER_DOCS_TITLES = new Set([
  'file sketchup',
  'bảng mô tả',
  'bang mo ta',
  'file render',
  'hình ảnh',
  'hinh anh',
  'file phụ kiện',
  'file phu kien',
]);

function normalizeOrderDocsTitle(title) {
  return String(title || '').trim().toLowerCase();
}

function isOrderDocsWorkshopTemplate(tpl) {
  return /tư\s*li[ệe]u\s*đơn\s*hàng/i.test(String(tpl?.name || ''));
}

function isOrderDocsTaskTitle(title) {
  return ORDER_DOCS_TITLES.has(normalizeOrderDocsTitle(title));
}

/** Slot tài liệu sales → xưởng (không tạo Giao việc). */
function isOrderDocsDocumentSlot(tpl, itemOrTitle) {
  if (isOrderDocsWorkshopTemplate(tpl)) return true;
  const title = typeof itemOrTitle === 'string' ? itemOrTitle : itemOrTitle?.title;
  return isOrderDocsTaskTitle(title);
}

/** Cờ chia sẻ file/ghi chú slot tư liệu sang module Sản xuất. */
function orderDocsShareFlags() {
  return {
    shared_to_project: true,
    allowed_share_modules: ['production'],
  };
}

module.exports = {
  ORDER_DOCS_TITLES,
  isOrderDocsWorkshopTemplate,
  isOrderDocsTaskTitle,
  isOrderDocsDocumentSlot,
  /** @deprecated dùng isOrderDocsDocumentSlot */
  isOrderDocsWorkshopWork: isOrderDocsDocumentSlot,
  orderDocsShareFlags,
};
