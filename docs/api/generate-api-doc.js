/**
 * Scan Express routes and generate docs/api/API_DOCUMENT.md (+ supporting data).
 * Usage: node docs/api/generate-api-doc.js
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const ROOT = path.resolve(REPO, 'backend/src/routes');
const SERVER = path.resolve(REPO, 'backend/src/server.js');
const OUT_JSON = path.resolve(__dirname, '../_tmp_routes.json');
const OUT_MD = path.resolve(__dirname, 'API_DOCUMENT.md');

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.js')) acc.push(p);
  }
  return acc;
}

function extractMounts(serverSrc) {
  const mounts = [];
  const re = /app\.use\(\s*['`](\/api[^'`]*)['`]\s*,/g;
  let m;
  while ((m = re.exec(serverSrc))) {
    mounts.push(m[1]);
  }
  return [...new Set(mounts)];
}

function extractRoutes(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const rel = filePath.replace(/\\/g, '/').split('/routes/')[1] || filePath;
  const rows = [];
  const seen = new Set();
  // r.get('/x'), router.post("/x"), app.delete(`/x`)
  const re = /\b(?:r|router|app)\.(get|post|put|patch|delete|all)\(\s*(['"`])([^'"`]+)\2/g;
  let m;
  while ((m = re.exec(text))) {
    const method = m[1].toUpperCase();
    const p = m[3];
    const key = `${method} ${p}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ method, path: p, file: rel });
  }
  return rows;
}

/** Infer mount prefix from file path using server mounts + crm composition */
function guessPrefixes(file, mounts) {
  const f = file.replace(/\\/g, '/');
  if (f.startsWith('crm/')) return ['/api/crm'];
  const base = path.basename(f, '.js');
  // map common file names to mounts
  const map = {
    auth: '/api/auth',
    heartbeat: '/api/heartbeat',
    users: '/api/users',
    projects: '/api/projects',
    tasks: '/api/tasks',
    workTasks: '/api/work-tasks',
    management: '/api/management',
    customers: '/api/customers',
    products: '/api/products',
    dashboardMain: '/api/dashboard-main',
    dashboardDivisions: '/api/dashboard',
    dashboard: '/api/dashboard',
    divisions: '/api/divisions',
    upload: '/api/upload',
    voiceRecordings: '/api/voice-recordings',
    templates: '/api/templates',
    companies: '/api/companies',
    departments: '/api/departments',
    teams: '/api/teams',
    stages: '/api/stages',
    approvals: '/api/approvals',
    ecosystem: '/api/ecosystem',
    appModules: '/api/app-modules',
    companyTemplates: '/api/company-templates',
    flows: '/api/flows',
    companyProcesses: '/api/company-processes',
    permissions: '/api/permissions',
    platform: '/api/platform',
    tenantUsage: '/api/tenant',
    saasStore: '/api/saas',
    saasPayment: '/api/saas/payment',
    executiveKpi: '/api/crm/executive',
    dealScores: '/api/crm/deal-performance',
    kpi: '/api/kpi',
    crmAssignments: '/api/crm/assignments',
    crmDeptPlans: '/api/crm/dept-plans',
    crmDailyReports: '/api/crm/daily-reports',
    trash: '/api/trash',
    messengerGroups: '/api/messenger',
    events: '/api/events',
    vcHandover: '/api/vc-handover',
    internalSocial: '/api/internal-social',
    releaseNotes: '/api/release-notes',
    appUpdates: '/api/app-updates',
    knowledge: '/api/knowledge',
    facebook: '/api/facebook',
    zalo: '/api/zalo',
    production: '/api/production',
    productionBackupSync: '/api/production/backup-sync',
    logistics: '/api/logistics',
    accounting: '/api/accounting',
    workshopTypes: '/api/workshop',
    workshopTeams: '/api/workshop-teams',
    procurement: '/api/procurement',
    purchasing: '/api/purchasing',
    settings: '/api/settings',
    external: '/api/external',
    mcp: '/api/mcp',
    turn: '/api/turn',
    push: '/api/push',
    devices: '/api/devices',
    assistant: '/api/assistant',
    aiChatBot: '/api/ai-chat-bot',
    userActivityLog: '/api/user-activity',
    authEventLog: '/api/auth-events',
    stringee: '/api/integrations/stringee',
    calc: '/api/calc',
    drive: '/api/drive',
    batchJobs: '/api/batch-jobs',
    supabaseOps: '/api/admin/supabase',
  };
  if (map[base]) return [map[base]];
  // fallback: find mount containing similar slug
  const slug = base.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
  const hit = mounts.find((m) => m.includes(slug));
  return hit ? [hit] : ['/api/?'];
}

function main() {
  const files = [...new Set(walk(ROOT).map((f) => path.normalize(f)))];
  const serverSrc = fs.readFileSync(SERVER, 'utf8');
  const mounts = extractMounts(serverSrc);

  let all = [];
  for (const f of files) {
    all = all.concat(extractRoutes(f));
  }
  all.sort((a, b) => a.file.localeCompare(b.file) || a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

  const expanded = [];
  for (const r of all) {
    const prefixes = guessPrefixes(r.file, mounts);
    for (const prefix of prefixes) {
      const full = (prefix.replace(/\/$/, '') + (r.path.startsWith('/') ? r.path : '/' + r.path)).replace(/\/+/g, '/');
      expanded.push({ ...r, prefix, full });
    }
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify({ count: all.length, expanded: expanded.length, mounts, rows: expanded }, null, 2));

  // Group by prefix for MD
  const byPrefix = new Map();
  for (const r of expanded) {
    if (!byPrefix.has(r.prefix)) byPrefix.set(r.prefix, []);
    byPrefix.get(r.prefix).push(r);
  }
  const prefixes = [...byPrefix.keys()].sort();

  let md = '';
  md += '# API Document — Quanlycongviec (Tủ Bếp Pro)\n\n';
  md += `Tài liệu **đầy đủ** các HTTP endpoint được khai báo trong Express routes.\n\n`;
  md += `- Cập nhật: **${new Date().toISOString().slice(0, 10)}**\n`;
  md += `- Số mount \`/api/*\` trong \`server.js\`: **${mounts.length}**\n`;
  md += `- Số endpoint (method + path) quét được: **${expanded.length}**\n`;
  md += `- Nguồn: \`backend/src/server.js\` + \`backend/src/routes/**/*.js\`\n`;
  md += `- Regenerate: \`node docs/api/generate-api-doc.js\`\n\n`;
  md += `> Path đầy đủ = mount prefix + path trong \`router.get/post/...\`. Một số router mount nested (vd. CRM clusters dưới \`/api/crm\`).\n\n`;
  md += `---\n\n## 1. Auth\n\n| Mode | Header | Phạm vi |\n|---|---|---|\n| JWT | \`Authorization: Bearer <token>\` | App nội bộ |\n| API Key | \`X-Api-Key\` | \`/api/external\` |\n| API Key + User | \`X-Api-Key\` + \`X-User-Id\` | \`/api/mcp\` |\n\nMiddleware: \`auth.js\`, \`newPermission.js\`, \`apiKeyAuth.js\`. Client: \`frontend/src/lib/api.js\`.\n\n---\n\n## 2. Danh sách mount (\`server.js\`)\n\n`;
  for (const m of mounts.sort()) md += `- \`${m}\`\n`;
  md += `\n---\n\n## 3. Toàn bộ endpoints theo prefix\n\n`;

  for (const prefix of prefixes) {
    const list = byPrefix.get(prefix);
    // dedupe full+method
    const seen = new Set();
    const uniq = [];
    for (const r of list) {
      const k = `${r.method} ${r.full}`;
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(r);
    }
    uniq.sort((a, b) => a.full.localeCompare(b.full) || a.method.localeCompare(b.method));
    md += `### \`${prefix}\` (${uniq.length})\n\n`;
    md += `| Method | Path đầy đủ | File |\n|---|---|---|\n`;
    for (const r of uniq) {
      md += `| ${r.method} | \`${r.full}\` | \`${r.file}\` |\n`;
    }
    md += `\n`;
  }

  md += `---\n\n## 4. External API (body)\n\nXem header \`backend/src/routes/external.js\`.\n\n| Method | Path | Body chính |\n|---|---|---|\n`;
  md += `| POST | /api/external/leads | title*, phone*, type?, full_name?, email?, source_name?, stage_id?, assigned_to?, company_id?, estimated_value?, description?, notes?, webhook_url? |\n`;
  md += `| POST | /api/external/deals | tương tự leads |\n`;
  md += `| GET | /api/external/stages | query type=lead\\|deal |\n`;
  md += `| GET | /api/external/sources | — |\n`;
  md += `| GET | /api/external/users | — |\n`;
  md += `| GET | /api/external/ping | — |\n`;
  md += `| GET | /api/external/leads/stats | — |\n`;
  md += `| GET | /api/external/project-deadlines | query days_ahead, status=all\\|overdue\\|upcoming, module=all\\|crm\\|production\\|logistics, company_id?, responsible_user_id?, limit |\n\n`;

  md += `---\n\n## 5. CRM clusters\n\nSửa trong \`backend/src/routes/crm/routes/\`:\n\n`;
  const crmFiles = [...new Set(expanded.filter((r) => r.file.startsWith('crm/routes/')).map((r) => r.file))].sort();
  for (const f of crmFiles) md += `- \`${f}\`\n`;

  md += `\n---\n\n## 6. Liên quan\n\n- \`docs/project/CODING_STANDARD.md\`\n- \`docs/database/DATABASE_SCHEMA.md\`\n- \`docs/architecture/kien-truc-tong-the.html\`\n`;

  fs.writeFileSync(OUT_MD, md, 'utf8');
  console.log('Wrote', OUT_MD, 'endpoints', expanded.length, 'mounts', mounts.length);
}

main();
