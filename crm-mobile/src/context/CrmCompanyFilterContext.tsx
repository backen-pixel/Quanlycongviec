import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';
import { useAuth } from './AuthContext';
import {
  CRM_MOBILE_SYSTEM_ADMIN_COMPANY_KEY,
  crmCompanyQueryParams,
  isCrmSystemAdmin,
} from '../lib/crmCompanyScope';

export type CompanyOption = { id: string; name: string };

type Ctx = {
  showCompanyPicker: boolean;
  companies: CompanyOption[];
  selectedCompanyId: string;
  setSelectedCompanyId: (id: string) => void;
  companyQueryParams: Record<string, string>;
  needsCompanySelection: boolean;
};

const CrmCoCtx = createContext<Ctx | null>(null);

/**
 * Phạm vi công ty dùng chung toàn app: admin hệ thống chọn công ty (lưu storage);
 * admin công ty / NV: lấy từ JWT.
 */
export function CrmCompanyFilterProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyIdState] = useState('');

  useEffect(() => {
    if (!user) {
      setCompanies([]);
      setSelectedCompanyIdState('');
    }
  }, [user]);

  const showCompanyPicker = useMemo(() => isCrmSystemAdmin(user), [user]);

  useEffect(() => {
    if (!showCompanyPicker) {
      setSelectedCompanyIdState('');
      return;
    }
    let cancelled = false;
    AsyncStorage.getItem(CRM_MOBILE_SYSTEM_ADMIN_COMPANY_KEY).then((raw) => {
      if (cancelled || !raw) return;
      setSelectedCompanyIdState(raw);
    });
    return () => {
      cancelled = true;
    };
  }, [showCompanyPicker]);

  useEffect(() => {
    if (!showCompanyPicker) return;
    let cancelled = false;
    api
      .get('/companies', { params: { for_module: 'crm' } })
      .then((r) => {
        if (cancelled) return;
        const raw = (r.data as { companies?: { id: string; short_name?: string; name?: string }[] })?.companies;
        const list = Array.isArray(raw) ? raw : [];
        setCompanies(
          list.map((c) => ({
            id: c.id,
            name: String(c.short_name || c.name || '').trim() || c.id,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setCompanies([]);
      });
    return () => {
      cancelled = true;
    };
  }, [showCompanyPicker]);

  useEffect(() => {
    if (!showCompanyPicker || !companies.length || selectedCompanyId) return;
    const first = companies[0]?.id;
    if (first) {
      setSelectedCompanyIdState(first);
      void AsyncStorage.setItem(CRM_MOBILE_SYSTEM_ADMIN_COMPANY_KEY, first);
    }
  }, [showCompanyPicker, companies, selectedCompanyId]);

  const setSelectedCompanyId = useCallback((id: string) => {
    setSelectedCompanyIdState(id);
    void AsyncStorage.setItem(CRM_MOBILE_SYSTEM_ADMIN_COMPANY_KEY, id);
  }, []);

  const companyQueryParams = useMemo(
    () => crmCompanyQueryParams(user, selectedCompanyId),
    [user, selectedCompanyId],
  );

  const needsCompanySelection = showCompanyPicker && !companyQueryParams.company_id;

  const value = useMemo(
    () => ({
      showCompanyPicker,
      companies,
      selectedCompanyId,
      setSelectedCompanyId,
      companyQueryParams,
      needsCompanySelection,
    }),
    [
      showCompanyPicker,
      companies,
      selectedCompanyId,
      setSelectedCompanyId,
      companyQueryParams,
      needsCompanySelection,
    ],
  );

  return <CrmCoCtx.Provider value={value}>{children}</CrmCoCtx.Provider>;
}

export function useCrmCompanyFilter(): Ctx {
  const v = useContext(CrmCoCtx);
  if (!v) throw new Error('useCrmCompanyFilter must be used within CrmCompanyFilterProvider');
  return v;
}
