import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar, DollarSign, User, Target,
  Plus, Clock, MessageSquare, Edit2, Trash2, X, Save, Building2, FolderKanban,
  FileUp, FileText, Zap, ChevronDown, CheckCircle2, FileIcon, Paperclip
} from 'lucide-react';

export default function ProductionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('tasks');

  useEffect(() => {
    load();
  }, [id]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/production/projects/${id}`);
      setProject(data.project);
    } catch (e) {
      console.error(e);
      alert('Lỗi tải dữ liệu: ' + (e.response?.data?.error || e.message));
    }
    setLoading(false);
  };

  const moveStage = async (stageId) => {
    try {
      const { data } = await api.patch(`/production/projects/${id}/stage`, { stage_id: stageId });
      setProject(data.project);
      alert('Cập nhật giai đoạn thành công');
    } catch (e) {
      alert('Lỗi: ' + (e.response?.data?.error || e.message));
    }
  };

  if (loading || !project) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-10 w-10 border-4 border-orange-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const STAGES = [
    { slug: 'production', name: 'Sản xuất', color: '#EA580C', icon: '🏭' },
    { slug: 'delivery', name: 'VC & Lắp đặt', color: '#F97316', icon: '🚚' },
    { slug: 'customer-care', name: 'CSKH', color: '#FDBA74', icon: '🤝' },
  ];

  const currentStageIdx = STAGES.findIndex(s => s.slug === project.current_stage?.slug);
  const isPipelineComplete = currentStageIdx >= STAGES.length - 1;

  return (
    <div className="min-h-screen bg-gray-50 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/sx')} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs text-gray-500 font-semibold">SẢN XUẤT / Chi tiết dự án</span>
              <span className={`px-2 py-1 text-xs font-bold rounded-lg text-white`} style={{ backgroundColor: project.current_stage?.color || '#94a3b8' }}>
                {project.current_stage?.name || 'N/A'}
              </span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
            <p className="text-sm text-gray-600 mt-1">Mã: {project.code}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left Column: Project Info */}
        <div className="col-span-2 space-y-6">
          {/* Pipeline Stepper */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Quy trình Sản Xuất</h2>
            <div className="flex items-center gap-2">
              {STAGES.map((stage, idx) => (
                <div key={stage.slug} className="flex items-center gap-2">
                  <button
                    onClick={() => moveStage(STAGES[idx]?.id)}
                    className={`relative px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                      currentStageIdx >= idx
                        ? 'bg-orange-100 text-orange-700 border border-orange-300'
                        : 'bg-gray-100 text-gray-600 border border-gray-200'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span>{stage.icon}</span>
                      {stage.name}
                    </span>
                    {currentStageIdx === idx && (
                      <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-orange-600 rounded-full" />
                    )}
                  </button>
                  {idx < STAGES.length - 1 && (
                    <div className={`w-8 h-0.5 ${currentStageIdx > idx ? 'bg-orange-600' : 'bg-gray-300'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Project Details */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Thông tin Dự án</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <DollarSign className="h-5 w-5 text-orange-600 flex-shrink-0 mt-1" />
                <div>
                  <p className="text-xs text-gray-500 font-semibold">Giá trị dự án</p>
                  <p className="text-lg font-bold text-gray-900">{formatVND(project.estimated_value)}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-orange-600 flex-shrink-0 mt-1" />
                <div>
                  <p className="text-xs text-gray-500 font-semibold">Hạn chót</p>
                  <p className="text-lg font-bold text-gray-900">{project.deadline ? formatDate(project.deadline) : 'N/A'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Target className="h-5 w-5 text-orange-600 flex-shrink-0 mt-1" />
                <div>
                  <p className="text-xs text-gray-500 font-semibold">Mức độ ưu tiên</p>
                  <p className="text-lg font-bold text-gray-900 capitalize">
                    {project.priority === 'high' ? '🔴 Cao' : project.priority === 'medium' ? '🟡 Trung bình' : '🟢 Thấp'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-orange-600 flex-shrink-0 mt-1" />
                <div>
                  <p className="text-xs text-gray-500 font-semibold">Tiến độ</p>
                  <div className="flex items-center gap-2">
                    <div className="w-24 bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-orange-600 h-full transition-all"
                        style={{ width: `${project.taskProgress || 0}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-orange-600">{project.taskProgress || 0}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Tab Headers */}
            <div className="border-b border-gray-200 flex">
              <button
                onClick={() => setActiveTab('tasks')}
                className={`px-6 py-4 font-medium text-sm border-b-2 transition ${
                  activeTab === 'tasks'
                    ? 'border-orange-600 text-orange-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                📋 Nhiệm vụ
              </button>
              <button
                onClick={() => setActiveTab('documents')}
                className={`px-6 py-4 font-medium text-sm border-b-2 transition ${
                  activeTab === 'documents'
                    ? 'border-orange-600 text-orange-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                📁 Tài liệu ({project.documents?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('timeline')}
                className={`px-6 py-4 font-medium text-sm border-b-2 transition ${
                  activeTab === 'timeline'
                    ? 'border-orange-600 text-orange-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                📅 Lịch sử
              </button>
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {activeTab === 'tasks' && <TasksTab project={project} />}
              {activeTab === 'documents' && <DocumentsTab project={project} />}
              {activeTab === 'timeline' && <TimelineTab project={project} />}
            </div>
          </div>
        </div>

        {/* Right Column: Contact & Team */}
        <div className="space-y-6">
          {/* Customer Info */}
          {project.customer && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h3 className="font-semibold text-gray-900 mb-4">👥 Thông tin Khách hàng</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <User className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500 uppercase font-semibold">Tên</p>
                    <p className="text-sm font-medium text-gray-900">{project.customer.full_name}</p>
                  </div>
                </div>
                {project.customer.phone && (
                  <div className="flex items-start gap-3">
                    <Phone className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-semibold">Điện thoại</p>
                      <a href={`tel:${project.customer.phone}`} className="text-sm font-medium text-orange-600 hover:underline">
                        {project.customer.phone}
                      </a>
                    </div>
                  </div>
                )}
                {project.customer.email && (
                  <div className="flex items-start gap-3">
                    <Mail className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-semibold">Email</p>
                      <a href={`mailto:${project.customer.email}`} className="text-sm font-medium text-orange-600 hover:underline">
                        {project.customer.email}
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Team Assignments */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-4">👨‍💼 Đội ngũ</h3>
            <div className="space-y-3">
              {project.production_person && (
                <div className="flex items-center gap-3">
                  {project.production_person.avatar && (
                    <img src={project.production_person.avatar} alt="" className="h-8 w-8 rounded-full" />
                  )}
                  <div className="flex-1">
                    <p className="text-xs text-gray-500">Sản xuất</p>
                    <p className="text-sm font-medium text-gray-900">{project.production_person.full_name}</p>
                  </div>
                </div>
              )}
              {project.shipping_person && (
                <div className="flex items-center gap-3">
                  {project.shipping_person.avatar && (
                    <img src={project.shipping_person.avatar} alt="" className="h-8 w-8 rounded-full" />
                  )}
                  <div className="flex-1">
                    <p className="text-xs text-gray-500">Vận chuyển</p>
                    <p className="text-sm font-medium text-gray-900">{project.shipping_person.full_name}</p>
                  </div>
                </div>
              )}
              {project.installation_person && (
                <div className="flex items-center gap-3">
                  {project.installation_person.avatar && (
                    <img src={project.installation_person.avatar} alt="" className="h-8 w-8 rounded-full" />
                  )}
                  <div className="flex-1">
                    <p className="text-xs text-gray-500">Lắp đặt</p>
                    <p className="text-sm font-medium text-gray-900">{project.installation_person.full_name}</p>
                  </div>
                </div>
              )}
              {project.care_person && (
                <div className="flex items-center gap-3">
                  {project.care_person.avatar && (
                    <img src={project.care_person.avatar} alt="" className="h-8 w-8 rounded-full" />
                  )}
                  <div className="flex-1">
                    <p className="text-xs text-gray-500">CSKH</p>
                    <p className="text-sm font-medium text-gray-900">{project.care_person.full_name}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Tasks Tab Component
function TasksTab({ project }) {
  return (
    <div className="space-y-4">
      {project.tasksByStage && Object.keys(project.tasksByStage).length > 0 ? (
        Object.entries(project.tasksByStage).map(([stageName, tasks]) => (
          <div key={stageName} className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-3 capitalize">{stageName}</h4>
            <div className="space-y-2">
              {tasks.map(task => (
                <div key={task.id} className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded transition">
                  <input
                    type="checkbox"
                    checked={task.status === 'done'}
                    readOnly
                    className="mt-1 w-4 h-4 accent-orange-600"
                  />
                  <div className="flex-1">
                    <p className={`text-sm ${task.status === 'done' ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                      {task.title}
                    </p>
                    {task.assignee && (
                      <p className="text-xs text-gray-500 mt-1">Giao cho: {task.assignee.full_name}</p>
                    )}
                  </div>
                  {task.priority && (
                    <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">
                      {task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <p className="text-gray-500 text-sm text-center py-6">Không có nhiệm vụ</p>
      )}
    </div>
  );
}

// Documents Tab Component
function DocumentsTab({ project }) {
  return (
    <div className="space-y-2">
      {project.documents && project.documents.length > 0 ? (
        project.documents.map(doc => (
          <div key={doc.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
            <FileIcon className="h-5 w-5 text-orange-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{doc.file_path?.split('/').pop()}</p>
              <p className="text-xs text-gray-500">Tải lên: {formatDate(doc.uploaded_at)}</p>
            </div>
            <a
              href={`/uploads/${doc.file_path}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50 rounded transition"
            >
              Xem
            </a>
          </div>
        ))
      ) : (
        <p className="text-gray-500 text-sm text-center py-6">Không có tài liệu</p>
      )}
    </div>
  );
}

// Timeline Tab Component
function TimelineTab({ project }) {
  return (
    <div className="space-y-4">
      {project.stage_transitions && project.stage_transitions.length > 0 ? (
        project.stage_transitions.map((transition, idx) => (
          <div key={transition.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-4 h-4 bg-orange-600 rounded-full border-4 border-white shadow-md" />
              {idx < project.stage_transitions.length - 1 && (
                <div className="w-0.5 h-16 bg-gray-300 my-2" />
              )}
            </div>
            <div className="flex-1 py-2">
              <p className="text-sm font-semibold text-gray-900">
                {transition.from_stage?.name} → {transition.to_stage?.name}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Bởi: {transition.user?.full_name || 'Hệ thống'} | {formatDate(transition.created_at)}
              </p>
            </div>
          </div>
        ))
      ) : (
        <p className="text-gray-500 text-sm text-center py-6">Không có lịch sử</p>
      )}
    </div>
  );
}
