import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import {
  projectIsDeadlineOverdue,
  sxEffectiveDeadlineRaw,
  sxOverdueProjectIds,
  sxProjectDeadlineRaw,
  pickOverdueProjects,
  pickSoonProjects,
} from '../src/lib/sxBoardKpis';
import type { KanbanStage, ProductionProject } from '../src/types';

/**
 * Chốt quy tắc quá hạn SX trên app — khớp web `resolveSxDeadlineBucket` và BE
 * `sxDeadlineRaw`. Đây là chỗ đã sinh lỗi «danh sách quá hạn chỉ hiện 1/10».
 */

const HUCABI = '18c2563f-3495-498d-8199-23200c9f420e';

function stage(over: Partial<KanbanStage> & { id: string }): KanbanStage {
  return { name: over.id, order_index: 0, ...over };
}

function project(over: Partial<ProductionProject> & { id: string }): ProductionProject {
  return { code: over.id, name: over.id, ...over };
}

/** 2026-09-30 12:00 giờ máy — mốc «hôm nay» cố định cho mọi test. */
const TODAY = new Date(2026, 8, 30, 12, 0, 0).getTime();

const COL_SX = stage({ id: 'sx', order_index: 10 });
const COL_HANDOVER = stage({ id: 'vc', order_index: 50, is_handover_to_logistics: true });
const COL_NO_DEADLINE = stage({ id: 'bo-han', order_index: 20, clears_deadline: true });
const STAGES = [COL_SX, COL_NO_DEADLINE, COL_HANDOVER];

describe('sxEffectiveDeadlineRaw — thứ tự ưu tiên nguồn hạn', () => {
  test('hạn thẻ Kanban thắng mọi nguồn khác', () => {
    const p = project({
      id: '1',
      sx_kanban_deadline_at: '2026-01-01',
      production_finish_date: '2026-02-02',
      production_deadline: '2026-03-03',
      delivery_date: '2026-04-04',
      deadline: '2026-05-05',
    });
    expect(sxEffectiveDeadlineRaw(p, COL_SX)).toBe('2026-01-01');
  });

  test('KHÔNG còn rơi sang nguồn khác — chỉ hạn thẻ mới tính', () => {
    // Web + BE (commit c272a759) đã bỏ chuỗi rơi. Thẻ chỉ có các nguồn cũ ⇒ không có hạn.
    const base = {
      production_finish_date: '2026-02-02',
      production_deadline: '2026-03-03',
      delivery_date: '2026-04-04',
      deadline: '2026-05-05',
    };
    expect(sxEffectiveDeadlineRaw(project({ id: '2', ...base }), COL_SX)).toBeNull();
    expect(sxEffectiveDeadlineRaw(project({ id: '3', deadline: '2026-05-05' }), COL_SX)).toBeNull();
    expect(sxEffectiveDeadlineRaw(project({ id: '4', delivery_date: '2026-04-04' }), COL_SX)).toBeNull();
  });

  test('không có nguồn nào → null', () => {
    expect(sxEffectiveDeadlineRaw(project({ id: '6' }), COL_SX)).toBeNull();
  });

  test('cột «Bỏ hạn» và cột «Bàn giao VC» xoá hạn, kể cả khi thẻ có hạn', () => {
    const p = project({ id: '7', sx_kanban_deadline_at: '2020-01-01' });
    expect(sxEffectiveDeadlineRaw(p, COL_NO_DEADLINE)).toBeNull();
    expect(sxEffectiveDeadlineRaw(p, COL_HANDOVER)).toBeNull();
  });

  test('không truyền cột → giữ hạn (không tự coi là đã bỏ hạn)', () => {
    const p = project({ id: '8', sx_kanban_deadline_at: '2020-01-01' });
    expect(sxEffectiveDeadlineRaw(p, null)).toBe('2020-01-01');
    expect(sxEffectiveDeadlineRaw(p, undefined)).toBe('2020-01-01');
  });
});

describe('sxProjectDeadlineRaw — resolve cột từ danh sách', () => {
  test('đọc cột theo sx_kanban_column_id', () => {
    const p = project({ id: '9', sx_kanban_column_id: 'bo-han', sx_kanban_deadline_at: '2020-01-01' });
    expect(sxProjectDeadlineRaw(p, STAGES)).toBeNull();
  });

  test('fallback resolved_column_id khi chưa có cột lưu', () => {
    const p = project({ id: '10', resolved_column_id: 'vc', sx_kanban_deadline_at: '2020-01-01' });
    expect(sxProjectDeadlineRaw(p, STAGES)).toBeNull();
  });

  test('cột không nằm trong board → coi như không có cột, vẫn giữ hạn', () => {
    const p = project({ id: '11', sx_kanban_column_id: 'khong-ton-tai', sx_kanban_deadline_at: '2020-01-01' });
    expect(sxProjectDeadlineRaw(p, STAGES)).toBe('2020-01-01');
  });
});

describe('projectIsDeadlineOverdue', () => {
  test('hạn hôm qua → quá hạn', () => {
    const p = project({ id: '12', sx_kanban_column_id: 'sx', sx_kanban_deadline_at: '2026-09-29' });
    expect(projectIsDeadlineOverdue(p, STAGES, undefined, TODAY)).toBe(true);
  });

  test('hạn đúng hôm nay → chưa quá hạn (công ty thường)', () => {
    const p = project({ id: '13', sx_kanban_column_id: 'sx', sx_kanban_deadline_at: '2026-09-30' });
    expect(projectIsDeadlineOverdue(p, STAGES, undefined, TODAY)).toBe(false);
  });

  test('hạn ngày mai → chưa quá hạn', () => {
    const p = project({ id: '14', sx_kanban_column_id: 'sx', sx_kanban_deadline_at: '2026-10-01' });
    expect(projectIsDeadlineOverdue(p, STAGES, undefined, TODAY)).toBe(false);
  });

  test('thẻ quá hạn nhưng nằm ở cột bỏ hạn / bàn giao VC → không tính', () => {
    for (const col of ['bo-han', 'vc']) {
      const p = project({ id: `15-${col}`, sx_kanban_column_id: col, sx_kanban_deadline_at: '2020-01-01' });
      expect(projectIsDeadlineOverdue(p, STAGES, undefined, TODAY)).toBe(false);
    }
  });

  test('không có hạn → không quá hạn', () => {
    const p = project({ id: '16', sx_kanban_column_id: 'sx' });
    expect(projectIsDeadlineOverdue(p, STAGES, undefined, TODAY)).toBe(false);
  });

  test('chuỗi ngày rác không làm hàm ném lỗi hay báo quá hạn', () => {
    const p = project({ id: '17', sx_kanban_column_id: 'sx', sx_kanban_deadline_at: 'khong-phai-ngay' });
    expect(projectIsDeadlineOverdue(p, STAGES, undefined, TODAY)).toBe(false);
  });

  test('status completed vẫn tính quá hạn — khớp KPI web, không tự loại', () => {
    const p = project({ id: '18', sx_kanban_column_id: 'sx', status: 'completed', sx_kanban_deadline_at: '2026-09-01' });
    expect(projectIsDeadlineOverdue(p, STAGES, undefined, TODAY)).toBe(true);
  });

  describe('Hucabi — hạn trong ngày tính quá sau 17:30 giờ VN', () => {
    const dueToday = project({
      id: '19',
      sx_kanban_column_id: 'sx',
      company_id: HUCABI,
      sx_kanban_deadline_at: '2026-09-30T00:00:00+07:00',
    });
    /** 2026-09-30 17:00 và 18:00 giờ VN. */
    const before1730 = new Date('2026-09-30T17:00:00+07:00').getTime();
    const after1730 = new Date('2026-09-30T18:00:00+07:00').getTime();

    test('trước 17:30 → chưa quá hạn', () => {
      expect(projectIsDeadlineOverdue(dueToday, STAGES, undefined, before1730)).toBe(false);
    });

    test('sau 17:30 → quá hạn', () => {
      expect(projectIsDeadlineOverdue(dueToday, STAGES, undefined, after1730)).toBe(true);
    });

    test('công ty khác cùng thời điểm → vẫn chưa quá hạn', () => {
      const other = project({ ...dueToday, id: '20', company_id: 'cong-ty-khac' });
      expect(projectIsDeadlineOverdue(other, STAGES, undefined, after1730)).toBe(false);
    });
  });
});

describe('sxOverdueProjectIds — nguồn của bộ lọc nhanh «Quá hạn»', () => {
  const projects = [
    // is_overdue: false cố ý — BE trả cờ sai chính là lỗi «quá hạn 10 nhưng
    // danh sách chỉ hiện 1». Bộ lọc phải tự tính, không tin cờ này.
    project({ id: 'a', sx_kanban_column_id: 'sx', sx_kanban_deadline_at: '2026-09-01', is_overdue: false }),
    project({ id: 'b', sx_kanban_column_id: 'sx', sx_kanban_deadline_at: '2026-09-29', is_overdue: false }),
    project({ id: 'c', sx_kanban_column_id: 'sx', sx_kanban_deadline_at: '2026-12-31' }),
    project({ id: 'd', sx_kanban_column_id: 'bo-han', sx_kanban_deadline_at: '2020-01-01' }),
    project({ id: 'e', sx_kanban_column_id: 'vc', sx_kanban_deadline_at: '2020-01-01' }),
    project({ id: 'f' }),
  ];

  test('trả đúng tập id quá hạn, không phụ thuộc cờ is_overdue của BE', () => {
    expect([...sxOverdueProjectIds(projects, STAGES, TODAY)].sort()).toEqual(['a', 'b']);
  });

  test('bằng số thẻ mà projectIsDeadlineOverdue nhận — không lệch giữa KPI và danh sách', () => {
    const viaSet = sxOverdueProjectIds(projects, STAGES, TODAY).size;
    const viaLoop = projects.filter((p) => projectIsDeadlineOverdue(p, STAGES, undefined, TODAY)).length;
    expect(viaSet).toBe(viaLoop);
  });

  test('board chưa có cột → rơi về cờ is_overdue của BE', () => {
    const noStages = [
      project({ id: 'x', is_overdue: true }),
      project({ id: 'y', is_overdue: false }),
    ];
    expect([...sxOverdueProjectIds(noStages, [], TODAY)]).toEqual(['x']);
  });
});

describe('pickOverdueProjects / pickSoonProjects', () => {
  // Hai hàm này gọi Date.now() bên trong nên phải đóng băng thời gian, nếu
  // không test sẽ đỏ vào ngày hôm sau.
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(TODAY));
  });
  afterAll(() => vi.useRealTimers());

  test('sắp xếp theo hạn gần nhất trước và tôn trọng limit', () => {
    const projects = [
      project({ id: 'moi', sx_kanban_column_id: 'sx', sx_kanban_deadline_at: '2026-09-29' }),
      project({ id: 'cu-nhat', sx_kanban_column_id: 'sx', sx_kanban_deadline_at: '2026-01-01' }),
      project({ id: 'giua', sx_kanban_column_id: 'sx', sx_kanban_deadline_at: '2026-06-01' }),
    ];
    expect(pickOverdueProjects(projects, 2, STAGES).map((p) => p.id)).toEqual(['cu-nhat', 'giua']);
  });

  test('thẻ hạn rác xếp cuối, không đẩy thẻ hợp lệ ra khỏi danh sách', () => {
    const projects = [
      project({ id: 'rac', sx_kanban_column_id: 'sx', sx_kanban_deadline_at: 'x', is_overdue: true }),
      project({ id: 'that', sx_kanban_column_id: 'sx', sx_kanban_deadline_at: '2026-01-01' }),
    ];
    expect(pickOverdueProjects(projects, 5, STAGES).map((p) => p.id)).toEqual(['that']);
  });

  test('«sắp đến hạn» chỉ lấy trong 2 ngày tới và bỏ thẻ đã quá hạn', () => {
    const projects = [
      project({ id: 'hom-nay', sx_kanban_column_id: 'sx', sx_kanban_deadline_at: '2026-09-30' }),
      project({ id: 'hai-ngay', sx_kanban_column_id: 'sx', sx_kanban_deadline_at: '2026-10-02' }),
      project({ id: 'ba-ngay', sx_kanban_column_id: 'sx', sx_kanban_deadline_at: '2026-10-03' }),
      project({ id: 'qua-han', sx_kanban_column_id: 'sx', sx_kanban_deadline_at: '2026-09-01' }),
    ];
    expect(pickSoonProjects(projects, 5, STAGES).map((p) => p.id)).toEqual(['hom-nay', 'hai-ngay']);
  });
});
