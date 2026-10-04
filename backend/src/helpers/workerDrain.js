'use strict';

// A one-way, instance-local stop latch. This is not evidence that another
// process, a remote HTTP request, or a database transaction has stopped.
function createWorkerDrain(work) {
  if (typeof work !== 'function') throw new TypeError('Invalid worker');
  let stopped = false, active = null;
  const status = () => ({ scope: 'THIS_WORKER_INSTANCE', stopped, active: !!active,
    state: stopped ? (active ? 'STOPPING' : 'STOPPED') : (active ? 'RUNNING' : 'IDLE'),
    locallyDrained: stopped && !active, businessReconciled: false });
  function drain() {
    if (active) return active;
    if (stopped) return Promise.resolve();
    active = Promise.resolve().then(() => stopped ? undefined : work()).finally(() => { active = null; });
    return active;
  }
  function stop() { stopped = true; return status(); }
  async function waitForIdle({ timeoutMs = 30000 } = {}) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 60000) throw new TypeError('Invalid worker wait timeout');
    const pending = active;
    if (!pending || timeoutMs === 0) return { ...status(), timedOut: !!pending };
    let timer;
    try {
      const settled = await Promise.race([
        pending.then(() => true, () => true),
        new Promise(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); }),
      ]);
      return { ...status(), timedOut: !settled };
    } finally { clearTimeout(timer); }
  }
  return { drain, stop, waitForIdle, status, isStopped: () => stopped };
}

function createWorkerGroup(workers, { onError = () => {}, timers = globalThis } = {}) {
  const entries = Object.entries(workers);
  if (!entries.length || entries.some(([, w]) => !w || ['drain','stop','waitForIdle','status'].some(k => typeof w[k] !== 'function'))) throw new TypeError('Invalid worker group');
  let stopped = false;
  const registry = new Map(entries);
  const reportError = name => { try { Promise.resolve(onError(name)).catch(() => {}); } catch { /* logging cannot restart or reject the scheduler */ } };
  const intervals = new Set(), immediates = new Set();
  const status = () => {
    const members = Object.fromEntries(entries.map(([name, w]) => [name, w.status()]));
    return { scope: 'REGISTERED_WORKERS_THIS_PROCESS', members, stopped,
      locallyDrained: stopped && Object.values(members).every(x => x.locallyDrained), processesDrained: false,
      notCovered: ['HTTP_RECEIVERS_AND_POST_ACK_TASKS','LEGACY_TIMERS_AND_SCRIPTS','DETACHED_SOCKET_MOBILE_PUSH','OTHER_PROCESSES_AND_REMOTE_REQUESTS'] };
  };
  return { status, schedule(names, intervalMs) {
    if (!Array.isArray(names) || !names.length || new Set(names).size !== names.length
      || names.some(n => !registry.has(n)) || !Number.isSafeInteger(intervalMs) || intervalMs < 1 || intervalMs > 2147483647) throw new TypeError('Invalid worker schedule');
    if (stopped) return false;
    const selected = [...names];
    const tick = () => {
      if (stopped) return;
      for (const name of selected) {
        if (stopped) break;
        try { Promise.resolve(registry.get(name).drain()).catch(() => reportError(name)); }
        catch { reportError(name); }
      }
    };
    const interval = timers.setInterval(tick, intervalMs); interval.unref?.(); intervals.add(interval);
    const immediate = timers.setImmediate(() => { immediates.delete(immediate); tick(); }); immediate.unref?.(); immediates.add(immediate);
    return true;
  }, stop() {
    stopped = true;
    for (const timer of intervals) timers.clearInterval(timer);
    for (const timer of immediates) timers.clearImmediate(timer);
    intervals.clear(); immediates.clear();
    // Stop admission everywhere before waiting for even one member.
    const failures = [];
    for (const [, worker] of entries) { try { worker.stop(); } catch { failures.push(new Error('Worker stop failed')); } }
    if (failures.length) throw new AggregateError(failures, 'Worker group stop failed');
    return status();
  }, async waitForIdle(options) {
    const results = await Promise.all(entries.map(([, w]) => w.waitForIdle(options)));
    return { ...status(), timedOut: results.some(x => x.timedOut) };
  } };
}
module.exports = { createWorkerDrain, createWorkerGroup };
