/**
 * Tạo pipeline CRM Deal cho NextGo.
 * Chạy: node scripts/seed-nextgo-crm-pipeline.js
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const MARKER = '[crm-pipeline-nextgo-deal]';
const COMMON_PIPELINE_ID = '00000000-0000-0000-0000-000000000001';

const DEAL_STAGES = [
  { name: 'Tiếp nhận', color: '#64748B', icon: '📥', order_index: 1, canonical_slug: 'lead_new' },
  { name: 'Tư vấn', color: '#3B82F6', icon: '💬', order_index: 2 },
  { name: 'Thiết kế mẫu', color: '#8B5CF6', icon: '🎨', order_index: 3, canonical_slug: 'designing' },
  { name: 'Báo giá', color: '#F59E0B', icon: '💰', order_index: 4, canonical_slug: 'quoted' },
  { name: 'Khả năng chốt', color: '#F97316', icon: '🔥', order_index: 5, canonical_slug: 'negotiating' },
  { name: 'Đặt cọc - lên họp đồng', color: '#84CC16', icon: '💵', order_index: 6, canonical_slug: 'waiting_deposit' },
  { name: 'Thắng', color: '#10B981', icon: '🎉', order_index: 7, is_won: true, canonical_slug: 'contract_signed' },
  { name: 'Thiết kế chi tiết', color: '#6366F1', icon: '📐', order_index: 8, canonical_slug: 'designing' },
  { name: 'Sản xuất', color: '#EA580C', icon: '🏭', order_index: 9, sync_role: 'sx_production', canonical_slug: 'producing' },
  { name: 'Giao hàng', color: '#06B6D4', icon: '🚚', order_index: 10, canonical_slug: 'installing' },
  { name: 'Hoàn thành', color: '#059669', icon: '✅', order_index: 11, canonical_slug: 'completed', counts_as_completed_revenue: true },
];

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function findNextGo() {
  const { data, error } = await sb.from('companies').select('id, name, short_name');
  if (error) throw error;
  return (data || []).find(
    (c) => /nextgo/i.test(c.name || '') || /nextgo/i.test(c.short_name || ''),
  );
}

async function main() {
  const company = await findNextGo();
  if (!company) throw new Error('Không tìm thấy công ty NextGo');

  const { data: existing } = await sb
    .from('crm_pipelines')
    .select('id, name')
    .eq('company_id', company.id)
    .ilike('description', `%${MARKER}%`)
    .maybeSingle();

  if (existing) {
    console.log('Pipeline NextGo đã có:', existing.id, existing.name);
    return;
  }

  await sb
    .from('crm_pipelines')
    .update({ is_default: false })
    .eq('company_id', company.id)
    .eq('is_default', true);

  const { data: pipeline, error: pErr } = await sb
    .from('crm_pipelines')
    .insert({
      name: 'CRM — NextGo',
      company_id: company.id,
      description: `Pipeline Lead + Deal — NextGo ${MARKER}`,
      is_default: true,
      is_active: true,
    })
    .select('id')
    .single();
  if (pErr) throw pErr;

  const { data: leadStages, error: lsErr } = await sb
    .from('crm_pipeline_stages')
    .select('name, color, icon, order_index, is_won, is_lost, is_active, send_zalo_on_enter, sync_role')
    .eq('pipeline_id', COMMON_PIPELINE_ID)
    .eq('pipeline_type', 'lead')
    .order('order_index');
  if (lsErr) throw lsErr;

  if (leadStages?.length) {
    const { error: insLeadErr } = await sb.from('crm_pipeline_stages').insert(
      leadStages.map((s) => ({
        ...s,
        pipeline_id: pipeline.id,
        pipeline_type: 'lead',
        is_active: s.is_active !== false,
        send_zalo_on_enter: s.send_zalo_on_enter || false,
      })),
    );
    if (insLeadErr) throw insLeadErr;
  }

  const { error: insDealErr } = await sb.from('crm_pipeline_stages').insert(
    DEAL_STAGES.map((s) => ({
      pipeline_id: pipeline.id,
      pipeline_type: 'deal',
      name: s.name,
      color: s.color,
      icon: s.icon,
      order_index: s.order_index,
      is_won: !!s.is_won,
      is_lost: false,
      is_active: true,
      send_zalo_on_enter: false,
      sync_role: s.sync_role || null,
      canonical_slug: s.canonical_slug || null,
      counts_as_completed_revenue: s.counts_as_completed_revenue || false,
    })),
  );
  if (insDealErr) throw insDealErr;

  console.log('Đã tạo pipeline NextGo:', pipeline.id, 'cho', company.name);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
