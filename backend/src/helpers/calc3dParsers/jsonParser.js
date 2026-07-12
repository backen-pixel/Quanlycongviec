/**
 * Parser JSON tổng quát — chấp nhận:
 *   { items: [...] }                       (preferred)
 *   { components: [...] }
 *   [...]
 *
 * Mỗi item: { name|label, w|width|rong, h|height|cao, d|depth|sau, qty|quantity|sl, unit? }
 */

function pickKey(obj, keys) {
  for (const k of keys) if (obj[k] !== undefined) return obj[k];
  return undefined;
}

function unitToMm(v, unit) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const u = String(unit || 'mm').toLowerCase();
  if (u === 'm') return n * 1000;
  if (u === 'cm') return n * 10;
  return n;
}

module.exports = {
  key: 'json',
  exts: ['.json'],
  status: 'ready',
  canParse(file) {
    return String(file.ext || '').toLowerCase() === '.json';
  },
  async parse(buffer) {
    const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer);
    let data;
    try { data = JSON.parse(text); }
    catch (e) { throw new Error(`JSON không hợp lệ: ${e.message}`); }

    const arr = Array.isArray(data) ? data
      : Array.isArray(data.items) ? data.items
      : Array.isArray(data.components) ? data.components
      : Array.isArray(data.parts) ? data.parts
      : [];
    if (!arr.length) return { items: [], meta: { source: 'json', shape: typeof data } };

    const items = arr.map((it, i) => {
      const unit = pickKey(it, ['unit', 'don_vi', 'donvi']) || 'mm';
      return {
        name: String(pickKey(it, ['name', 'label', 'ten', 'component']) || `Item ${i + 1}`),
        w: unitToMm(pickKey(it, ['w', 'width', 'rong']), unit),
        h: unitToMm(pickKey(it, ['h', 'height', 'cao']), unit),
        d: unitToMm(pickKey(it, ['d', 'depth', 'sau', 'thickness', 'thick']), unit),
        qty: Number(pickKey(it, ['qty', 'quantity', 'sl'])) || 1,
        raw: JSON.stringify(it),
      };
    });
    return { items, meta: { source: 'json', count: items.length } };
  },
};
