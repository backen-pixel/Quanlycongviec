const test = require('node:test');
const assert = require('node:assert/strict');
const plan = require('../scripts/lib/migrationPlan');

test('listMigrations: bỏ rollback và file không đánh số, sắp theo số', () => {
  const files = [
    '720_phone_call_intake_rollback.sql', '100_b.sql', 'fix_x.sql', '20_a.sql',
    '100_a.sql', 'README.md', '722_schema_migrations.sql', '22b_seed.sql',
  ];
  assert.deepEqual(plan.listMigrations(files), [
    '20_a.sql', '22b_seed.sql', '100_a.sql', '100_b.sql', '722_schema_migrations.sql',
  ]);
});

test('checksumOf: CRLF và LF cho cùng checksum', () => {
  assert.equal(plan.checksumOf('a;\r\nb;\r\n'), plan.checksumOf('a;\nb;\n'));
  assert.notEqual(plan.checksumOf('a;'), plan.checksumOf('b;'));
  assert.match(plan.checksumOf(''), /^[0-9a-f]{64}$/);
});

test('computeStatus: pending, changed, missing', () => {
  const files = [
    { filename: '1_a.sql', checksum: 'x' },
    { filename: '2_b.sql', checksum: 'y2' },
    { filename: '3_c.sql', checksum: 'z' },
  ];
  const applied = [
    { filename: '1_a.sql', checksum: 'x', source: 'runner' },
    { filename: '2_b.sql', checksum: 'y1', source: 'baseline' },
    { filename: '0_gone.sql', checksum: 'q', source: 'runner' },
  ];
  assert.deepEqual(plan.computeStatus(files, applied), {
    appliedCount: 2,
    pending: ['3_c.sql'],
    changed: [{ filename: '2_b.sql', source: 'baseline' }],
    missing: ['0_gone.sql'],
  });
});

test('resolveTarget: theo tên, theo số, báo lỗi khi số trùng', () => {
  const m = ['715_a.sql', '715_b.sql', '721_c.sql'];
  assert.equal(plan.resolveTarget('721', m), '721_c.sql');
  assert.equal(plan.resolveTarget('database/715_b.sql', m), '715_b.sql');
  assert.equal(plan.resolveTarget('..\\database\\715_a.sql', m), '715_a.sql');
  assert.throws(() => plan.resolveTarget('715', m), /trùng 2 file/);
  assert.throws(() => plan.resolveTarget('999', m), /Không tìm thấy/);
});

test('recordSql: escape dấu nháy, DO NOTHING mặc định, DO UPDATE khi force', () => {
  const sql = plan.recordSql({ filename: '1_a.sql', checksum: 'c', appliedBy: "o'brien@pc" });
  assert.match(sql, /'o''brien@pc'/);
  assert.match(sql, /DO NOTHING;$/);
  assert.match(sql, /'runner', NULL\)/);
  assert.match(plan.recordSql({ filename: '1_a.sql', checksum: 'c', appliedBy: 'u', force: true }), /DO UPDATE SET checksum/);
});

test('baselineSql: nhiều dòng, rỗng khi không có gì', () => {
  assert.equal(plan.baselineSql([], 'u'), '');
  const sql = plan.baselineSql([{ filename: '1_a.sql', checksum: 'x' }, { filename: '2_b.sql', checksum: 'y' }], 'u');
  assert.equal((sql.match(/'baseline'/g) || []).length, 2);
  assert.match(sql, /ON CONFLICT \(filename\) DO NOTHING;$/);
});

test('checkNewMigrations: số trùng, tên sai, rollback lẻ', () => {
  const all = [
    '720_phone_call_intake.sql', '720_phone_call_intake_rollback.sql',
    '721_knowledge.sql', '721_dup.sql', '722_ok.sql', '722_ok_rollback.sql',
    '723-Bad Name.sql', '724_orphan_rollback.sql',
  ];
  const errors = plan.checkNewMigrations(
    ['721_dup.sql', '722_ok.sql', '722_ok_rollback.sql', '723-Bad Name.sql', '724_orphan_rollback.sql', 'notes.md'],
    all,
  );
  assert.equal(errors.length, 3);
  assert.match(errors[0], /^721_dup\.sql: số 721 đã dùng bởi 721_knowledge\.sql/);
  assert.match(errors[1], /^723-Bad Name\.sql: tên phải dạng/);
  assert.match(errors[2], /^724_orphan_rollback\.sql: không có file migration tương ứng 724_orphan\.sql/);
});

test('migration 722 có trong thư mục thật và không trùng số', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const all = fs.readdirSync(path.join(__dirname, '..', '..', 'database'));
  assert.deepEqual(plan.checkNewMigrations(['722_schema_migrations.sql', '722_schema_migrations_rollback.sql'], all), []);
});
