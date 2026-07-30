/**
 * Chuyển Lead/Deal CRM sang công ty/khu vực khác (admin-like).
 * - Cùng công ty: đổi khu vực + người phụ trách (giống transfer-region cũ).
 * - Khác công ty: sao chép khách hàng, remap pipeline/stage, cập nhật báo giá;
 *   chặn nếu đã có đơn hàng/hóa đơn.
 */
const { supabase } = require('../config/supabase');
const { isAdminLike } = require('./adminRole');
const { companyInTenantContext, intersectCompanyIdsWithTenant } = require('./tenantScope');
const { listCrmModuleCompanyIds } = require('./crmModuleCompanies');
const {
  assertRegionBelongsToCompany,
  assertUserCanAssignCrmRegion,
} = require('./crmRegionScope');
const { getRestrictedDivisionIdsForModule } = require('./ecosystemModuleScope');
const {
  getPipelineIdForCompanyRegion,
  getStagesByPipelineId,
  getCompanyRegionsList,
} = require('./crmTaxonomyCache');
const { ensureDefaultCrmPipelineForCompany } = require('./ensureDefaultCrmPipeline');

const CUSTOMER_COPY_FIELDS = [
  'full_name', 'phone', 'email', 'address', 'district', 'city', 'notes',
  'source', 'company', 'tax_code', 'gender', 'birthday', 'zalo_id', 'facebook_id', 'tags',
];

function canCrossCompanyTransfer(user) {
  return isAdminLike(user);
}

function canListOtherCrmCompanies(user) {
  // Theo yêu cầu: mọi admin-like được chọn công ty CRM khác trong modal chuyển.
  return isAdminLike(user);
}

async function assertTargetCompanyAllowed(req, companyId) {
  if (!companyId) return { ok: false, error: 'Thiếu công ty đích.' };
  if (!companyInTenantContext(req, companyId)) {
    return { ok: false, error: 'Công ty đích ngoài phạm vi hệ sinh thái.' };
  }
  const crmIds = await listCrmModuleCompanyIds();
  if (crmIds.length && !crmIds.map(String).includes(String(companyId))) {
    return { ok: false, error: 'Công ty đích không thuộc module CRM.' };
  }
  const { data: co } = await supabase
    .from('companies')
    .select('id, name, short_name, is_active')
    .eq('id', companyId)
    .maybeSingle();
  if (!co) return { ok: false, error: 'Công ty đích không tồn tại.' };
  if (co.is_active === false) return { ok: false, error: 'Công ty đích đã ngưng hoạt động.' };
  return { ok: true, company: co };
}

async function countCommercialBlockers(leadId) {
  const [{ count: orderCount, error: oErr }, { count: invCount, error: iErr }] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('lead_id', leadId),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('lead_id', leadId),
  ]);
  if (oErr) throw oErr;
  if (iErr) throw iErr;
  return {
    orders: orderCount || 0,
    invoices: invCount || 0,
    blocked: (orderCount || 0) > 0 || (invCount || 0) > 0,
  };
}

async function assertCrmAssigneeInRegion(sb, assigneeUserId, companyId, regionId) {
  if (!assigneeUserId) return { ok: false, error: 'Vui lòng chọn nhân viên phụ trách.' };
  const { data: u, error } = await sb.from('users').select('id, company_id, role').eq('id', assigneeUserId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!u) return { ok: false, error: 'Nhân viên không tồn tại.' };
  if (!companyId) return { ok: false, error: 'Lead/Deal chưa có công ty — chọn công ty trước khi gán người phụ trách.' };
  // Admin hệ thống (không gắn company_id) được phụ trách mọi lead/deal
  if (u.company_id && String(u.company_id).trim() !== String(companyId).trim()) {
    return { ok: false, error: 'Người phụ trách phải thuộc công ty của lead/deal.' };
  }
  const { data: ur } = await sb
    .from('user_company_regions')
    .select('region_id')
    .eq('user_id', assigneeUserId)
    .eq('region_id', regionId)
    .maybeSingle();
  if (!ur) {
    return { ok: false, error: 'Nhân viên được chọn không thuộc khu vực mới.' };
  }
  return { ok: true };
}

async function copyOrReuseCustomerForCompany(sb, customerId, targetCompanyId) {
  if (!customerId) return { customerId: null, copied: false };
  const { data: src, error } = await sb.from('customers').select('*').eq('id', customerId).maybeSingle();
  if (error) throw error;
  if (!src) return { customerId: null, copied: false };
  if (String(src.company_id || '') === String(targetCompanyId)) {
    return { customerId: src.id, copied: false };
  }

  const phone = src.phone ? String(src.phone).trim() : '';
  if (phone) {
    const { data: existing } = await sb
      .from('customers')
      .select('id')
      .eq('company_id', targetCompanyId)
      .eq('phone', phone)
      .limit(1)
      .maybeSingle();
    if (existing?.id) return { customerId: existing.id, copied: false, reused: true };
  }

  const row = { company_id: targetCompanyId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  for (const f of CUSTOMER_COPY_FIELDS) {
    if (src[f] !== undefined) row[f] = src[f];
  }
  const { data: inserted, error: insErr } = await sb.from('customers').insert(row).select('id').single();
  if (insErr) throw insErr;
  return { customerId: inserted.id, copied: true };
}

async function mapTaxonomyToCompany(sb, table, oldId, targetCompanyId) {
  if (!oldId) return null;
  const { data: old } = await sb.from(table).select('id, name, company_id').eq('id', oldId).maybeSingle();
  if (!old) return null;
  if (String(old.company_id || '') === String(targetCompanyId)) return old.id;
  const name = String(old.name || '').trim();
  if (!name) return null;
  const { data: hit } = await sb
    .from(table)
    .select('id')
    .eq('company_id', targetCompanyId)
    .ilike('name', name)
    .limit(1)
    .maybeSingle();
  return hit?.id || null;
}

async function resolveTargetPipelineAndStage({ companyId, regionId, leadType, currentStageId }) {
  let pipelineId = await getPipelineIdForCompanyRegion(companyId, regionId);
  if (!pipelineId) pipelineId = await ensureDefaultCrmPipelineForCompany(companyId);
  if (!pipelineId) {
    return { ok: false, error: 'Công ty đích chưa có pipeline CRM.' };
  }
  const pipelineType = leadType === 'deal' ? 'deal' : 'lead';
  const newStages = await getStagesByPipelineId(pipelineId, { type: pipelineType, activeOnly: true });
  if (!newStages.length) {
    return { ok: false, error: 'Pipeline đích chưa có cột phù hợp.' };
  }

  let currentStage = null;
  if (currentStageId) {
    const { data: st } = await supabase
      .from('crm_pipeline_stages')
      .select('id, canonical_slug, order_index, pipeline_type, is_won, is_lost')
      .eq('id', currentStageId)
      .maybeSingle();
    currentStage = st || null;
  }

  let mapped = null;
  const curSlug = currentStage?.canonical_slug ? String(currentStage.canonical_slug) : '';
  if (curSlug) {
    mapped = newStages.find((s) => String(s.canonical_slug || '') === curSlug) || null;
  }
  if (!mapped && currentStage && currentStage.order_index != null) {
    const curOrder = Number(currentStage.order_index);
    let best = null;
    let bestDiff = Infinity;
    for (const s of newStages) {
      const diff = Math.abs(Number(s.order_index) - curOrder);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = s;
      }
    }
    mapped = best;
  }
  if (!mapped) mapped = newStages[0];

  return {
    ok: true,
    pipelineId,
    stageId: mapped.id,
    stageChanged: String(mapped.id) !== String(currentStageId || ''),
  };
}

/**
 * @returns {Promise<{companies: object[]}>}
 */
async function listTransferTargetCompanies(req) {
  let ids = await listCrmModuleCompanyIds();
  ids = intersectCompanyIdsWithTenant(req, ids);
  if (!canListOtherCrmCompanies(req.user) && req.user?.company_id) {
    ids = ids.filter((id) => String(id) === String(req.user.company_id));
  }
  if (!ids.length && req.user?.company_id) {
    ids = [String(req.user.company_id)];
  }
  if (!ids.length) return { companies: [] };
  const { data, error } = await supabase
    .from('companies')
    .select('id, name, short_name, is_active')
    .in('id', ids)
    .or('is_active.eq.true,is_active.is.null')
    .order('name');
  if (error) throw error;
  return { companies: data || [] };
}

/**
 * Options cho modal chuyển: công ty + khu vực CRM + nhân viên theo công ty đích.
 */
async function getTransferOptions(req, { companyId } = {}) {
  const { companies } = await listTransferTargetCompanies(req);
  const targetId = companyId ? String(companyId) : '';
  if (!targetId) {
    return { companies, regions: [], users: [], departments: [] };
  }
  if (!companies.some((c) => String(c.id) === targetId)) {
    return { ok: false, error: 'Công ty không nằm trong danh sách được phép.', companies, regions: [], users: [], departments: [] };
  }

  let moduleDivIds = null;
  try {
    const restricted = await getRestrictedDivisionIdsForModule('crm');
    if (restricted && restricted.size > 0) moduleDivIds = [...restricted];
  } catch { /* ignore */ }

  let regions = await getCompanyRegionsList({ allowedIds: [targetId], moduleDivIds });
  regions = (regions || []).filter((r) => r.is_active !== false);

  // NV có thể thuộc công ty theo users.company_id, phòng ban, user_companies
  // hoặc được gán trực tiếp vào một khu vực của công ty.
  // Không chỉ lọc users.company_id vì dữ liệu legacy Phúc Đạt có nhiều NV company_id=NULL.
  const targetRegionIds = regions.map((region) => region.id).filter(Boolean);
  const [
    { data: companyDepts, error: deptErr },
    { data: companyMemberships, error: membershipErr },
    { data: regionMemberships, error: regionMembershipErr },
  ] = await Promise.all([
    supabase.from('departments').select('id').eq('company_id', targetId),
    supabase.from('user_companies').select('user_id').eq('company_id', targetId),
    targetRegionIds.length
      ? supabase.from('user_company_regions').select('user_id').in('region_id', targetRegionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (deptErr) throw deptErr;
  if (membershipErr) throw membershipErr;
  if (regionMembershipErr) throw regionMembershipErr;

  const companyDeptIds = (companyDepts || []).map((d) => d.id).filter(Boolean);
  const membershipUserIds = [...new Set([
    ...(companyMemberships || []).map((row) => row.user_id),
    ...(regionMemberships || []).map((row) => row.user_id),
  ].filter(Boolean))];
  const userSelect = 'id, full_name, avatar, role, company_id, department_id, is_active';
  const userQueries = [
    supabase
      .from('users')
      .select(userSelect)
      .eq('company_id', targetId)
      .or('is_active.eq.true,is_active.is.null'),
  ];
  if (companyDeptIds.length) {
    userQueries.push(
      supabase
        .from('users')
        .select(userSelect)
        .in('department_id', companyDeptIds)
        .or('is_active.eq.true,is_active.is.null'),
    );
  }
  if (membershipUserIds.length) {
    userQueries.push(
      supabase
        .from('users')
        .select(userSelect)
        .in('id', membershipUserIds)
        .or('is_active.eq.true,is_active.is.null'),
    );
  }

  const userResults = await Promise.all(userQueries);
  const userById = new Map();
  for (const result of userResults) {
    if (result.error) throw result.error;
    for (const user of result.data || []) {
      if (user?.id) userById.set(String(user.id), user);
    }
  }
  const userRows = [...userById.values()]
    .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''), 'vi'));
  const userIds = userRows.map((u) => u.id);
  const regionByUser = {};
  if (userIds.length) {
    const { data: urRows } = await supabase
      .from('user_company_regions')
      .select('user_id, region_id')
      .in('user_id', userIds);
    for (const row of urRows || []) {
      if (!row.user_id) continue;
      if (!regionByUser[row.user_id]) regionByUser[row.user_id] = [];
      regionByUser[row.user_id].push(row.region_id);
    }
  }
  for (const u of userRows) {
    u.crm_region_ids = (regionByUser[u.id] || []).map(String);
  }

  const deptIds = [...new Set(userRows.map((u) => u.department_id).filter(Boolean))];
  let departments = [];
  if (deptIds.length) {
    const { data: depts } = await supabase.from('departments').select('id, name').in('id', deptIds);
    departments = depts || [];
  }

  return { ok: true, companies, regions, users: userRows, departments };
}

/**
 * Thực hiện chuyển khu vực / công ty.
 */
async function executeLeadCompanyTransfer(req, {
  leadId,
  companyId: targetCompanyIdRaw,
  regionId: regionIdRaw,
  assignedTo: assigneeRaw,
}) {
  if (!regionIdRaw) return { ok: false, status: 400, error: 'Vui lòng chọn khu vực.' };
  if (!assigneeRaw) return { ok: false, status: 400, error: 'Vui lòng chọn nhân viên phụ trách.' };

  const { data: lead, error: leadFetchErr } = await supabase
    .from('crm_leads')
    .select('id, title, type, company_id, region_id, pipeline_id, stage_id, assigned_to, lead_owner_id, customer_id, source_id, lead_type_id, project_id')
    .eq('id', leadId)
    .single();
  if (leadFetchErr) throw leadFetchErr;
  if (!lead) return { ok: false, status: 404, error: 'Không tìm thấy lead/deal' };
  if (!lead.company_id) {
    return { ok: false, status: 400, error: 'Lead/Deal chưa có công ty — chọn công ty trước khi chuyển.' };
  }

  const sourceCompanyId = String(lead.company_id);
  const targetCompanyId = targetCompanyIdRaw ? String(targetCompanyIdRaw).trim() : sourceCompanyId;
  const companyChanged = targetCompanyId !== sourceCompanyId;

  if (companyChanged) {
    if (!canCrossCompanyTransfer(req.user)) {
      return { ok: false, status: 403, error: 'Chỉ admin mới được chuyển Lead/Deal sang công ty khác.' };
    }
    const coCheck = await assertTargetCompanyAllowed(req, targetCompanyId);
    if (!coCheck.ok) return { ok: false, status: 403, error: coCheck.error };

    const blockers = await countCommercialBlockers(leadId);
    if (blockers.blocked) {
      return {
        ok: false,
        status: 400,
        error: 'Deal đã có đơn hàng hoặc hóa đơn — không thể chuyển sang công ty khác.',
        code: 'HAS_COMMERCIAL_DOCS',
        blockers,
      };
    }
  } else if (!companyInTenantContext(req, sourceCompanyId)) {
    return { ok: false, status: 403, error: 'Không có quyền truy cập dữ liệu hệ sinh thái khác' };
  }

  if (!companyChanged && String(lead.region_id || '') === regionIdRaw
    && String(lead.assigned_to || lead.lead_owner_id || '') === assigneeRaw) {
    return { ok: false, status: 400, error: 'Chưa có thay đổi khu vực hoặc người phụ trách.' };
  }

  const v = await assertRegionBelongsToCompany(supabase, targetCompanyId, regionIdRaw);
  if (!v.ok) return { ok: false, status: 400, error: v.error };
  const ar = assertUserCanAssignCrmRegion(req, regionIdRaw);
  if (!ar.ok) return { ok: false, status: 403, error: ar.error };

  const av = await assertCrmAssigneeInRegion(supabase, assigneeRaw, targetCompanyId, regionIdRaw);
  if (!av.ok) return { ok: false, status: 400, error: av.error };

  const patch = {
    region_id: regionIdRaw,
    assigned_to: assigneeRaw,
    lead_owner_id: assigneeRaw,
    updated_at: new Date().toISOString(),
  };

  let customerResult = null;
  let pipelineChanged = false;

  if (companyChanged) {
    patch.company_id = targetCompanyId;

    customerResult = await copyOrReuseCustomerForCompany(supabase, lead.customer_id, targetCompanyId);
    if (customerResult.customerId) patch.customer_id = customerResult.customerId;

    const mappedSource = await mapTaxonomyToCompany(supabase, 'crm_sources', lead.source_id, targetCompanyId);
    patch.source_id = mappedSource;
    const mappedType = await mapTaxonomyToCompany(supabase, 'crm_lead_types', lead.lead_type_id, targetCompanyId);
    patch.lead_type_id = mappedType;

    const pipe = await resolveTargetPipelineAndStage({
      companyId: targetCompanyId,
      regionId: regionIdRaw,
      leadType: lead.type,
      currentStageId: lead.stage_id,
    });
    if (!pipe.ok) return { ok: false, status: 400, error: pipe.error };
    if (String(pipe.pipelineId) !== String(lead.pipeline_id || '')) {
      patch.pipeline_id = pipe.pipelineId;
      pipelineChanged = true;
    }
    if (pipe.stageChanged || pipelineChanged) {
      patch.stage_id = pipe.stageId;
      patch.stage_entered_at = new Date().toISOString();
      pipelineChanged = true;
    }
  } else {
    // Cùng công ty — remap pipeline nếu tách theo khu vực
    const newPipelineId = await getPipelineIdForCompanyRegion(targetCompanyId, regionIdRaw);
    if (newPipelineId && String(newPipelineId) !== String(lead.pipeline_id || '')) {
      patch.pipeline_id = newPipelineId;
      pipelineChanged = true;
      const pipe = await resolveTargetPipelineAndStage({
        companyId: targetCompanyId,
        regionId: regionIdRaw,
        leadType: lead.type,
        currentStageId: lead.stage_id,
      });
      if (pipe.ok && pipe.stageId) {
        patch.stage_id = pipe.stageId;
        if (String(pipe.stageId) !== String(lead.stage_id || '')) {
          patch.stage_entered_at = new Date().toISOString();
        }
      }
    }
  }

  const { data: updated, error: updErr } = await supabase
    .from('crm_leads')
    .update(patch)
    .eq('id', leadId)
    .select('*')
    .single();
  if (updErr) throw updErr;

  // Báo giá: cập nhật phạm vi công ty/khu vực (cho phép giữ khi chuyển CT)
  if (companyChanged) {
    await supabase
      .from('quotations')
      .update({
        company_id: targetCompanyId,
        region_id: regionIdRaw,
        ...(customerResult?.customerId ? { customer_id: customerResult.customerId } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('lead_id', leadId);

    await supabase
      .from('crm_assignments')
      .update({ company_id: targetCompanyId })
      .eq('lead_id', leadId);
  } else if (String(lead.region_id || '') !== regionIdRaw) {
    await supabase
      .from('quotations')
      .update({ region_id: regionIdRaw, updated_at: new Date().toISOString() })
      .eq('lead_id', leadId);
  }

  return {
    ok: true,
    lead: updated,
    sourceCompanyId,
    targetCompanyId,
    companyChanged,
    pipelineChanged,
    customerResult,
    previous: {
      region_id: lead.region_id,
      company_id: lead.company_id,
      assigned_to: lead.assigned_to || lead.lead_owner_id,
    },
  };
}

module.exports = {
  canCrossCompanyTransfer,
  canListOtherCrmCompanies,
  assertTargetCompanyAllowed,
  countCommercialBlockers,
  copyOrReuseCustomerForCompany,
  getTransferOptions,
  listTransferTargetCompanies,
  executeLeadCompanyTransfer,
  resolveTargetPipelineAndStage,
};
