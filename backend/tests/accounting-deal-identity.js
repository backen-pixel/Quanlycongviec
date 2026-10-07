const assert = require('assert');
const {
  projectNamesDiffer,
  pickWorkshopQuoteFiles,
} = require('../src/helpers/accountingDealIdentity');

assert.equal(projectNamesDiffer('CHÚ ĐẠT TÂN BÌNH', 'CHÚ ĐẠT TÂN PHÚ '), true);
assert.equal(projectNamesDiffer('  Chị Mai  ', 'chị mai'), false);
assert.equal(projectNamesDiffer('', 'Dự án xưởng'), false);
assert.equal(projectNamesDiffer('Deal CRM', ''), false);

const files = pickWorkshopQuoteFiles([
  { file_name: 'anh-hien-truong.jpg', file_url: '/a.jpg', mime_type: 'image/jpeg' },
  { file_name: 'Ghi chú', is_note: true, description: 'không có file' },
  { file_name: 'BG chị Hà.xlsx', file_url: '/bg.xlsx', mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
]);
assert.equal(files.length, 1);
assert.equal(files[0].file_name, 'BG chị Hà.xlsx');
assert.equal(files[0].is_sheet, true);
assert.equal(pickWorkshopQuoteFiles(null).length, 0);

console.log('accounting-deal-identity: ok');
