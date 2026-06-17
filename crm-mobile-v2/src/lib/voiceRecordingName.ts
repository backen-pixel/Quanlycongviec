/** Chuẩn hóa tên file ghi âm — Android/MediaStore đôi khi trả %20, %C3%A2… */
export function normalizeVoiceRecordingFileName(raw?: string | null): string {
  if (raw == null) return '';
  let s = String(raw).trim();
  if (!s) return '';
  if (!/%[0-9A-Fa-f]{2}/.test(s)) return s;
  try {
    for (let i = 0; i < 2; i += 1) {
      const next = decodeURIComponent(s.replace(/\+/g, ' '));
      if (next === s) break;
      s = next;
    }
  } catch {
    /* giữ nguyên nếu không decode được */
  }
  return s;
}

/** Nhãn hiển thị trên tab Ghi âm (bỏ đuôi .m4a nếu muốn gọn — giữ full name mặc định). */
export function voiceRecordingDisplayTitle(raw?: string | null): string {
  const name = normalizeVoiceRecordingFileName(raw);
  return name || 'Ghi âm';
}
