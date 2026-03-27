import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/DashboardNew';
import MyTasks from './pages/MyTasks';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Tasks from './pages/Tasks';
import StageView from './pages/StageView';
import UsersPage from './pages/UsersPage';
import CustomersPage from './pages/CustomersPage';
import CustomerDetail from './pages/CustomerDetail';
import ProductsPage from './pages/ProductsPage';
import ProjectTemplatesPage from './pages/ProjectTemplatesPage';
import PersonalTasks from './pages/PersonalTasks';
import CompaniesPage from './pages/CompaniesPage';
import DepartmentsPage from './pages/DepartmentsPage';
import TeamsPage from './pages/TeamsPage';
import WorkflowSettings from './pages/WorkflowSettings';
import ApprovalRulesPage from './pages/ApprovalRulesPage';
import EcosystemPage from './pages/EcosystemPage';
import EcosystemLevelsPage from './pages/EcosystemLevelsPage';
import CRMDashboard from './pages/CRMDashboard';
import ProductionDashboard from './pages/ProductionDashboard';
import ProductionDetail from './pages/ProductionDetail';
import QuotationsPage from './pages/QuotationsPage';
import QuotationForm from './pages/QuotationForm';
import OrdersPage from './pages/OrdersPage';
import OrderDetail from './pages/OrderDetail';
import InvoicesPage from './pages/InvoicesPage';
import InvoiceDetail from './pages/InvoiceDetail';
import OrderForm from './pages/OrderForm';
import InvoiceForm from './pages/InvoiceForm';
import LeadDetail from './pages/LeadDetail';
import CRMReports from './pages/CRMReports';
import PipelineSettingsPage from './pages/PipelineSettingsPage';
import CRMCustomersPage from './pages/CRMCustomersPage';
import CRMTasksPage from './pages/CRMTasksPage';
import CRMTemplatesPage from './pages/CRMTemplatesPage';
import AutoProjectConfigPage from './pages/AutoProjectConfigPage';
// CRMProductsPage removed — merged into ProductsPage
import StageGroupsPage from './pages/StageGroupsPage';
import TemplateSetDetailPage from './pages/TemplateSetDetailPage';
import DepartmentChat from './pages/DepartmentChat';
import WorkflowFlowsPage from './pages/WorkflowFlowsPage';
import CompanyProcessesPage from './pages/CompanyProcessesPage';
import PDFSettingsPage from './pages/PDFSettingsPage';
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

import { Settings } from 'lucide-react';

import PinnedProjectsWidget from './components/PinnedProjectsWidget';
import AIAssistantChat from './components/AIAssistantChat';
import { ThemeProvider } from './components/ThemeProvider';
import ThemeSettingsPage from './pages/ThemeSettingsPage';

function ProtectedLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
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

  // Pages with full-screen layouts (no padding wrapper)
  const fullscreenPages = ['/projects/create'];
  const isFullscreen = fullscreenPages.some(p => location.pathname.startsWith(p));

  return (
    <div className="flex h-screen bg-[var(--color-page-bg)] relative">
      {/* Background image layer */}
      <div className="absolute inset-0 pointer-events-none z-0"
        style={{ backgroundImage: 'var(--bg-image, none)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }} />
      <div className="absolute inset-0 pointer-events-none z-0"
        style={{ backgroundColor: 'var(--bg-overlay, rgba(0,0,0,0))' }} />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <main className="flex-1 overflow-y-auto w-full">
          {isFullscreen ? (
            <Outlet />
          ) : (
            <div className="p-6 w-full max-w-full">
              <Outlet />
            </div>
          )}
        </main>
      </div>
      <PinnedProjectsWidget />
      <AIAssistantChat />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ThemeProvider>
        
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<Navigate to="/crm" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dashboard/divisions" element={<DivisionDashboardPage />} />
            <Route path="/my-tasks" element={<MyTasks />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/create" element={<CreateProject />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/project-workflow" element={<ProjectWorkflowPage />} />
            <Route path="/tasks" element={<Tasks />} />
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
            <Route path="/workflow-settings" element={<WorkflowSettings />} />
            <Route path="/approval-rules" element={<ApprovalRulesPage />} />
            <Route path="/ecosystem" element={<EcosystemPage />} />
            <Route path="/ecosystem-levels" element={<EcosystemLevelsPage />} />
            <Route path="/stage-groups" element={<StageGroupsPage />} />
            <Route path="/workflow-hub" element={<WorkflowHubPage />} />
            <Route path="/workflow-flows" element={<WorkflowHubPage />} />
            <Route path="/company-processes" element={<WorkflowHubPage />} />
            <Route path="/template-sets" element={<WorkflowHubPage />} />
            <Route path="/template-sets/:setId" element={<TemplateSetDetailPage />} />
            <Route path="/permissions" element={<PermissionsPage />} />
            <Route path="/crm" element={<CRMDashboard />} />
            <Route path="/crm/leads/:id" element={<LeadDetail />} />
            <Route path="/crm/quotations" element={<QuotationsPage />} />
            <Route path="/crm/quotations/new" element={<QuotationForm />} />
            <Route path="/crm/quotations/:id" element={<QuotationForm />} />
            <Route path="/crm/orders" element={<OrdersPage />} />
            <Route path="/crm/orders/new" element={<OrderForm />} />
            <Route path="/crm/orders/:id/edit" element={<OrderForm />} />
            <Route path="/crm/orders/:id" element={<OrderDetail />} />
            <Route path="/crm/invoices" element={<InvoicesPage />} />
            <Route path="/crm/invoices/new" element={<InvoiceForm />} />
            <Route path="/crm/invoices/:id" element={<InvoiceDetail />} />
            <Route path="/crm/reports" element={<CRMReports />} />
            <Route path="/crm/pipeline-settings" element={<PipelineSettingsPage />} />
            <Route path="/crm/categories" element={<CategoriesPage />} />
            <Route path="/settings/pdf" element={<PDFSettingsPage />} />
            <Route path="/settings/theme" element={<ThemeSettingsPage />} />
            <Route path="/crm/customers" element={<CustomersPage />} />
            <Route path="/crm/tasks" element={<CRMTasksPage />} />
            <Route path="/crm/task-templates" element={<CRMTemplatesPage />} />
            <Route path="/crm/auto-project-config" element={<AutoProjectConfigPage />} />
            <Route path="/crm/products" element={<ProductsPage />} />
            <Route path="/sx" element={<ProductionDashboard />} />
            <Route path="/sx/projects/:id" element={<ProductionDetail />} />
            <Route path="/ecosystem-permissions" element={<EcosystemPermissionsPage />} />
            <Route path="/guide" element={<GuidePage />} />
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
        
        </ThemeProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
