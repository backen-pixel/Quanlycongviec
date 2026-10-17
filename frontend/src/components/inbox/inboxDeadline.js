/**
 * Chia mục theo HẠN — dùng chung cho bảng Deadline của «hộp việc» và trang Báo lỗi.
 *
 * Tách khỏi CRMAssignmentsPage cùng lý do đã tách khung bảng: hai trang phải chia rổ y
 * hệt nhau, nếu không thì «Tuần này» ở trang nọ không cùng nghĩa với «Tuần này» ở trang
 * kia, mà người dùng thì đọc hai bảng như một.
 *
 * Không biết gì về nhiệm vụ hay lỗi: nhận mục có `deadline`, và một hàm `boQua` để mỗi
 * trang tự nói mục nào coi như đã xong (nhiệm vụ `completed`, lỗi `hoan_thanh`).
 */

export const DEADLINE_BUCKET_META = [
  { key: 'overdue',    label: '🔴 Quá hạn',     color: '#EF4444' },
  { key: 'today',      label: '🟡 Hôm nay',     color: '#F59E0B' },
  { key: 'tomorrow',   label: '🟠 Ngày mai',    color: '#F97316' },
  { key: 'thisWeek',   label: '🔵 Tuần này',    color: '#3B82F6' },
  { key: 'nextWeek',   label: '🟣 Tuần sau',    color: '#8B5CF6' },
  { key: 'later',      label: '⚪ Sau đó',      color: '#94A3B8' },
  { key: 'noDeadline', label: '⏳ Chưa có hạn', color: '#6B7280' },
];

export function emptyDeadlineGroups() {
  return { overdue: [], today: [], tomorrow: [], thisWeek: [], nextWeek: [], later: [], noDeadline: [] };
}

/**
 * Hôm nay → Ngày mai → hết 7 ngày tới → 7 ngày kế → sau đó.
 *
 * Tách «Tuần sau» khỏi «Sau đó»: gộp chung thì mọi việc từ ngày thứ 8 trở đi dồn vào
 * một rổ, mà việc tuần sau là thứ người ta còn kịp sắp lịch, khác hẳn việc tháng sau.
 */
export function classifyDeadlineBucket(deadline, today) {
  if (!deadline) return 'noDeadline';
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return 'noDeadline';
  const tomorrow = new Date(today.getTime() + 86400000);
  const dayAfter = new Date(today.getTime() + 2 * 86400000);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const nextWeekEnd = new Date(today);
  nextWeekEnd.setDate(nextWeekEnd.getDate() + 14);
  if (d < today) return 'overdue';
  if (d < tomorrow) return 'today';
  if (d < dayAfter) return 'tomorrow';
  if (d < weekEnd) return 'thisWeek';
  if (d < nextWeekEnd) return 'nextWeek';
  return 'later';
}

/** @param {{ boQua?: (item:any) => boolean }} opt — mục coi như đã xong, không xếp rổ. */
export function groupByDeadline(items, { boQua } = {}) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const g = emptyDeadlineGroups();
  (items || []).forEach((x) => {
    if (boQua?.(x)) return;
    g[classifyDeadlineBucket(x.deadline, today)].push(x);
  });
  return g;
}
