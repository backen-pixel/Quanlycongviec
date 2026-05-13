import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { lazy, Suspense, Component, useMemo, useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './lib/auth';

// Khởi tạo global batch auto-run timer (chạy ngay khi app load)
import './hooks/useBatchAutoRun';

// Error Boundary — hiện lỗi thay vì trang trắng
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null, errorInfo: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) {
    this.setState({ errorInfo: info });
    console.error('ErrorBoundary:', error, info);
  }
  render() {
    if (this.state.hasError) {
      const currentPath = window.location.pathname;
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-2xl w-full text-center">
            <p className="text-4xl mb-4">😵</p>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Đã xảy ra lỗi</h2>
            <p className="text-sm text-gray-500 mb-1">Trang: <code className="bg-gray-100 px-2 py-0.5 rounded">{currentPath}</code></p>
            <p className="text-sm text-red-500 mb-4">{this.state.error?.message || 'Lỗi không xác định'}</p>
            <pre className="text-xs text-left bg-gray-100 rounded-lg p-3 mb-2 max-h-32 overflow-auto text-red-600">
              {this.state.error?.stack?.split('\n').slice(0, 5).join('\n')}
            </pre>
            {this.state.errorInfo?.componentStack && (
              <pre className="text-xs text-left bg-blue-50 rounded-lg p-3 mb-4 max-h-32 overflow-auto text-blue-700">
                {this.state.errorInfo.componentStack.split('\n').slice(0, 8).join('\n')}
              </pre>
            )}
            <div className="flex gap-3 justify-center">
              <button onClick={() => { window.location.href = '/crm'; }}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 cursor-pointer">
                🏠 Về trang chủ
              </button>
              <button onClick={() => { this.setState({ hasError: false, error: null, errorInfo: null }); window.location.reload(); }}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer">
                🔄 Tải lại trang
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/DashboardNew';
import MyTasks from './pages/MyTasks';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
const Tasks = lazy(() => import('./pages/Tasks'));
import StageView from './pages/StageView';
import UsersPage from './pages/UsersPage';
import CustomersPage from './pages/CustomersPage';
import CustomerDetail from './pages/CustomerDetail';
import ProductsPage from './pages/ProductsPage';
import ProjectTemplatesPage from './pages/ProjectTemplatesPage';
import PersonalTasks from './pages/PersonalTasks';
import CompaniesPage from './pages/CompaniesPage';
import CompanyCrmRegionsPage from './pages/CompanyCrmRegionsPage';
import OrganizationQuickSetupPage from './pages/OrganizationQuickSetupPage';
import DepartmentsPage from './pages/DepartmentsPage';
import TeamsPage from './pages/TeamsPage';
import WorkflowSettings from './pages/WorkflowSettings';
import ApprovalRulesPage from './pages/ApprovalRulesPage';
import EcosystemPage from './pages/EcosystemPage';
import EcosystemModulesPage from './pages/EcosystemModulesPage';
import EcosystemLevelsPage from './pages/EcosystemLevelsPage';
import CRMDashboard from './pages/CRMDashboard';
import LeadJourneyPage from './pages/LeadJourneyPage';
import ProductionLayout from './layouts/ProductionLayout';
import ProductionDashboard from './pages/ProductionDashboard';
import ProductionDetail from './pages/ProductionDetail';
import ProductionApprovalsPage from './pages/ProductionApprovalsPage';
import ProductionPipelineSettingsPage from './pages/ProductionPipelineSettingsPage';
const WorkshopTaskTemplatesPage = lazy(() => import('./pages/WorkshopTaskTemplatesPage'));
const ProductionHandoverSettingsPage = lazy(() => import('./pages/ProductionHandoverSettingsPage'));
import LogisticsDashboard from './pages/LogisticsDashboard';
import LogisticsDetail from './pages/LogisticsDetail';
import LogisticsPipelineSettingsPage from './pages/LogisticsPipelineSettingsPage';
import LogisticsTaskTemplatesPage from './pages/LogisticsTaskTemplatesPage';
import WorkshopTeamsPage from './pages/WorkshopTeamsPage';
import QuotationsPage from './pages/QuotationsPage';
import QuotationForm from './pages/QuotationForm';
import OrdersPage from './pages/OrdersPage';
import OrderDetail from './pages/OrderDetail';
import InvoicesPage from './pages/InvoicesPage';
import InvoiceDetail from './pages/InvoiceDetail';
import OrderForm from './pages/OrderForm';
import InvoiceForm from './pages/InvoiceForm';
import EventsFeedPage from './pages/EventsFeedPage';
import ReleaseNotesPage from './pages/ReleaseNotesPage';
import FacebookPage from './pages/FacebookPage';
import FacebookLinkPhoneCleanupPage from './pages/FacebookLinkPhoneCleanupPage';
import LeadDetail from './pages/LeadDetail';
import CRMReports from './pages/CRMReports';
import CrmStaffLeadDealReport from './pages/CrmStaffLeadDealReport';
import CrmSlaWatchlistPage from './pages/CrmSlaWatchlistPage';
import CrmDealStageReportSettingsPage from './pages/CrmDealStageReportSettingsPage';
import ExecutiveKpiPage from './pages/ExecutiveKpiPage';
import KpiSalesAdminDashboard from './pages/KpiSalesAdminDashboard';
import KpiDealDashboard from './pages/KpiDealDashboard';
import KpiMonthlyScorecard from './pages/KpiMonthlyScorecard';
import KpiSettingsPage from './pages/KpiSettingsPage';
import KpiCompanyDashboard from './pages/KpiCompanyDashboard';
import KpiBVerifyPage from './pages/KpiBVerifyPage';
import KpiGuidePage from './pages/KpiGuidePage';
import PipelineSettingsPage from './pages/PipelineSettingsPage';
import CRMSourcesSettingsPage from './pages/CRMSourcesSettingsPage';
import CRMCustomersPage from './pages/CRMCustomersPage';
import CRMTasksPage from './pages/CRMTasksPage';
import CrmFollowUpCarePage from './pages/CrmFollowUpCarePage';
const CRMTemplatesPage = lazy(() => import('./pages/CRMTemplatesPage'));
import AutoProjectConfigPage from './pages/AutoProjectConfigPage';
// CRMProductsPage removed — merged into ProductsPage
import StageGroupsPage from './pages/StageGroupsPage';
import TemplateSetDetailPage from './pages/TemplateSetDetailPage';
import DepartmentChat from './pages/DepartmentChat';
import WorkflowFlowsPage from './pages/WorkflowFlowsPage';
import CompanyProcessesPage from './pages/CompanyProcessesPage';
import PDFSettingsPage from './pages/PDFSettingsPage';
import MisaSettingsPage from './pages/MisaSettingsPage';
import ApiKeysSettingsPage from './pages/ApiKeysSettingsPage';
import CreateProject from './pages/CreateProject';
import CreateProjectNew from './pages/CreateProjectNew';
import TemplateSetsPage from './pages/TemplateSetsPage';
import PermissionsPage from './pages/PermissionsPage';
import EcosystemPermissionsPage from './pages/EcosystemPermissionsPage';
import WorkflowHubPage from './pages/WorkflowHubPage';
import ProjectWorkflowPage from './pages/ProjectWorkflowPage';
import DivisionDashboardPage from './pages/DivisionDashboardPage';
import GuidePage from './pages/GuidePage';
import CategoriesPage from './pages/CategoriesPage';
import PrivacyPage from './pages/PrivacyPage';
import VoiceRecordingsPage from './pages/VoiceRecordingsPage';
import MessengerHubPage from './pages/MessengerHubPage';
import RequestMonitorPage from './pages/RequestMonitorPage';
import TrashPage from './pages/TrashPage';

import { Settings } from 'lucide-react';

import PinnedProjectsWidget from './components/PinnedProjectsWidget';
import { ThemeProvider } from './components/ThemeProvider';
import ThemeSettingsPage from './pages/ThemeSettingsPage';
import PasswordSettingsPage from './pages/PasswordSettingsPage';
import { CrmNotesFabProvider } from './context/CrmNotesFabContext';
import { MessengerDockProvider } from './context/MessengerDockContext';
import MessengerDock from './components/MessengerDock';
import { RequireCrmElevated, RequireExecutive } from './components/RequireRole';
import api from './lib/api';
import { isCrmOnlyModuleAccess } from './lib/moduleAccess';
import ReleaseNoteLoginModal from './components/ReleaseNoteLoginModal';

function ProtectedLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [moduleAccess, setModuleAccess] = useState(null);

  useEffect(() => {
    if (!user) {
      setModuleAccess(null);
      return;
    }
    api.get('/ecosystem/my-module-access')
      .then((r) => setModuleAccess(r.data))
      .catch(() => setModuleAccess({ allowAll: true }));
  }, [user]);

  const crmOnly = useMemo(() => isCrmOnlyModuleAccess(moduleAccess), [moduleAccess]);

  useEffect(() => {
    if (crmOnly) {
      try {
        localStorage.setItem('pinned_module', '/crm');
      } catch { /* ignore */ }
    }
  }, [crmOnly]);

  if (loading || (user && moduleAccess === null)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-page-bg)]">
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin h-8 w-8 text-[var(--color-primary-600)]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
          <p className="text-sm text-gray-500">Đang tải...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" state={{ from: location }} />;

  if (crmOnly) {
    const path = location.pathname;
    const allowed =
      /^\/crm(\/|$)/.test(path) ||
      path.startsWith('/tools/voice-recordings') ||
      path.startsWith('/settings/theme') ||
      path.startsWith('/settings/password') ||
      path.startsWith('/updates');
    if (!allowed) {
      return <Navigate to="/crm/dashboard" replace />;
    }
  }

  // Pages with full-screen layouts (no padding wrapper; main becomes flex column fill)
  const fullscreenPages = ['/projects/create', '/crm/messenger'];
  const isFullscreen = fullscreenPages.some((p) => location.pathname.startsWith(p));

  return (
    <CrmNotesFabProvider>
        <ReleaseNoteLoginModal />
        <div className="flex h-screen bg-[var(--color-page-bg)] relative">
          {/* Background image layer */}
          <div className="absolute inset-0 pointer-events-none z-0"
            style={{ backgroundImage: 'var(--bg-image, none)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }} />
          <div className="absolute inset-0 pointer-events-none z-0"
            style={{ backgroundColor: 'var(--bg-overlay, rgba(0,0,0,0))' }} />
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 relative z-10">
            <main
              className={
                isFullscreen ? 'flex-1 flex flex-col min-h-0 overflow-hidden w-full' : 'flex-1 overflow-y-auto w-full'
              }
            >
              {isFullscreen ? (
                <Outlet />
              ) : (
                <div className="p-6 w-full max-w-full">
                  <Outlet />
                </div>
              )}
            </main>
          </div>
          {!crmOnly && <PinnedProjectsWidget />}
        </div>
    </CrmNotesFabProvider>
  );
}

// Redirect to pinned module on login/root
function DefaultRedirect() {
  const pinned = localStorage.getItem('pinned_module') || '/crm';
  if (pinned === '/sx') return <Navigate to="/sx/dashboard" replace />;
  if (pinned === '/vc') return <Navigate to="/vc/dashboard" replace />;
  return <Navigate to={pinned} replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <BrowserRouter>
        <MessengerDockProvider>
        <ThemeProvider>
        
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<DefaultRedirect />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dashboard/divisions" element={<DivisionDashboardPage />} />
            <Route path="/my-tasks" element={<MyTasks />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/create" element={<CreateProject />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/project-workflow" element={<ProjectWorkflowPage />} />
            <Route path="/tasks" element={<Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-3 border-blue-600 border-t-transparent rounded-full" /></div>}><Tasks /></Suspense>} />
            <Route path="/tasks/regions" element={<CompanyCrmRegionsPage />} />
            <Route path="/workspace/org-setup" element={<OrganizationQuickSetupPage />} />
            <Route path="/stage/:slug" element={<StageView />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/templates" element={<ProjectTemplatesPage />} />
            <Route path="/companies" element={<CompaniesPage />} />
            <Route path="/departments" element={<DepartmentsPage />} />
            <Route path="/departments/:id/chat" element={<DepartmentChat />} />
            <Route path="/teams" element={<TeamsPage />} />
            <Route path="/personal-tasks" element={<PersonalTasks />} />
            <Route path="/tools/voice-recordings" element={<VoiceRecordingsPage />} />
            <Route path="/workflow-settings" element={<WorkflowSettings />} />
            <Route path="/approval-rules" element={<ApprovalRulesPage />} />
            <Route path="/ecosystem" element={<EcosystemPage />} />
            <Route path="/ecosystem/modules" element={<EcosystemModulesPage />} />
            <Route path="/ecosystem-levels" element={<EcosystemLevelsPage />} />
            <Route path="/stage-groups" element={<StageGroupsPage />} />
            <Route path="/workflow-hub" element={<WorkflowHubPage />} />
            <Route path="/workflow-flows" element={<WorkflowHubPage />} />
            <Route path="/company-processes" element={<WorkflowHubPage />} />
            <Route path="/template-sets" element={<WorkflowHubPage />} />
            <Route path="/template-sets/:setId" element={<TemplateSetDetailPage />} />
            <Route path="/permissions" element={<PermissionsPage />} />
            <Route path="/crm" element={<Navigate to="/crm/dashboard" replace />} />
            <Route path="/crm/lead-journey" element={<LeadJourneyPage />} />
            <Route path="/crm/events" element={<EventsFeedPage />} />
            <Route path="/crm/messenger" element={<MessengerHubPage />} />
            <Route path="/crm/dashboard" element={<CRMDashboard />} />
            <Route path="/crm/executive-kpi" element={<RequireExecutive><ExecutiveKpiPage /></RequireExecutive>} />
            <Route path="/crm/kpi/sales-admin" element={<KpiSalesAdminDashboard />} />
            <Route path="/crm/kpi/deal" element={<KpiDealDashboard />} />
            <Route path="/crm/kpi/guide" element={<KpiGuidePage />} />
            <Route path="/crm/kpi/scorecard" element={<RequireExecutive><KpiMonthlyScorecard /></RequireExecutive>} />
            <Route path="/crm/kpi/company" element={<RequireExecutive><KpiCompanyDashboard /></RequireExecutive>} />
            <Route path="/crm/kpi/verify-b" element={<RequireExecutive><KpiBVerifyPage /></RequireExecutive>} />
            <Route path="/crm/kpi/settings" element={<RequireExecutive><KpiSettingsPage /></RequireExecutive>} />
            <Route path="/crm/pipeline" element={<CRMDashboard />} />
            <Route path="/crm/leads/:id" element={<LeadDetail />} />
            <Route path="/crm/quotations" element={<QuotationsPage />} />
            <Route path="/crm/quotations/new" element={<QuotationForm />} />
            <Route path="/crm/quotations/:id" element={<QuotationForm />} />
            <Route path="/crm/orders" element={<OrdersPage />} />
            <Route path="/crm/orders/new" element={<Navigate to="/crm/orders" replace />} />
            <Route path="/crm/orders/:id/edit" element={<OrderForm />} />
            <Route path="/crm/orders/:id" element={<OrderDetail />} />
            <Route path="/crm/invoices" element={<InvoicesPage />} />
            <Route path="/crm/invoices/new" element={<InvoiceForm />} />
            <Route path="/crm/invoices/:id/edit" element={<InvoiceForm />} />
            <Route path="/crm/invoices/:id" element={<InvoiceDetail />} />
            <Route path="/crm/reports" element={<RequireCrmElevated><CRMReports /></RequireCrmElevated>} />
            <Route path="/crm/reports/staff-lead-deal" element={<RequireExecutive><CrmStaffLeadDealReport /></RequireExecutive>} />
            <Route path="/crm/admin/sla-watchlist" element={<RequireExecutive><CrmSlaWatchlistPage /></RequireExecutive>} />
            <Route path="/crm/settings/deal-stage-report" element={<RequireExecutive><CrmDealStageReportSettingsPage /></RequireExecutive>} />
            <Route path="/crm/facebook" element={<RequireCrmElevated><FacebookPage /></RequireCrmElevated>} />
            <Route path="/crm/facebook/link-phone-cleanup" element={<RequireCrmElevated><FacebookLinkPhoneCleanupPage /></RequireCrmElevated>} />
            <Route path="/crm/pipeline-settings" element={<RequireCrmElevated><PipelineSettingsPage /></RequireCrmElevated>} />
            <Route path="/crm/sources-settings" element={<RequireCrmElevated><CRMSourcesSettingsPage /></RequireCrmElevated>} />
            <Route path="/crm/categories" element={<CategoriesPage />} />
            <Route path="/settings/pdf" element={<PDFSettingsPage />} />
            <Route path="/settings/password" element={<PasswordSettingsPage />} />
            <Route path="/settings/theme" element={<ThemeSettingsPage />} />
            <Route path="/settings/misa" element={<RequireCrmElevated><MisaSettingsPage /></RequireCrmElevated>} />
            <Route path="/settings/api-keys" element={<RequireCrmElevated><ApiKeysSettingsPage /></RequireCrmElevated>} />
            <Route path="/settings/request-monitor" element={<RequestMonitorPage />} />
            <Route path="/admin/trash" element={<RequireCrmElevated><TrashPage /></RequireCrmElevated>} />
            <Route path="/crm/customers" element={<CRMCustomersPage />} />
            <Route path="/crm/tasks" element={<CRMTasksPage />} />
            <Route path="/crm/follow-up-care" element={<CrmFollowUpCarePage />} />
            <Route path="/crm/task-templates" element={<RequireCrmElevated><Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-3 border-blue-600 border-t-transparent rounded-full" /></div>}><CRMTemplatesPage /></Suspense></RequireCrmElevated>} />
            <Route path="/crm/auto-project-config" element={<RequireCrmElevated><AutoProjectConfigPage /></RequireCrmElevated>} />
            <Route path="/crm/products" element={<ProductsPage />} />
            <Route path="/sx" element={<ProductionLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<ProductionDashboard />} />
              <Route path="pipeline" element={<ProductionDashboard variant="pipeline" />} />
              <Route path="approvals" element={<ProductionApprovalsPage />} />
              <Route path="pipeline-settings" element={<ProductionPipelineSettingsPage />} />
              <Route
                path="task-templates"
                element={(
                  <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-3 border-teal-600 border-t-transparent rounded-full" /></div>}>
                    <WorkshopTaskTemplatesPage />
                  </Suspense>
                )}
              />
              <Route
                path="handover-settings"
                element={(
                  <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-3 border-teal-600 border-t-transparent rounded-full" /></div>}>
                    <ProductionHandoverSettingsPage />
                  </Suspense>
                )}
              />
              <Route path="projects/:id" element={<ProductionDetail />} />
            </Route>
            {/* Module Vận chuyển & Lắp đặt */}
            <Route path="/vc" element={<ProductionLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<LogisticsDashboard />} />
              <Route path="pipeline-settings" element={<LogisticsPipelineSettingsPage />} />
              <Route path="task-templates" element={<LogisticsTaskTemplatesPage />} />
              <Route path="teams" element={<WorkshopTeamsPage />} />
              <Route path="projects/:id" element={<LogisticsDetail />} />
            </Route>
            <Route path="/ecosystem-permissions" element={<EcosystemPermissionsPage />} />
            <Route path="/guide" element={<GuidePage />} />
            <Route path="/updates" element={<ReleaseNotesPage />} />
            <Route path="/settings" element={
              <div className="flex items-center justify-center h-64 text-gray-400">
                <div className="text-center">
                  <Settings className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Cài đặt — sắp ra mắt</p>
                </div>
              </div>
            } />
          </Route>
        </Routes>
        
        <MessengerDock />
        </ThemeProvider>
        </MessengerDockProvider>
      </BrowserRouter>
    </AuthProvider>
    </ErrorBoundary>
  );
}
