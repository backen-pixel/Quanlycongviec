/**
 * Đảm bảo mỗi công ty có ít nhất 1 pipeline CRM active (lead + deal stages).
 * Dùng khi tạo lead/deal mà chưa chọn pipeline — tránh lỗi «Công ty chưa có pipeline CRM».
 */

const { supabase } = require('../config/supabase');
const { invalidatePipelinesAndStages } = require('./crmTaxonomyCache');

const COMMON_PIPELINE_ID = '00000000-0000-0000-0000-000000000001';

const DEFAULT_LEAD_STAGES = [
  { name: 'Mới', icon: '🆕', color: '#94A3B8', order_index: 1 },
  { name: 'Đã liên hệ', icon: '📞', color: '#3B82F6', order_index: 2 },
  { name: 'Đang tư vấn', icon: '💬', color: '#8B5CF6', order_index: 3 },
  { name: 'Chờ phản hồi', icon: '⏳', color: '#F59E0B', order_index: 4 },
  { name: 'Chuyển Deal', icon: '✅', color: '#10B981', order_index: 5, is_won: true },
  { name: 'Mất', icon: '❌', color: '#EF4444', order_index: 6, is_lost: true },
];

const DEFAULT_DEAL_STAGES = [
  { name: 'Deal mới', icon: '🆕', color: '#06B6D4', order_index: 1 },
  { name: 'Báo giá', icon: '💰', color: '#F59E0B', order_index: 2 },
  { name: 'Đàm phán', icon: '🤝', color: '#8B5CF6', order_index: 3 },
  { name: 'Ký hợp đồng', icon: '📝', color: '#3B82F6', order_index: 4 },
  { name: 'Thắng', icon: '🏆', color: '#10B981', order_index: 5, is_won: true },
  { name: 'Thua', icon: '❌', color: '#EF4444', order_index: 6, is_lost: true },
];

async function findActivePipelineForCompany(companyId) {
  const { data } = await supabase
    .from('crm_pipelines')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('created_at')
    .limit(1)
    .maybeSingle();
  return data?.id || null;
}

async function copyStagesFromCommonPipeline(newPipelineId) {
  const { count, error: countErr } = await supabase
    .from('crm_pipeline_stages')
    .select('id', { count: 'exact', head: true })
    .eq('pipeline_id', COMMON_PIPELINE_ID);
  if (countErr || !count) return false;

  const { data: srcStages, error: srcErr } = await supabase
    .from('crm_pipeline_stages')
    .select('name, color, icon, order_index, is_active, is_won, is_lost, pipeline_type, send_zalo_on_enter, sync_role')
    .eq('pipeline_id', COMMON_PIPELINE_ID);
  if (srcErr || !srcStages?.length) return false;

  const rows = srcStages.map((s) => ({
    name: s.name,
    color: s.color,
    icon: s.icon,
    order_index: s.order_index,
    is_active: s.is_active !== false,
    is_won: !!s.is_won,
    is_lost: !!s.is_lost,
    pipeline_type: s.pipeline_type,
    pipeline_id: newPipelineId,
    send_zalo_on_enter: s.send_zalo_on_enter ?? false,
    sync_role: s.sync_role ?? null,
  }));

  const { error: insErr } = await supabase.from('crm_pipeline_stages').insert(rows);
  if (insErr) {
    // Cột mở rộng có thể chưa có trên DB cũ — thử bản tối thiểu
    const minimal = srcStages.map((s) => ({
      name: s.name,
      color: s.color,
      icon: s.icon,
      order_index: s.order_index,
      is_active: s.is_active !== false,
      is_won: !!s.is_won,
      is_lost: !!s.is_lost,
      pipeline_type: s.pipeline_type,
      pipeline_id: newPipelineId,
    }));
    const { error: ins2Err } = await supabase.from('crm_pipeline_stages').insert(minimal);
    if (ins2Err) return false;
  }
  return true;
}

async function insertBuiltinDefaultStages(pipelineId) {
  const stages = [
    ...DEFAULT_LEAD_STAGES.map((s) => ({ ...s, pipeline_id: pipelineId, pipeline_type: 'lead', is_active: true })),
    ...DEFAULT_DEAL_STAGES.map((s) => ({ ...s, pipeline_id: pipelineId, pipeline_type: 'deal', is_active: true })),
  ];
  const { error } = await supabase.from('crm_pipeline_stages').insert(stages);
  if (error) throw new Error(`Không tạo được giai đoạn pipeline mặc định: ${error.message}`);
}

/**
 * @returns {Promise<string|null>} pipeline id
 */
async function ensureDefaultCrmPipelineForCompany(companyId) {
  if (!companyId) return null;

  const existing = await findActivePipelineForCompany(companyId);
  if (existing) return existing;

  const { data: pipeline, error: pipeErr } = await supabase
    .from('crm_pipelines')
    .insert({
      name: 'CRM Pipeline',
      company_id: companyId,
      description: 'Pipeline mặc định theo công ty (tạo tự động)',
      is_default: true,
      is_active: true,
    })
    .select('id')
    .single();
  if (pipeErr) {
    // Race: công ty khác request vừa tạo xong
    const again = await findActivePipelineForCompany(companyId);
    if (again) return again;
    throw new Error(pipeErr.message);
  }

  const copied = await copyStagesFromCommonPipeline(pipeline.id);
  if (!copied) await insertBuiltinDefaultStages(pipeline.id);

  invalidatePipelinesAndStages();
  return pipeline.id;
}

module.exports = {
  ensureDefaultCrmPipelineForCompany,
  COMMON_PIPELINE_ID,
};
