import { useSearchParams, Link } from 'react-router-dom';
import { Trash2, Target, Factory, Truck, AlertTriangle } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { canAccessTrash, canViewTrashTab } from '../lib/adminRole';
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
    label: 'Vận chuyển',
    hint: 'Dự án VC (xóa mềm trên projects)',
    icon: Truck,
    dashboardTo: '/vc/dashboard',
    dashboardLabel: 'Về dashboard VC',
  },
];

const VALID_TABS = new Set(TABS.map((t) => t.id));

export default function UnifiedTrashPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const visibleTabs = TABS.filter((t) => canViewTrashTab(user, t.id));
  const defaultTab = visibleTabs[0]?.id || 'crm';
  const rawTab = searchParams.get('tab') || defaultTab;
  const tab = visibleTabs.some((t) => t.id === rawTab) ? rawTab : defaultTab;
  const activeMeta = visibleTabs.find((t) => t.id === tab) || visibleTabs[0] || TABS[0];

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
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trash2 className="h-7 w-7 text-rose-600 shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Thùng rác — Tổng hợp</h1>
            <p className="text-sm text-gray-500">
              Quản lý mục đã xóa theo module CRM, Sản xuất và Vận chuyển & Lắp đặt.
            </p>
          </div>
        </div>
        <Link
          to={activeMeta.dashboardTo}
          className="text-sm font-medium text-gray-700 border border-gray-200 rounded-lg px-3 py-2 bg-white hover:bg-gray-50"
        >
          ← {activeMeta.dashboardLabel}
        </Link>
      </div>

      <div
        className="flex flex-wrap gap-1 p-1 bg-gray-100 rounded-xl border border-gray-200"
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
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                on ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon className={`h-4 w-4 ${on ? 'text-rose-600' : 'text-gray-400'}`} />
              {t.label}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-gray-500 -mt-2">{activeMeta.hint}</p>

      {tab === 'crm' && <TrashPage embedded />}
      {tab === 'sx' && <ProductionTrashPage embedded />}
      {tab === 'vc' && <LogisticsTrashPage embedded />}
    </div>
  );
}
