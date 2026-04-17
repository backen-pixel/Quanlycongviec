export function formatVnd(n: number | string | null | undefined): string {
  const v = Math.round(Number(n) || 0);
  return new Intl.NumberFormat('vi-VN').format(v) + ' đ';
}
