const { createClient } = require('@supabase/supabase-js');
const config = require('./index');

const nativeFetch = globalThis.fetch.bind(globalThis);

/** Giảm lỗi tạm thời Node/undici: "TypeError: fetch failed" khi gọi Supabase (VPN, DNS, pool). */
async function fetchWithRetry(url, init) {
  const attempts = 4;
  const baseMs = 300;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await nativeFetch(url, init);
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
        || causeMsg.includes('ECONNRESET')
        || causeMsg.includes('ETIMEDOUT');
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
