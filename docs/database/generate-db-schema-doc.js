/**
 * Generate docs/database/DATABASE_SCHEMA.md from exported column JSON + table list.
 * Usage: node docs/database/generate-db-schema-doc.js [columns.json]
 * columns.json = array of {table_name, column_name, data_type, udt_name, is_nullable, column_default, ordinal_position}
 */
const fs = require('fs');
const path = require('path');

const COLS_FILE = process.argv[2] || path.resolve(__dirname, '../_tmp_columns.json');
const OUT_MD = path.resolve(__dirname, 'DATABASE_SCHEMA.md');

function groupTables(name) {
  if (/^(tenant|ecosystem|compan|department|division|team|role|permission|user_|users$|saas_)/.test(name)) return '01_org';
  if (/^(crm_|lead_|customer|deal_|event_types$|crm)/.test(name)) return '02_crm';
  if (/^(quotation|order|invoice|payment_|product|supplier|purchase_)/.test(name)) return '03_commercial';
  if (/^(project|task|production_|workshop_|logistics_|sx_|workflow_|flow_)/.test(name)) return '04_production';
  if (/^(drive_|file_|voice_|knowledge_|messenger_|internal_social|notification|push_)/.test(name)) return '05_collab';
  if (/^(facebook_|zalo_|ai_|calc_|kpi_|app_|external_|misa_|geocode|code_|trash_|unified_|system_|supabase_|auth_|activity_|mobile_)/.test(name)) return '06_platform';
  return '07_other';
}

const GROUP_TITLE = {
  '01_org': 'Tổ chức / Tenant / Phân quyền',
  '02_crm': 'CRM / Lead / Deal / Event',
  '03_commercial': 'Báo giá / Đơn hàng / Sản phẩm / Mua hàng',
  '04_production': 'Dự án / SX / VC / Workflow / Task',
  '05_collab': 'Drive / Messenger / Knowledge / Notification',
  '06_platform': 'Tích hợp / AI / KPI / App / External',
  '07_other': 'Khác',
};

function typeOf(c) {
  if (c.udt_name === 'uuid') return 'uuid';
  if (c.udt_name === 'jsonb') return 'jsonb';
  if (c.udt_name === 'json') return 'json';
  if (c.udt_name === 'text') return 'text';
  if (c.udt_name === 'bool') return 'boolean';
  if (c.udt_name === 'int4') return 'integer';
  if (c.udt_name === 'int8') return 'bigint';
  if (c.udt_name === 'numeric') return 'numeric';
  if (c.udt_name === 'float8') return 'double';
  if (c.udt_name === 'timestamptz') return 'timestamptz';
  if (c.udt_name === 'timestamp') return 'timestamp';
  if (c.udt_name === 'date') return 'date';
  if (c.udt_name === '_text') return 'text[]';
  if (c.udt_name === '_uuid') return 'uuid[]';
  return c.udt_name || c.data_type;
}

function main() {
  const raw = JSON.parse(fs.readFileSync(COLS_FILE, 'utf8'));
  const cols = Array.isArray(raw) ? raw : raw.columns || raw.result || [];
  if (!cols.length) {
    console.error('No columns in', COLS_FILE);
    process.exit(1);
  }

  const byTable = new Map();
  for (const c of cols) {
    if (!byTable.has(c.table_name)) byTable.set(c.table_name, []);
    byTable.get(c.table_name).push(c);
  }
  for (const [, list] of byTable) list.sort((a, b) => a.ordinal_position - b.ordinal_position);

  const tables = [...byTable.keys()].sort();
  const groups = new Map();
  for (const t of tables) {
    const g = groupTables(t);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(t);
  }

  let md = '';
  md += '# Database Schema — Quanlycongviec (Tủ Bếp Pro)\n\n';
  md += `Schema **public** PostgreSQL (Supabase) — **đầy đủ mọi bảng và cột**.\n\n`;
  md += `- Cập nhật: **${new Date().toISOString().slice(0, 10)}**\n`;
  md += `- Số bảng: **${tables.length}**\n`;
  md += `- Số cột (tổng): **${cols.length}**\n`;
  md += `- Views: \`unified_tasks_v\`, \`v_crm_kpi_user_period\`, \`v_kpi_user_offdays\`, \`v_quotations_with_scope\`\n`;
  md += `- Regenerate: \`node docs/database/generate-db-schema-doc.js docs/_tmp_columns.json\`\n\n`;
  md += `> FK constraints có thể không lộ qua \`information_schema\` trên một số project Supabase; quan hệ nghiệp vụ xem mục 2 và \`docs/architecture/cau-truc-he-thong-co-ban/\`.\n\n`;
  md += `---\n\n## 1. Mục lục bảng theo nhóm\n\n`;

  for (const g of [...groups.keys()].sort()) {
    const list = groups.get(g);
    md += `### ${GROUP_TITLE[g]} (${list.length})\n\n`;
    md += list.map((t) => `- [\`${t}\`](#${t}) — ${byTable.get(t).length} cột`).join('\n') + '\n\n';
  }

  md += `---\n\n## 2. Luồng nghiệp vụ lõi\n\n`;
  md += '```\n';
  md += 'tenants / ecosystem_units → companies → users\n';
  md += 'customers → crm_leads (lead|deal) → crm_tasks\n';
  md += '         → quotations → orders → invoices\n';
  md += '         → projects (won) ↔ crm_deal_projects\n';
  md += '         → tasks (SX/VC) → logistics / accounting\n';
  md += '```\n\n';
  md += `| Quy ước | Chi tiết |\n|---|---|\n`;
  md += `| Lead+Deal | \`crm_leads.type\` |\n`;
  md += `| Stage order | \`order_index\` |\n`;
  md += `| Deal↔Project | \`crm_leads.project_id\` + \`crm_deal_projects\` |\n`;
  md += `| Task CRM / SX | \`crm_tasks\` / \`tasks\` |\n\n`;

  md += `---\n\n## 3. Chi tiết cột từng bảng\n\n`;

  for (const t of tables) {
    const list = byTable.get(t);
    md += `<a id="${t}"></a>\n\n### \`${t}\`\n\n`;
    md += `| # | Cột | Kiểu | Null | Default |\n|---|---|---|---|---|\n`;
    for (const c of list) {
      const def = c.column_default == null ? '' : String(c.column_default).replace(/\|/g, '\\|').replace(/\n/g, ' ');
      if (def.length > 60) {
        md += `| ${c.ordinal_position} | \`${c.column_name}\` | ${typeOf(c)} | ${c.is_nullable} | \`${def.slice(0, 57)}...\` |\n`;
      } else {
        md += `| ${c.ordinal_position} | \`${c.column_name}\` | ${typeOf(c)} | ${c.is_nullable} | ${def ? '`' + def + '`' : ''} |\n`;
      }
    }
    md += `\n`;
  }

  const fkFile = path.resolve(__dirname, '_tmp_fks.json');
  if (fs.existsSync(fkFile)) {
    const fks = JSON.parse(fs.readFileSync(fkFile, 'utf8'));
    md += `---\n\n## 4. Foreign keys (pg_catalog, ${fks.length})\n\n`;
    md += `| Bảng | Cột | → Bảng | → Cột |\n|---|---|---|---|\n`;
    for (const fk of fks) {
      const t = String(fk.table_name).replace(/^public\./, '');
      const ft = String(fk.foreign_table).replace(/^public\./, '');
      md += `| \`${t}\` | \`${fk.column_name}\` | \`${ft}\` | \`${fk.foreign_column}\` |\n`;
    }
    md += `\n`;
  }

  md += `---\n\n## 5. Liên quan\n\n- \`docs/api/API_DOCUMENT.md\`\n- \`docs/project/CODING_STANDARD.md\`\n- \`docs/architecture/cau-truc-he-thong-co-ban/\`\n`;

  fs.writeFileSync(OUT_MD, md, 'utf8');
  console.log('Wrote', OUT_MD, 'tables', tables.length, 'cols', cols.length, 'bytes', fs.statSync(OUT_MD).size);
}

main();
