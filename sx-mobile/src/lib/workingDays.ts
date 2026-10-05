import { useEffect, useState } from 'react';
import { api } from '../api/client';

/**
 * Đếm NGÀY LÀM VIỆC (LV) giống web (`frontend/src/lib/sxWorkshopSchedule.js`): bỏ Chủ nhật + ngày lễ
 * (`/kpi/holidays`), KHÔNG bỏ thứ Bảy. Chưa tải được danh sách lễ thì chỉ bỏ Chủ nhật.
 */

export type HolidayIndex = {
  fixed: Set<string>;
  recurring: { month: number; day: number }[];
};

const EMPTY_INDEX: HolidayIndex = { fixed: new Set(), recurring: [] };

/** `YYYY-MM-DD` theo giờ máy (người dùng ở VN). */
export function ymdOf(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Chuẩn hóa danh sách lễ từ API → { fixed, recurring } (khớp web `normalizeHolidayIndex`). */
export function normalizeHolidayIndex(rows: unknown): HolidayIndex {
  const fixed = new Set<string>();
  const recurring: { month: number; day: number }[] = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const row = r as { holiday_date?: unknown; repeat_yearly?: unknown };
    const date = String(row?.holiday_date ?? '').slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!m) continue;
    if (row.repeat_yearly) recurring.push({ month: Number(m[2]), day: Number(m[3]) });
    else fixed.add(date);
  }
  return { fixed, recurring };
}

/** Chủ nhật hoặc ngày lễ. */
export function isNonWorkingDay(d: Date, idx: HolidayIndex = EMPTY_INDEX): boolean {
  if (d.getDay() === 0) return true;
  if (idx.fixed.has(ymdOf(d))) return true;
  return idx.recurring.some((h) => h.month === d.getMonth() + 1 && h.day === d.getDate());
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Số ngày LV từ `from` → `to`: đếm mỗi ngày D có from < D ≤ to và là ngày làm việc; âm nếu `to` trước `from`.
 * Cùng quy ước `countSxWorkingDaysFromTo` của web.
 */
export function workingDaysBetween(from: Date, to: Date, idx: HolidayIndex = EMPTY_INDEX): number {
  const a = startOfDay(from);
  const b = startOfDay(to);
  if (a.getTime() === b.getTime()) return 0;
  const forward = a < b;
  const start = forward ? a : b;
  const end = forward ? b : a;
  let count = 0;
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  let guard = 0;
  while (cur <= end && guard < 800) {
    if (!isNonWorkingDay(cur, idx)) count += 1;
    cur.setDate(cur.getDate() + 1);
    guard += 1;
  }
  return forward ? count : -count;
}

// ── Danh sách ngày lễ dùng chung toàn app ─────────────────────────────────────

let current: HolidayIndex = EMPTY_INDEX;
let loadedAt = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<(idx: HolidayIndex) => void>();
const REFRESH_MS = 30 * 60 * 1000;

export function getHolidayIndex(): HolidayIndex {
  return current;
}

/** Tải ngày lễ một lần (cache 30 phút). Lỗi mạng: giữ bản cũ / chỉ bỏ Chủ nhật, không ném lỗi. */
export function loadHolidayIndex(force = false): Promise<void> {
  if (!force && loadedAt && Date.now() - loadedAt < REFRESH_MS) return Promise.resolve();
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data } = await api.get<{ holidays?: unknown[] }>('/kpi/holidays');
      current = normalizeHolidayIndex(data?.holidays);
      loadedAt = Date.now();
      listeners.forEach((fn) => fn(current));
    } catch {
      /* giữ nguyên */
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Hook: danh sách lễ hiện tại; tự tải lần đầu và cập nhật các thẻ khi tải xong. */
export function useHolidayIndex(): HolidayIndex {
  const [idx, setIdx] = useState<HolidayIndex>(current);
  useEffect(() => {
    listeners.add(setIdx);
    void loadHolidayIndex();
    setIdx(current);
    return () => { listeners.delete(setIdx); };
  }, []);
  return idx;
}
