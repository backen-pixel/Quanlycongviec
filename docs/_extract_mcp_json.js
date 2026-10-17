const fs = require('fs');
const path = require('path');

function extract(p) {
  const raw = fs.readFileSync(p, 'utf8');
  const j = JSON.parse(raw);
  const text = j.result || '';
  // Prefer the block that contains JSON array
  const re =
    /<untrusted-data-[0-9a-f-]+>\s*(\[[\s\S]*?\])\s*<\/untrusted-data-[0-9a-f-]+>/;
  const m = text.match(re);
  if (!m) throw new Error('no JSON array block in ' + p);
  return JSON.parse(m[1]);
}

const cols = extract(
  'C:/Users/Admin/.cursor/projects/c-Projects-Quanlycongviec/agent-tools/14062e67-94bb-4187-976d-14da5d6f1703.txt'
);
const fks = extract(
  'C:/Users/Admin/.cursor/projects/c-Projects-Quanlycongviec/agent-tools/91a50d34-7d9d-4c8c-bc5b-4842ff135b0a.txt'
);

fs.writeFileSync(
  path.join(__dirname, '_tmp_columns.json'),
  JSON.stringify(cols)
);
fs.writeFileSync(path.join(__dirname, '_tmp_fks.json'), JSON.stringify(fks));
console.log(
  'cols',
  cols.length,
  'tables',
  new Set(cols.map((c) => c.table_name)).size,
  'fks',
  fks.length
);
