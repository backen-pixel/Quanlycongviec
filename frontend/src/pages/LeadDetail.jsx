import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar, DollarSign, User, Target,
  Plus, Clock, MessageSquare, PhoneCall, Users as UsersIcon, FileText,
  ChevronRight, Edit3, Trash2, X, Save, Building2, FolderKanban
} from 'lucide-react';

const ACTIVITY_TYPES = [
  { value: 'call', label: 'Gọi điện', icon: '📞', color: 'bg-blue-100 text-blue-700' },
  { value: 'meeting', label: 'Gặp mặt', icon: '🤝', color: 'bg-purple-100 text-purple-700' },
  { value: 'email', label: 'Email', icon: '📧', color: 'bg-amber-100 text-amber-700' },
  { value: 'zalo', label: 'Zalo', icon: '💬', color: 'bg-blue-100 text-blue-700' },
  { value: 'note', label: 'Ghi chú', icon: '📝', color: 'bg-gray-100 text-gray-700' },
  { value: 'quote_sent', label: 'Gửi báo giá', icon: '💰', color: 'bg-emerald-100 text-emerald-700' },
];

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [activities, setActivities] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    setLoading(true);
    try {
      const [leadRes, actRes, stagesRes] = await Promise.all([
        api.get(`/crm/leads`).then(r => r.data.find(l => l.id === id)),
        api.get(`/crm/leads/${id}/activities`),
        api.get('/crm/pipeline-stages'),
      ]);
      setLead(leadRes);
      setActivities(actRes.data || []);
      setStages(stagesRes.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const moveStage = async (stageId) => {
    try {
      await api.patch(`/crm/leads/${id}/stage`, { stage_id: stageId });
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const deleteLead = async () => {
    if (!confirm('Xóa lead này?')) return;
    await api.delete(`/crm/leads/${id}`);
    navigate('/crm');
  };

  const convertToProject = async () => {
    if (!confirm('Tạo dự án từ lead này? Lead sẽ được link với dự án mới.')) return;
    try {
      const { data } = await api.post(`/crm/leads/${id}/convert-to-project`);
      alert(`Đã tạo dự án ${data.code}`);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  if (loading || !lead) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;

  const currentStageIdx = stages.findIndex(s => s.id === lead.stage_id);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/crm')} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"><ArrowLeft className="h-5 w-5" /></button>
          <div>
            <p className="text-xs text-blue-600 font-bold">{lead.code}</p>
            <h1 className="text-xl font-bold text-gray-900">{lead.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(`/crm/quotations/new?lead_id=${id}&customer_id=${lead.customer_id || ''}`)} className="h-9 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer"><FileText className="h-4 w-4" /> Tạo báo giá</button>
          {!lead.project_id ? (
            <button onClick={convertToProject} className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer"><FolderKanban className="h-4 w-4" /> Tạo dự án</button>
          ) : (
            <Link to={`/projects/${lead.project_id}`} className="h-9 px-3 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium flex items-center gap-1.5"><FolderKanban className="h-4 w-4" /> Xem dự án</Link>
          )}
          <button onClick={() => setShowEdit(true)} className="h-9 px-3 border rounded-lg text-sm flex items-center gap-1.5 cursor-pointer hover:bg-gray-50"><Edit3 className="h-4 w-4" /> Sửa</button>
          <button onClick={deleteLead} className="h-9 px-3 text-red-500 border border-red-200 rounded-lg text-sm flex items-center gap-1.5 cursor-pointer hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Pipeline Progress */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-center gap-1 overflow-x-auto">
          {stages.map((s, i) => {
            const isCurrent = s.id === lead.stage_id;
            const isPast = i < currentStageIdx;
            return (
              <button key={s.id} onClick={() => moveStage(s.id)}
                className={`flex-1 min-w-[100px] py-2 px-3 rounded-lg text-xs font-bold text-center transition-all cursor-pointer ${
                  isCurrent ? 'text-white shadow-md' : isPast ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
                style={isCurrent ? { backgroundColor: s.color } : {}}>
                <span>{s.icon} {s.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Info */}
        <div className="lg:col-span-1 space-y-4">
          {/* Lead Info Card */}
          <div className="bg-white rounded-xl border p-5 space-y-4">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Thông tin</h3>
            {lead.customer && (
              <div className="flex items-start gap-3">
                <User className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{lead.customer.full_name}</p>
                  {lead.customer.phone && <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><Phone className="h-3 w-3" />{lead.customer.phone}</p>}
                  {lead.customer.email && <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><Mail className="h-3 w-3" />{lead.customer.email}</p>}
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <DollarSign className="h-4 w-4 text-gray-400 shrink-0" />
              <div>
                <p className="text-sm font-bold text-green-600">{formatVND(lead.estimated_value || 0)}</p>
                <p className="text-xs text-gray-400">Giá trị · {lead.probability || 0}% xác suất</p>
              </div>
            </div>
            {lead.source && (
              <div className="flex items-center gap-3">
                <Target className="h-4 w-4 text-gray-400 shrink-0" />
                <p className="text-sm text-gray-700">{lead.source.icon} {lead.source.name}</p>
              </div>
            )}
            {lead.assignee && (
              <div className="flex items-center gap-3">
                <UsersIcon className="h-4 w-4 text-gray-400 shrink-0" />
                <p className="text-sm text-gray-700">👤 {lead.assignee.full_name}</p>
              </div>
            )}
            {lead.expected_close_date && (
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
                <p className="text-sm text-gray-700">Dự kiến chốt: {formatDate(lead.expected_close_date)}</p>
              </div>
            )}
            {lead.next_follow_up && (
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-gray-400 shrink-0" />
                <p className={`text-sm font-medium ${new Date(lead.next_follow_up) < new Date() ? 'text-red-600' : 'text-blue-600'}`}>
                  Follow-up: {formatDate(lead.next_follow_up)}
                </p>
              </div>
            )}
            {lead.description && (
              <div className="pt-2 border-t">
                <p className="text-xs text-gray-500">{lead.description}</p>
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="bg-white rounded-xl border p-5">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">Thống kê</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-700">{activities.length}</p>
                <p className="text-[10px] text-blue-600">Hoạt động</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-emerald-700">{activities.filter(a => a.type === 'call').length}</p>
                <p className="text-[10px] text-emerald-600">Cuộc gọi</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Timeline */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border p-5">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Lịch sử hoạt động</h3>
              <button onClick={() => setShowAddActivity(true)} className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                <Plus className="h-3.5 w-3.5" /> Thêm hoạt động
              </button>
            </div>

            {activities.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="h-12 w-12 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">Chưa có hoạt động nào</p>
                <button onClick={() => setShowAddActivity(true)} className="mt-3 text-sm text-blue-600 hover:underline cursor-pointer">Thêm hoạt động đầu tiên</button>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
                <div className="space-y-4">
                  {activities.map(act => {
                    const typeInfo = ACTIVITY_TYPES.find(t => t.value === act.type) || ACTIVITY_TYPES[4];
                    return (
                      <div key={act.id} className="relative pl-10">
                        <div className={`absolute left-2 top-1 w-5 h-5 rounded-full flex items-center justify-center text-xs ${typeInfo.color}`}>
                          {typeInfo.icon}
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${typeInfo.color}`}>{typeInfo.label}</span>
                            <span className="text-[10px] text-gray-400">{formatDate(act.activity_date)}</span>
                          </div>
                          <p className="text-sm font-medium text-gray-900">{act.title}</p>
                          {act.description && <p className="text-xs text-gray-500 mt-1">{act.description}</p>}
                          {act.outcome && <p className="text-xs text-blue-600 mt-1 font-medium">→ {act.outcome}</p>}
                          {act.creator && <p className="text-[10px] text-gray-400 mt-1">bởi {act.creator.full_name}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Activity Modal */}
      {showAddActivity && <AddActivityModal leadId={id} onClose={() => setShowAddActivity(false)} onSave={() => { setShowAddActivity(false); load(); }} />}

      {/* Edit Lead Modal */}
      {showEdit && <EditLeadModal lead={lead} stages={stages} onClose={() => setShowEdit(false)} onSave={() => { setShowEdit(false); load(); }} />}
    </div>
  );
}

function AddActivityModal({ leadId, onClose, onSave }) {
  const [form, setForm] = useState({ type: 'call', title: '', description: '', outcome: '', duration_minutes: '' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.title) return alert('Nhập tiêu đề hoạt động');
    setSaving(true);
    try {
      await api.post(`/crm/leads/${leadId}/activities`, {
        ...form, duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
      });
      onSave();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">Thêm hoạt động</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg cursor-pointer"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-700">Loại</label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {ACTIVITY_TYPES.map(t => (
                <button key={t.value} onClick={() => setForm(f => ({ ...f, type: t.value }))}
                  className={`p-2 rounded-lg text-xs font-medium text-center border-2 cursor-pointer transition-all ${form.type === t.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <span className="text-lg block mb-0.5">{t.icon}</span>{t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">Tiêu đề *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="VD: Gọi tư vấn báo giá" className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">Nội dung</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full px-3 py-2 border rounded-lg text-sm mt-1" placeholder="Chi tiết cuộc gọi, nội dung trao đổi..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700">Kết quả</label>
              <input value={form.outcome} onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))} placeholder="KH quan tâm, hẹn gặp..." className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Thời lượng (phút)</label>
              <input type="number" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="h-9 px-4 border rounded-lg text-sm cursor-pointer">Hủy</button>
          <button onClick={save} disabled={saving} className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50">{saving ? 'Đang lưu...' : 'Lưu'}</button>
        </div>
      </div>
    </div>
  );
}

function EditLeadModal({ lead, stages, onClose, onSave }) {
  const [form, setForm] = useState({
    title: lead.title || '', estimated_value: lead.estimated_value || 0,
    probability: lead.probability || 50, description: lead.description || '',
    expected_close_date: lead.expected_close_date || '', next_follow_up: lead.next_follow_up || '',
    stage_id: lead.stage_id || '', lost_reason: lead.lost_reason || '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/crm/leads/${lead.id}`, form);
      onSave();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">Sửa Lead</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg cursor-pointer"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div><label className="text-xs font-medium text-gray-700">Tên cơ hội</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-gray-700">Giá trị</label><input type="number" value={form.estimated_value} onChange={e => setForm(f => ({ ...f, estimated_value: parseFloat(e.target.value) || 0 }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" /></div>
            <div><label className="text-xs font-medium text-gray-700">Xác suất (%)</label><input type="number" min={0} max={100} value={form.probability} onChange={e => setForm(f => ({ ...f, probability: parseInt(e.target.value) || 0 }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-gray-700">Dự kiến chốt</label><input type="date" value={form.expected_close_date} onChange={e => setForm(f => ({ ...f, expected_close_date: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" /></div>
            <div><label className="text-xs font-medium text-gray-700">Follow-up tiếp</label><input type="date" value={form.next_follow_up} onChange={e => setForm(f => ({ ...f, next_follow_up: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" /></div>
          </div>
          <div><label className="text-xs font-medium text-gray-700">Giai đoạn</label>
            <select value={form.stage_id} onChange={e => setForm(f => ({ ...f, stage_id: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1">
              {stages.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
            </select>
          </div>
          <div><label className="text-xs font-medium text-gray-700">Ghi chú</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full px-3 py-2 border rounded-lg text-sm mt-1" /></div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="h-9 px-4 border rounded-lg text-sm cursor-pointer">Hủy</button>
          <button onClick={save} disabled={saving} className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50">{saving ? 'Đang lưu...' : 'Lưu'}</button>
        </div>
      </div>
    </div>
  );
}
