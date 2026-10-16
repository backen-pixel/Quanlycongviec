'use strict';

// Offline/scratch verification of existing runner, not a new migration engine.
// Run only on Linux/WSL with installed PostgreSQL binaries and pg module:
// node probe-blank-db.cjs <embedded-postgres-bin-dir> <installed-pg-module-dir>
// This harness executes only the first existing forward migration via actual main().
// No dotenv, network TCP, production credentials, customer rows or shared DB.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');

if (process.platform !== 'linux') throw new Error('Scratch probe requires Linux/WSL; no Windows fallback');
if (typeof process.getuid !== 'function' || process.getuid() === 0) throw new Error('Do not start PostgreSQL as root');
const binaryDir = path.resolve(process.argv[2] || '');
const pgModuleDir = path.resolve(process.argv[3] || '');
for (const name of ['initdb', 'pg_ctl', 'postgres']) fs.accessSync(path.join(binaryDir, name), fs.constants.X_OK);
const pg = require(pgModuleDir);
const repo = path.resolve(__dirname, '../../../..');
const runnerPath = path.join(repo, 'backend/scripts/migrate.js');
const plan = require(path.join(repo, 'backend/scripts/lib/migrationPlan.js'));
const firstMigration = plan.listMigrations(fs.readdirSync(path.join(repo, 'database')))[0];
assert.equal(firstMigration, '000_verify_crm_supabase_project.sql');
const bootstrapSql = fs.readFileSync(path.join(repo, 'database/722_schema_migrations.sql'), 'utf8');
const firstSql = fs.readFileSync(path.join(repo, 'database', firstMigration), 'utf8');
const runnerSource = fs.readFileSync(runnerPath, 'utf8');
const marker = '\nmain().catch(';
const markerAt = runnerSource.lastIndexOf(marker);
assert.ok(markerAt > 0, 'Expected existing runner entrypoint marker');
const sourceBeforeMainCatch = runnerSource.slice(0, markerAt);
const scratch = fs.mkdtempSync('/tmp/bos-v31a-blank-');
fs.chmodSync(scratch, 0o700);
const dataDir = path.join(scratch, 'data');
const socketDir = path.join(scratch, 'socket');
fs.mkdirSync(socketDir, { mode: 0o700 });
const socketPort = 55491; // Unix socket suffix only; listen_addresses is empty.
const syntheticUser = 'bos_baseline_probe';
const transportLabel = 'scratch-unix-socket-only';
const childEnv = { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' };
const result = {
  schema_version: 'bos.v3.1a.blank-db-probe.v1',
  task_id: 'BOS-V31A-ARCH-01',
  observed_at: new Date().toISOString(),
  source_sha: '49c4fda6f256ed1517213fb0a1bf831c869919d6',
  runner_source: 'backend/scripts/migrate.js',
  runner_sha256_raw: crypto.createHash('sha256').update(runnerSource).digest('hex'),
  planner_source: 'backend/scripts/lib/migrationPlan.js',
  first_migration: firstMigration,
  bootstrap: 'database/722_schema_migrations.sql',
  scope: 'Actual existing main/apply/ensureTable/readApplied logic with injected scratch-only pg transport',
  injections: {
    dotenv: 'NO_OP; does not load any env file',
    pgConnection: 'Fixed sentinel URL; primary only; not a secret or external address',
    pgClient: 'Installed pg.Client pinned to private Unix socket, explicit user/database, ssl:false',
    identity: 'Synthetic applied_by identity',
    process: 'Synthetic argv/env; no inherited credentials; fetch denied'
  },
  scratch: {
    path_class: '/tmp/bos-v31a-blank-<unique>',
    owner_uid: process.getuid(),
    directory_mode: '0700',
    listen_addresses: '',
    tcp_enabled: false,
    existing_service_or_data_directory_used: false,
    started: false,
    stopped: false,
    removed: false
  },
  cases: [],
  complete_catalog_replay: 'NOT_RUN; intentionally not looping seed/repair SQL',
  live_schema_comparison: 'UNKNOWN; read-only live catalog not supplied',
  restore_test: 'NOT_RUN',
  baseline_replay_status: 'PENDING',
  source_only_check_status: 'PENDING'
};

function newScratchClient() {
  return new pg.Client({ host: socketDir, port: socketPort, user: syntheticUser, database: 'postgres', ssl: false, application_name: 'bos_v31a_isolated_baseline_probe' });
}

async function scratchQuery(sql) {
  const client = newScratchClient();
  await client.connect();
  try { return await client.query(sql); } finally { await client.end(); }
}

async function runExistingMain(caseName) {
  const sqlCalls = [];
  const logs = [];
  let dotenvNoOpCalls = 0;
  const expectedFirstSql = `${firstSql}\n;\n${plan.recordSql({ filename: firstMigration, checksum: plan.checksumOf(firstSql), appliedBy: 'synthetic_probe@isolated' })}`;
  class ScratchOnlyClient {
    constructor(config) {
      assert.equal(config.connectionString, transportLabel, 'Unexpected runner target');
      this.client = newScratchClient();
    }
    connect() { return this.client.connect(); }
    end() { return this.client.end(); }
    async query(sql) {
      let kind;
      if (sql === 'SELECT filename, checksum, source, applied_at FROM public.schema_migrations') kind = 'read_applied_ledger';
      else if (sql === bootstrapSql) kind = 'bootstrap_722';
      else if (sql === expectedFirstSql) kind = 'apply_first_000_and_record';
      else throw new Error('Harness refused SQL outside inspected first-migration runner path');
      sqlCalls.push(kind);
      return await this.client.query(sql);
    }
  }
  const allowedRequire = name => {
    if (name === 'fs') return fs;
    if (name === 'path') return path;
    if (name === 'os') return { userInfo: () => ({ username: 'synthetic_probe' }), hostname: () => 'isolated' };
    if (name === 'dotenv') return { config: () => { dotenvNoOpCalls += 1; return {}; } };
    if (name === './lib/migrationPlan') return plan;
    if (name === '../src/config/pgConnection') return {
      resolvePrimaryDbUrl: () => transportLabel,
      resolveBackupDbUrl: () => { throw new Error('Backup target refused'); },
      primaryProjectRef: () => 'scratch',
      backupProjectRef: () => { throw new Error('Backup target refused'); }
    };
    if (name === 'pg') return { Client: ScratchOnlyClient };
    throw new Error(`Harness refused dependency: ${name}`);
  };
  const context = {
    require: allowedRequire,
    __dirname: path.dirname(runnerPath),
    process: { argv: ['node', runnerPath, 'apply', firstMigration, '--target', 'primary', '--via', 'pg', '--yes'], env: {}, exitCode: 0 },
    console: { log: (...args) => logs.push(args.join(' ')), error: (...args) => logs.push(args.join(' ')) },
    fetch: () => { throw new Error('Network fetch prohibited in scratch probe'); }
  };
  vm.runInNewContext(sourceBeforeMainCatch + '\nglobalThis.probeMain = main;\n', context, { filename: runnerPath, timeout: 5000 });
  let error = null;
  try { await context.probeMain(); } catch (err) { error = { code: String(err.code || 'ERROR'), message: String(err.message || err).slice(0, 500) }; }
  assert.equal(dotenvNoOpCalls, 1);
  return { name: caseName, status: error ? 'EXPECTED_FAILURE_PENDING_ASSERT' : 'UNEXPECTED_SUCCESS', error, runner_sql_path: sqlCalls, dotenv_no_op_calls: dotenvNoOpCalls, logs };
}

function boundaryCheck() {
  assert.ok(scratch.startsWith('/tmp/bos-v31a-blank-'));
  assert.equal(path.resolve(scratch), scratch);
  assert.equal(fs.realpathSync(scratch), scratch);
  assert.ok(!fs.lstatSync(scratch).isSymbolicLink());
  assert.equal(fs.statSync(scratch).uid, process.getuid());
}

(async () => {
  let infrastructureError = null;
  try {
    result.postgres_version = execFileSync(path.join(binaryDir, 'postgres'), ['--version'], { encoding: 'utf8', env: childEnv }).trim();
    execFileSync(path.join(binaryDir, 'initdb'), ['-D', dataDir, '-U', syntheticUser, '--auth=trust', '--no-locale', '-E', 'UTF8'], { encoding: 'utf8', env: childEnv, timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
    const serverOptions = `-c listen_addresses='' -c unix_socket_directories='${socketDir}' -c unix_socket_permissions=0700 -c port=${socketPort} -c max_connections=12 -c shared_buffers=16MB`;
    execFileSync(path.join(binaryDir, 'pg_ctl'), ['-D', dataDir, '-l', path.join(scratch, 'postgres.log'), '-o', serverOptions, '-w', 'start'], { encoding: 'utf8', env: childEnv, timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
    result.scratch.started = true;
    assert.equal((await scratchQuery('SHOW listen_addresses')).rows[0].listen_addresses, '');
    assert.equal((await scratchQuery('SHOW unix_socket_directories')).rows[0].unix_socket_directories, socketDir);
    const vanilla = await runExistingMain('vanilla_blank_db_missing_supabase_roles');
    assert.equal(vanilla.error?.code, '42704');
    assert.match(vanilla.error.message, /role.*anon.*does not exist/i);
    vanilla.status = 'EXPECTED_FAILURE_OBSERVED';
    result.cases.push(vanilla);
    await scratchQuery('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;');
    const rolesOnly = await runExistingMain('synthetic_no_login_roles_first_migration');
    assert.equal(rolesOnly.error?.code, '42P01');
    assert.match(rolesOnly.error.message, /crm_leads.*does not exist/i);
    rolesOnly.status = 'EXPECTED_FAILURE_OBSERVED';
    result.cases.push(rolesOnly);
    result.applied_ledger_row_count = Number((await scratchQuery('SELECT count(*)::int AS count FROM public.schema_migrations')).rows[0].count);
    assert.equal(result.applied_ledger_row_count, 0);
    result.baseline_replay_status = 'FAILED_BEFORE_FIRST_MIGRATION_COMPLETED';
    result.source_only_check_status = 'TWO_EXPECTED_FAILURES_REPRODUCED_ON_ISOLATED_DB';
  } catch (err) {
    infrastructureError = { code: String(err.code || 'ERROR'), message: String(err.message || err).slice(0, 1500) };
    result.infrastructure_error = infrastructureError;
    result.source_only_check_status = 'INCOMPLETE';
    process.exitCode = 1;
  } finally {
    boundaryCheck();
    // A pg_ctl start timeout can occur after postmaster actually starts; the PID
    // file, not just our success flag, determines whether stop must be attempted.
    if (result.scratch.started || fs.existsSync(path.join(dataDir, 'postmaster.pid'))) {
      try {
        execFileSync(path.join(binaryDir, 'pg_ctl'), ['-D', dataDir, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8', env: childEnv, timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
        result.scratch.stopped = true;
      } catch (err) {
        result.scratch.stop_error = String(err.message || err).slice(0, 500);
        process.exitCode = 1;
      }
    }
    const noRemainingPostmaster = !fs.existsSync(path.join(dataDir, 'postmaster.pid'));
    if (noRemainingPostmaster && (!result.scratch.started || result.scratch.stopped)) {
      boundaryCheck();
      fs.rmSync(scratch, { recursive: true, force: false });
      result.scratch.removed = !fs.existsSync(scratch);
    } else {
      result.scratch.retained_for_safe_cleanup = true;
      process.exitCode = 1;
    }
    result.finished_at = new Date().toISOString();
    fs.writeFileSync(path.join(__dirname, 'blank-db-results.json'), JSON.stringify(result, null, 2) + '\n');
    process.stdout.write(JSON.stringify({ check: result.source_only_check_status, replay: result.baseline_replay_status, cases: result.cases.map(c => ({ name: c.name, status: c.status, error: c.error })), scratch: result.scratch, infrastructure_error: infrastructureError }) + '\n');
  }
})().catch(err => { process.stderr.write(String(err.stack || err) + '\n'); process.exitCode = 1; });
