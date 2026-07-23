/**
 * CRM composition root — parent middleware + feature routers.
 */
const { Router } = require('express');
const { auth } = require('../../middleware/auth');
const { invalidateTags: rcInvalidateTags } = require('../../middleware/responseCache');
const { supabase } = require('../../config/supabase');
const {
  userSeesAllCrmDeals,
  userSeesAllCrmLeads,
} = require('../../helpers/crmAccessRoles');
const {
  userCanAccessCrmLeadAsParticipant,
  userCanAccessCrmLeadViaVisibility,
} = require('../../helpers/crmLeadParticipantAccess');
const {
  assertCrmTaskLeadAccess,
  loadLeadForTaskAccess,
} = require('../../helpers/crmTaskLeadAccess');

const helpers = require('./shared/helpersBundle');

const dashboard = require('./routes/dashboard');
const reports = require('./routes/reports');
const pipelines = require('./routes/pipelines');
const taxonomy = require('./routes/taxonomy');
const visibleProduction = require('./routes/visibleProduction');
const leadDuplicates = require('./routes/leadDuplicates');
const leadsList = require('./routes/leadsList');
const customers = require('./routes/customers');
const commercialDocs = require('./routes/commercialDocs');
const taskTemplates = require('./routes/taskTemplates');
const crmTasks = require('./routes/crmTasks');
const followupPlanner = require('./routes/followupPlanner');
const leadComments = require('./routes/leadComments');
const membersChat = require('./routes/membersChat');
const leadLifecycle = require('./routes/leadLifecycle');
const vcBooking = require('./routes/vcBooking');

const r = Router();
r.use(auth);

// Auto-invalidate response cache cho mọi mutation CRM
r.use((req, res, next) => {
  if (req.method === 'GET') return next();
  const origJson = res.json.bind(res);
  res.json = function crmInvalidate(body) {
    if (res.statusCode < 400) {
      void rcInvalidateTags(['crm:list', 'crm:live']);
    }
    return origJson(body);
  };
  next();
});

const CRM_LEAD_ID_IN_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function enforceCrmDealAssigneeAccess(req, res, next) {
  try {
    const p = req.path || '';
    const parts = p.split('/').filter(Boolean);
    const head = parts[0];
    if ((head !== 'leads' && head !== 'deals') || !parts[1] || !CRM_LEAD_ID_IN_PATH.test(parts[1])) return next();
    const leadId = parts[1];
    // /tasks* — gate riêng (assignee/participant/executor), không bypass authz
    if (/\/tasks(\/|$)/.test(p)) {
      const taskId = parts[3] && CRM_LEAD_ID_IN_PATH.test(parts[3]) ? parts[3] : null;
      const lead = await loadLeadForTaskAccess(supabase, leadId);
      if (!lead) return next();
      const gate = await assertCrmTaskLeadAccess(supabase, req, lead, { taskId });
      if (!gate.ok) return res.status(gate.status || 403).json({ error: gate.error });
      return next();
    }
    const { data: lead, error } = await supabase
      .from('crm_leads')
      .select('id, type, company_id, assigned_to, lead_owner_id, parent_lead_id, project_id')
      .eq('id', leadId)
      .maybeSingle();
    if (error || !lead) return next();
    const { companyInTenantContext } = require('../../helpers/tenantScope');
    if (!companyInTenantContext(req, lead.company_id)) {
      return res.status(403).json({ error: 'Không có quyền truy cập dữ liệu hệ sinh thái khác' });
    }
    const uid = req.user?.userId;
    const { userOwnsDealViaAncestor } = require('../../helpers/crmTaskLeadAccess');

    if (lead.type === 'deal') {
      if (userSeesAllCrmDeals(req.user?.role)) return next();
      if (!uid) {
        return res.status(403).json({ error: 'Bạn chỉ được xem/sửa deal mà bạn phụ trách.' });
      }
      const ok = await userOwnsDealViaAncestor(supabase, uid, lead)
        || await userCanAccessCrmLeadAsParticipant(supabase, uid, lead)
        || await userCanAccessCrmLeadViaVisibility(supabase, uid, lead);
      if (!ok) {
        return res.status(403).json({ error: 'Bạn chỉ được xem/sửa deal mà bạn phụ trách hoặc tham gia.' });
      }
      return next();
    }
    if (lead.type === 'lead') {
      if (userSeesAllCrmLeads(req.user?.role)) return next();
      const owns =
        uid &&
        (String(lead.assigned_to || '') === String(uid) || String(lead.lead_owner_id || '') === String(uid));
      const participant = uid && (
        await userCanAccessCrmLeadAsParticipant(supabase, uid, lead)
        || await userCanAccessCrmLeadViaVisibility(supabase, uid, lead)
      );
      if (!owns && !participant) {
        return res.status(403).json({ error: 'Bạn chỉ được xem/sửa lead mà bạn phụ trách hoặc tham gia.' });
      }
      return next();
    }
    return next();
  } catch (e) {
    return next(e);
  }
}

r.use(enforceCrmDealAssigneeAccess);

// Mount order: static /leads/* before /leads/:id lifecycle
r.use(dashboard);
r.use(reports);
r.use(pipelines);
r.use(taxonomy);
r.use(visibleProduction);
r.use(leadDuplicates);
r.use(leadsList);
r.use(customers);
r.use(commercialDocs);
r.use(taskTemplates);
r.use(crmTasks);
r.use(followupPlanner);
r.use(leadComments);
r.use(membersChat);
r.use(vcBooking);
r.use(leadLifecycle);

if (typeof helpers.computeOrgOverviewReportData === 'function') {
  r.computeOrgOverviewReportData = helpers.computeOrgOverviewReportData.bind(helpers);
}

module.exports = r;
