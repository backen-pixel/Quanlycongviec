const { factoryError } = require('../errors');
const { assertPlainJsonValue } = require('../plainJson');

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const MAX_PROOF_REQUEST_BYTES = 8 * 1024 * 1024;
const MAX_PROOF_RESPONSE_BYTES = 8 * 1024 * 1024;

function normalizeProofEndpoint(endpoint) {
  let parsed;
  try {
    parsed = new URL(String(endpoint || ''));
  } catch {
    throw factoryError('SF2C1_PROOF_ENDPOINT_INVALID', 'SF2-C1 proof endpoint không hợp lệ.');
  }
  if (parsed.protocol !== 'http:' || !LOOPBACK_HOSTS.has(parsed.hostname)
    || parsed.username || parsed.password || parsed.pathname !== '/') {
    throw factoryError(
      'SF2C1_PROOF_ENDPOINT_DENIED',
      'SF2-C1 adapter chỉ được gọi isolated loopback HTTP proof service.',
    );
  }
  return parsed.origin;
}

function validateProofClientOptions({ endpoint, service_token: serviceToken, timeout_ms: timeoutMs }) {
  const normalizedEndpoint = normalizeProofEndpoint(endpoint);
  if (typeof serviceToken !== 'string' || serviceToken.length < 32) {
    throw factoryError('SF2C1_PROOF_TOKEN_REQUIRED', 'SF2-C1 proof service cần ephemeral service token.');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 30000) {
    throw factoryError('SF2C1_PROOF_TIMEOUT_INVALID', 'SF2-C1 proof timeout phải trong 50..30000ms.');
  }
  return normalizedEndpoint;
}

async function callProofService({
  endpoint,
  service_token: serviceToken,
  timeout_ms: timeoutMs,
  service,
  method,
  args = [],
}) {
  assertPlainJsonValue({ method, args });
  const requestBody = JSON.stringify({ method, args });
  if (Buffer.byteLength(requestBody, 'utf8') > MAX_PROOF_REQUEST_BYTES) {
    throw factoryError(
      'SF2C1_' + service + '_REQUEST_TOO_LARGE',
      service + ' proof request vượt byte budget; fail closed.',
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetch(endpoint + '/rpc', {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + serviceToken,
          'content-type': 'application/json',
        },
        body: requestBody,
        redirect: 'error',
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') {
        throw factoryError('SF2C1_' + service + '_TIMEOUT', service + ' proof operation timed out; outcome không được đoán success.');
      }
      const redirectDetails = [error?.message, error?.cause?.message, error?.cause?.code]
        .filter(Boolean)
        .join(' ');
      if (/redirect/i.test(redirectDetails)) {
        throw factoryError(
          'SF2C1_' + service + '_REDIRECT_DENIED',
          service + ' proof redirect bị deny để giữ loopback trust boundary.',
        );
      }
      throw factoryError('SF2C1_' + service + '_UNAVAILABLE', service + ' proof service unavailable; fail closed.');
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength !== null) {
      if (!/^\d+$/.test(contentLength)) {
        throw factoryError('SF2C1_' + service + '_RESPONSE_INVALID', service + ' proof Content-Length không hợp lệ.');
      }
      if (Number(contentLength) > MAX_PROOF_RESPONSE_BYTES) {
        controller.abort();
        throw factoryError(
          'SF2C1_' + service + '_RESPONSE_TOO_LARGE',
          service + ' proof response vượt byte budget; fail closed.',
        );
      }
    }
    if (!response.body) {
      throw factoryError('SF2C1_' + service + '_RESPONSE_INVALID', service + ' proof response body bị thiếu.');
    }

    const chunks = [];
    let totalBytes = 0;
    try {
      for await (const chunk of response.body) {
        const buffer = Buffer.from(chunk);
        totalBytes += buffer.length;
        if (totalBytes > MAX_PROOF_RESPONSE_BYTES) {
          controller.abort();
          throw factoryError(
            'SF2C1_' + service + '_RESPONSE_TOO_LARGE',
            service + ' proof response vượt byte budget; fail closed.',
          );
        }
        chunks.push(buffer);
      }
    } catch (error) {
      if (error?.code === 'SF2C1_' + service + '_RESPONSE_TOO_LARGE') throw error;
      if (controller.signal.aborted || error?.name === 'AbortError') {
        throw factoryError('SF2C1_' + service + '_TIMEOUT', service + ' proof operation timed out; outcome không được đoán success.');
      }
      throw factoryError('SF2C1_' + service + '_UNAVAILABLE', service + ' proof response interrupted; fail closed.');
    }

    let envelope;
    try {
      envelope = JSON.parse(Buffer.concat(chunks, totalBytes).toString('utf8'));
      assertPlainJsonValue(envelope);
    } catch (error) {
      if (error?.code === 'CANONICAL_BUDGET_EXCEEDED') {
        throw factoryError('SF2C1_' + service + '_RESPONSE_TOO_LARGE', service + ' proof response vượt canonical budget.');
      }
      throw factoryError('SF2C1_' + service + '_RESPONSE_INVALID', service + ' proof response không phải canonical JSON.');
    }
    if (!response.ok || envelope?.ok !== true) {
      const code = typeof envelope?.error?.code === 'string'
        ? envelope.error.code
        : 'SF2C1_' + service + '_REQUEST_FAILED';
      const message = typeof envelope?.error?.message === 'string'
        ? envelope.error.message
        : service + ' proof request bị từ chối.';
      throw factoryError(code, message);
    }
    return envelope.result;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  MAX_PROOF_REQUEST_BYTES,
  MAX_PROOF_RESPONSE_BYTES,
  callProofService,
  normalizeProofEndpoint,
  validateProofClientOptions,
};
