/**
 * Extract CRM core.js into shared helpersBundle + feature routers + composition index.
 */
const fs = require('fs');
const path = require('path');

const CRM_DIR = path.join(__dirname, '..', 'src', 'routes', 'crm');
const CORE = path.join(CRM_DIR, 'core.js');
const CORE_SRC = fs.existsSync(path.join(CRM_DIR, 'core.js.bak'))
  ? path.join(CRM_DIR, 'core.js.bak')
  : CORE;

const code = fs.readFileSync(CORE_SRC, 'utf8');
const lines = code.split(/\r?\n/);
const fullText = code;

function classifyRoute(method, routePath) {
  const p = routePath;
  if (p.startsWith('/reports/') || p === '/settings/deal-stage-report-buckets') return 'reports';
  if (p === '/admin/sla-at-risk' || p === '/admin/sla-remind') return 'reports';
  if (
    p === '/dashboard' ||
    p === '/ledger-net-by-leads' ||
    p === '/contract-signed-revenue' ||
    p === '/kanban-rows' ||
    p === '/live-version' ||
    p === '/_version' ||
    p === '/employees-by-company' ||
    p === '/alerts/follow-ups'
  ) {
    return 'dashboard';
  }
  if (p.startsWith('/pipelines') || p.startsWith('/pipeline-stages')) return 'pipelines';
  if (
    p.startsWith('/lead-types') ||
    p.startsWith('/referrers') ||
    p.startsWith('/sources') ||
    p.startsWith('/source-categories') ||
    p.startsWith('/zalo-notify') ||
    p.includes('/zalo-')
  ) {
    return 'taxonomy';
  }
  if (
    p.startsWith('/leads/scan-duplicates') ||
    p.startsWith('/leads/merge-') ||
    p.startsWith('/leads/bulk-assign') ||
    p.startsWith('/leads/cleanup-duplicates')
  ) {
    return 'leadDuplicates';
  }
  if (
    (p === '/leads' && method === 'get') ||
    p === '/leads/picker' ||
    p === '/leads-by-fb-page' ||
    p === '/stage-counts' ||
    p === '/leads-deadlines' ||
    p === '/web-dashboard-bootstrap' ||
    p === '/kanban-bootstrap' ||
    p === '/leads/stage-history-summary'
  ) {
    return 'leadsList';
  }
  if (p.startsWith('/customers') || p.startsWith('/company-regions') || p.startsWith('/customers-overview')) {
    return 'customers';
  }
  if (
    p.startsWith('/quotations') ||
    p.startsWith('/orders') ||
    p.startsWith('/invoices') ||
    p.startsWith('/products') ||
    p === '/products-list'
  ) {
    return 'commercialDocs';
  }
  if (p.startsWith('/task-templates')) return 'taskTemplates';
  if (p === '/tasks/overview' || p === '/tasks/planner') return 'taskTemplates';
  if (p.includes('/tasks') || p.includes('/task-attachments') || p.includes('/shared-notes')) {
    return 'crmTasks';
  }
  if (p.includes('/members') || p.includes('/assignments') || p.includes('/chat')) {
    return 'membersChat';
  }
  if (
    p.startsWith('/followup-care') ||
    p.startsWith('/lead-care-marks') ||
    p.includes('/care-mark') ||
    /\/pin$/.test(p) ||
    p.includes('/interacted') ||
    p.startsWith('/settings/deadline-config') ||
    p.startsWith('/planner/')
  ) {
    return 'followupPlanner';
  }
  if (p.includes('/comments') || p.startsWith('/lead-comments')) return 'leadComments';
  return 'leadLifecycle';
}

const routeRe = /\br\.(get|post|put|patch|delete)\(\s*(['"])([^'"]+)\2/g;
const routes = [];
let m;
while ((m = routeRe.exec(fullText))) {
  const method = m[1];
  const routePath = m[3];
  const openParen = fullText.indexOf('(', m.index);
  let depth = 0;
  let callEnd = -1;
  let inStr = null;
  let inLineComment = false;
  let inBlockComment = false;
  for (let j = openParen; j < fullText.length; j++) {
    const c = fullText[j];
    const n = fullText[j + 1];
    if (inLineComment) {
      if (c === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && n === '/') {
        inBlockComment = false;
        j++;
      }
      continue;
    }
    if (inStr) {
      if (c === '\\') {
        j++;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '/' && n === '/') {
      inLineComment = true;
      j++;
      continue;
    }
    if (c === '/' && n === '*') {
      inBlockComment = true;
      j++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inStr = c;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) {
        callEnd = j;
        break;
      }
    }
  }
  if (callEnd < 0) throw new Error('Unclosed route call at ' + routePath);
  let end = callEnd + 1;
  while (end < fullText.length && /[\s;]/.test(fullText[end])) {
    if (fullText[end] === ';') {
      end++;
      break;
    }
    end++;
  }
  const start = m.index;
  const startLine = fullText.slice(0, start).split(/\n/).length;
  const endLine = fullText.slice(0, end).split(/\n/).length;
  routes.push({
    method,
    path: routePath,
    start,
    end,
    startLine,
    endLine,
    mod: classifyRoute(method, routePath),
    text: fullText.slice(start, end),
  });
}

console.log('Found routes:', routes.length);

const routerLine = lines.findIndex((l) => l.includes('const r = Router()'));
if (routerLine < 0) throw new Error('Router() not found');

let afterMwLine = -1;
for (let i = routerLine; i < lines.length; i++) {
  if (lines[i].includes('r.use(enforceCrmDealAssigneeAccess)')) {
    afterMwLine = i + 1;
    break;
  }
}
if (afterMwLine < 0) throw new Error('enforce middleware not found');

const routeSpans = routes.map((rt) => [rt.startLine - 1, rt.endLine - 1]);

function lineInRoute(lineIdx) {
  for (const [a, b] of routeSpans) {
    if (lineIdx >= a && lineIdx <= b) return true;
  }
  return false;
}

function shouldSkipHelperLine(line) {
  const t = line.trim();
  if (!t) return false;
  if (t.startsWith('const r = Router()')) return true;
  if (t.startsWith('r.use(auth)')) return true;
  if (t.startsWith('r.use(enforceCrmDealAssigneeAccess)')) return true;
  if (t.includes('module.exports')) return true;
  if (t.includes('r.computeOrgOverviewReportData')) return true;
  // skip cache-invalidate middleware block marker lines — detected by function name
  if (t.includes('function crmInvalidate')) return true;
  return false;
}

// Skip the entire cache invalidate r.use((req,res,next)=>{...}) block by line range
let cacheMwStart = -1;
let cacheMwEnd = -1;
for (let i = routerLine; i < afterMwLine; i++) {
  if (lines[i].includes('Auto-invalidate response cache') || (lines[i].includes('r.use((req, res, next)') && lines[i + 1]?.includes('GET'))) {
    cacheMwStart = i;
    // find closing of this r.use
    let depth = 0;
    let started = false;
    for (let j = i; j < afterMwLine; j++) {
      for (const ch of lines[j]) {
        if (ch === '(') {
          depth++;
          started = true;
        } else if (ch === ')') depth--;
      }
      if (started && depth === 0 && lines[j].includes(');')) {
        cacheMwEnd = j;
        break;
      }
    }
    break;
  }
}

// Skip enforceCrmDealAssigneeAccess function definition in helper bundle (lives in index)
let enforceStart = -1;
let enforceEnd = -1;
for (let i = routerLine; i < afterMwLine; i++) {
  if (lines[i].includes('async function enforceCrmDealAssigneeAccess')) {
    enforceStart = i;
    let depth = 0;
    let started = false;
    for (let j = i; j < afterMwLine; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') {
          depth++;
          started = true;
        } else if (ch === '}') depth--;
      }
      if (started && depth === 0) {
        enforceEnd = j;
        break;
      }
    }
    break;
  }
}

function lineInSkippedMw(lineIdx) {
  if (cacheMwStart >= 0 && lineIdx >= cacheMwStart && lineIdx <= cacheMwEnd) return true;
  if (enforceStart >= 0 && lineIdx >= enforceStart && lineIdx <= enforceEnd) return true;
  if (lines[lineIdx].includes('const CRM_LEAD_ID_IN_PATH')) return true;
  return false;
}

const helperLineBuf = [];
for (let i = 0; i < lines.length; i++) {
  if (lineInRoute(i)) continue;
  if (lineInSkippedMw(i)) continue;
  if (shouldSkipHelperLine(lines[i])) continue;
  helperLineBuf.push(lines[i]);
}

const helperSource = helperLineBuf.join('\n');

// Collect exportable names
const helperNames = new Set();
const fnRe = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
let nm;
while ((nm = fnRe.exec(helperSource))) helperNames.add(nm[1]);

const constRe = /^const\s+([A-Za-z_$][\w$]*)\s*=/gm;
while ((nm = constRe.exec(helperSource))) helperNames.add(nm[1]);

const letRe = /^let\s+([A-Za-z_$][\w$]*)\s*=/gm;
while ((nm = letRe.exec(helperSource))) helperNames.add(nm[1]);

// Destructuring: const { a, b: c } = ...
const destructRe = /^(?:const|let|var)\s+\{([^}]+)\}\s*=/gm;
while ((nm = destructRe.exec(helperSource))) {
  String(nm[1])
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((part) => {
      // handle defaults: onLeadWon = async () => null
      const noDefault = part.split('=')[0].trim();
      if (noDefault.includes(':')) {
        helperNames.add(noDefault.split(':')[1].trim());
      } else {
        helperNames.add(noDefault.trim());
      }
    });
}

const exportNames = [...helperNames].filter(Boolean).sort();

// Extra names from complex one-line destructure (autoFlow defaults)
const EXTRA_EXPORTS = [
  'onLeadWon',
  'onOrderConfirmed',
  'onQuotationAccepted',
  'onProjectCompleted',
  'getProjectCRMSummary',
  'getOverdueFollowUps',
  'getStaleLeads',
  'createProjectFromLead',
];
for (const n of EXTRA_EXPORTS) exportNames.push(n);
const exportNamesUnique = [...new Set(exportNames)].sort();

let helpersBundle = `${helperSource}

module.exports = {
${exportNamesUnique.map((n) => `  ${n},`).join('\n')}
};
`;
// helpersBundle lives in shared/ — one level deeper than crm/
helpersBundle = helpersBundle.replace(/require\((['"])\.\.\/\.\.\//g, 'require($1../../../');

fs.mkdirSync(path.join(CRM_DIR, 'shared'), { recursive: true });
fs.mkdirSync(path.join(CRM_DIR, 'routes'), { recursive: true });
fs.writeFileSync(path.join(CRM_DIR, 'shared', 'helpersBundle.js'), helpersBundle);
console.log('helpersBundle exports', exportNamesUnique.length);

const byMod = {};
for (const rt of routes) {
  if (!byMod[rt.mod]) byMod[rt.mod] = [];
  byMod[rt.mod].push(rt);
}

const mountOrder = [
  'dashboard',
  'reports',
  'pipelines',
  'taxonomy',
  'leadDuplicates',
  'leadsList',
  'customers',
  'commercialDocs',
  'taskTemplates',
  'crmTasks',
  'followupPlanner',
  'leadComments',
  'membersChat',
  'leadLifecycle',
];

const iifeParams = exportNamesUnique.slice();

function genRouteModule(modName, routeList) {
  routeList.sort((a, b) => a.start - b.start);
  let body = routeList.map((rt) => rt.text).join('\n\n');
  // Route files are under crm/routes/ — fix embedded ../../ requires
  body = body.replace(/require\((['"])\.\.\/\.\.\//g, 'require($1../../../');
  return `/**
 * CRM routes: ${modName}
 * Auto-extracted — handlers close over shared helpers via IIFE.
 */
const { Router } = require('express');
const helpers = require('../shared/helpersBundle');

const r = Router();

(function (${iifeParams.join(', ')}) {
${body}
}).call(null, ${iifeParams.map((n) => `helpers[${JSON.stringify(n)}]`).join(', ')});

module.exports = r;
`;
}

for (const mod of mountOrder) {
  const list = byMod[mod] || [];
  if (!list.length) {
    console.warn('No routes for', mod);
    continue;
  }
  fs.writeFileSync(path.join(CRM_DIR, 'routes', `${mod}.js`), genRouteModule(mod, list));
  console.log('Wrote', mod, list.length, 'routes');
}

const indexJs = `/**
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

const helpers = require('./shared/helpersBundle');

const dashboard = require('./routes/dashboard');
const reports = require('./routes/reports');
const pipelines = require('./routes/pipelines');
const taxonomy = require('./routes/taxonomy');
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
    if (/\\/tasks(\\/|$)/.test(p)) return next();
    const leadId = parts[1];
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

    async function userOwnsDealViaAncestor(userId, row) {
      if (!userId || !row) return false;
      if (String(row.assigned_to || '') === String(userId)) return true;
      let cur = row;
      let g = 0;
      while (cur?.parent_lead_id && g < 8) {
        const { data: par } = await supabase
          .from('crm_leads')
          .select('id, type, assigned_to, lead_owner_id, parent_lead_id')
          .eq('id', cur.parent_lead_id)
          .maybeSingle();
        if (!par) break;
        if (par.type === 'deal' && String(par.assigned_to || '') === String(userId)) return true;
        cur = par;
        g += 1;
      }
      return false;
    }

    if (lead.type === 'deal') {
      if (userSeesAllCrmDeals(req.user?.role)) return next();
      if (!uid) {
        return res.status(403).json({ error: 'Bạn chỉ được xem/sửa deal mà bạn phụ trách.' });
      }
      const ok = await userOwnsDealViaAncestor(uid, lead)
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
r.use(leadDuplicates);
r.use(leadsList);
r.use(customers);
r.use(commercialDocs);
r.use(taskTemplates);
r.use(crmTasks);
r.use(followupPlanner);
r.use(leadComments);
r.use(membersChat);
r.use(leadLifecycle);

if (typeof helpers.computeOrgOverviewReportData === 'function') {
  r.computeOrgOverviewReportData = helpers.computeOrgOverviewReportData.bind(helpers);
}

module.exports = r;
`;

fs.writeFileSync(path.join(CRM_DIR, 'index.js'), indexJs);

const allRoutes = routes
  .map((rt) => ({ method: rt.method.toUpperCase(), path: rt.path, file: `routes/${rt.mod}.js` }))
  .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
const byFile = {};
for (const rt of allRoutes) byFile[rt.file] = (byFile[rt.file] || 0) + 1;
fs.writeFileSync(
  path.join(CRM_DIR, 'route-manifest.json'),
  JSON.stringify(
    { generated_at: new Date().toISOString(), total_routes: allRoutes.length, by_file: byFile, routes: allRoutes },
    null,
    2,
  ),
);

if (!fs.existsSync(path.join(CRM_DIR, 'core.js.bak'))) {
  fs.copyFileSync(CORE_SRC, path.join(CRM_DIR, 'core.js.bak'));
}
fs.writeFileSync(
  CORE,
  `/** Legacy stub — CRM composition root is index.js. Full backup: core.js.bak */\nmodule.exports = require('./index.js');\n`,
);

console.log('Done. Total routes', allRoutes.length);
console.log('by_file', byFile);
