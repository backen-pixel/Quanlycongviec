import { useEffect, useState, useCallback, useMemo } from 'react';
import { RotateCcw, Trash2, AlertTriangle, Search, RefreshCw, FileText, Target, Paperclip, Eye, X, User, Phone, Mail, DollarSign, Calendar, Tag, Briefcase, MessageSquare, CheckSquare, FileIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { TrashTablePagination, TrashScrollTableShell } from '../components/UnifiedTrashFilters';
import { paginateItems, fmtTrashDateTime } from '../lib/trashPageUtils';
import { resolveTrashCompanyLabel } from '../lib/trashCompanyLabel';
import api from '../lib/api';

const ENTITY_META = {
  crm_lead: { label: 'Lead / Deal', icon: Target, color: 'bg-blue-100 text-blue-700' },
  lead_document: { label: 'File ghi chú', icon: FileText, color: 'bg-amber-100 text-amber-700' },
  crm_task_attachment: { label: 'Đính kèm task', icon: Paperclip, color: 'bg-purple-100 text-purple-700' },
};

const FILTER_TABS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'crm_lead', label: 'Lead / Deal' },
  { id: 'lead_document', label: 'File ghi chú' },
  { id: 'crm_task_attachment', label: 'Đính kèm task' },
];

function fmtDate(s) {
  return fmtTrashDateTime(s);
}

function fmtVND(v) {
  const n = Number(v);
  if (!n) return null;
  return n.toLocaleString('vi-VN') + ' ₫';
}

function Section({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-left text-sm font-semibold text-gray-700"
      >
        {Icon && <Icon className="h-4 w-4 text-gray-500" />}
        {title}
        {open ? <ChevronUp className="h-4 w-4 ml-auto text-gray-400" /> : <ChevronDown className="h-4 w-4 ml-auto text-gray-400" />}
      </button>
      {open && <div className="px-4 py-3">{children}</div>}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, color }) {
  if (value == null || value === '' || value === '—') return null;
  return (
    <div className="flex items-start gap-2 py-1.5">
      {Icon ? <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color || 'text-gray-400'}`} /> : <span className="w-4" />}
      <span className="text-xs text-gray-500 w-24 shrink-0">{label}</span>
      <span className="text-sm text-gray-900 break-words">{value}</span>
    </div>
  );
}

function TrashDetailModal({ trashId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!trashId) return;
    setLoading(true);
    setError(null);
    api.get(`/trash/${trashId}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, [trashId]);

  if (!trashId) return null;

  const snap = data?.snapshot || {};
  const lead = snap.lead || {};
  const customer = lead.customer || lead.contact || {};
  const children = snap.children || [];
  const activities = snap.activities || [];
  const documents = snap.documents || [];
  const tasks = snap.tasks || [];

  const stageLabel = lead.stage?.name || lead.stage_name || '';
  const pipelineLabel = lead.pipeline?.name || lead.pipeline_name || '';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 pt-12 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b bg-gray-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
              <Target className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">{data?.entity_label || 'Chi tiết'}</h2>
              <p className="text-xs text-gray-500">
                {data?.entity_type === 'crm_lead' ? (lead.type === 'deal' ? 'Deal' : 'Lead') : data?.entity_type || ''}
                {lead.code ? ` • ${lead.code}` : ''}
                {data?.deleted_at ? ` • Đã xóa: ${fmtDate(data.deleted_at)}` : ''}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">Đang tải…</div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
          ) : data?.entity_type === 'crm_lead' ? (
            <>
              {data.delete_reason && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-2.5 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-xs font-semibold text-orange-700">Lý do xóa:</span>
                    <p className="text-sm text-orange-800 mt-0.5">{data.delete_reason}</p>
                  </div>
                </div>
              )}

              {/* Thông tin Lead/Deal */}
              <Section title="Thông tin Lead / Deal" icon={Briefcase}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                  <InfoRow icon={Tag} label="Tiêu đề" value={lead.title} />
                  <InfoRow icon={Tag} label="Mã" value={lead.code} />
                  <InfoRow icon={Tag} label="Loại" value={lead.type === 'deal' ? 'Deal' : 'Lead'} color="text-blue-500" />
                  <InfoRow icon={DollarSign} label="Giá trị" value={fmtVND(lead.estimated_value)} color="text-emerald-500" />
                  <InfoRow icon={Tag} label="Pipeline" value={pipelineLabel} />
                  <InfoRow icon={Tag} label="Giai đoạn" value={stageLabel} />
                  <InfoRow icon={Tag} label="Nguồn" value={lead.source?.name || lead.source_name || ''} />
                  <InfoRow icon={Tag} label="Xác suất" value={lead.probability != null ? `${lead.probability}%` : ''} />
                  <InfoRow icon={Calendar} label="Ngày tạo" value={fmtDate(lead.created_at)} color="text-gray-400" />
                  <InfoRow icon={Calendar} label="Deadline" value={lead.expected_close_date ? fmtDate(lead.expected_close_date) : ''} color="text-red-400" />
                  {lead.lost_reason && <InfoRow icon={AlertTriangle} label="Lý do thua" value={lead.lost_reason} color="text-red-500" />}
                </div>
                {lead.description && (
                  <div className="mt-3 pt-3 border-t text-sm text-gray-700 whitespace-pre-wrap">{lead.description}</div>
                )}
              </Section>

              {/* Khách hàng */}
              {(customer.full_name || customer.phone || customer.email) && (
                <Section title="Khách hàng" icon={User}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                    <InfoRow icon={User} label="Tên" value={customer.full_name} />
                    <InfoRow icon={Phone} label="SĐT" value={customer.phone} />
                    <InfoRow icon={Mail} label="Email" value={customer.email} />
                    <InfoRow icon={Tag} label="Địa chỉ" value={customer.address} />
                  </div>
                </Section>
              )}

              {/* Sub-leads / children */}
              {children.length > 0 && (
                <Section title={`Lead/Deal con (${children.length})`} icon={Target} defaultOpen={false}>
                  <div className="space-y-2">
                    {children.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg text-sm">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.type === 'deal' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                          {c.type === 'deal' ? 'Deal' : 'Lead'}
                        </span>
                        <span className="font-medium text-gray-800 truncate">{c.title || c.code}</span>
                        {c.estimated_value > 0 && <span className="ml-auto text-emerald-600 text-xs font-semibold">{fmtVND(c.estimated_value)}</span>}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Nhiệm vụ CRM */}
              {tasks.length > 0 && (
                <Section title={`Nhiệm vụ (${tasks.length})`} icon={CheckSquare} defaultOpen={false}>
                  <div className="space-y-2">
                    {tasks.map((t) => (
                      <div key={t.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg text-sm">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${t.status === 'completed' ? 'bg-emerald-500' : t.status === 'in_progress' ? 'bg-blue-500' : 'bg-gray-300'}`} />
                        <span className="flex-1 truncate text-gray-800">{t.title}</span>
                        <span className="text-xs text-gray-400">{t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '🔵' : '⬜'}</span>
                        {t.due_date && <span className="text-xs text-gray-500">{fmtDate(t.due_date)}</span>}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Hoạt động */}
              {activities.length > 0 && (
                <Section title={`Hoạt động (${activities.length})`} icon={MessageSquare} defaultOpen={false}>
                  <div className="space-y-2">
                    {activities.map((a) => (
                      <div key={a.id} className="flex items-start gap-3 p-2 bg-gray-50 rounded-lg text-sm">
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium mt-0.5 shrink-0">{a.type || 'Ghi chú'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-800 break-words">{a.content || a.note || a.description || '(không có nội dung)'}</p>
                          <p className="text-xs text-gray-400 mt-1">{fmtDate(a.activity_date || a.created_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Tài liệu */}
              {documents.length > 0 && (
                <Section title={`Tài liệu (${documents.length})`} icon={FileIcon} defaultOpen={false}>
                  <div className="space-y-2">
                    {documents.map((d) => (
                      <div key={d.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg text-sm">
                        <FileText className="h-4 w-4 text-amber-500 shrink-0" />
                        <span className="flex-1 truncate text-gray-800">{d.name || d.file_name || 'File'}</span>
                        <span className="text-xs text-gray-400">{fmtDate(d.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}
            </>
          ) : data?.entity_type === 'lead_document' ? (
            <Section title="Thông tin tài liệu" icon={FileText}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                <InfoRow icon={FileText} label="Tên file" value={snap.document?.name || snap.document?.file_name} />
                <InfoRow icon={Calendar} label="Ngày tạo" value={fmtDate(snap.document?.created_at)} />
                <InfoRow icon={Tag} label="Loại" value={snap.document?.type || snap.document?.mime_type} />
              </div>
              {snap.document?.content && (
                <div className="mt-3 pt-3 border-t text-sm text-gray-700 whitespace-pre-wrap">{snap.document.content}</div>
              )}
            </Section>
          ) : (
            <div className="text-sm text-gray-500">
              <pre className="bg-gray-50 rounded-lg p-4 text-xs overflow-auto max-h-96">{JSON.stringify(snap, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TrashPage({ embedded = false, filters, showCompanyColumn = false, companies = [] }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const effectiveSearch = embedded && filters ? (filters.search || '') : search.trim();

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = {};
      if (filter !== 'all') params.entity_type = filter;
      if (effectiveSearch) params.q = effectiveSearch;
      if (filters?.companyId) params.company_id = filters.companyId;
      if (filters?.deletedBy) params.deleted_by = filters.deletedBy;
      const { data } = await api.get('/trash', { params });
      setItems(data.items || []);
      setPage(1);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [filter, effectiveSearch, filters?.companyId, filters?.deletedBy]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [filter, effectiveSearch, filters?.companyId, filters?.deletedBy]);

  const handleRestore = async (id) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await api.post(`/trash/${id}/restore`);
      setItems((arr) => arr.filter((x) => x.id !== id));
    } catch (e) {
      alert('Phục hồi thất bại: ' + (e.response?.data?.error || e.message));
    } finally {
      setBusyId(null);
    }
  };

  const handlePurge = async (id, label) => {
    if (busyId) return;
    if (!window.confirm(`Xóa vĩnh viễn "${label || 'mục này'}"? Không thể hoàn tác.`)) return;
    setBusyId(id);
    try {
      await api.delete(`/trash/${id}`);
      setItems((arr) => arr.filter((x) => x.id !== id));
    } catch (e) {
      alert('Xóa vĩnh viễn thất bại: ' + (e.response?.data?.error || e.message));
    } finally {
      setBusyId(null);
    }
  };

  const handleEmpty = async () => {
    setBusyId('all');
    try {
      await api.post('/trash/empty');
      setItems([]);
      setConfirmEmpty(false);
    } catch (e) {
      alert('Dọn sạch thất bại: ' + (e.response?.data?.error || e.message));
    } finally {
      setBusyId(null);
    }
  };

  const counts = useMemo(() => {
    const c = { all: items.length, crm_lead: 0, lead_document: 0, crm_task_attachment: 0 };
    items.forEach((x) => { c[x.entity_type] = (c[x.entity_type] || 0) + 1; });
    return c;
  }, [items]);

  const pagination = useMemo(() => paginateItems(items, page), [items, page]);
  const pagedItems = pagination.items;

  return (
    <div className={`flex flex-col min-h-0 ${embedded ? 'flex-1 h-full gap-2' : 'max-w-6xl mx-auto space-y-4'}`}>
      {!embedded && (
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Trash2 className="h-6 w-6 text-red-600" />
            Thùng rác
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Lead/Deal và file ghi chú đã xóa giữ tại đây 30 ngày. Bấm "Phục hồi" để khôi phục.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm"
          >
            <RefreshCw className="h-4 w-4" /> Tải lại
          </button>
          <button
            onClick={() => setConfirmEmpty(true)}
            disabled={items.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 text-sm disabled:opacity-50"
          >
            <AlertTriangle className="h-4 w-4" /> Dọn sạch
          </button>
        </div>
      </div>
      )}

      {embedded && (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm"
          >
            <RefreshCw className="h-4 w-4" /> Tải lại
          </button>
          <button
            type="button"
            onClick={() => setConfirmEmpty(true)}
            disabled={items.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 text-sm disabled:opacity-50"
          >
            <AlertTriangle className="h-4 w-4" /> Dọn sạch
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {FILTER_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilter(t.id)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
              filter === t.id
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t.label} <span className="opacity-70">({counts[t.id] ?? 0})</span>
          </button>
        ))}
        {!embedded && (
          <div className="ml-auto relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên…"
              className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm w-56"
            />
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm shrink-0">
          {error}
        </div>
      )}

      <TrashScrollTableShell
        header={(
          <div className="px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-100">
            {loading ? 'Đang tải…' : `${items.length} mục trong thùng rác CRM`}
          </div>
        )}
        footer={(
          <TrashTablePagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={setPage}
          />
        )}
      >
        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Đang tải…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <Trash2 className="h-10 w-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Thùng rác trống</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-[10px] uppercase tracking-wider sticky top-0 z-10 shadow-[0_1px_0_0_rgb(229,231,235)]">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Loại</th>
                <th className="text-left px-3 py-2 font-semibold">Tên</th>
                {showCompanyColumn && <th className="text-left px-3 py-2 font-semibold hidden lg:table-cell">Công ty</th>}
                <th className="text-left px-3 py-2 font-semibold hidden md:table-cell">Lý do</th>
                <th className="text-left px-3 py-2 font-semibold hidden sm:table-cell">Người xóa</th>
                <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Xóa lúc</th>
                <th className="text-right px-3 py-2 font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pagedItems.map((it) => {
                const meta = ENTITY_META[it.entity_type] || { label: it.entity_type, icon: FileText, color: 'bg-gray-100 text-gray-700' };
                const Icon = meta.icon;
                return (
                  <tr key={it.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${meta.color}`}>
                        <Icon className="h-3 w-3" /> {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium max-w-[14rem]">
                      <button
                        type="button"
                        onClick={() => setDetailId(it.id)}
                        className="hover:text-blue-600 hover:underline text-left truncate max-w-full cursor-pointer text-gray-900"
                        title={it.entity_label}
                      >
                        {it.entity_label || '—'}
                      </button>
                    </td>
                    {showCompanyColumn && (
                      <td className="px-3 py-2 text-gray-600 text-xs hidden lg:table-cell max-w-[8rem] truncate" title={resolveTrashCompanyLabel(it.company_id, companies)}>
                        {resolveTrashCompanyLabel(it.company_id, companies)}
                      </td>
                    )}
                    <td className="px-3 py-2 max-w-[10rem] hidden md:table-cell">
                      {it.delete_reason ? (
                        <span className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5 inline-block truncate max-w-full" title={it.delete_reason}>
                          {it.delete_reason}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-xs hidden sm:table-cell">{it.deleter?.full_name || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap tabular-nums">{fmtDate(it.deleted_at)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => setDetailId(it.id)}
                          className="inline-flex items-center gap-0.5 px-2 py-1 rounded border border-blue-200 text-blue-700 hover:bg-blue-50 text-[11px] font-medium cursor-pointer"
                          title="Xem chi tiết"
                        >
                          <Eye className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRestore(it.id)}
                          disabled={busyId === it.id}
                          className="inline-flex items-center gap-0.5 px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium disabled:opacity-50 cursor-pointer"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePurge(it.id, it.entity_label)}
                          disabled={busyId === it.id}
                          className="inline-flex items-center gap-0.5 px-2 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50 text-[11px] font-medium disabled:opacity-50 cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TrashScrollTableShell>

      {confirmEmpty && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle className="h-6 w-6 text-red-600" />
              <h2 className="text-lg font-semibold">Dọn sạch thùng rác?</h2>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              Tất cả mục trong thùng rác sẽ bị xóa <strong>vĩnh viễn</strong>, không thể phục hồi.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmEmpty(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm"
              >
                Hủy
              </button>
              <button
                onClick={handleEmpty}
                disabled={busyId === 'all'}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50"
              >
                Dọn sạch
              </button>
            </div>
          </div>
        </div>
      )}

      <TrashDetailModal trashId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
