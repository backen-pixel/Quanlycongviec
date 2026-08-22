import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentDir = process.env.CURSOR_AGENT_TOOLS
  || path.join(process.env.USERPROFILE || '', '.cursor/projects/c-Projects-Quanlycongviec/agent-tools');
const out = path.join(__dirname, 'schema-columns.json');

function extractRowsFromFile(raw) {
  const rows = [];
  // MCP tool output: {"result":"...<untrusted-data>\\n[{...}]\\n</untrusted-data>..."}
  try {
    const outer = JSON.parse(raw.trim());
    const text = outer.result || raw;
    const start = text.indexOf('[{"table_name"');
    const end = text.lastIndexOf('}]');
    if (start >= 0 && end > start) {
      rows.push(...JSON.parse(text.slice(start, end + 2)));
    }
  } catch {
    const start = raw.indexOf('[{"table_name"');
    const end = raw.lastIndexOf('}]');
    if (start >= 0 && end > start) {
      rows.push(...JSON.parse(raw.slice(start, end + 2)));
    }
  }
  return rows;
}

const files = fs.existsSync(agentDir) ? fs.readdirSync(agentDir).map((f) => path.join(agentDir, f)) : [];
const all = [];
for (const f of files) {
  if (!f.endsWith('.txt')) continue;
  try {
    all.push(...extractRowsFromFile(fs.readFileSync(f, 'utf8')));
  } catch {
    // skip
  }
}

const seen = new Set();
const rows = [];
for (const r of all) {
  if (!r?.table_name || !r?.column_name) continue;
  const k = `${r.table_name}|${r.column_name}`;
  if (seen.has(k)) continue;
  seen.add(k);
  rows.push({
    table_name: r.table_name,
    column_name: r.column_name,
    data_type: r.data_type,
    is_nullable: r.is_nullable,
    column_default: r.column_default ?? null,
  });
}

rows.sort((a, b) => a.table_name.localeCompare(b.table_name) || a.column_name.localeCompare(b.column_name));
fs.writeFileSync(out, JSON.stringify(rows, null, 2), 'utf8');

const by = {};
for (const r of rows) by[r.table_name] = (by[r.table_name] || 0) + 1;
console.log(`Wrote ${out}`);
console.log(`${rows.length} columns across ${Object.keys(by).length} tables`);
