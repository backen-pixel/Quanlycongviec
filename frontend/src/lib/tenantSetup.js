import { useEffect, useState } from 'react';
import api from './api';

export function useTenantSetupGuard(user) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(!!user?.tenant_id);

  useEffect(() => {
    if (!user?.tenant_id) {
      setStatus({ needs_setup: false });
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.get('/tenant/setup-progress')
      .then(({ data }) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setStatus({ needs_setup: false });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.tenant_id, user?.company_id]);

  return { status, loading };
}
