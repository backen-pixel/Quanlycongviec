/**
 * Parser XLSX cutlist — dùng `xlsx` (đã có trong package).
 * Đọc sheet đầu tiên, header row 1, áp cùng quy tắc tên cột với CSV parser.
 */

const XLSX = require('xlsx');
const csv = require('./csvParser');

module.exports = {
  key: 'xlsx',
  exts: ['.xlsx', '.xls', '.ods'],
  status: 'ready',
  canParse(file) {
    return ['.xlsx', '.xls', '.ods'].includes(String(file.ext || '').toLowerCase());
  },
  async parse(buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const firstSheet = wb.SheetNames[0];
    if (!firstSheet) return { items: [], meta: { sheets: 0 } };
    const sheet = wb.Sheets[firstSheet];
    const rows = XLSX.utils.sheet_to_csv(sheet, { FS: ',', RS: '\n' });
    // Tận dụng csv parser để giữ logic tên cột nhất quán.
    const out = await csv.parse(Buffer.from(rows, 'utf8'));
    return {
      items: out.items,
      meta: { ...(out.meta || {}), sheet_name: firstSheet, total_sheets: wb.SheetNames.length },
    };
  },
};
