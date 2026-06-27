/**
 * Cấp quyền schema public trên backup sau pg_restore (--no-acl) để REST/service_role upsert được.
 */
const {
  listBackupPgProbeCandidates,
  connectPgWithProbeCandidates,
  describePgTarget,
} = require('../config/pgConnection');

const GRANTS_SQL = `
GRANT USAGE ON SCHEMA public TO service_role, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role, authenticated',
      r.tablename
    );
  END LOOP;
  FOR r IN
    SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'
  LOOP
    EXECUTE format(
      'GRANT USAGE, SELECT ON public.%I TO service_role, authenticated',
      r.sequence_name
    );
  END LOOP;
END $$;
`;

let _lastAppliedAt = 0;
const MIN_INTERVAL_MS = 60_000;

/**
 * @param {{ onLog?: (msg: string) => void, force?: boolean }} [opts]
 */
async function applyBackupSchemaGrants(opts = {}) {
  const onLog = opts.onLog || ((m) => console.log(`[fix-backup-grants] ${m}`));
  const force = opts.force === true;
  const now = Date.now();
  if (!force && now - _lastAppliedAt < MIN_INTERVAL_MS) {
    onLog('Bỏ qua grants (vừa chạy gần đây)');
    return { skipped: true };
  }

  const candidates = listBackupPgProbeCandidates();
  if (!candidates.length) {
    throw new Error('Thiếu SUPABASE_BACKUP_DB_URL hoặc SUPABASE_BACKUP_DB_DIRECT_URL');
  }

  const { pool, url } = await connectPgWithProbeCandidates(candidates, {
    label: 'Backup grants',
    onLog,
  });
  try {
    await pool.query(GRANTS_SQL);
    _lastAppliedAt = now;
    onLog(`OK — service_role có quyền schema public (${describePgTarget(url)})`);
    return { skipped: false, url };
  } finally {
    await pool.end().catch(() => {});
  }
}

function isBackupPermissionDeniedError(err) {
  const msg = String(err?.message || err || '');
  return /42501|permission denied for (table|schema)/i.test(msg)
    || /Grant the required privileges.*service_role/i.test(msg);
}

module.exports = {
  applyBackupSchemaGrants,
  isBackupPermissionDeniedError,
};
