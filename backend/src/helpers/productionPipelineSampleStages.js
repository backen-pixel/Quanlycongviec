/**
 * Cột mẫu cho pipeline xưởng: tạo workflow_stages + production_pipeline_stages (idempotent theo slug).
 * Dùng bởi POST /production/pipeline-stages/seed-samples
 */

const {
  isHandoverMissingError,
  markHandoverColumnMissing,
  stripHandoverFields,
} = require('./productionPipelineSchema');

// crm_sync_type='production' → khi project vào cột này (và deal đã sx_handover), CRM deal nhảy sang "Sản xuất"
const SAMPLES = [
  { slug: 'sx-sample-drawing', name: 'Nhận bản vẽ & tối ưu', color: '#6366F1', icon: '📐', wsOrder: 50, crm_sync_type: 'production', handover: false },
  { slug: 'sx-sample-material', name: 'Dự trù & xuất vật tư', color: '#059669', icon: '📦', wsOrder: 55, crm_sync_type: null, handover: false },
  { slug: 'sx-sample-cnc', name: 'Cắt gia công (CNC)', color: '#D97706', icon: '✂️', wsOrder: 51, crm_sync_type: null, handover: false },
  { slug: 'sx-sample-assembly', name: 'Lắp ráp tại xưởng', color: '#0D9488', icon: '🔩', wsOrder: 52, crm_sync_type: null, handover: false },
  { slug: 'sx-sample-finishing', name: 'Sơn & hoàn thiện bề mặt', color: '#DB2777', icon: '🎨', wsOrder: 53, crm_sync_type: null, handover: false },
  { slug: 'sx-sample-internal-qa', name: 'Nghiệm thu nội bộ', color: '#4F46E5', icon: '✅', wsOrder: 54, crm_sync_type: null, handover: false },
  { slug: 'sx-sample-packaging', name: 'Đóng gói & nhãn công trình', color: '#7C3AED', icon: '📤', wsOrder: 56, crm_sync_type: null, handover: false },
  { slug: 'sx-sample-handover-vc', name: 'Bàn giao Vận chuyển', color: '#DC2626', icon: '🚚', wsOrder: 57, crm_sync_type: null, handover: true },
];

async function ensureSampleProductionPipelineStages(supabase, companyId = null) {
  const cid = companyId != null && String(companyId).trim() ? String(companyId).trim() : null;

  let hcQ = supabase
    .from('production_pipeline_stages')
    .select('id', { count: 'exact', head: true })
    .eq('is_handover_to_logistics', true);
  if (cid) hcQ = hcQ.eq('company_id', cid);
  else hcQ = hcQ.is('company_id', null);
  const handoverCountRes = await hcQ;
  const handoverCols = handoverCountRes.error ? 0 : (handoverCountRes.count ?? 0);

  let maxQ = supabase
    .from('production_pipeline_stages')
    .select('order_index')
    .order('order_index', { ascending: false })
    .limit(1);
  if (cid) maxQ = maxQ.eq('company_id', cid);
  else maxQ = maxQ.is('company_id', null);
  const { data: maxRow } = await maxQ;
  let nextOrder = (maxRow?.[0]?.order_index != null ? Number(maxRow[0].order_index) : 0) + 1;

  const inserted = [];
  const alreadyHad = [];
  const skippedHandover = [];

  const rowsToCreate = SAMPLES.filter((s) => {
    if (s.handover && handoverCols > 0) {
      skippedHandover.push(s.name);
      return false;
    }
    return true;
  });

  for (const s of rowsToCreate) {
    let { data: ws, error: wsErr } = await supabase
      .from('workflow_stages')
      .select('id')
      .eq('slug', s.slug)
      .maybeSingle();
    if (wsErr) throw new Error(`workflow_stages: ${wsErr.message}`);

    if (!ws) {
      const insW = await supabase
        .from('workflow_stages')
        .insert({
          name: s.name,
          slug: s.slug,
          color: s.color,
          icon: s.icon,
          order_index: s.wsOrder,
          is_active: true,
        })
        .select('id')
        .single();
      if (insW.error) throw new Error(`Tạo workflow_stages [${s.slug}]: ${insW.error.message}`);
      ws = insW.data;
    }

    const wid = ws.id;
    let exQ = supabase
      .from('production_pipeline_stages')
      .select('id, name')
      .eq('workflow_stage_id', wid);
    if (cid) exQ = exQ.eq('company_id', cid);
    else exQ = exQ.is('company_id', null);
    const { data: existingPipe, error: exErr } = await exQ.maybeSingle();
    if (exErr) throw new Error(`production_pipeline_stages: ${exErr.message}`);

    if (existingPipe) {
      alreadyHad.push(s.name);
      continue;
    }

    const payload = {
      name: s.name,
      color: s.color,
      icon: s.icon,
      order_index: nextOrder,
      is_active: true,
      workflow_stage_id: wid,
      bucket_slug: null,
      is_handover_to_logistics: !!s.handover,
      crm_sync_type: s.crm_sync_type || null,
      company_id: cid,
    };

    let ins = stripHandoverFields({ ...payload });
    let insP = await supabase
      .from('production_pipeline_stages')
      .insert(ins)
      .select('id, name, order_index')
      .single();

    if (insP.error && isHandoverMissingError(insP.error)) {
      markHandoverColumnMissing();
      ins = stripHandoverFields({ ...payload });
      insP = await supabase
        .from('production_pipeline_stages')
        .insert(ins)
        .select('id, name, order_index')
        .single();
    }

    if (insP.error) throw new Error(`Tạo cột [${s.name}]: ${insP.error.message}`);

    nextOrder += 1;
    inserted.push(insP.data?.name || s.name);
  }

  return {
    ok: true,
    inserted: inserted.length,
    insertedNames: inserted,
    skipped: alreadyHad.length,
    skippedNames: alreadyHad,
    skippedHandoverColumn: skippedHandover.length ? skippedHandover : undefined,
  };
}

module.exports = { ensureSampleProductionPipelineStages, SAMPLES };
