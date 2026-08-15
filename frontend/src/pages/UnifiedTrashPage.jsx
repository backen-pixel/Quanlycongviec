import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Trash2, Target, Factory, Truck, AlertTriangle } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { canAccessTrash, canViewTrashTab, isSystemAdmin } from '../lib/adminRole';
import { UnifiedTrashFilters } from '../components/UnifiedTrashFilters';
import TrashPage from './TrashPage';
import ProductionTrashPage from './ProductionTrashPage';
import LogisticsTrashPage from './LogisticsTrashPage';

const TABS = [
  {
    id: 'crm',
    label: 'CRM',
    hint: 'Lead, Deal, file ghi chú, đính kèm',
    icon: Target,
    dashboardTo: '/crm/dashboard',
    dashboardLabel: 'Về CRM',
  },
  {
    id: 'sx',
    label: 'Sản xuất',
    hint: 'Dự án xưởng (trash_items)',
    icon: Factory,
    dashboardTo: '/sx/dashboard',
    dashboardLabel: 'Về dashboard xưởng',
  },
  {
    id: 'vc',
    label: 'Lắp đặt',
    hint: 'Dự án VC (xóa mềm trên projects)',
    icon: Truck,
    dashboardTo: '/vc/dashboard',
    dashboardLabel: 'Về dashboard VC',
  },
];

export default function UnifiedTrashPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const visibleTabs = TABS.filter((t) => canViewTrashTab(user, t.id));
  const defaultTab = visibleTabs[0]?.id || 'crm';
  const rawTab = searchParams.get('tab') || defaultTab;
  const tab = visibleTabs.some((t) => t.id === rawTab) ? rawTab : defaultTab;
  const activeMeta = visibleTabs.find((t) => t.id === tab) || visibleTabs[0] || TABS[0];

  const showCompanyFilter = isSystemAdmin(user);
  const [filterCompany, setFilterCompany] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [companies, setCompanies] = useState([]);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!showCompanyFilter && user?.company_id) {
      setFilterCompany(String(user.company_id));
    }
  }, [showCompanyFilter, user?.company_id]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api.get('/companies')
      .then((r) => {
        if (cancelled) return;
        const list = r.data?.companies || r.data || [];
        setCompanies(Array.isArray(list) ? list : []);
      })
      .catch(() => { if (!cancelled) setCompanies([]); });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const scopeCompany = showCompanyFilter ? filterCompany : user.company_id;
    const params = scopeCompany ? { company_id: scopeCompany } : {};
    api.get('/users', { params })
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r.data) ? r.data : r.data?.users || [];
        setEmployees(list);
      })
      .catch(() => { if (!cancelled) setEmployees([]); });
    return () => { cancelled = true; };
  }, [user, filterCompany, showCompanyFilter]);

  const filters = useMemo(() => ({
    companyId: filterCompany || (!showCompanyFilter && user?.company_id ? String(user.company_id) : ''),
    deletedBy: filterEmployee,
    search: searchDebounced,
  }), [filterCompany, filterEmployee, searchDebounced, showCompanyFilter, user?.company_id]);

  const lockedCompanyLabel = useMemo(() => {
    if (showCompanyFilter || !user?.company_id) return '';
    const c = companies.find((x) => String(x.id) === String(user.company_id));
    return c?.short_name || c?.name || 'Công ty của bạn';
  }, [showCompanyFilter, user?.company_id, companies]);

  if (!canAccessTrash(user) || visibleTabs.length === 0) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center text-gray-500">
        <AlertTriangle className="h-10 w-10 text-amber-400 mx-auto mb-3" />
        <p className="font-medium">Bạn không có quyền xem Thùng rác.</p>
      </div>
    );
  }

  const setTab = (id) => {
    setSearchParams(id === 'crm' ? {} : { tab: id }, { replace: true });
  };

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-3 h-[calc(100vh-5.5rem)] min-h-[420px]">
      <div className="shrink-0 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trash2 className="h-7 w-7 text-rose-600 shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Thùng rác — Tổng hợp</h1>
            <p className="text-sm text-gray-500">
              Quản lý mục đã xóa theo module CRM, Sản xuất và Lắp đặt.
            </p>
          </div>
        </div>
        <Link
          to={activeMeta.dashboardTo}
          className="text-sm font-medium text-gray-700 border border-gray-200 rounded-lg px-3 py-2 bg-white hover:bg-gray-50 shrink-0"
        >
          ← {activeMeta.dashboardLabel}
        </Link>
      </div>

      <div
        className="shrink-0 flex flex-wrap gap-1 p-1 bg-gray-100 rounded-xl border border-gray-200"
        role="tablist"
        aria-label="Module thùng rác"
      >
        {visibleTabs.map((t) => {
          const Icon = t.icon;
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                on
                  ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-md border border-rose-400/60 ring-2 ring-rose-200'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/70'
              }`}
            >
              <Icon className={`h-4 w-4 ${on ? 'text-white' : 'text-gray-400'}`} />
              {t.label}
            </button>
          );
        })}
      </div>

      <p className="shrink-0 text-xs text-gray-500 -mt-1">{activeMeta.hint}</p>

      <UnifiedTrashFilters
        showCompanyFilter={showCompanyFilter}
        companies={companies}
        employees={employees}
        filterCompany={filterCompany}
        onFilterCompanyChange={setFilterCompany}
        filterEmployee={filterEmployee}
        onFilterEmployeeChange={setFilterEmployee}
        search={search}
        onSearchChange={setSearch}
        lockedCompanyLabel={lockedCompanyLabel}
      />

      <div className="flex-1 min-h-0 flex flex-col">
        {tab === 'crm' && <TrashPage embedded filters={filters} showCompanyColumn={showCompanyFilter} companies={companies} />}
        {tab === 'sx' && <ProductionTrashPage embedded filters={filters} showCompanyColumn={showCompanyFilter} companies={companies} />}
        {tab === 'vc' && <LogisticsTrashPage embedded filters={filters} showCompanyColumn={showCompanyFilter} companies={companies} />}
      </div>
    </div>
  );
}
