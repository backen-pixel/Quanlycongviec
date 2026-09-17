const assert = require('assert');
const {
  PROGRESS_REMINDER_KIND,
  PROGRESS_REMINDER_MARKER,
  vnTodayYmd,
  vnStartOfTodayIso,
  isProgressReminderComment,
  buildProgressReminderBody,
} = require('../src/helpers/workUnifiedProgressReminder');

assert.equal(typeof vnTodayYmd(), 'string');
assert.match(vnTodayYmd(), /^\d{4}-\d{2}-\d{2}$/);
assert.ok(vnStartOfTodayIso().startsWith(vnTodayYmd()));
assert.ok(vnStartOfTodayIso().endsWith('+07:00'));

assert.equal(isProgressReminderComment({ comment_type: PROGRESS_REMINDER_KIND }), true);
assert.equal(isProgressReminderComment({ metadata: { kind: PROGRESS_REMINDER_KIND } }), true);
assert.equal(isProgressReminderComment({ body: `⏰ ${PROGRESS_REMINDER_MARKER} — test` }), true);
assert.equal(isProgressReminderComment({ content: `x ${PROGRESS_REMINDER_MARKER} y` }), true);
assert.equal(isProgressReminderComment({ body: 'Bình luận thường' }), false);
assert.equal(isProgressReminderComment(null), false);

const body = buildProgressReminderBody({
  actorName: 'Admin Hệ Thống',
  mentionText: '@Nguyễn Văn A @Trần Thị B',
  code: 'TB-2026-029',
  name: 'Anh Minh',
  delayDays: 5,
  deadline: '2026-09-12T10:00:00+07:00',
});
assert.ok(body.includes(PROGRESS_REMINDER_MARKER));
assert.ok(body.includes('TB-2026-029'));
assert.ok(body.includes('Anh Minh'));
assert.ok(body.includes('trễ hạn 5 ngày'));
assert.ok(body.includes('@Nguyễn Văn A'));
assert.ok(body.includes('cập nhật thông tin tiến độ'));

const noPeople = buildProgressReminderBody({
  actorName: 'Quản lý',
  mentionText: '',
  code: 'TB-1',
  delayDays: 0,
});
assert.ok(noPeople.includes('đang quá hạn'));
assert.ok(noPeople.includes(PROGRESS_REMINDER_MARKER));

console.log('work-unified-progress-reminder: ok');
