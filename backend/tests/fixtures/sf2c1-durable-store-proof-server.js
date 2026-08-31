const crypto = require('node:crypto');
const http = require('node:http');
const { SqliteDurableStoreProofEngine } = require('../../src/softwareFactory/adapters/sqliteDurableStoreProofEngine');
const { assertPlainJsonValue } = require('../../src/softwareFactory/plainJson');

const databasePath = process.env.SF2C1_STORE_DATABASE_PATH;
const serviceToken = process.env.SF2C1_STORE_SERVICE_TOKEN;
const requestedPort = Number(process.env.SF2C1_STORE_PORT || 0);
const faultDelayMs = Number(process.env.SF2C1_STORE_FAULT_DELAY_MS || 500);

if (!databasePath || !serviceToken || serviceToken.length < 32) {
  throw new Error('SF2-C1 store proof server requires isolated path and ephemeral token.');
}

const engine = new SqliteDurableStoreProofEngine({ database_path: databasePath });
let fault = null;

function authorized(request) {
  const supplied = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const left = Buffer.from(supplied);
  const right = Buffer.from(serviceToken);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function send(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > 8 * 1024 * 1024) {
        reject(Object.assign(new Error('request too large'), { code: 'SF2C1_STORE_REQUEST_TOO_LARGE' }));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        assertPlainJsonValue(parsed);
        resolve(parsed);
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

const rpcMethods = new Set([
  'readScopeState',
  'readCheckpoint',
  'readReceipt',
  'readAuditEntries',
  'readIdempotencyRecord',
  'readEvidenceRecord',
  'readTransactionSeal',
  'readRecoverySnapshot',
  'commitAtomicMutation',
]);

const server = http.createServer(async (request, response) => {
  if (request.method !== 'POST' || !authorized(request)) {
    send(response, 403, { ok: false, error: { code: 'SF2C1_STORE_AUTH_DENIED', message: 'Denied.' } });
    return;
  }
  try {
    const body = await readBody(request);
    if (request.url === '/control') {
      if (body.action === 'set_fault') {
        const allowed = new Set([
          null,
          'unknown_without_commit',
          'timeout_before_commit',
          'commit_then_disconnect',
          'commit_then_hang',
        ]);
        if (!allowed.has(body.value)) throw Object.assign(new Error('invalid fault'), { code: 'SF2C1_FAULT_INVALID' });
        fault = body.value;
        send(response, 200, { ok: true, result: { fault } });
        return;
      }
      if (body.action === 'count_outcomes') {
        send(response, 200, {
          ok: true,
          result: { count: engine.countCommittedOutcomes(body.scope_id) },
        });
        return;
      }
      throw Object.assign(new Error('unknown control action'), { code: 'SF2C1_CONTROL_DENIED' });
    }
    if (request.url !== '/rpc' || !rpcMethods.has(body.method) || !Array.isArray(body.args)) {
      throw Object.assign(new Error('unknown RPC method'), { code: 'SF2C1_STORE_METHOD_DENIED' });
    }
    if (body.method === 'commitAtomicMutation' && fault) {
      const activeFault = fault;
      fault = null;
      if (activeFault === 'unknown_without_commit') {
        send(response, 200, { ok: true, result: { status: 'UNKNOWN' } });
        return;
      }
      if (activeFault === 'timeout_before_commit') {
        setTimeout(() => {
          if (!response.destroyed) send(response, 200, { ok: true, result: { status: 'UNKNOWN' } });
        }, faultDelayMs);
        return;
      }
      const result = engine.commitAtomicMutation(...body.args);
      if (activeFault === 'commit_then_disconnect') {
        response.destroy();
        return;
      }
      if (activeFault === 'commit_then_hang') return;
      send(response, 200, { ok: true, result });
      return;
    }
    const result = engine[body.method](...body.args);
    send(response, 200, { ok: true, result });
  } catch (error) {
    if (response.destroyed) return;
    send(response, 400, {
      ok: false,
      error: {
        code: typeof error?.code === 'string' ? error.code : 'SF2C1_STORE_SERVER_ERROR',
        message: typeof error?.message === 'string' ? error.message : 'Store proof error.',
      },
    });
  }
});

server.listen(requestedPort, '127.0.0.1', () => {
  const address = server.address();
  process.stdout.write(JSON.stringify({ ready: true, port: address.port }) + '\n');
});

function shutdown() {
  server.close(() => {
    engine.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 2000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
