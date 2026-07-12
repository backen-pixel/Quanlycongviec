/**
 * Tên file an toàn cho Supabase Storage object key (ASCII, không dấu).
 * Tên gốc (UTF-8) vẫn lưu trong DB cột file_name để hiển thị.
 */
function sanitizeStorageFilename(name) {
  let s = String(name || 'file')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  s = s
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return s || 'file';
}

function isInvalidStorageKeyError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('invalid key') || msg.includes('invalid object name');
}

module.exports = { sanitizeStorageFilename, isInvalidStorageKeyError };
