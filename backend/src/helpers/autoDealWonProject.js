const { supabase } = require('../config/supabase');
const { generateStepTasks } = require('./generateFlowTasks');
const { notifyMultiple } = require('./notifications');
const { syncCrmLeadSxPipelineFromProject } = require('./workshopKanban');
const { applyDefaultWorkshopTemplatesForNewProject } = require('./workshopApplyTemplates');
const { isPostgresUniqueViolation, nextTbProjectCode } = require('./projectCode');
const { validateProductionCompanyId } = require('./productionCompanyGate');
const { ensureDealLeadDocumentsForModuleTransition } = require('./ensureDealLeadDocumentsForModuleTransition');
const { applyProductionTemplateToFulfillmentLead } = require('./projectOrderFulfillment');
const { postSxTransferMentionComment } = require('./dealCommentNotifications');
const { subtractCalendarDays, parseDateOnlyParts } = require('./projectDeliveryDates');
const { flowAllowsProductionCreate } = require('./resolveModuleFlow');

/**
 * Chuẩn hóa ngày từ body / opts → patch projects.
 * Quy định:
 * - install_date = deadline VC/LĐ (ngày giờ lắp đặt)
 * - production_finish_date + production_deadline = deadline tổng dự án SX (hoàn thiện = lắp − 2)
 * - delivery_date giữ ngày lắp (YYYY-MM-DD) để tương thích lịch/CRM cũ
 */
function resolveProjectDatesFromOpts(projectDates) {
  const raw = projectDates?.install_date
    ?? projectDates?.delivery_date
    ?? projectDates?.production_deadline
    ?? null;
  if (raw == null || raw === '') return null;
  if (!parseDateOnlyParts(raw)) return null;
  const installYmd = String(raw).trim().slice(0, 10);
  const finish = projectDates?.production_finish_date != null && projectDates.production_finish_date !== ''
    ? String(projectDates.production_finish_date).trim().slice(0, 10)
    : subtractCalendarDays(installYmd, 2);
  // Giữ giờ nếu client gửi ISO; mặc định 14:00 VN cho deadline lắp đặt VC/LĐ.
  const installRaw = projectDates?.install_date != null && String(projectDates.install_date).trim() !== ''
    ? String(projectDates.install_date).trim()
    : null;
  const installDate = installRaw && /T\d{2}:\d{2}/.test(installRaw)
    ? installRaw
    : `${installYmd}T14:00:00+07:00`;
  const sxDeadline = finish || null;
  return {
    delivery_date: installYmd,
    production_deadline: sxDeadline,
    production_finish_date: sxDeadline,
    install_date: installDate,
  };
}

/** Ưu tiên ngày trên từng target xưởng; fallback body chung. Kèm setup VC/LĐ nếu có. */
function resolveProjectDatesForTarget(target, fallbackProjectDates = null) {
  let dates = null;
  if (target?.install_date || target?.delivery_date || target?.production_deadline) {
    dates = resolveProjectDatesFromOpts({
      install_date: target.install_date || null,
      delivery_date: target.delivery_date || target.production_deadline,
      production_deadline: target.production_deadline || target.delivery_date,
      production_finish_date: target.production_finish_date || null,
    });
  } else {
    dates = resolveProjectDatesFromOpts(fallbackProjectDates);
  }

  const logisticsCompanyId = target?.logistics_company_id
    || fallbackProjectDates?.logistics_company_id
    || null;
  let pickupAt = target?.pickup_at ?? fallbackProjectDates?.pickup_at ?? null;
  if (pickupAt != null && String(pickupAt).trim() !== '') {
    const d = new Date(String(pickupAt).trim());
    pickupAt = Number.isNaN(d.getTime()) ? null : d.toISOString();
  } else {
    pickupAt = null;
  }

  const vcPatch = {};
  if (logisticsCompanyId) vcPatch.logistics_company_id = String(logisticsCompanyId);
  if (pickupAt) vcPatch.pickup_at = pickupAt;

  const vcNotesRaw = target?.vc_notes ?? fallbackProjectDates?.vc_notes ?? null;
  const vcNotes = vcNotesRaw != null ? String(vcNotesRaw).trim() : '';
  if (vcNotes) vcPatch.vc_notes = vcNotes;

  const occRaw = target?.install_occurrence_dates || fallbackProjectDates?.install_occurrence_dates;
  const occ = Array.isArray(occRaw)
    ? [...new Set(occRaw.map((d) => String(d || '').slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort()
    : [];
  if (occ.length) vcPatch.install_occurrence_dates = occ;

  if (!dates && !Object.keys(vcPatch).length) return null;
  return { ...(dates || {}), ...vcPatch };
}

function normalizeProductionTargets(targets, legacyCompanyId, legacyWorkshopTypeId) {
  const raw = Array.isArray(targets) && targets.length
    ? targets
    : (legacyCompanyId ? [{ production_company_id: legacyCompanyId, workshop_type_id: legacyWorkshopTypeId || null }] : []);
  const seen = new Set();
  const out = [];
  for (const t of raw) {
    const cid = t?.production_company_id || t?.company_id || null;
    if (!cid) continue;
    const wtid = t?.workshop_type_id || null;
    const key = `${String(cid)}::${wtid ? String(wtid) : ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const datePatch = resolveProjectDatesForTarget(t, null);
    out.push({
      production_company_id: String(cid),
      workshop_type_id: wtid ? String(wtid) : null,
      logistics_company_id: t?.logistics_company_id ? String(t.logistics_company_id) : null,
      pickup_at: t?.pickup_at || null,
      vc_notes: t?.vc_notes ? String(t.vc_notes).trim() || null : null,
      ...(datePatch || {}),
    });
  }
  return out;
}

async function linkDealToProject({
  dealId,
  projectId,
  isPrimary = false,
  label = null,
  createdBy = null,
}) {
  const row = {
    deal_id: dealId,
    project_id: projectId,
    is_primary: !!isPrimary,
    label: label || null,
    created_by: createdBy || null,
  };
  const { error } = await supabase
    .from('crm_deal_projects')
    .upsert(row, { onConflict: 'deal_id,project_id' });
  if (error) {
    console.warn('[crm_deal_projects] upsert:', error.message);
  }
}

/**
 * Danh sách dự án SX gắn deal (junction + fallback project_id).
 */
async function listDealProductionProjects(dealId) {
  if (!dealId) return [];
  const projectDateCols = 'install_date, delivery_date, pickup_at, production_finish_date, logistics_company_id, vc_notes';
  const projectEmbed = `
        id, code, name, status, company_id, workshop_type_id, ${projectDateCols},
        company:companies!projects_company_id_fkey(id, name, short_name),
        logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name),
        workshop_type:workshop_project_types!projects_workshop_type_id_fkey(id, name)
  `;
  const mapRow = (l, p) => {
    const co = p.company || {};
    const lc = p.logistics_company || {};
    const wt = p.workshop_type || {};
    return {
      link_id: l?.id || null,
      project_id: (l?.project_id) || p.id,
      code: p.code || null,
      name: p.name || null,
      status: p.status || null,
      company_id: p.company_id || co.id || null,
      company_name: co.short_name || co.name || null,
      workshop_type_id: p.workshop_type_id || wt.id || null,
      workshop_type_name: wt.name || null,
      is_primary: l ? !!l.is_primary : true,
      label: l?.label || null,
      created_at: l?.created_at || null,
      install_date: p.install_date || null,
      delivery_date: p.delivery_date || null,
      pickup_at: p.pickup_at || null,
      production_finish_date: p.production_finish_date || null,
      logistics_company_id: p.logistics_company_id || lc.id || null,
      logistics_company_name: lc.short_name || lc.name || null,
      vc_notes: p.vc_notes || null,
    };
  };

  const { data: links, error } = await supabase
    .from('crm_deal_projects')
    .select(`
      id, deal_id, project_id, is_primary, label, created_at,
      project:projects!crm_deal_projects_project_id_fkey(${projectEmbed})
    `)
    .eq('deal_id', dealId)
    .order('created_at', { ascending: true });

  let rows = [];
  if (!error && links?.length) {
    rows = links.map((l) => mapRow(l, l.project || {})).filter((x) => x.project_id);
  } else {
    const { data: lead } = await supabase
      .from('crm_leads')
      .select(`
        project_id,
        project:projects!crm_leads_project_id_fkey(${projectEmbed})
      `)
      .eq('id', dealId)
      .maybeSingle();
    if (!lead?.project_id) return [];
    rows = [mapRow(null, lead.project || {})].filter((x) => x.project_id);
  }

  // Bổ sung tên CT VC/LĐ từ sự kiện lắp/lấy hàng khi projects.logistics_company_id trống
  const needFill = rows.filter((r) => r.project_id && !r.logistics_company_id);
  if (needFill.length) {
    const pids = needFill.map((r) => r.project_id);
    try {
      const { data: evs } = await supabase
        .from('crm_events')
        .select('project_id, company_id, event_type, company:companies!crm_events_company_id_fkey(id, name, short_name)')
        .in('project_id', pids)
        .in('event_type', ['installation', 'pickup', 'delivery'])
        .order('created_at', { ascending: false });
      const byProject = new Map();
      for (const e of evs || []) {
        const pid = String(e.project_id || '');
        if (!pid || !e.company_id || byProject.has(pid)) continue;
        const co = e.company || {};
        byProject.set(pid, {
          id: String(e.company_id),
          name: co.short_name || co.name || null,
        });
      }
      rows = rows.map((r) => {
        if (r.logistics_company_id) return r;
        const hit = byProject.get(String(r.project_id));
        if (!hit) return r;
        return {
          ...r,
          logistics_company_id: hit.id,
          logistics_company_name: hit.name,
        };
      });
    } catch (fillErr) {
      console.warn('[listDealProductionProjects] fill logistics from events:', fillErr.message);
    }
  }

  return rows;
}

/**
 * Gắn production_projects (lite) lên danh sách lead/deal — batch theo deal ids.
 */
async function attachProductionProjectsForList(rows) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  const dealIds = [...new Set(rows.map((r) => r?.id).filter(Boolean).map(String))];
  if (!dealIds.length) return rows;
  const byDeal = new Map();
  try {
    for (let i = 0; i < dealIds.length; i += 200) {
      const chunk = dealIds.slice(i, i + 200);
      let links = null;
      let error = null;
      // Ưu tiên kèm cột Kanban SX từng project (multi-xưởng → nhiều badge CRM)
      const selWithSxCol = `
          deal_id, project_id, is_primary, label,
          project:projects!crm_deal_projects_project_id_fkey(
            id, code, name, status, company_id, workshop_type_id, sx_kanban_column_id,
            company:companies!projects_company_id_fkey(id, name, short_name),
            workshop_type:workshop_project_types!projects_workshop_type_id_fkey(id, name),
            sx_kanban_column:production_pipeline_stages!projects_sx_kanban_column_id_fkey(
              id, name, color, icon, bucket_slug, company_id,
              company:companies(id, name, short_name)
            )
          )
        `;
      const selLite = `
          deal_id, project_id, is_primary, label,
          project:projects!crm_deal_projects_project_id_fkey(
            id, code, name, status, company_id, workshop_type_id, sx_kanban_column_id,
            company:companies!projects_company_id_fkey(id, name, short_name),
            workshop_type:workshop_project_types!projects_workshop_type_id_fkey(id, name)
          )
        `;
      ({ data: links, error } = await supabase
        .from('crm_deal_projects')
        .select(selWithSxCol)
        .in('deal_id', chunk));
      if (error) {
        ({ data: links, error } = await supabase
          .from('crm_deal_projects')
          .select(selLite)
          .in('deal_id', chunk));
      }
      if (error) {
        console.warn('[attachProductionProjectsForList]', error.message);
        break;
      }
      for (const l of links || []) {
        const did = String(l.deal_id);
        const p = l.project || {};
        const co = p.company || {};
        const wt = p.workshop_type || {};
        const colRaw = p.sx_kanban_column;
        const col = Array.isArray(colRaw) ? colRaw[0] : colRaw;
        const colCo = col?.company || {};
        const item = {
          project_id: l.project_id || p.id,
          code: p.code || null,
          name: p.name || null,
          status: p.status || null,
          company_id: p.company_id || co.id || null,
          company_name: String(co.short_name || co.name || '').trim() || null,
          workshop_type_id: p.workshop_type_id || wt.id || null,
          workshop_type_name: wt.name || null,
          is_primary: !!l.is_primary,
          label: l.label || null,
          sx_pipeline_stage: col?.id ? {
            id: col.id,
            name: col.name || null,
            color: col.color || null,
            icon: col.icon || null,
            bucket_slug: col.bucket_slug || null,
            company: (colCo.id || col.company_id)
              ? {
                id: colCo.id || col.company_id,
                name: colCo.name || null,
                short_name: colCo.short_name || null,
              }
              : null,
          } : null,
          _sx_col_id: p.sx_kanban_column_id || null,
        };
        if (!byDeal.has(did)) byDeal.set(did, []);
        byDeal.get(did).push(item);
      }
    }
  } catch (e) {
    console.warn('[attachProductionProjectsForList]', e.message);
  }

  // Bổ sung stage SX theo sx_kanban_column_id nếu embed cột lỗi / thiếu
  try {
    const needColIds = [];
    for (const list of byDeal.values()) {
      for (const pp of list) {
        if (!pp.sx_pipeline_stage?.id && pp._sx_col_id) needColIds.push(String(pp._sx_col_id));
      }
    }
    const uniq = [...new Set(needColIds)];
    if (uniq.length) {
      const colMap = new Map();
      for (let i = 0; i < uniq.length; i += 200) {
        const chunk = uniq.slice(i, i + 200);
        const { data: cols } = await supabase
          .from('production_pipeline_stages')
          .select('id, name, color, icon, bucket_slug, company_id, company:companies(id, name, short_name)')
          .in('id', chunk);
        for (const c of cols || []) {
          const co = c.company || {};
          colMap.set(String(c.id), {
            id: c.id,
            name: c.name || null,
            color: c.color || null,
            icon: c.icon || null,
            bucket_slug: c.bucket_slug || null,
            company: (co.id || c.company_id)
              ? { id: co.id || c.company_id, name: co.name || null, short_name: co.short_name || null }
              : null,
          });
        }
      }
      for (const list of byDeal.values()) {
        for (const pp of list) {
          if (!pp.sx_pipeline_stage?.id && pp._sx_col_id) {
            pp.sx_pipeline_stage = colMap.get(String(pp._sx_col_id)) || null;
          }
          delete pp._sx_col_id;
        }
      }
    } else {
      for (const list of byDeal.values()) {
        for (const pp of list) delete pp._sx_col_id;
      }
    }
  } catch (e) {
    console.warn('[attachProductionProjectsForList] sx cols:', e.message);
  }

  return rows.map((r) => {
    const id = String(r.id);
    let pps = byDeal.get(id);
    if (!pps?.length && r.project_id) {
      pps = [{
        project_id: r.project_id,
        code: r.linked_project?.code || null,
        name: r.linked_project?.name || null,
        is_primary: true,
        company_id: null,
        company_name: null,
        sx_pipeline_stage: r.sx_pipeline_stage || null,
      }];
    }
    return {
      ...r,
      production_projects: pps || [],
      production_project_count: (pps || []).length || (r.project_id ? 1 : 0),
    };
  });
}

function mapOneProjectResult(one, t) {
  return {
    project_id: one.project_id,
    project_code: one.project_code,
    project_name: one.project_name,
    tasks_created: one.tasks_created,
    is_primary: !!one.is_primary,
    company_id: t.production_company_id,
    workshop_type_id: t.workshop_type_id,
  };
}

function buildPartialMultiResult(results, primaryProjectId, normalized, failOne, failTarget) {
  const coLabel = failTarget?.production_company_id || 'xưởng';
  const partialMsg = `Đã tạo ${results.length}/${normalized.length} dự án SX. `
    + `Dòng còn lại lỗi: ${failOne.error || 'không tạo được'} (${coLabel}). `
    + 'Có thể dùng «+ Thêm dự án SX» để tạo tiếp.';
  const first = results[0];
  return {
    ok: true,
    project_id: primaryProjectId || first?.project_id,
    project_code: first?.project_code,
    project_name: first?.project_name,
    tasks_created: results.reduce((s, r) => s + (r.tasks_created || 0), 0),
    projects: results,
    primary_project_id: primaryProjectId || first?.project_id,
    partial: true,
    partial_error: partialMsg,
    warning: partialMsg,
  };
}

/**
 * Template/docs/notify/order sync — không chặn response sau khi đã có project + NV.
 */
function scheduleAutoProjectBackground(ctx) {
  setImmediate(() => {
    void (async () => {
      const {
        req,
        dealId,
        projectId,
        userId,
        companyId,
        companyLabel,
        projectCode,
        projectName,
        dealTitle,
        becomePrimary,
        flowTaskCount,
        skipOrderSync,
        notifyStaffIds,
        mentionStaffIds,
      } = ctx;

      await Promise.all([
        (async () => {
          try {
            await ensureDealLeadDocumentsForModuleTransition({ leadId: dealId, projectId });
          } catch (e) {
            console.warn('[auto-project/bg] ensure lead_documents:', e.message);
          }
        })(),
        (async () => {
          if (skipOrderSync) return;
          try {
            const { syncExistingCrmOrdersToProject } = require('./projectOrderFulfillment');
            await syncExistingCrmOrdersToProject({
              projectId,
              userId,
              parentLeadId: dealId,
            });
          } catch (e) {
            console.warn('[auto-project/bg] sync CRM orders:', e.message);
          }
        })(),
        (async () => {
          try {
            await applyProductionTemplateToFulfillmentLead({
              req,
              leadId: dealId,
              createdBy: userId,
              assigneeId: null,
              force: true,
              requireTemplateCompanyMatch: true,
              templateSourceCompanyId: companyId,
            });
          } catch (e) {
            console.warn('[auto-project/bg] applyProductionTemplate:', e.message);
          }
        })(),
      ]);

      let workshopTemplateTaskCount = 0;
      try {
        workshopTemplateTaskCount = await applyDefaultWorkshopTemplatesForNewProject(projectId, userId);
        if (workshopTemplateTaskCount) {
          console.log(`[auto-project/bg] Workshop templates → ${workshopTemplateTaskCount} tasks`);
        }
      } catch (e) {
        console.warn('[auto-project/bg] workshop templates:', e.message);
      }

      await Promise.all([
        (async () => {
          try {
            const { data: dealDocs } = await supabase.from('lead_documents')
              .select('*').eq('lead_id', dealId);
            if (!dealDocs?.length) return;
            const docFiles = dealDocs.filter((d) => d.file_url).map((d) => ({
              file_url: d.file_url, file_name: d.file_name || d.name,
              file_size: d.file_size, mime_type: d.mime_type,
              description: `Từ Deal: ${d.name || d.file_name}`,
            }));
            if (docFiles.length) {
              await supabase.from('projects').update({ quotation_files: docFiles }).eq('id', projectId);
            }
          } catch (e) {
            console.error('[auto-project/bg] Copy docs:', e.message);
          }
        })(),
        (async () => {
          try {
            const totalTasks = (flowTaskCount || 0) + workshopTemplateTaskCount;
            await supabase.from('crm_activities').insert({
              lead_id: dealId, type: 'note',
              title: becomePrimary ? '📋 Dự án tự động tạo' : '📋 Thêm dự án SX',
              description: `Dự án ${projectCode} (${companyLabel || 'SX'}) — ${totalTasks} nhiệm vụ`
                + `${workshopTemplateTaskCount ? ` (gồm ${workshopTemplateTaskCount} từ bộ mẫu xưởng)` : ''}`,
              created_by: userId,
            });
          } catch (_) { /* ignore */ }
        })(),
      ]);

      if (!req) return;

      try {
        const { getCompanyScopedAdminIds } = require('./notifications');
        const adminIds = (await getCompanyScopedAdminIds(companyId))
          .filter((id) => id !== userId);
        if (adminIds.length) {
          await notifyMultiple(req, adminIds, 'project_created',
            '📋 Dự án mới từ Deal',
            `Dự án ${projectCode} — "${projectName}" (${(flowTaskCount || 0) + workshopTemplateTaskCount} nhiệm vụ)`,
            'project', projectId, {
              ecosystem_module_key: 'production',
              project_id: String(projectId),
              project_code: projectCode,
              project_name: projectName,
              company_id: companyId || null,
            });
        }
      } catch (e) {
        console.warn('[auto-project/bg] admin notify:', e.message);
      }

      const staffToNotify = (notifyStaffIds || []).filter((sid) => String(sid) !== String(userId));
      if (staffToNotify.length) {
        try {
          await notifyMultiple(req, staffToNotify, 'project_assigned',
            '📋 Dự án SX mới',
            `Bạn được gán vào dự án ${projectCode} — "${projectName}"`,
            'project', projectId, {
              ecosystem_module_key: 'production',
              project_id: String(projectId),
              project_code: projectCode,
              project_name: projectName,
              company_id: companyId || null,
            });
        } catch (e) {
          console.warn('[auto-project/bg] staff notify:', e.message);
        }
      }

      if ((mentionStaffIds || []).length) {
        try {
          await postSxTransferMentionComment(req, notifyMultiple, {
            dealId,
            projectId,
            senderId: userId,
            mentionUserIds: mentionStaffIds,
            projectCode,
            dealTitle,
            workshopLabel: companyLabel || '',
            mode: becomePrimary ? 'transfer' : 'additional',
          });
        } catch (mentionErr) {
          console.warn('[auto-project/bg] sx transfer mention:', mentionErr.message);
        }
      }

      try {
        const { notifyWorkshopIntakeNewDeal, emitProductionBoardRealtime } = require('./workshopIntakeNotify');
        await notifyWorkshopIntakeNewDeal({
          req,
          projectId,
          projectCode,
          projectName,
          dealTitle,
          actorUserId: userId,
        });
        const io = req.app?.get('io');
        await emitProductionBoardRealtime(projectId, io, becomePrimary ? 'auto_create' : 'auto_create_additional');
      } catch (intakeNotifyErr) {
        console.warn('[auto-project/bg] intake notify/socket:', intakeNotifyErr.message);
      }
    })().catch((e) => console.error('[auto-project/bg] fatal:', e.message));
  });
}

/**
 * Tạo một hoặc nhiều dự án xưởng từ deal.
 */
async function autoCreateProjectFromWonDeal({
  req,
  dealId,
  userId,
  productionCompanyId,
  workshopTypeId = null,
  targets = null,
  mode = 'create',
  projectDates = null,
  flowId: requestedFlowId = null,
}) {
  try {
    const normalized = normalizeProductionTargets(targets, productionCompanyId, workshopTypeId);
    if (!normalized.length) {
      return { ok: false, error: 'Vui lòng chọn công ty Sản xuất', statusCode: 400 };
    }
    if (normalized.length === 1 && mode !== 'additional') {
      return await runAutoCreateProjectFromWonDeal({
        req,
        dealId,
        userId,
        productionCompanyId: normalized[0].production_company_id,
        workshopTypeId: normalized[0].workshop_type_id,
        mode: 'create',
        nameSuffix: null,
        isMultiBatch: false,
        projectDates: resolveProjectDatesForTarget(normalized[0], projectDates),
        flowId: requestedFlowId,
      });
    }

    const results = [];
    let primaryProjectId = null;
    const isAllAdditional = mode === 'additional';

    const runOne = (t, createMode, isFirst) => runAutoCreateProjectFromWonDeal({
      req,
      dealId,
      userId,
      productionCompanyId: t.production_company_id,
      workshopTypeId: t.workshop_type_id,
      mode: createMode,
      nameSuffix: true,
      isMultiBatch: true,
      skipCrmTaskImport: createMode === 'additional',
      skipOrderSync: createMode === 'additional',
      projectDates: resolveProjectDatesForTarget(t, projectDates),
      flowId: requestedFlowId,
    });

    const pushOk = (one, t, isFirst) => {
      results.push(mapOneProjectResult(one, t));
      if (one.is_primary) primaryProjectId = one.project_id;
      else if (!primaryProjectId && isFirst && !isAllAdditional) {
        primaryProjectId = one.project_id;
      }
    };

    if (isAllAdditional) {
      const settled = await Promise.all(
        normalized.map((t) => runOne(t, 'additional', false).then((one) => ({ t, one }))),
      );
      for (const { t, one } of settled) {
        if (!one.ok) {
          if (results.length) {
            try {
              const { ensureLeadMembersFromProjectStaff } = require('./productionWorkshopTypeStaff');
              await ensureLeadMembersFromProjectStaff(dealId);
            } catch (_) { /* ignore */ }
            return buildPartialMultiResult(results, primaryProjectId, normalized, one, t);
          }
          return one;
        }
        pushOk(one, t, false);
      }
    } else {
      const firstTarget = normalized[0];
      const first = await runOne(firstTarget, 'create', true);
      if (!first.ok) return first;
      pushOk(first, firstTarget, true);

      if (normalized.length > 1) {
        const rest = await Promise.all(
          normalized.slice(1).map((t) => runOne(t, 'additional', false).then((one) => ({ t, one }))),
        );
        for (const { t, one } of rest) {
          if (!one.ok) {
            try {
              const { ensureLeadMembersFromProjectStaff } = require('./productionWorkshopTypeStaff');
              await ensureLeadMembersFromProjectStaff(dealId);
            } catch (_) { /* ignore */ }
            return buildPartialMultiResult(results, primaryProjectId, normalized, one, t);
          }
          pushOk(one, t, false);
        }
      }
    }

    // Đảm bảo tab Thành viên nhận NV mặc định từ MỌI xưởng vừa chọn (primary + additional).
    try {
      const { ensureLeadMembersFromProjectStaff } = require('./productionWorkshopTypeStaff');
      await ensureLeadMembersFromProjectStaff(dealId);
    } catch (syncErr) {
      console.warn('[auto-project] sync members multi-target:', syncErr.message);
    }

    const first = results[0];
    return {
      ok: true,
      project_id: primaryProjectId || first?.project_id,
      project_code: first?.project_code,
      project_name: first?.project_name,
      tasks_created: results.reduce((s, r) => s + (r.tasks_created || 0), 0),
      projects: results,
      primary_project_id: primaryProjectId || first?.project_id,
      background_pending: true,
    };
  } catch (e) {
    console.error('[auto-project] Error:', e.message);
    return { ok: false, error: e.message || 'Lỗi tạo dự án', statusCode: 500 };
  }
}

async function runAutoCreateProjectFromWonDeal({
  req,
  dealId,
  userId,
  productionCompanyId,
  workshopTypeId = null,
  mode = 'create',
  nameSuffix = null,
  isMultiBatch = false,
  skipCrmTaskImport = false,
  skipOrderSync = false,
  projectDates = null,
  flowId: requestedFlowId = null,
}) {
  const coCheck = await validateProductionCompanyId(productionCompanyId);
  if (!coCheck.ok) {
    return { ok: false, error: coCheck.error, statusCode: 400 };
  }

  const [
    wtRes,
    dealRes,
    configRes,
    firstStageRes,
    existing,
    defaultFlowRes,
  ] = await Promise.all([
    workshopTypeId
      ? supabase
        .from('workshop_project_types')
        .select('id, name, company_id, applies_to, is_active')
        .eq('id', workshopTypeId)
        .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('crm_leads')
      .select('*, customer:customers(id, full_name, phone, email, address)')
      .eq('id', dealId).single(),
    supabase.from('auto_project_config').select('*').limit(1).maybeSingle(),
    supabase.from('workflow_stages').select('id').eq('slug', 'consulting').maybeSingle(),
    listDealProductionProjects(dealId).catch((e) => {
      console.warn('[auto-project] dup check:', e.message);
      return [];
    }),
    // Giữ query để tương thích DB cũ; UI không còn «mặc định» — ưu tiên flow_id từ client / config
    supabase.from('workflow_flows')
      .select('id').eq('is_default', true).eq('is_active', true).limit(1).maybeSingle(),
  ]);

  let validatedWorkshopTypeId = null;
  let workshopTypeName = null;
  const wt = wtRes?.data;
  if (workshopTypeId) {
    if (
      wt
      && String(wt.company_id) === String(coCheck.company.id)
      && (wt.applies_to === 'production' || wt.applies_to === 'both')
      && wt.is_active !== false
    ) {
      validatedWorkshopTypeId = wt.id;
      workshopTypeName = wt.name || null;
    } else {
      console.warn('[auto-project] workshop_type_id không hợp lệ — bỏ qua, project sẽ chưa phân loại');
    }
  }

  const deal = dealRes?.data;
  if (!deal) return { ok: false, error: 'Deal không tồn tại', statusCode: 404 };

  const isAdditional = mode === 'additional';
  if (isAdditional) {
    if (!deal.project_id) {
      return { ok: false, error: 'Deal chưa có dự án — hãy tạo dự án trước', statusCode: 400 };
    }
  } else if (deal.project_id) {
    return { ok: false, error: 'Deal đã có dự án', statusCode: 400, existing_project_id: deal.project_id };
  }

  const dup = (existing || []).find((p) =>
    String(p.company_id || '') === String(coCheck.company.id)
    && String(p.workshop_type_id || '') === String(validatedWorkshopTypeId || ''));
  if (dup) {
    return {
      ok: false,
      error: `Deal đã có dự án tại ${dup.company_name || 'công ty này'}${dup.workshop_type_name ? ` · ${dup.workshop_type_name}` : ''}`,
      statusCode: 400,
      existing_project_id: dup.project_id,
    };
  }

  const config = configRes?.data || null;
  if (requestedFlowId) {
    const { data: pickedFlow } = await supabase.from('workflow_flows')
      .select('id, is_active').eq('id', requestedFlowId).maybeSingle();
    if (!pickedFlow) {
      return { ok: false, error: 'Luồng quy trình đã chọn không tồn tại', statusCode: 400 };
    }
    if (pickedFlow.is_active === false) {
      return { ok: false, error: 'Luồng quy trình đã chọn đang tắt. Hãy chọn luồng khác hoặc bật lại trong Setup luồng.', statusCode: 400 };
    }
  }
  let flowId = requestedFlowId || config?.flow_id || defaultFlowRes?.data?.id || null;
  if (!flowId) {
    const { data: anyFlow } = await supabase.from('workflow_flows')
      .select('id').eq('is_active', true).order('created_at').limit(1).maybeSingle();
    flowId = anyFlow?.id || null;
  }
  if (!flowId) {
    return { ok: false, error: 'Chưa có luồng quy trình nào. Vui lòng tạo luồng trước.', statusCode: 400 };
  }

  try {
    const allowsSx = await flowAllowsProductionCreate(flowId);
    if (!allowsSx) {
      return {
        ok: false,
        error: 'Luồng đã chọn không có bước Sản xuất sau CRM. Vào Setup luồng (Dự án và công việc) để thêm node Sản xuất.',
        statusCode: 400,
      };
    }
  } catch (flowGateErr) {
    console.warn('[auto-project] flowAllowsProductionCreate:', flowGateErr.message);
  }

  const firstStage = firstStageRes?.data || null;

  const suffixLabel = workshopTypeName
    || coCheck.company.short_name
    || coCheck.company.name
    || null;
  const useSuffix = nameSuffix === true || (isMultiBatch && suffixLabel);
  const projectName = useSuffix && suffixLabel
    ? `${deal.title || 'Dự án mới'} · ${suffixLabel}`
    : (deal.title || 'Dự án mới');

  const yr = new Date().getFullYear();
  const datePatch = resolveProjectDatesFromOpts(projectDates);
  const vcSetupPatch = {};
  if (projectDates?.logistics_company_id) {
    vcSetupPatch.logistics_company_id = String(projectDates.logistics_company_id);
  }
  if (projectDates?.pickup_at) {
    const d = new Date(String(projectDates.pickup_at).trim());
    if (!Number.isNaN(d.getTime())) vcSetupPatch.pickup_at = d.toISOString();
  }
  if (projectDates?.vc_notes != null && String(projectDates.vc_notes).trim() !== '') {
    vcSetupPatch.vc_notes = String(projectDates.vc_notes).trim();
  }
  let sxReceptionDate = null;
  try {
    const { resolveSxReceptionDateForCompany } = require('./sxWorkshopSchedule');
    sxReceptionDate = await resolveSxReceptionDateForCompany(coCheck.company.id, Date.now());
  } catch (recvErr) {
    console.warn('[auto-project] sx_reception_date:', recvErr.message);
  }
  const baseRow = (code) => ({
    code,
    name: projectName,
    description: deal.description || null,
    customer_id: deal.customer_id,
    company_id: coCheck.company.id,
    flow_id: flowId,
    status: 'consulting',
    current_stage_id: null,
    install_address: deal.install_address || deal.customer?.address || null,
    estimated_value: deal.estimated_value || null,
    production_value: null,
    deposit_amount: Number(deal.deposit_amount) > 0 ? Number(deal.deposit_amount) : null,
    created_from_sx: false,
    priority: config?.default_priority || 'medium',
    sales_person_id: deal.assigned_to || deal.lead_owner_id || userId,
    consult_date: new Date().toISOString(),
    ...(validatedWorkshopTypeId ? { workshop_type_id: validatedWorkshopTypeId } : {}),
    ...(datePatch || {}),
    ...vcSetupPatch,
    ...(sxReceptionDate ? { sx_reception_date: sxReceptionDate } : {}),
  });

  let project;
  let lastInsertErr;
  let omitCreatedFromSx = false;
  let omitVcNotes = false;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const code = await nextTbProjectCode(supabase, yr);
    const row = baseRow(code);
    if (omitCreatedFromSx) delete row.created_from_sx;
    if (omitVcNotes) delete row.vc_notes;
    const { data, error: projErr } = await supabase
      .from('projects')
      .insert(row)
      .select('*')
      .single();
    if (!projErr) {
      project = data;
      break;
    }
    lastInsertErr = projErr;
    if (String(projErr.message || '').includes('created_from_sx') && !omitCreatedFromSx) {
      omitCreatedFromSx = true;
      continue;
    }
    if (/vc_notes/i.test(String(projErr.message || '')) && !omitVcNotes) {
      omitVcNotes = true;
      continue;
    }
    if (/production_finish_date/i.test(String(projErr.message || '')) && row.production_finish_date !== undefined) {
      delete row.production_finish_date;
      const { data: data2, error: err2 } = await supabase.from('projects').insert(row).select('*').single();
      if (!err2) {
        project = data2;
        break;
      }
      lastInsertErr = err2;
    }
    if (/sx_reception_date/i.test(String(projErr.message || '')) && row.sx_reception_date !== undefined) {
      delete row.sx_reception_date;
      continue;
    }
    if (isPostgresUniqueViolation(projErr)) continue;
    throw projErr;
  }
  if (!project) throw lastInsertErr || new Error('Không tạo dự án: trùng mã code');

  const projectId = project.id;
  const becomePrimary = !isAdditional && !deal.project_id;

  // Gán cột Kanban SX đầu tiên của xưởng (đặc biệt quan trọng với project phụ multi-SX —
  // nếu null + status consulting sẽ bị lọc khỏi board nếu không nằm trong wonIds).
  try {
    const { getResolvedKanbanStages, firstSxPipelineColumnId } = require('./workshopKanban');
    const wkt = validatedWorkshopTypeId || 'none';
    const { stages } = await getResolvedKanbanStages(String(coCheck.company.id), { workshopTypeId: wkt });
    const firstCol = firstSxPipelineColumnId(stages);
    if (firstCol && !String(firstCol).startsWith('__fb_')) {
      const { error: colErr } = await supabase
        .from('projects')
        .update({ sx_kanban_column_id: firstCol, updated_at: new Date().toISOString() })
        .eq('id', projectId);
      if (colErr) console.warn('[auto-project] set sx_kanban_column_id:', colErr.message);
      else project.sx_kanban_column_id = firstCol;
    }
  } catch (colAssignErr) {
    console.warn('[auto-project] assign kanban column:', colAssignErr.message);
  }

  const [hopRes, flowStepsRes] = await Promise.all([
    supabase
      .from('production_handover_settings')
      .select('default_production_team_id')
      .eq('production_company_id', coCheck.company.id)
      .maybeSingle(),
    supabase.from('workflow_flow_steps')
      .select('id, order_index, division_unit_id, company_unit_id, template_set_id, module_key')
      .eq('flow_id', flowId).order('order_index'),
  ]);

  let flowSteps = flowStepsRes?.data || [];
  if (flowStepsRes?.error && /module_key|schema cache|Could not find/i.test(flowStepsRes.error.message || '')) {
    const fb = await supabase.from('workflow_flow_steps')
      .select('id, order_index, division_unit_id, company_unit_id, template_set_id')
      .eq('flow_id', flowId).order('order_index');
    flowSteps = fb?.data || [];
  }

  if (hopRes?.data?.default_production_team_id) {
    try {
      await supabase.from('projects').update({
        production_workshop_team_id: hopRes.data.default_production_team_id,
        updated_at: new Date().toISOString(),
      }).eq('id', projectId);
    } catch (he) {
      console.warn('[auto-project] production_handover team:', he.message);
    }
  }

  // Nếu select module_key lỗi schema — getFlowSteps đã có fallback; ở đây chỉ dùng steps thô
  let allCreatedTasks = [];

  // Ưu tiên bước CRM (module_key) làm order 0; fallback order_index === 0
  const kdStep = flowSteps.find((s) => String(s.module_key || '').toLowerCase() === 'crm')
    || flowSteps.find((s) => s.order_index === 0);
  if (kdStep) {
    const kdAssignPromise = kdStep.division_unit_id
      ? supabase.from('project_company_assignments').upsert({
        project_id: projectId,
        division_unit_id: kdStep.division_unit_id,
        company_unit_id: kdStep.company_unit_id,
        template_set_id: kdStep.template_set_id,
        order_index: 0, status: 'done',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      }, { onConflict: 'project_id,division_unit_id' })
      : Promise.resolve();

    let importPromise = Promise.resolve();
    if (!skipCrmTaskImport) {
      importPromise = (async () => {
        try {
          const { data: crmTasks } = await supabase.from('crm_tasks')
            .select('*').eq('lead_id', dealId).order('order_index');
          if (!crmTasks?.length) return;
          const completedAt = new Date().toISOString();
          const rows = crmTasks.map((ct, i) => ({
            project_id: projectId, stage_id: firstStage?.id || null,
            title: ct.title,
            description:
              [ct.description, ct.notes].filter((x) => x && String(x).trim()).join('\n\n') || null,
            assignee_id: ct.assignee_id || null, priority: ct.priority || 'medium',
            status: 'done', completed_at: completedAt,
            order_index: i, created_by_id: userId, task_type: 'project',
            metadata: { crm_task_id: ct.id, imported_from: 'crm_deal', deal_id: dealId },
          }));
          const { data: inserted } = await supabase.from('tasks').insert(rows).select('*');
          if (inserted?.length) allCreatedTasks.push(...inserted);
        } catch (e) { console.error('[auto-project] Import CRM tasks:', e.message); }
      })();
    }

    await Promise.all([kdAssignPromise, importPromise]);
  }

  const generatedBySteps = await Promise.all(
    flowSteps
      .filter((s) => {
        const mk = String(s.module_key || '').toLowerCase();
        if (mk === 'crm') return false;
        if (kdStep && s.id === kdStep.id) return false;
        return (s.order_index ?? 0) > (kdStep?.order_index ?? 0) || mk === 'production' || mk === 'logistics';
      })
      .map(async (step) => {
        if (step.division_unit_id) {
          await supabase.from('project_company_assignments').upsert({
            project_id: projectId,
            division_unit_id: step.division_unit_id,
            company_unit_id: step.company_unit_id,
            template_set_id: step.template_set_id,
            order_index: step.order_index,
            status: step.order_index === 1 ? 'in_progress' : 'pending',
            started_at: step.order_index === 1 ? new Date().toISOString() : null,
          }, { onConflict: 'project_id,division_unit_id' });
        }

        const stepTasks = await generateStepTasks({
          projectId, flowStepId: step.id,
          templateSetId: step.template_set_id || null,
          userId,
        });
        return stepTasks || [];
      }),
  );
  allCreatedTasks.push(...generatedBySteps.flat());

  if (becomePrimary) {
    const { error: upErr } = await supabase
      .from('crm_leads')
      .update({ project_id: projectId, updated_at: new Date().toISOString() })
      .eq('id', dealId);
    if (upErr) {
      throw new Error(`[auto-project] Không cập nhật được project_id lên deal: ${upErr.message || 'unknown error'}`);
    }
  }

  await Promise.all([
    linkDealToProject({
      dealId,
      projectId,
      isPrimary: becomePrimary,
      label: suffixLabel,
      createdBy: userId,
    }),
    syncCrmLeadSxPipelineFromProject(projectId).catch((e) => {
      console.warn('[auto-project] sync sx_pipeline_stage_id:', e.message);
    }),
  ]);

  // Bust wonIds cache — project phụ consulting cần vào scope board/detail ngay
  try {
    const { invalidateWonDealProjectIdsCache } = require('./workshopKanban');
    invalidateWonDealProjectIdsCache();
  } catch {
    /* ignore */
  }

  let notifyStaff = [];
  let mentionStaffIds = [];
  try {
    const {
      applyWorkshopTypeDefaultStaffToProject,
      loadProjectProductionStaffUserIds,
      loadProjectIdsForDeal,
    } = require('./productionWorkshopTypeStaff');
    const primaryStaffId = await applyWorkshopTypeDefaultStaffToProject(
      projectId,
      coCheck.company.id,
      validatedWorkshopTypeId,
    );
    const staffIds = await loadProjectProductionStaffUserIds(projectId);
    notifyStaff = staffIds.length ? staffIds : (primaryStaffId ? [primaryStaffId] : []);
    mentionStaffIds = [...notifyStaff];
    if (!becomePrimary) {
      try {
        const otherProjectIds = (await loadProjectIdsForDeal(dealId))
          .map(String)
          .filter((pid) => pid !== String(projectId));
        const merged = new Set(mentionStaffIds.map(String));
        const otherStaffLists = await Promise.all(
          otherProjectIds.map((pid) => loadProjectProductionStaffUserIds(pid)),
        );
        for (const list of otherStaffLists) {
          for (const uid of list) merged.add(String(uid));
        }
        mentionStaffIds = [...merged];
      } catch (mergeErr) {
        console.warn('[auto-project] merge existing sx staff for additional:', mergeErr.message);
      }
    }
  } catch (staffErr) {
    console.warn('[auto-project] production default staff:', staffErr.message);
    if (becomePrimary) {
      try {
        const { pruneNonResponsibleCrmLeadMembersForDeal } = require('./productionWorkshopTypeStaff');
        await pruneNonResponsibleCrmLeadMembersForDeal(dealId);
      } catch (pruneErr) {
        console.warn('[auto-project] prune CRM members:', pruneErr.message);
      }
    }
  }

  // Đồng bộ tab Thành viên từ roster xưởng (primary + additional đơn lẻ).
  // Multi-batch: wrapper gọi một lần sau khi tạo xong mọi dự án.
  if (!isMultiBatch) {
    try {
      const { ensureLeadMembersFromProjectStaff } = require('./productionWorkshopTypeStaff');
      await ensureLeadMembersFromProjectStaff(dealId);
    } catch (syncErr) {
      console.warn('[auto-project] ensure lead members:', syncErr.message);
    }
  }

  // Tạo sự kiện dự kiến: Lắp đặt / lấy hàng / hoàn thiện SX
  const plannedInstall = project.install_date || datePatch?.install_date || null;
  const plannedPickup = project.pickup_at || vcSetupPatch.pickup_at || null;
  const plannedFinish = project.production_finish_date || datePatch?.production_finish_date || null;
  let resolvedLogisticsId = project.logistics_company_id
    || vcSetupPatch.logistics_company_id
    || null;
  if (resolvedLogisticsId && !project.logistics_company_id) {
    try {
      const { error: logCoErr } = await supabase
        .from('projects')
        .update({
          logistics_company_id: String(resolvedLogisticsId),
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId);
      if (!logCoErr) project.logistics_company_id = String(resolvedLogisticsId);
      else console.warn('[auto-project] set logistics_company_id:', logCoErr.message);
    } catch (logCoEx) {
      console.warn('[auto-project] set logistics_company_id:', logCoEx.message);
    }
  }
  // Chỉ thêm NV chịu trách nhiệm VC/LĐ vào deal (không thêm cả công ty)
  if (resolvedLogisticsId) {
    try {
      const { afterVcCompanySelected } = require('./vcHandoverDealMembers');
      const { mergeDealLeadMembers } = require('./productionWorkshopTypeStaff');
      await afterVcCompanySelected({
        sourceLeadId: dealId,
        logisticsCompanyId: String(resolvedLogisticsId),
        projectId,
        actorUserId: userId,
        assertShippingStatus: false,
        addMembersFn: async (leadId, userIds) => {
          if (!leadId || !userIds?.length) return [];
          await mergeDealLeadMembers({ dealId: leadId, userIds });
          return userIds;
        },
      });
    } catch (memErr) {
      console.warn('[auto-project] VC responsible members:', memErr.message);
    }
    // Đặt sẵn dự án vào cột «lắp đặt tạm» của công ty VC (nếu admin đã tích cột này)
    try {
      const { stageProjectAtVcTempColumn } = require('./vcTempInstallStaging');
      const staged = await stageProjectAtVcTempColumn(req, {
        projectId,
        logisticsCompanyId: String(resolvedLogisticsId),
      });
      if (staged.staged && staged.vc_kanban_column_id) {
        project.vc_kanban_column_id = staged.vc_kanban_column_id;
        project.vc_temp_staged = true;
      }
    } catch (stgErr) {
      console.warn('[auto-project] VC temp staging:', stgErr.message);
    }
  }
  if (plannedInstall || plannedPickup || plannedFinish) {
    try {
      const { upsertPlannedVcLdEvents } = require('./createPlannedVcLdEvents');
      const evRes = await upsertPlannedVcLdEvents({
        projectId,
        leadId: dealId,
        userId,
        companyId: deal.company_id || coCheck.company.id,
        logisticsCompanyId: resolvedLogisticsId || null,
        customerId: deal.customer_id || null,
        projectCode: project.code,
        projectName: project.name,
        installAddress: project.install_address || deal.install_address || null,
        installAt: plannedInstall,
        pickupAt: plannedPickup,
        productionFinishAt: plannedFinish,
        installOccurrenceDates: datePatch?.install_occurrence_dates
          || projectDates?.install_occurrence_dates
          || null,
        vcNotes: project.vc_notes || vcSetupPatch.vc_notes || null,
      });
      if (!evRes.ok && !evRes.skipped) {
        console.warn('[auto-project] planned VC/LĐ events:', evRes.error);
      }
    } catch (evErr) {
      console.warn('[auto-project] planned VC/LĐ events:', evErr.message);
    }

    // Báo cho NV chịu trách nhiệm VC/LĐ biết trước ngày lắp / lấy hàng + ghi chú
    if (resolvedLogisticsId) {
      try {
        const { notifyVcPlanToLogisticsStaff } = require('./vcPlanNotify');
        await notifyVcPlanToLogisticsStaff(req, {
          projectId,
          leadId: dealId,
          logisticsCompanyId: String(resolvedLogisticsId),
          projectCode: project.code,
          projectName: project.name,
          pickupAt: plannedPickup,
          installAt: plannedInstall,
          installOccurrenceDates: datePatch?.install_occurrence_dates
            || projectDates?.install_occurrence_dates
            || null,
          vcNotes: project.vc_notes || vcSetupPatch.vc_notes || null,
          installAddress: project.install_address || deal.install_address || null,
          actorUserId: userId,
          tempStaged: Boolean(project.vc_temp_staged),
        });
      } catch (notifyErr) {
        console.warn('[auto-project] notify VC plan:', notifyErr.message);
      }
    }
  }

  const companyLabel = suffixLabel || coCheck.company.short_name || coCheck.company.name || '';
  scheduleAutoProjectBackground({
    req,
    dealId,
    projectId,
    userId,
    companyId: coCheck.company.id,
    companyLabel,
    projectCode: project.code,
    projectName: project.name,
    dealTitle: deal.title,
    becomePrimary,
    flowTaskCount: allCreatedTasks.length,
    skipOrderSync,
    notifyStaffIds: notifyStaff,
    mentionStaffIds,
  });

  console.log(`[auto-project] Deal ${dealId} → Project ${project.code} (${allCreatedTasks.length} flow tasks, bg pending)${becomePrimary ? '' : ' [additional]'}`);

  return {
    ok: true,
    project_id: projectId,
    project_code: project.code,
    project_name: project.name,
    tasks_created: allCreatedTasks.length,
    is_primary: becomePrimary,
    background_pending: true,
  };
}

module.exports = {
  autoCreateProjectFromWonDeal,
  listDealProductionProjects,
  attachProductionProjectsForList,
  linkDealToProject,
  normalizeProductionTargets,
};
