import { useState, useEffect } from 'react';
import api from '../lib/api';
import Modal from '../components/Modal';
import { Plus, Building2, Search, Users, Trash2, Edit, FolderKanban, UserPlus, X } from 'lucide-react';
import { getInitials, avatarColor, ROLE_LABELS } from '../lib/utils';

export default function CompaniesPage() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editCompany, setEditCompany] = useState(null);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [companyDetail, setCompanyDetail] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [addUserId, setAddUserId] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/companies', { params: { search: search || undefined } })
      .then(r => setCompanies(r.data.companies || []))
      .catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const loadDetail = async (id) => {
    setSelectedCompany(id);
    try {
      const [detailRes, usersRes] = await Promise.all([
        api.get(`/companies/${id}`),
        api.get('/users'),
      ]);
      setCompanyDetail(detailRes.data);
      setAllUsers(usersRes.data.users || []);
    } catch { }
  };

  const addEmployee = async () => {
    if (!addUserId || !selectedCompany) return;
    try {
      await api.post(`/companies/${selectedCompany}/employees`, { user_id: addUserId });
      setAddUserId('');
      loadDetail(selectedCompany);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  const removeEmployee = async (userId) => {
    if (!confirm('Xóa nhân viên khỏi công ty?')) return;
    await api.delete(`/companies/${selectedCompany}/employees/${userId}`);
    loadDetail(selectedCompany);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý công ty</h1>
          <p className="text-sm text-gray-500">{companies.length} công ty</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer">
          <Plus className="h-4 w-4" /> Thêm công ty
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="Tìm tên công ty..." className="w-full h-9 pl-10 pr-3 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
      </div>

      {/* Companies list + detail side panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Company list */}
        <div className="lg:col-span-1 space-y-2">
          {loading ? (
            <div className="text-center py-10"><svg className="animate-spin h-6 w-6 text-gray-400 mx-auto" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg></div>
          ) : companies.map(c => (
            <div key={c.id} onClick={() => loadDetail(c.id)}
              className={`bg-white rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md ${selectedCompany === c.id ? 'ring-2 ring-blue-500 border-blue-300' : 'border-gray-200'}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{c.name}</h3>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {c.short_name && <span className="font-medium text-indigo-600">{c.short_name}</span>}
                    {c.phone && <span>{c.phone}</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {!loading && companies.length === 0 && (
            <div className="text-center py-10 text-gray-400">
              <Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Chưa có công ty</p>
            </div>
          )}
        </div>

        {/* Right: Company detail */}
        <div className="lg:col-span-2">
          {companyDetail ? (
            <div className="bg-white rounded-xl border p-5 space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{companyDetail.company.name}</h2>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                    {companyDetail.company.short_name && <span className="font-medium text-indigo-600">{companyDetail.company.short_name}</span>}
                    {companyDetail.company.tax_code && <span>MST: {companyDetail.company.tax_code}</span>}
                    {companyDetail.company.phone && <span>📞 {companyDetail.company.phone}</span>}
                    {companyDetail.company.email && <span>✉ {companyDetail.company.email}</span>}
                  </div>
                  {companyDetail.company.address && <p className="text-xs text-gray-400 mt-1">📍 {companyDetail.company.address}</p>}
                </div>
                <button onClick={() => setEditCompany(companyDetail.company)} className="h-8 px-3 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 cursor-pointer flex items-center gap-1">
                  <Edit className="h-3 w-3" /> Sửa
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-xs text-blue-600 font-medium">Nhân viên</p>
                  <p className="text-xl font-bold text-blue-900">{companyDetail.members?.length || 0}</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3">
                  <p className="text-xs text-emerald-600 font-medium">Dự án</p>
                  <p className="text-xl font-bold text-emerald-900">{companyDetail.projects?.length || 0}</p>
                </div>
              </div>

              {/* Employees */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4" /> Nhân viên ({companyDetail.members?.length || 0})
                </h3>

                {/* Add employee */}
                <div className="flex gap-2 mb-3">
                  <select value={addUserId} onChange={e => setAddUserId(e.target.value)} className="flex-1 h-9 px-3 border rounded-lg text-sm bg-white">
                    <option value="">— Thêm nhân viên —</option>
                    {allUsers
                      .filter(u => !companyDetail.members?.find(m => m.id === u.id))
                      .map(u => <option key={u.id} value={u.id}>{u.full_name} ({ROLE_LABELS[u.role] || u.role})</option>)}
                  </select>
                  <button onClick={addEmployee} disabled={!addUserId}
                    className="h-9 px-3 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50 flex items-center gap-1">
                    <UserPlus className="h-4 w-4" /> Thêm
                  </button>
                </div>

                <div className="space-y-1">
                  {companyDetail.members?.map(m => (
                    <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 group">
                      <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                        style={{ backgroundColor: avatarColor(m.full_name) }}>
                        {getInitials(m.full_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{m.full_name}</p>
                        <p className="text-xs text-gray-500">{ROLE_LABELS[m.role] || m.role} · {m.email}</p>
                      </div>
                      <button onClick={() => removeEmployee(m.id)}
                        className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 cursor-pointer">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {!companyDetail.members?.length && <p className="text-xs text-gray-400 py-3 text-center">Chưa có nhân viên</p>}
                </div>
              </div>

              {/* Projects */}
              {companyDetail.projects?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <FolderKanban className="h-4 w-4" /> Dự án ({companyDetail.projects.length})
                  </h3>
                  <div className="space-y-1">
                    {companyDetail.projects.map(p => (
                      <div key={p.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg text-sm">
                        <span className="font-bold text-blue-600">{p.code}</span>
                        <span className="flex-1 truncate">{p.name}</span>
                        <span className="text-xs text-gray-400">{p.customers?.full_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border p-10 text-center text-gray-400">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Chọn công ty bên trái để xem chi tiết</p>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      <CompanyFormModal
        open={showCreate || !!editCompany}
        company={editCompany}
        onClose={() => { setShowCreate(false); setEditCompany(null); }}
        onSaved={() => { load(); if (selectedCompany) loadDetail(selectedCompany); }}
      />
    </div>
  );
}

function CompanyFormModal({ open, company, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(company || { name: '', short_name: '', tax_code: '', address: '', phone: '', email: '' });
    }
  }, [open, company]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name?.trim()) return;
    setLoading(true);
    try {
      if (company?.id) {
        await api.put(`/companies/${company.id}`, form);
      } else {
        await api.post('/companies', form);
      }
      onSaved(); onClose();
    } catch { }
    setLoading(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={company ? 'Sửa công ty' : 'Thêm công ty'}>
      <form onSubmit={submit} className="space-y-4">
        <div><label className="block text-sm font-medium mb-1">Tên công ty *</label>
          <input value={form.name || ''} onChange={e => set('name', e.target.value)} required className="input" placeholder="Công ty TNHH..." /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-sm font-medium mb-1">Tên viết tắt</label>
            <input value={form.short_name || ''} onChange={e => set('short_name', e.target.value)} className="input" placeholder="VPT" /></div>
          <div><label className="block text-sm font-medium mb-1">Mã số thuế</label>
            <input value={form.tax_code || ''} onChange={e => set('tax_code', e.target.value)} className="input" placeholder="0123456789" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-sm font-medium mb-1">Điện thoại</label>
            <input value={form.phone || ''} onChange={e => set('phone', e.target.value)} className="input" /></div>
          <div><label className="block text-sm font-medium mb-1">Email</label>
            <input value={form.email || ''} onChange={e => set('email', e.target.value)} className="input" /></div>
        </div>
        <div><label className="block text-sm font-medium mb-1">Địa chỉ</label>
          <input value={form.address || ''} onChange={e => set('address', e.target.value)} className="input" /></div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 px-4 bg-gray-100 text-gray-700 rounded-lg text-sm cursor-pointer">Hủy</button>
          <button type="submit" disabled={loading} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50">
            {loading ? 'Đang lưu...' : company ? 'Cập nhật' : 'Tạo mới'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
