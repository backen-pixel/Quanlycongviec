const fs = require('fs');
const path = require('path');
const { SECRET_COLUMNS } = require('./nextgoInstanceSpec');

async function fetchAll(sb, table, apply, attempt = 0) {
  const page = 1000;
  let from = 0;
  const out = [];
  try {
    for (;;) {
      let q = sb.from(table).select('*');
      if (apply) q = apply(q);
      const { data, error } = await q.range(from, from + page - 1);
      if (error) throw new Error(`${table} select: ${error.message}`);
      out.push(...(data || []));
      if (!data || data.length < page) break;
      from += page;
    }
    return out;
  } catch (e) {
    if (attempt < 3 && /fetch failed|network|ECONNRESET|ETIMEDOUT/i.test(String(e.message))) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      return fetchAll(sb, table, apply, attempt + 1);
    }
    throw e;
  }
}

async function fetchInChunks(sb, table, col, ids, extra) {
  const out = [];
  const uniq = [...new Set((ids || []).filter((x) => x != null && x !== ''))];
  const chunk = 80;
  for (let i = 0; i < uniq.length; i += chunk) {
    const part = uniq.slice(i, i + chunk);
    const rows = await fetchAll(sb, table, (q) => {
      let nq = q.in(col, part);
      if (extra) nq = extra(nq);
      return nq;
    });
    out.push(...rows);
  }
  return out;
}

function redactRow(row, includeSecrets) {
  if (includeSecrets || !row) return row;
  const o = { ...row };
  for (const k of SECRET_COLUMNS) {
    if (k in o && o[k] != null && o[k] !== '') o[k] = '__REDACTED__';
  }
  return o;
}

function writeNdjson(dir, table, rows) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${table}.ndjson`);
  const fd = fs.createWriteStream(file, { encoding: 'utf8' });
  for (const r of rows) fd.write(`${JSON.stringify(r)}\n`);
  fd.end();
  return new Promise((resolve, reject) => {
    fd.on('finish', resolve);
    fd.on('error', reject);
  });
}

function readNdjson(dir, table) {
  const file = path.join(dir, `${table}.ndjson`);
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) return [];
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function idsOf(rows, field = 'id') {
  return (rows || []).map((r) => r[field]).filter((x) => x != null && x !== '');
}

async function insertRows(sb, table, rows, chunk = 80) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await sb.from(table).upsert(slice, { onConflict: 'id' });
    if (error) throw new Error(`${table} upsert [${i}]: ${error.message}`);
    process.stdout.write(`  ${table} ${Math.min(i + slice.length, rows.length)}/${rows.length}\r`);
  }
  console.log(`  ${table} ${rows.length}/${rows.length} ok`);
}

module.exports = {
  fetchAll,
  fetchInChunks,
  redactRow,
  writeNdjson,
  readNdjson,
  idsOf,
  insertRows,
};
