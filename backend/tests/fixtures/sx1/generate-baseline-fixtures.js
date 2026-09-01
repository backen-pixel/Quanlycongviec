'use strict';

const fs = require('node:fs');
const path = require('node:path');

const modulePath = process.argv[2];
if (!modulePath) {
  throw new Error('Usage: node generate-baseline-fixtures.js <path-to-xlsx-module>');
}

const XLSX = require(path.resolve(modulePath));
if (XLSX.version !== '0.18.5') {
  throw new Error(`Fixture generator requires xlsx@0.18.5, received ${XLSX.version}`);
}

const workbook = XLSX.utils.book_new();
const sheet = XLSX.utils.aoa_to_sheet([
  ['Tiếng Việt', 'Số tiền', 'Ngày', 'Công thức'],
  ['Tủ bếp chữ L – Đặng Ánh', 1234567.89, new Date('2026-09-01T00:00:00.000Z'), null],
], { cellDates: true });
sheet.D2 = { t: 'n', f: 'B2*2', v: 2469135.78 };
sheet.C2.z = 'yyyy-mm-dd';
sheet['!ref'] = 'A1:D2';
XLSX.utils.book_append_sheet(workbook, sheet, 'Dữ liệu');
workbook.Props = {
  Title: 'SX-1 compatibility fixture',
  Comments: 'Generated with xlsx@0.18.5 before the controlled upgrade',
};

for (const [extension, bookType] of [['xls', 'biff8'], ['xlsx', 'xlsx'], ['ods', 'ods']]) {
  const output = XLSX.write(workbook, { type: 'buffer', bookType, cellDates: true });
  fs.writeFileSync(path.join(__dirname, `baseline-0.18.5.${extension}`), output);
}
