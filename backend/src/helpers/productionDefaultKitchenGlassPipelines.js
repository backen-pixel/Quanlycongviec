/**
 * Sinh các phân loại + bộ pipeline xưởng mặc định cho 1 công ty:
 *   📦 Tủ bếp     (10 cột)
 *   📦 Cánh kính  (11 cột)
 *   📦 Cửa        (11 cột — pipeline giống Cánh kính)
 *
 * Idempotent: phân loại / cột đã tồn tại sẽ bỏ qua, chỉ thêm phần thiếu.
 * Tương ứng migration: 252_workshop_default_kitchen_glass_pipelines.sql + 255_workshop_default_type_cua.sql
 *
 * Dùng bởi POST /api/production/pipeline-stages/seed-default-kitchen-glass
 */

const {
  isHandoverMissingError,
  isPipelineWorkshopTypeMissingError,
  markHandoverColumnMissing,
  markPipelineWorkshopTypeColumnMissing,
  stripHandoverFields,
} = require('./productionPipelineSchema');

// Tủ bếp: 10 cột (KHÔNG có «Tiếp nhận» — quy trình bắt đầu từ Thiết kế).
const TUBEP_STAGES = [
  { name: 'Thiết kế lập kế hoạch',    color: '#8B5CF6', icon: '📐' },
  { name: 'Kiểm tra chéo',            color: '#06B6D4', icon: '🔍' },
  { name: 'KCS',                      color: '#14B8A6', icon: '✅' },
  { name: 'Đơn hàng chuẩn bị xong',   color: '#F59E0B', icon: '📦' },
  { name: 'Đơn hàng ngày mai giao',   color: '#FB923C', icon: '🚚' },
  { name: 'Đơn hàng đã giao',         color: '#10B981', icon: '✔️' },
  { name: 'Chốt công nợ',             color: '#64748B', icon: '🧾' },
  { name: 'Kiểm tra công nợ',         color: '#475569', icon: '🔎' },
  { name: 'Chốt lại công nợ',         color: '#334155', icon: '📋' },
  { name: 'Thu tiền',                 color: '#16A34A', icon: '💰' },
];

const KINH_STAGES = [
  { name: 'Tiếp nhận',                color: '#6366F1', icon: '📥' },
  { name: 'Thiết kế và lập kế hoạch', color: '#8B5CF6', icon: '📐' },
  { name: 'Kiểm tra đặt kính',        color: '#0EA5E9', icon: '🔍' },
  { name: 'Chuẩn bị vật tư',          color: '#06B6D4', icon: '📦' },
  { name: 'Phát vật tư',              color: '#14B8A6', icon: '📤' },
  { name: 'Sản xuất',                 color: '#F59E0B', icon: '🏭' },
  { name: 'Vệ sinh đóng gói',         color: '#FB923C', icon: '🧹' },
  { name: 'Thu tiền',                 color: '#16A34A', icon: '💰' },
  { name: 'Chờ giao hàng',            color: '#64748B', icon: '⏳' },
  { name: 'Đợi thanh toán',           color: '#D97706', icon: '💵' },
  { name: 'Nợ quá hạn',               color: '#DC2626', icon: '⚠️' },
];

// Cửa: dùng đúng pipeline của Cánh kính theo yêu cầu (11 cột).
const CUA_STAGES = KINH_STAGES;

const PRESETS = [
  { typeName: 'Tủ bếp',    typeOrder: 100, baseOrder: 1000, stages: TUBEP_STAGES },
  { typeName: 'Cánh kính', typeOrder: 101, baseOrder: 1100, stages: KINH_STAGES },
  { typeName: 'Cửa',       typeOrder: 102, baseOrder: 1200, stages: CUA_STAGES },
];

/** Lấy hoặc tạo workshop_project_types (company_id, name). */
async function getOrCreateWorkshopType(supabase, companyId, typeName, typeOrder) {
  const { data: existing, error: exErr } = await supabase
    .from('workshop_project_types')
    .select('id')
    .eq('company_id', companyId)
    .ilike('name', typeName)
    .limit(1)
    .maybeSingle();
  if (exErr) throw new Error(`workshop_project_types: ${exErr.message}`);
  if (existing?.id) return { id: existing.id, created: false };

  const { data, error } = await supabase
    .from('workshop_project_types')
    .insert({
      company_id: companyId,
      name: typeName,
      applies_to: 'production',
      order_index: typeOrder,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw new Error(`Tạo phân loại [${typeName}]: ${error.message}`);
  return { id: data.id, created: true };
}

/** Insert 1 cột pipeline (có retry khi cột workshop_type_id/handover thiếu). */
async function insertPipelineStage(supabase, payload) {
  let ins = stripHandoverFields({ ...payload });
  let res = await supabase
    .from('production_pipeline_stages')
    .insert(ins)
    .select('id, name')
    .single();
  if (res.error && isPipelineWorkshopTypeMissingError(res.error)) {
    markPipelineWorkshopTypeColumnMissing();
    ins = stripHandoverFields({ ...payload });
    res = await supabase
      .from('production_pipeline_stages')
      .insert(ins)
      .select('id, name')
      .single();
  }
  if (res.error && isHandoverMissingError(res.error)) {
    markHandoverColumnMissing();
    ins = stripHandoverFields({ ...payload });
    res = await supabase
      .from('production_pipeline_stages')
      .insert(ins)
      .select('id, name')
      .single();
  }
  if (res.error) throw new Error(`Tạo cột [${payload.name}]: ${res.error.message}`);
  return res.data;
}

/**
 * Đảm bảo company có 2 phân loại + 22 cột pipeline.
 * @returns thống kê {types: {created, existed}, stages: {inserted, skipped}}
 */
async function ensureKitchenAndGlassDefaults(supabase, companyId) {
  if (!companyId) throw new Error('Thiếu company_id');

  // workflow_stage 'production' để mọi cột map vào (giống pipeline-settings UI)
  let productionWorkflowStageId = null;
  try {
    const { data } = await supabase
      .from('workflow_stages')
      .select('id')
      .eq('slug', 'production')
      .maybeSingle();
    productionWorkflowStageId = data?.id || null;
  } catch { /* ignore */ }

  const stats = {
    types: { created: 0, existed: 0 },
    stages: { inserted: 0, skipped: 0, insertedNames: [] },
  };

  for (const preset of PRESETS) {
    const typeRes = await getOrCreateWorkshopType(supabase, companyId, preset.typeName, preset.typeOrder);
    if (typeRes.created) stats.types.created += 1;
    else stats.types.existed += 1;

    // Lấy danh sách cột hiện có cho (company, type) để dedupe theo name
    const { data: existingRows } = await supabase
      .from('production_pipeline_stages')
      .select('id, name')
      .eq('company_id', companyId)
      .eq('workshop_type_id', typeRes.id);
    const existingNames = new Set((existingRows || []).map((r) => String(r.name || '').toLowerCase()));

    let i = 0;
    for (const s of preset.stages) {
      i += 1;
      if (existingNames.has(s.name.toLowerCase())) {
        stats.stages.skipped += 1;
        continue;
      }
      const inserted = await insertPipelineStage(supabase, {
        name: s.name,
        color: s.color,
        icon: s.icon,
        order_index: preset.baseOrder + i,
        is_active: true,
        workflow_stage_id: productionWorkflowStageId,
        bucket_slug: null,
        is_handover_to_logistics: false,
        crm_sync_type: null,
        company_id: companyId,
        workshop_type_id: typeRes.id,
      });
      stats.stages.inserted += 1;
      stats.stages.insertedNames.push(`${preset.typeName} → ${inserted?.name || s.name}`);
    }
  }

  return stats;
}

module.exports = {
  ensureKitchenAndGlassDefaults,
  TUBEP_STAGES,
  KINH_STAGES,
  CUA_STAGES,
};
