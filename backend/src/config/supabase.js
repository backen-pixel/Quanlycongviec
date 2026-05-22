const { createClient } = require('@supabase/supabase-js');
const { Agent, fetch: undiciFetch } = require('undici');
const config = require('./index');

/**
 * Trên Windows + Node 22 (undici), kết nối tới Supabase hay bị "TypeError: fetch failed"
 * khi payload lớn (vài MB) hoặc khi máy ngủ/đổi mạng/AV-VPN cắt TLS giữa chừng.
 *
 * - `connect.family: 4`: ép IPv4 (Supabase trả AAAA, IPv6 outbound trên Windows hay chập chờn).
 * - `pipelining: 0` + `keepAliveTimeout/keepAliveMaxTimeout` ngắn: hạn chế socket "thối"
 *   khi tái sử dụng, đặc biệt khi có HTTPS-inspection (Defender/Kaspersky/Sophos/...).
 * - `headersTimeout/bodyTimeout`: cho phép response lớn (~30s) trước khi abort.
 */
const supabaseDispatcher = new Agent({
  connect: { family: 4, timeout: 15_000 },
  keepAliveTimeout: 1_000,
  keepAliveMaxTimeout: 5_000,
  pipelining: 0,
  headersTimeout: 30_000,
  bodyTimeout: 60_000,
});

/** Giảm lỗi tạm thời Node/undici: "TypeError: fetch failed" khi gọi Supabase (VPN, DNS, pool). */
async function fetchWithRetry(url, init) {
  const attempts = 4;
  const baseMs = 300;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await undiciFetch(url, { ...init, dispatcher: supabaseDispatcher });
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || err);
      const causeMsg = err?.cause != null ? String(err.cause?.message || err.cause) : '';
      const retryable =
        msg.includes('fetch failed')
        || msg.includes('ECONNRESET')
        || msg.includes('ETIMEDOUT')
        || msg.includes('ECONNREFUSED')
        || msg.includes('ENOTFOUND')
        || msg.includes('UND_ERR')
        || causeMsg.includes('ECONNRESET')
        || causeMsg.includes('ETIMEDOUT')
        || causeMsg.includes('UND_ERR');
      if (!retryable || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, baseMs * (i + 1)));
    }
  }
  throw lastErr;
}

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: fetchWithRetry },
});

module.exports = { supabase };
