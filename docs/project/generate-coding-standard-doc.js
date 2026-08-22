/**
 * Generate docs/project/CODING_STANDARD.md with inventories from the repo.
 * Usage: node docs/project/generate-coding-standard-doc.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.resolve(__dirname, 'CODING_STANDARD.md');

function walk(dir, pred, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
      walk(p, pred, acc);
    } else if (pred(e.name, p)) acc.push(p);
  }
  return acc;
}

function rel(p) {
  return p.replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/') + '/', '');
}

function main() {
  const helpers = walk(path.join(ROOT, 'backend/src/helpers'), (n) => n.endsWith('.js'))
    .map(rel)
    .sort();
  const middleware = walk(path.join(ROOT, 'backend/src/middleware'), (n) => n.endsWith('.js'))
    .map(rel)
    .sort();
  const routes = walk(path.join(ROOT, 'backend/src/routes'), (n) => n.endsWith('.js'))
    .map(rel)
    .sort();
  const feLib = walk(path.join(ROOT, 'frontend/src/lib'), (n) => /\.(js|jsx|ts|tsx)$/.test(n))
    .map(rel)
    .sort();
  const fePages = walk(path.join(ROOT, 'frontend/src/pages'), (n) => /\.(js|jsx)$/.test(n))
    .map(rel)
    .sort();
  const migrations = walk(path.join(ROOT, 'database'), (n) => n.endsWith('.sql'))
    .map((p) => path.basename(p))
    .sort();

  let md = '';
  md += '# Coding Standard — Quanlycongviec (Tủ Bếp Pro)\n\n';
  md += `Chuẩn code + **inventory đầy đủ** file helpers / middleware / routes / lib / pages / migrations.\n\n`;
  md += `- Cập nhật: **${new Date().toISOString().slice(0, 10)}**\n`;
  md += `- Helpers: **${helpers.length}** · Middleware: **${middleware.length}** · Route files: **${routes.length}**\n`;
  md += `- Frontend lib: **${feLib.length}** · Pages: **${fePages.length}** · SQL migrations: **${migrations.length}**\n`;
  md += `- Regenerate inventory: \`node docs/project/generate-coding-standard-doc.js\`\n\n`;
  md += `---\n\n`;

  md += `## 1. Stack bắt buộc\n\n`;
  md += `| Lớp | Chuẩn |\n|---|---|\n`;
  md += `| Backend | Express 5, Node ≥18, CommonJS \`require\`, entry \`backend/src/server.js\` |\n`;
  md += `| Frontend | React 18, Vite ESM, Tailwind v4, entry \`frontend/src/App.jsx\` |\n`;
  md += `| DB | Supabase PostgreSQL, **không ORM**, client \`config/supabase.js\` |\n`;
  md += `| Auth | JWT \`localStorage\` + \`middleware/auth.js\` |\n`;
  md += `| RBAC | \`middleware/newPermission.js\` → RPC \`user_has_permission\` |\n`;
  md += `| Realtime | Socket.IO (+ Redis optional) |\n`;
  md += `| UI text | **Tiếng Việt** |\n`;
  md += `| Deploy | Render; BE serve \`frontend/dist\` |\n\n`;
  md += `### Lệnh\n\n\`\`\`bash\ncd backend && npm run dev     # :4000\ncd frontend && npm run dev    # :5173 proxy /api\n\`\`\`\n\n`;

  md += `## 2. Quy ước nghiệp vụ (bắt buộc)\n\n`;
  md += `| Chủ đề | Đúng | Sai |\n|---|---|---|\n`;
  md += `| Lead/Deal | \`crm_leads.type\` = lead\\|deal | Bảng \`leads\` riêng |\n`;
  md += `| Stage order | \`order_index\` | Cột \`order\` |\n`;
  md += `| Deal↔Project | \`project_id\` + \`crm_deal_projects\` | Luôn giả định 1–1 |\n`;
  md += `| Task CRM | \`crm_tasks\` | Nhầm \`tasks\` |\n`;
  md += `| Task SX/VC | \`tasks\` | Nhầm \`crm_tasks\` |\n`;
  md += `| Won | \`is_won\` + \`autoCreateProject\` / \`autoDealWonProject\` | Insert project bỏ helper |\n`;
  md += `| CRM routes | \`routes/crm/routes/<cluster>.js\` | Phình monolith |\n`;
  md += `| Stage fields | Cập nhật whitelist PUT \`pipelines.js\` | Chỉ ALTER DB |\n`;
  md += `| Roles | \`helpers/adminRole.js\` | So sánh role string rải rác |\n`;
  md += `| company scope | Filter \`company_id\` (trừ system admin) | Query all companies mặc định |\n\n`;

  md += `### Role\n\n- \`admin\` không company_id → system admin\n`;
  md += `- \`admin\` + company_id → company admin\n`;
  md += `- \`sales_admin\` → admin-like, luôn company-scoped\n`;
  md += `- User thường → RPC permission\n\n`;
  md += `Helpers: \`isAdminLike\`, \`isSystemAdmin\`, \`isCompanyScopedAdmin\`, \`isProductionStaff\`, \`isProductionAdmin\`.\n\n`;

  md += `## 3. Backend patterns\n\n`;
  md += `- Import: \`const { supabase } = require('../config/supabase')\` — failover qua router.\n`;
  md += `- Route chỉ authz + orchestration; logic nặng trong \`helpers/\`.\n`;
  md += `- Lỗi JSON \`{ error }\` + status 4xx/5xx.\n`;
  md += `- \`select('*')\` → cột DB mới tự có trong response.\n`;
  md += `- External: \`apiKeyAuth\` + rate limit + \`external_api_logs\`.\n`;
  md += `- CRM shared: \`routes/crm/shared/*\` (\`helpersBundle\`, \`requestScope\`, \`pipelineHelpers\`…).\n\n`;

  md += `## 4. Frontend patterns\n\n`;
  md += `- API: \`import api from '../lib/api'\` (Axios + JWT interceptor).\n`;
  md += `- Auth: \`useAuth()\` từ \`lib/auth.jsx\` / auth context.\n`;
  md += `- Module routes: \`/crm\`, \`/sx\`, \`/vc\`, \`/ketoan\`, \`/projects\`, \`/work\`, \`/drive\`, \`/knowledge\`.\n`;
  md += `- Persist filter: \`crmPipelineStorage\`, \`LS_SX\`, \`LS_ORG_REPORT\`, \`workshopPipelineStorage\`.\n`;
  md += `- Lazy: \`lazyWithRetry()\`.\n`;
  md += `- Không redesign visual khi chỉ fix feature; giữ Tailwind pattern file hiện tại.\n`;
  md += `- Đồng bộ role helpers FE: \`frontend/src/lib/adminRole.js\`.\n\n`;

  md += `## 5. Migration\n\n`;
  md += `- File \`database/NNN_ten.sql\` — **không** có runner tự động.\n`;
  md += `- Ưu tiên idempotent.\n`;
  md += `- Sau đổi \`crm_pipeline_stages\` → whitelist PUT.\n`;
  md += `- Không commit dump \`backend/uploads/_clone/\`.\n\n`;
  md += `Tổng file SQL hiện có: **${migrations.length}** (danh sách mục 10).\n\n`;

  md += `## 6. Checklist PR\n\n`;
  md += `1. UI tiếng Việt\n2. Authz đúng (JWT / permission / API key)\n3. Filter \`company_id\`\n4. Đúng cluster CRM / helper\n5. Đúng bảng lead/task\n6. Migration có số + apply note\n7. Không refactor ngoài scope\n\n`;

  md += `---\n\n## 7. Inventory middleware (${middleware.length})\n\n`;
  for (const f of middleware) md += `- \`${f}\`\n`;

  md += `\n## 8. Inventory route files (${routes.length})\n\n`;
  for (const f of routes) md += `- \`${f}\`\n`;

  md += `\n## 9. Inventory helpers (${helpers.length})\n\n`;
  for (const f of helpers) md += `- \`${f}\`\n`;

  md += `\n## 10. Inventory frontend lib (${feLib.length})\n\n`;
  for (const f of feLib) md += `- \`${f}\`\n`;

  md += `\n## 11. Inventory frontend pages (${fePages.length})\n\n`;
  for (const f of fePages) md += `- \`${f}\`\n`;

  md += `\n## 12. Inventory migrations SQL (${migrations.length})\n\n`;
  for (const f of migrations) md += `- \`database/${f}\`\n`;

  md += `\n---\n\n## Liên quan\n\n- \`docs/api/API_DOCUMENT.md\` — mọi endpoint\n- \`docs/database/DATABASE_SCHEMA.md\` — mọi bảng/cột\n- \`CLAUDE.md\` — bản rút gọn agent\n- \`AGENTS.md\` — quy ước agent / docs map\n`;

  fs.writeFileSync(OUT, md, 'utf8');
  console.log('Wrote', OUT, 'bytes', fs.statSync(OUT).size);
}

main();
