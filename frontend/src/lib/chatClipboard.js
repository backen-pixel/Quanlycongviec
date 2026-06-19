/**
 * Trích xuất ảnh từ sự kiện paste (Ctrl+V / chuột phải → Dán).
 * @param {ClipboardEvent} e
 * @returns {File[]}
 */
export function extractClipboardImageFiles(e) {
  const items = e.clipboardData?.items;
  if (!items?.length) return [];
  const files = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== 'file') continue;
    const type = item.type || '';
    if (!type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return files;
}

/**
 * Dán ảnh từ clipboard vào chat — gọi handlePickedFiles khi có ảnh.
 * @param {ClipboardEvent} e
 * @param {(files: File[]|FileList) => void} handlePickedFiles
 * @returns {boolean} true nếu đã xử lý ảnh (đã preventDefault)
 */
export function handleChatImagePaste(e, handlePickedFiles) {
  const files = extractClipboardImageFiles(e);
  if (!files.length) return false;
  e.preventDefault();
  handlePickedFiles(files);
  return true;
}
