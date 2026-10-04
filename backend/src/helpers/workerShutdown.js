'use strict';
const { randomUUID } = require('node:crypto');

// Registered workers only. Never use this report as a whole-process/cutover certificate.
function installWorkerShutdown({ server, io, workers, processLike = process, timeoutMs = 20000,
  onReport = () => {}, exit = code => processLike.exit(code), revision = null }) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new TypeError('Invalid shutdown timeout');
  const bootId = randomUUID();
  const safeRevision = typeof revision === 'string' && /^[a-f0-9]{40}$/i.test(revision) ? revision : null;
  let stopping = false, pending = null;
  function middleware(req, res, next) {
    if (!stopping) return next();
    res.setHeader('Connection', 'close'); res.setHeader('Retry-After', '30');
    return res.status(503).json({ code: 'SERVER_STOPPING', error: 'Hệ thống đang chuyển phiên vận hành. Vui lòng thử lại.' });
  }
  function begin(signal = 'INTERNAL') {
    if (pending) return pending;
    // Publish the promise before any injected callback can re-enter begin().
    let complete;
    pending = new Promise(resolve => { complete = resolve; });
    stopping = true;
    const errors = [];
    try { workers.stop(); } catch { errors.push('WORKER_STOP_FAILED'); }
    const httpClosed = new Promise(resolve => {
      try {
        server.close(error => { if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') errors.push('HTTP_CLOSE_FAILED'); resolve(); });
      } catch { errors.push('HTTP_CLOSE_FAILED'); resolve(); }
    });
    try { server.closeIdleConnections?.(); } catch { errors.push('IDLE_CLOSE_FAILED'); }
    let socketCallback, socketError = false;
    const socketCallbackDone = new Promise(resolve => { socketCallback = resolve; });
    const socketFailed = () => { if (!socketError) errors.push('SOCKET_CLOSE_FAILED'); socketError = true; socketCallback(); };
    let socketPromise;
    try {
      if (io?.close) socketPromise = io.close(error => {
        if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') socketFailed();
        else socketCallback();
      });
      else socketCallback();
    } catch { socketFailed(); }
    // Socket.IO close may both return a promise and finish HTTP via a callback.
    // Await both channels; a rejection must not become an unhandled success.
    const socketsClosed = Promise.all([socketCallbackDone, Promise.resolve(socketPromise).catch(socketFailed)]);
    void (async () => {
      let report, deadline, timedOut = false;
      try {
        const result = await Promise.race([
          Promise.all([httpClosed, socketsClosed, workers.waitForIdle({ timeoutMs })])
            .then(([, , workersResult]) => ({ workersResult, timedOut: workersResult.timedOut === true })),
          new Promise(resolve => { deadline = setTimeout(() => resolve({ timedOut: true }), timeoutMs); }),
        ]);
        timedOut = result.timedOut;
        report = { workers: result.workersResult || workers.status(), timedOut, errors: [...errors] };
      } catch {
        report = { timedOut, errors: [...errors, 'SHUTDOWN_OBSERVATION_FAILED'] };
      } finally { clearTimeout(deadline); }
      Object.assign(report, { bootId, revision: safeRevision, signal: ['SIGTERM', 'SIGINT'].includes(signal) ? signal : 'INTERNAL',
        scope: 'REGISTERED_WORKERS_THIS_PROCESS', processesDrained: false, processTerminationRequired: true,
        notCovered: ['HTTP_RECEIVERS_AND_POST_ACK_TASKS', 'LEGACY_TIMERS_AND_SCRIPTS', 'DETACHED_SOCKET_MOBILE_PUSH', 'OTHER_PROCESSES_AND_REMOTE_REQUESTS'] });
      try { Promise.resolve(onReport(report)).catch(() => {}); } catch { /* reporting must not delay termination */ }
      complete(report);
      exit(report.timedOut || report.errors.length ? 1 : 0);
    })();
    return pending;
  }
  processLike.on('SIGTERM', () => { void begin('SIGTERM'); });
  processLike.on('SIGINT', () => { void begin('SIGINT'); });
  return { begin, middleware, isStopping: () => stopping, bootId };
}

function configureWorkerShutdown({ env = process.env, ...options }) {
  return env.VPT_WORKER_SHUTDOWN === '1' ? installWorkerShutdown(options) : null;
}
module.exports = { installWorkerShutdown, configureWorkerShutdown };
