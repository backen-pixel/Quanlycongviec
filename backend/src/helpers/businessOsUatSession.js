function numberMap(input) {
  return Object.fromEntries(
    Object.entries(input || {}).map(([key, value]) => [key, Number(value || 0)]),
  );
}

function safeRequirements(input) {
  return Array.isArray(input)
    ? input.map((item) => ({
      key: String(item?.key || ''),
      count: Number(item?.count || 0),
      met: item?.met === true,
    }))
    : [];
}

function buildBusinessOsUatSessionManifest({
  sessionId,
  generatedAt,
  baselineTag,
  schemaFreeze,
  code,
  gateReport,
  preflightReport,
}) {
  if (gateReport?.uat_gate?.status !== 'READY' || gateReport?.uat_gate?.ready !== true) {
    throw new Error('Không thể mở phiên UAT khi backup gate chưa READY.');
  }
  if (preflightReport?.pii_safe !== true || preflightReport?.read_only !== true) {
    throw new Error('Preflight phải được xác nhận PII-safe và read-only.');
  }
  if (gateReport.project_ref !== preflightReport.project_ref) {
    throw new Error('Database gate và preflight không cùng project ref.');
  }

  const slots = Array.isArray(preflightReport.slots)
    ? preflightReport.slots.map((item) => ({
      key: String(item?.key || ''),
      label: String(item?.label || ''),
      status: String(item?.status || ''),
      requirements: safeRequirements(item?.requirements),
      missing: Array.isArray(item?.missing) ? item.missing.map(String) : [],
    }))
    : [];

  return {
    session_id: sessionId,
    generated_at: generatedAt,
    status: 'READY_TO_ASSIGN',
    pii_safe: true,
    read_only: true,
    baseline: {
      tag: baselineTag,
      schema_freeze: schemaFreeze,
    },
    code: {
      commit: code?.commit || null,
      branch: code?.branch || null,
      baseline_tag_commit: code?.baselineTagCommit || null,
      dirty_file_count: Number(code?.dirtyFileCount || 0),
    },
    database: {
      project_ref: gateReport.project_ref,
      database_name: gateReport.database_name || null,
      postgres_version: gateReport.postgres_version || null,
    },
    backup: {
      verified: gateReport.backup?.verified === true,
      completed_at: gateReport.backup?.latest_completed_backup_at || null,
      id: gateReport.backup?.latest_completed_backup_id ?? null,
      pitr_enabled: gateReport.backup?.pitr_enabled === true,
      required_after: gateReport.uat_gate.required_backup_after,
    },
    migrations: Array.isArray(gateReport.migrations)
      ? gateReport.migrations.map((item) => ({
        migration: String(item?.migration || ''),
        capability: String(item?.capability || ''),
        applied: item?.applied === true,
      }))
      : [],
    pilot: {
      company_id: preflightReport.company_id,
    },
    coverage: numberMap(preflightReport.coverage),
    slots,
    slots_with_existing_coverage: Number(preflightReport.slots_with_existing_coverage || 0),
    slots_needing_uat_record: Number(preflightReport.slots_needing_uat_record || 0),
    guardrails: [
      'Nhân viên phụ trách xác nhận hồ sơ trước khi dùng dữ liệu khách thật.',
      'Chạy tuần tự từng hồ sơ; FAIL/BLOCKED phải có bằng chứng và người xử lý.',
      'Không deploy production; Blueprint công ty thứ hai chỉ preview/apply trong đúng tenant và theo checklist UAT.',
    ],
  };
}

function markdownCell(value) {
  return String(value ?? '').replace(/[|\r\n]+/g, ' ').trim();
}

function renderBusinessOsUatSessionMarkdown(manifest) {
  const slotRows = manifest.slots.map((item) => (
    `| ${markdownCell(item.key)} | ${markdownCell(item.label)} | ${markdownCell(item.status)} | ${markdownCell(item.missing.join(', ') || '—')} |`
  ));
  return [
    `# Biên bản mở phiên UAT — ${markdownCell(manifest.session_id)}`,
    '',
    `- Trạng thái: \`${markdownCell(manifest.status)}\``,
    `- Thời điểm: \`${markdownCell(manifest.generated_at)}\``,
    `- Commit: \`${markdownCell(manifest.code.commit)}\``,
    `- Baseline tag: \`${markdownCell(manifest.baseline.tag)}\` → \`${markdownCell(manifest.code.baseline_tag_commit)}\``,
    `- Database: \`${markdownCell(manifest.database.project_ref)}\``,
    `- Backup: \`${markdownCell(manifest.backup.id)}\` lúc \`${markdownCell(manifest.backup.completed_at)}\``,
    `- Migration đạt: \`${manifest.migrations.filter((item) => item.applied).length}/${manifest.migrations.length}\``,
    `- PII-safe/read-only: \`${manifest.pii_safe}/${manifest.read_only}\``,
    '',
    '## Coverage để phân công',
    '',
    '| Slot | Kịch bản | Preflight | Còn thiếu |',
    '|---|---|---|---|',
    ...slotRows,
    '',
    '## Quy tắc',
    '',
    ...manifest.guardrails.map((item) => `- ${item}`),
    '',
    `Biên bản này không phải kết quả PASS UAT. Kết quả từng hồ sơ phải ghi vào checklist của ${markdownCell(manifest.baseline.tag)}.`,
    '',
  ].join('\n');
}

module.exports = {
  buildBusinessOsUatSessionManifest,
  renderBusinessOsUatSessionMarkdown,
};
