/**
 * Test offline cho fcmTrayTag (services/pushSender.js): thông báo FCM của tin chat phải mang đúng thẻ `msg:<mã tin>` của thông báo
 * cục bộ trong app (xem sx-mobile/src/lib/localMessengerNotification.ts) để hệ thống gộp hai thông báo làm một.
 * Chạy: node tests/push-tray-tag.js
 */
const assert = require('assert');

// pushSender kéo theo cấu hình Supabase khi nạp; chặn lại để test chạy offline.
const Module = require('module');
const origLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request.endsWith('config/supabase')) return { supabase: {} };
  return origLoad.call(this, request, parent, isMain);
};
const { fcmTrayTag } = require('../src/services/pushSender');
Module._load = origLoad;

let passed = 0;
const ok = (n) => { passed += 1; console.log('ok -', n); };

// 1) tin chat có mã → thẻ giống thông báo cục bộ
assert.strictEqual(fcmTrayTag({ id: 'n-1', type: 'messenger_chat' }, { message_id: 'abc-123' }), 'msg:abc-123');
ok('messenger_chat có message_id → msg:<mã tin>');

assert.strictEqual(fcmTrayTag({ id: 'n-2', type: 'lead_chat' }, { message_id: 'm9' }), 'msg:m9');
assert.strictEqual(fcmTrayTag({ id: 'n-3', type: 'department_chat' }, { message_id: 'm10' }), 'msg:m10');
ok('lead_chat và department_chat cũng dùng thẻ theo mã tin');

// 2) mã tin ở chính notification (không nằm trong metadata)
assert.strictEqual(fcmTrayTag({ id: 'n-4', type: 'messenger_chat', message_id: 'zzz' }, {}), 'msg:zzz');
ok('message_id nằm ngoài metadata vẫn nhận');

// 3) chat nhưng không có mã tin → giữ thẻ cũ (mã thông báo)
assert.strictEqual(fcmTrayTag({ id: 'n-5', type: 'messenger_chat' }, {}), 'n-5');
assert.strictEqual(fcmTrayTag({ id: 'n-6', type: 'messenger_chat' }, { message_id: '   ' }), 'n-6');
assert.strictEqual(fcmTrayTag({ id: 'n-7', type: 'messenger_chat' }, undefined), 'n-7');
ok('chat không có mã tin → thẻ cũ');

// 4) loại khác không bị ảnh hưởng
assert.strictEqual(fcmTrayTag({ id: 'n-8', type: 'comment_added' }, { message_id: 'm1' }), 'n-8');
assert.strictEqual(fcmTrayTag({ type: 'comment_added' }, {}), 'comment_added');
assert.strictEqual(fcmTrayTag({}, {}), 'sx');
ok('loại không phải chat giữ nguyên hành vi cũ');

console.log(`\n${passed} kiểm tra đạt`);
