import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams, useOutletContext } from 'react-router-dom';
import api from '../lib/api';
import PipelineStepper from '../components/PipelineStepper';
import CrmDeadlineModal from '../components/CrmDeadlineModal';
import AppModuleRecordTabs from '../components/AppModuleRecordTabs';
import { decorateAppModuleRecord } from '../lib/appModuleRecordDisplay';
import { formatDateTime, formatVND } from '../lib/utils';
import {
  ArrowLeft, Loader2, CheckCircle2, Edit2, Save, X, Pin,
  User, Phone, Mail, Building2, ExternalLink,
} from 'lucide-react';

function CustomerField({ label, value, editing, draft, onStart, onChange, onSave, onCancel, type = 'text' }) {
  return (
    <div className="group">
      <p className="text-xs text-gray-500 mb-0.5 font-medium">{label}</p>
      {editing ? (
        <div className="flex gap-1">
          <input
            type={type}
            value={draft}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 h-8 px-2 border rounded text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSave();
              if (e.key === 'Escape') onCancel();
            }}
          />
          <button type="button" onClick={onSave} className="px-2 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">
            <Save className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <p
          className="text-sm font-medium hover:bg-gray-50 p-1 rounded cursor-pointer group-hover:bg-gray-50"
          style={{ color: '#000000' }}
          onClick={onStart}
        >
          {value || '—'} <Edit2 className="h-3 w-3 inline opacity-0 group-hover:opacity-100 ml-1" />
        </p>
      )}
    </div>
  );
}

function InfoRow({ icon, label, displayValue, editing, draft, onStart, onChange, onSave, onCancel, type = 'text' }) {
  return (
    <div className="group">
      <div className="flex items-start gap-2 py-2 px-1 rounded-lg hover:bg-gray-50 -mx-1 transition-colors">
        <span className="text-sm mt-0.5 shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">{label}</p>
          {editing ? (
            <div className="flex items-center gap-1.5">
              <input
                type={type}
                value={draft}
                onChange={(e) => onChange(e.target.value)}
                className="w-full h-8 px-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSave();
                  if (e.key === 'Escape') onCancel();
                }}
              />
              <button type="button" onClick={onSave} className="h-8 w-8 flex items-center justify-center bg-blue-600 text-white rounded-lg"><Save className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={onCancel} className="h-8 w-8 flex items-center justify-center bg-gray-100 text-gray-500 rounded-lg"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <div onClick={onStart} className="cursor-pointer group/val">
              {displayValue ? (
                <p className="text-sm font-medium" style={{ color: '#000000' }}>{displayValue}</p>
              ) : (
                <p className="text-sm text-gray-300 italic group-hover/val:text-blue-400">Nhấn để nhập...</p>
              )}
            </div>
          )}
        </div>
        {!editing && (
          <button type="button" onClick={onStart} className="p-1 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-blue-500">
            <Edit2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function AppModuleRecordDetail() {
  const { moduleKey, recordId } = useParams();
  const navigate = useNavigate();
  const { mod } = useOutletContext() || {};
  const [record, setRecord] = useState(null);
  const [stages, setStages] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [tabStats, setTabStats] = useState({ activities: 0, documents: 0, taskFiles: 0, taskNotes: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, sRes, uRes] = await Promise.all([
        api.get(`/app-modules/${moduleKey}/records/${recordId}`),
        api.get(`/app-modules/${moduleKey}/stages`),
        api.get('/users').catch(() => ({ data: { users: [] } })),
      ]);
      const rec = decorateAppModuleRecord(rRes.data.record);
      setRecord(rec);
      setTitleDraft(rec?.name || '');
      const allStages = (sRes.data.stages || []).filter((s) => s.is_active !== false);
      const tabStages = rec?.tab_id
        ? allStages.filter((s) => String(s.tab_id) === String(rec.tab_id))
        : allStages;
      setStages(tabStages.length ? tabStages : allStages);
      setUsers(uRes.data?.users || uRes.data || []);
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
      setRecord(null);
    }
    setLoading(false);
  }, [moduleKey, recordId]);

  useEffect(() => { load(); }, [load]);

  const patchRecord = async (body) => {
    const { data } = await api.put(`/app-modules/${moduleKey}/records/${recordId}`, body);
    const next = decorateAppModuleRecord(data.record);
    setRecord(next);
    setTitleDraft(next?.name || '');
    return next;
  };

  const setStage = async (stageId) => {
    try {
      await patchRecord({ stage_id: stageId });
      setMessage('');
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    }
  };

  const saveTitle = async () => {
    if (!titleDraft.trim() || savingTitle) return;
    setSavingTitle(true);
    try {
      await patchRecord({ name: titleDraft.trim() });
      setEditingTitle(false);
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
    setSavingTitle(false);
  };

  const startEdit = (field, value) => {
    setEditingField(field);
    setEditDraft(value == null ? '' : String(value));
  };

  const saveField = async () => {
    if (!editingField) return;
    try {
      const payload = {};
      if (editingField === 'estimated_value') {
        payload.estimated_value = Math.max(0, Number(String(editDraft).replace(/[^\d.]/g, '')) || 0);
      } else if (editingField === 'assignee_id') {
        payload.assignee_id = editDraft || null;
      } else if (editingField === 'deposit_amount') {
        payload.deposit_amount = editDraft === '' ? null : Math.max(0, Number(editDraft) || 0);
      } else {
        payload[editingField] = editDraft;
      }
      await patchRecord(payload);
      setEditingField(null);
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  const currentStage = stages.find((s) => String(s.id) === String(record?.stage_id)) || record?.stage;
  const crmLeadId = record?.source_crm_lead_id || null;
  const depositDisplay = useMemo(() => {
    const amt = record?.meta?.deposit_amount;
    if (amt == null || amt === '') return null;
    const parts = [formatVND(amt)];
    if (record?.meta?.deposit_received === 'yes') parts.push('Đã nhận');
    if (record?.meta?.deposit_received === 'no') parts.push('Chưa nhận');
    if (record?.meta?.deposit_label) parts.push(record.meta.deposit_label);
    return parts.filter(Boolean).join(' · ');
  }, [record]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Đang tải…
      </div>
    );
  }

  if (!record) {
    return (
      <div className="p-6 text-sm text-gray-600">
        Không tìm thấy. <Link to={`/m/${moduleKey}`} className="text-blue-600">← Kanban</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {message && (
        <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{message}</div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            title="Quay lại Kanban"
            onClick={() => navigate(`/m/${moduleKey}`)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 hover:shadow-md hover:text-indigo-600 transition-all cursor-pointer"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2.25} />
          </button>
          <button
            type="button"
            title={record.is_pinned ? 'Bỏ ghim' : 'Ghim lên đầu Kanban'}
            onClick={() => patchRecord({ is_pinned: !record.is_pinned })}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-xl cursor-pointer border shadow-sm transition-all ${
              record.is_pinned
                ? 'bg-amber-100 border-amber-400 text-amber-700 ring-2 ring-amber-300/50'
                : 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100'
            }`}
          >
            <Pin className={`h-5 w-5 ${record.is_pinned ? 'rotate-45 fill-amber-500' : ''}`} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            title={record.is_interacted ? 'Bỏ đã tương tác' : 'Đánh dấu đã tương tác'}
            onClick={() => patchRecord({ is_interacted: !record.is_interacted })}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-xl cursor-pointer border shadow-sm transition-all ${
              record.is_interacted
                ? 'bg-blue-100 border-blue-400 text-blue-700 ring-2 ring-blue-300/50'
                : 'bg-sky-50 border-sky-200 text-sky-600 hover:bg-sky-100'
            }`}
          >
            <CheckCircle2 className={`h-5 w-5 ${record.is_interacted ? 'fill-blue-500 text-white' : ''}`} strokeWidth={2.25} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                {mod?.icon || '📦'} {(mod?.name || 'MODULE').toUpperCase()}
              </span>
              <span className="text-xs text-gray-500 font-mono">{record.code}</span>
              {crmLeadId && (
                <Link to={`/crm/leads/${crmLeadId}`} className="text-[11px] font-semibold text-teal-700 hover:underline inline-flex items-center gap-0.5">
                  Nguồn CRM <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
            {editingTitle ? (
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  className="h-10 min-w-[240px] max-w-[560px] px-3 border border-gray-300 rounded-lg text-lg font-semibold text-gray-900 bg-white"
                  autoFocus
                />
                <button type="button" onClick={saveTitle} disabled={savingTitle || !titleDraft.trim()} className="h-10 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 inline-flex items-center gap-1.5">
                  <Save className="h-4 w-4" /> {savingTitle ? 'Đang lưu...' : 'Lưu'}
                </button>
                <button type="button" onClick={() => { setTitleDraft(record.name || ''); setEditingTitle(false); }} className="h-10 px-3 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 inline-flex items-center gap-1.5">
                  <X className="h-4 w-4" /> Hủy
                </button>
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-900">{record.name}</h1>
                <button type="button" onClick={() => setEditingTitle(true)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Sửa tên">
                  <Edit2 className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold text-gray-500">🏷️ Phân loại:</span>
              {record.record_type?.name ? (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                  {record.record_type.name}
                </span>
              ) : (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200">
                  Chưa chọn
                </span>
              )}
            </div>
          </div>
        </div>
        {record.company && (
          <span className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700">
            <Building2 className="h-4 w-4 text-indigo-500" />
            {record.company.short_name || record.company.name}
          </span>
        )}
      </div>

      {(record.lost_reason || currentStage?.is_lost) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-lg shrink-0">❌</div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-bold text-red-700">HỦY / MẤT</span>
            {record.lost_reason && <p className="text-sm text-red-800 font-medium mt-1">Lý do: {record.lost_reason}</p>}
          </div>
        </div>
      )}

      <PipelineStepper
        stages={stages}
        currentStageId={record.stage_id}
        currentStageName={currentStage?.name || record.stage?.name}
        onMoveToStage={setStage}
        linearProgress
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1 space-y-4 min-w-0">
          <div className="bg-white rounded-xl border p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase" style={{ color: '#000000' }}>Khách hàng</h3>
            <div className="space-y-3">
              <CustomerField label="👤 Tên" value={record.customer?.full_name} editing={editingField === 'customer_name'} draft={editDraft} onStart={() => startEdit('customer_name', record.customer?.full_name || '')} onChange={setEditDraft} onSave={saveField} onCancel={() => setEditingField(null)} />
              <CustomerField label="📞 SĐT" value={record.customer?.phone} editing={editingField === 'customer_phone'} draft={editDraft} onStart={() => startEdit('customer_phone', record.customer?.phone || '')} onChange={setEditDraft} onSave={saveField} onCancel={() => setEditingField(null)} />
              <CustomerField label="✉️ Email" value={record.customer?.email} editing={editingField === 'customer_email'} draft={editDraft} onStart={() => startEdit('customer_email', record.customer?.email || '')} onChange={setEditDraft} onSave={saveField} onCancel={() => setEditingField(null)} type="email" />
            </div>
            <div className="border-t border-gray-100" />
            <div className="space-y-3">
              <CustomerField label="📍 Địa chỉ" value={record.meta?.customer_address} editing={editingField === 'customer_address'} draft={editDraft} onStart={() => startEdit('customer_address', record.meta?.customer_address || '')} onChange={setEditDraft} onSave={saveField} onCancel={() => setEditingField(null)} />
              <CustomerField label="🏢 Công ty" value={record.meta?.customer_company} editing={editingField === 'customer_company'} draft={editDraft} onStart={() => startEdit('customer_company', record.meta?.customer_company || '')} onChange={setEditDraft} onSave={saveField} onCancel={() => setEditingField(null)} />
              <CustomerField label="🧾 MST" value={record.meta?.tax_code} editing={editingField === 'tax_code'} draft={editDraft} onStart={() => startEdit('tax_code', record.meta?.tax_code || '')} onChange={setEditDraft} onSave={saveField} onCancel={() => setEditingField(null)} />
            </div>
            {(record.customer?.phone || record.customer?.email) && (
              <div className="flex flex-wrap gap-2 pt-1">
                {record.customer?.phone && (
                  <a href={`tel:${record.customer.phone}`} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-100">
                    <Phone className="h-3.5 w-3.5" /> Gọi
                  </a>
                )}
                {record.customer?.email && (
                  <a href={`mailto:${record.customer.email}`} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-sky-50 text-sky-700 text-xs font-semibold border border-sky-100">
                    <Mail className="h-3.5 w-3.5" /> Email
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border p-5 space-y-1 overflow-visible">
            <h3 className="text-sm font-bold uppercase mb-2" style={{ color: '#000000' }}>Thông tin</h3>
            <InfoRow icon="💰" label="Giá trị" displayValue={record.estimated_value > 0 ? formatVND(record.estimated_value) : null} editing={editingField === 'estimated_value'} draft={editDraft} onStart={() => startEdit('estimated_value', record.estimated_value || '')} onChange={setEditDraft} onSave={saveField} onCancel={() => setEditingField(null)} type="number" />
            <InfoRow icon="💵" label="Tiền cọc" displayValue={depositDisplay} editing={editingField === 'deposit_amount'} draft={editDraft} onStart={() => startEdit('deposit_amount', record.meta?.deposit_amount ?? '')} onChange={setEditDraft} onSave={saveField} onCancel={() => setEditingField(null)} type="number" />
            <InfoRow icon="🏷️" label="Phân loại" displayValue={record.record_type?.name} editing={editingField === 'record_type'} draft={editDraft} onStart={() => startEdit('record_type', record.record_type?.name || '')} onChange={setEditDraft} onSave={saveField} onCancel={() => setEditingField(null)} />
            <InfoRow icon="📍" label="Khu vực" displayValue={record.crm_region?.name} editing={editingField === 'region_name'} draft={editDraft} onStart={() => startEdit('region_name', record.crm_region?.name || '')} onChange={setEditDraft} onSave={saveField} onCancel={() => setEditingField(null)} />

            <div className="group">
              <div className="flex items-start gap-2 py-2 px-1 rounded-lg hover:bg-gray-50 -mx-1 transition-colors">
                <span className="text-sm mt-0.5 shrink-0">👷</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Phụ trách</p>
                  {editingField === 'assignee_id' ? (
                    <div className="flex items-center gap-1.5">
                      <select value={editDraft} onChange={(e) => setEditDraft(e.target.value)} className="w-full h-8 px-2 border rounded-lg text-sm bg-white" autoFocus>
                        <option value="">— Chưa gán —</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.full_name || u.email || u.id}</option>
                        ))}
                      </select>
                      <button type="button" onClick={saveField} className="h-8 w-8 flex items-center justify-center bg-blue-600 text-white rounded-lg"><Save className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => setEditingField(null)} className="h-8 w-8 flex items-center justify-center bg-gray-100 text-gray-500 rounded-lg"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ) : (
                    <div onClick={() => startEdit('assignee_id', record.assignee_id || '')} className="cursor-pointer flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-slate-400" />
                      <p className="text-sm font-medium" style={{ color: '#000000' }}>{record.assignee?.full_name || <span className="italic text-gray-300">Chưa gán</span>}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {!currentStage?.is_done && (
              <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-2.5 my-1.5">
                <div className="flex items-start gap-2">
                  <span className="text-sm mt-0.5">⏰</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-rose-500 uppercase tracking-wider font-medium mb-0.5">Deadline thẻ</p>
                    {record.kanban_deadline_at ? (
                      <p className="text-sm font-semibold text-slate-800">{formatDateTime(record.kanban_deadline_at)}</p>
                    ) : (
                      <p className="text-sm text-gray-400 italic">Chưa đặt deadline</p>
                    )}
                  </div>
                  <button type="button" onClick={() => setDeadlineOpen(true)} className="shrink-0 h-7 px-2.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700">
                    {record.kanban_deadline_at ? 'Sửa' : 'Đặt'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Quick stats — cùng 4 ô CRM */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2">
            <div className="bg-blue-50 rounded-lg border border-blue-100 p-3 text-center">
              <p className="text-xs text-gray-600 mb-1">Ghi chú / HĐ</p>
              <p className="text-xl font-bold text-blue-600">{tabStats.activities}</p>
            </div>
            <div className="bg-amber-50 rounded-lg border border-amber-100 p-3 text-center">
              <p className="text-xs text-gray-600 mb-1">Tài liệu</p>
              <p className="text-xl font-bold text-amber-600">{tabStats.documents}</p>
            </div>
            <div className="bg-purple-50 rounded-lg border border-purple-100 p-3 text-center">
              <p className="text-xs text-gray-600 mb-1">File NV</p>
              <p className="text-xl font-bold text-purple-600">{tabStats.taskFiles}</p>
            </div>
            <div className="bg-emerald-50 rounded-lg border border-emerald-100 p-3 text-center">
              <p className="text-xs text-gray-600 mb-1">Ghi chú NV</p>
              <p className="text-xl font-bold text-emerald-600">{tabStats.taskNotes}</p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-4 min-w-0">
          <AppModuleRecordTabs
            moduleKey={moduleKey}
            recordId={recordId}
            record={record}
            stages={stages}
            users={users}
            crmLeadId={crmLeadId}
            onRecordPatch={patchRecord}
            onReload={load}
            onStats={setTabStats}
          />
        </div>
      </div>

      <CrmDeadlineModal
        open={deadlineOpen}
        title={record.kanban_deadline_at ? 'Sửa deadline thẻ' : 'Đặt deadline thẻ'}
        subtitle="Deadline hiển thị trên thẻ Kanban (giống CRM)."
        initialDeadline={record.kanban_deadline_at || null}
        currentDeadline={record.kanban_deadline_at || null}
        requireReason={!!record.kanban_deadline_at}
        allowClear={!!record.kanban_deadline_at}
        onClose={() => setDeadlineOpen(false)}
        onConfirm={async ({ deadlineIso, reason }) => {
          await patchRecord({
            kanban_deadline_at: deadlineIso || null,
            deadline: deadlineIso || null,
            kanban_deadline_reason: reason || null,
          });
          setDeadlineOpen(false);
        }}
      />
    </div>
  );
}
