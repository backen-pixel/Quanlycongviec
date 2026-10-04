'use strict';

// Tracks admitted promises and owned schedules within one process. It does not
// certify remote calls, other processes, or successful business reconciliation.
function createProcessWork({ scope, timers = globalThis, onError = () => {} }) {
  if (typeof scope !== 'string' || !/^[A-Z_]+$/.test(scope)) throw new TypeError('Invalid process scope');
  let stopped = false;
  const pending = new Set(), scheduled = new Map(), sleepers = new Map(), listeners = new Set(), stopHooks = new Set();
  const stoppingError = () => Object.assign(new Error('Process is stopping'), { code: 'PROCESS_STOPPING', status: 503 });
  const notify = () => { for (const wake of [...listeners]) wake(); };
  const status = () => ({ scope, stopped, active: pending.size > 0, activeCount: pending.size,
    scheduledCount: scheduled.size, locallyDrained: stopped && pending.size === 0, businessReconciled: false, processesDrained: false });
  function track(promise) {
    const observed = Promise.resolve(promise);
    pending.add(observed);
    observed.then(() => { pending.delete(observed); notify(); }, () => { pending.delete(observed); notify(); });
    return observed;
  }
  function run(work) {
    if (stopped) return Promise.reject(stoppingError());
    // Register before user code runs, including synchronous reentrant stop().
    let complete, fail;
    const result = track(new Promise((resolve, reject) => { complete = resolve; fail = reject; }));
    try { complete(work()); } catch (error) { fail(error); }
    return result;
  }
  const report = () => { try { Promise.resolve(onError('PROCESS_WORK_FAILED')).catch(() => {}); } catch { /* sanitized, best effort */ } };
  function spawn(work) { const result = run(work); result.catch(report); return result; }
  function cancel(handle) {
    const kind = scheduled.get(handle);
    if (!kind) return;
    scheduled.delete(handle);
    timers[kind === 'interval' ? 'clearInterval' : kind === 'immediate' ? 'clearImmediate' : 'clearTimeout'](handle);
  }
  function schedule(kind, work, delay) {
    if (stopped) return null;
    if (typeof work !== 'function' || (kind !== 'immediate' && (!Number.isSafeInteger(delay) || delay < 0 || delay > 2147483647))) throw new TypeError('Invalid process schedule');
    const callback = () => {
      if (kind !== 'interval') scheduled.delete(handle);
      if (!stopped) spawn(work);
    };
    const handle = timers[kind === 'interval' ? 'setInterval' : kind === 'immediate' ? 'setImmediate' : 'setTimeout'](callback, delay);
    scheduled.set(handle, kind); return handle;
  }
  function sleep(ms) {
    if (!Number.isSafeInteger(ms) || ms < 0 || ms > 2147483647) return Promise.reject(new TypeError('Invalid process sleep'));
    if (stopped) return Promise.resolve(false);
    return new Promise(resolve => {
      const handle = timers.setTimeout(() => { sleepers.delete(handle); resolve(true); }, ms);
      sleepers.set(handle, resolve);
    });
  }
  function stop() {
    if (stopped) return status();
    stopped = true;
    const failures = [];
    for (const handle of [...scheduled.keys()]) { try { cancel(handle); } catch { failures.push(new Error('Schedule stop failed')); } }
    for (const [handle, resolve] of sleepers) { try { timers.clearTimeout(handle); } catch { failures.push(new Error('Sleep stop failed')); } resolve(false); }
    sleepers.clear();
    for (const hook of stopHooks) { try { hook(); } catch { failures.push(new Error('Process stop hook failed')); } }
    notify();
    if (failures.length) throw new AggregateError(failures, 'Process stop failed');
    return status();
  }
  async function waitForIdle({ timeoutMs = 30000 } = {}) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 60000) throw new TypeError('Invalid process wait');
    if (!pending.size || !timeoutMs) return { ...status(), timedOut: pending.size > 0 };
    let timer, wake;
    try {
      const idle = await new Promise(resolve => {
        wake = () => { if (!pending.size) resolve(true); };
        listeners.add(wake); timer = timers.setTimeout(() => resolve(false), timeoutMs); wake();
      });
      return { ...status(), timedOut: !idle };
    } finally { listeners.delete(wake); timers.clearTimeout(timer); }
  }
  return { run, spawn, track, status, stop, waitForIdle, sleep, cancel, isStopped: () => stopped,
    assertOpen() { if (stopped) throw stoppingError(); },
    onStop(hook) { if (stopped) throw stoppingError(); stopHooks.add(hook); },
    timeout: (work, ms) => schedule('timeout', work, ms), interval: (work, ms) => schedule('interval', work, ms),
    immediate: work => schedule('immediate', work), drain: () => Promise.resolve() };
}
module.exports = { createProcessWork };
