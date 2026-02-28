import { useState, useEffect, useMemo } from 'react';
import api from '../lib/api';
import Modal from './Modal';
import { FileUploadButton, FilePreview } from './FileUpload';
import { Plus, CheckSquare, ChevronDown, ChevronRight, Building2, GripVertical, Trash2, Copy, Search, AlertTriangle, Eye } from 'lucide-react';
import { getInitials, avatarColor } from '../lib/utils';

const STAGES = [
  { slug: 'consulting', label: 'Tư vấn', color: '#8B5CF6', icon: '💬' },
  { slug: 'design', label: 'Thiết kế', color: '#EC4899', icon: '🎨' },
  { slug: 'quotation', label: 'Báo giá', color: '#F59E0B', icon: '💰' },
  { slug: 'contract', label: 'Hợp đồng', color: '#10B981', icon: '📝' },
  { slug: 'production', label: 'Sản xuất', color: '#F97316', icon: '🏭' },
  { slug: 'shipping', label: 'Vận chuyển', color: '#06B6D4', icon: '🚛' },
  { slug: 'installation', label: 'Lắp đặt', color: '#3B82F6', icon: '🔧' },
  { slug: 'customer-care', label: 'CSKH', color: '#EF4444', icon: '❤️' },
];

let lineIdCounter = 0;
function newLineId() { return `new_${++lineIdCounter}_${Date.now()}`; }

// ═══ Searchable User Select ═══
function UserSelect({ value, onChange, users, placeholder, className }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(u => u.full_name?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q));
  }, [users, search]);
  const selected = users.find(u => u.id === value);

  return (
    <div className={`relative ${className || ''}`}>
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full h-8 px-2 text-xs border rounded-md bg-white flex items-center gap-1.5 text-left cursor-pointer hover:border-blue-300">
        {selected ? (
          <><div className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[7px] font-bold shrink-0"
            style={{ backgroundColor: avatarColor(selected.full_name) }}>{getInitials(selected.full_name)}</div>
          <span className="truncate flex-1">{selected.full_name}</span></>
        ) : <span className="text-gray-400 flex-1 truncate">{placeholder || '— Chọn NV —'}</span>}
        <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setSearch(''); }} />
          <div className="absolute left-0 top-full mt-1 w-60 bg-white rounded-lg shadow-lg border z-50 max-h-52 overflow-hidden flex flex-col">
            <div className="p-1.5 border-b">
              <div className="flex items-center gap-1.5 px-2 bg-gray-50 rounded-md">
                <Search className="h-3 w-3 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm nhân viên..."
                  className="flex-1 h-7 text-xs bg-transparent outline-none" autoFocus />
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              <button type="button" onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 cursor-pointer ${!value ? 'bg-blue-50 text-blue-600' : 'text-gray-500'}`}>
                — Chưa chỉ định —
              </button>
              {filtered.map(u => (
                <button type="button" key={u.id} onClick={() => { onChange(u.id); setOpen(false); setSearch(''); }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 cursor-pointer flex items-center gap-2 ${value === u.id ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700'}`}>
                  <div className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[7px] font-bold shrink-0"
                    style={{ backgroundColor: avatarColor(u.full_name) }}>{getInitials(u.full_name)}</div>
                  <span className="flex-1 truncate">{u.full_name}</span>
                  <span className="text-[10px] text-gray-400">{u.role}</span>
                </button>
              ))}
              {filtered.length === 0 && <p className="text-xs text-gray-400 text-center py-3">Không tìm thấy</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function ProjectCreateModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({});
  const [customers, setCustomers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [companyEmployees, setCompanyEmployees] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [quotationFiles, setQuotationFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ full_name: '', phone: '', email: '', city: '' });
  const [showTemplates, setShowTemplates] = useState(false);
  const [workflowLines, setWorkflowLines] = useState([]);
  const [observers, setObservers] = useState({});

  useEffect(() => {
    if (!open) return;
    let tplData = [];
    Promise.all([
      api.get('/customers').then(r => setCustomers(r.data.customers || [])).catch(() => {}),
      api.get('/users').then(r => setAllUsers(r.data.users || [])).catch(() => {}),
      api.get('/companies').then(r => setCompanies(r.data.companies || [])).catch(() => setCompanies([])),
      api.get('/templates/by-stage').then(r => { tplData = r.data.stages || []; setTemplates(tplData); }).catch(() => {}),
    ]).then(() => {
      // Auto-fill from template assignees
      const lines = STAGES.map((s, i) => {
        const stageTpls = tplData.find(st => st.slug === s.slug);
        const firstActive = stageTpls?.templates?.find(t => t.is_active && t.assignee_id);
        return {
          _id: newLineId(), stage_slug: s.slug, label: s.label,
          assignee_id: firstActive?.assignee_id || '', _from_template: !!firstActive?.assignee_id,
          description: '', order_index: i,
        };
      });
      setWorkflowLines(lines);
    });
    setForm({ name: '', description: '', customer_id: '', company_id: '', install_address: '', estimated_value: '', priority: 'medium' });
    setQuotationFiles([]); setCompanyEmployees([]); setObservers({});
  }, [open]);

  useEffect(() => {
    if (form.company_id) {
      api.get(`/companies/${form.company_id}/employees`).then(r => setCompanyEmployees(r.data.employees || [])).catch(() => setCompanyEmployees([]));
    } else { setCompanyEmployees([]); }
  }, [form.company_id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const assignableUsers = form.company_id ? companyEmployees : allUsers;

  const updateLine = (lineId, key, value) => {
    setWorkflowLines(prev => prev.map(l => l._id === lineId ? { ...l, [key]: value, _from_template: key === 'assignee_id' ? false : l._from_template } : l));
  };
  const addLine = (stageSlug) => {
    const stage = STAGES.find(s => s.slug === stageSlug);
    const count = workflowLines.filter(l => l.stage_slug === stageSlug).length;
    setWorkflowLines(prev => {
      const lastIdx = prev.reduce((a, l, i) => l.stage_slug === stageSlug ? i : a, -1);
      const n = { _id: newLineId(), stage_slug: stageSlug, label: `${stage?.label} ${count + 1}`, assignee_id: '', description: '', order_index: lastIdx + 1 };
      const arr = [...prev]; arr.splice(lastIdx + 1, 0, n);
      return arr.map((l, i) => ({ ...l, order_index: i }));
    });
  };
  const removeLine = (lineId) => {
    setWorkflowLines(prev => {
      const line = prev.find(l => l._id === lineId);
      if (prev.filter(l => l.stage_slug === line?.stage_slug).length <= 1) return prev;
      return prev.filter(l => l._id !== lineId).map((l, i) => ({ ...l, order_index: i }));
    });
  };
  const duplicateLine = (lineId) => {
    setWorkflowLines(prev => {
      const idx = prev.findIndex(l => l._id === lineId);
      if (idx < 0) return prev;
      const copy = { ...prev[idx], _id: newLineId(), label: prev[idx].label + ' (Copy)', assignee_id: '' };
      const arr = [...prev]; arr.splice(idx + 1, 0, copy);
      return arr.map((l, i) => ({ ...l, order_index: i }));
    });
  };
  const addObserver = (slug, uid) => { if (!uid) return; setObservers(p => ({ ...p, [slug]: [...(p[slug] || []).filter(x => x !== uid), uid] })); };
  const removeObserver = (slug, uid) => { setObservers(p => ({ ...p, [slug]: (p[slug] || []).filter(x => x !== uid) })); };

  const createCustomer = async () => {
    if (!newCust.full_name || !newCust.phone) return;
    try {
      const { data } = await api.post('/customers', newCust);
      setCustomers(c => [data.customer, ...c]);
      setForm(f => ({ ...f, customer_id: data.customer.id }));
      setShowNewCustomer(false); setNewCust({ full_name: '', phone: '', email: '', city: '' });
    } catch { }
  };

  const missingStages = STAGES.filter(s => workflowLines.filter(l => l.stage_slug === s.slug).every(l => !l.assignee_id));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.customer_id) return;
    if (missingStages.length > 0) {
      if (!confirm(`⚠️ Chưa phân công NV cho: ${missingStages.map(s => s.label).join(', ')}\n\nVẫn tạo dự án?`)) return;
    }
    setLoading(true);
    try {
      const pf = {};
      STAGES.forEach(s => {
        const fl = workflowLines.find(l => l.stage_slug === s.slug);
        const k = s.slug === 'customer-care' ? 'care_person_id' : `${s.slug.replace('-','_')}_person_id`;
        pf[k] = fl?.assignee_id || null;
      });
      const payload = {
        ...form, ...pf, quotation_files: quotationFiles, observers,
        workflow_lines: workflowLines.map(l => ({ stage_slug: l.stage_slug, label: l.label, assignee_id: l.assignee_id || null, description: l.description || null, order_index: l.order_index })),
      };
      payload.estimated_value = payload.estimated_value ? +payload.estimated_value : null;
      payload.sales_person_id = pf.consulting_person_id || null;
      payload.designer_id = pf.design_person_id || null;
      payload.project_manager_id = pf.consulting_person_id || null;
      Object.keys(payload).forEach(k => { if (payload[k] === '') payload[k] = null; });
      await api.post('/projects', payload);
      onCreated?.(); onClose();
    } catch { }
    setLoading(false);
  };

  const linesByStage = {};
  STAGES.forEach(s => { linesByStage[s.slug] = workflowLines.filter(l => l.stage_slug === s.slug); });
  const activeTemplates = templates.filter(s => s.templates?.some(t => t.is_active));

  return (
    <Modal open={open} onClose={onClose} title="Tạo dự án mới" size="xl">
      <form onSubmit={submit} className="space-y-4 max-h-[82vh] overflow-y-auto pr-1">
        {/* Company */}
        <div className="bg-indigo-50 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-indigo-600" /><h3 className="text-sm font-semibold text-gray-900">Công ty</h3></div>
          <select value={form.company_id || ''} onChange={e => set('company_id', e.target.value)} className="input">
            <option value="">— Chọn công ty —</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}{c.short_name ? ` (${c.short_name})` : ''}</option>)}
          </select>
          {form.company_id && companyEmployees.length > 0 && <p className="text-xs text-indigo-600">✓ {companyEmployees.length} nhân viên</p>}
        </div>

        {/* Customer */}
        <div className="bg-gray-50 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Khách hàng</h3>
            <button type="button" onClick={() => setShowNewCustomer(!showNewCustomer)} className="text-xs text-blue-600 font-medium cursor-pointer flex items-center gap-1"><Plus className="h-3 w-3" /> Thêm mới</button>
          </div>
          {showNewCustomer ? (
            <div className="bg-white rounded-lg p-3 border space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input value={newCust.full_name} onChange={e => setNewCust(c => ({...c, full_name: e.target.value}))} placeholder="Họ tên *" className="input" />
                <input value={newCust.phone} onChange={e => setNewCust(c => ({...c, phone: e.target.value}))} placeholder="SĐT *" className="input" />
                <input value={newCust.email} onChange={e => setNewCust(c => ({...c, email: e.target.value}))} placeholder="Email" className="input" />
                <input value={newCust.city} onChange={e => setNewCust(c => ({...c, city: e.target.value}))} placeholder="Thành phố" className="input" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={createCustomer} className="h-8 px-3 bg-emerald-600 text-white rounded-lg text-xs font-medium cursor-pointer">Tạo KH</button>
                <button type="button" onClick={() => setShowNewCustomer(false)} className="h-8 px-3 bg-gray-100 rounded-lg text-xs cursor-pointer">Hủy</button>
              </div>
            </div>
          ) : (
            <select value={form.customer_id || ''} onChange={e => set('customer_id', e.target.value)} required className="input">
              <option value="">— Chọn khách hàng —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.full_name} — {c.phone}</option>)}
            </select>
          )}
        </div>

        {/* Project info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><label className="block text-xs font-medium mb-1">Tên dự án *</label>
            <input value={form.name || ''} onChange={e => set('name', e.target.value)} required className="input" placeholder="VD: Tủ bếp anh Minh — Q7" /></div>
          <div className="sm:col-span-2"><label className="block text-xs font-medium mb-1">Mô tả</label>
            <textarea value={form.description || ''} onChange={e => set('description', e.target.value)} className="input min-h-[40px]" /></div>
          <div><label className="block text-xs font-medium mb-1">Giá trị (VNĐ)</label>
            <input type="number" value={form.estimated_value || ''} onChange={e => set('estimated_value', e.target.value)} className="input" /></div>
          <div><label className="block text-xs font-medium mb-1">Địa chỉ lắp đặt</label>
            <input value={form.install_address || ''} onChange={e => set('install_address', e.target.value)} className="input" /></div>
          <div><label className="block text-xs font-medium mb-1">Ưu tiên</label>
            <select value={form.priority || 'medium'} onChange={e => set('priority', e.target.value)} className="input">
              <option value="low">Thấp</option><option value="medium">TB</option><option value="high">Cao</option><option value="urgent">Gấp</option>
            </select></div>
        </div>

        {/* Quotation files */}
        <div className="bg-amber-50 rounded-xl p-3 space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">📄 File báo giá</h3>
          <FileUploadButton onFilesUploaded={(f) => setQuotationFiles(qf => [...qf, ...f])} />
          <FilePreview files={quotationFiles} onRemove={(i) => setQuotationFiles(f => f.filter((_, j) => j !== i))} />
        </div>

        {/* Missing warning */}
        {missingStages.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-800">Chưa phân công NV</p>
              <p className="text-[11px] text-amber-600 mt-0.5">{missingStages.map(s => s.label).join(', ')}</p>
            </div>
          </div>
        )}

        {/* ═══ WORKFLOW BUILDER ═══ */}
        <div className="bg-blue-50 rounded-xl p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">🔄 Phân công nhân sự</h3>
            <span className="text-xs text-blue-600">{workflowLines.length} bộ phận</span>
          </div>

          {STAGES.map(stage => {
            const lines = linesByStage[stage.slug] || [];
            const obs = observers[stage.slug] || [];
            return (
              <div key={stage.slug} className="bg-white rounded-lg border overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ backgroundColor: stage.color + '10' }}>
                  <span className="text-sm">{stage.icon}</span>
                  <span className="text-xs sm:text-sm font-semibold" style={{ color: stage.color }}>{stage.label}</span>
                  {lines.every(l => l.assignee_id) ? <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 rounded-full">✓</span>
                    : <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 rounded-full">⚠</span>}
                  <div className="flex-1" />
                  <button type="button" onClick={() => addLine(stage.slug)}
                    className="text-[10px] px-1.5 py-0.5 rounded hover:bg-white/50 flex items-center gap-0.5 cursor-pointer font-medium" style={{ color: stage.color }}>
                    <Plus className="h-3 w-3" /> Thêm
                  </button>
                </div>

                <div className="divide-y">
                  {lines.map((line, li) => (
                    <div key={line._id} className="px-2 sm:px-3 py-2 hover:bg-gray-50/50">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-gray-400 font-mono w-3">#{li+1}</span>
                        <input value={line.label} onChange={e => updateLine(line._id, 'label', e.target.value)}
                          className="flex-1 min-w-[80px] h-7 px-2 text-xs border rounded-md bg-white focus:ring-1 focus:ring-blue-400 outline-none" />
                        <UserSelect value={line.assignee_id || ''} onChange={v => updateLine(line._id, 'assignee_id', v)}
                          users={assignableUsers} className="w-36 sm:w-44" />
                        {line._from_template && line.assignee_id && <span className="text-[8px] bg-green-100 text-green-700 px-1 rounded hidden sm:inline">mẫu</span>}
                        <button type="button" onClick={() => duplicateLine(line._id)} className="w-6 h-6 rounded hover:bg-blue-50 flex items-center justify-center text-gray-400 hover:text-blue-500 cursor-pointer"><Copy className="h-3 w-3" /></button>
                        {lines.length > 1 && <button type="button" onClick={() => removeLine(line._id)} className="w-6 h-6 rounded hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 cursor-pointer"><Trash2 className="h-3 w-3" /></button>}
                      </div>
                    </div>
                  ))}

                  {/* Observers */}
                  <div className="px-2 sm:px-3 py-2 bg-gray-50/50">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Eye className="h-3 w-3 text-gray-400 shrink-0" />
                      <span className="text-[10px] text-gray-500 font-medium shrink-0">Quan sát:</span>
                      {obs.map(uid => {
                        const u = [...assignableUsers, ...allUsers].find(x => x.id === uid);
                        return u ? (
                          <span key={uid} className="flex items-center gap-1 bg-white border rounded px-1.5 py-0.5 text-[10px]">
                            <div className="h-4 w-4 rounded-full flex items-center justify-center text-white text-[6px] font-bold"
                              style={{ backgroundColor: avatarColor(u.full_name) }}>{getInitials(u.full_name)}</div>
                            <span className="max-w-[60px] truncate">{u.full_name}</span>
                            <button type="button" onClick={() => removeObserver(stage.slug, uid)} className="text-gray-400 hover:text-red-500 cursor-pointer">×</button>
                          </span>
                        ) : null;
                      })}
                      <UserSelect value="" onChange={v => addObserver(stage.slug, v)}
                        users={[...assignableUsers, ...allUsers.filter(u => !assignableUsers.find(a => a.id === u.id))].filter(u => !obs.includes(u.id))}
                        placeholder="+ Thêm" className="w-24 sm:w-28" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Template preview */}
        <div className="bg-green-50 rounded-xl p-3 space-y-2">
          <button type="button" onClick={() => setShowTemplates(!showTemplates)} className="flex items-center gap-2 w-full cursor-pointer">
            {showTemplates ? <ChevronDown className="h-4 w-4 text-green-600" /> : <ChevronRight className="h-4 w-4 text-green-600" />}
            <h3 className="text-sm font-semibold text-gray-900">📋 Nhiệm vụ mẫu</h3>
            <span className="text-xs text-green-600 ml-auto">
              {activeTemplates.length > 0 ? `${activeTemplates.reduce((s, st) => s + st.templates.filter(t => t.is_active).length, 0)} NV` : 'Mặc định'}
            </span>
          </button>
          {showTemplates && (
            <div className="space-y-2 mt-1">
              {activeTemplates.length > 0 ? activeTemplates.map(stage => (
                <div key={stage.id}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color || '#3b82f6' }} />
                    <span className="text-xs font-semibold text-gray-700">{stage.name}</span>
                  </div>
                  <div className="pl-4 space-y-0.5">
                    {stage.templates.filter(t => t.is_active).map(t => (
                      <div key={t.id} className="flex items-center gap-2 text-xs text-gray-600">
                        <CheckSquare className="h-3 w-3 text-gray-400" />
                        <span className="flex-1">{t.title}</span>
                        {t.assignee_id && <span className="text-[9px] bg-blue-50 text-blue-600 px-1 rounded">
                          {allUsers.find(u => u.id === t.assignee_id)?.full_name || 'NV'}
                        </span>}
                      </div>
                    ))}
                  </div>
                </div>
              )) : <p className="text-xs text-gray-500">Chưa có NV mẫu.</p>}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-10 px-4 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium cursor-pointer">Hủy</button>
          <button type="submit" disabled={loading} className="h-10 px-6 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50">
            {loading ? 'Đang tạo...' : 'Tạo dự án'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
