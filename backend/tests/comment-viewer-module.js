const assert = require('assert');
const { pickCommentViewerModule } = require('../src/helpers/commentViewerModule');

// NV xưởng Metalla — chỉ module sản xuất, dù deal đã có VC.
assert.strictEqual(pickCommentViewerModule({
  role: 'production_staff',
  driveModule: 'sx',
  moduleKeys: ['production'],
}), 'production');

assert.strictEqual(pickCommentViewerModule({
  role: 'production_staff',
  driveModule: null,
  moduleKeys: [],
}), 'production');

// Sale CRM (Vũ) mở deal CRM.
assert.strictEqual(pickCommentViewerModule({
  role: 'sales',
  driveModule: null,
  moduleKeys: ['crm'],
}), 'crm');

// NV lắp đặt mở VC.
assert.strictEqual(pickCommentViewerModule({
  role: 'installer',
  driveModule: 'vc',
  moduleKeys: ['logistics'],
}), 'logistics');

assert.strictEqual(pickCommentViewerModule({
  role: 'driver',
  driveModule: null,
  moduleKeys: [],
}), 'logistics');

// Gán đúng một module thì ưu tiên module đó.
assert.strictEqual(pickCommentViewerModule({
  role: 'admin',
  driveModule: 'sx',
  moduleKeys: ['crm'],
}), 'crm');

console.log('comment-viewer-module: ok');
