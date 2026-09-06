const http = require('node:http');

const identity = JSON.parse(Buffer.from(process.argv[2], 'base64url').toString('utf8'));
const runId = process.argv[3];
let closing = false;

const server = http.createServer((request, response) => {
  if (request.url !== '/api/health') {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: false }));
    return;
  }
  const body = JSON.stringify({
    ok: true,
    runtime: {
      profile: 'founder-local-read-only',
      bind_host: '127.0.0.1',
      bind_port: server.address().port,
      instance_id: runId,
      process_id: process.pid,
      launcher_process_id: process.ppid,
      launcher_owned: process.connected === true,
      candidate: identity.candidate,
      checkout: identity.checkout,
      frontend_dist: identity.frontend_dist,
    },
  });
  response.writeHead(200, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
    connection: 'close',
  });
  response.end(body);
});

function shutdown() {
  if (closing) return;
  closing = true;
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 1500).unref();
}

process.once('disconnect', shutdown);
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
server.listen(0, '127.0.0.1', () => {
  process.send?.({ type: 'fixture-ready', port: server.address().port });
});
