const FOUNDER_LOCAL_READ_ONLY_PROFILE = 'founder-local-read-only';
const FOUNDER_LOCAL_BIND_HOST = '127.0.0.1';
const DEFAULT_FOUNDER_LOCAL_PORT = 4010;
const {
  assertFounderLocalRuntimeProvenance,
  runtimeProvenanceSnapshot,
} = require('./founderLocalRuntimeProvenance');

// Defense in depth. The normal server also skips its writer startup block when
// this profile is active, but these values keep imported helpers fail-closed.
const FOUNDER_LOCAL_FORCED_ENV = Object.freeze({
  FOUNDER_LOCAL_READ_ONLY: '1',
  BACKGROUND_WRITE_JOBS_ENABLED: '0',
  FOUNDER_LOCAL_REALTIME_DISABLED: '1',
  NODE_ENV: 'production',
  PERMISSION_FAIL_OPEN: '0',
  AUTO_LOGOUT_AT_MIDNIGHT: '0',
  REDIS_DISABLED: '1',
  PG_POOL_DISABLED: '1',
  RESPONSE_CACHE_DISABLED: '1',
  SUPABASE_HEALTH_CHECK_DISABLED: '1',
  SUPABASE_QUERY_GUARD: '0',
  SUPABASE_FAILOVER_ENABLED: '0',
  SUPABASE_AUTO_FAILOVER: '0',
  SUPABASE_AUTO_FAILBACK: '0',
  SUPABASE_REPLICATION_ENABLED: '0',
  SUPABASE_REPLICATION_DISABLED: '1',
  SUPABASE_SWITCH_LOG_ENABLED: '0',
  SUPABASE_SWITCH_SYNC_DISABLED: '1',
  SUPABASE_BACKUP_SYNC_CRON_DISABLED: '1',
  SUPABASE_BACKUP_SYNC_SCHEDULE_ENABLED: '0',
  KPI_CRON_DISABLED: '1',
  AI_USER_MEMORY_CRON_DISABLED: '1',
  NOTIFICATION_RETENTION_DISABLED: '1',
  LOG_RETENTION_DISABLED: '1',
  CSKH_CRON_DISABLED: '1',
  DAILY_REPORT_AUTO_CLOSE_DISABLED: '1',
  CRM_MISSING_TASKS_CRON_DISABLED: '1',
  AI_DEADLINE_CRON_DISABLED: '1',
  CRM_ASSIGNMENT_REMINDER_DISABLED: '1',
  CRM_ASSIGNMENT_SCHEDULE_DISABLED: '1',
  BATCH_QUEUE_DISABLED: '1',
  USAGE_ANALYTICS_CRON_DISABLED: '1',
  CRM_KANBAN_DEADLINE_REMINDER_DISABLED: '1',
  SX_SCHEDULE_SLIP_DISABLED: '1',
  CRM_ASSIGNMENT_DRIFT_HEAL_DISABLED: '1',
  PROJECT_DEADLINE_DISPATCH_DISABLED: '1',
  ZALO_OA_TOKEN_CRON_DISABLED: '1',
  AI_CHAT_BOT_CRON_DISABLED: '1',
  GDRIVE_SYNC_DISABLED: '1',
  VOICE_STT_CRON_DISABLED: '1',
  FB_AUTO_PIPELINE_RESUME_ON_BOOT: '0',
  FB_DISABLE_WEBHOOK_LOGS: '1',
});

function runtimeProfile(env = process.env) {
  return String(env.RUNTIME_PROFILE || '').trim().toLowerCase();
}

function isFounderLocalReadOnly(env = process.env) {
  return runtimeProfile(env) === FOUNDER_LOCAL_READ_ONLY_PROFILE;
}

function founderLocalPort(env = process.env) {
  const raw = String(env.FOUNDER_LOCAL_PORT || DEFAULT_FOUNDER_LOCAL_PORT).trim();
  if (!/^\d+$/.test(raw)) {
    const error = new Error('FOUNDER_LOCAL_PORT phải là số nguyên từ 1024 đến 65535.');
    error.code = 'FOUNDER_LOCAL_PORT_INVALID';
    throw error;
  }
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    const error = new Error('FOUNDER_LOCAL_PORT phải nằm trong khoảng 1024–65535.');
    error.code = 'FOUNDER_LOCAL_PORT_INVALID';
    throw error;
  }
  return port;
}

function applyRuntimeProfile(env = process.env) {
  if (!isFounderLocalReadOnly(env)) {
    return {
      active: false,
      profile: runtimeProfile(env) || 'standard',
      host: undefined,
      port: Number(env.PORT || 4000),
      overridden_keys: [],
    };
  }

  const port = founderLocalPort(env);
  const overridden = [];
  for (const [key, value] of Object.entries(FOUNDER_LOCAL_FORCED_ENV)) {
    if (env[key] != null && String(env[key]) !== value) overridden.push(key);
    env[key] = value;
  }
  env.RUNTIME_PROFILE = FOUNDER_LOCAL_READ_ONLY_PROFILE;
  env.PORT = String(port);
  env.FRONTEND_URL = `http://${FOUNDER_LOCAL_BIND_HOST}:${port}`;
  env.CORS_ORIGINS = [
    `http://${FOUNDER_LOCAL_BIND_HOST}:${port}`,
    `http://localhost:${port}`,
  ].join(',');

  return {
    active: true,
    profile: FOUNDER_LOCAL_READ_ONLY_PROFILE,
    host: FOUNDER_LOCAL_BIND_HOST,
    port,
    overridden_keys: overridden.sort(),
  };
}

function assertFounderLocalDataConfig(env = process.env) {
  if (!isFounderLocalReadOnly(env)) {
    const error = new Error('Founder-local chỉ khởi động với RUNTIME_PROFILE=founder-local-read-only.');
    error.code = 'FOUNDER_LOCAL_PROFILE_REQUIRED';
    throw error;
  }
  const missing = [];
  if (!String(env.SUPABASE_URL || '').trim()) missing.push('SUPABASE_URL');
  if (!String(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || '').trim()) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY');
  }
  const jwtSecret = String(env.JWT_SECRET || '').trim();
  if (!jwtSecret || jwtSecret === 'change-this') missing.push('JWT_SECRET');
  if (missing.length) {
    const error = new Error(`Thiếu cấu hình bắt buộc cho Founder-local: ${missing.join(', ')}`);
    error.code = 'FOUNDER_LOCAL_CONFIG_MISSING';
    error.missing = missing;
    throw error;
  }
  return true;
}

function serverBinding(env = process.env) {
  if (!isFounderLocalReadOnly(env)) {
    return { host: undefined, port: Number(env.PORT || 4000) };
  }
  return { host: FOUNDER_LOCAL_BIND_HOST, port: founderLocalPort(env) };
}

function backgroundWritersAllowed(env = process.env) {
  return !isFounderLocalReadOnly(env);
}

function canonicalWritesAllowed(env = process.env) {
  return !isFounderLocalReadOnly(env);
}

function runtimeSafetySnapshot(env = process.env) {
  const active = isFounderLocalReadOnly(env);
  const provenance = active ? runtimeProvenanceSnapshot(env) : null;
  return {
    profile: active ? FOUNDER_LOCAL_READ_ONLY_PROFILE : (runtimeProfile(env) || 'standard'),
    founder_local: active,
    bind_host: active ? FOUNDER_LOCAL_BIND_HOST : null,
    bind_port: active ? founderLocalPort(env) : null,
    write_enabled: !active,
    controlled_writes_enabled: !active,
    controlled_real_writes_enabled: !active,
    provisional_advisory_configuration_write_enabled: active
      && env.FOUNDER_ADVISORY_CONFIG_ENABLED === '1',
    background_writers_enabled: !active,
    realtime_writes_enabled: !active,
    public_binding_enabled: !active,
    instance_id: active ? (String(env.FOUNDER_LOCAL_RUN_ID || '').trim() || null) : null,
    process_id: active ? process.pid : null,
    launcher_process_id: active ? provenance.launcher_process_id : null,
    launcher_owned: active ? provenance.launcher_owned : false,
    candidate: active ? provenance.candidate : null,
    checkout: active ? provenance.checkout : null,
    frontend_dist: active ? provenance.frontend_dist : null,
  };
}

module.exports = {
  FOUNDER_LOCAL_READ_ONLY_PROFILE,
  FOUNDER_LOCAL_BIND_HOST,
  FOUNDER_LOCAL_FORCED_ENV,
  applyRuntimeProfile,
  assertFounderLocalDataConfig,
  assertFounderLocalRuntimeProvenance,
  backgroundWritersAllowed,
  canonicalWritesAllowed,
  founderLocalPort,
  isFounderLocalReadOnly,
  runtimeProfile,
  runtimeSafetySnapshot,
  serverBinding,
};
