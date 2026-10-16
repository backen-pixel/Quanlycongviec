/**
 * Logic thuần (không I/O DB) cho backend/scripts/migrate.js và check-new-migrations.js.
 * Migration = file /database/<số>_<tên>.sql ở cấp gốc; *_rollback.sql là file hoàn tác, không tính.
 */
const crypto = require('crypto');

const MIGRATION_RE = /^(\d+)[a-z]?_[^/\\]+\.sql$/i;
const ROLLBACK_RE = /_rollback\.sql$/i;
// Quy ước cho file MỚI: 3+ chữ số, tên snake_case thường.
const NEW_NAME_RE = /^(\d{3,})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;

function isRollback(filename) {
  return ROLLBACK_RE.test(filename);
}

function migrationNumber(filename) {
  const m = String(filename).match(MIGRATION_RE);
  return m ? Number(m[1]) : null;
}

function isMigrationFile(filename) {
  return migrationNumber(filename) != null && !isRollback(filename);
}

/** Danh sách migration (bỏ rollback, bỏ file không đánh số), sắp theo số rồi tên. */
function listMigrations(filenames) {
  return filenames
    .filter(isMigrationFile)
    .sort((a, b) => migrationNumber(a) - migrationNumber(b) || a.localeCompare(b));
}

/** sha256 của nội dung đã chuẩn hoá xuống dòng — Windows (CRLF) và CI (LF) ra cùng giá trị. */
function checksumOf(content) {
  const normalized = String(content).replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * So file trên đĩa với sổ trên DB.
 * @param {{filename:string, checksum:string}[]} files
 * @param {{filename:string, checksum:string, source?:string}[]} applied
 */
function computeStatus(files, applied) {
  const byName = new Map(applied.map((r) => [r.filename, r]));
  const onDisk = new Set(files.map((f) => f.filename));
  const pending = [];
  const changed = [];
  let appliedCount = 0;
  for (const f of files) {
    const row = byName.get(f.filename);
    if (!row) pending.push(f.filename);
    else {
      appliedCount += 1;
      if (row.checksum !== f.checksum) changed.push({ filename: f.filename, source: row.source || null });
    }
  }
  const missing = applied.filter((r) => !onDisk.has(r.filename)).map((r) => r.filename);
  return { appliedCount, pending, changed, missing };
}

/** Chọn file theo tên đầy đủ hoặc theo số (lỗi nếu số trùng nhiều file). */
function resolveTarget(arg, migrations) {
  const s = String(arg || '').replace(/^.*[\\/]/, '');
  if (migrations.includes(s)) return s;
  if (/^\d+$/.test(s)) {
    const hits = migrations.filter((f) => migrationNumber(f) === Number(s));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) {
      throw new Error(`Số ${s} trùng ${hits.length} file — ghi rõ tên: ${hits.join(', ')}`);
    }
  }
  throw new Error(`Không tìm thấy migration: ${arg}`);
}

function sqlLiteral(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** SQL ghi sổ — nối sau nội dung migration để cùng một transaction ngầm định. */
function recordSql({ filename, checksum, appliedBy, source = 'runner', note = null, force = false }) {
  const conflict = force
    ? 'ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = now(), applied_by = EXCLUDED.applied_by, source = EXCLUDED.source, note = EXCLUDED.note'
    : 'ON CONFLICT (filename) DO NOTHING';
  return `INSERT INTO public.schema_migrations (filename, checksum, applied_by, source, note) VALUES (${[
    filename, checksum, appliedBy, source, note,
  ].map(sqlLiteral).join(', ')}) ${conflict};`;
}

function baselineSql(rows, appliedBy) {
  if (!rows.length) return '';
  const values = rows
    .map((r) => `(${[r.filename, r.checksum, appliedBy, 'baseline'].map(sqlLiteral).join(', ')})`)
    .join(',\n');
  return `INSERT INTO public.schema_migrations (filename, checksum, applied_by, source) VALUES\n${values}\nON CONFLICT (filename) DO NOTHING;`;
}

/**
 * Kiểm tra file migration MỚI trong một PR.
 * @param {string[]} added      tên file được thêm (chỉ cấp gốc /database)
 * @param {string[]} allFiles   toàn bộ tên file trong /database sau PR
 * @returns {string[]} lỗi
 */
function checkNewMigrations(added, allFiles) {
  const errors = [];
  for (const name of added) {
    if (!/\.sql$/i.test(name)) continue;
    if (!NEW_NAME_RE.test(name)) {
      errors.push(`${name}: tên phải dạng <số 3+ chữ số>_<snake_case>.sql (chữ thường, không dấu cách/gạch ngang)`);
      continue;
    }
    const num = migrationNumber(name);
    if (isRollback(name)) {
      const base = name.replace(ROLLBACK_RE, '.sql');
      if (!allFiles.includes(base)) errors.push(`${name}: không có file migration tương ứng ${base}`);
      continue;
    }
    const clash = allFiles.filter((f) => f !== name && isMigrationFile(f) && migrationNumber(f) === num);
    if (clash.length) errors.push(`${name}: số ${num} đã dùng bởi ${clash.join(', ')} — lấy số lớn nhất hiện có + 1`);
  }
  return errors;
}

module.exports = {
  isRollback,
  isMigrationFile,
  migrationNumber,
  listMigrations,
  checksumOf,
  computeStatus,
  resolveTarget,
  recordSql,
  baselineSql,
  checkNewMigrations,
  sqlLiteral,
};
