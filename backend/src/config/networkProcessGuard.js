/**
 * Tránh crash process khi TLS/HTTP2 stream bị reset giữa chừng (Supabase, Google, undici).
 * Lỗi mạng tạm thời → log cảnh báo, không thoát process.
 */

function isTransientNetworkError(err) {
  if (!err) return false;
  const code = String(err.code || err.errno || '');
  const msg = String(err.message || err);
  return (
    code === 'ECONNRESET'
    || code === 'EPIPE'
    || code === 'ETIMEDOUT'
    || code === 'ECONNREFUSED'
    || code === 'ERR_HTTP2_STREAM_CANCEL'
    || code === 'ERR_SSL_SSLV3_ALERT_BAD_RECORD_MAC'
    || /ECONNRESET|EPIPE|socket hang up|ClientHttp2Stream/i.test(msg)
  );
}

function installNetworkProcessGuard() {
  if (installNetworkProcessGuard._installed) return;
  installNetworkProcessGuard._installed = true;

  process.on('uncaughtException', (err) => {
    if (isTransientNetworkError(err)) {
      console.warn('[network] Transient socket error (ignored):', err.code || err.message);
      return;
    }
    console.error('[process] Uncaught exception:', err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    if (isTransientNetworkError(reason)) {
      console.warn('[network] Transient promise rejection (ignored):', reason?.code || reason?.message || reason);
      return;
    }
    console.error('[process] Unhandled rejection:', reason);
  });
}

function bindUndiciAgentSafety(agent, label = 'undici') {
  if (!agent || agent.__safetyBound) return agent;
  agent.__safetyBound = true;
  const onErr = (err) => {
    if (isTransientNetworkError(err)) {
      console.warn(`[${label}]`, err.code || err.message);
      return;
    }
    console.warn(`[${label}]`, err?.message || err);
  };
  if (typeof agent.on === 'function') {
    agent.on('error', onErr);
    agent.on('ConnectionError', onErr);
  }
  return agent;
}

module.exports = {
  installNetworkProcessGuard,
  bindUndiciAgentSafety,
  isTransientNetworkError,
};
