/**
 * Giám sát Socket.IO: số kết nối sống + độ trễ Event Loop (P99).
 */
const { monitorEventLoopDelay } = require('perf_hooks');

let histogram = null;
let started = false;

function startSocketMetrics() {
  if (started) return;
  started = true;
  try {
    histogram = monitorEventLoopDelay({ resolution: 20 });
    histogram.enable();
  } catch (e) {
    console.warn('[socket-metrics] event loop monitor unavailable:', e.message);
  }
}

/**
 * @param {import('socket.io').Server|null|undefined} io
 */
function getSocketMetricsSnapshot(io) {
  const activeConnections = io?.engine?.clientsCount ?? 0;
  let eventLoop = null;
  if (histogram) {
    const p50 = histogram.percentile(50) / 1e6;
    const p99 = histogram.percentile(99) / 1e6;
    const max = histogram.max / 1e6;
    eventLoop = {
      p50_ms: Math.round(p50 * 100) / 100,
      p99_ms: Math.round(p99 * 100) / 100,
      max_ms: Math.round(max * 100) / 100,
      alert: p99 > 10,
    };
    histogram.reset();
  }
  return {
    active_connections: activeConnections,
    event_loop: eventLoop,
    ts: new Date().toISOString(),
  };
}

module.exports = {
  startSocketMetrics,
  getSocketMetricsSnapshot,
};
