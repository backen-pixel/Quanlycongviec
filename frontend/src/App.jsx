import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Suspense, Component, useEffect } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import { lazyWithRetry, clearChunkReloadFlag, isChunkLoadErrorMessage } from './lib/lazyWithRetry';

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
            <p className="text-sm text-red-500 mb-4">
              {isChunkLoadErrorMessage(this.state.error?.message)
                ? 'Phiên bản trang đã cũ sau khi cập nhật hệ thống. Bấm «Tải lại trang» để tải bản mới.'
                : (this.state.error?.message || 'Lỗi không xác định')}
            </p>
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
import AnimatedBackground from './components/AnimatedBackground';
import Login from './pages/Login';

const Dashboard = lazyWithRetry(() => import('./pages/DashboardNew'));
const MyTasks = lazyWithRetry(() => import('./pages/MyTasks'));
const WorkTasksUnifiedPage = lazyWithRetry(() => import('./pages/WorkTasksUnifiedPage'));
const Projects = lazyWithRetry(() => import('./pages/Projects'));
const ProjectDetail = lazyWithRetry(() => import('./pages/ProjectDetail'));
const Tasks = lazyWithRetry(() => import('./pages/Tasks'));
const StageView = lazyWithRetry(() => import('./pages/StageView'));
const UsersPage = lazyWithRetry(() => import('./pages/UsersPage'));
const CustomersPage = lazyWithRetry(() => import('./pages/CustomersPage'));
const CustomerDetail = lazyWithRetry(() => import('./pages/CustomerDetail'));
const ProductsPage = lazyWithRetry(() => import('./pages/ProductsPage'));
const ProjectTemplatesPage = lazyWithRetry(() => import('./pages/ProjectTemplatesPage'));
const PersonalTasks = lazyWithRetry(() => import('./pages/PersonalTasks'));
const CompaniesPage = lazyWithRetry(() => import('./pages/CompaniesPage'));
const CompanyCrmRegionsPage = lazyWithRetry(() => import('./pages/CompanyCrmRegionsPage'));
const OrganizationQuickSetupPage = lazyWithRetry(() => import('./pages/OrganizationQuickSetupPage'));
const DepartmentsPage = lazyWithRetry(() => import('./pages/DepartmentsPage'));
const TeamsPage = lazyWithRetry(() => import('./pages/TeamsPage'));
const WorkflowSettings = lazyWithRetry(() => import('./pages/WorkflowSettings'));
const ApprovalRulesPage = lazyWithRetry(() => import('./pages/ApprovalRulesPage'));
const EcosystemPage = lazyWithRetry(() => import('./pages/EcosystemPage'));
const EcosystemModulesPage = lazyWithRetry(() => import('./pages/EcosystemModulesPage'));
const EcosystemLevelsPage = lazyWithRetry(() => import('./pages/EcosystemLevelsPage'));
const CRMDashboard = lazyWithRetry(() => import('./pages/CRMDashboard'));
const LeadJourneyPage = lazyWithRetry(() => import('./pages/LeadJourneyPage'));
const ProductionLayout = lazyWithRetry(() => import('./layouts/ProductionLayout'));
const ProductionDashboard = lazyWithRetry(() => import('./pages/ProductionDashboard'));
const ProductionDetail = lazyWithRetry(() => import('./pages/ProductionDetail'));
const ProductionApprovalsPage = lazyWithRetry(() => import('./pages/ProductionApprovalsPage'));
const ProductionPipelineSettingsPage = lazyWithRetry(() => import('./pages/ProductionPipelineSettingsPage'));
const WorkshopTaskTemplatesPage = lazyWithRetry(() => import('./pages/WorkshopTaskTemplatesPage'));
const ProductionHandoverSettingsPage = lazyWithRetry(() => import('./pages/ProductionHandoverSettingsPage'));
const ProductionAssignmentsPage = lazyWithRetry(() => import('./pages/ProductionAssignmentsPage'));
const ProductionRegionsPage = lazyWithRetry(() => import('./pages/ProductionRegionsPage'));
const LogisticsDashboard = lazyWithRetry(() => import('./pages/LogisticsDashboard'));
const LogisticsDetail = lazyWithRetry(() => import('./pages/LogisticsDetail'));
const LogisticsPipelineSettingsPage = lazyWithRetry(() => import('./pages/LogisticsPipelineSettingsPage'));
const LogisticsTaskTemplatesPage = lazyWithRetry(() => import('./pages/LogisticsTaskTemplatesPage'));
const WorkshopTeamsPage = lazyWithRetry(() => import('./pages/WorkshopTeamsPage'));
const QuotationsPage = lazyWithRetry(() => import('./pages/QuotationsPage'));
const QuotationForm = lazyWithRetry(() => import('./pages/QuotationForm'));
const OrdersPage = lazyWithRetry(() => import('./pages/OrdersPage'));
const OrderDetail = lazyWithRetry(() => import('./pages/OrderDetail'));
const InvoicesPage = lazyWithRetry(() => import('./pages/InvoicesPage'));
const InvoiceDetail = lazyWithRetry(() => import('./pages/InvoiceDetail'));
const OrderForm = lazyWithRetry(() => import('./pages/OrderForm'));
const InvoiceForm = lazyWithRetry(() => import('./pages/InvoiceForm'));
const EventsFeedPage = lazyWithRetry(() => import('./pages/EventsFeedPage'));
const EventsOverviewPage = lazyWithRetry(() => import('./pages/EventsOverviewPage'));
const SocialFeedPage = lazyWithRetry(() => import('./pages/SocialFeedPage'));
const SocialProfilePage = lazyWithRetry(() => import('./pages/SocialProfilePage'));
const ReleaseNotesPage = lazyWithRetry(() => import('./pages/ReleaseNotesPage'));
const AppUpdatesPage = lazyWithRetry(() => import('./pages/AppUpdatesPage'));
const FacebookPage = lazyWithRetry(() => import('./pages/FacebookPage'));
const FacebookLinkPhoneCleanupPage = lazyWithRetry(() => import('./pages/FacebookLinkPhoneCleanupPage'));
const ZaloPage = lazyWithRetry(() => import('./pages/ZaloPage'));
const CrmBlockedPhonesPage = lazyWithRetry(() => import('./pages/CrmBlockedPhonesPage'));
const LeadDetail = lazyWithRetry(() => import('./pages/LeadDetail'));
const CRMReports = lazyWithRetry(() => import('./pages/CRMReports'));
const CrmStaffLeadDealReport = lazyWithRetry(() => import('./pages/CrmStaffLeadDealReport'));
const CrmSlaWatchlistPage = lazyWithRetry(() => import('./pages/CrmSlaWatchlistPage'));
const CrmDealStageReportSettingsPage = lazyWithRetry(() => import('./pages/CrmDealStageReportSettingsPage'));
const CrmDeadlineSettingsPage = lazyWithRetry(() => import('./pages/CrmDeadlineSettingsPage'));
const ExecutiveKpiPage = lazyWithRetry(() => import('./pages/ExecutiveKpiPage'));
const KpiSalesAdminDashboard = lazyWithRetry(() => import('./pages/KpiSalesAdminDashboard'));
const KpiDealDashboard = lazyWithRetry(() => import('./pages/KpiDealDashboard'));
const KpiMonthlyScorecard = lazyWithRetry(() => import('./pages/KpiMonthlyScorecard'));
const KpiSettingsPage = lazyWithRetry(() => import('./pages/KpiSettingsPage'));
const KpiCompanyDashboard = lazyWithRetry(() => import('./pages/KpiCompanyDashboard'));
const KpiBVerifyPage = lazyWithRetry(() => import('./pages/KpiBVerifyPage'));
const KpiGuidePage = lazyWithRetry(() => import('./pages/KpiGuidePage'));
const PipelineSettingsPage = lazyWithRetry(() => import('./pages/PipelineSettingsPage'));
const CRMSourcesSettingsPage = lazyWithRetry(() => import('./pages/CRMSourcesSettingsPage'));
const CRMCustomersPage = lazyWithRetry(() => import('./pages/CRMCustomersPage'));
const CRMTasksPage = lazyWithRetry(() => import('./pages/CRMTasksPage'));
const CRMAssignmentsPage = lazyWithRetry(() => import('./pages/CRMAssignmentsPage'));
const CrmDeptPlanPage = lazyWithRetry(() => import('./pages/CrmDeptPlanPage'));
const CrmFollowUpCarePage = lazyWithRetry(() => import('./pages/CrmFollowUpCarePage'));
const CRMTemplatesPage = lazyWithRetry(() => import('./pages/CRMTemplatesPage'));
const AutoProjectConfigPage = lazyWithRetry(() => import('./pages/AutoProjectConfigPage'));
const StageGroupsPage = lazyWithRetry(() => import('./pages/StageGroupsPage'));
const TemplateSetDetailPage = lazyWithRetry(() => import('./pages/TemplateSetDetailPage'));
const DepartmentChat = lazyWithRetry(() => import('./pages/DepartmentChat'));
const PDFSettingsPage = lazyWithRetry(() => import('./pages/PDFSettingsPage'));
const MisaSettingsPage = lazyWithRetry(() => import('./pages/MisaSettingsPage'));
const ApiKeysSettingsPage = lazyWithRetry(() => import('./pages/ApiKeysSettingsPage'));
const AiChatBotSettingsPage = lazyWithRetry(() => import('./pages/AiChatBotSettingsPage'));
const CreateProject = lazyWithRetry(() => import('./pages/CreateProject'));
const PermissionsPage = lazyWithRetry(() => import('./pages/PermissionsPage'));
const EcosystemPermissionsPage = lazyWithRetry(() => import('./pages/EcosystemPermissionsPage'));
const WorkflowHubPage = lazyWithRetry(() => import('./pages/WorkflowHubPage'));
const ProjectWorkflowPage = lazyWithRetry(() => import('./pages/ProjectWorkflowPage'));
const DivisionDashboardPage = lazyWithRetry(() => import('./pages/DivisionDashboardPage'));
const GuidePage = lazyWithRetry(() => import('./pages/GuidePage'));
const KnowledgeLibraryPage = lazyWithRetry(() => import('./pages/KnowledgeLibraryPage'));
const KnowledgeLessonPage = lazyWithRetry(() => import('./pages/KnowledgeLessonPage'));
const KnowledgeExercisePage = lazyWithRetry(() => import('./pages/KnowledgeExercisePage'));
const KnowledgeMyHistoryPage = lazyWithRetry(() => import('./pages/KnowledgeMyHistoryPage'));
const KnowledgeAdminPage = lazyWithRetry(() => import('./pages/KnowledgeAdminPage'));
const KnowledgeScoreboardPage = lazyWithRetry(() => import('./pages/KnowledgeScoreboardPage'));
const KnowledgeCertificatesPage = lazyWithRetry(() => import('./pages/KnowledgeCertificatesPage'));
const KnowledgeCertificateDetailPage = lazyWithRetry(() => import('./pages/KnowledgeCertificateDetailPage'));
const CategoriesPage = lazyWithRetry(() => import('./pages/CategoriesPage'));
const PrivacyPage = lazyWithRetry(() => import('./pages/PrivacyPage'));
const VoiceRecordingsPage = lazyWithRetry(() => import('./pages/VoiceRecordingsPage'));
const MessengerHubPage = lazyWithRetry(() => import('./pages/MessengerHubPage'));
const ActiveUsersPage = lazyWithRetry(() => import('./pages/ActiveUsersPage'));
const RequestMonitorPage = lazyWithRetry(() => import('./pages/RequestMonitorPage'));
const UnifiedTrashPage = lazyWithRetry(() => import('./pages/UnifiedTrashPage'));
const ThemeSettingsPage = lazyWithRetry(() => import('./pages/ThemeSettingsPage'));
const PasswordSettingsPage = lazyWithRetry(() => import('./pages/PasswordSettingsPage'));
const LocationSettingsPage = lazyWithRetry(() => import('./pages/LocationSettingsPage'));
const MyDevicesPage = lazyWithRetry(() => import('./pages/MyDevicesPage'));
const CalcModuleHome = lazyWithRetry(() => import('./pages/calc/CalcModuleHome'));
const CalcSetupPage = lazyWithRetry(() => import('./pages/calc/CalcSetupPage'));
const CalcRunPage = lazyWithRetry(() => import('./pages/calc/CalcRunPage'));
const CalcImport3DPage = lazyWithRetry(() => import('./pages/calc/CalcImport3DPage'));
const CalcHistoryPage = lazyWithRetry(() => import('./pages/calc/CalcHistoryPage'));

import { Settings } from 'lucide-react';

import PinnedProjectsWidget from './components/PinnedProjectsWidget';
import { ThemeProvider, useTheme } from './components/ThemeProvider';
import { CrmNotesFabProvider } from './context/CrmNotesFabContext';
import { MessengerDockProvider } from './context/MessengerDockContext';
import { CallProvider } from './context/CallContext';
import CallOverlay from './components/CallOverlay';
import MessengerDock from './components/MessengerDock';
import { RequireCrmElevated, RequireExecutive } from './components/RequireRole';
import { useActivityRouteTracker } from './hooks/useActivityRouteTracker';
import { isCrmSharedPath } from './lib/sidebarModuleContext';
import ReleaseNoteLoginModal from './components/ReleaseNoteLoginModal';
import SharedProviders from './shared/SharedProviders';
import { useModuleAccess } from './shared/context/ModuleAccessContext';

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin h-8 w-8 border-3 border-blue-600 border-t-transparent rounded-full" />
    </div>
  );
}

function ProtectedLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { loading: moduleAccessLoading, crmOnly } = useModuleAccess();
  useActivityRouteTracker(!!user);

  useEffect(() => {
    if (crmOnly) {
      try {
        localStorage.setItem('pinned_module', '/crm');
      } catch { /* ignore */ }
    }
  }, [crmOnly]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    import('./hooks/useBatchAutoRun').catch((err) => {
      if (!cancelled) console.warn('batch auto-run load failed', err);
    });
    return () => { cancelled = true; };
  }, [user]);

  if (loading || (user && moduleAccessLoading)) {
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
      isCrmSharedPath(path) ||
      path.startsWith('/tools/voice-recordings') ||
      path.startsWith('/settings/theme') ||
      path.startsWith('/settings/password') ||
      path.startsWith('/settings/location') ||
      path.startsWith('/settings/devices') ||
      path.startsWith('/updates') ||
      path.startsWith('/knowledge');
    if (!allowed) {
      return <Navigate to="/crm/dashboard" replace />;
    }
  }

  const fullscreenPages = ['/projects/create', '/crm/messenger'];
  const isFullscreen = fullscreenPages.some((p) => location.pathname.startsWith(p));
  // Scene động canvas (rain/stars/snow/raindrops) lấy từ ThemeProvider context
  const { activeAnimatedScene } = useTheme() || {};

  return (
    <CrmNotesFabProvider>
        <ReleaseNoteLoginModal />
        <div className="flex h-screen bg-[var(--color-page-bg)] relative">
          <div className="absolute inset-0 pointer-events-none z-0"
            style={{ backgroundImage: 'var(--bg-image, none)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }} />
          <div className="absolute inset-0 pointer-events-none z-0"
            style={{ backgroundColor: 'var(--bg-overlay, rgba(0,0,0,0))' }} />
          {activeAnimatedScene && (
            <AnimatedBackground
              key={activeAnimatedScene.id}
              scene={activeAnimatedScene.scene}
              opts={activeAnimatedScene.opts}
            />
          )}
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 relative z-10">
            <main
              className={
                isFullscreen ? 'flex-1 flex flex-col min-h-0 overflow-hidden w-full' : 'flex-1 overflow-y-auto w-full'
              }
            >
              {isFullscreen ? (
                <Suspense fallback={<PageLoader />}><Outlet /></Suspense>
              ) : (
                <div className="p-6 w-full max-w-full">
                  <Suspense fallback={<PageLoader />}><Outlet /></Suspense>
                </div>
              )}
            </main>
          </div>
          {!crmOnly && <PinnedProjectsWidget />}
        </div>
    </CrmNotesFabProvider>
  );
}

function DefaultRedirect() {
  const pinned = localStorage.getItem('pinned_module') || '/crm';
  if (pinned === '/sx') return <Navigate to="/sx/dashboard" replace />;
  if (pinned === '/vc') return <Navigate to="/vc/dashboard" replace />;
  return <Navigate to={pinned} replace />;
}

function ChunkReloadInit() {
  useEffect(() => { clearChunkReloadFlag(); }, []);
  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <BrowserRouter>
        <SharedProviders>
        <ChunkReloadInit />
        <MessengerDockProvider>
        <CallProvider>
        <ThemeProvider>
        <CallOverlay />
        
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/privacy" element={<Suspense fallback={<PageLoader />}><PrivacyPage /></Suspense>} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<DefaultRedirect />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/social" element={<SocialFeedPage />} />
            <Route path="/social/u/:userId" element={<SocialProfilePage />} />
            <Route path="/dashboard/divisions" element={<DivisionDashboardPage />} />
            <Route path="/my-tasks" element={<MyTasks />} />
            <Route path="/work/unified" element={<Suspense fallback={<PageLoader />}><WorkTasksUnifiedPage /></Suspense>} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/create" element={<CreateProject />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/project-workflow" element={<ProjectWorkflowPage />} />
            <Route path="/tasks" element={<Tasks />} />
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
            <Route path="/crm/events/overview" element={<EventsOverviewPage />} />
            <Route path="/crm/messenger" element={<MessengerHubPage />} />
            <Route path="/crm/activity" element={<ActiveUsersPage />} />
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
            <Route path="/crm/deadline-settings" element={<RequireExecutive><CrmDeadlineSettingsPage /></RequireExecutive>} />
            <Route path="/crm/facebook" element={<RequireCrmElevated><FacebookPage /></RequireCrmElevated>} />
            <Route path="/crm/facebook/link-phone-cleanup" element={<RequireCrmElevated><FacebookLinkPhoneCleanupPage /></RequireCrmElevated>} />
            <Route path="/crm/zalo" element={<RequireCrmElevated><ZaloPage /></RequireCrmElevated>} />
            <Route path="/crm/blocked-phones" element={<RequireCrmElevated><CrmBlockedPhonesPage /></RequireCrmElevated>} />
            <Route path="/crm/pipeline-settings" element={<RequireCrmElevated><PipelineSettingsPage /></RequireCrmElevated>} />
            <Route path="/crm/sources-settings" element={<RequireCrmElevated><CRMSourcesSettingsPage /></RequireCrmElevated>} />
            <Route path="/crm/categories" element={<CategoriesPage />} />
            <Route path="/settings/pdf" element={<PDFSettingsPage />} />
            <Route path="/settings/password" element={<PasswordSettingsPage />} />
            <Route path="/settings/location" element={<LocationSettingsPage />} />
            <Route path="/settings/devices" element={<MyDevicesPage />} />
            <Route path="/settings/theme" element={<ThemeSettingsPage />} />
            <Route path="/settings/misa" element={<RequireCrmElevated><MisaSettingsPage /></RequireCrmElevated>} />
            <Route path="/settings/api-keys" element={<RequireCrmElevated><ApiKeysSettingsPage /></RequireCrmElevated>} />
            <Route path="/settings/ai-chat-bot" element={<RequireCrmElevated><AiChatBotSettingsPage /></RequireCrmElevated>} />
            <Route path="/settings/request-monitor" element={<RequestMonitorPage />} />
            <Route path="/admin/trash" element={<UnifiedTrashPage />} />
            <Route path="/trash" element={<Navigate to="/admin/trash?tab=crm" replace />} />
            <Route path="/crm/customers" element={<CRMCustomersPage />} />
            <Route path="/crm/tasks" element={<CRMTasksPage />} />
            <Route path="/crm/assignments" element={<CRMAssignmentsPage />} />
            <Route path="/crm/dept-plan" element={<CrmDeptPlanPage />} />
            <Route path="/production/assignments" element={<Navigate to="/sx/assignments" replace />} />
            <Route path="/crm/follow-up-care" element={<CrmFollowUpCarePage />} />
            <Route path="/crm/task-templates" element={<RequireCrmElevated><CRMTemplatesPage /></RequireCrmElevated>} />
            <Route path="/crm/auto-project-config" element={<RequireCrmElevated><AutoProjectConfigPage /></RequireCrmElevated>} />
            <Route path="/crm/products" element={<ProductsPage />} />
            <Route path="/sx" element={<ProductionLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<ProductionDashboard />} />
              <Route path="pipeline" element={<ProductionDashboard variant="pipeline" />} />
              <Route path="approvals" element={<ProductionApprovalsPage />} />
              <Route path="pipeline-settings" element={<ProductionPipelineSettingsPage />} />
              <Route path="task-templates" element={<WorkshopTaskTemplatesPage fixedArea="production" />} />
              <Route path="handover-settings" element={<ProductionHandoverSettingsPage />} />
              <Route path="assignments" element={<ProductionAssignmentsPage />} />
              <Route path="regions" element={<ProductionRegionsPage />} />
              <Route path="trash" element={<Navigate to="/admin/trash?tab=sx" replace />} />
              <Route path="projects/:id" element={<ProductionDetail />} />
            </Route>
            <Route path="/vc" element={<ProductionLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<LogisticsDashboard />} />
              <Route path="pipeline-settings" element={<LogisticsPipelineSettingsPage />} />
              <Route path="task-templates" element={<LogisticsTaskTemplatesPage />} />
              <Route path="teams" element={<WorkshopTeamsPage />} />
              <Route path="trash" element={<Navigate to="/admin/trash?tab=vc" replace />} />
              <Route path="projects/:id" element={<LogisticsDetail />} />
            </Route>
            <Route path="/calc" element={<CalcModuleHome />} />
            <Route path="/calc/setup" element={<CalcSetupPage />} />
            <Route path="/calc/run" element={<CalcRunPage />} />
            <Route path="/calc/import-3d" element={<CalcImport3DPage />} />
            <Route path="/calc/history" element={<CalcHistoryPage />} />
            <Route path="/ecosystem-permissions" element={<EcosystemPermissionsPage />} />
            <Route path="/guide" element={<GuidePage />} />
            <Route path="/knowledge" element={<KnowledgeLibraryPage />} />
            <Route path="/knowledge/lessons/:id" element={<KnowledgeLessonPage />} />
            <Route path="/knowledge/exercises/:id" element={<KnowledgeExercisePage />} />
            <Route path="/knowledge/my-history" element={<KnowledgeMyHistoryPage />} />
            <Route path="/knowledge/certificates" element={<KnowledgeCertificatesPage />} />
            <Route path="/knowledge/certificates/:id" element={<KnowledgeCertificateDetailPage />} />
            <Route path="/knowledge/admin" element={<KnowledgeAdminPage />} />
            <Route path="/knowledge/scoreboard" element={<KnowledgeScoreboardPage />} />
            <Route path="/updates" element={<ReleaseNotesPage />} />
            <Route path="/settings/app-updates" element={<AppUpdatesPage />} />
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
        </CallProvider>
        </MessengerDockProvider>
        </SharedProviders>
      </BrowserRouter>
    </AuthProvider>
    </ErrorBoundary>
  );
}
