/**
 * Tạo deal/project test CRM + SX + VC/LD kèm task phiếu khảo sát (điền form).
 * Usage:
 *   node scripts/create-form-fill-test-deal.js
 *   node scripts/create-form-fill-test-deal.js --resume=<dealId>
 *
 * CRM Phúc Đạt → SX Hucabi → bàn giao VC Phúc Đạt.
 * Có task «Hình ảnh thực tế» với show_fill_form để nút «Thêm/Sửa phiếu khảo sát».
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { supabase } = require('../src/config/supabase');
const { autoCreateProjectFromWonDeal } = require('../src/helpers/autoDealWonProject');
const { ensureMissingCrmTasksForLead } = require('../src/helpers/autoGenCrmTasks');
const { performVcHandoverCore } = require('../src/helpers/vcHandoverCore');

const RESUME_DEAL_ID = (process.argv.find((a) => a.startsWith('--resume=')) || '').slice('--resume='.length) || null;

const CRM_COMPANY = '29677f68-967e-4256-92fd-492bb580e888'; // Phúc Đạt
const SX_COMPANY = '18c2563f-3495-498d-8199-23200c9f420e'; // Hucabi
const VC_COMPANY = CRM_COMPANY; // VC/LĐ Phúc Đạt
const PIPELINE = '6017bdcd-5683-4f81-9f84-4a5e7bc8d373';
const STAGE_SURVEYED = 'a6e13a64-121f-4f04-a12f-f6f96cca1516'; // Đã Khảo sát.
const STAGE_SIGNED = '448f4a0c-196d-46c2-82d9-88801db75094'; // Đã ký hợp đồng.
const STAGE_SX = '654738d6-568a-411c-9733-931b119bc844'; // Sản xuất.
const STAGE_VC = 'a6ae0fbf-1533-44f2-939c-87c2a72cc754'; // Vận chuyển/lắp đặt.
const SALE_USER = 'baf36251-a8ce-4622-9dfe-3a697b477bef'; // Trương Minh Đức
const SX_PERSON = 'baae8329-c0a0-4893-a858-f4918323d7da'; // Sang Thiết Kế VPT 1
const WTYPE = '8814095f-f5c7-411e-b83e-aa01a1d7718c';
const COL_VC_TRIGGER = 'eafcaf6b-7c1d-44b9-9944-7d7940d46d10'; // ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG
const WF_PRODUCTION = 'be72da83-5ddb-498f-a51d-327eb2641cc9';
const SURVEY_TEMPLATE_ITEM = 'cf4bf562-d4c0-4ad3-8b28-ed93ee8229a6'; // Hình ảnh thực tế + fill form

async function nextCode(prefix, table) {
  const year = new Date().getFullYear();
  const like = `${prefix}-${year}-%`;
  const { data } = await supabase.from(table).select('code').like('code', like).order('code', { ascending: false }).limit(40);
  let max = 0;
  for (const row of data || []) {
    const m = String(row.code || '').match(new RegExp(`^${prefix}-${year}-(\\d+)$`));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${year}-${String(max + 1).padStart(3, '0')}`;
}

function loadFormConfigFallback() {
  const jsonPath = path.join(__dirname, '_tmp_survey_form_config.json');
  if (!fs.existsSync(jsonPath)) return null;
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

async function resolveSurveyFormConfig() {
  const { data: tpl } = await supabase
    .from('crm_task_template_items')
    .select('id, title, show_fill_form, form_config, description, checklist, priority, estimated_hours')
    .eq('id', SURVEY_TEMPLATE_ITEM)
    .maybeSingle();
  if (tpl?.form_config && (tpl.show_fill_form === true || tpl.show_fill_form === 'true')) {
    return { source: 'template', ...tpl };
  }

  const { data: donor } = await supabase
    .from('crm_tasks')
    .select('title, show_fill_form, form_config, description, checklist, priority, estimated_hours')
    .eq('show_fill_form', true)
    .ilike('title', 'Hình ảnh thực tế')
    .not('form_config', 'is', null)
    .limit(1)
    .maybeSingle();
  if (donor?.form_config) {
    return { source: 'donor_task', title: donor.title, ...donor };
  }

  const fileCfg = loadFormConfigFallback();
  if (fileCfg) {
    return {
      source: 'file',
      title: 'Hình ảnh thực tế',
      show_fill_form: true,
      form_config: fileCfg,
      description: null,
      checklist: [],
      priority: 'medium',
      estimated_hours: null,
    };
  }
  throw new Error('Không tìm được form_config phiếu khảo sát (template / task / file)');
}

async function ensureSurveyFillFormTask(leadId, userId) {
  const { data: existing } = await supabase
    .from('crm_tasks')
    .select('id, title, show_fill_form, form_config')
    .eq('lead_id', leadId)
    .ilike('title', 'Hình ảnh thực tế')
    .limit(5);

  const withForm = (existing || []).find((t) => t.show_fill_form && t.form_config);
  if (withForm) {
    return { id: withForm.id, created: false, reused: true };
  }

  const tpl = await resolveSurveyFormConfig();
  const any = (existing || [])[0];
  if (any) {
    await supabase
      .from('crm_tasks')
      .update({
        show_fill_form: true,
        form_config: tpl.form_config,
        updated_at: new Date().toISOString(),
      })
      .eq('id', any.id);
    return { id: any.id, created: false, source: tpl.source };
  }

  const now = new Date().toISOString();
  const { data: inserted, error } = await supabase
    .from('crm_tasks')
    .insert({
      lead_id: leadId,
      title: tpl.title || 'Hình ảnh thực tế',
      description: tpl.description || null,
      status: 'todo',
      priority: tpl.priority || 'medium',
      checklist: tpl.checklist || [],
      estimated_hours: tpl.estimated_hours || null,
      show_fill_form: true,
      form_config: tpl.form_config,
      pipeline_stage_id: STAGE_SURVEYED,
      created_by: userId,
      assigned_to: userId,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: inserted.id, created: true, source: tpl.source };
}

async function main() {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const phone = `091${String(Date.now()).slice(-7)}`;
  const address = '99 Đường Test Form CRM-SX-VC, Quận 7, TP.HCM';
  const customerName = `TEST FORM CRM/SX/VC ${stamp}`;
  const dealTitle = `test form crm sx vc ${stamp}`;
  const dealValue = 52_000_000;
  const now = new Date().toISOString();
  const reqStub = { user: { userId: SALE_USER, role: 'admin', company_id: CRM_COMPANY } };

  let deal;
  let dealCode;

  if (RESUME_DEAL_ID) {
    console.log('0) Resume deal', RESUME_DEAL_ID, '…');
    const { data: existingDeal, error: rErr } = await supabase
      .from('crm_leads')
      .select('id, code, title, project_id, install_address, estimated_value')
      .eq('id', RESUME_DEAL_ID)
      .single();
    if (rErr) throw rErr;
    deal = existingDeal;
    dealCode = existingDeal.code;
  } else {
    console.log('1) Customer…');
    const { data: customer, error: cErr } = await supabase
      .from('customers')
      .insert({
        full_name: customerName,
        phone,
        address,
        company_id: CRM_COMPANY,
      })
      .select('id, full_name, phone')
      .single();
    if (cErr) throw cErr;

    dealCode = await nextCode('DEAL', 'crm_leads');
    console.log('2) Deal', dealCode, '…');
    const { data: createdDeal, error: dErr } = await supabase
      .from('crm_leads')
      .insert({
        code: dealCode,
        type: 'deal',
        title: dealTitle,
        customer_id: customer.id,
        company_id: CRM_COMPANY,
        pipeline_id: PIPELINE,
        stage_id: STAGE_SIGNED,
        estimated_value: dealValue,
        assigned_to: SALE_USER,
        lead_owner_id: SALE_USER,
        created_by: SALE_USER,
        install_address: address,
        description: 'Deal test điền form: phiếu KS CRM + project SX Hucabi + đã bàn giao VC Phúc Đạt.',
        stage_entered_at: now,
      })
      .select('id, code, title, project_id')
      .single();
    if (dErr) throw dErr;
    deal = createdDeal;

    console.log('3) Gen CRM tasks (all stages)…');
    const tasksResult = await ensureMissingCrmTasksForLead({
      leadId: deal.id,
      userId: SALE_USER,
      req: reqStub,
      allStages: true,
    });
    console.log('   tasks created:', tasksResult.created, 'skipped:', tasksResult.skipped);
  }

  console.log('4) Đảm bảo task phiếu khảo sát…');
  const surveyTask = await ensureSurveyFillFormTask(deal.id, SALE_USER);
  console.log('   survey task:', surveyTask);

  let projectId = deal.project_id || null;
  if (!projectId) {
    console.log('5) Tạo project SX Hucabi…');
    const sx = await autoCreateProjectFromWonDeal({
      req: reqStub,
      dealId: deal.id,
      userId: SALE_USER,
      productionCompanyId: SX_COMPANY,
      workshopTypeId: WTYPE,
    });
    if (!sx.ok) {
      console.error('SX fail:', sx);
      throw new Error(sx.error || 'Không tạo được project');
    }
    projectId = sx.project_id;
  } else {
    console.log('5) Project đã có:', projectId);
  }

  console.log('6) Đưa CRM → Sản xuất + project cột trigger VC…');
  const installAddr = deal.install_address || address;
  const value = deal.estimated_value || dealValue;
  await supabase
    .from('crm_leads')
    .update({
      stage_id: STAGE_SX,
      stage_entered_at: now,
      sx_handover_at: now,
      sx_pipeline_stage_id: COL_VC_TRIGGER,
      sx_template_company_id: SX_COMPANY,
      updated_at: now,
    })
    .eq('id', deal.id);

  await supabase
    .from('projects')
    .update({
      status: 'producing',
      current_stage_id: WF_PRODUCTION,
      sx_kanban_column_id: COL_VC_TRIGGER,
      workshop_type_id: WTYPE,
      production_person_id: SX_PERSON,
      estimated_value: value,
      install_address: installAddr,
      logistics_company_id: null,
      vc_kanban_column_id: null,
      vc_handover_status: null,
      updated_at: now,
    })
    .eq('id', projectId);

  console.log('7) Bàn giao VC/LĐ Phúc Đạt…');
  const vc = await performVcHandoverCore(reqStub, {
    projectId,
    logisticsCompanyId: VC_COMPANY,
    sxHandoverPipelineStageId: COL_VC_TRIGGER,
    actorUserId: SALE_USER,
  });

  await supabase
    .from('crm_leads')
    .update({
      stage_id: STAGE_VC,
      stage_entered_at: now,
      updated_at: now,
    })
    .eq('id', deal.id);

  const { data: project } = await supabase
    .from('projects')
    .select('id, code, name, status, sx_kanban_column_id, vc_kanban_column_id, logistics_company_id, company_id')
    .eq('id', projectId)
    .single();

  const { data: fillTasks } = await supabase
    .from('crm_tasks')
    .select('id, title, show_fill_form')
    .eq('lead_id', deal.id)
    .eq('show_fill_form', true);

  const { data: dealFresh } = await supabase
    .from('crm_leads')
    .select('id, code, title')
    .eq('id', deal.id)
    .single();

  const { data: vcCol } = await supabase
    .from('logistics_pipeline_stages')
    .select('id, name')
    .eq('id', project.vc_kanban_column_id)
    .maybeSingle();

  console.log('\n========== DEAL TEST FORM CRM / SX / VC ==========');
  console.log(
    JSON.stringify(
      {
        deal: {
          id: dealFresh.id,
          code: dealFresh.code,
          title: dealFresh.title,
          crm_company: 'Phúc Đạt',
          crm_stage: 'Vận chuyển/lắp đặt.',
        },
        project: {
          id: project.id,
          code: project.code,
          name: project.name,
          status: project.status,
          sx_company: 'Hucabi',
          vc_company: 'Phúc Đạt',
          vc_column: vcCol?.name || null,
          vc_handover: vc,
        },
        survey_fill_tasks: fillTasks || [],
        sale: 'Trương Minh Đức',
        links: {
          crm: `/crm/leads/${deal.id}`,
          sx: `/sx/projects/${project.id}`,
          vc: '/vc',
        },
        how_to_test: [
          '1. CRM: mở ' + `/crm/leads/${deal.id}` + ' → nút «Thêm/Sửa phiếu khảo sát» trên header → điền form',
          '2. SX Hucabi: /sx/projects/' + project.id + ' (đã ở cột bàn giao VC)',
          '3. VC Phúc Đạt: /vc tìm thẻ «' + dealFresh.title + '» cột «' + (vcCol?.name || 'Nhận hàng') + '»',
          '4. Comment bàn giao VC trên deal: chọn lịch / xác nhận VC-LĐ nếu cần test form chọn ngày',
        ],
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
