/**
 * Shared HTTP connection pools — tách Supabase REST khỏi external APIs
 * để burst Supabase không chiếm socket của Facebook/Zalo/MISA/axios nội bộ.
 */

const http = require('http');
const https = require('https');
const axios = require('axios');
const { Agent: UndiciAgent } = require('undici');
const { bindUndiciAgentSafety } = require('./networkProcessGuard');

const supabaseKeepAliveMs = parseInt(process.env.SUPABASE_KEEPALIVE_MS || '30000', 10);

/** Pool cho Supabase REST (@supabase/supabase-js qua undici fetch). */
const supabaseDispatcher = bindUndiciAgentSafety(new UndiciAgent({
  connect: { family: 4, timeout: 15_000 },
  keepAliveTimeout: supabaseKeepAliveMs,
  keepAliveMaxTimeout: 600_000,
  pipelining: 1,
  connections: 64,
  headersTimeout: 30_000,
  bodyTimeout: 60_000,
}), 'undici:supabase');

/** Pool cho external APIs (Facebook Graph, Zalo, MISA, Stringee, …). */
const externalDispatcher = bindUndiciAgentSafety(new UndiciAgent({
  connect: { timeout: 15_000 },
  keepAliveTimeout: 10_000,
  keepAliveMaxTimeout: 120_000,
  pipelining: 1,
  connections: 32,
  headersTimeout: 30_000,
  bodyTimeout: 120_000,
}), 'undici:external');

const httpKeepAliveAgent = new http.Agent({ keepAlive: true, maxSockets: 32, keepAliveMsecs: 10_000 });
const httpsKeepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: 32, keepAliveMsecs: 10_000 });

/** Axios instance dùng chung cho outbound HTTP(S) — tránh dùng default pool toàn cục. */
const externalAxios = axios.create({
  httpAgent: httpKeepAliveAgent,
  httpsAgent: httpsKeepAliveAgent,
  timeout: 60_000,
});

module.exports = {
  supabaseDispatcher,
  externalDispatcher,
  externalAxios,
  httpKeepAliveAgent,
  httpsKeepAliveAgent,
};
