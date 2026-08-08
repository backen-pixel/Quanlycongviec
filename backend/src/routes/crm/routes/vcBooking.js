/**
 * CRM route: đặt vận chuyển (VC booking) khi sale kéo deal sang cột «Vận chuyển».
 * Yêu cầu: deal đã có project SX, đang ở stage sync_role='sx_completed'
 * (do SX kéo project qua cột is_packaging_done=true).
 *
 * Body: { logistics_company_id, delivery_team_id, installation_team_id,
 *         pickup_at, pickup_notes?, target_stage_id }
 */
const { Router } = require('express');
const { supabase } = require('../../../config/supabase');
const { requirePermission } = require('../../../middleware/newPermission');
const { notifyVcHandoverFromSx } = require('../../../helpers/vcHandoverNotify');
const { getCrmStageByRole } = require('../../../helpers/workshopKanban');
const { logDealActivityComment } = require('../../../helpers/projectFileActivity');
const { applyAllActiveWorkshopTemplatesForArea } = require('../../../helpers/workshopApplyTemplates');

const r = Router();

function badReq(res, msg) {
  return res.status(400).json({ error: msg });
}

r.patch('/leads/:id/vc-booking', requirePermission('leads', 'edit'), async (req, res) => {
  try {
    const leadId = String(req.params.id || '').trim();
    const userId = req.user?.userId || null;
    const b = req.body || {};

    const logisticsCompanyId = b.logistics_company_id || null;
    const deliveryTeamId = b.delivery_team_id || null;
    const installationTeamId = b.installation_team_id || null;
    const pickupAtRaw = b.pickup_at || null;
    const pickupNotes = (b.pickup_notes || '').toString().trim() || null;
    const targetStageId = b.target_stage_id || null;

    if (!logisticsCompanyId) return badReq(res, 'Vui lòng chọn công ty lắp đặt.');
    if (!deliveryTeamId) return badReq(res, 'Vui lòng chọn đội vận chuyển.');
    if (!installationTeamId) return badReq(res, 'Vui lòng chọn đội lắp đặt.');
    if (!pickupAtRaw) return badReq(res, 'Vui lòng chọn thời gian đi lấy hàng.');
    const pickupAt = new Date(pickupAtRaw);
    if (Number.isNaN(pickupAt.getTime())) return badReq(res, 'Thời gian đi lấy không hợp lệ.');

    // 1. Load deal + project + validate.
    const { data: lead, error: leadErr } = await supabase
      .from('crm_leads')
      .select('id, code, title, type, project_id, stage_id, pipeline_id, assigned_to, lead_owner_id, company_id, stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, sync_role)')
      .eq('id', leadId)
      .maybeSingle();
    if (leadErr) throw leadErr;
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy deal.' });
    if (lead.type !== 'deal') return badReq(res, 'Chỉ áp dụng cho deal.');
    if (!lead.project_id) return badReq(res, 'Deal chưa có dự án sản xuất.');

    const stageRole = String(lead.stage?.sync_role || '').trim();
    if (stageRole !== 'sx_completed') {
      return badReq(res, 'Chỉ đặt VC khi deal đang ở cột «Đã sản xuất» (xưởng đã đóng gói xong).');
    }

    // 2. Validate company + teams.
    const { data: lco } = await supabase
      .from('companies')
      .select('id, is_active')
      .eq('id', logisticsCompanyId)
      .maybeSingle();
    if (!lco) return badReq(res, 'Công ty lắp đặt không tồn tại.');
    if (lco.is_active === false) return badReq(res, 'Công ty lắp đặt đã ngưng hoạt động.');

    const { data: delTeam } = await supabase
      .from('workshop_teams')
      .select('id, type, is_active, company_id, name')
      .eq('id', deliveryTeamId)
      .maybeSingle();
    if (!delTeam || String(delTeam.type) !== 'delivery') return badReq(res, 'Đội vận chuyển không hợp lệ.');
    if (delTeam.is_active === false) return badReq(res, 'Đội vận chuyển đã ngưng hoạt động.');
    if (delTeam.company_id && String(delTeam.company_id) !== String(logisticsCompanyId)) {
      return badReq(res, 'Đội vận chuyển không thuộc công ty đã chọn.');
    }

    const { data: insTeam } = await supabase
      .from('workshop_teams')
      .select('id, type, is_active, company_id, name')
      .eq('id', installationTeamId)
      .maybeSingle();
    if (!insTeam || String(insTeam.type) !== 'installation') return badReq(res, 'Đội lắp đặt không hợp lệ.');
    if (insTeam.is_active === false) return badReq(res, 'Đội lắp đặt đã ngưng hoạt động.');
    if (insTeam.company_id && String(insTeam.company_id) !== String(logisticsCompanyId)) {
      return badReq(res, 'Đội lắp đặt không thuộc công ty đã chọn.');
    }

    // 3. Xác định CRM stage đích (mặc định = cột có sync_role='vc_delivery').
    let vcCrmStageId = targetStageId;
    if (!vcCrmStageId) {
      vcCrmStageId = await getCrmStageByRole('vc_delivery', lead.pipeline_id || null);
    }
    if (!vcCrmStageId) return badReq(res, 'Chưa cấu hình cột CRM «Vận chuyển» (sync_role=vc_delivery).');

    // Validate target stage tồn tại và thuộc pipeline của deal (nếu client gửi).
    if (targetStageId) {
      const { data: tgt } = await supabase
        .from('crm_pipeline_stages')
        .select('id, pipeline_id, sync_role, name')
        .eq('id', targetStageId)
        .maybeSingle();
      if (!tgt) return badReq(res, 'Giai đoạn đích không tồn tại.');
      if (lead.pipeline_id && tgt.pipeline_id && String(tgt.pipeline_id) !== String(lead.pipeline_id)) {
        return badReq(res, 'Giai đoạn đích không thuộc pipeline của deal.');
      }
    }

    // 4. Tìm cột VC intake theo công ty (bucket_slug='delivery_pending', fallback pipeline global).
    let vcIntakeStageId = null;
    try {
      const { data: intakeByCo } = await supabase
        .from('logistics_pipeline_stages')
        .select('id')
        .eq('bucket_slug', 'delivery_pending')
        .eq('is_active', true)
        .eq('company_id', logisticsCompanyId)
        .order('order_index')
        .limit(1)
        .maybeSingle();
      vcIntakeStageId = intakeByCo?.id || null;
      if (!vcIntakeStageId) {
        const { data: firstByCo } = await supabase
          .from('logistics_pipeline_stages')
          .select('id')
          .eq('is_active', true)
          .eq('company_id', logisticsCompanyId)
          .order('order_index')
          .limit(1)
          .maybeSingle();
        vcIntakeStageId = firstByCo?.id || null;
      }
      if (!vcIntakeStageId) {
        const { data: intakeGlobal } = await supabase
          .from('logistics_pipeline_stages')
          .select('id')
          .eq('bucket_slug', 'delivery_pending')
          .eq('is_active', true)
          .is('company_id', null)
          .order('order_index')
          .limit(1)
          .maybeSingle();
        vcIntakeStageId = intakeGlobal?.id || null;
      }
    } catch (e) {
      console.warn('[crm/vc-booking] lookup VC intake:', e.message);
    }

    // 5. Update project: pickup + teams + company + status shipping + vc_kanban_column_id.
    const projectUpdate = {
      logistics_company_id: logisticsCompanyId,
      delivery_team_id: deliveryTeamId,
      installation_team_id: installationTeamId,
      pickup_at: pickupAt.toISOString(),
      pickup_notes: pickupNotes,
      status: 'shipping',
    };
    if (vcIntakeStageId) projectUpdate.vc_kanban_column_id = vcIntakeStageId;

    let projectErr = null;
    ({ error: projectErr } = await supabase.from('projects').update(projectUpdate).eq('id', lead.project_id));
    if (projectErr && String(projectErr.message || '').includes('vc_kanban_column_id')) {
      const retry = { ...projectUpdate };
      delete retry.vc_kanban_column_id;
      ({ error: projectErr } = await supabase.from('projects').update(retry).eq('id', lead.project_id));
    }
    if (projectErr) throw projectErr;

    // 6. Update CRM deal(s) trong cùng project: stage + vc_pipeline_stage_id.
    try {
      const { data: siblingLeads } = await supabase
        .from('crm_leads')
        .select('id')
        .eq('project_id', lead.project_id)
        .eq('type', 'deal');
      for (const sib of siblingLeads || []) {
        const upd = { stage_id: vcCrmStageId, updated_at: new Date().toISOString() };
        if (vcIntakeStageId) upd.vc_pipeline_stage_id = vcIntakeStageId;
        const { error: e1 } = await supabase.from('crm_leads').update(upd).eq('id', sib.id);
        if (e1 && String(e1.message || '').includes('vc_pipeline_stage_id')) {
          await supabase.from('crm_leads')
            .update({ stage_id: vcCrmStageId, updated_at: new Date().toISOString() })
            .eq('id', sib.id);
        }
      }
    } catch (e) {
      console.warn('[crm/vc-booking] update leads:', e.message);
    }

    // 7. Ghi stage_transitions cho project.
    try {
      await supabase.from('stage_transitions').insert({
        project_id: lead.project_id,
        from_stage_id: null,
        to_stage_id: null,
        notes: `[VC booking từ CRM] pickup ${pickupAt.toISOString()} · VC ${delTeam.name || ''} · LĐ ${insTeam.name || ''}`,
        transitioned_by: userId,
      });
    } catch (e) { console.warn('[crm/vc-booking] stage_transitions:', e.message); }

    // 8. Gen nhiệm vụ VC theo template (idempotent).
    try {
      await applyAllActiveWorkshopTemplatesForArea(lead.project_id, userId, {
        workshopArea: 'logistics',
        companyId: logisticsCompanyId,
      });
    } catch (e) {
      console.warn('[crm/vc-booking] gen logistics templates:', e.message);
    }

    // 9. Format pickup thời gian VN cho comment.
    const pickupVn = pickupAt.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit', minute: '2-digit',
      day: '2-digit', month: '2-digit', year: 'numeric',
    });

    // 10. Comment tự động vào deal.
    try {
      const body = [
        `🚚 Đặt vận chuyển: đội «${delTeam.name || deliveryTeamId}»`,
        `· Lắp đặt: «${insTeam.name || installationTeamId}»`,
        `· Đi lấy: ${pickupVn}`,
        pickupNotes ? `· Ghi chú: ${pickupNotes}` : '',
      ].filter(Boolean).join(' ');
      await logDealActivityComment(req, { leadId: lead.id, body });
    } catch (e) {
      console.warn('[crm/vc-booking] comment:', e.message);
    }

    // 11. Notify VC (đội VC + LĐ + manager).
    try {
      const { data: proj } = await supabase
        .from('projects').select('code, name').eq('id', lead.project_id).maybeSingle();
      await notifyVcHandoverFromSx(req, {
        projectId: lead.project_id,
        projectCode: proj?.code || lead.code || null,
        projectName: proj?.name || lead.title || null,
        logisticsCompanyId,
        actorUserId: userId,
        manual: true,
      });
    } catch (e) {
      console.warn('[crm/vc-booking] notify:', e.message);
    }

    return res.json({
      ok: true,
      lead_id: lead.id,
      project_id: lead.project_id,
      stage_id: vcCrmStageId,
      pickup_at: pickupAt.toISOString(),
      logistics_company_id: logisticsCompanyId,
      delivery_team_id: deliveryTeamId,
      installation_team_id: installationTeamId,
    });
  } catch (e) {
    console.error('[crm/vc-booking]', e);
    return res.status(500).json({ error: e.message || 'Lỗi đặt vận chuyển.' });
  }
});

module.exports = r;
