'use strict';
// Isolated child: native HTTP/signals, synthetic receipt persistence, no DB/provider.
const http = require('node:http'), fs = require('node:fs');
const { createWorkerDrain, createWorkerGroup } = require('../../src/helpers/workerDrain');
const { configureWorkerShutdown } = require('../../src/helpers/workerShutdown');
const emit = value => fs.writeSync(1, JSON.stringify(value) + '\n');
let release, entered;
const result = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { entered = resolve; });
const worker = createWorkerDrain(async () => { entered(); await result; emit({ event: 'PERSISTED' }); });
const workers = createWorkerGroup({ receipt: worker });
const stop = workers.stop; workers.stop = () => { const status = stop(); emit({ event: 'STOPPED_ADMISSION' }); return status; };
const server = http.createServer((req, res) => res.end('synthetic'));
const shutdown = configureWorkerShutdown({ env: { VPT_WORKER_SHUTDOWN: '1' }, server, workers,
 timeoutMs: process.argv[2] === 'timeout' ? 60 : 3000, onReport: report => emit({ event: 'REPORT', report }) });
process.on('message', message => { if (message === 'release') release(); });
server.listen(0, '127.0.0.1', async () => {
 void worker.drain(); await started; process.send({ event: 'READY', bootId: shutdown.bootId });
});
