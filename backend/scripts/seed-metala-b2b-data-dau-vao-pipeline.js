/**
 * Metala: pipeline SX «Data đầu vào» + «Data đầu ra» + loại Deal CRM «B2B».
 * Chạy: node scripts/seed-metala-b2b-data-dau-vao-pipeline.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const METALA_ID = 'b78baba2-2486-434c-a72d-9c937fac2164';

const PIPELINE_CONFIG = [
  {
    typeName: 'Data đầu vào',
    orderIndex: 103,
    stages: [
      { name: 'Tiếp nhận', color: '#6366F1', icon: '📥', order: 1301, crm_sync_type: null, is_handover_to_logistics: false },
      { name: 'Xác minh B2B', color: '#0EA5E9', icon: '🔍', order: 1302, crm_sync_type: null, is_handover_to_logistics: false },
      { name: 'Báo giá và tư vấn dịch vụ', color: '#8B5CF6', icon: '💬', order: 1303, crm_sync_type: null, is_handover_to_logistics: false },
      { name: 'Chốt', color: '#16A34A', icon: '✅', order: 1304, crm_sync_type: null, is_handover_to_logistics: false },
    ],
  },
  {
    typeName: 'Data đầu ra',
    orderIndex: 104,
    stages: [
      { name: 'Tiếp nhận', color: '#6366F1', icon: '📥', order: 1401, crm_sync_type: null, is_handover_to_logistics: false },
      { name: 'Tư vấn thiết kế sản xuất', color: '#8B5CF6', icon: '📐', order: 1402, crm_sync_type: null, is_handover_to_logistics: false },
      { name: 'Sản xuất', color: '#F59E0B', icon: '🏭', order: 1403, crm_sync_type: 'production', is_handover_to_logistics: false },
      { name: 'Hoàn thiện đóng gói', color: '#FB923C', icon: '📦', order: 1404, crm_sync_type: null, is_handover_to_logistics: false },
      { name: 'Giao hàng', color: '#10B981', icon: '🚚', order: 1405, crm_sync_type: null, is_handover_to_logistics: true },
    ],
  },
];

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function findMetalaId() {
  const { data, error } = await sb.from('companies').select('id, name').ilike('name', '%Metall%').limit(1).maybeSingle();
  if (error) throw error;
  return data?.id || METALA_ID;
}

async function getOrCreateWorkshopType(companyId, typeName, orderIndex) {
  const { data: existing } = await sb
    .from('workshop_project_types')
    .select('id')
    .eq('company_id', companyId)
    .ilike('name', typeName)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await sb
    .from('workshop_project_types')
    .insert({
      company_id: companyId,
      name: typeName,
      applies_to: 'production',
      order_index: orderIndex,
      is_active: true,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function getProductionWorkflowStageId() {
  const { data } = await sb.from('workflow_stages').select('id').eq('slug', 'production').maybeSingle();
  return data?.id || null;
}

async function clearStageReferences(stageIds) {
  if (!stageIds.length) return;
  await sb.from('crm_leads').update({ sx_pipeline_stage_id: null }).in('sx_pipeline_stage_id', stageIds);
  await sb.from('crm_tasks').update({ production_pipeline_stage_id: null }).in('production_pipeline_stage_id', stageIds);
}

async function syncPipelineStages(companyId, typeId, stages, workflowStageId) {
  const desiredNames = new Set(stages.map((s) => s.name.toLowerCase()));

  const { data: existingRows } = await sb
    .from('production_pipeline_stages')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('workshop_type_id', typeId);

  const obsolete = (existingRows || []).filter((r) => !desiredNames.has(String(r.name || '').trim().toLowerCase()));
  if (obsolete.length) {
    await clearStageReferences(obsolete.map((r) => r.id));
    const { error: delErr } = await sb.from('production_pipeline_stages').delete().in('id', obsolete.map((r) => r.id));
    if (delErr) throw delErr;
  }

  const existingNames = new Set(
    (existingRows || [])
      .filter((r) => desiredNames.has(String(r.name || '').trim().toLowerCase()))
      .map((r) => String(r.name || '').trim().toLowerCase()),
  );

  let inserted = 0;
  let updated = 0;

  for (const s of stages) {
    const payload = {
      color: s.color,
      icon: s.icon,
      order_index: s.order,
      workflow_stage_id: workflowStageId,
      crm_sync_type: s.crm_sync_type,
      is_handover_to_logistics: s.is_handover_to_logistics,
      is_active: true,
    };

    if (existingNames.has(s.name.toLowerCase())) {
      const { error } = await sb
        .from('production_pipeline_stages')
        .update(payload)
        .eq('company_id', companyId)
        .eq('workshop_type_id', typeId)
        .ilike('name', s.name);
      if (error) throw error;
      updated += 1;
      continue;
    }

    const { error } = await sb.from('production_pipeline_stages').insert({
      company_id: companyId,
      workshop_type_id: typeId,
      name: s.name,
      ...payload,
      bucket_slug: null,
    });
    if (error) throw error;
    inserted += 1;
  }

  return { inserted, updated, removed: obsolete.length };
}

async function upsertLeadTypeB2B(companyId) {
  const { data: existing } = await sb
    .from('crm_lead_types')
    .select('id')
    .eq('company_id', companyId)
    .ilike('name', 'B2B')
    .maybeSingle();

  const payload = {
    company_id: companyId,
    name: 'B2B',
    applies_to: 'both',
    order_index: 10,
    is_active: true,
    workshop_production_templates: true,
    default_production_company_id: companyId,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { data, error } = await sb.from('crm_lead_types').update(payload).eq('id', existing.id).select('id').single();
    if (error) throw error;
    return { id: data.id, created: false };
  }

  const { data, error } = await sb.from('crm_lead_types').insert(payload).select('id').single();
  if (error) throw error;
  return { id: data.id, created: true };
}

async function main() {
  const companyId = await findMetalaId();
  const workflowStageId = await getProductionWorkflowStageId();

  console.log('Metala company_id:', companyId);

  for (const cfg of PIPELINE_CONFIG) {
    const typeId = await getOrCreateWorkshopType(companyId, cfg.typeName, cfg.orderIndex);
    const result = await syncPipelineStages(companyId, typeId, cfg.stages, workflowStageId);
    console.log(`✅ «${cfg.typeName}» — type_id: ${typeId}`);
    console.log(`   cột mới: ${result.inserted} | cập nhật: ${result.updated} | xóa cũ: ${result.removed}`);
    console.log(`   stages: ${cfg.stages.map((s) => s.name).join(' → ')}`);
  }

  const leadType = await upsertLeadTypeB2B(companyId);
  console.log('  crm_lead_type B2B:', leadType.id, leadType.created ? '(mới)' : '(cập nhật)');
}

main().catch((e) => {
  console.error('❌', e.message || e);
  process.exit(1);
});
