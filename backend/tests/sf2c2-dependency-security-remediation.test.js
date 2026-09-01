'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');

const axios = require('axios');
const bodyParser = require('body-parser');
const express = require('express');
const FormData = require('form-data');
const multer = require('multer');
const qs = require('qs');
const { match } = require('path-to-regexp');
const { Server: SocketIoServer } = require('socket.io');
const { Decoder } = require('socket.io-parser');
const { fetch: undiciFetch } = require('undici');

const packageJson = require('../package.json');
const packageLock = require('../package-lock.json');

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    port: address.port,
    httpUrl: `http://127.0.0.1:${address.port}`,
    httpsUrl: `https://127.0.0.1:${address.port}`,
  };
}

async function closeServer(server) {
  if (!server?.listening) return;
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

async function postForm(url, form) {
  const body = form.getBuffer();
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      method: 'POST',
      headers: {
        ...form.getHeaders(),
        'content-length': String(body.length),
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf8');
        resolve({
          status: response.statusCode,
          json: async () => JSON.parse(responseBody),
        });
      });
    });
    request.once('error', reject);
    request.end(body);
  });
}

function errorJsonMiddleware(error, _req, res, _next) {
  res.status(error.status || 400).json({
    code: error.code || error.type || 'REQUEST_REJECTED',
    message: error.message,
  });
}

test('dependency contract pins the 13 remediated packages and resolves approved vendored xlsx', () => {
  const expectedLockedVersions = {
    axios: '1.20.0',
    'body-parser': '2.3.0',
    'brace-expansion': '2.1.4',
    'engine.io': '6.6.9',
    'form-data': '4.0.6',
    morgan: '1.12.0',
    multer: '2.3.0',
    'path-to-regexp': '8.4.2',
    qs: '6.16.0',
    'socket.io-adapter': '2.5.8',
    'socket.io-parser': '4.2.7',
    undici: '8.10.1',
    ws: '8.21.3',
  };

  for (const [name, version] of Object.entries(expectedLockedVersions)) {
    assert.equal(
      packageLock.packages[`node_modules/${name}`]?.version,
      version,
      `${name} must be locked to the approved remediation version`,
    );
  }

  assert.equal(packageJson.dependencies['form-data'], '4.0.6');
  assert.equal(packageLock.packages[''].dependencies['form-data'], '4.0.6');
  assert.equal(packageJson.dependencies.xlsx, 'file:../vendor/xlsx-0.20.3.tgz');
  assert.equal(packageLock.packages['node_modules/xlsx'].version, '0.20.3');
  assert.equal(packageLock.packages['node_modules/xlsx'].resolved, 'file:../vendor/xlsx-0.20.3.tgz');
});

test('form-data escapes multipart field names and filenames against CRLF injection', () => {
  const form = new FormData();
  form.append('safe\r\nX-Injected: field', 'value');
  form.append('file', Buffer.from('safe-content'), {
    filename: 'quote"\r\nX-Injected: file.txt',
    contentType: 'text/plain',
  });

  const multipart = form.getBuffer().toString('latin1');
  assert.doesNotMatch(multipart, /\r\nX-Injected:/);
  assert.match(multipart, /name="safe%0D%0AX-Injected: field"/);
  assert.match(multipart, /filename="quote%22%0D%0AX-Injected: file\.txt"/);
});

test('multer accepts bounded uploads and rejects oversized files, excess files, parts, and field names', async (t) => {
  const app = express();
  const bounded = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 32,
      files: 1,
      fields: 1,
      parts: 3,
      fieldNameSize: 32,
      fieldSize: 16,
    },
  }).any();
  const partsOnly = multer({
    storage: multer.memoryStorage(),
    limits: { parts: 3 },
  }).any();

  app.post('/upload', bounded, (req, res) => {
    res.json({
      files: req.files.length,
      bytes: req.files.reduce((total, file) => total + file.size, 0),
      fields: Object.keys(req.body).length,
    });
  });
  app.post('/parts', partsOnly, (_req, res) => res.json({ ok: true }));
  app.use(errorJsonMiddleware);

  const server = http.createServer(app);
  const { httpUrl } = await listen(server);
  t.after(() => closeServer(server));

  const valid = new FormData();
  valid.append('note', 'bounded');
  valid.append('file', Buffer.from('12345678'), { filename: 'safe.txt' });
  const validResponse = await postForm(httpUrl + '/upload', valid);
  assert.equal(validResponse.status, 200);
  assert.deepEqual(await validResponse.json(), { files: 1, bytes: 8, fields: 1 });

  const oversized = new FormData();
  oversized.append('file', Buffer.alloc(33, 0x61), { filename: 'large.txt' });
  const oversizedResponse = await postForm(httpUrl + '/upload', oversized);
  assert.equal((await oversizedResponse.json()).code, 'LIMIT_FILE_SIZE');

  const tooManyFiles = new FormData();
  tooManyFiles.append('first', Buffer.from('a'), { filename: 'a.txt' });
  tooManyFiles.append('second', Buffer.from('b'), { filename: 'b.txt' });
  const tooManyFilesResponse = await postForm(httpUrl + '/upload', tooManyFiles);
  assert.equal((await tooManyFilesResponse.json()).code, 'LIMIT_FILE_COUNT');

  const tooManyParts = new FormData();
  tooManyParts.append('one', '1');
  tooManyParts.append('two', '2');
  tooManyParts.append('three', '3');
  const tooManyPartsResponse = await postForm(httpUrl + '/parts', tooManyParts);
  assert.equal((await tooManyPartsResponse.json()).code, 'LIMIT_PART_COUNT');

  const longNestedName = new FormData();
  longNestedName.append('deep[a][b][c][d][e][f][g][h][i][j][k]', 'value');
  const longNestedNameResponse = await postForm(httpUrl + '/upload', longNestedName);
  assert.equal((await longNestedNameResponse.json()).code, 'LIMIT_FIELD_KEY');
});

test('body-parser and qs reject invalid or over-limit input without disabling enforcement', async (t) => {
  assert.throws(
    () => bodyParser.json({ limit: 'not-a-size' }),
    /option limit "not-a-size" is invalid/,
  );
  assert.throws(
    () => qs.parse('a=1&b=2&c=3', { parameterLimit: 2, throwOnLimitExceeded: true }),
    /Parameter limit exceeded/,
  );
  assert.throws(
    () => qs.parse('a[b][c][d]=1', { depth: 2, strictDepth: true }),
    /Input depth exceeded/,
  );
  assert.doesNotThrow(() => qs.stringify(
    { values: [null, undefined, 'ok'] },
    { arrayFormat: 'comma', encodeValuesOnly: true },
  ));

  const app = express();
  app.use(express.json({ limit: '128b' }));
  app.post('/json', (req, res) => res.json({ keys: Object.keys(req.body).length }));
  app.use(errorJsonMiddleware);
  const server = http.createServer(app);
  const { httpUrl } = await listen(server);
  t.after(() => closeServer(server));

  const response = await fetch(httpUrl + '/json', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payload: 'x'.repeat(256) }),
  });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).code, 'entity.too.large');
});

test('path-to-regexp preserves the existing single catch-all route behavior', () => {
  const catchAll = match('/{*splat}');
  assert.deepEqual(catchAll('/dashboard/settings').params.splat, ['dashboard', 'settings']);
  assert.deepEqual({ ...catchAll('/').params }, {});
});

test('Socket.IO parser rejects zero, excessive, and unknown malformed packets', () => {
  const decoder = new Decoder({ maxAttachments: 2 });
  assert.throws(() => decoder.add('50-["event"]'), /Illegal attachments/);
  assert.throws(() => decoder.add('53-["event"]'), /too many attachments/);
  assert.throws(() => decoder.add('9["event"]'), /unknown packet type/);
  assert.throws(() => decoder.add(Buffer.from('orphan')), /not reconstructing a packet/);
  decoder.destroy();
});

test('Socket.IO transport rejects malformed transport and unknown session requests', async (t) => {
  const httpServer = http.createServer();
  const io = new SocketIoServer(httpServer, {
    serveClient: false,
    maxHttpBufferSize: 1024,
    transports: ['polling', 'websocket'],
  });
  const { httpUrl } = await listen(httpServer);
  t.after(async () => {
    await new Promise((resolve) => io.close(resolve));
    await closeServer(httpServer);
  });

  const invalidTransport = await fetch(httpUrl + '/socket.io/?EIO=4&transport=invalid');
  assert.equal(invalidTransport.status, 400);

  const unknownSession = await fetch(
    httpUrl + '/socket.io/?EIO=4&transport=polling&sid=not-a-session',
  );
  assert.equal(unknownSession.status, 400);
});

test('axios ignores inherited proxy pollution and sends the request to the intended target', async (t) => {
  let targetHits = 0;
  let proxyHits = 0;
  const target = http.createServer((_req, res) => {
    targetHits += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"target":true}');
  });
  const proxyTrap = http.createServer((_req, res) => {
    proxyHits += 1;
    res.writeHead(502);
    res.end('proxy trap');
  });
  const targetAddress = await listen(target);
  const proxyAddress = await listen(proxyTrap);
  t.after(() => Promise.all([closeServer(target), closeServer(proxyTrap)]));

  const proxyEnvironment = {};
  for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY']) {
    proxyEnvironment[name] = process.env[name];
    delete process.env[name];
  }
  Object.defineProperty(Object.prototype, 'proxy', {
    value: {
      protocol: 'http',
      host: '127.0.0.1',
      port: proxyAddress.port,
    },
    configurable: true,
  });

  try {
    const response = await axios.get(targetAddress.httpUrl + '/expected', { timeout: 2000 });
    assert.equal(response.status, 200);
    assert.deepEqual(response.data, { target: true });
    assert.equal(targetHits, 1);
    assert.equal(proxyHits, 0);
  } finally {
    delete Object.prototype.proxy;
    for (const [name, value] of Object.entries(proxyEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('undici failover keeps TLS verification enabled and recovers only through the explicit backup', async (t) => {
  const backup = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('backup-ok');
  });
  const invalidTlsSockets = new Set();
  const invalidTlsEndpoint = net.createServer((socket) => {
    invalidTlsSockets.add(socket);
    socket.once('close', () => invalidTlsSockets.delete(socket));
    socket.end('HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n');
  });
  const backupAddress = await listen(backup);
  const invalidTlsAddress = await listen(invalidTlsEndpoint);
  t.after(() => {
    for (const socket of invalidTlsSockets) socket.destroy();
    return Promise.all([closeServer(backup), closeServer(invalidTlsEndpoint)]);
  });

  async function fetchWithExplicitFailover(primaryUrl, backupUrl) {
    try {
      return { target: 'primary', response: await undiciFetch(primaryUrl, {
        signal: AbortSignal.timeout(2000),
      }) };
    } catch (error) {
      assert.match(String(error?.message || error), /fetch failed/i);
      return {
        target: 'backup',
        response: await undiciFetch(backupUrl, { signal: AbortSignal.timeout(2000) }),
      };
    }
  }

  const tlsResult = await fetchWithExplicitFailover(
    invalidTlsAddress.httpsUrl + '/health',
    backupAddress.httpUrl + '/health',
  );
  assert.equal(tlsResult.target, 'backup');
  assert.equal(await tlsResult.response.text(), 'backup-ok');

  const unavailablePort = await (async () => {
    const reservation = http.createServer();
    const address = await listen(reservation);
    await closeServer(reservation);
    return address.port;
  })();
  const httpResult = await fetchWithExplicitFailover(
    `http://127.0.0.1:${unavailablePort}/health`,
    backupAddress.httpUrl + '/health',
  );
  assert.equal(httpResult.target, 'backup');
  assert.equal(await httpResult.response.text(), 'backup-ok');
});
