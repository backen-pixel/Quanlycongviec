import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate, getInitials, avatarColor } from '../lib/utils';
import {
  Zap, CheckCircle2, AlertTriangle, Search, X, Calendar, TrendingUp, Factory,
  FileText, Users, ArrowRightLeft
} from 'lucide-react';

const PRIORITY_COLORS = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-gray-100 text-gray-600'
};

export default function ProductionDashboard() {
  const [kpis, setKpis] = useState(null);
  const [projects, setProjects] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
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
  };

  // Build Kanban pipeline from projects
  const kanbanPipeline = useMemo(() => {
    const baseStages = pipeline.length
      ? pipeline
      : [
          { slug: 'production', name: 'Sản xuất', icon: '🏭', color: '#EA580C' },
          { slug: 'delivery', name: 'VC & Lắp đặt', icon: '🚚', color: '#F97316' },
          { slug: 'customer-care', name: 'CSKH', icon: '🤝', color: '#FDBA74' },
        ];

    return baseStages.map((stage) => ({
      ...stage,
      items: projects.filter((project) => project.current_stage?.slug === stage.slug),
      totalValue: projects
        .filter((project) => project.current_stage?.slug === stage.slug)
        .reduce((sum, project) => sum + (project.estimated_value || 0), 0),
    }));
  }, [pipeline, projects]);

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      if (searchQuery && !p.code?.toLowerCase().includes(searchQuery.toLowerCase()) && 
          !p.name?.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (priorityFilter && p.priority !== priorityFilter) {
        return false;
      }
      if (stageFilter && p.current_stage?.slug !== stageFilter) {
        return false;
      }
      return true;
    });
  }, [projects, searchQuery, priorityFilter, stageFilter]);

  const handleMoveStage = useCallback(async (projectId, newStageSlug) => {
    const targetStage = pipeline.find(s => s.slug === newStageSlug);
     if (!targetStage) return;
    if (!targetStage) return;
    
    // Optimistic update
    setProjects(prev => prev.map(p => 
      p.id === projectId 
        ? { ...p, current_stage: targetStage }
        : p
    ));

    try {
      await api.patch(`/production/projects/${projectId}/stage`, { 
        stage_id: targetStage.id 
      });
    } catch (e) {
      console.error(e);
      load();
    }
  }, [pipeline]);

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
        <div className="animate-spin h-10 w-10 border-4 border-orange-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between px-0">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-500 font-semibold">XƯỞNG / Quản lý deal vào sản xuất</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">
            🏭 Module Xưởng
          </h1>
          <p className="text-sm text-gray-500 mt-2 max-w-3xl">
            Hiển thị các deal đã vào khối sản xuất dưới dạng dự án xưởng, kèm thông tin CRM, tiến độ nhiệm vụ và tài liệu đã cho phép chia sẻ.
          </p>
        </div>
      </div>

      {/* KPI Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard
          icon={<Zap className="h-6 w-6" />}
          iconBgColor="bg-orange-100"
          iconColor="text-orange-600"
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
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-orange-500"
        >
          <option value="">Tất cả công đoạn xưởng</option>
          {pipeline.map((stage) => (
            <option key={stage.slug} value={stage.slug}>{stage.icon || '•'} {stage.name}</option>
          ))}
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-orange-500"
        >
          <option value="">Tất cả mức độ ưu tiên</option>
          <option value="high">🔴 Cao</option>
          <option value="medium">🟡 Trung bình</option>
          <option value="low">🟢 Thấp</option>
        </select>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.9fr] gap-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Danh sách deal vào xưởng</h2>
              <p className="text-sm text-gray-500">{filteredProjects.length} dự án đang thuộc khối sản xuất</p>
            </div>
            <div className="text-sm font-semibold text-orange-600">Tiến độ TB {kpis.avg_progress || 0}%</div>
          </div>
          <div className="space-y-3 max-h-[680px] overflow-y-auto pr-1">
            {filteredProjects.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">Không có dự án xưởng phù hợp bộ lọc</div>
            ) : filteredProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => navigate(`/sx/projects/${project.id}`)}
                className="w-full text-left rounded-xl border border-gray-200 p-4 hover:border-orange-300 hover:bg-orange-50/40 transition cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-bold text-orange-600">{project.code}</span>
                      {project.current_stage && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-medium text-white" style={{ backgroundColor: project.current_stage.color || '#ea580c' }}>
                          {project.current_stage.name}
                        </span>
                      )}
                      {project.is_overdue && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">Quá hạn</span>
                      )}
                    </div>
                    <p className="text-base font-semibold text-gray-900 truncate">{project.name}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>KH: {project.customer?.full_name || 'Chưa có'}</span>
                      <span>Công ty: {project.company?.short_name || project.company?.name || 'Chưa gán'}</span>
                      <span>Deadline: {project.deadline ? formatDate(project.deadline) : 'Chưa có'}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
                          <span>Nhiệm vụ</span>
                          <span>{project.done_tasks || 0}/{project.task_total || 0}</span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full bg-orange-500" style={{ width: `${project.progress || 0}%` }} />
                        </div>
                      </div>
                      {project.production_person && (
                        <div className="flex items-center gap-2 shrink-0">
                          <div
                            className="h-8 w-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                            style={{ backgroundColor: avatarColor(project.production_person.full_name) }}
                          >
                            {getInitials(project.production_person.full_name)}
                          </div>
                          <div className="text-xs text-gray-500 max-w-28 truncate">{project.production_person.full_name}</div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-emerald-600">{formatVND(project.estimated_value)}</div>
                    <div className="text-[11px] text-gray-400 mt-1">Sale: {project.sales_person?.full_name || 'Chưa gán'}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4 text-gray-900 font-bold">
              <ArrowRightLeft className="h-5 w-5 text-orange-600" />
              Pipeline xưởng
            </div>
            <div className="space-y-3">
              {pipeline.map((stage) => (
                <div key={stage.slug} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                      <span>{stage.icon || '•'}</span>
                      <span>{stage.name}</span>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">{stage.count || 0}</span>
                  </div>
                  <p className="text-xs text-gray-500">Giá trị đang xử lý: {formatVND(stage.total_value || 0)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4 text-gray-900 font-bold">
              <Users className="h-5 w-5 text-orange-600" />
              Gợi ý vận hành
            </div>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="rounded-xl bg-orange-50 border border-orange-100 p-3">
                Deal thắng sẽ đi vào đây dưới dạng dự án xưởng, giữ đủ thông tin khách hàng, sale và giá trị deal.
              </div>
              <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
                Tài liệu chỉ hiển thị ở chi tiết xưởng khi có ghi chú hoặc cờ cho phép chia sẻ cho xưởng.
              </div>
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
                Màn chi tiết xưởng đang là nền cho bước tiếp theo: gửi duyệt bản vẽ, vật tư hai chiều giữa CRM và xưởng.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="rounded-xl overflow-hidden">
        <KanbanView 
          pipeline={kanbanPipeline.map((stage) => ({
            ...stage,
            items: stage.items.filter((project) => {
              if (searchQuery && !project.code?.toLowerCase().includes(searchQuery.toLowerCase()) && !project.name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
              if (priorityFilter && project.priority !== priorityFilter) return false;
              if (stageFilter && project.current_stage?.slug !== stageFilter) return false;
              return true;
            })
          }))}
          onMoveStage={handleMoveStage}
          calculateDays={calculateDays}
        />
      </div>
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

// Kanban Stage Card
function KanbanStageCard({ stage, items, onMoveStage, calculateDays }) {
  const [isOverColumn, setIsOverColumn] = useState(false);
  
  const handleColumnDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsOverColumn(true);
  };

  const handleColumnDragLeave = (e) => {
    if (e.target === e.currentTarget) {
      setIsOverColumn(false);
    }
  };

  const handleColumnDrop = (e) => {
    e.preventDefault();
    setIsOverColumn(false);
    const projectId = e.dataTransfer.getData('projectId');
    if (projectId) {
      onMoveStage(projectId, stage.slug);
    }
  };
  
  return (
    <div
      onDragOver={handleColumnDragOver}
      onDragLeave={handleColumnDragLeave}
      onDrop={handleColumnDrop}
      className={`flex-shrink-0 w-96 rounded-lg overflow-hidden transition-all duration-200 ${
        isOverColumn ? 'ring-2 ring-orange-500 ring-dashed' : ''
      }`}
    >
      {/* Colored Header Bar */}
      <div
        className="h-1.5 w-full"
        style={{ backgroundColor: stage.color }}
      />
      
      {/* Stage Header */}
      <div className={`bg-white border border-gray-200 border-t-0 p-4 transition-all ${
        isOverColumn ? 'bg-orange-50' : ''
      }`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">{stage.icon}</span>
            <h3 className="font-semibold text-gray-900">{stage.name}</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded">
              {items.length}
            </span>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Giá trị: {formatVND(stage.totalValue)}
        </p>
      </div>
      
      {/* Cards Container */}
      <div className={`bg-gray-50 border border-gray-200 border-t-0 p-3 min-h-96 max-h-96 overflow-y-auto space-y-3 transition-all ${
        isOverColumn ? 'bg-orange-50' : ''
      }`}>
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p className="text-sm flex items-center gap-1">
              {isOverColumn ? '⬇️ Thả vào đây' : '📥 Kéo dự án vào đây'}
            </p>
          </div>
        ) : (
          items.map(item => (
            <KanbanCard
              key={item.id}
              item={item}
              stage={stage}
              onMoveStage={onMoveStage}
              calculateDays={calculateDays}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Kanban Item Card
function KanbanCard({ item, stage, onMoveStage, calculateDays }) {
  const handleDragStart = (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('projectId', item.id);
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const progressPercent = item.progress || 0;

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={() => window.location.href = `/sx/projects/${item.id}`}
      className={`bg-white rounded-lg border border-gray-200 p-3 transition-all duration-200 cursor-move group hover:-translate-y-0.5 hover:shadow-lg`}
      style={{
        borderLeft: `3px solid ${stage.color}`,
      }}
    >
      {/* Header: Code + Priority */}
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-semibold text-orange-600">{item.code}</p>
        {item.priority && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${PRIORITY_COLORS[item.priority] || 'bg-gray-100 text-gray-600'}`}>
            {item.priority === 'high' ? '🔴' : item.priority === 'medium' ? '🟡' : '🟢'} {item.priority}
          </span>
        )}
      </div>

      {/* Title */}
      <p className="text-sm font-medium text-gray-900 truncate mb-2">{item.name}</p>

      {/* Customer name */}
      {item.customer?.full_name && (
        <p className="text-xs text-gray-600 truncate mb-2">{item.customer.full_name}</p>
      )}

      {/* Value + Deadline */}
      <div className="space-y-1 mb-3 text-xs">
        {item.estimated_value > 0 && (
          <p className="text-emerald-600 font-semibold">{formatVND(item.estimated_value)}</p>
        )}
        {item.deadline && (
          <p className="text-gray-500">📅 {formatDate(item.deadline)}</p>
        )}
      </div>

      {/* Progress Bar */}
      {item.progress !== undefined && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-600">Tiến độ</span>
            <span className="text-xs font-bold text-orange-600">{progressPercent}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-orange-600 h-full transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Assignee */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {item.production_person && (
            <>
              <div
                className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ backgroundColor: stage.color }}
              >
                {item.production_person.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <span className="text-xs text-gray-600 truncate">{item.production_person.full_name}</span>
            </>
          )}
        </div>
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded whitespace-nowrap">
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
            key={stage.slug}
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
