/**
 * CRM composition root — parent middleware + feature routers.
 */
const { Router } = require('express');
const { auth } = require('../../middleware/auth');
const { invalidateTags: rcInvalidateTags } = require('../../middleware/responseCache');
const { supabase } = require('../../config/supabase');
const {
  assertCrmLeadAccess,
  assertCrmTaskLeadAccess,
  loadLeadForTaskAccess,
  assertCrmTaskBelongsToLead,
  resolveCrmTaskHttpOperation,
} = require('../../helpers/crmTaskLeadAccess');
const { recordCrmAccessDenial } = require('../../helpers/crmAccessAudit');

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
    const isTasksPath = /\/tasks(\/|$)/.test(p);
    const lead = await loadLeadForTaskAccess(supabase, leadId);
    // Fail-closed: lead không tồn tại → 404 (không rơi xuống handler thiếu authz)
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead/deal' });

    const taskId = isTasksPath && parts[3] && CRM_LEAD_ID_IN_PATH.test(parts[3]) ? parts[3] : null;
    if (taskId) {
      const rel = await assertCrmTaskBelongsToLead(supabase, leadId, taskId);
      if (!rel.ok) {
        recordCrmAccessDenial(req, {
          reason: 'task_lead_mismatch', leadId, taskId, status: rel.status || 404,
        });
        return res.status(rel.status || 404).json({ error: rel.error, reason: 'task_lead_mismatch' });
      }
    }

    const operation = isTasksPath
      ? resolveCrmTaskHttpOperation(req.method, p)
      : (String(req.method || '').toUpperCase() === 'GET' ? 'READ' : 'UPDATE');

    const gate = isTasksPath
      ? await assertCrmTaskLeadAccess(supabase, req, lead, { taskId, operation })
      : await assertCrmLeadAccess(supabase, req, lead, { operation });
    if (!gate.ok) {
      recordCrmAccessDenial(req, {
        reason: gate.reason || 'access_denied', leadId, taskId, operation, status: gate.status || 403,
      });
      return res.status(gate.status || 403).json({ error: gate.error, reason: gate.reason || 'access_denied' });
    }
    req.crmLeadAccess = { lead, grant: gate.grant || null, operation, taskId };
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
