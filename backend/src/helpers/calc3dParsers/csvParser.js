/**
 * Parser CSV cutlist.
 *
 * Hỗ trợ header phổ biến (case-insensitive, có/không dấu):
 *   Tên / Name / Component / Part   → name
 *   Rộng / W / Width                 → w
 *   Cao  / H / Height                → h
 *   Sâu  / Dày / D / Depth / Thick   → d
 *   SL   / Qty / Quantity            → qty
 *   Đơn vị / Unit                   → đơn vị áp cho cả file (mm | cm | m)
 */

const COL_MAP = {
  name: ['ten', 'name', 'component', 'part', 'mo ta', 'description', 'item'],
  w: ['rong', 'w', 'width', 'rộng'],
  h: ['cao', 'h', 'height'],
  d: ['sau', 'day', 'd', 'depth', 'thick', 'thickness', 'sâu', 'dày'],
  qty: ['sl', 'qty', 'quantity', 'so luong', 'số lượng'],
  unit: ['don vi', 'unit', 'đơn vị'],
};

function normalize(s) {
  return String(s || '').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function detectColumns(header) {
  const map = {};
  header.forEach((cell, idx) => {
    const n = normalize(cell);
    for (const [field, aliases] of Object.entries(COL_MAP)) {
      if (aliases.includes(n)) { map[field] = idx; break; }
    }
  });
  return map;
}

function unitToMm(value, unit) {
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  const u = String(unit || 'mm').toLowerCase();
  if (u === 'm') return v * 1000;
  if (u === 'cm') return v * 10;
  return v;
}

function parseCsvText(text) {
  // Parser tối giản — không xử lý quote phức tạp; cutlist thường dùng "," hoặc ";".
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return { rows: [], delim: ',' };
  const head = lines[0];
  const delim = (head.match(/;/g) || []).length > (head.match(/,/g) || []).length ? ';' : ',';
  const rows = lines.map((l) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, '')));
  return { rows, delim };
}

module.exports = {
  key: 'csv',
  exts: ['.csv', '.tsv'],
  status: 'ready',
  canParse(file) {
    return ['.csv', '.tsv'].includes(String(file.ext || '').toLowerCase());
  },
  async parse(buffer) {
    const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer);
    const { rows } = parseCsvText(text);
    if (rows.length < 2) return { items: [], meta: { rows: rows.length } };
    const cols = detectColumns(rows[0]);
    if (cols.name === undefined && cols.w === undefined && cols.h === undefined) {
      throw new Error('CSV thiếu cột nhận dạng (Tên/Rộng/Cao/Sâu).');
    }
    const items = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r.length) continue;
      const unit = cols.unit !== undefined ? r[cols.unit] : 'mm';
      const item = {
        name: cols.name !== undefined ? r[cols.name] : `Item ${i}`,
        w: cols.w !== undefined ? unitToMm(r[cols.w], unit) : null,
        h: cols.h !== undefined ? unitToMm(r[cols.h], unit) : null,
        d: cols.d !== undefined ? unitToMm(r[cols.d], unit) : null,
        qty: cols.qty !== undefined ? Number(r[cols.qty]) || 1 : 1,
        raw: r.join(' | '),
      };
      items.push(item);
    }
    return { items, meta: { detected_columns: cols, total_rows: rows.length - 1 } };
  },
};
