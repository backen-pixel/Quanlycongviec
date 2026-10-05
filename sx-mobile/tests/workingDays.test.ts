import { describe, expect, test, vi } from 'vitest';

vi.mock('../src/api/client', () => ({ api: { get: vi.fn() } }));

import { isNonWorkingDay, normalizeHolidayIndex, workingDaysBetween } from '../src/lib/workingDays';

/** Hôm nay giả định = thứ Hai 05/10/2026 (ngày đối chiếu với web: hoàn thiện 10/10 = 5 ngày LV, lắp đặt 12/10 = 6 ngày LV). */
const MON = new Date(2026, 9, 5);
const d = (day: number) => new Date(2026, 9, day);

describe('workingDaysBetween — khớp web countSxWorkingDaysFromTo', () => {
  test('cùng ngày = 0', () => {
    expect(workingDaysBetween(MON, MON)).toBe(0);
  });

  test('đối chiếu web: 10/10 → 5 ngày LV (thứ Bảy vẫn là ngày làm việc)', () => {
    expect(workingDaysBetween(MON, d(10))).toBe(5);
  });

  test('đối chiếu web: 12/10 → 6 ngày LV (bỏ Chủ nhật 11/10), không phải 7 ngày lịch', () => {
    expect(workingDaysBetween(MON, d(12))).toBe(6);
  });

  test('ngày lễ cố định bị bỏ', () => {
    const idx = normalizeHolidayIndex([{ holiday_date: '2026-10-07', repeat_yearly: false }]);
    expect(workingDaysBetween(MON, d(12), idx)).toBe(5);
  });

  test('ngày lễ lặp hằng năm bị bỏ (khác năm vẫn khớp tháng-ngày)', () => {
    const idx = normalizeHolidayIndex([{ holiday_date: '2025-10-08', repeat_yearly: true }]);
    expect(workingDaysBetween(MON, d(12), idx)).toBe(5);
  });

  test('quá hạn → số âm theo ngày LV', () => {
    expect(workingDaysBetween(d(12), MON)).toBe(-6);
  });

  test('hạn rơi đúng Chủ nhật: 0 ngày LV tới Chủ nhật nếu hôm nay là thứ Bảy', () => {
    expect(workingDaysBetween(d(10), d(11))).toBe(0);
  });
});

describe('isNonWorkingDay / normalizeHolidayIndex', () => {
  test('Chủ nhật nghỉ, thứ Bảy không', () => {
    expect(isNonWorkingDay(d(11))).toBe(true); // CN
    expect(isNonWorkingDay(d(10))).toBe(false); // T7
  });

  test('bỏ qua dòng lễ sai định dạng', () => {
    const idx = normalizeHolidayIndex([{ holiday_date: 'khong-hop-le' }, { holiday_date: null }, null]);
    expect(idx.fixed.size).toBe(0);
    expect(idx.recurring).toHaveLength(0);
  });
});
