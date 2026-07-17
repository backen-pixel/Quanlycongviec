const fs = require('fs');
const path = require('path');

function extract(file) {
  const s = fs.readFileSync(file, 'utf8');
  const out = [];
  const re = /test\(\s*(\d+)\s*,\s*'((?:\\'|[^'])*)'/g;
  let m;
  while ((m = re.exec(s))) {
    out.push({ id: +m[1], name: m[2].replace(/\\'/g, "'") });
  }
  return out;
}

const a = extract(path.join(__dirname, 'crm-split-50-cases.js'));
const b = extract(path.join(__dirname, 'crm-split-50-cases-b.js'));
const u = extract(path.join(__dirname, 'crm-split-100-ui.js'));

const map = [
  ['/crm/dashboard', 'dashboard+leadsList'],
  ['/crm/pipeline', 'leadsList+pipelines'],
  ['/crm/quotations', 'commercialDocs'],
  ['/crm/orders', 'commercialDocs'],
  ['/crm/invoices', 'commercialDocs'],
  ['/crm/products', 'commercialDocs'],
  ['/crm/customers', 'customers'],
  ['/crm/tasks', 'crmTasks+taskTemplates'],
  ['/crm/task-templates', 'taskTemplates'],
  ['/crm/follow-up-care', 'followupPlanner'],
  ['/crm/pipeline-settings', 'pipelines'],
  ['/crm/sources-settings', 'taxonomy'],
  ['/crm/reports/org-overview', 'reports'],
  ['/crm/reports/staff-lead-deal', 'reports'],
  ['/crm/admin/sla-watchlist', 'reports'],
  ['/crm/deadline-settings', 'followupPlanner'],
  ['/crm/auto-project-config', 'leadLifecycle'],
  ['/crm/blocked-phones', 'leadLifecycle'],
  ['/crm/settings/deal-stage-report', 'reports'],
];
for (let i = 0; i < map.length; i++) {
  const id = 25 + i;
  if (!u.find((x) => x.id === id)) {
    u.push({ id, name: `API cho UI ${map[i][0]} (${map[i][1]})` });
  }
}

const uiGoto = [
  [58, '/crm/dashboard', 'Dashboard'],
  [59, '/crm/pipeline', 'Pipeline/Kanban'],
  [60, '/crm/quotations', 'Bao gia'],
  [61, '/crm/orders', 'Don hang'],
  [62, '/crm/invoices', 'Hoa don'],
  [63, '/crm/products', 'San pham'],
  [64, '/crm/customers', 'Khach hang'],
  [65, '/crm/tasks', 'Nhiem vu CRM'],
  [66, '/crm/task-templates', 'Mau nhiem vu'],
  [67, '/crm/follow-up-care', 'CSKH follow-up'],
  [68, '/crm/pipeline-settings', 'Cai dat pipeline'],
  [69, '/crm/sources-settings', 'Nguon lead'],
  [70, '/crm/reports/org-overview', 'BC to chuc'],
  [71, '/crm/reports/staff-lead-deal', 'BC NV lead-deal'],
  [72, '/crm/deadline-settings', 'Cai dat deadline'],
  [73, '/crm/auto-project-config', 'Auto project config'],
  [74, '/crm/blocked-phones', 'SDT chan'],
  [75, '/crm/assignments', 'Assignments'],
  [76, '/crm/categories', 'Categories'],
];
for (const [id, p, l] of uiGoto) {
  if (!u.find((x) => x.id === id)) {
    u.push({ id, name: `UI mo ${p} (${l}) — render + CRM API khong 5xx` });
  }
}

u.sort((a2, b2) => a2.id - b2.id);
a.sort((x, y) => x.id - y.id);
b.sort((x, y) => x.id - y.id);

const missing = Array.from({ length: 100 }, (_, i) => i + 1).filter((id) => !u.find((x) => x.id === id));
console.log({ A: a.length, B: b.length, UI: u.length, missing });

fs.writeFileSync(
  path.join(__dirname, '_crm-test-catalog.json'),
  JSON.stringify({ a, b, ui: u }, null, 2),
);
