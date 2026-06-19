/**
 * Trích xuất file từ clipboard (ảnh chụp màn hình, file copy từ Explorer, …).
 * @param {ClipboardEvent} e
 * @returns {File[]}
 */
export function extractClipboardFiles(e) {
  const items = e.clipboardData?.items;
  if (!items?.length) return [];
  const files = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return files;
}

/** @deprecated alias — dùng extractClipboardFiles */
export function extractClipboardImageFiles(e) {
  return extractClipboardFiles(e).filter((f) => (f.type || '').startsWith('image/'));
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

/**
 * Dán ảnh/file vào ô bình luận — upload khi có file trong clipboard.
 * @returns {boolean} true nếu đã xử lý (đã preventDefault)
 */
export function handleCommentFilePaste(e, onFiles) {
  const files = extractClipboardFiles(e);
  if (!files.length) return false;
  e.preventDefault();
  onFiles(files);
  return true;
}
