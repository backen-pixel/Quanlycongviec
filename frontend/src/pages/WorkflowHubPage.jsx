import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { GitBranch, Layers, ClipboardList, ArrowRight, Lightbulb, CheckCircle2 } from 'lucide-react';
import { TourButton } from '../components/WebTour';
import { workflowHubTour } from '../lib/tourSteps';
import { useTour } from '../components/TourProvider';
import { workflowGuidedTour } from '../lib/guidedTours';
import CompanyProcessesPage from './CompanyProcessesPage';
import TemplateSetsPage from './TemplateSetsPage';
import WorkflowFlowsPage from './WorkflowFlowsPage';

const TABS = [
  { id: 'processes', icon: Layers, label: 'QT Nội Bộ Công Ty', step: 1, color: 'text-blue-600 bg-blue-50 border-blue-600' },
  { id: 'templates', icon: ClipboardList, label: 'Bộ Quy Trình Mẫu', step: 2, color: 'text-purple-600 bg-purple-50 border-purple-600' },
  { id: 'flows', icon: GitBranch, label: 'Quản Lý Luồng', step: 3, color: 'text-indigo-600 bg-indigo-50 border-indigo-600' },
];

// Map old routes to tab ids
const ROUTE_TAB_MAP = {
  '/company-processes': 'processes',
  '/template-sets': 'templates',
  '/workflow-flows': 'flows',
};

export default function WorkflowHubPage() {
  const location = useLocation();
  const { startTour } = useTour();
  const initialTab = ROUTE_TAB_MAP[location.pathname] || 'processes';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [showGuide, setShowGuide] = useState(true);

  const activeTabObj = TABS.find(t => t.id === activeTab);

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            ⚙️ Quản Lý Quy Trình
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Thiết lập quy trình nội bộ → tạo bộ mẫu → xây dựng luồng công việc
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => startTour(workflowGuidedTour)} className="h-8 px-3 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg flex items-center gap-1.5 cursor-pointer transition" title="Hướng dẫn quy trình">
            🎓 Hướng dẫn
          </button>
          <TourButton steps={workflowHubTour} />
        </div>
      </div>

      {/* Guide Banner */}
      {showGuide && (
        <div className="bg-gradient-to-r from-blue-50 via-purple-50 to-indigo-50 rounded-xl border border-blue-200 p-4 relative">
          <button
            onClick={() => setShowGuide(false)}
            className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-xs px-2 py-0.5 rounded hover:bg-white/50"
          >
            ✕ Ẩn
          </button>
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-bold text-gray-900">Hướng dẫn thiết lập</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Step 1 */}
            <div
              onClick={() => setActiveTab('processes')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer transition-all ${
                activeTab === 'processes' ? 'border-blue-500 bg-blue-100 shadow-sm' : 'border-gray-200 bg-white hover:border-blue-300'
              }`}
            >
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">1</div>
              <div>
                <p className="text-xs font-bold text-gray-900">Tạo QT nội bộ</p>
                <p className="text-[10px] text-gray-500">Nhiệm vụ + Checklist</p>
              </div>
            </div>

            <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />

            {/* Step 2 */}
            <div
              onClick={() => setActiveTab('templates')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer transition-all ${
                activeTab === 'templates' ? 'border-purple-500 bg-purple-100 shadow-sm' : 'border-gray-200 bg-white hover:border-purple-300'
              }`}
            >
              <div className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold">2</div>
              <div>
                <p className="text-xs font-bold text-gray-900">Tạo bộ mẫu</p>
                <p className="text-[10px] text-gray-500">Copy từ QT nội bộ</p>
              </div>
            </div>

            <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />

            {/* Step 3 */}
            <div
              onClick={() => setActiveTab('flows')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer transition-all ${
                activeTab === 'flows' ? 'border-indigo-500 bg-indigo-100 shadow-sm' : 'border-gray-200 bg-white hover:border-indigo-300'
              }`}
            >
              <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">3</div>
              <div>
                <p className="text-xs font-bold text-gray-900">Tạo luồng</p>
                <p className="text-[10px] text-gray-500">Khối → Cty → Mẫu</p>
              </div>
            </div>

            <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />

            {/* Result */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-green-300 bg-green-50">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-xs font-bold text-green-800">Sẵn sàng!</p>
                <p className="text-[10px] text-green-600">Tạo dự án</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex items-center border-b border-gray-200">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                isActive
                  ? tab.color
                  : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-current/10 flex items-center justify-center text-[10px] font-bold opacity-70">
                {tab.step}
              </span>
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'processes' && <CompanyProcessesPage />}
        {activeTab === 'templates' && <TemplateSetsPage />}
        {activeTab === 'flows' && <WorkflowFlowsPage />}
      </div>
    </div>
  );
}
