/**
 * Xuất PDF chi tiết — Cấu trúc hệ sinh thái / CRM / KH / Đơn hàng / SX (đầy đủ trường)
 * Chạy: node docs/cau-truc-he-thong-co-ban/generate-pdf.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const outPdf = path.join(__dirname, 'CAU_TRUC_HE_THONG_CO_BAN.pdf');
const outHtml = path.join(__dirname, 'CAU_TRUC_HE_THONG_CO_BAN.print.html');

const require = createRequire(import.meta.url);
require(path.join(root, 'backend/node_modules/dotenv')).config({ path: path.join(root, 'backend/.env') });
const { Client } = require(path.join(root, 'backend/node_modules/pg'));
const pgConn = require(path.join(root, 'backend/src/config/pgConnection'));

const TABLE_LIST = [
  'tenants', 'ecosystem_levels', 'ecosystem_units', 'ecosystem_unit_members', 'ecosystem_module_scopes',
  'companies', 'company_regions', 'users',
  'customers', 'customer_interactions',
  'crm_pipelines', 'crm_pipeline_stages', 'crm_leads', 'crm_tasks', 'crm_sources', 'crm_lead_types',
  'crm_activities', 'crm_lead_comments', 'lead_members', 'lead_documents',
  'quotations', 'quotation_items', 'orders', 'order_items', 'invoices',
  'projects', 'production_pipeline_stages', 'workflow_stages', 'workshop_project_types',
  'tasks', 'task_checklists', 'project_company_assignments', 'project_production_staff',
];

const TABLE_DESC = {
  tenants: 'Tenant SaaS — khách hàng của nền tảng',
  ecosystem_levels: 'Cấp tổ chức (Tập đoàn → Khối → Công ty…)',
  ecosystem_units: 'Đơn vị trong cây tổ chức (Khối/Division)',
  ecosystem_unit_members: 'Nhân sự thuộc đơn vị hệ sinh thái',
  ecosystem_module_scopes: 'Module được phép theo khối',
  companies: 'Công ty nghiệp vụ (CRM, SX, VC…)',
  company_regions: 'Khu vực / chi nhánh trong công ty',
  users: 'Nhân viên hệ thống',
  customers: 'Hồ sơ khách hàng cuối',
  customer_interactions: 'Lịch sử tương tác với khách hàng',
  crm_pipelines: 'Ống bán hàng theo công ty',
  crm_pipeline_stages: 'Cột Kanban CRM',
  crm_leads: 'Lead + Deal (cùng một bảng, phân biệt bằng type)',
  crm_tasks: 'Nhiệm vụ trên Lead/Deal',
  crm_sources: 'Nguồn lead (Facebook, Zalo, GT…)',
  crm_lead_types: 'Phân loại Lead/Deal theo công ty',
  crm_activities: 'Hoạt động CRM (gọi, gặp, gửi BG…)',
  crm_lead_comments: 'Bình luận trên Lead/Deal',
  lead_members: 'Thành viên tham gia Lead/Deal',
  lead_documents: 'Tài liệu đính kèm Lead/Deal/Project',
  quotations: 'Báo giá',
  quotation_items: 'Dòng chi tiết báo giá',
  orders: 'Đơn hàng chính thức',
  order_items: 'Dòng chi tiết đơn hàng',
  invoices: 'Hóa đơn (MISA-style)',
  projects: 'Dự án sản xuất / lắp đặt',
  production_pipeline_stages: 'Cột Kanban sản xuất',
  workflow_stages: 'Giai đoạn quy trình chuẩn',
  workshop_project_types: 'Phân loại dự án xưởng',
  tasks: 'Nhiệm vụ sản xuất trên dự án',
  task_checklists: 'Checklist trong nhiệm vụ SX',
  project_company_assignments: 'Giao dự án cho công ty/khối khác',
  project_production_staff: 'Nhiều NV sản xuất trên 1 dự án',
};

const FIELD_HINTS = {
  id: 'Khóa chính UUID',
  type: 'Loại bản ghi (lead/deal, call/meeting…)',
  code: 'Mã tự sinh (LEAD-…, BG-…, TB-…)',
  status: 'Trạng thái nghiệp vụ',
  company_id: 'FK → companies',
  customer_id: 'FK → customers',
  lead_id: 'FK → crm_leads',
  project_id: 'FK → projects',
  pipeline_id: 'FK → crm_pipelines',
  stage_id: 'FK → crm_pipeline_stages / workflow_stages',
  quotation_id: 'FK → quotations',
  order_id: 'FK → orders',
  assigned_to: 'FK → users (NV phụ trách)',
  created_by: 'FK → users (người tạo)',
  tenant_id: 'FK → tenants',
  division_unit_id: 'FK → ecosystem_units (khối)',
  level_id: 'FK → ecosystem_levels',
  parent_id: 'FK → bản ghi cha (cây phân cấp)',
  workflow_stage_id: 'FK → workflow_stages',
  production_stage_id: 'FK → production_pipeline_stages',
  current_stage_id: 'FK → production_pipeline_stages (cột Kanban SX hiện tại)',
  workshop_type_id: 'FK → workshop_project_types',
  is_won: 'Stage chốt/thắng → tạo dự án SX',
  is_lost: 'Stage thua',
  estimated_value: 'Giá trị ước tính (VNĐ)',
  probability: '% xác suất chốt',
  weighted_value: 'Giá trị có trọng số (tự tính)',
  deposit_amount: 'Số tiền đặt cọc',
  total: 'Tổng tiền sau thuế/giảm giá',
  order_phase: 'Giai đoạn đơn (draft/confirmed/…)',
  payment_status: 'Trạng thái thanh toán',
  blocks_stage_advance: 'Chặn chuyển cột nếu chưa hoàn thành',
  shared_to_workshop: 'Chia sẻ sang module SX',
  sx_pipeline_stage_id: 'Cột Kanban SX trên deal (deal vào xưởng)',
  sx_handover_at: 'Thời điểm bàn giao sang SX',
};

const SECTIONS = [
  {
    title: '1. Luồng nghiệp vụ tổng quát',
    intro: true,
  },
  {
    title: '2. Sơ đồ liên kết bảng (ER)',
    diagrams: true,
  },
  {
    title: '3. Hệ sinh thái — Tổ chức & phân quyền',
    tables: ['tenants', 'ecosystem_levels', 'ecosystem_units', 'ecosystem_unit_members', 'ecosystem_module_scopes', 'companies', 'company_regions', 'users'],
  },
  {
    title: '4. Khách hàng',
    tables: ['customers', 'customer_interactions'],
  },
  {
    title: '5. CRM — Bán hàng',
    tables: ['crm_pipelines', 'crm_pipeline_stages', 'crm_leads', 'crm_tasks', 'crm_sources', 'crm_lead_types', 'crm_activities', 'crm_lead_comments', 'lead_members', 'lead_documents'],
  },
  {
    title: '6. Đơn hàng & Báo giá',
    tables: ['quotations', 'quotation_items', 'orders', 'order_items', 'invoices'],
  },
  {
    title: '7. Sản xuất',
    tables: ['projects', 'production_pipeline_stages', 'workflow_stages', 'workshop_project_types', 'tasks', 'task_checklists', 'project_company_assignments', 'project_production_staff'],
  },
  {
    title: '8. Bảng liên kết chi tiết & Ghi chú',
    outro: true,
  },
];

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shortType(t) {
  return String(t || '')
    .replace('character varying', 'varchar')
    .replace('timestamp with time zone', 'timestamptz')
    .replace('USER-DEFINED', 'enum');
}

function shortDefault(d) {
  if (d == null) return '—';
  const s = String(d);
  if (s.length > 40) return s.slice(0, 37) + '…';
  return s;
}

function hintFor(col) {
  if (FIELD_HINTS[col]) return FIELD_HINTS[col];
  if (col.endsWith('_id')) return `FK → ${col.replace(/_id$/, '')}`;
  if (col.endsWith('_at')) return 'Thời điểm (timestamp)';
  if (col.endsWith('_date')) return 'Ngày (date)';
  if (col.startsWith('is_')) return 'Cờ boolean';
  return '';
}

function loadCachedSchema() {
  const cachePath = path.join(__dirname, 'schema-columns.json');
  if (!fs.existsSync(cachePath)) return null;
  const rows = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  const byTable = {};
  for (const r of rows) (byTable[r.table_name] ??= []).push(r);
  return byTable;
}

function rowsToSchema(rows) {
  const byTable = {};
  for (const r of rows) (byTable[r.table_name] ??= []).push(r);
  return byTable;
}

async function fetchSchemaFromDb() {
  const url = pgConn.resolvePrimaryDbUrl?.() || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('Thiếu SUPABASE_DB_URL / DATABASE_URL trong backend/.env');
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query(
    `SELECT table_name, column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])
     ORDER BY table_name, ordinal_position`,
    [TABLE_LIST],
  );
  await client.end();
  return rowsToSchema(rows);
}

async function fetchSchema() {
  try {
    const schema = await fetchSchemaFromDb();
    const flat = Object.values(schema).flat();
    fs.writeFileSync(path.join(__dirname, 'schema-columns.json'), JSON.stringify(flat, null, 2), 'utf8');
    console.log('Cached schema to schema-columns.json');
    return schema;
  } catch (e) {
    console.warn('DB fetch failed:', e.message);
    const cached = loadCachedSchema();
    if (cached) {
      console.log('Using cached schema-columns.json');
      return cached;
    }
    throw e;
  }
}

function loadRelationships() {
  const p = path.join(__dirname, 'schema-relationships.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function svgBoxSimple(x, y, w, h, label, fill = '#eef2ff', stroke = '#6366f1') {
  const lines = String(label).split('\n');
  const lh = 12;
  const startY = y + (h - lines.length * lh) / 2 + 10;
  const text = lines.map((ln, i) =>
    `<tspan x="${x + w / 2}" y="${startY + i * lh}">${esc(ln)}</tspan>`,
  ).join('');
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>
    <text text-anchor="middle" font-family="Consolas,monospace" font-size="8.5" fill="#1e293b" font-weight="600">${text}</text>`;
}

function svgArrow(x1, y1, x2, y2, label = '', color = '#64748b') {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const lbl = label
    ? `<text x="${midX}" y="${midY - 3}" text-anchor="middle" font-size="7" fill="#475569" font-family="Consolas,monospace">${esc(label)}</text>`
    : '';
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.2" marker-end="url(#arrow)"/>${lbl}`;
}

function svgWrap(title, inner, w = 780, h = 420) {
  return `<div class="svg-wrap">
    <p class="svg-title">${esc(title)}</p>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="auto">
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#64748b"/>
        </marker>
      </defs>
      ${inner}
    </svg>
  </div>`;
}

function renderOverviewDiagram() {
  const bw = 118; const bh = 34;
  let s = '';
  // Hàng 1 — Hệ sinh thái
  s += svgBoxSimple(20, 20, 90, bh, 'tenants', '#f5f3ff', '#7c3aed');
  s += svgArrow(110, 37, 140, 37);
  s += svgBoxSimple(140, 20, 110, bh, 'ecosystem_units', '#f5f3ff', '#7c3aed');
  s += svgArrow(250, 37, 280, 37);
  s += svgBoxSimple(280, 20, 100, bh, 'companies', '#f5f3ff', '#7c3aed');
  s += svgArrow(380, 37, 410, 37);
  s += svgBoxSimple(410, 20, 100, bh, 'users', '#f5f3ff', '#7c3aed');
  // Hàng 2 — Khách hàng + CRM pipeline
  s += svgArrow(330, 54, 330, 78);
  s += svgBoxSimple(270, 78, 120, bh, 'customers', '#ecfdf5', '#059669');
  s += svgArrow(200, 95, 170, 95);
  s += svgBoxSimple(50, 78, 120, bh, 'crm_pipelines', '#eff6ff', '#2563eb');
  s += svgArrow(170, 95, 200, 95);
  s += svgBoxSimple(190, 78, 130, bh, 'crm_pipeline_stages', '#eff6ff', '#2563eb');
  // Hub — crm_leads
  s += svgArrow(330, 112, 330, 138);
  s += svgBoxSimple(250, 138, 160, 40, 'crm_leads\n(Lead + Deal)', '#dbeafe', '#1d4ed8');
  // Nhánh từ crm_leads
  s += svgArrow(250, 158, 120, 158); s += svgArrow(120, 158, 120, 188);
  s += svgBoxSimple(60, 188, 120, bh, 'crm_tasks', '#eff6ff', '#2563eb');
  s += svgArrow(330, 178, 330, 188);
  s += svgBoxSimple(270, 188, 120, bh, 'quotations', '#fff7ed', '#ea580c');
  s += svgArrow(410, 158, 500, 158); s += svgArrow(500, 158, 500, 188);
  s += svgBoxSimple(440, 188, 120, bh, 'orders', '#fff7ed', '#ea580c');
  // Deal chốt → projects
  s += svgArrow(330, 178, 330, 248);
  s += svgBoxSimple(260, 248, 140, 40, 'projects', '#f0fdfa', '#0f766e');
  s += svgArrow(330, 288, 330, 318);
  s += svgBoxSimple(280, 318, 100, bh, 'tasks', '#f0fdfa', '#0f766e');
  s += svgArrow(400, 268, 470, 268);
  s += svgBoxSimple(470, 248, 150, 40, 'production_\npipeline_stages', '#f0fdfa', '#0f766e');
  // Chú thích
  s += `<text x="600" y="30" font-size="8" fill="#64748b" font-family="Segoe UI,sans-serif">──▶ liên kết FK / nghiệp vụ</text>`;
  s += `<text x="600" y="48" font-size="8" fill="#64748b" font-family="Segoe UI,sans-serif">crm_leads.project_id ↔ projects (deal chốt)</text>`;
  return svgWrap('2.1 Sơ đồ tổng thể — Luồng liên kết chính', s, 780, 380);
}

function renderEcosystemDiagram() {
  let s = '';
  s += svgBoxSimple(300, 15, 100, 32, 'tenants', '#f5f3ff', '#7c3aed');
  s += svgArrow(350, 47, 350, 68);
  s += svgBoxSimple(280, 68, 140, 32, 'ecosystem_levels', '#f5f3ff', '#7c3aed');
  s += svgArrow(350, 100, 350, 120);
  s += svgBoxSimple(250, 120, 200, 36, 'ecosystem_units\n(parent_id → self)', '#f5f3ff', '#7c3aed');
  s += svgArrow(350, 156, 350, 178);
  s += svgBoxSimple(290, 178, 120, 32, 'companies', '#f5f3ff', '#7c3aed');
  s += svgArrow(230, 136, 120, 136);
  s += svgBoxSimple(30, 120, 160, 32, 'ecosystem_unit_members', '#f5f3ff', '#7c3aed');
  s += svgArrow(120, 152, 120, 178);
  s += svgBoxSimple(60, 178, 120, 32, 'users', '#f5f3ff', '#7c3aed');
  s += svgArrow(450, 136, 560, 136);
  s += svgBoxSimple(560, 120, 170, 32, 'ecosystem_module_scopes', '#f5f3ff', '#7c3aed');
  s += svgArrow(350, 210, 350, 232);
  s += svgBoxSimple(280, 232, 140, 32, 'company_regions', '#f5f3ff', '#7c3aed');
  return svgWrap('2.2 Hệ sinh thái — Liên kết tổ chức', s, 780, 290);
}

function renderCrmDiagram() {
  let s = '';
  s += svgBoxSimple(30, 30, 110, 32, 'companies', '#f5f3ff', '#7c3aed');
  s += svgArrow(85, 62, 85, 85); s += svgBoxSimple(30, 85, 110, 32, 'crm_pipelines', '#eff6ff', '#2563eb');
  s += svgArrow(140, 101, 200, 101);
  s += svgBoxSimple(200, 85, 140, 32, 'crm_pipeline_stages', '#eff6ff', '#2563eb');
  s += svgArrow(200, 117, 200, 145);
  s += svgBoxSimple(160, 145, 220, 44, 'crm_leads ★\n(type: lead | deal)', '#dbeafe', '#1d4ed8');
  s += svgArrow(85, 30, 200, 30); s += svgArrow(200, 30, 200, 85);
  s += svgBoxSimple(300, 30, 100, 32, 'customers', '#ecfdf5', '#059669');
  s += svgArrow(350, 62, 280, 145);
  s += svgBoxSimple(420, 85, 100, 32, 'crm_sources', '#eff6ff', '#2563eb');
  s += svgArrow(470, 117, 320, 145);
  s += svgBoxSimple(540, 85, 110, 32, 'crm_lead_types', '#eff6ff', '#2563eb');
  s += svgArrow(595, 117, 340, 145);
  // Children of crm_leads
  const kids = [
    ['crm_tasks', 30, 220], ['crm_activities', 150, 220], ['crm_lead_comments', 280, 220],
    ['lead_members', 430, 220], ['lead_documents', 560, 220],
  ];
  for (const [name, x, y] of kids) {
    s += svgArrow(270, 189, x + 55, 189);
    s += svgArrow(x + 55, 189, x + 55, y);
    s += svgBoxSimple(x, y, 110, 30, name, '#eff6ff', '#2563eb');
  }
  // project link
  s += svgArrow(380, 167, 520, 167);
  s += svgBoxSimple(520, 150, 100, 34, 'projects', '#f0fdfa', '#0f766e');
  s += `<text x="430" y="162" font-size="7" fill="#0f766e" font-family="Consolas">project_id (deal chốt)</text>`;
  return svgWrap('2.3 CRM — crm_leads là trung tâm liên kết', s, 780, 280);
}

function renderOrderDiagram() {
  let s = '';
  s += svgBoxSimple(40, 40, 120, 36, 'crm_leads', '#dbeafe', '#1d4ed8');
  s += svgBoxSimple(40, 120, 120, 32, 'customers', '#ecfdf5', '#059669');
  s += svgArrow(100, 76, 100, 120);
  s += svgArrow(160, 58, 240, 58);
  s += svgBoxSimple(240, 40, 120, 36, 'quotations', '#fff7ed', '#ea580c');
  s += svgArrow(300, 76, 300, 100);
  s += svgBoxSimple(240, 100, 120, 32, 'quotation_items', '#fff7ed', '#ea580c');
  s += svgArrow(360, 58, 440, 58);
  s += svgBoxSimple(440, 40, 110, 36, 'orders', '#fff7ed', '#c2410c');
  s += svgArrow(495, 76, 495, 100);
  s += svgBoxSimple(440, 100, 110, 32, 'order_items', '#fff7ed', '#c2410c');
  s += svgArrow(550, 58, 620, 58);
  s += svgBoxSimple(620, 40, 100, 36, 'invoices', '#fef3c7', '#b45309');
  s += svgArrow(160, 136, 260, 136); s += svgArrow(260, 76, 260, 120);
  s += svgBoxSimple(500, 150, 100, 32, 'projects', '#f0fdfa', '#0f766e');
  s += svgArrow(495, 132, 550, 150);
  return svgWrap('2.4 Đơn hàng & Báo giá — Chuỗi quotation → order → invoice', s, 780, 220);
}

function renderProductionDiagram() {
  let s = '';
  s += svgBoxSimple(40, 50, 130, 40, 'crm_leads\n(deal chốt)', '#dbeafe', '#1d4ed8');
  s += svgArrow(105, 90, 105, 120); s += svgArrow(170, 70, 230, 70);
  s += svgBoxSimple(230, 50, 120, 40, 'projects ★', '#ccfbf1', '#0f766e');
  s += svgBoxSimple(40, 120, 100, 32, 'customers', '#ecfdf5', '#059669');
  s += svgArrow(90, 120, 230, 80);
  s += svgBoxSimple(380, 30, 100, 32, 'companies', '#f5f3ff', '#7c3aed');
  s += svgArrow(430, 62, 320, 70);
  s += svgBoxSimple(380, 80, 160, 32, 'workshop_project_types', '#f0fdfa', '#0f766e');
  s += svgArrow(460, 112, 350, 90);
  s += svgBoxSimple(530, 50, 180, 40, 'production_pipeline_stages', '#f0fdfa', '#0f766e');
  s += svgArrow(530, 70, 350, 70);
  s += svgArrow(290, 90, 290, 130);
  s += svgBoxSimple(250, 130, 100, 32, 'tasks', '#f0fdfa', '#0f766e');
  s += svgArrow(300, 162, 300, 185);
  s += svgBoxSimple(240, 185, 120, 30, 'task_checklists', '#f0fdfa', '#0f766e');
  s += svgArrow(350, 90, 400, 130);
  s += svgBoxSimple(400, 130, 150, 32, 'project_production_staff', '#f0fdfa', '#0f766e');
  s += svgArrow(350, 90, 400, 175);
  s += svgBoxSimple(400, 175, 160, 32, 'project_company_assignments', '#f0fdfa', '#0f766e');
  s += svgBoxSimple(560, 120, 120, 32, 'workflow_stages', '#ecfeff', '#0891b2');
  s += svgArrow(620, 120, 620, 90);
  s += svgBoxSimple(560, 170, 130, 32, 'crm_pipeline_stages', '#eff6ff', '#2563eb');
  s += svgArrow(625, 170, 625, 90);
  s += `<text x="555" y="210" font-size="7" fill="#64748b">crm_target_stage_id (đồng bộ CRM)</text>`;
  return svgWrap('2.5 Sản xuất — projects trung tâm, gắn pipeline & tasks', s, 780, 240);
}

function renderRelationshipTable(rels) {
  const rows = rels.map((r) => `<tr>
    <td><code>${esc(r.from)}</code></td>
    <td><code>${esc(r.from_col)}</code></td>
    <td class="arrow">→</td>
    <td><code>${esc(r.to)}</code></td>
    <td><code>${esc(r.to_col)}</code></td>
    <td>${esc(r.card || '')}</td>
    <td class="hint">${esc(r.note || '')}</td>
  </tr>`).join('');
  return `<table class="rel-table">
    <thead><tr><th>Bảng nguồn</th><th>Cột FK</th><th></th><th>Bảng đích</th><th>Cột đích</th><th>Cardinality</th><th>Ghi chú</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderDiagramsSection(rels) {
  const byGroup = {
    ecosystem: 'Hệ sinh thái',
    customer: 'Khách hàng',
    crm: 'CRM',
    order: 'Đơn hàng & Báo giá',
    production: 'Sản xuất',
  };
  let html = renderOverviewDiagram();
  html += renderEcosystemDiagram();
  html += renderCrmDiagram();
  html += renderOrderDiagram();
  html += renderProductionDiagram();
  html += `<div class="page-break"></div><h3>2.6 Bảng tổng hợp liên kết (${rels.length} quan hệ)</h3>`;
  for (const [g, title] of Object.entries(byGroup)) {
    const grp = rels.filter((r) => r.group === g);
    if (!grp.length) continue;
    html += `<h4>${esc(title)} (${grp.length})</h4>${renderRelationshipTable(grp)}`;
  }
  return html;
}

function renderFieldTable(tableName, cols) {
  if (!cols?.length) return '<p><em>Không có dữ liệu cột.</em></p>';
  const rows = cols.map((c) => {
    const hint = hintFor(c.column_name);
    return `<tr>
      <td><code>${esc(c.column_name)}</code></td>
      <td>${esc(shortType(c.data_type))}</td>
      <td>${c.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}</td>
      <td class="def">${esc(shortDefault(c.column_default))}</td>
      <td class="hint">${esc(hint)}</td>
    </tr>`;
  }).join('');
  return `<table class="fields">
    <thead><tr><th>Trường</th><th>Kiểu</th><th>Ràng buộc</th><th>Mặc định</th><th>Ghi chú</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildHtml(schema, rels) {
  const flow = `Tenant / Khối (ecosystem_units)
  → Công ty (companies)
    → Khách hàng (customers)
      → Lead (crm_leads, type = 'lead')
        → Deal (crm_leads, type = 'deal')
          → Báo giá (quotations) → Đơn hàng (orders)
            → Dự án SX (projects) → Nhiệm vụ (tasks)`;

  let body = '';
  for (const sec of SECTIONS) {
    body += `<h2>${esc(sec.title)}</h2>`;
    if (sec.intro) {
      body += `<div class="flow">${esc(flow)}</div>`;
      body += `<div class="notes"><strong>Quy ước:</strong> Bảng <code>crm_leads</code> chứa cả Lead và Deal (<code>type</code>). Stage <code>is_won=true</code> → tự tạo <code>projects</code>. Có 2 loại task: <code>crm_tasks</code> (CRM) và <code>tasks</code> (SX).</div>`;
      continue;
    }
    if (sec.diagrams) {
      body += renderDiagramsSection(rels);
      continue;
    }
    if (sec.outro) {
      body += `<h3>Ghi chú quan trọng</h3><ol>
        <li><code>crm_leads</code> = Lead + Deal — không có bảng deals riêng.</li>
        <li>Deal chốt → <code>projects</code> + <code>crm_leads.project_id</code>.</li>
        <li><code>orders</code> liên kết quotation, lead, project.</li>
        <li><code>production_pipeline_stages</code> = cột Kanban SX; <code>workflow_stages</code> = giai đoạn chuẩn.</li>
        <li><code>lead_documents</code> + <code>crm_lead_comments</code> dùng chia sẻ file CRM ↔ SX.</li>
        <li>Liên kết dựa trên cột <code>*_id</code> và quy tắc nghiệp vụ (một số không có FK constraint trong DB).</li>
      </ol>`;
      const summaryRows = TABLE_LIST.map((t) => {
        const n = schema[t]?.length ?? 0;
        const linkCount = rels.filter((r) => r.from === t || r.to === t).length;
        return `<tr><td><code>${t}</code></td><td>${esc(TABLE_DESC[t] || '')}</td><td>${n}</td><td>${linkCount}</td></tr>`;
      }).join('');
      body += `<h3>Tổng hợp số trường & liên kết / bảng</h3>
        <table class="summary"><thead><tr><th>Bảng</th><th>Mô tả</th><th>Số trường</th><th>Số liên kết</th></tr></thead><tbody>${summaryRows}</tbody></table>`;
      continue;
    }
    for (const t of sec.tables) {
      const cols = schema[t] || [];
      body += `<div class="table-block">
        <h3><code>${esc(t)}</code> <span class="count">${cols.length} trường</span></h3>
        <p class="tbl-desc">${esc(TABLE_DESC[t] || '')}</p>
        ${renderFieldTable(t, cols)}
      </div>`;
    }
  }

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>Cấu trúc chi tiết — Hệ sinh thái · CRM · KH · Đơn hàng · SX</title>
  <style>
    @page { size: A4 landscape; margin: 12mm 10mm 14mm 10mm; }
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", Arial, sans-serif; font-size: 8.5pt; line-height: 1.4; color: #1e293b; margin: 0; }
    h1 { font-size: 16pt; color: #312e81; margin: 0 0 4px; }
    .subtitle { font-size: 9.5pt; color: #475569; }
    .meta { font-size: 8pt; color: #64748b; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 2px solid #c7d2fe; }
    h2 { font-size: 11pt; color: #4338ca; margin: 14px 0 6px; page-break-after: avoid; border-left: 4px solid #6366f1; padding-left: 8px; }
    h3 { font-size: 9.5pt; color: #1e40af; margin: 10px 0 4px; page-break-after: avoid; }
    h3 .count { font-size: 8pt; color: #64748b; font-weight: normal; }
    .tbl-desc { margin: 0 0 4px; color: #475569; font-size: 8pt; }
    .flow, .diagram, .notes {
      background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 5px;
      padding: 8px 10px; font-family: Consolas, monospace; font-size: 7.5pt;
      white-space: pre-wrap; margin: 6px 0 10px; page-break-inside: avoid;
    }
    .notes { font-family: "Segoe UI", Arial, sans-serif; font-size: 8pt; background: #f0fdf4; border-color: #bbf7d0; }
    table.fields, table.summary { width: 100%; border-collapse: collapse; font-size: 7pt; margin: 0 0 10px; }
    table.fields th, table.fields td, table.summary th, table.summary td {
      border: 1px solid #e2e8f0; padding: 3px 5px; vertical-align: top; text-align: left;
    }
    table.fields th, table.summary th { background: #f1f5f9; color: #334155; }
    table.fields td.def { font-family: Consolas, monospace; font-size: 6.5pt; max-width: 120px; word-break: break-all; }
    table.fields td.hint { color: #475569; font-size: 6.5pt; }
    table.rel-table { width: 100%; border-collapse: collapse; font-size: 6.5pt; margin: 0 0 12px; }
    table.rel-table th, table.rel-table td { border: 1px solid #e2e8f0; padding: 2px 4px; vertical-align: top; }
    table.rel-table th { background: #ede9fe; color: #4338ca; }
    table.rel-table td.arrow { text-align: center; color: #6366f1; font-weight: bold; width: 16px; }
    .svg-wrap { margin: 8px 0 14px; page-break-inside: avoid; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 8px; background: #fafafa; }
    .svg-title { margin: 0 0 4px; font-size: 8.5pt; color: #4338ca; font-weight: 600; }
    h4 { font-size: 8.5pt; color: #475569; margin: 8px 0 4px; }
    .page-break { page-break-before: always; }
    code { font-family: Consolas, monospace; font-size: 7pt; background: #f1f5f9; padding: 0 3px; border-radius: 2px; }
    .table-block { page-break-inside: avoid; margin-bottom: 8px; }
    ol { margin: 4px 0; padding-left: 18px; }
    li { margin: 2px 0; }
    .footer-note { margin-top: 16px; font-size: 7pt; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 6px; }
  </style>
</head>
<body>
  <h1>Cấu trúc chi tiết hệ thống QLCV</h1>
  <p class="subtitle">Hệ sinh thái · CRM · Khách hàng · Đơn hàng · Sản xuất — trường dữ liệu &amp; sơ đồ liên kết</p>
  <p class="meta">TuBep Pro · ${TABLE_LIST.length} bảng · Cập nhật: ${new Date().toLocaleDateString('vi-VN')} · Landscape A4</p>
  ${body}
  <p class="footer-note">TuBep Pro · Tài liệu schema nội bộ · Sinh tự động từ information_schema</p>
</body>
</html>`;
}

// ── Main ──
console.log('Fetching schema from database…');
const schema = await fetchSchema();
const found = Object.keys(schema).length;
console.log(`Loaded ${found} tables`);
if (found < 10) throw new Error('Không đủ bảng — kiểm tra kết nối DB');

const relationships = loadRelationships();
console.log(`Loaded ${relationships.length} relationships`);

const html = buildHtml(schema, relationships);
fs.writeFileSync(outHtml, html, 'utf8');
console.log('Wrote', outHtml);

let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch {
  try {
    puppeteer = require(path.join(root, 'backend/node_modules/puppeteer'));
  } catch {
    const { execSync } = await import('child_process');
    execSync('npm install puppeteer --no-save', { cwd: path.join(root, 'backend'), stdio: 'inherit' });
    puppeteer = require(path.join(root, 'backend/node_modules/puppeteer'));
  }
}

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();
await page.goto(`file:///${outHtml.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0', timeout: 120_000 });
await page.pdf({
  path: outPdf,
  format: 'A4',
  landscape: true,
  printBackground: true,
  margin: { top: '10mm', right: '8mm', bottom: '12mm', left: '8mm' },
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: '<div style="width:100%;font-size:7px;color:#94a3b8;text-align:center;"><span>TuBep Pro — Cấu trúc chi tiết hệ thống</span> · <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
});
await browser.close();

const stat = fs.statSync(outPdf);
const totalCols = Object.values(schema).reduce((s, c) => s + c.length, 0);
console.log(`PDF ready: ${outPdf}`);
console.log(`  ${found} bảng, ${totalCols} trường, ${relationships.length} liên kết, ${(stat.size / 1024).toFixed(0)} KB`);
