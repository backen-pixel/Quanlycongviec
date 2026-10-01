import { describe, expect, test } from 'vitest';
import { buildStageIndex, resolveColumnId } from '../src/lib/productionApi';
import type { KanbanStage, ProductionProject } from '../src/types';

/**
 * Chốt resolve cột hiển thị Kanban SX — khớp web `colIdFor` + BE
 * `enrichProjectsForSx`. Lệch ở đây là badge cột app khác web.
 */

function stage(over: Partial<KanbanStage> & { id: string }): KanbanStage {
  return { name: over.id, order_index: 0, ...over };
}

function project(over: Partial<ProductionProject> & { id: string }): ProductionProject {
  return { code: over.id, name: over.id, ...over };
}

const INTAKE = stage({ id: 'tiep-nhan', order_index: 0, bucket_slug: 'won_pending' });
const SX = stage({ id: 'dang-sx', order_index: 10, slug: 'production' });
const KCS = stage({ id: 'kt-kcs', order_index: 20 });
const HANDOVER = stage({ id: 'ban-giao-vc', order_index: 30, is_handover_to_logistics: true });
const DA_GIAO = stage({ id: 'da-giao', order_index: 40 });
const CONG_NO = stage({ id: 'cong-no', order_index: 50 });
const DELIVERY = stage({ id: 'van-chuyen', order_index: 25, slug: 'delivery' });

const STAGES = [INTAKE, SX, KCS, DELIVERY, HANDOVER, DA_GIAO, CONG_NO];
const INDEX = buildStageIndex(STAGES);

describe('buildStageIndex', () => {
  test('handoverMinOrder là order_index nhỏ nhất trong các cột bàn giao VC', () => {
    const many = buildStageIndex([
      stage({ id: 'h2', order_index: 80, is_handover_to_logistics: true }),
      stage({ id: 'h1', order_index: 30, is_handover_to_logistics: true }),
    ]);
    expect(many.handoverMinOrder).toBe(30);
  });

  test('board không có cột bàn giao → handoverMinOrder null', () => {
    expect(buildStageIndex([SX, KCS]).handoverMinOrder).toBeNull();
  });

  test('nhận diện cột tiếp nhận theo bucket_slug', () => {
    expect(INDEX.intake?.id).toBe('tiep-nhan');
  });
});

describe('resolveColumnId — trường hợp thường', () => {
  test('giữ nguyên cột đã lưu khi cột có trong board', () => {
    const p = project({ id: '1', sx_kanban_column_id: 'kt-kcs' });
    expect(resolveColumnId(p, STAGES, INDEX)).toBe('kt-kcs');
  });

  test('cột đã lưu không còn trong board → không dùng cột rác', () => {
    const p = project({ id: '2', sx_kanban_column_id: 'cot-da-xoa' });
    expect(resolveColumnId(p, STAGES, INDEX)).not.toBe('cot-da-xoa');
  });

  test('chưa có cột lưu → lấy cột pipeline của deal gắn kèm', () => {
    const p = project({
      id: '3',
      crm_deals: [{ type: 'deal', sx_pipeline_stage_id: 'kt-kcs' }],
    });
    expect(resolveColumnId(p, STAGES, INDEX)).toBe('kt-kcs');
  });

  test('deal type=deal được ưu tiên hơn lead đứng trước', () => {
    const p = project({
      id: '4',
      crm_deals: [
        { type: 'lead', sx_pipeline_stage_id: 'dang-sx' },
        { type: 'deal', sx_pipeline_stage_id: 'kt-kcs' },
      ],
    });
    expect(resolveColumnId(p, STAGES, INDEX)).toBe('kt-kcs');
  });

  test('gọi không kèm index dựng sẵn cho kết quả y hệt', () => {
    const p = project({ id: '5', sx_kanban_column_id: 'kt-kcs' });
    expect(resolveColumnId(p, STAGES)).toBe(resolveColumnId(p, STAGES, INDEX));
  });
});

describe('resolveColumnId — ép cột «Bàn giao VC»', () => {
  test('status installing + thẻ còn đứng trước cột bàn giao → ép sang bàn giao', () => {
    const p = project({ id: '6', status: 'installing', sx_kanban_column_id: 'dang-sx' });
    expect(resolveColumnId(p, STAGES, INDEX)).toBe('ban-giao-vc');
  });

  test('status completed nhưng chưa vào luồng VC → KHÔNG ép', () => {
    const p = project({ id: '7', status: 'completed', sx_kanban_column_id: 'kt-kcs' });
    expect(resolveColumnId(p, STAGES, INDEX)).toBe('kt-kcs');
  });

  test('status completed và đã có công ty VC → ép sang bàn giao', () => {
    const p = project({
      id: '8',
      status: 'completed',
      sx_kanban_column_id: 'dang-sx',
      logistics_company_id: 'vc-co',
    });
    expect(resolveColumnId(p, STAGES, INDEX)).toBe('ban-giao-vc');
  });

  test('status shipping sinh ra từ chính cột đang đứng → giữ cột, không kéo ngược', () => {
    const p = project({ id: '9', status: 'shipping', sx_kanban_column_id: 'van-chuyen' });
    expect(resolveColumnId(p, STAGES, INDEX)).toBe('van-chuyen');
  });

  test('thẻ đã kéo TỚI/SAU cột bàn giao thì giữ nguyên — đây là lỗi lệch badge app/web', () => {
    for (const col of ['ban-giao-vc', 'da-giao', 'cong-no']) {
      const p = project({ id: `10-${col}`, status: 'installing', sx_kanban_column_id: col });
      expect(resolveColumnId(p, STAGES, INDEX)).toBe(col);
    }
  });

  test('board không có cột bàn giao → không ép đi đâu, giữ cột cũ', () => {
    const stages = [INTAKE, SX, KCS];
    const p = project({ id: '11', status: 'installing', sx_kanban_column_id: 'dang-sx' });
    expect(resolveColumnId(p, stages, buildStageIndex(stages))).toBe('dang-sx');
  });

  test('chọn cột bàn giao đúng loại xưởng của dự án', () => {
    const stages = [
      SX,
      stage({ id: 'bg-chung', order_index: 30, is_handover_to_logistics: true }),
      stage({ id: 'bg-cua', order_index: 31, is_handover_to_logistics: true, workshop_type_id: 'cua' }),
    ];
    const p = project({ id: '12', status: 'installing', sx_kanban_column_id: 'dang-sx', workshop_type_id: 'cua' });
    expect(resolveColumnId(p, stages, buildStageIndex(stages))).toBe('bg-cua');
  });

  test('loại xưởng không có cột riêng → rơi về cột bàn giao chung', () => {
    const stages = [
      SX,
      stage({ id: 'bg-chung', order_index: 30, is_handover_to_logistics: true }),
      stage({ id: 'bg-cua', order_index: 31, is_handover_to_logistics: true, workshop_type_id: 'cua' }),
    ];
    const p = project({ id: '13', status: 'installing', sx_kanban_column_id: 'dang-sx', workshop_type_id: 'tu-bep' });
    expect(resolveColumnId(p, stages, buildStageIndex(stages))).toBe('bg-chung');
  });

  test('status rỗng không bao giờ kích hoạt ép cột', () => {
    const p = project({ id: '14', status: '', sx_kanban_column_id: 'dang-sx' });
    expect(resolveColumnId(p, STAGES, INDEX)).toBe('dang-sx');
  });
});
