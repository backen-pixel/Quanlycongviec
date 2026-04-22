import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate, getInitials, avatarColor } from '../lib/utils';
import {
  Zap, CheckCircle2, AlertTriangle, Search, X, Calendar, TrendingUp,
  FileText, Users, LayoutGrid, List,
} from 'lucide-react';
import { ProductionListView, ProductionPlannerView } from '../components/ProductionViews';

const INTAKE_BUCKET = 'won_pending';
const LOGISTICS_SLUGS = new Set(['delivery', 'shipping', 'installing', 'installation']);

function columnMatchesWorkArea(stage, workArea) {
  const slug = (stage.slug || stage.workflow_stage?.slug || '').toLowerCase();
  const isIntake = stage.bucket_slug === INTAKE_BUCKET;
  const isLogistics = LOGISTICS_SLUGS.has(slug);
  if (workArea === 'logistics') {
    return isLogistics;
  }
  return !isLogistics || isIntake;
}

const PRIORITY_COLORS = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-gray-100 text-gray-600'
};

export default function ProductionDashboard({ variant = 'dashboard' } = {}) {
  const isPipeline = variant === 'pipeline';
  const [kpis, setKpis] = useState(null);
  const [projects, setProjects] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [viewMode, setViewMode] = useState('kanban'); // kanban | list | planner | calendar
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const workArea = searchParams.get('area') === 'logistics' ? 'logistics' : 'production';

  const setWorkAreaParam = useCallback((area) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (area === 'production') p.delete('area');
      else p.set('area', 'logistics');
      return p;
    }, { replace: true });
  }, [setSearchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, projectsRes] = await Promise.all([
        api.get('/production/dashboard').catch(() => ({ data: { kpis: {}, pipeline: [] } })),
        api.get('/production/projects', { params: { limit: 500 } }).catch(() => ({ data: { projects: [] } })),
      ]);

      setKpis(dashRes.data?.kpis || {});
      setPipeline(dashRes.data?.pipeline || []);
      setProjects(projectsRes.data?.projects || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Kanban columns từ API (pipeline) + gán thẻ theo sx_kanban_column_id
  const kanbanPipeline = useMemo(() => {
    const baseStages = pipeline.length
      ? pipeline
      : [
          { id: 'ph', name: 'Sản xuất', slug: 'production', icon: '🏭', color: '#0f766e', workflow_stage_id: null },
          { id: 'dl', name: 'VC & Lắp đặt', slug: 'delivery', icon: '🚚', color: '#14b8a6', workflow_stage_id: null },
          { id: 'cc', name: 'CSKH', slug: 'customer-care', icon: '🤝', color: '#5eead4', workflow_stage_id: null },
        ];

    return baseStages.map((stage) => ({
      ...stage,
      items: projects.filter((project) => project.sx_kanban_column_id === stage.id),
      totalValue: stage.total_value ?? projects
        .filter((project) => project.sx_kanban_column_id === stage.id)
        .reduce((sum, project) => sum + (Number(project.estimated_value) || 0), 0),
    }));
  }, [pipeline, projects]);

  const filteredKanbanPipeline = useMemo(() => {
    return kanbanPipeline.map((stage) => ({
      ...stage,
      items: stage.items.filter((project) => {
        if (
          searchQuery &&
          !project.code?.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !project.name?.toLowerCase().includes(searchQuery.toLowerCase())
        ) {
          return false;
        }
        if (priorityFilter && project.priority !== priorityFilter) return false;
        if (stageFilter && project.sx_kanban_column_id !== stageFilter) return false;
        return true;
      }),
    }));
  }, [kanbanPipeline, searchQuery, priorityFilter, stageFilter]);

  const dashboardKanbanPipeline = useMemo(
    () => filteredKanbanPipeline.filter((stage) => columnMatchesWorkArea(stage, workArea)),
    [filteredKanbanPipeline, workArea],
  );

  const filteredProjectCount = useMemo(
    () => dashboardKanbanPipeline.reduce((n, s) => n + s.items.length, 0),
    [dashboardKanbanPipeline],
  );

  const handleMoveStage = useCallback(async (projectId, targetCol) => {
    const wid = targetCol?.workflow_stage_id;
    const isIntake = targetCol?.bucket_slug === INTAKE_BUCKET
      || String(targetCol?.id || '').startsWith('__fb_');

    if (isIntake) {
      setProjects((prev) => prev.map((p) => (p.id === projectId
        ? {
          ...p,
          current_stage: null,
          sx_kanban_column_id: targetCol.id,
          sx_intake: true,
          sx_won_deal: p.sx_won_deal,
        }
        : p)));

      try {
        await api.patch(`/production/projects/${projectId}/stage`, { move_to_intake: true });
      } catch (e) {
        console.error(e);
        load();
      }
      return;
    }

    if (!wid) return;

    const slug = targetCol.slug;
    const optimisticStage = {
      id: wid,
      slug,
      name: targetCol.name,
      color: targetCol.color,
      icon: targetCol.icon,
    };

    setProjects((prev) => prev.map((p) => (p.id === projectId
      ? {
        ...p,
        current_stage: optimisticStage,
        sx_kanban_column_id: targetCol.id,
        sx_intake: false,
        sx_won_deal: p.sx_won_deal,
      }
      : p)));

    try {
      await api.patch(`/production/projects/${projectId}/stage`, { stage_id: wid });
    } catch (e) {
      console.error(e);
      load();
    }
  }, [load]);

  const calculateDays = (createdAt) => {
    if (!createdAt) return '';
    const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Hôm nay';
    if (days === 1) return '1 ngày';
    if (days < 7) return `${days} ngày`;
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? '1 tuần' : `${weeks} tuần`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-10 w-10 border-4 border-teal-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-teal-800/80 font-semibold uppercase tracking-wide">Xưởng / Deal sản xuất</span>
            {isPipeline && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 font-medium">Pipeline</span>
            )}
          </div>
          <h1 className="text-3xl font-bold text-slate-900">
            {isPipeline ? '📌 Pipeline xưởng (Kanban)' : '🏭 Dashboard deal xưởng'}
          </h1>
          <p className="text-sm text-slate-600 mt-2 max-w-3xl">
            {isPipeline
              ? 'Kéo thả giữa các cột theo pipeline xưởng (cấu hình tại Pipeline xưởng). Deal CRM ở giai đoạn thắng có dự án đều hiện ở đây — thường ở cột chờ cho đến khi vào giai đoạn sản xuất.'
              : 'KPI, danh sách và Kanban — tông teal. Deal thắng gắn dự án luôn nằm trong phạm vi xưởng (cột chờ hoặc cột workflow tương ứng).'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {isPipeline ? (
            <Link to="/sx/dashboard" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-teal-200 bg-white text-teal-800 text-sm font-medium hover:bg-teal-50">
              ← Dashboard đầy đủ
            </Link>
          ) : (
            <Link to="/sx/pipeline" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700">
              Pipeline Kanban →
            </Link>
          )}
          <Link to="/sx/approvals" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50">
            Duyệt theo deal
          </Link>
          <Link to="/sx/pipeline-settings" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-teal-200 bg-teal-50 text-teal-900 text-sm font-medium hover:bg-teal-100">
            Pipeline xưởng
          </Link>
        </div>
      </div>

      {/* KPI Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <KPICard
          icon={<Calendar className="h-6 w-6" />}
          iconBgColor="bg-slate-100"
          iconColor="text-slate-700"
          label="Chờ vào xưởng"
          value={kpis.intake_pending ?? 0}
        />
        <KPICard
          icon={<Zap className="h-6 w-6" />}
          iconBgColor="bg-teal-100"
          iconColor="text-teal-600"
          label="Đang SX"
          value={kpis.producing || 0}
        />
        <KPICard
          icon={<FileText className="h-6 w-6" />}
          iconBgColor="bg-amber-100"
          iconColor="text-amber-600"
          label="VC & Lắp đặt"
          value={kpis.delivering || 0}
        />
        <KPICard
          icon={<TrendingUp className="h-6 w-6" />}
          iconBgColor="bg-yellow-100"
          iconColor="text-yellow-600"
          label="CSKH"
          value={kpis.customer_care || 0}
        />
        <KPICard
          icon={<AlertTriangle className="h-6 w-6" />}
          iconBgColor="bg-red-100"
          iconColor="text-red-600"
          label="Quá hạn"
          value={kpis.overdue || 0}
        />
        <KPICard
          icon={<CheckCircle2 className="h-6 w-6" />}
          iconBgColor="bg-green-100"
          iconColor="text-green-600"
          label="Hoàn thành"
          value={kpis.completed || 0}
        />
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm mã, tên dự án..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-teal-500"
        >
          <option value="">Tất cả cột pipeline</option>
          {pipeline.map((stage) => (
            <option key={stage.id} value={stage.id}>{stage.icon || '•'} {stage.name}</option>
          ))}
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-teal-500"
        >
          <option value="">Tất cả mức độ ưu tiên</option>
          <option value="high">🔴 Cao</option>
          <option value="medium">🟡 Trung bình</option>
          <option value="low">🟢 Thấp</option>
        </select>
      </div>

      {/* Tab khu vực — Dashboard deal xưởng (URL ?area=logistics) */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-200">
          <button
            type="button"
            onClick={() => setWorkAreaParam('production')}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-all ${
              workArea === 'production'
                ? 'text-teal-700 border-b-2 border-teal-600 bg-teal-50/40'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            🏭 Sản xuất & chờ xưởng
          </button>
          <button
            type="button"
            onClick={() => setWorkAreaParam('logistics')}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-all ${
              workArea === 'logistics'
                ? 'text-teal-700 border-b-2 border-teal-600 bg-teal-50/40'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            🚚 Vận chuyển & Lắp đặt
          </button>
        </div>
      </div>

      {/* Chế độ xem — giống CRM Dashboard (Kanban / Danh sách / Planner / Lịch) */}
      <div className="flex flex-wrap items-center gap-1 mb-1">
        {[
          { id: 'kanban', icon: LayoutGrid, label: 'Kanban' },
          { id: 'list', icon: List, label: 'Danh sách' },
          { id: 'planner', icon: Users, label: 'Planner' },
          { id: 'calendar', icon: Calendar, label: 'Lịch' },
        ].map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setViewMode(v.id)}
            className={`h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
              viewMode === v.id ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <v.icon className="h-3.5 w-3.5" />
            {v.label}
          </button>
        ))}
        {!isPipeline && (
          <span className="text-[11px] text-gray-500 ml-2">
            Tiến độ TB <strong className="text-teal-700">{kpis.avg_progress || 0}%</strong>
            {' · '}
            <strong>{filteredProjectCount}</strong> dự án sau lọc
          </span>
        )}
      </div>

      {viewMode === 'kanban' && (
        <>
          <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
            <KanbanView pipeline={dashboardKanbanPipeline} onMoveStage={handleMoveStage} calculateDays={calculateDays} />
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Gửi duyệt không thao tác ở kanban. Mở chi tiết deal (hoặc mục Duyệt theo deal) để gửi file và xử lý yêu cầu — cùng luồng duyệt với dự án/CRM.
          </div>
        </>
      )}

      {viewMode === 'list' && <ProductionListView pipeline={dashboardKanbanPipeline} calculateDays={calculateDays} />}

      {viewMode === 'planner' && <ProductionPlannerView pipeline={dashboardKanbanPipeline} />}

      {viewMode === 'calendar' && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500 shadow-sm">
          <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30 text-teal-600" />
          <p className="font-medium text-gray-700">Lịch xưởng</p>
          <p className="text-sm mt-1">Chức năng Lịch đang được phát triển (tương tự CRM).</p>
        </div>
      )}
    </div>
  );
}

// KPI Card Component
function KPICard({ icon, iconBgColor, iconColor, label, value }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-lg ${iconBgColor}`}>
          <div className={iconColor}>{icon}</div>
        </div>
      </div>
      <div>
        <p className="text-xs text-gray-500 font-semibold uppercase mb-1">{label}</p>
        <p className="text-2xl md:text-3xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

// Kanban Stage Card — matches CRM KanbanStageCard style
function KanbanStageCard({ stage, items, onMoveStage, calculateDays }) {
  const [isOverColumn, setIsOverColumn] = useState(false);
  const containerRef = useRef(null);
  const [columnMaxH, setColumnMaxH] = useState('70vh');

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const available = window.innerHeight - rect.top - 40;
        setColumnMaxH(`${Math.max(300, available)}px`);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const stageColor = stage.color || '#e5e7eb';

  const handleColumnDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsOverColumn(true);
  };

  const handleColumnDragLeave = (e) => {
    if (e.target === e.currentTarget) setIsOverColumn(false);
  };

  const handleColumnDrop = (e) => {
    e.preventDefault();
    setIsOverColumn(false);
    const projectId = e.dataTransfer.getData('projectId');
    if (projectId) onMoveStage(projectId, stage);
  };

  return (
    <div
      onDragOver={handleColumnDragOver}
      onDragLeave={handleColumnDragLeave}
      onDrop={handleColumnDrop}
      className={`flex-shrink-0 w-96 rounded-lg overflow-hidden transition-all duration-200 ${
        isOverColumn ? 'ring-2 ring-teal-500 ring-dashed' : ''
      }`}
    >
      {/* Colored Header Bar */}
      <div className="h-1.5 w-full" style={{ backgroundColor: stageColor }} />

      {/* Stage Header */}
      <div className={`bg-white border border-gray-200 border-t-0 p-4 transition-all ${isOverColumn ? 'bg-teal-50' : ''}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-lg shrink-0">{stage.icon || '📌'}</span>
            <h3 className="font-semibold text-gray-900 truncate">{stage.name}</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded">
              {items.length}
            </span>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Giá trị: {formatVND(items.reduce((sum, p) => sum + (Number(p.estimated_value) || 0), 0))}
        </p>
      </div>

      {/* Cards Container — responsive height like CRM */}
      <div
        ref={containerRef}
        className={`bg-gray-50 border border-gray-200 border-t-0 p-3 space-y-3 overflow-y-auto transition-all ${isOverColumn ? 'bg-teal-50' : ''}`}
        style={{ maxHeight: columnMaxH, minHeight: '200px' }}
      >
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p className="text-sm flex items-center gap-1">
              {isOverColumn ? '⬇️ Thả vào đây' : '📥 Kéo dự án vào đây'}
            </p>
          </div>
        ) : (
          items.map((item) => (
            <KanbanCard key={item.id} item={item} stage={stage} onMoveStage={onMoveStage} calculateDays={calculateDays} />
          ))
        )}
      </div>
    </div>
  );
}

// Kanban Item Card — matches CRM KanbanCard (MISA style)
function KanbanCard({ item, stage, calculateDays }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleDragStart = (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('projectId', item.id);
  };

  const stageColor = stage.color || '#e5e7eb';
  const progressPercent = item.progress || 0;
  const assignee = item.production_person || item.assignee;

  const getInitialsLocal = (name) => {
    if (!name) return '?';
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={() => {
        const a = searchParams.get('area');
        navigate(`/sx/projects/${item.id}${a === 'logistics' ? '?area=logistics' : ''}`);
      }}
      className="relative bg-white rounded-lg border border-gray-200 p-3 pt-9 transition-all duration-200 cursor-move group hover:-translate-y-0.5 hover:shadow-lg"
      style={{ borderLeft: `3px solid ${stageColor}` }}
    >
      {/* Header row: Code (left) + Value (right) — same as CRM */}
      <div className="flex items-start justify-between pr-1 mb-2 absolute top-3 left-3 right-3">
        <p className="text-xs font-semibold text-teal-600">{item.code}</p>
        {item.estimated_value > 0 && (
          <p className="text-xs font-bold text-emerald-600 text-right">{formatVND(item.estimated_value)}</p>
        )}
      </div>

      {/* Title */}
      <p className="text-sm font-medium text-gray-900 truncate mb-1">{item.name}</p>

      {/* Priority badge below title */}
      {item.priority && (
        <span className={`inline-flex text-xs font-medium px-1.5 py-0.5 rounded mb-2 ${PRIORITY_COLORS[item.priority] || 'bg-gray-100 text-gray-600'}`}>
          {item.priority === 'high' ? '🔴' : item.priority === 'medium' ? '🟡' : '🟢'} {item.priority === 'high' ? 'Cao' : item.priority === 'medium' ? 'TB' : 'Thấp'}
        </span>
      )}

      {/* Customer name */}
      {item.customer?.full_name && (
        <p className="text-xs text-gray-600 truncate mb-2">{item.customer.full_name}</p>
      )}

      {/* Deadline */}
      {item.deadline && (
        <p className="text-xs text-gray-500 mb-2">📅 {formatDate(item.deadline)}</p>
      )}

      {/* Progress Bar */}
      {item.progress !== undefined && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-600">Tiến độ</span>
            <span className="text-xs font-bold text-teal-600">{progressPercent}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div className="bg-teal-600 h-full transition-all duration-300 rounded-full" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      {/* Assignee + Days — same bottom row as CRM */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          {assignee?.full_name && (
            <>
              {assignee.avatar ? (
                <img src={assignee.avatar} alt="" className="h-6 w-6 rounded-full shrink-0" />
              ) : (
                <div
                  className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                  style={{ backgroundColor: stageColor }}
                >
                  {getInitialsLocal(assignee.full_name)}
                </div>
              )}
              <span className="text-xs text-gray-600 truncate">{assignee.full_name}</span>
            </>
          )}
        </div>
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded shrink-0 whitespace-nowrap">
          {calculateDays(item.created_at)}
        </span>
      </div>
    </div>
  );
}

// Kanban View Container
function KanbanView({ pipeline, onMoveStage, calculateDays }) {
  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-4 min-w-max">
        {pipeline.map(stage => (
          <KanbanStageCard
            key={stage.id || stage.slug}
            stage={stage}
            items={stage.items}
            onMoveStage={onMoveStage}
            calculateDays={calculateDays}
          />
        ))}
      </div>
    </div>
  );
}
