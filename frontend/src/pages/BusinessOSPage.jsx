import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import api from '../lib/api';
import BusinessOSShell from '../business-os/BusinessOSShell';
import OSHomeView from '../business-os/OSHomeView';
import OSSalesView from '../business-os/OSSalesView';
import { OSAdminView, OSAIView } from '../business-os/OSSystemViews';
import { OSModuleView } from '../business-os/OSModuleViews';

const ProductionProjectDetailPage = lazy(() => import('./ProductionProjectDetailPage'));

function LoadingView() {
  return (
    <div className="flex min-h-[65vh] items-center justify-center p-8">
      <div className="text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-600">
          <Loader2 className="h-5 w-5 animate-spin" />
        </span>
        <p className="mt-4 text-sm font-extrabold text-slate-800">Đang dựng bức tranh vận hành…</p>
        <p className="mt-1 text-xs text-slate-500">Kết nối dữ liệu theo quyền của anh</p>
      </div>
    </div>
  );
}

function ErrorView({ message, onRetry }) {
  return (
    <div className="mx-auto max-w-xl px-6 py-20 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-700"><AlertTriangle className="h-7 w-7" /></span>
      <h2 className="mt-4 text-lg font-black text-slate-950">Chưa tải được dữ liệu Business OS</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
      <button type="button" onClick={onRetry} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-extrabold text-white hover:bg-slate-800"><RefreshCw className="h-4 w-4" /> Thử lại</button>
    </div>
  );
}

export default function BusinessOSPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [companiesReady, setCompaniesReady] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState(() => {
    const queryCompanyId = new URLSearchParams(window.location.search).get('company_id');
    return queryCompanyId || window.localStorage.getItem('business_os_company_id') || '';
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!selectedCompanyId) return;
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await api.get('/business-os/overview', { params: { company_id: selectedCompanyId } });
      setData(response.data);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Không thể kết nối dữ liệu vận hành.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    let active = true;
    const loadCompanies = async () => {
      try {
        const response = await api.get('/business-os/companies');
        if (!active) return;
        const available = Array.isArray(response.data?.companies) ? response.data.companies : [];
        const requested = new URLSearchParams(window.location.search).get('company_id');
        const stored = window.localStorage.getItem('business_os_company_id');
        const preferred = [requested, stored, response.data?.default_company_id]
          .find((id) => id && available.some((company) => String(company.id) === String(id)));
        setCompanies(available);
        setSelectedCompanyId(preferred || available[0]?.id || '');
        if (!available.length) setError('Tài khoản chưa có công ty đang hoạt động để mở Business OS.');
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.error || 'Không tải được danh sách công ty.');
      } finally {
        if (active) {
          setCompaniesReady(true);
          setLoading(false);
        }
      }
    };
    void loadCompanies();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!companiesReady || !selectedCompanyId) return undefined;
    void load();
    const timer = window.setInterval(() => void load({ silent: true }), 60_000);
    return () => window.clearInterval(timer);
  }, [companiesReady, load, selectedCompanyId]);

  useEffect(() => {
    if (!selectedCompanyId) return;
    window.localStorage.setItem('business_os_company_id', selectedCompanyId);
  }, [selectedCompanyId]);

  const routeSegments = useMemo(
    () => location.pathname.replace(/^\/business-os\/?/, '').split('/').filter(Boolean),
    [location.pathname],
  );
  const workspaceKey = routeSegments[0] || 'home';
  const operationsProjectId = workspaceKey === 'operations' && routeSegments[1] === 'projects'
    ? routeSegments[2] || ''
    : '';

  const rolloutEnabled = data?.rollout?.enabled === true;

  const selectCompany = useCallback((companyId) => {
    const nextId = String(companyId || '').trim();
    if (!nextId || nextId === selectedCompanyId) return;
    setData(null);
    setError('');
    setLoading(true);
    setSelectedCompanyId(nextId);
    const params = new URLSearchParams(location.search);
    params.set('company_id', nextId);
    const nextPathname = operationsProjectId ? '/business-os/operations' : location.pathname;
    navigate({ pathname: nextPathname, search: `?${params.toString()}` }, { replace: true });
  }, [location.pathname, location.search, navigate, operationsProjectId, selectedCompanyId]);

  const selectedCompany = data?.company
    || companies.find((item) => String(item.id) === String(selectedCompanyId));

  let content;
  if (loading && !data) content = <LoadingView />;
  else if (error && !data) content = (
    <ErrorView
      message={error}
      onRetry={() => {
        if (selectedCompanyId) void load();
        else window.location.reload();
      }}
    />
  );
  else if (workspaceKey === 'home') content = <OSHomeView data={data} refreshing={refreshing} onRefresh={() => load({ silent: true })} />;
  else if (operationsProjectId) content = (
    <Suspense fallback={<LoadingView />}>
      <ProductionProjectDetailPage
        projectId={operationsProjectId}
        companyId={selectedCompanyId}
        workspaceCompany={selectedCompany}
        embedded
      />
    </Suspense>
  );
  else if (workspaceKey === 'sales') content = <OSSalesView data={data} onRefresh={() => load({ silent: true })} />;
  else if (workspaceKey === 'ai') content = <OSAIView data={data} />;
  else if (workspaceKey === 'admin') content = <OSAdminView data={data} />;
  else content = <OSModuleView moduleKey={workspaceKey} companyId={selectedCompanyId} />;

  return (
    <BusinessOSShell
      company={selectedCompany}
      companies={companies}
      selectedCompanyId={selectedCompanyId}
      onCompanyChange={selectCompany}
      rolloutEnabled={rolloutEnabled}
      allModulesEnabled={data?.rollout?.all_modules_enabled === true}
    >
      {error && data && (
        <div className="mx-4 mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 sm:mx-6 lg:mx-8">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}. Màn hình đang giữ dữ liệu gần nhất.
        </div>
      )}
      {content}
    </BusinessOSShell>
  );
}
