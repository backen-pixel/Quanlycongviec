function foldLabel(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Tên deal CRM và tên dự án xưởng đều có, nhưng không trùng sau khi gom khoảng trắng. */
function projectNamesDiffer(crmTitle, workshopName) {
  const a = foldLabel(crmTitle);
  const b = foldLabel(workshopName);
  if (!a || !b) return false;
  return a !== b;
}

function isSheetFile(fileName, mimeType) {
  const ext = String(fileName || '').split('.').pop().toLowerCase();
  if (['xlsx', 'xls', 'csv'].includes(ext)) return true;
  return /spreadsheet|excel|csv/i.test(String(mimeType || ''));
}

/** File Excel báo giá đang nằm trên dự án xưởng. Bỏ ảnh và ghi chú. */
function pickWorkshopQuoteFiles(raw, limit = 4) {
  const arr = Array.isArray(raw) ? raw : [];
  const mapped = [];
  for (const f of arr) {
    if (!f || f.is_note) continue;
    const fileName = String(f.file_name || f.name || '').trim();
    const fileUrl = f.file_url || null;
    if (!isSheetFile(fileName, f.mime_type)) continue;
    if (!fileName && !fileUrl) continue;
    mapped.push({
      file_name: fileName || 'Tệp',
      file_url: fileUrl,
      is_sheet: true,
    });
  }
  const cap = Math.max(1, Number(limit) || 4);
  return mapped.slice(0, cap);
}

module.exports = {
  foldLabel,
  projectNamesDiffer,
  pickWorkshopQuoteFiles,
};
