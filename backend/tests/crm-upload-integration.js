/**
 * Part V: Upload & integration bằng mock/sandbox — adapter Google Drive mirror.
 *
 * Chứng minh: tích hợp ngoài (Google Drive) dùng MOCK, KHÔNG gọi tài khoản Production.
 *  - Cờ tắt → skip, không gọi Drive.
 *  - Drive chưa cấu hình → skip gdrive_not_configured.
 *  - Note (không file) → bỏ qua.
 *  - Đã mirror (source_drive_file_id) → skip already_mirrored (không upload trùng).
 *  - Upload thành công → trả fileRow.
 *  - Adapter timeout/lỗi → nuốt lỗi, KHÔNG ném ra request (upload CRM vẫn thành công), reason được sanitize.
 *
 * Chạy: npm run test:crm-upload
 */
process.env.REDIS_DISABLED = '1';

const assert = require('assert');

// ── State điều khiển mock ──────────────────────────────────────────────────
const state = {
  lead: { id: 'lead-1', type: 'deal', project_id: null },
  download: { data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }, error: null },
  fileRow: { id: 'drive-file-1' },
  fileErr: null,
  gdrive: { configured: true, throwOnUpload: null },
  uploads: 0,
  upserts: [],
};

function resetState() {
  state.lead = { id: 'lead-1', type: 'deal', project_id: null };
  state.fileRow = { id: 'drive-file-1' };
  state.fileErr = null;
  state.gdrive = { configured: true, throwOnUpload: null };
  state.uploads = 0;
  state.upserts = [];
}

// ── Fake supabase (đủ cho luồng mirror) ────────────────────────────────────
function makeBuilder(table) {
  const b = {
    _table: table, _op: 'select', _payload: null,
    select() { return b; },
    eq() { return b; },
    limit() { return b; },
    insert(p) { b._op = 'insert'; b._payload = p; return b; },
    update(p) { b._op = 'update'; b._payload = p; return b; },
    upsert(p) { b._op = 'upsert'; b._payload = p; state.upserts.push({ table, p }); return b; },
    maybeSingle: async () => resolve(),
    single: async () => resolve(),
    then: (f, r) => Promise.resolve(resolve()).then(f, r),
  };
  function resolve() {
    if (table === 'crm_leads') return { data: state.lead, error: null };
    if (table === 'drive_files' && b._op === 'insert') return { data: state.fileRow, error: state.fileErr };
    return { data: null, error: null };
  }
  return b;
}
const fakeSupabase = {
  from: (t) => makeBuilder(t),
  storage: { from: () => ({ download: async () => state.download }) },
};

// ── Inject fake supabase + mock services TRƯỚC khi load module ──────────────
function inject(rel, exports) {
  const p = require.resolve(rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
}
inject('../src/config/supabase.js', { supabase: fakeSupabase });
inject('../src/services/googleDrive.js', {
  isConfigured: () => state.gdrive.configured,
  uploadFile: async () => {
    state.uploads += 1;
    if (state.gdrive.throwOnUpload) throw new Error(state.gdrive.throwOnUpload);
    return { id: 'g-file-1', name: 'file.pdf', webViewLink: 'https://drive/view', size: 3 };
  },
});
inject('../src/helpers/driveEntityFolder.js', {
  ensureEntityDriveContext: async () => ({ ownerRoot: { id: 'root-1' }, entityMirror: { id: 'mirror-1' } }),
  resolveEntityTargetFolder: async () => ({ googleParentId: 'gp-1', folder: { id: 'folder-1' } }),
});

const { maybeMirrorTaskAttachmentsToDrive } = require('../src/helpers/crmTaskAttachmentDriveUpload');

// ── Harness ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];
async function test(name, fn) {
  resetState();
  try { await fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (e) { failed += 1; failures.push({ name, error: e.message }); console.error(`  ✗ ${name}\n      ${e.message}`); }
}

const fileAtt = (over = {}) => ({
  id: 'att-1', file_url: 'https://x/storage/v1/object/public/attachments/p/file.pdf',
  file_name: 'file.pdf', mime_type: 'application/pdf', doc_type: 'other', ...over,
});

async function run() {
  console.log('\n== Part V: Google Drive mirror adapter (mock) ==');

  await test('cờ tắt (taskFlag=false) → skip flag_off, KHÔNG gọi Drive', async () => {
    const r = await maybeMirrorTaskAttachmentsToDrive({
      taskId: 't1', leadId: 'lead-1', attachments: [fileAtt()], userId: 'u1', taskFlag: false,
    });
    assert.strictEqual(r.skipped, true);
    assert.strictEqual(r.reason, 'flag_off');
    assert.strictEqual(state.uploads, 0);
  });

  await test('note (không file) → không mirror', async () => {
    const r = await maybeMirrorTaskAttachmentsToDrive({
      taskId: 't1', leadId: 'lead-1', attachments: [fileAtt({ doc_type: 'task_note', file_url: '' })], userId: 'u1', taskFlag: true,
    });
    assert.strictEqual(r.skipped, true);
    assert.strictEqual(r.reason, 'no_files');
    assert.strictEqual(state.uploads, 0);
  });

  await test('Drive chưa cấu hình → skip gdrive_not_configured, không upload', async () => {
    state.gdrive.configured = false;
    const r = await maybeMirrorTaskAttachmentsToDrive({
      taskId: 't1', leadId: 'lead-1', attachments: [fileAtt()], userId: 'u1', taskFlag: true,
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.results[0].skipped, true);
    assert.strictEqual(r.results[0].reason, 'gdrive_not_configured');
    assert.strictEqual(state.uploads, 0);
  });

  await test('đã mirror (source_drive_file_id) → skip already_mirrored (không upload trùng)', async () => {
    const r = await maybeMirrorTaskAttachmentsToDrive({
      taskId: 't1', leadId: 'lead-1', attachments: [fileAtt({ source_drive_file_id: 'g-old' })], userId: 'u1', taskFlag: true,
    });
    assert.strictEqual(r.results[0].reason, 'already_mirrored');
    assert.strictEqual(state.uploads, 0);
  });

  await test('upload thành công → trả fileRow, gọi Drive đúng 1 lần', async () => {
    const r = await maybeMirrorTaskAttachmentsToDrive({
      taskId: 't1', leadId: 'lead-1', attachments: [fileAtt()], userId: 'u1', taskFlag: true,
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(state.uploads, 1);
    assert.ok(r.results[0].fileRow, JSON.stringify(r.results[0]));
    assert.strictEqual(r.results[0].fileRow.id, 'drive-file-1');
  });

  await test('adapter timeout → nuốt lỗi, KHÔNG ném (upload CRM vẫn ok), reason ghi nhận', async () => {
    state.gdrive.throwOnUpload = 'ETIMEDOUT drive upload';
    let threw = false;
    let r;
    try {
      r = await maybeMirrorTaskAttachmentsToDrive({
        taskId: 't1', leadId: 'lead-1', attachments: [fileAtt()], userId: 'u1', taskFlag: true,
      });
    } catch (_) { threw = true; }
    assert.strictEqual(threw, false, 'không được ném lỗi ra request chính');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.results[0].skipped, true);
    assert.ok(/ETIMEDOUT/.test(r.results[0].reason), r.results[0].reason);
  });

  console.log(`\nKết quả: ${passed} pass, ${failed} fail`);
  if (failed) failures.forEach((f) => console.error(`FAIL: ${f.name} — ${f.error}`));
  process.exit(failed ? 1 : 0);
}

run().catch((e) => { console.error('Test runner lỗi:', e); process.exit(1); });
