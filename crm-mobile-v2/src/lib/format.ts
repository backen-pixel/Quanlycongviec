/** Định dạng tiền VND: 146000000 → "146.000.000đ". 0/null → "Chưa định giá". */
export function formatVnd(value?: number | null): string {
  if (!value || value <= 0) return 'Chưa định giá';
  return `${Math.round(value).toLocaleString('vi-VN')}đ`;
}

/** Số ngày kể từ thời điểm iso đến hiện tại. */
export function daysSince(iso?: string | null): number {
  if (!iso) return 0;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

/** Ngày ngắn kiểu vi-VN: 16/6/2026 */
export function formatDateShort(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('vi-VN');
}
