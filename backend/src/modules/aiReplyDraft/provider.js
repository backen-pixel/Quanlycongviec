'use strict';

// Provider-neutral interface for drafting. No env access, no logging of content, safe error codes only.
class ProviderError extends Error {
  constructor(code) { super(code); this.name = 'ProviderError'; this.code = code; }
}

function createMockProvider(script = []) {
  const queue = Array.isArray(script) ? [...script] : [script];
  return {
    calls: [],
    async generate(input) {
      this.calls.push(input);
      const next = queue.length > 1 ? queue.shift() : queue[0];
      if (next instanceof ProviderError) throw next;
      const item = typeof next === 'string' ? { text: next } : (next ?? { text: '' });
      return { text: item.text ?? '', usage: item.usage ?? { promptTokens: 0, completionTokens: 0 }, model: 'mock' };
    },
  };
}

const statusCode = status => status === 401 || status === 403 ? 'PROVIDER_AUTH'
  : status === 429 ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_ERROR';

function createOpenAiProvider({ getApiKey, fetchImpl = fetch, model = 'gpt-4o-mini', timeoutMs = 20000 } = {}) {
  if (typeof getApiKey !== 'function') throw new ProviderError('PROVIDER_AUTH');
  return {
    async generate({ system, user, maxOutputTokens = 300, signal } = {}) {
      const key = getApiKey();
      if (!key) throw new ProviderError('PROVIDER_AUTH');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const abortOuter = () => controller.abort();
      signal?.addEventListener?.('abort', abortOuter, { once: true });
      try {
        const response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model, temperature: 0.3, max_tokens: maxOutputTokens, store: false,
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new ProviderError(statusCode(response.status));
        let body;
        try { body = await response.json(); } catch { throw new ProviderError('PROVIDER_ERROR'); }
        const text = body?.choices?.[0]?.message?.content;
        if (typeof text !== 'string') throw new ProviderError('PROVIDER_ERROR');
        return { text, model: body.model || model, usage: {
          promptTokens: Number.isSafeInteger(body.usage?.prompt_tokens) ? body.usage.prompt_tokens : 0,
          completionTokens: Number.isSafeInteger(body.usage?.completion_tokens) ? body.usage.completion_tokens : 0,
        } };
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        throw new ProviderError(error?.name === 'AbortError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_ERROR');
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener?.('abort', abortOuter);
      }
    },
  };
}

module.exports = { ProviderError, createMockProvider, createOpenAiProvider };
