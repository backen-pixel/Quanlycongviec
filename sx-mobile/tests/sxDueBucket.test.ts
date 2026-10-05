import { describe, expect, test } from 'vitest';
import { sxDueBucketProjectIds } from '../src/lib/sxBoardKpis';
import type { KanbanStage, ProductionProject } from '../src/types';

/**
 * Chip lọc theo hạn xử lý. «Hôm nay» là thứ Tư 30/09/2026 → tuần này 28/09–04/10,
 * tuần sau 05/10–11/10.
 */

const TODAY = new Date(2026, 8, 30, 12, 0, 0).getTime();

const COL_SX: KanbanStage = { id: 'sx', name: 'sx', order_index: 10 };
const COL_NO_DEADLINE: KanbanStage = { id: 'bo-han', name: 'bo-han', order_index: 20, clears_deadline: true };
const STAGES = [COL_SX, COL_NO_DEADLINE];

function p(id: string, deadline: string | null, col = 'sx'): ProductionProject {
  return {
    id,
    code: id,
    name: id,
    sx_kanban_deadline_at: deadline,
    sx_kanban_column_id: col,
  } as ProductionProject;
}

const PROJECTS = [
  p('sun-prev', '2026-09-27'),   // CN tuần trước → quá hạn, không thuộc tuần này
  p('mon', '2026-09-28'),        // T2 tuần này (đã quá hạn)
  p('today', '2026-09-30'),
  p('fri', '2026-10-02'),
  p('sun', '2026-10-04'),        // CN cuối tuần này
  p('next-mon', '2026-10-05'),   // T2 tuần sau
  p('next-sun', '2026-10-11'),   // CN tuần sau
  p('after', '2026-10-12'),      // ngoài cả hai
  p('none', null),
  p('cleared', '2026-09-30', 'bo-han'),
];

const ids = (b: Parameters<typeof sxDueBucketProjectIds>[2]) =>
  [...sxDueBucketProjectIds(PROJECTS, STAGES, b, TODAY)].sort();

describe('sxDueBucketProjectIds', () => {
  test('hôm nay: chỉ đúng ngày, bỏ qua cột tắt hạn', () => {
    expect(ids('today')).toEqual(['today']);
  });

  test('tuần này: thứ Hai → Chủ nhật, không lấn sang tuần trước/sau', () => {
    expect(ids('this_week')).toEqual(['fri', 'mon', 'sun', 'today']);
  });

  test('tuần sau: thứ Hai → Chủ nhật của tuần liền kề', () => {
    expect(ids('next_week')).toEqual(['next-mon', 'next-sun']);
  });

  test('quá hạn: khớp quy tắc KPI (trước hôm nay, không tính hôm nay)', () => {
    expect(ids('overdue')).toEqual(['mon', 'sun-prev']);
  });

  test('không có hạn / cột tắt hạn không vào nhóm nào', () => {
    for (const b of ['overdue', 'today', 'this_week', 'next_week'] as const) {
      expect(ids(b)).not.toContain('none');
      expect(ids(b)).not.toContain('cleared');
    }
  });

  test('Chủ nhật vẫn thuộc tuần của thứ Hai trước đó (không nhảy sang tuần sau)', () => {
    const sunday = new Date(2026, 9, 4, 9, 0, 0).getTime();
    const got = [...sxDueBucketProjectIds(PROJECTS, STAGES, 'this_week', sunday)].sort();
    expect(got).toEqual(['fri', 'mon', 'sun', 'today']);
    const next = [...sxDueBucketProjectIds(PROJECTS, STAGES, 'next_week', sunday)].sort();
    expect(next).toEqual(['next-mon', 'next-sun']);
  });
});
