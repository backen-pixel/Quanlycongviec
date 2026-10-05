import { describe, expect, test } from 'vitest';
import {
  computeSxBoardKpis,
  projectIsAwaitingDelivery,
  projectIsCompleted,
  projectIsDelivered,
  projectIsProducing,
  sxColumnKpiKey,
} from '../src/lib/sxBoardKpis';
import type { KanbanStage, ProductionProject } from '../src/types';

/**
 * Quy tắc phân loại cột cho KPI Đang SX / Chờ VC / Đã VC / Hoàn tất. Dựa trên cấu hình cột thật
 * của Metalla, Hucabi, Phúc Đạt (production_pipeline_stages), khớp BE `sxColumnStageKpiKey`.
 */

function st(over: Partial<KanbanStage> & { id: string; name: string }): KanbanStage {
  return { order_index: 0, ...over };
}
function pr(id: string, col: string | null, over: Partial<ProductionProject> = {}): ProductionProject {
  return { id, code: id, name: id, sx_kanban_column_id: col, ...over } as ProductionProject;
}

// Metalla — Data đầu ra (rút gọn)
const SX_PHOI = st({ id: 'sx-phoi', name: 'Sản xuất Phôi - Thùng' });
const CHO_GIAO = st({ id: 'cho-giao', name: 'Đóng gói chờ giao hàng', is_handover_to_logistics: true });
const DA_GIAO = st({ id: 'da-giao', name: 'ĐÃ GIAO - CHỜ CHỐT CN, XUẤT HD' });
const CONG_NO = st({ id: 'cong-no', name: 'Công nợ' });
const DA_THU = st({ id: 'da-thu', name: 'Đã thu tiền', counts_as_collected_revenue: true });
// Hucabi — Tủ bếp
const DOI_TT = st({ id: 'doi-tt', name: 'Đợi thanh toán', counts_as_completed_revenue: true });
const INTAKE = st({ id: 'intake', name: 'Tiếp nhận', bucket_slug: 'won_pending' });

const STAGES = [SX_PHOI, CHO_GIAO, DA_GIAO, CONG_NO, DA_THU, DOI_TT, INTAKE];

describe('sxColumnKpiKey', () => {
  test('cột sản xuất thường → producing', () => {
    expect(sxColumnKpiKey(SX_PHOI)).toBe('producing');
  });
  test('cờ bàn giao → awaiting_delivery', () => {
    expect(sxColumnKpiKey(CHO_GIAO)).toBe('awaiting_delivery');
  });
  test('tên «ĐÃ GIAO…» (có dấu, hoa/thường) → shipped', () => {
    expect(sxColumnKpiKey(DA_GIAO)).toBe('shipped');
    expect(sxColumnKpiKey(st({ id: 'x', name: 'Đơn hàng đã giao' }))).toBe('shipped');
    expect(sxColumnKpiKey(st({ id: 'y', name: 'Giao xong, chờ nghiệm thu' }))).toBe('shipped');
  });
  test('cờ doanh thu hoàn thành / đã thu → null (không thuộc nhóm nào)', () => {
    expect(sxColumnKpiKey(DA_THU)).toBeNull();
    expect(sxColumnKpiKey(DOI_TT)).toBeNull();
  });
  test('cột tiếp nhận và thiếu cột → null', () => {
    expect(sxColumnKpiKey(INTAKE)).toBeNull();
    expect(sxColumnKpiKey(undefined)).toBeNull();
  });
  test('tick tay dashboard_kpi thắng cờ và tên', () => {
    expect(sxColumnKpiKey({ ...CONG_NO, dashboard_kpi: 'shipped' })).toBe('shipped');
    // cột có cờ bàn giao nhưng tick producing → vẫn là đang SX (khớp BE)
    expect(sxColumnKpiKey({ ...CHO_GIAO, dashboard_kpi: 'producing' })).toBe('producing');
    // tick sai giá trị bị bỏ qua, quay về suy đoán
    expect(sxColumnKpiKey({ ...CHO_GIAO, dashboard_kpi: 'bậy' })).toBe('awaiting_delivery');
  });
});

describe('Đang sản xuất', () => {
  const producing = (p: ProductionProject) => projectIsProducing(p, STAGES);

  test('đang ở cột sản xuất → có', () => {
    expect(producing(pr('a', 'sx-phoi'))).toBe(true);
  });
  test('chờ giao, đã giao, đã thu, chờ thanh toán, tiếp nhận → không', () => {
    for (const col of ['cho-giao', 'da-giao', 'da-thu', 'doi-tt', 'intake']) {
      expect(producing(pr('b', col))).toBe(false);
    }
  });
  test('cột công nợ chưa tick vẫn là đang SX; tick tay shipped thì thôi', () => {
    expect(producing(pr('c', 'cong-no'))).toBe(true);
    const ticked = STAGES.map((s) => (s.id === 'cong-no' ? { ...s, dashboard_kpi: 'shipped' } : s));
    expect(projectIsProducing(pr('c', 'cong-no'), ticked)).toBe(false);
  });
  test('cờ sx_intake, đã có công ty vận chuyển, status completed → không', () => {
    expect(producing(pr('d', 'sx-phoi', { sx_intake: true } as Partial<ProductionProject>))).toBe(false);
    expect(producing(pr('e', 'sx-phoi', { logistics_company_id: 'lc' } as Partial<ProductionProject>))).toBe(false);
    expect(producing(pr('f', 'sx-phoi', { status: 'completed' }))).toBe(false);
  });
  test('chưa vào cột nào: giữ hành vi cũ (tính là đang SX)', () => {
    expect(producing(pr('g', null))).toBe(true);
  });
});

describe('Chờ vận chuyển', () => {
  test('chỉ cột bàn giao, và chưa vận chuyển', () => {
    expect(projectIsAwaitingDelivery(pr('a', 'cho-giao'), STAGES)).toBe(true);
    expect(projectIsAwaitingDelivery(pr('b', 'sx-phoi'), STAGES)).toBe(false);
    expect(
      projectIsAwaitingDelivery(pr('c', 'cho-giao', { logistics_company_id: 'lc' } as Partial<ProductionProject>), STAGES),
    ).toBe(false);
  });
});

describe('Hoàn tất', () => {
  test('status completed hoặc đứng ở cột đã thu tiền', () => {
    expect(projectIsCompleted(pr('a', 'sx-phoi', { status: 'completed' }), STAGES)).toBe(true);
    expect(projectIsCompleted(pr('b', 'da-thu'), STAGES)).toBe(true);
  });
  test('cột chỉ có cờ doanh thu hoàn thành (đợi thanh toán) thì chưa hoàn tất', () => {
    expect(projectIsCompleted(pr('c', 'doi-tt'), STAGES)).toBe(false);
    expect(projectIsCompleted(pr('d', 'sx-phoi'), STAGES)).toBe(false);
  });
  test('cột tiếp nhận không bao giờ hoàn tất', () => {
    const odd = [{ ...INTAKE, counts_as_collected_revenue: true }];
    expect(projectIsCompleted(pr('e', 'intake'), odd)).toBe(false);
  });
});

describe('computeSxBoardKpis — số liệu tổng hợp', () => {
  test('mỗi dự án rơi đúng nhóm', () => {
    const projects = [
      pr('p1', 'sx-phoi'),
      pr('p2', 'cong-no'),
      pr('p3', 'cho-giao'),
      pr('p4', 'da-giao'),
      pr('p5', 'da-thu'),
      pr('p6', 'intake'),
    ];
    const k = computeSxBoardKpis(projects, STAGES);
    expect(k.total).toBe(6);
    expect(k.producing).toBe(2); // p1 + p2 (công nợ chưa tick)
    expect(k.awaitingDelivery).toBe(1); // p3
    expect(k.shipped).toBe(1); // p4 (tên «đã giao»)
    expect(k.completed).toBe(1); // p5 (cột đã thu)
  });
});

describe('projectIsDelivered — chip «Đã giao» trên thẻ', () => {
  test('mới được đẩy sang bảng vận chuyển (có vc_kanban_column_id) mà còn ở tiếp nhận: CHƯA giao', () => {
    expect(projectIsDelivered(pr('a', 'intake', { vc_kanban_column_id: 'vc-1' }), STAGES)).toBe(false);
  });

  test('có công ty vận chuyển nhưng còn ở cột sản xuất: chưa giao', () => {
    expect(projectIsDelivered(pr('a', 'sx-phoi', { logistics_company_id: 'lg-1' }), STAGES)).toBe(false);
  });

  test('đứng ở cột «ĐÃ GIAO…»: đã giao', () => {
    expect(projectIsDelivered(pr('a', 'da-giao'), STAGES)).toBe(true);
  });

  test('đứng ở cột đã thu tiền hoặc đợi thanh toán: đã giao (xong)', () => {
    expect(projectIsDelivered(pr('a', 'da-thu'), STAGES)).toBe(true);
    expect(projectIsDelivered(pr('a', 'doi-tt'), STAGES)).toBe(true);
  });

  test('status lắp đặt / bảo hành / hoàn tất: đã giao', () => {
    expect(projectIsDelivered(pr('a', 'sx-phoi', { status: 'installing' }), STAGES)).toBe(true);
    expect(projectIsDelivered(pr('a', 'sx-phoi', { status: 'warranty' }), STAGES)).toBe(true);
    expect(projectIsDelivered(pr('a', 'sx-phoi', { status: 'completed' }), STAGES)).toBe(true);
  });

  test('cột sản xuất thường / chờ giao / chưa vào cột: chưa giao', () => {
    expect(projectIsDelivered(pr('a', 'sx-phoi'), STAGES)).toBe(false);
    expect(projectIsDelivered(pr('a', 'cho-giao'), STAGES)).toBe(false);
    expect(projectIsDelivered(pr('a', null), STAGES)).toBe(false);
  });
});
