const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildBusinessOsUatSessionManifest,
  renderBusinessOsUatSessionMarkdown,
} = require('../src/helpers/businessOsUatSession');

function readyGate() {
  return {
    project_ref: 'staging-ref',
    database_name: 'postgres',
    postgres_version: '17.6',
    backup: {
      verified: true,
      latest_completed_backup_at: '2026-08-27T00:00:00.000Z',
      latest_completed_backup_id: 123,
      pitr_enabled: false,
    },
    migrations: [{ migration: '580', capability: 'project change', applied: true }],
    uat_gate: {
      status: 'READY',
      ready: true,
      required_backup_after: '2026-08-26T10:21:23.977Z',
    },
  };
}

function safePreflight() {
  return {
    project_ref: 'staging-ref',
    company_id: 'company-id',
    pii_safe: true,
    read_only: true,
    coverage: { sales_processes: 1 },
    slots: [{
      key: 'uat_01',
      label: 'Khách chưa có thiết kế',
      status: 'EXISTING_COVERAGE_FOUND',
      requirements: [{ key: 'full_service_path', count: 1, met: true }],
      missing: [],
    }],
    slots_with_existing_coverage: 1,
    slots_needing_uat_record: 0,
    customer_email: 'khong-duoc-ghi@example.com',
  };
}

test('không tạo manifest khi backup gate chưa READY', () => {
  const gateReport = readyGate();
  gateReport.uat_gate = { ...gateReport.uat_gate, status: 'BLOCKED', ready: false };
  assert.throws(
    () => buildBusinessOsUatSessionManifest({
      sessionId: 's1',
      generatedAt: '2026-08-27T00:01:00.000Z',
      baselineTag: 'baseline',
      schemaFreeze: '2026-08-26T10:21:23.977Z',
      code: {},
      gateReport,
      preflightReport: safePreflight(),
    }),
    /chưa READY/,
  );
});

test('manifest chỉ giữ whitelist tổng hợp và không mang PII ngoài dự kiến', () => {
  const manifest = buildBusinessOsUatSessionManifest({
    sessionId: 's1',
    generatedAt: '2026-08-27T00:01:00.000Z',
    baselineTag: 'baseline',
    schemaFreeze: '2026-08-26T10:21:23.977Z',
    code: { commit: 'abc', dirtyFileCount: 2 },
    gateReport: readyGate(),
    preflightReport: safePreflight(),
  });
  const serialized = JSON.stringify(manifest);
  const markdown = renderBusinessOsUatSessionMarkdown(manifest);

  assert.equal(manifest.status, 'READY_TO_ASSIGN');
  assert.equal(manifest.coverage.sales_processes, 1);
  assert.equal(manifest.code.dirty_file_count, 2);
  assert.equal(serialized.includes('khong-duoc-ghi@example.com'), false);
  assert.equal(markdown.includes('khong-duoc-ghi@example.com'), false);
});

test('từ chối ghép gate và preflight từ hai database khác nhau', () => {
  const preflightReport = safePreflight();
  preflightReport.project_ref = 'another-ref';
  assert.throws(
    () => buildBusinessOsUatSessionManifest({
      sessionId: 's1',
      generatedAt: '2026-08-27T00:01:00.000Z',
      baselineTag: 'baseline',
      schemaFreeze: '2026-08-26T10:21:23.977Z',
      code: {},
      gateReport: readyGate(),
      preflightReport,
    }),
    /không cùng project ref/,
  );
});
