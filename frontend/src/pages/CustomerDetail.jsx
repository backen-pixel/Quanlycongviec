import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { ArrowLeft, Phone, Mail, MapPin, Building2, Edit, Send, Trash2, Calendar, FolderKanban, MessageSquare, PhoneCall, Video, FileText, Globe } from 'lucide-react';
import { formatDate, formatDateTime, formatVND, getInitials, avatarColor, STATUS_LABELS, STATUS_COLORS } from '../lib/utils';

const INT_TYPES = [
  { value: 'call', label: 'Gọi điện', icon: PhoneCall },
  { value: 'meeting', label: 'Gặp mặt', icon: Video },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'zalo', label: 'Zalo', icon: MessageSquare },
  { value: 'facebook', label: 'Facebook', icon: Globe },
  { value: 'note', label: 'Ghi chú', icon: FileText },
  { value: 'visit', label: 'Khảo sát', icon: MapPin },
];

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('interactions');
  const [newInt, setNewInt] = useState({ type: 'call', title: '', content: '' });

  const load = () => {
    setLoading(true);
    api.get(`/customers/${id}`).then(r => setCustomer(r.data.customer)).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  const addInteraction = async () => {
    if (!newInt.title.trim()) return;
    await api.post(`/customers/${id}/interactions`, newInt);
    setNewInt({ type: 'call', title: '', content: '' });
    load();
  };

  const deleteInteraction = async (intId) => {
    await api.delete(`/customers/${id}/interactions/${intId}`);
    load();
  };

  if (loading) return <div className="flex items-center justify-center h-64"><svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg></div>;
  if (!customer) return <div className="text-center py-16 text-gray-400">Khách hàng không tồn tại</div>;

  const totalRevenue = customer.projects?.reduce((s, p) => s + (p.estimated_value || 0), 0) || 0;

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => navigate('/customers')} className="mt-1 w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 cursor-pointer">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-4 flex-1">
          <div className="h-14 w-14 rounded-full flex items-center justify-center text-white font-bold text-xl shrink-0"
            style={{ backgroundColor: avatarColor(customer.full_name) }}>
            {getInitials(customer.full_name)}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{customer.full_name}</h1>
            <div className="flex items-center gap-3 text-sm text-gray-500 mt-0.5">
              {customer.company && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{customer.company}</span>}
              {customer.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{customer.city}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4 space-y-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Liên hệ</h3>
          <div className="space-y-1.5 text-sm">
            <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-gray-400" /><a href={`tel:${customer.phone}`} className="text-blue-600 hover:underline">{customer.phone}</a></p>
            {customer.email && <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-gray-400" /><a href={`mailto:${customer.email}`} className="text-blue-600 hover:underline">{customer.email}</a></p>}
            {customer.address && <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-gray-400" />{customer.address}</p>}
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4 space-y-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Doanh thu</h3>
          <p className="text-2xl font-bold text-gray-900">{formatVND(totalRevenue)}</p>
          <p className="text-xs text-gray-500">{customer.projects?.length || 0} dự án</p>
        </div>
        <div className="bg-white rounded-xl border p-4 space-y-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Thông tin</h3>
          <div className="space-y-1 text-xs text-gray-600">
            {customer.source && <p>Nguồn: <strong>{customer.source}</strong></p>}
            {customer.gender && <p>Giới tính: <strong>{customer.gender === 'male' ? 'Nam' : 'Nữ'}</strong></p>}
            {customer.assigned_user && <p>Phụ trách: <strong>{customer.assigned_user.full_name}</strong></p>}
            <p>Ngày tạo: {formatDate(customer.created_at)}</p>
          </div>
        </div>
      </div>

      {customer.notes && <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800"><strong>Ghi chú:</strong> {customer.notes}</div>}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { id: 'interactions', label: 'Lịch sử tương tác', icon: MessageSquare, count: customer.interactions?.length },
          { id: 'projects', label: 'Dự án', icon: FolderKanban, count: customer.projects?.length },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 cursor-pointer ${tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <t.icon className="h-4 w-4" />{t.label}
            {t.count > 0 && <span className="text-xs bg-gray-100 px-1.5 rounded-full">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Interactions */}
      {tab === 'interactions' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <h4 className="text-sm font-medium text-gray-700">Thêm tương tác</h4>
            <div className="flex gap-2 flex-wrap">
              {INT_TYPES.map(t => (
                <button key={t.value} onClick={() => setNewInt(n => ({ ...n, type: t.value }))}
                  className={`h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer ${newInt.type === t.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  <t.icon className="h-3.5 w-3.5" />{t.label}
                </button>
              ))}
            </div>
            <input value={newInt.title} onChange={e => setNewInt(n => ({ ...n, title: e.target.value }))}
              placeholder="Tiêu đề tương tác..." className="input" />
            <textarea value={newInt.content} onChange={e => setNewInt(n => ({ ...n, content: e.target.value }))}
              placeholder="Nội dung chi tiết..." className="input min-h-[60px]" />
            <button onClick={addInteraction} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-700 flex items-center gap-1">
              <Send className="h-4 w-4" /> Lưu
            </button>
          </div>

          {customer.interactions?.map(int => {
            const typeInfo = INT_TYPES.find(t => t.value === int.type) || INT_TYPES[5];
            const Icon = typeInfo.icon;
            return (
              <div key={int.id} className="bg-white rounded-xl border p-4 flex gap-3 group">
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h4 className="text-sm font-medium text-gray-900">{int.title}</h4>
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{typeInfo.label}</span>
                  </div>
                  {int.content && <p className="text-sm text-gray-600 mt-1">{int.content}</p>}
                  <p className="text-xs text-gray-400 mt-1">{int.user?.full_name} · {formatDateTime(int.interaction_date)}</p>
                </div>
                <button onClick={() => deleteInteraction(int.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 cursor-pointer shrink-0">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
          {!customer.interactions?.length && <p className="text-sm text-gray-400 text-center py-8">Chưa có lịch sử tương tác</p>}
        </div>
      )}

      {/* Projects */}
      {tab === 'projects' && (
        <div className="space-y-2">
          {customer.projects?.map(p => (
            <Link to={`/projects/${p.id}`} key={p.id} className="bg-white rounded-xl border p-4 hover:shadow-md transition-all flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-bold text-blue-600">{p.code}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status] || ''}`}>{STATUS_LABELS[p.status]}</span>
                </div>
                <p className="text-sm text-gray-700">{p.name}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold">{formatVND(p.estimated_value)}</p>
                <p className="text-xs text-gray-400">{formatDate(p.created_at)}</p>
              </div>
            </Link>
          ))}
          {!customer.projects?.length && <p className="text-sm text-gray-400 text-center py-8">Chưa có dự án</p>}
        </div>
      )}
    </div>
  );
}
