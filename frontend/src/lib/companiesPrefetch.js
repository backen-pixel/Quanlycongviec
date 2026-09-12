const TTL_MS = 5 * 60 * 1000;
const cache = new Map();
const inflight = new Map();

function cacheKey(forModule) {
  return forModule || 'all';
}

export function parseCompaniesResponse(data) {
  return Array.isArray(data) ? data : (data?.companies || []);
}

export function peekCompaniesPrefetch(forModule = '') {
  const hit = cache.get(cacheKey(forModule));
  if (!hit || Date.now() - hit.at > TTL_MS) return null;
  return hit.list;
}

export function prefetchCompanies(apiClient, { forModule = '' } = {}) {
  const key = cacheKey(forModule);
  const cached = peekCompaniesPrefetch(forModule);
  if (cached) return Promise.resolve(cached);
  if (inflight.has(key)) return inflight.get(key);

  const params = forModule ? { for_module: forModule } : {};
  const request = apiClient.get('/companies', { params })
    .then((res) => {
      const list = parseCompaniesResponse(res.data);
      cache.set(key, { list, at: Date.now() });
      return list;
    })
    .catch((error) => {
      const stale = cache.get(key);
      if (stale?.list) return stale.list;
      throw error;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, request);
  return request;
}
