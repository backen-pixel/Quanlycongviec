import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate, formatDateTime, getInitials, avatarColor } from '../lib/utils';
import {
  ArrowLeft, Phone, Mail, Calendar, DollarSign, User, Target,
  CheckCircle2, FileIcon, FolderKanban, Factory, ShieldCheck, MessageSquare,
  FileText, ArrowRightLeft, Building2, Clock, Send, ClipboardCheck, Package
} from 'lucide-react';

export default function ProductionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('tasks');
  const [approvalForm, setApprovalForm] = useState({ type: 'drawing', title: '', note: '' });

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

  const submitWorkshopApproval = () => {
    if (!approvalForm.title.trim()) {
      alert('Nhập tiêu đề nội dung cần duyệt');
      return;
    }
    alert(`Đã ghi nhận yêu cầu gửi duyệt cho deal này:\n- Loại: ${approvalForm.type}\n- Tiêu đề: ${approvalForm.title}\n\nBước tiếp theo mình sẽ nối form này với API duyệt hai chiều CRM <-> xưởng.`);
    setApprovalForm({ type: 'drawing', title: '', note: '' });
  };

  if (loading || !project) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-10 w-10 border-4 border-orange-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const STAGES = project.workshopPipeline?.length
    ? project.workshopPipeline
    : [
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
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className="text-xs text-gray-500 font-semibold">XƯỞNG / Chi tiết deal sản xuất</span>
              <span className={`px-2 py-1 text-xs font-bold rounded-lg text-white`} style={{ backgroundColor: project.current_stage?.color || '#94a3b8' }}>
                {project.current_stage?.name || 'N/A'}
              </span>
              <span className="px-2 py-1 text-xs font-bold rounded-lg bg-gray-100 text-gray-700">{project.code}</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
            <p className="text-sm text-gray-600 mt-1">
              Từ deal thắng sang xưởng, giữ thông tin CRM, tài liệu được chia sẻ và nhiệm vụ sản xuất.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/projects/${project.id}`} className="h-10 px-4 rounded-lg bg-orange-50 text-orange-700 text-sm font-medium hover:bg-orange-100 flex items-center gap-2">
            <FolderKanban className="h-4 w-4" /> Xem dự án đầy đủ
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column: Project Info */}
        <div className="xl:col-span-2 space-y-6">
          {/* Pipeline Stepper */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Quy trình Sản Xuất</h2>
            <div className="flex items-center gap-2">
              {STAGES.map((stage, idx) => (
                <div key={stage.slug} className="flex items-center gap-2">
                  <button
                    onClick={() => STAGES[idx]?.id && moveStage(STAGES[idx]?.id)}
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
            <h2 className="font-semibold text-gray-900 mb-4">Thông tin xưởng</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div className="md:col-span-2 rounded-xl bg-orange-50 border border-orange-100 p-4 text-sm text-gray-700">
                <div className="font-semibold text-orange-700 mb-1">Ghi chú nội bộ</div>
                {project.notes || 'Chưa có ghi chú nội bộ cho xưởng.'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4 text-gray-900 font-semibold">
                <ShieldCheck className="h-5 w-5 text-orange-600" /> Deal / CRM liên quan
              </div>
              {project.crmDeals?.length ? (
                <div className="space-y-3">
                  {project.crmDeals.map((deal) => (
                    <div key={deal.id} className="rounded-xl border border-gray-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold text-purple-600">{deal.code}</p>
                          <p className="text-sm font-semibold text-gray-900">{deal.title}</p>
                        </div>
                        <Link to={`/crm/leads/${deal.id}`} className="text-xs font-medium text-orange-600 hover:underline">
                          Mở CRM
                        </Link>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span>Loại: {deal.type}</span>
                        <span>Giá trị: {formatVND(deal.estimated_value)}</span>
                        <span>Tạo lúc: {formatDate(deal.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Chưa tìm thấy bản ghi CRM liên kết.</p>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4 text-gray-900 font-semibold">
                <ClipboardCheck className="h-5 w-5 text-orange-600" /> Gửi duyệt deal này
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Loại gửi duyệt</label>
                  <select
                    value={approvalForm.type}
                    onChange={(e) => setApprovalForm((prev) => ({ ...prev, type: e.target.value }))}
                    className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="drawing">Bản vẽ</option>
                    <option value="material">Vật tư</option>
                    <option value="change-request">Yêu cầu chỉnh sửa</option>
                    <option value="handoff">Hồ sơ bàn giao</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Tiêu đề</label>
                  <input
                    value={approvalForm.title}
                    onChange={(e) => setApprovalForm((prev) => ({ ...prev, title: e.target.value }))}
                    className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm"
                    placeholder="Ví dụ: Bản vẽ bếp tầng 2 cần CRM duyệt"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Ghi chú gửi duyệt</label>
                  <textarea
                    value={approvalForm.note}
                    onChange={(e) => setApprovalForm((prev) => ({ ...prev, note: e.target.value }))}
                    className="w-full min-h-[96px] px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    placeholder="Mô tả rõ nội dung cần CRM hoặc quản lý duyệt cho đúng từng deal..."
                  />
                </div>
                <button
                  onClick={submitWorkshopApproval}
                  className="h-10 px-4 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 flex items-center gap-2 cursor-pointer"
                >
                  <Send className="h-4 w-4" /> Gửi duyệt deal này
                </button>
                <div className="rounded-xl bg-gray-50 p-3 text-xs text-gray-500">
                  Chức năng này nằm trong chi tiết từng deal xưởng, không nằm ở kanban. Mỗi yêu cầu duyệt sẽ gắn với đúng deal đang mở.
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4 text-gray-900 font-semibold">
              <ArrowRightLeft className="h-5 w-5 text-orange-600" /> Trao đổi gần đây
            </div>
            {project.recentComments?.length ? (
              <div className="space-y-3">
                {project.recentComments.map((comment) => (
                  <div key={comment.id} className="rounded-xl bg-gray-50 p-3">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="text-xs font-semibold text-gray-700">{comment.user?.full_name || 'Người dùng'}</span>
                      <span className="text-[11px] text-gray-400">{formatDateTime(comment.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.content || 'Không có nội dung'}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Chưa có trao đổi nội bộ cho dự án này.</p>
            )}
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
                📁 Tài liệu chia sẻ ({project.sharedDocuments?.length || 0})
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
              <button
                onClick={() => setActiveTab('approvals')}
                className={`px-6 py-4 font-medium text-sm border-b-2 transition ${
                  activeTab === 'approvals'
                    ? 'border-orange-600 text-orange-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                ✅ Gửi duyệt deal
              </button>
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {activeTab === 'tasks' && <TasksTab project={project} />}
              {activeTab === 'documents' && <DocumentsTab project={project} />}
              {activeTab === 'timeline' && <TimelineTab project={project} />}
              {activeTab === 'approvals' && <ApprovalsTab approvalForm={approvalForm} setApprovalForm={setApprovalForm} onSubmit={submitWorkshopApproval} />}
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

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><Building2 className="h-4 w-4 text-orange-600" /> Công ty phụ trách</h3>
            <div className="text-sm text-gray-700">
              {project.company ? `${project.company.name}${project.company.short_name ? ` (${project.company.short_name})` : ''}` : 'Chưa gán công ty'}
            </div>
          </div>

          {/* Team Assignments */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-4">👨‍💼 Đội ngũ</h3>
            <div className="space-y-3">
              {project.sales_person && (
                <PersonCard label="Kinh doanh" person={project.sales_person} />
              )}
              {project.project_manager && (
                <PersonCard label="QL dự án" person={project.project_manager} />
              )}
              {project.supervisor && (
                <PersonCard label="Giám sát" person={project.supervisor} />
              )}
              {project.production_person && (
                <PersonCard label="Sản xuất" person={project.production_person} />
              )}
              {project.shipping_person && (
                <PersonCard label="Vận chuyển" person={project.shipping_person} />
              )}
              {project.installation_person && (
                <PersonCard label="Lắp đặt" person={project.installation_person} />
              )}
              {project.care_person && (
                <PersonCard label="CSKH" person={project.care_person} />
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><Package className="h-4 w-4 text-orange-600" /> Trạng thái chia sẻ tài liệu</h3>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-center justify-between">
                <span>Hiện cho xưởng</span>
                <span className="font-semibold text-emerald-600">{project.sharedDocuments?.length || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Đang ẩn vì chưa cho phép chia sẻ</span>
                <span className="font-semibold text-amber-600">{project.hiddenDocumentsCount || 0}</span>
              </div>
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
    <div className="space-y-3">
      {project.sharedDocuments && project.sharedDocuments.length > 0 ? (
        project.sharedDocuments.map((doc) => {
          const href = doc.file_url || (doc.file_path ? `/uploads/${doc.file_path}` : '#');
          return (
            <div key={doc.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
              <FileIcon className="h-5 w-5 text-orange-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{doc.file_name || doc.name || doc.file_path?.split('/').pop() || 'Tài liệu'}</p>
                <p className="text-xs text-gray-500">Tải lên: {formatDate(doc.created_at || doc.uploaded_at)}</p>
                {doc.notes && <p className="text-xs text-gray-400 mt-1 truncate">{doc.notes}</p>}
              </div>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50 rounded transition"
              >
                Xem
              </a>
            </div>
          );
        })
      ) : (
        <p className="text-gray-500 text-sm text-center py-6">Chưa có tài liệu nào được chia sẻ cho xưởng</p>
      )}
      {(project.hiddenDocumentsCount || 0) > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-700">
          Còn {project.hiddenDocumentsCount} tài liệu đang bị ẩn vì chưa có ghi chú hoặc quyền cho phép chia sẻ sang xưởng.
        </div>
      )}
    </div>
  );
}

// Timeline Tab Component
function PersonCard({ label, person }) {
  if (!person) return null;
  return (
    <div className="flex items-center gap-3">
      {person.avatar ? (
        <img src={person.avatar} alt="" className="h-8 w-8 rounded-full" />
      ) : (
        <div
          className="h-8 w-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
          style={{ backgroundColor: avatarColor(person.full_name) }}
        >
          {getInitials(person.full_name)}
        </div>
      )}
      <div className="flex-1">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-900">{person.full_name}</p>
      </div>
    </div>
  );
}

function ApprovalsTab({ approvalForm, setApprovalForm, onSubmit }) {
  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-xl bg-orange-50 border border-orange-100 p-4 text-sm text-orange-800">
        `Gửi duyệt deal này` nằm trong chi tiết deal ở sản xuất. Xưởng sẽ gửi bản vẽ, vật tư hoặc hồ sơ của deal đang mở sang CRM/quản lý để duyệt.
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Loại gửi duyệt</label>
        <select
          value={approvalForm.type}
          onChange={(e) => setApprovalForm((prev) => ({ ...prev, type: e.target.value }))}
          className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm"
        >
          <option value="drawing">Bản vẽ</option>
          <option value="material">Vật tư</option>
          <option value="change-request">Yêu cầu chỉnh sửa</option>
          <option value="handoff">Hồ sơ bàn giao</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Tiêu đề</label>
        <input
          value={approvalForm.title}
          onChange={(e) => setApprovalForm((prev) => ({ ...prev, title: e.target.value }))}
          className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm"
          placeholder="Ví dụ: Vật tư deal TB-2026-015 cần duyệt"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Ghi chú</label>
        <textarea
          value={approvalForm.note}
          onChange={(e) => setApprovalForm((prev) => ({ ...prev, note: e.target.value }))}
          className="w-full min-h-[120px] px-3 py-2 border border-gray-200 rounded-lg text-sm"
          placeholder="Nội dung cần duyệt cho riêng deal này..."
        />
      </div>
      <button
        onClick={onSubmit}
        className="h-10 px-4 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 flex items-center gap-2 cursor-pointer"
      >
        <Send className="h-4 w-4" /> Gửi duyệt deal này
      </button>
    </div>
  );
}

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
