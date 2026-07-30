/**
 * Lấy bộ nhiệm vụ Global CRM (pipeline_stage_id IS NULL) — nguồn chuẩn VPT —
 * gắn/đồng bộ vào:
 *   - Phúc Đạt (pipeline chung) → áp lead/deal khu vực Showroom
 *   - VPT 3 khu vực (HCM / Q2 / Cần Thơ) → áp lead/deal từng khu vực
 *
 * Giữ form khảo sát Phúc Đạt trên item «Hình ảnh thực tế» nếu đã có.
 *
 * Usage: node scripts/apply-vpt-global-crm-templates.js [--dry-run] [--apply-leads]
 *
 * Mặc định: CHỈ đồng bộ bộ mẫu (lead/deal mới sẽ nhận khi tạo).
 * Thêm --apply-leads nếu muốn gen cho lead/deal cũ chưa có nhiệm vụ.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { supabase } = require('../src/config/supabase');
const { applyCrmTaskTemplatesToCompanyRegions } = require('../src/helpers/autoGenCrmTasks');

const DRY = process.argv.includes('--dry-run');
const APPLY_LEADS = process.argv.includes('--apply-leads');
const MARKER = '[crm-sync-from-global-vpt]';

const PD_COMPANY = '29677f68-967e-4256-92fd-492bb580e888';
const VPT_COMPANY = '991dc79d-cbf5-49f9-a364-35227cb47635';

const PD_PIPELINE = '6017bdcd-5683-4f81-9f84-4a5e7bc8d373';
const PD_SHOWROOM = '6e45a2aa-4664-4822-b5e9-1b2f85b424d1';

const VPT_TARGETS = [
  {
    label: 'VPT HCM',
    pipeline_id: '78e6251c-aea1-46bc-a19f-a401f1de7f34',
    region_id: 'f68e643d-7999-442c-83ee-edb7f5237ab1',
  },
  {
    label: 'VPT Q2',
    pipeline_id: 'f4bf40c1-f673-459a-a735-09ec88b2e872',
    region_id: '7d7a001a-bf2e-4915-8128-b2166901ec4f',
  },
  {
    label: 'VPT Cần Thơ',
    pipeline_id: '98af561c-133f-4431-a95c-48d747afb4b2',
    region_id: '098538c0-8429-490b-bc10-df3349fb6045',
  },
];

/** Map tên bộ mẫu Global → khóa tìm cột đích (canonical_slug ưu tiên, rồi name ILIKE). */
const GLOBAL_STAGE_HINTS = {
  'Bộ mẫu Tư vấn khách mới': { pipeline_type: 'lead', slugs: ['lead_new'], names: ['TIẾP NHẬN', 'Mới'] },
  'Bộ mẫu Tư vấn khách Cold': { pipeline_type: 'lead', slugs: ['cold'], names: ['CHUẨN BỊ XÂY', 'Cold'] },
  'Bộ mẫu Tư vấn khách Warm': { pipeline_type: 'lead', slugs: ['warm'], names: ['GIAI ĐOẠN XÂY THÔ', 'Warm'] },
  'Bộ mẫu Tư vấn khách Hot': { pipeline_type: 'lead', slugs: ['hot'], names: ['NHÀ GẦN HOÀN THIỆN', 'Hot'] },
  'Deal mới': { pipeline_type: 'deal', slugs: [], names: ['Deal mới', 'Chờ sale xác nhận'] },
  'Tiếp nhận': { pipeline_type: 'deal', slugs: ['deal_new'], names: ['Deal mới', 'Chờ sale xác nhận'] },
  'Chờ khảo sát': { pipeline_type: 'deal', slugs: [], names: ['Chờ khảo sát'] },
  'Đã khảo sát': { pipeline_type: 'deal', slugs: ['designing'], names: ['Đã Khảo sát', 'ĐÃ KHẢO SÁT'] },
  'Đang thiết kế': { pipeline_type: 'deal', slugs: ['designing'], names: ['Đã Khảo sát', 'ĐÃ KHẢO SÁT'] },
  'Báo giá': { pipeline_type: 'deal', slugs: ['quoted'], names: ['Báo giá', 'ĐÃ GỬI BÁO GIÁ'] },
  'Ký hợp đồng': { pipeline_type: 'deal', slugs: ['contract_signed'], names: ['Đã cọc thiết kế', 'ĐÃ KÝ HỢP ĐỒNG'] },
  'Sản xuất': { pipeline_type: 'deal', slugs: ['producing'], names: ['Sản xuất', 'ĐANG SẢN XUẤT'] },
  'Đặt Vận chuyển và lắp đặt': { pipeline_type: 'deal', slugs: ['installing'], names: ['Vận chuyển', 'ĐANG LẮP ĐẶT', 'lắp đặt'] },
};

/** Tên hiển thị trên pipeline công ty (Global «Bộ mẫu Tư vấn…» → ngắn gọn). */
const DISPLAY_NAME = {
  'Bộ mẫu Tư vấn khách mới': 'Tư vấn',
  'Bộ mẫu Tư vấn khách Cold': 'COLD',
  'Bộ mẫu Tư vấn khách Warm': 'WARM',
  'Bộ mẫu Tư vấn khách Hot': 'HOT',
};

function fold(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function pickStage(stages, hint) {
  if (!hint) return null;
  const typed = stages.filter((s) => {
    const pt = String(s.pipeline_type || '').toLowerCase();
    return !hint.pipeline_type || !pt || pt === 'both' || pt === hint.pipeline_type;
  });
  for (const slug of hint.slugs || []) {
    const hit = typed.find((s) => String(s.canonical_slug || '').toLowerCase() === slug);
    if (hit) return hit;
  }
  for (const name of hint.names || []) {
    const f = fold(name);
    const hit = typed.find((s) => fold(s.name).includes(f) || f.includes(fold(s.name).slice(0, 8)));
    if (hit) return hit;
  }
  return null;
}

function itemPayload(templateId, item, companyId, preserveForm = null) {
  const row = {
    template_id: templateId,
    title: item.title,
    description: item.description,
    priority: item.priority || 'medium',
    deadline_days: item.deadline_days ?? 0,
    deadline_hours: item.deadline_hours ?? null,
    deadline_minutes: item.deadline_minutes ?? null,
    order_index: item.order_index ?? 0,
    checklist: item.checklist || [],
    default_allowed_companies: companyId ? [companyId] : item.default_allowed_companies,
    default_allowed_departments: item.default_allowed_departments,
    completion_requires_file_or_note: !!item.completion_requires_file_or_note,
    completion_requires_customer_note: !!item.completion_requires_customer_note,
    completion_requires_customer_contact: !!item.completion_requires_customer_contact,
    blocks_stage_advance: !!item.blocks_stage_advance,
    show_excel_quotation_upload: !!item.show_excel_quotation_upload,
    requires_quick_verdict: !!item.requires_quick_verdict,
    required_evidence_file_types: item.required_evidence_file_types,
    executor_company_id: item.executor_company_id || null,
    default_assignee_id: item.default_assignee_id || null,
    default_assignee_ids: item.default_assignee_ids || null,
    default_shared_to_project: !!item.default_shared_to_project,
    default_allowed_share_modules: item.default_allowed_share_modules,
    auto_upload_attachments_to_drive: !!item.auto_upload_attachments_to_drive,
    show_fill_form: !!(preserveForm?.show_fill_form || item.show_fill_form),
    form_config: preserveForm?.form_config || item.form_config || null,
  };
  return row;
}

async function loadGlobalTemplates() {
  const { data, error } = await supabase
    .from('crm_task_templates')
    .select('*, items:crm_task_template_items(*)')
    .is('pipeline_stage_id', null)
    .eq('is_active', true)
    .order('order_index');
  if (error) throw error;
  return (data || []).map((t) => ({
    ...t,
    items: (t.items || []).sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
  }));
}

async function loadPipelineStages(pipelineId) {
  const { data, error } = await supabase
    .from('crm_pipeline_stages')
    .select('id, name, pipeline_type, canonical_slug, order_index')
    .eq('pipeline_id', pipelineId)
    .order('order_index');
  if (error) throw error;
  return data || [];
}

async function loadPipelineTemplates(pipelineId) {
  const stages = await loadPipelineStages(pipelineId);
  const stageIds = stages.map((s) => s.id);
  if (!stageIds.length) return { stages, templates: [] };
  const { data, error } = await supabase
    .from('crm_task_templates')
    .select('*, items:crm_task_template_items(*)')
    .in('pipeline_stage_id', stageIds)
    .eq('is_active', true);
  if (error) throw error;
  return { stages, templates: data || [] };
}

/** Bỏ qua Global trùng cột với «Tiếp nhận». */
const SKIP_GLOBAL_NAMES = new Set(['Deal mới']);

function findExistingTemplate(templates, globalTpl, stageId) {
  const display = DISPLAY_NAME[globalTpl.name] || globalTpl.name;
  const candidates = templates.filter((t) => String(t.pipeline_stage_id) === String(stageId));
  return candidates.find((t) => fold(t.name) === fold(display) || fold(t.name) === fold(globalTpl.name)) || null;
}

async function syncPipelineFromGlobal({ label, pipelineId, companyId, globalTpls }) {
  const { stages, templates } = await loadPipelineTemplates(pipelineId);
  const stats = {
    label,
    pipeline_id: pipelineId,
    created: 0,
    updated: 0,
    skipped: 0,
    items: 0,
    details: [],
  };

  for (const g of globalTpls) {
    if (SKIP_GLOBAL_NAMES.has(g.name)) {
      stats.skipped += 1;
      stats.details.push(`SKIP ${g.name} — trùng cột với Tiếp nhận`);
      continue;
    }
    const hint = GLOBAL_STAGE_HINTS[g.name] || {
      pipeline_type: g.pipeline_type === 'lead' ? 'lead' : 'deal',
      slugs: g.stage_slug ? [g.stage_slug] : [],
      names: [g.name],
    };
    const stage = pickStage(stages, hint);
    if (!stage) {
      stats.skipped += 1;
      stats.details.push(`SKIP ${g.name} — không map được cột`);
      continue;
    }

    const displayName = DISPLAY_NAME[g.name] || g.name;
    const existing = findExistingTemplate(templates, g, stage.id);
    const desc = `${MARKER} from global:${g.id}`;

    if (DRY) {
      stats.details.push(`${existing ? 'UPDATE' : 'CREATE'} «${displayName}» → ${stage.name} (${(g.items || []).length} items)`);
      if (existing) stats.updated += 1;
      else stats.created += 1;
      stats.items += (g.items || []).length;
      continue;
    }

    let tplId = existing?.id;
    if (existing) {
      const { error: upErr } = await supabase
        .from('crm_task_templates')
        .update({
          name: displayName,
          stage_slug: g.stage_slug || existing.stage_slug,
          pipeline_type: g.pipeline_type || existing.pipeline_type || 'both',
          is_default: true,
          is_active: true,
          order_index: g.order_index ?? existing.order_index ?? 0,
          description: desc,
        })
        .eq('id', existing.id);
      if (upErr) throw upErr;
      stats.updated += 1;

      // Xóa items cũ — giữ form khảo sát PD nếu title trùng
      const oldItems = existing.items || [];
      const formByTitle = new Map();
      for (const oi of oldItems) {
        if (oi.show_fill_form || oi.form_config) {
          formByTitle.set(fold(oi.title), {
            show_fill_form: oi.show_fill_form,
            form_config: oi.form_config,
          });
        }
      }
      if (oldItems.length) {
        const { error: delErr } = await supabase
          .from('crm_task_template_items')
          .delete()
          .eq('template_id', existing.id);
        if (delErr) throw delErr;
      }

      const rows = (g.items || []).map((it) => itemPayload(
        existing.id,
        it,
        companyId,
        formByTitle.get(fold(it.title)) || null,
      ));
      if (rows.length) {
        const { error: insErr } = await supabase.from('crm_task_template_items').insert(rows);
        if (insErr) throw insErr;
        stats.items += rows.length;
      }
      stats.details.push(`UPDATE «${displayName}» @ ${stage.name} → ${rows.length} items`);
    } else {
      const { data: created, error: cErr } = await supabase
        .from('crm_task_templates')
        .insert({
          name: displayName,
          stage_slug: g.stage_slug || null,
          pipeline_stage_id: stage.id,
          pipeline_type: g.pipeline_type || hint.pipeline_type || 'both',
          is_default: true,
          is_active: true,
          order_index: g.order_index ?? 0,
          description: desc,
        })
        .select('id')
        .single();
      if (cErr) throw cErr;
      tplId = created.id;
      stats.created += 1;
      const rows = (g.items || []).map((it) => itemPayload(tplId, it, companyId));
      if (rows.length) {
        const { error: insErr } = await supabase.from('crm_task_template_items').insert(rows);
        if (insErr) throw insErr;
        stats.items += rows.length;
      }
      stats.details.push(`CREATE «${displayName}» @ ${stage.name} → ${rows.length} items`);
    }
  }

  return stats;
}

async function main() {
  console.log(DRY ? '=== DRY RUN ===' : '=== APPLY ===');
  const globalTpls = await loadGlobalTemplates();
  console.log(`Global templates: ${globalTpls.length}`);
  for (const g of globalTpls) {
    console.log(`  - ${g.name} [${g.stage_slug || '—'} / ${g.pipeline_type}] items=${(g.items || []).length}`);
  }

  const syncResults = [];

  syncResults.push(await syncPipelineFromGlobal({
    label: 'Phúc Đạt',
    pipelineId: PD_PIPELINE,
    companyId: PD_COMPANY,
    globalTpls,
  }));

  for (const t of VPT_TARGETS) {
    syncResults.push(await syncPipelineFromGlobal({
      label: t.label,
      pipelineId: t.pipeline_id,
      companyId: VPT_COMPANY,
      globalTpls,
    }));
  }

  console.log('\n--- Sync summary ---');
  for (const s of syncResults) {
    console.log(`\n[${s.label}] created=${s.created} updated=${s.updated} skipped=${s.skipped} items=${s.items}`);
    s.details.forEach((d) => console.log(`  ${d}`));
  }

  if (DRY || !APPLY_LEADS) {
    console.log('\n(Skip apply-to-leads — chỉ cập nhật bộ mẫu; lead mới sẽ nhận khi tạo)');
    return;
  }

  console.log('\n--- Apply to leads/deals (chỉ bản ghi chưa có nhiệm vụ CRM) ---');
  const applyJobs = [
    {
      label: 'Phúc Đạt · Showroom',
      company_id: PD_COMPANY,
      pipeline_id: PD_PIPELINE,
      region_ids: [PD_SHOWROOM],
    },
    ...VPT_TARGETS.map((t) => ({
      label: t.label,
      company_id: VPT_COMPANY,
      pipeline_id: t.pipeline_id,
      region_ids: [t.region_id],
    })),
  ];

  for (const job of applyJobs) {
    for (const leadType of ['lead', 'deal']) {
      const r = await applyCrmTaskTemplatesToCompanyRegions({
        companyId: job.company_id,
        pipelineId: job.pipeline_id,
        leadType,
        regionIds: job.region_ids,
      });
      console.log(
        `[${job.label} / ${leadType}] scanned=${r.scanned} applied=${r.applied} tasks=${r.tasks_created}`
        + ` skipped_has=${r.skipped_has_tasks} skipped_pipe=${r.skipped_other_pipeline}`
        + ` errors=${r.errors?.length || 0}`,
      );
      if (r.errors?.length) {
        console.log('  errors sample:', r.errors.slice(0, 3));
      }
    }
  }

  console.log('\n✅ Xong');
}

main().catch((e) => {
  console.error('❌', e.message || e);
  process.exit(1);
});
