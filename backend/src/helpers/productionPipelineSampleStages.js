/**
 * Cột mẫu cho pipeline xưởng: tạo workflow_stages + production_pipeline_stages (idempotent theo slug).
 * Dùng bởi POST /production/pipeline-stages/seed-samples
 */

const {
  isHandoverMissingError,
  isPipelineWorkshopTypeMissingError,
  markHandoverColumnMissing,
  markPipelineWorkshopTypeColumnMissing,
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

async function ensureSampleProductionPipelineStages(supabase, companyId = null, opts = {}) {
  const cid = companyId != null && String(companyId).trim() ? String(companyId).trim() : null;
  const wkt = opts.workshopTypeId != null && String(opts.workshopTypeId).trim()
    ? String(opts.workshopTypeId).trim()
    : null;

  /** Áp scope (company_id, workshop_type_id) cho 1 query select. */
  const applyScope = (q) => {
    let qq = q;
    if (cid) qq = qq.eq('company_id', cid);
    else qq = qq.is('company_id', null);
    if (wkt) qq = qq.eq('workshop_type_id', wkt);
    else qq = qq.is('workshop_type_id', null);
    return qq;
  };

  let hcQ = applyScope(
    supabase
      .from('production_pipeline_stages')
      .select('id', { count: 'exact', head: true })
      .eq('is_handover_to_logistics', true),
  );
  let handoverCountRes = await hcQ;
  if (handoverCountRes.error && isPipelineWorkshopTypeMissingError(handoverCountRes.error)) {
    markPipelineWorkshopTypeColumnMissing();
    let hcQ2 = supabase
      .from('production_pipeline_stages')
      .select('id', { count: 'exact', head: true })
      .eq('is_handover_to_logistics', true);
    if (cid) hcQ2 = hcQ2.eq('company_id', cid);
    else hcQ2 = hcQ2.is('company_id', null);
    handoverCountRes = await hcQ2;
  }
  const handoverCols = handoverCountRes.error ? 0 : (handoverCountRes.count ?? 0);

  let maxQ = applyScope(
    supabase
      .from('production_pipeline_stages')
      .select('order_index')
      .order('order_index', { ascending: false })
      .limit(1),
  );
  let maxRowRes = await maxQ;
  if (maxRowRes.error && isPipelineWorkshopTypeMissingError(maxRowRes.error)) {
    markPipelineWorkshopTypeColumnMissing();
    let maxQ2 = supabase
      .from('production_pipeline_stages')
      .select('order_index')
      .order('order_index', { ascending: false })
      .limit(1);
    if (cid) maxQ2 = maxQ2.eq('company_id', cid);
    else maxQ2 = maxQ2.is('company_id', null);
    maxRowRes = await maxQ2;
  }
  const maxRow = maxRowRes.data;
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

  // Tất cả cột mẫu đều gắn vào 1 workflow_stage 'production' (giống logic
  // form: pipeline xưởng = giai đoạn workflow «Sản xuất» chung).
  let { data: prodWs, error: prodWsErr } = await supabase
    .from('workflow_stages')
    .select('id')
    .eq('slug', 'production')
    .maybeSingle();
  if (prodWsErr) throw new Error(`workflow_stages(production): ${prodWsErr.message}`);
  const productionWorkflowStageId = prodWs?.id || null;

  for (const s of rowsToCreate) {
    const wid = productionWorkflowStageId;

    // Dedupe theo (company_id, workshop_type_id, name) — vì giờ nhiều cột chia sẻ cùng workflow_stage_id
    let exQ = applyScope(
      supabase
        .from('production_pipeline_stages')
        .select('id, name')
        .eq('name', s.name),
    );
    let exRes = await exQ.maybeSingle();
    if (exRes.error && isPipelineWorkshopTypeMissingError(exRes.error)) {
      markPipelineWorkshopTypeColumnMissing();
      let exQ2 = supabase
        .from('production_pipeline_stages')
        .select('id, name')
        .eq('name', s.name);
      if (cid) exQ2 = exQ2.eq('company_id', cid);
      else exQ2 = exQ2.is('company_id', null);
      exRes = await exQ2.maybeSingle();
    }
    const existingPipe = exRes.data;
    if (exRes.error) throw new Error(`production_pipeline_stages: ${exRes.error.message}`);

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
      workshop_type_id: wkt,
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

    if (insP.error && isPipelineWorkshopTypeMissingError(insP.error)) {
      markPipelineWorkshopTypeColumnMissing();
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
