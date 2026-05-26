import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { isCrmOnlyModuleAccess } from '../../lib/moduleAccess';

const ModuleAccessContext = createContext(null);

const FALLBACK_ACCESS = { allowAll: true };

export function ModuleAccessProvider({ children }) {
  const { user } = useAuth();
  const [moduleAccess, setModuleAccess] = useState(null);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!user) {
      setModuleAccess(null);
      setLoading(false);
      return FALLBACK_ACCESS;
    }
    setLoading(true);
    try {
      const { data } = await api.get('/ecosystem/my-module-access');
      const next = data ?? FALLBACK_ACCESS;
      setModuleAccess(next);
      return next;
    } catch {
      setModuleAccess(FALLBACK_ACCESS);
      return FALLBACK_ACCESS;
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setModuleAccess(null);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) {
        setModuleAccess((prev) => (prev === null ? FALLBACK_ACCESS : prev));
        setLoading(false);
      }
    }, 12_000);
    setLoading(true);
    api
      .get('/ecosystem/my-module-access')
      .then((r) => {
        if (!cancelled) setModuleAccess(r.data ?? FALLBACK_ACCESS);
      })
      .catch(() => {
        if (!cancelled) setModuleAccess(FALLBACK_ACCESS);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [user]);

  const canAccessModule = useCallback(
    (key) => {
      if (!key) return true;
      if (!moduleAccess) return true;
      if (moduleAccess.allowAll) return true;
      return moduleAccess.modules?.[key] !== false;
    },
    [moduleAccess],
  );

  const crmOnly = useMemo(() => isCrmOnlyModuleAccess(moduleAccess), [moduleAccess]);

  const value = useMemo(
    () => ({
      moduleAccess,
      loading: !!user && moduleAccess === null,
      canAccessModule,
      crmOnly,
      refetch,
    }),
    [moduleAccess, user, canAccessModule, crmOnly, refetch],
  );

  return (
    <ModuleAccessContext.Provider value={value}>
      {children}
    </ModuleAccessContext.Provider>
  );
}

export function useModuleAccess() {
  const ctx = useContext(ModuleAccessContext);
  if (!ctx) {
    return {
      moduleAccess: null,
      loading: false,
      canAccessModule: () => true,
      crmOnly: false,
      refetch: async () => FALLBACK_ACCESS,
    };
  }
  return ctx;
}
