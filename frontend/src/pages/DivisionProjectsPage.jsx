import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  Building2,
  BarChart3,
  Clock,
  CheckCircle,
  AlertCircle,
  Search,
  RefreshCw
} from 'lucide-react';
import api from '../lib/api';

export default function DivisionProjectsPage() {
  const { divisionId } = useParams();
  const navigate = useNavigate();

  const [division, setDivision] = useState(null);
  const [projects, setProjects] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedProject, setExpandedProject] = useState(null);

  // Load division info
  useEffect(() => {
    loadDivision();
  }, [divisionId]);

  // Load projects & summary
  useEffect(() => {
    if (divisionId) {
      loadData();
    }
  }, [divisionId, statusFilter, searchTerm]);

  const loadDivision = async () => {
    try {
      const res = await api.get(`/ecosystem/units/${divisionId}`);
      setDivision(res.data.unit);
    } catch (error) {
      console.error('Load division error:', error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // Load projects overview
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (searchTerm) params.append('search', searchTerm);

      const [projectsRes, summaryRes] = await Promise.all([
        api.get(`/divisions/${divisionId}/projects-overview?${params}`),
        api.get(`/divisions/${divisionId}/task-summary`)
      ]);

      setProjects(projectsRes.data.projects || []);
      setSummary(summaryRes.data);
    } catch (error) {
      console.error('Load data error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-gray-100 text-gray-700',
      planning: 'bg-blue-100 text-blue-700',
      'in-progress': 'bg-yellow-100 text-yellow-700',
      done: 'bg-green-100 text-green-700',
      cancelled: 'bg-red-100 text-red-700'
    };
    const labels = {
      pending: 'Chờ duyệt',
      planning: 'Lên kế hoạch',
      'in-progress': 'Đang thực hiện',
      done: 'Hoàn thành',
      cancelled: 'Đã hủy'
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
        {labels[status] || status}
      </span>
    );
  };

  const getTaskStatusBadge = (status) => {
    const styles = {
      pending: 'bg-gray-100 text-gray-600',
      'in-progress': 'bg-blue-100 text-blue-600',
      done: 'bg-green-100 text-green-600'
    };
    const labels = {
      pending: 'Chờ',
      'in-progress': 'Đang làm',
      done: 'Xong'
    };
    return (
      <span className={`px-2 py-0.5 text-xs rounded ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
        {labels[status] || status}
      </span>
    );
  };

  const getPriorityBadge = (priority) => {
    const styles = {
      low: 'bg-blue-50 text-blue-600',
      medium: 'bg-yellow-50 text-yellow-600',
      high: 'bg-orange-50 text-orange-600',
      urgent: 'bg-red-50 text-red-600'
    };
    const labels = {
      low: 'Thấp',
      medium: 'Trung bình',
      high: 'Cao',
      urgent: 'Khẩn cấp'
    };
    return (
      <span className={`px-2 py-0.5 text-xs rounded ${styles[priority] || ''}`}>
        {labels[priority] || priority}
      </span>
    );
  };

  const toggleProject = (projectId) => {
    setExpandedProject(expandedProject === projectId ? null : projectId);
  };

  if (loading && !division) {
    return (
      <div className="flex justify-center items-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/ecosystem')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          Quay lại Hệ sinh thái
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Quản lý Nhiệm vụ - Khối {division?.name || '...'}
            </h1>
            <p className="text-gray-600">
              Theo dõi tất cả dự án và nhiệm vụ được giao cho khối này
            </p>
          </div>
          <button
            onClick={loadData}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            title="Làm mới"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-600 font-medium">Tổng nhiệm vụ</p>
                <p className="text-3xl font-bold text-purple-900 mt-1">{summary.total}</p>
              </div>
              <BarChart3 className="w-10 h-10 text-purple-400" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 font-medium">Hoàn thành</p>
                <p className="text-3xl font-bold text-green-900 mt-1">{summary.by_status?.done || 0}</p>
              </div>
              <CheckCircle className="w-10 h-10 text-green-400" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-medium">Đang làm</p>
                <p className="text-3xl font-bold text-blue-900 mt-1">{summary.by_status?.['in-progress'] || 0}</p>
              </div>
              <Clock className="w-10 h-10 text-blue-400" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-600 font-medium">Quá hạn</p>
                <p className="text-3xl font-bold text-red-900 mt-1">{summary.overdue || 0}</p>
              </div>
              <AlertCircle className="w-10 h-10 text-red-400" />
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm dự án, công ty, khách hàng..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="planning">Lên kế hoạch</option>
            <option value="in-progress">Đang thực hiện</option>
            <option value="done">Hoàn thành</option>
            <option value="cancelled">Đã hủy</option>
          </select>
        </div>
      </div>

      {/* Projects List */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-purple-600" />
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">Không có dự án nào</p>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((item) => (
            <div
              key={item.assignment_id}
              className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow"
            >
              {/* Project Header */}
              <div
                className="p-5 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleProject(item.project.id)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold text-gray-900">
                        {item.project.name}
                      </h3>
                      <span className="text-sm text-gray-500">#{item.project.code}</span>
                      {getStatusBadge(item.project.status)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Building2 className="w-4 h-4" />
                        {item.company?.name || 'N/A'}
                      </span>
                      <span>👤 {item.project.customer_name || 'Chưa có'}</span>
                      {item.project.customer_phone && (
                        <span>📞 {item.project.customer_phone}</span>
                      )}
                    </div>
                  </div>

                  {/* Stats Summary */}
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-gray-900">{item.stats.total}</p>
                      <p className="text-xs text-gray-500">Nhiệm vụ</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-600">{item.stats.completed}</p>
                      <p className="text-xs text-gray-500">Hoàn thành</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-blue-600">{item.stats.in_progress}</p>
                      <p className="text-xs text-gray-500">Đang làm</p>
                    </div>
                    {item.stats.overdue > 0 && (
                      <div className="text-center">
                        <p className="text-2xl font-bold text-red-600">{item.stats.overdue}</p>
                        <p className="text-xs text-gray-500">Quá hạn</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-purple-500 to-indigo-600 h-2 rounded-full transition-all"
                    style={{ width: `${item.stats.completion_rate}%` }}
                  />
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  Tiến độ: {item.stats.completion_rate}%
                </p>
              </div>

              {/* Tasks Detail (Expandable) */}
              {expandedProject === item.project.id && (
                <div className="border-t border-gray-200 bg-gray-50 p-5">
                  {item.tasks.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">Chưa có nhiệm vụ nào</p>
                  ) : (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-gray-900 mb-3">
                        Danh sách nhiệm vụ ({item.tasks.length})
                      </h4>
                      {item.tasks.map((task) => (
                        <div
                          key={task.id}
                          className="bg-white border border-gray-200 rounded-lg p-3 hover:border-purple-300 transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h5 className="font-medium text-gray-900">{task.title}</h5>
                                {getTaskStatusBadge(task.status)}
                                {getPriorityBadge(task.priority)}
                              </div>
                              <div className="flex items-center gap-4 text-xs text-gray-500">
                                <span>Giai đoạn: {task.stage || 'N/A'}</span>
                                {task.assignee && (
                                  <span className="flex items-center gap-1">
                                    👤 {task.assignee.full_name}
                                  </span>
                                )}
                                {task.due_date && (
                                  <span className={
                                    new Date(task.due_date) < new Date() && task.status !== 'done'
                                      ? 'text-red-600 font-semibold'
                                      : ''
                                  }>
                                    📅 {new Date(task.due_date).toLocaleDateString('vi-VN')}
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => navigate(`/management/work-unified/${task.project_id}`)}
                              className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                            >
                              Xem chi tiết →
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
