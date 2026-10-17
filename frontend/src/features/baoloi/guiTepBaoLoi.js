/**
 * Gửi tệp đính kèm của một báo lỗi lên kho tệp chung.
 *
 * Đi qua `/api/upload` chứ không mở endpoint riêng: ảnh/video báo lỗi cũng là tệp như mọi
 * tệp khác, vào cùng `file_attachments` với `entity_type = 'project_incident'` — đúng chỗ
 * route danh sách lỗi đang đếm số tệp của mỗi thẻ.
 *
 * Phải tạo lỗi TRƯỚC rồi mới gửi tệp, vì tệp cần `entity_id`. Nghĩa là có thể tạo được lỗi
 * mà tệp hỏng giữa chừng — khi đó báo rõ «đã ghi lỗi, chưa gắn được tệp» chứ đừng nuốt lỗi:
 * người dùng tưởng ảnh đã gửi rồi thì không gửi lại nữa.
 */
import api from '../../lib/api';

export const LOAI_TEP_NHAN = 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip';

/** Đổi mốc thời gian thành tên tệp đọc được: 2026-10-16_14-30-05 */
function moc() {
  const d = new Date();
  const hai = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${hai(d.getMonth() + 1)}-${hai(d.getDate())}_${hai(d.getHours())}-${hai(d.getMinutes())}-${hai(d.getSeconds())}`;
}

export function tenAnhLoi() { return `bao-loi_anh_${moc()}.png`; }
export function tenVideoLoi(kieu = 'video/webm') {
  const duoi = String(kieu).includes('mp4') ? 'mp4' : 'webm';
  return `bao-loi_quay_${moc()}.${duoi}`;
}

/** "1.4 MB" — người dùng cần biết video nặng bao nhiêu trước khi bấm gửi. */
export function coTep(byte) {
  const n = Number(byte) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Hai bước, vì `/api/upload` chỉ biết đẩy tệp lên kho chứ không biết gắn vào lỗi:
 *   1. đẩy tệp  → nhận file_url
 *   2. gắn vào lỗi qua `/bao-loi/:id/files`
 *
 * Cố tình KHÔNG gửi `entity_id` ở bước 1: nhánh tự-ghi của `/api/upload` insert kèm cột
 * `storage_path` vốn không có trong `file_attachments`, lại không kiểm lỗi — hàng rơi mất
 * mà ai cũng tưởng đã lưu.
 *
 * @param {string} incidentId
 * @param {File[]} dsTep
 * @returns {Promise<{ da_gui: number, hong: number }>}
 */
export async function guiTepBaoLoi(incidentId, dsTep) {
  const ds = (dsTep || []).filter(Boolean);
  if (!incidentId || !ds.length) return { da_gui: 0, hong: 0 };

  const fd = new FormData();
  ds.forEach((f) => fd.append('files', f, f.name));
  const { data } = await api.post('/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  const oke = (data?.uploaded || []).filter((x) => x?.file_url);
  const hong = ds.length - oke.length;
  if (!oke.length) return { da_gui: 0, hong: ds.length };

  await api.post(`/bao-loi/${incidentId}/files`, {
    files: oke.map((x) => ({
      file_name: x.file_name,
      file_url: x.file_url,
      file_size: x.file_size,
      mime_type: x.mime_type,
    })),
  });
  return { da_gui: oke.length, hong };
}
