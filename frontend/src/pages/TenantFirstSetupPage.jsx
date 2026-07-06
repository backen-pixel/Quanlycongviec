import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  Check,
  ArrowRight,
  Loader2,
  Sparkles,
  Layers,
  Users,
  GitBranch,
  Circle,
  Plus,
  Trash2,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';

const BRAND = {
  navy: '#0d1726',
  orange: '#ea5a23',
  orangeLight: '#f17a3a',
  cream: '#f5ede2',
};

const MISSION_META = {
  welcome: { icon: Sparkles, desc: 'Giới thiệu quy trình thiết lập' },
  ecosystem: { icon: Layers, desc: 'Đặt tên hệ sinh thái và Khối đầu tiên' },
  company: { icon: Building2, desc: 'Tạo công ty / xưởng kinh doanh' },
  departments: { icon: Building2, desc: 'Thêm phòng ban theo mẫu' },
  staff: { icon: Users, desc: 'Mời nhân viên tham gia' },
  pipeline: { icon: GitBranch, desc: 'Xem pipeline CRM mặc định' },
  finish: { icon: Check, desc: 'Hoàn tất và vào hệ thống' },
};

const DEPT_TEMPLATES = [
  { id: 'sales', icon: '📞', label: 'Tư vấn (Sales)' },
  { id: 'design', icon: '🎨', label: 'Thiết kế (Design)' },
  { id: 'production', icon: '🏭', label: 'Sản xuất (Production)' },
  { id: 'delivery', icon: '🚚', label: 'Vận chuyển' },
  { id: 'customer-care', icon: '💬', label: 'Chăm sóc KH' },
  { id: 'accounting', icon: '💰', label: 'Kế toán' },
];

const inputCls = 'w-full h-11 rounded-xl border border-slate-200 px-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100';

function emptyStaffRow() {
  return { full_name: '', email: '' };
}

function firstIncompleteMission(missions) {
  if (!missions?.length) return 'welcome';
  const pending = missions.find((m) => m.id !== 'welcome' && !m.done && m.required);
  if (pending) return pending.id;
  const optional = missions.find((m) => m.id !== 'welcome' && !m.done && !m.required);
  if (optional) return optional.id;
  return missions.find((m) => m.id === 'finish')?.done ? 'finish' : 'welcome';
}

export default function TenantFirstSetupPage() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [progress, setProgress] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState(true);
  const [activeMission, setActiveMission] = useState('welcome');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [ecosystemForm, setEcosystemForm] = useState({ tenant_name: '', division_name: '' });
  const [companyForm, setCompanyForm] = useState({
    company_name: '',
    short_name: '',
    phone: user?.phone || '',
    address: '',
  });
  const [selectedDepts, setSelectedDepts] = useState({
    sales: true,
    design: true,
    production: true,
    delivery: true,
    'customer-care': false,
    accounting: false,
  });
  const [staffRows, setStaffRows] = useState([emptyStaffRow()]);
  const [staffDeptId, setStaffDeptId] = useState('');
  const [departments, setDepartments] = useState([]);

  const loadProgress = useCallback(async () => {
    setLoadingProgress(true);
    try {
      const { data } = await api.get('/tenant/setup-progress');
      setProgress(data);
      if (data.tenant_name && !ecosystemForm.tenant_name) {
        setEcosystemForm((p) => ({ ...p, tenant_name: data.tenant_name }));
      }
      if (data.company?.name && !companyForm.company_name) {
        setCompanyForm((p) => ({
          ...p,
          company_name: data.company.name,
          short_name: data.company.short_name || '',
          phone: data.company.phone || p.phone,
          address: data.company.address || '',
        }));
      }
      return data;
    } catch {
      setProgress({ needs_setup: true, missions: [] });
      return null;
    } finally {
      setLoadingProgress(false);
    }
  }, []);

  useEffect(() => {
    loadProgress().then((data) => {
      if (data?.missions) {
        setActiveMission(firstIncompleteMission(data.missions));
      }
    });
  }, [loadProgress]);

  useEffect(() => {
    const companyId = progress?.company_id;
    if (!companyId) {
      setDepartments([]);
      return;
    }
    api.get('/departments', { params: { company_id: companyId } })
      .then((r) => setDepartments(r.data?.departments || []))
      .catch(() => setDepartments([]));
  }, [progress?.company_id, progress?.departments_count]);

  const missions = progress?.missions || [];
  const doneCount = missions.filter((m) => m.done && m.id !== 'welcome').length;
  const totalCount = missions.filter((m) => m.id !== 'welcome').length;
  const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

  const companyReady = useMemo(
    () => missions.find((m) => m.id === 'company')?.done,
    [missions],
  );

  const applyProgress = useCallback((data) => {
    if (data?.progress) setProgress(data.progress);
    else loadProgress();
  }, [loadProgress]);

  const goNext = useCallback((currentId) => {
    const idx = missions.findIndex((m) => m.id === currentId);
    for (let i = idx + 1; i < missions.length; i += 1) {
      setActiveMission(missions[i].id);
      return;
    }
    setActiveMission('finish');
  }, [missions]);

  const submitEcosystem = async (e) => {
    e.preventDefault();
    if (!ecosystemForm.tenant_name.trim() && !ecosystemForm.division_name.trim()) {
      setError('Nhập tên hệ sinh thái hoặc tên Khối');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post('/tenant/setup-ecosystem', ecosystemForm);
      applyProgress(data);
      setSuccess('Đã lưu cấu hình hệ sinh thái');
      goNext('ecosystem');
    } catch (err) {
      setError(err.response?.data?.error || 'Không lưu được');
    } finally {
      setLoading(false);
    }
  };

  const submitCompany = async (e) => {
    e.preventDefault();
    if (!companyForm.company_name.trim()) {
      setError('Nhập tên công ty / xưởng');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const sessionId = localStorage.getItem('session_id') || undefined;
      const { data } = await api.post('/tenant/first-setup', { ...companyForm, session_id: sessionId });
      if (data.token) localStorage.setItem('token', String(data.token).replace(/^Bearer\s+/i, ''));
      if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
      await refreshUser?.();
      await loadProgress();
      setSuccess('Đã tạo công ty và pipeline CRM mặc định');
      goNext('company');
    } catch (err) {
      setError(err.response?.data?.error || 'Không tạo được công ty');
    } finally {
      setLoading(false);
    }
  };

  const submitDepartments = async (e) => {
    e.preventDefault();
    const templates = Object.entries(selectedDepts).filter(([, v]) => v).map(([k]) => k);
    if (!templates.length) {
      setError('Chọn ít nhất một phòng ban');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post('/tenant/setup-departments', {
        company_id: progress?.company_id,
        templates,
      });
      applyProgress(data);
      setSuccess(`Đã tạo ${data.departments?.length || 0} phòng ban`);
      goNext('departments');
    } catch (err) {
      setError(err.response?.data?.error || 'Không tạo được phòng ban');
    } finally {
      setLoading(false);
    }
  };

  const submitStaff = async (e) => {
    e.preventDefault();
    const staff = staffRows.filter((r) => r.full_name.trim() && r.email.trim());
    if (!staff.length) {
      setError('Nhập ít nhất một nhân viên');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post('/tenant/setup-staff', {
        company_id: progress?.company_id,
        department_id: staffDeptId || null,
        staff,
        default_password: 'tubep123',
        role: 'staff',
      });
      applyProgress(data);
      const n = data.created?.length || 0;
      const errN = data.errors?.length || 0;
      setSuccess(errN ? `Đã tạo ${n} nhân viên, ${errN} lỗi` : `Đã tạo ${n} nhân viên`);
      if (n) goNext('staff');
    } catch (err) {
      setError(err.response?.data?.error || 'Không tạo được nhân viên');
    } finally {
      setLoading(false);
    }
  };

  const finishSetup = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/tenant/finish-setup');
      applyProgress(data);
      navigate('/crm/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Không hoàn tất được');
    } finally {
      setLoading(false);
    }
  };

  const skipMission = (id) => goNext(id);

  if (loadingProgress && !progress) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BRAND.cream }}>
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BRAND.cream }}>
      <header className="shrink-0 px-6 py-5 flex items-center justify-between gap-4 border-b border-slate-200/60 bg-white/50">
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center text-white"
            style={{ background: `linear-gradient(135deg, ${BRAND.orangeLight}, ${BRAND.orange})` }}
          >
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: BRAND.navy }}>TuBep Pro</p>
            <p className="text-xs text-slate-500">Thiết lập hệ sinh thái mới</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-slate-600">{pct}% hoàn thành</p>
          <div className="mt-1 h-1.5 w-32 rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: BRAND.orange }} />
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row gap-0 lg:gap-6 p-4 lg:p-8 max-w-6xl mx-auto w-full">
        {/* Sidebar nhiệm vụ */}
        <aside className="lg:w-72 shrink-0">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-4 sticky top-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">Nhiệm vụ thiết lập</h2>
            <nav className="space-y-1">
              {missions.filter((m) => m.id !== 'welcome').map((m) => {
                const Meta = MISSION_META[m.id] || {};
                const Icon = Meta.icon || Circle;
                const active = activeMission === m.id;
                const locked = (m.id === 'departments' || m.id === 'staff' || m.id === 'pipeline' || m.id === 'finish') && !companyReady;
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={locked}
                    onClick={() => !locked && setActiveMission(m.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-sm transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      active ? 'bg-orange-50 ring-1 ring-orange-200 text-slate-900' : 'hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <span className={`shrink-0 h-7 w-7 rounded-lg flex items-center justify-center ${m.done ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                      {m.done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium truncate">{m.label}</span>
                      {!m.required && !m.done && (
                        <span className="text-[10px] text-slate-400">Tuỳ chọn</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Panel nội dung */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200/80 p-6 sm:p-8">
            {(error || success) && (
              <div className={`mb-4 p-3 rounded-xl text-sm border ${error ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                {error || success}
              </div>
            )}

            {activeMission === 'welcome' && (
              <div className="space-y-5">
                <div className="text-center">
                  <div className="mx-auto h-14 w-14 rounded-2xl bg-teal-50 flex items-center justify-center mb-4">
                    <Sparkles className="h-7 w-7 text-teal-600" />
                  </div>
                  <h1 className="text-xl font-bold text-slate-900">
                    Chào {user?.full_name || user?.fullName || 'bạn'}!
                  </h1>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
                    Hoàn tất các nhiệm vụ bên trái để cấu hình hệ sinh thái, công ty, phòng ban, nhân viên và pipeline CRM.
                  </p>
                </div>
                <ul className="grid sm:grid-cols-2 gap-2 text-sm text-slate-600">
                  {['Hệ sinh thái & Khối', 'Công ty / Xưởng', 'Phòng ban', 'Nhân viên', 'Pipeline CRM'].map((line) => (
                    <li key={line} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                      <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                      {line}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setActiveMission(firstIncompleteMission(missions))}
                  className="w-full h-11 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
                  style={{ background: `linear-gradient(135deg, ${BRAND.orangeLight}, ${BRAND.orange})` }}
                >
                  Bắt đầu
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {activeMission === 'ecosystem' && (
              <form onSubmit={submitEcosystem} className="space-y-4">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Hệ sinh thái & Khối</h1>
                  <p className="text-sm text-slate-500 mt-1">Đặt tên hệ sinh thái và Khối tổ chức đầu tiên (VD: Khối Tủ Bếp Miền Bắc).</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tên hệ sinh thái</label>
                  <input
                    className={inputCls}
                    value={ecosystemForm.tenant_name}
                    onChange={(e) => setEcosystemForm((p) => ({ ...p, tenant_name: e.target.value }))}
                    placeholder="VD: Tập đoàn ABC"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tên Khối đầu tiên</label>
                  <input
                    className={inputCls}
                    value={ecosystemForm.division_name}
                    onChange={(e) => setEcosystemForm((p) => ({ ...p, division_name: e.target.value }))}
                    placeholder="VD: Khối Tủ Bếp"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => skipMission('ecosystem')} className="flex-1 h-11 rounded-xl border border-slate-200 text-sm text-slate-600 cursor-pointer">
                    Bỏ qua
                  </button>
                  <button type="submit" disabled={loading} className="flex-[2] h-11 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60" style={{ background: BRAND.orange }}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Lưu & tiếp <ArrowRight className="h-4 w-4" /></>}
                  </button>
                </div>
              </form>
            )}

            {activeMission === 'company' && (
              <form onSubmit={submitCompany} className="space-y-4">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Công ty / Xưởng</h1>
                  <p className="text-sm text-slate-500 mt-1">
                    {companyReady ? 'Công ty đã được tạo. Bạn có thể tiếp tục các bước khác.' : 'Tạo đơn vị kinh doanh đầu tiên — pipeline CRM sẽ được tạo tự động.'}
                  </p>
                </div>
                {companyReady && progress?.company ? (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm">
                    <p className="font-semibold text-emerald-900">{progress.company.name}</p>
                    {progress.company.phone && <p className="text-emerald-700 mt-1">{progress.company.phone}</p>}
                    <button type="button" onClick={() => goNext('company')} className="mt-3 text-emerald-800 font-medium text-xs cursor-pointer">
                      Tiếp tục →
                    </button>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Tên công ty / xưởng *</label>
                      <input required className={inputCls} value={companyForm.company_name} onChange={(e) => setCompanyForm((p) => ({ ...p, company_name: e.target.value }))} placeholder="VD: Xưởng Tủ Bếp ABC" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Tên viết tắt</label>
                      <input className={inputCls} value={companyForm.short_name} onChange={(e) => setCompanyForm((p) => ({ ...p, short_name: e.target.value }))} placeholder="VD: ABC" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Số điện thoại</label>
                      <input className={inputCls} value={companyForm.phone} onChange={(e) => setCompanyForm((p) => ({ ...p, phone: e.target.value }))} placeholder="09xxxxxxxx" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Địa chỉ</label>
                      <input className={inputCls} value={companyForm.address} onChange={(e) => setCompanyForm((p) => ({ ...p, address: e.target.value }))} placeholder="Địa chỉ xưởng / văn phòng" />
                    </div>
                    <button type="submit" disabled={loading} className="w-full h-11 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60" style={{ background: BRAND.orange }}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Tạo công ty <ArrowRight className="h-4 w-4" /></>}
                    </button>
                  </>
                )}
              </form>
            )}

            {activeMission === 'departments' && (
              <form onSubmit={submitDepartments} className="space-y-4">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Phòng ban</h1>
                  <p className="text-sm text-slate-500 mt-1">Chọn các phòng ban phù hợp với xưởng tủ bếp của bạn.</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {DEPT_TEMPLATES.map((d) => (
                    <label key={d.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selectedDepts[d.id] ? 'border-orange-300 bg-orange-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                      <input
                        type="checkbox"
                        checked={!!selectedDepts[d.id]}
                        onChange={(e) => setSelectedDepts((p) => ({ ...p, [d.id]: e.target.checked }))}
                        className="rounded"
                      />
                      <span className="text-lg">{d.icon}</span>
                      <span className="text-sm font-medium text-slate-800">{d.label}</span>
                    </label>
                  ))}
                </div>
                {progress?.departments_count > 0 && (
                  <p className="text-xs text-emerald-700">Đã có {progress.departments_count} phòng ban.</p>
                )}
                <div className="flex gap-2">
                  <button type="button" onClick={() => skipMission('departments')} className="flex-1 h-11 rounded-xl border border-slate-200 text-sm text-slate-600 cursor-pointer">Bỏ qua</button>
                  <button type="submit" disabled={loading} className="flex-[2] h-11 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60" style={{ background: BRAND.orange }}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Tạo phòng ban <ArrowRight className="h-4 w-4" /></>}
                  </button>
                </div>
              </form>
            )}

            {activeMission === 'staff' && (
              <form onSubmit={submitStaff} className="space-y-4">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Nhân viên</h1>
                  <p className="text-sm text-slate-500 mt-1">Thêm nhân viên đầu tiên. Mật khẩu mặc định: tubep123</p>
                </div>
                {departments.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Phòng ban mặc định</label>
                    <select className={inputCls} value={staffDeptId} onChange={(e) => setStaffDeptId(e.target.value)}>
                      <option value="">— Chưa gán —</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="space-y-2">
                  {staffRows.map((row, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input className={`${inputCls} flex-1`} placeholder="Họ tên" value={row.full_name} onChange={(e) => setStaffRows((rows) => rows.map((r, i) => (i === idx ? { ...r, full_name: e.target.value } : r)))} />
                      <input className={`${inputCls} flex-1`} placeholder="Email" type="email" value={row.email} onChange={(e) => setStaffRows((rows) => rows.map((r, i) => (i === idx ? { ...r, email: e.target.value } : r)))} />
                      {staffRows.length > 1 && (
                        <button type="button" onClick={() => setStaffRows((rows) => rows.filter((_, i) => i !== idx))} className="h-11 w-11 shrink-0 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 cursor-pointer">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setStaffRows((r) => [...r, emptyStaffRow()])} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 cursor-pointer">
                  <Plus className="h-4 w-4" /> Thêm dòng
                </button>
                {progress?.staff_count > 0 && (
                  <p className="text-xs text-emerald-700">Đã có {progress.staff_count} nhân viên khác.</p>
                )}
                <div className="flex gap-2">
                  <button type="button" onClick={() => skipMission('staff')} className="flex-1 h-11 rounded-xl border border-slate-200 text-sm text-slate-600 cursor-pointer">Bỏ qua</button>
                  <button type="submit" disabled={loading} className="flex-[2] h-11 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60" style={{ background: BRAND.orange }}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Tạo nhân viên <ArrowRight className="h-4 w-4" /></>}
                  </button>
                </div>
              </form>
            )}

            {activeMission === 'pipeline' && (
              <div className="space-y-4">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Pipeline CRM</h1>
                  <p className="text-sm text-slate-500 mt-1">Pipeline mặc định được tạo khi thêm công ty.</p>
                </div>
                {(progress?.pipelines || []).length === 0 ? (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    Chưa có pipeline — hãy hoàn thành bước &quot;Công ty / Xưởng&quot; trước.
                  </p>
                ) : (
                  progress.pipelines.map((pipe) => (
                    <div key={pipe.id} className="rounded-xl border border-slate-200 overflow-hidden">
                      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-800">
                        {pipe.name} {pipe.is_default && <span className="text-xs font-normal text-slate-500">(mặc định)</span>}
                      </div>
                      <div className="p-4 grid sm:grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-xs font-bold uppercase text-slate-400 mb-2">Lead</p>
                          <ol className="space-y-1">
                            {(pipe.stages?.lead || []).map((s) => (
                              <li key={s.id} className="text-slate-700">{s.order_index}. {s.name}</li>
                            ))}
                          </ol>
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase text-slate-400 mb-2">Deal</p>
                          <ol className="space-y-1">
                            {(pipe.stages?.deal || []).map((s) => (
                              <li key={s.id} className="text-slate-700">{s.order_index}. {s.name}</li>
                            ))}
                          </ol>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <button type="button" onClick={() => goNext('pipeline')} className="w-full h-11 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer" style={{ background: BRAND.orange }}>
                  Tiếp tục <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {activeMission === 'finish' && (
              <div className="text-center space-y-4">
                <div className="mx-auto h-14 w-14 rounded-full bg-emerald-500 flex items-center justify-center">
                  <Check className="h-7 w-7 text-white" />
                </div>
                <h1 className="text-xl font-bold text-slate-900">Sẵn sàng bắt đầu!</h1>
                <p className="text-sm text-slate-600 max-w-md mx-auto">
                  Bạn có thể bổ sung phòng ban, nhân viên sau tại <strong>Tổ chức nhanh</strong> hoặc <strong>Cấu trúc công ty</strong>.
                </p>
                <button
                  type="button"
                  onClick={finishSetup}
                  disabled={loading || !companyReady}
                  className="w-full h-11 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  style={{ background: `linear-gradient(135deg, ${BRAND.orangeLight}, ${BRAND.orange})` }}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Vào CRM Dashboard'}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
