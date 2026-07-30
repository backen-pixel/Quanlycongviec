import { Outlet, useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';

/** Shell tối giản — dashboard tự mang chrome giống CRM (không header phụ). */
export default function AppModuleLayout() {
  const { moduleKey } = useParams();
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const [mod, setMod] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get(`/app-modules/${moduleKey}`)
      .then((r) => { if (!cancelled) setMod(r.data.module); })
      .catch(() => { if (!cancelled) setMod(null); });
    return () => { cancelled = true; };
  }, [moduleKey]);

  return (
    <Outlet context={{ mod, moduleKey, isAdmin }} />
  );
}
