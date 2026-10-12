// Pure helpers for the «Chuyển đổi website» panel (W4). No network here.

export const PROVIDERS = [
  { value: 'GOOGLE', label: 'Google Ads' },
  { value: 'TIKTOK', label: 'TikTok Ads' },
  { value: 'ZALO', label: 'Zalo Ads' },
  { value: 'CHATGPT', label: 'ChatGPT Ads' },
];

export const formatVnd = amount => Number.isSafeInteger(amount) ? `${new Intl.NumberFormat('vi-VN').format(amount)} đ` : '—';

/** Inclusive Vietnam-date range ending today: last `days` days. */
export function vietnamRange(days, now = Date.now()) {
  const day = ms => new Date(ms + 7 * 3600000).toISOString().slice(0, 10);
  return { from: day(now - (days - 1) * 86400000), to: day(now) };
}

function splitCsvLine(line, sep) {
  const out = []; let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseDay(value) {
  const v = value.trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) { m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) m = [m[0], m[3], m[2].padStart(2, '0'), m[1].padStart(2, '0')]; }
  if (!m) return null;
  const day = `${m[1]}-${m[2]}-${m[3]}`;
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === day ? day : null;
}

/** Whole VND from "1.234.567 ₫", "1,234,567", "1234567" or "1234567.00". */
function parseVnd(value) {
  let v = value.replace(/[^\d.,]/g, '');
  if (!v) return null;
  if (/[.,]\d{1,2}$/.test(v) && !/^\d{1,3}([.,]\d{3})+$/.test(v)) v = v.replace(/[.,]\d{1,2}$/, '');
  v = v.replace(/[.,]/g, '');
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/**
 * Parse spend rows: "ngày, chiến dịch, chi phí" per line (Google Ads report export works:
 * columns Day/Ngày, Campaign/Chiến dịch, Cost/Chi phí). Header line optional.
 */
export function parseSpendCsv(text, provider) {
  const rows = [], errors = [];
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { rows, errors: ['Chưa có dòng nào'] };
  const sep = lines[0].includes('\t') ? '\t' : lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';
  let cols = { day: 0, campaign: 1, cost: 2 };
  const header = splitCsvLine(lines[0], sep).map(h => h.toLowerCase());
  const find = names => header.findIndex(h => names.some(n => h.includes(n)));
  const hasHeader = !parseDay(splitCsvLine(lines[0], sep)[0] || '');
  if (hasHeader) {
    const day = find(['day', 'ngày', 'date']), campaign = find(['campaign', 'chiến dịch']), cost = find(['cost', 'chi phí', 'chi tiêu']);
    if (day < 0 || cost < 0) return { rows, errors: ['Không tìm thấy cột Ngày và Chi phí'] };
    cols = { day, campaign, cost };
  }
  const seen = new Map();
  lines.slice(hasHeader ? 1 : 0).forEach((line, i) => {
    const cells = splitCsvLine(line, sep);
    if (/^(total|tổng)/i.test(cells[0] || '')) return;
    const ngay = parseDay(cells[cols.day] || '');
    const amount = parseVnd(cells[cols.cost] || '');
    const name = cols.campaign >= 0 ? (cells[cols.campaign] || '') : '';
    if (!ngay || amount === null) { errors.push(`Dòng ${i + 1 + (hasHeader ? 1 : 0)}: không đọc được ngày hoặc chi phí`); return; }
    const key = `${ngay}|${name}`;
    if (seen.has(key)) { seen.get(key).chi_tieu_vnd += amount; return; }
    const row = { provider, campaign_key: name.slice(0, 200), campaign_name: name || null, ngay, chi_tieu_vnd: amount };
    seen.set(key, row); rows.push(row);
  });
  return { rows, errors };
}
