import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  FolderOpen,
  CheckCircle,
  Clock,
  AlertCircle,
  TrendingUp,
  Users,
  RefreshCw,
  ChevronRight
} from 'lucide-react';
import api from '../lib/api';

export default function DivisionDashboardSimple() {
  const { divisionId } = useParams();
  const navigate = useNavigate();

  const [division, setDivision] = useState(null);
  const [summary, setSummary] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (divisionId) {
      loadData();
    }
  }, [divisionId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load division info
      const divisionRes = await api.get(`/ecosystem/units/${divisionId}`);
      setDivision(divisionRes.data.unit);

      // Load task summary
      const summaryRes = await api.get(`/divisions/${divisionId}/task-summary`);
      setSummary(summaryRes.data);

      // Load projects overview
      const projectsRes = await api.get(`/divisions/${divisionId}/projects-overview`);
      setProjects(projectsRes.data.projects || []);

    } catch (error) {
      console.error('Load division data error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <RefreshCw className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!division) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <p className="text-gray-600">Không tìm thấy khối</p>
          <button
            onClick={() => navigate('/ecosystem')}
            className="mt-4 text-purple-600 hover:text-purple-700"
          >
            ← Quay lại
          </button>
        </div>
      </div>
    );
  }

  // Calculate stats
  const totalProjects = projects.length;
  const activeProjects = projects.filter(p => 
    ['planning', 'in-progress'].includes(p.project?.status)
  ).length;
  const completedProjects = projects.filter(p => 
    p.project?.status === 'done'
  ).length;

  const totalTasks = summary?.total || 0;
  const completedTasks = summary?.by_status?.done || 0;
  const inProgressTasks = summary?.by_status?.['in-progress'] || 0;
  const overdueTasks = summary?.overdue || 0;

  const completionRate = totalTasks > 0 
    ? Math.round((completedTasks / totalTasks) * 100) 
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/ecosystem')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại Hệ sinh thái
        </button>

        <div className="flex items-center gap-4 mb-4">
          <span className="text-5xl">{division.icon || '🏢'}</span>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{division.name}</h1>
            {division.description && (
              <p className="text-gray-600 mt-1">{division.description}</p>
            )}
          </div>
        </div>

        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Dự án */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <FolderOpen className="w-8 h-8 text-blue-500" />
            <span className="text-3xl font-bold text-gray-900">{totalProjects}</span>
          </div>
          <h3 className="text-sm font-medium text-gray-600 mb-1">Dự án</h3>
          <p className="text-xs text-gray-500">
            {activeProjects} đang làm • {completedProjects} hoàn thành
          </p>
        </div>

        {/* Nhiệm vụ */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
            <span className="text-3xl font-bold text-gray-900">{totalTasks}</span>
          </div>
          <h3 className="text-sm font-medium text-gray-600 mb-1">Nhiệm vụ</h3>
          <p className="text-xs text-gray-500">
            {completedTasks} hoàn thành • {inProgressTasks} đang làm
          </p>
        </div>

        {/* Tiến độ */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <TrendingUp className="w-8 h-8 text-purple-500" />
            <span className="text-3xl font-bold text-gray-900">{completionRate}%</span>
          </div>
          <h3 className="text-sm font-medium text-gray-600 mb-1">Tiến độ</h3>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div
              className="bg-gradient-to-r from-purple-500 to-indigo-600 h-2 rounded-full transition-all"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>

        {/* Quá hạn */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
            <span className="text-3xl font-bold text-gray-900">{overdueTasks}</span>
          </div>
          <h3 className="text-sm font-medium text-gray-600 mb-1">Quá hạn</h3>
          <p className="text-xs text-red-500">
            {overdueTasks > 0 ? 'Cần xử lý ngay' : 'Tất cả đúng hạn'}
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <button
          onClick={() => navigate(`/divisions/${divisionId}/projects`)}
          className="flex items-center justify-between p-6 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all"
        >
          <div className="flex items-center gap-3">
            <FolderOpen className="w-6 h-6" />
            <div className="text-left">
              <h3 className="font-semibold">Xem tất cả Dự án & Nhiệm vụ</h3>
              <p className="text-sm opacity-90">Chi tiết theo từng dự án</p>
            </div>
          </div>
          <ChevronRight className="w-6 h-6" />
        </button>

        <button
          onClick={() => navigate('/ecosystem')}
          className="flex items-center justify-between p-6 bg-white border-2 border-gray-200 rounded-xl hover:border-purple-300 transition-all"
        >
          <div className="flex items-center gap-3">
            <Building2 className="w-6 h-6 text-gray-600" />
            <div className="text-left">
              <h3 className="font-semibold text-gray-900">Quản lý Hệ sinh thái</h3>
              <p className="text-sm text-gray-500">Cấu trúc tổ chức</p>
            </div>
          </div>
          <ChevronRight className="w-6 h-6 text-gray-400" />
        </button>
      </div>

      {/* Recent Projects */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Dự án gần đây</h2>
        
        {projects.length === 0 ? (
          <div className="text-center py-12">
            <FolderOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Chưa có dự án nào được gán cho khối này</p>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.slice(0, 5).map((item) => (
              <div
                key={item.assignment_id}
                onClick={() => navigate(`/projects/${item.project?.id}`)}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 cursor-pointer transition-all"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-gray-900">
                      {item.project?.name || 'N/A'}
                    </h3>
                    <span className="text-xs text-gray-500">#{item.project?.code}</span>
                    <StatusBadge status={item.project?.status} />
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span>🏢 {item.company?.name || 'N/A'}</span>
                    <span>👤 {item.project?.customer_name || 'Chưa có'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm">
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-900">
                      {item.stats?.total || 0}
                    </p>
                    <p className="text-xs text-gray-500">nhiệm vụ</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-green-600">
                      {item.stats?.completed || 0}
                    </p>
                    <p className="text-xs text-gray-500">hoàn thành</p>
                  </div>
                  {(item.stats?.overdue || 0) > 0 && (
                    <div className="text-right">
                      <p className="text-lg font-bold text-red-600">
                        {item.stats.overdue}
                      </p>
                      <p className="text-xs text-gray-500">quá hạn</p>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {projects.length > 5 && (
              <button
                onClick={() => navigate(`/divisions/${divisionId}/projects`)}
                className="w-full py-3 text-purple-600 hover:text-purple-700 font-medium"
              >
                Xem tất cả {projects.length} dự án →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    pending: 'bg-gray-100 text-gray-700',
    planning: 'bg-blue-100 text-blue-700',
    'in-progress': 'bg-yellow-100 text-yellow-700',
    done: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700'
  };
  const labels = {
    pending: 'Chờ',
    planning: 'Lên KH',
    'in-progress': 'Đang làm',
    done: 'Xong',
    cancelled: 'Hủy'
  };
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
      {labels[status] || status}
    </span>
  );
}
