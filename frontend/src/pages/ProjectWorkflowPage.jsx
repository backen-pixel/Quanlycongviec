import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  FolderKanban, RefreshCw, Building2, Search, ChevronRight,
  LayoutGrid, List, Filter, Briefcase
} from 'lucide-react';

const STAGE_NAMES = {
  consulting: 'Tư vấn', design: 'Thiết kế', quotation: 'Báo giá', contract: 'Hợp đồng',
  production: 'Sản xuất', shipping: 'Vận chuyển', installation: 'Lắp đặt', 'customer-care': 'Chăm sóc KH',
};

const STAGE_COLORS = {
  consulting: '#8b5cf6', design: '#06b6d4', quotation: '#f59e0b', contract: '#10b981',
  production: '#3b82f6', shipping: '#6366f1', installation: '#ec4899', 'customer-care': '#14b8a6',
};

const SLUG_TO_STATUS = {
  consulting:'consulting', design:'designing', quotation:'quoting', contract:'contract_signed',
  production:'producing', shipping:'shipping', installation:'installing', 'customer-care':'warranty'
};

export default function ProjectWorkflowPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = ['admin', 'manager', 'director'].includes(user?.role);

  const [viewMode, setViewMode] = useState('grid');
  const [projects, setProjects] = useState([]);
  const [allStages, setAllStages] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filterDivision, setFilterDivision] = useState('all');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterSearch, setFilterSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [projRes, stageRes, compRes, divRes] = await Promise.all([
        api.get('/projects', { params: { limit: 500 } }),
        api.get('/users/stages'),
        api.get('/companies'),
        api.get('/ecosystem/units', { params: { level_code: 'division' } }),
      ]);

      let allProjects = projRes.data.projects || [];
      
      if (!isAdmin) {
        allProjects = allProjects.filter(p => {
          return p.created_by === user.id || p.responsible_person_id === user.id;
        });
      }

      setProjects(allProjects);
      setAllStages(stageRes.data.stages || []);
      setCompanies(compRes.data.companies || []);
      setDivisions(divRes.data.units || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  // Filter projects
  let filteredProjects = [...projects];
  
  if (filterDivision !== 'all') {
    const divCompanies = companies.filter(c => c.division_unit_id === filterDivision).map(c => c.id);
    filteredProjects = filteredProjects.filter(p => divCompanies.includes(p.company_id));
  }
  if (filterCompany !== 'all') {
    filteredProjects = filteredProjects.filter(p => p.company_id === filterCompany);
  }
  if (filterSearch) {
    const s = filterSearch.toLowerCase();
    filteredProjects = filteredProjects.filter(p =>
      p.code?.toLowerCase().includes(s) ||
      p.name?.toLowerCase().includes(s) ||
      p.customers?.full_name?.toLowerCase().includes(s)
    );
  }

  // Group stages by slug (unique workflow stages)
  const uniqueStages = [];
  const seenSlugs = new Set();
  allStages.forEach(s => {
    if (!seenSlugs.has(s.slug)) {
      seenSlugs.add(s.slug);
      uniqueStages.push(s);
    }
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-blue-600" />
            Công việc dự án
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filteredProjects.length} dự án · Chọn dự án và quy trình để xem chi tiết
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowFilters(!showFilters)}
            className={`h-9 px-4 rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer transition-colors ${
              showFilters ? 'bg-blue-600 text-white' : 'bg-white border text-gray-700 hover:bg-gray-50'
            }`}>
            <Filter className="h-4 w-4" />
            Lọc
          </button>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button onClick={() => setViewMode('grid')}
              className={`h-7 w-7 rounded flex items-center justify-center cursor-pointer ${
                viewMode === 'grid' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
              }`}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button onClick={() => setViewMode('list')}
              className={`h-7 w-7 rounded flex items-center justify-center cursor-pointer ${
                viewMode === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
              }`}>
              <List className="h-4 w-4" />
            </button>
          </div>
          <button onClick={loadData} className="h-9 w-9 bg-white border rounded-lg flex items-center justify-center hover:bg-gray-50 cursor-pointer text-gray-400">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                placeholder="Tìm mã DA, tên, KH..."
                className="flex-1 h-9 px-3 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-400" />
              <select
                value={filterDivision}
                onChange={e => { setFilterDivision(e.target.value); setFilterCompany('all'); }}
                className="h-9 px-3 border rounded-lg text-sm bg-white">
                <option value="all">Tất cả Khối</option>
                {divisions.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <select
              value={filterCompany}
              onChange={e => setFilterCompany(e.target.value)}
              className="h-9 px-3 border rounded-lg text-sm bg-white">
              <option value="all">Tất cả Công ty</option>
              {companies
                .filter(c => filterDivision === 'all' || c.division_unit_id === filterDivision)
                .map(c => (
                  <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                ))}
            </select>
          </div>
        </div>
      )}

      {/* Project list */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <FolderKanban className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">Không có dự án nào</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map(proj => (
            <ProjectCard key={proj.id} project={proj} stages={uniqueStages} onSelectStage={(slug) => navigate(`/stage/${slug}`)} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Mã DA</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Tên dự án</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Khách hàng</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Công ty</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Trạng thái</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Quy trình</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredProjects.map(proj => (
                <ProjectRow key={proj.id} project={proj} stages={uniqueStages} onSelectStage={(slug) => navigate(`/stage/${slug}`)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Project Card (Grid view)
function ProjectCard({ project, stages, onSelectStage }) {
  const currentStage = Object.keys(SLUG_TO_STATUS).find(k => SLUG_TO_STATUS[k] === project.status) || 'consulting';
  const stageName = STAGE_NAMES[currentStage];
  const stageColor = STAGE_COLORS[currentStage];

  return (
    <div className="bg-white rounded-xl border hover:shadow-lg transition-shadow p-4 space-y-3">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold text-blue-600">{project.code}</span>
          <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: stageColor + '20', color: stageColor }}>
            {stageName}
          </span>
        </div>
        <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 mb-2">{project.name}</h3>
        {project.customers?.full_name && (
          <p className="text-xs text-gray-500">👤 {project.customers.full_name}</p>
        )}
        {project.company && (
          <p className="text-xs text-indigo-600 mt-1">🏢 {project.company.short_name || project.company.name}</p>
        )}
      </div>

      <div className="border-t pt-3">
        <p className="text-xs font-medium text-gray-700 mb-2">Chọn quy trình xem:</p>
        <div className="grid grid-cols-2 gap-1.5">
          {stages.slice(0, 8).map(stage => {
            const isActive = stage.slug === currentStage;
            return (
              <button
                key={stage.id}
                onClick={() => onSelectStage(stage.slug)}
                className={`h-8 px-2 rounded text-[10px] font-medium cursor-pointer transition-all ${
                  isActive
                    ? 'text-white shadow-sm'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
                style={isActive ? { backgroundColor: STAGE_COLORS[stage.slug] || stage.color } : {}}>
                {stage.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Project Row (List view)
function ProjectRow({ project, stages, onSelectStage }) {
  const currentStage = Object.keys(SLUG_TO_STATUS).find(k => SLUG_TO_STATUS[k] === project.status) || 'consulting';
  const stageName = STAGE_NAMES[currentStage];
  const stageColor = STAGE_COLORS[currentStage];

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <span className="text-sm font-semibold text-blue-600">{project.code}</span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-900">{project.name}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{project.customers?.full_name || '-'}</td>
      <td className="px-4 py-3 text-xs text-indigo-600">{project.company?.short_name || project.company?.name || '-'}</td>
      <td className="px-4 py-3">
        <span className="text-xs px-2 py-1 rounded font-medium" style={{ backgroundColor: stageColor + '20', color: stageColor }}>
          {stageName}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1 flex-wrap">
          {stages.slice(0, 4).map(stage => (
            <button
              key={stage.id}
              onClick={() => onSelectStage(stage.slug)}
              className="h-6 px-2 bg-gray-100 text-gray-600 rounded text-[10px] font-medium hover:bg-blue-50 hover:text-blue-600 cursor-pointer">
              {stage.name}
            </button>
          ))}
        </div>
      </td>
    </tr>
  );
}
