/**
 * Procurement Lite — tab Vật tư / Mua hàng trên Project SX
 */
import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Loader2, Plus, Trash2, X, Package, AlertTriangle } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Nháp' },
  { value: 'requested', label: 'Đã yêu cầu' },
  { value: 'confirmed', label: 'NCC xác nhận' },
  { value: 'received', label: 'Đã nhận' },
  { value: 'qc_pass', label: 'QC đạt' },
  { value: 'qc_fail', label: 'QC lỗi' },
  { value: 'delayed', label: 'Trễ' },
  { value: 'done', label: 'Hoàn tất' },
];

const QC_OPTIONS = [
  { value: '', label: '—' },
  { value: 'pending', label: 'Chờ QC' },
  { value: 'pass', label: 'Đạt' },
  { value: 'fail', label: 'Lỗi' },
];

const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s.label]));

function statusBadgeClass(status) {
  if (status === 'delayed' || status === 'qc_fail') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'done' || status === 'qc_pass') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'confirmed' || status === 'received') return 'bg-sky-50 text-sky-700 border-sky-200';
  return 'bg-gray-50 text-gray-600 border-gray-200';
}

const emptyForm = () => ({
  item_name: '',
  description: '',
  source_type: 'external',
  supplier_id: '',
  requested_date: '',
  supplier_committed_date: '',
  expected_price: '',
  status: 'draft',
  qc_status: '',
  owner_user_id: '',
  delay_reason: '',
  next_action: '',
});

export default function ProjectProcurementTab({
  projectId,
  companyId = null,
  users = [],
  readOnly = false,
}) {
  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setErr('');
    try {
      const [reqRes, supRes] = await Promise.all([
        api.get('/procurement/requests', { params: { project_id: projectId } }),
        api.get('/procurement/suppliers', {
          params: companyId ? { company_id: companyId } : {},
        }),
      ]);
      setRows(Array.isArray(reqRes.data) ? reqRes.data : []);
      setSuppliers(Array.isArray(supRes.data) ? supRes.data : []);
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Lỗi tải vật tư / mua hàng');
      setRows([]);
    }
    setLoading(false);
  }, [projectId, companyId]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
    setMsg('');
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm({
      item_name: row.item_name || '',
      description: row.description || '',
      source_type: row.source_type || 'external',
      supplier_id: row.supplier_id || '',
      requested_date: row.requested_date || '',
      supplier_committed_date: row.supplier_committed_date || '',
      expected_price: row.expected_price != null ? String(row.expected_price) : '',
      status: row.status || 'draft',
      qc_status: row.qc_status || '',
      owner_user_id: row.owner_user_id || '',
      delay_reason: row.delay_reason || '',
      next_action: row.next_action || '',
    });
    setShowForm(true);
    setMsg('');
  };

  const saveRow = async (e) => {
    e?.preventDefault?.();
    if (!form.item_name.trim()) {
      setErr('Nhập tên hạng mục');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const payload = {
        project_id: projectId,
        item_name: form.item_name.trim(),
        description: form.description.trim() || null,
        source_type: form.source_type,
        supplier_id: form.supplier_id || null,
        requested_date: form.requested_date || null,
        supplier_committed_date: form.supplier_committed_date || null,
        expected_price: form.expected_price === '' ? null : form.expected_price,
        status: form.status,
        qc_status: form.qc_status || null,
        owner_user_id: form.owner_user_id || null,
        delay_reason: form.delay_reason.trim() || null,
        next_action: form.next_action.trim() || null,
      };
      if (editingId) {
        await api.put(`/procurement/requests/${editingId}`, payload);
        setMsg('Đã cập nhật hạng mục');
      } else {
        await api.post('/procurement/requests', payload);
        setMsg('Đã thêm hạng mục');
      }
      setShowForm(false);
      await load();
    } catch (ex) {
      setErr(ex.response?.data?.error || ex.message || 'Lỗi lưu');
    }
    setSaving(false);
  };

  const patchStatus = async (id, patch) => {
    setErr('');
    try {
      await api.put(`/procurement/requests/${id}`, patch);
      await load();
    } catch (ex) {
      setErr(ex.response?.data?.error || ex.message || 'Lỗi cập nhật');
    }
  };

  const removeRow = async (id) => {
    if (!window.confirm('Xóa hạng mục này?')) return;
    setDeletingId(id);
    try {
      await api.delete(`/procurement/requests/${id}`);
      setMsg('Đã xóa');
      await load();
    } catch (ex) {
      setErr(ex.response?.data?.error || ex.message || 'Lỗi xóa');
    }
    setDeletingId(null);
  };

  const createSupplier = async (e) => {
    e?.preventDefault?.();
    if (!supplierName.trim()) return;
    setSavingSupplier(true);
    setErr('');
    try {
      const { data } = await api.post('/procurement/suppliers', {
        name: supplierName.trim(),
        company_id: companyId || undefined,
      });
      setSuppliers((prev) => [...prev, data].sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi')));
      setForm((f) => ({ ...f, supplier_id: data.id }));
      setSupplierName('');
      setShowSupplierForm(false);
      setMsg('Đã thêm nhà cung cấp');
    } catch (ex) {
      setErr(ex.response?.data?.error || ex.message || 'Lỗi thêm NCC');
    }
    setSavingSupplier(false);
  };

  const delayedCount = rows.filter((r) => r.status === 'delayed' || r.status === 'qc_fail').length;
  const doneCount = rows.filter((r) => r.status === 'done' || r.status === 'qc_pass').length;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Đang tải vật tư / mua hàng…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
            <Package className="w-4 h-4 text-teal-600" />
            Vật tư / Mua hàng
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {rows.length} hạng mục · {doneCount} xong
            {delayedCount > 0 && (
              <span className="text-red-600 ml-1 inline-flex items-center gap-0.5">
                · <AlertTriangle className="w-3 h-3" /> {delayedCount} cần xử lý
              </span>
            )}
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700"
          >
            <Plus className="w-4 h-4" /> Thêm hạng mục
          </button>
        )}
      </div>

      {msg && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{msg}</p>}
      {err && <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</p>}

      {showForm && !readOnly && (
        <form onSubmit={saveRow} className="border border-teal-100 rounded-xl bg-teal-50/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-800">
              {editingId ? 'Sửa hạng mục' : 'Thêm hạng mục mới'}
            </p>
            <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs text-gray-600 sm:col-span-2">
              Tên hạng mục *
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                value={form.item_name}
                onChange={(e) => setForm({ ...form, item_name: e.target.value })}
                placeholder="VD: Bản lề Blum 110°"
                required
              />
            </label>
            <label className="block text-xs text-gray-600">
              Nguồn
              <select
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                value={form.source_type}
                onChange={(e) => setForm({ ...form, source_type: e.target.value })}
              >
                <option value="external">Mua ngoài</option>
                <option value="internal">Nội bộ / hệ sinh thái</option>
              </select>
            </label>
            <label className="block text-xs text-gray-600">
              Nhà cung cấp
              <div className="mt-1 flex gap-1">
                <select
                  className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white"
                  value={form.supplier_id}
                  onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                >
                  <option value="">— Chưa chọn —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowSupplierForm((v) => !v)}
                  className="px-2 border rounded-lg bg-white text-xs text-teal-700 hover:bg-teal-50"
                  title="Thêm NCC nhanh"
                >
                  +
                </button>
              </div>
            </label>
            {showSupplierForm && (
              <div className="sm:col-span-2 flex gap-2 items-end">
                <label className="block text-xs text-gray-600 flex-1">
                  Tên NCC mới
                  <input
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="Công ty / cửa hàng…"
                  />
                </label>
                <button
                  type="button"
                  disabled={savingSupplier || !supplierName.trim()}
                  onClick={createSupplier}
                  className="px-3 py-2 text-sm rounded-lg bg-white border border-teal-200 text-teal-700 disabled:opacity-50"
                >
                  {savingSupplier ? '…' : 'Lưu NCC'}
                </button>
              </div>
            )}
            <label className="block text-xs text-gray-600">
              Ngày yêu cầu
              <input
                type="date"
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                value={form.requested_date}
                onChange={(e) => setForm({ ...form, requested_date: e.target.value })}
              />
            </label>
            <label className="block text-xs text-gray-600">
              NCC cam kết
              <input
                type="date"
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                value={form.supplier_committed_date}
                onChange={(e) => setForm({ ...form, supplier_committed_date: e.target.value })}
              />
            </label>
            <label className="block text-xs text-gray-600">
              Giá dự kiến
              <input
                type="number"
                min="0"
                step="1000"
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                value={form.expected_price}
                onChange={(e) => setForm({ ...form, expected_price: e.target.value })}
              />
            </label>
            <label className="block text-xs text-gray-600">
              Trạng thái
              <select
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-gray-600">
              QC
              <select
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                value={form.qc_status}
                onChange={(e) => setForm({ ...form, qc_status: e.target.value })}
              >
                {QC_OPTIONS.map((s) => (
                  <option key={s.value || 'empty'} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-gray-600">
              Owner
              <select
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                value={form.owner_user_id}
                onChange={(e) => setForm({ ...form, owner_user_id: e.target.value })}
              >
                <option value="">—</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name || u.email || u.id}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-gray-600 sm:col-span-2">
              Lý do trễ
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                value={form.delay_reason}
                onChange={(e) => setForm({ ...form, delay_reason: e.target.value })}
                placeholder="VD: NCC chưa có hàng"
              />
            </label>
            <label className="block text-xs text-gray-600 sm:col-span-2">
              Next Action
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                value={form.next_action}
                onChange={(e) => setForm({ ...form, next_action: e.target.value })}
                placeholder="VD: Gọi NCC xác nhận lại ngày 20/07"
              />
            </label>
            <label className="block text-xs text-gray-600 sm:col-span-2">
              Mô tả
              <textarea
                rows={2}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm rounded-lg border bg-white">
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-teal-600 text-white disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editingId ? 'Lưu' : 'Thêm'}
            </button>
          </div>
        </form>
      )}

      {rows.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-500 border border-dashed rounded-xl">
          Chưa có hạng mục mua hàng. Thêm vật tư / dịch vụ cần theo dõi cho dự án này.
        </div>
      ) : (
        <div className="overflow-x-auto border rounded-xl">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">Hạng mục</th>
                <th className="px-3 py-2 font-medium">Nguồn / NCC</th>
                <th className="px-3 py-2 font-medium">Cam kết</th>
                <th className="px-3 py-2 font-medium">Trạng thái</th>
                <th className="px-3 py-2 font-medium">QC</th>
                <th className="px-3 py-2 font-medium">Owner</th>
                <th className="px-3 py-2 font-medium">Next Action</th>
                {!readOnly && <th className="px-3 py-2 font-medium w-20" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50/80">
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      className="text-left font-medium text-gray-800 hover:text-teal-700"
                      onClick={() => !readOnly && openEdit(row)}
                    >
                      {row.item_name}
                    </button>
                    {row.delay_reason && (
                      <p className="text-[11px] text-red-600 mt-0.5">Trễ: {row.delay_reason}</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">
                    <span className="text-[11px] uppercase tracking-wide text-gray-400">
                      {row.source_type === 'internal' ? 'Nội bộ' : 'Ngoài'}
                    </span>
                    <div>{row.supplier?.name || '—'}</div>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                    {row.supplier_committed_date || '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    {readOnly ? (
                      <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs ${statusBadgeClass(row.status)}`}>
                        {STATUS_LABEL[row.status] || row.status}
                      </span>
                    ) : (
                      <select
                        className={`text-xs border rounded-lg px-2 py-1 ${statusBadgeClass(row.status)}`}
                        value={row.status}
                        onChange={(e) => patchStatus(row.id, { status: e.target.value })}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {readOnly ? (
                      <span className="text-xs text-gray-600">{row.qc_status || '—'}</span>
                    ) : (
                      <select
                        className="text-xs border rounded-lg px-2 py-1 bg-white"
                        value={row.qc_status || ''}
                        onChange={(e) => patchStatus(row.id, { qc_status: e.target.value || null })}
                      >
                        {QC_OPTIONS.map((s) => (
                          <option key={s.value || 'empty'} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                    {row.owner?.full_name || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 max-w-[180px]">
                    <span className="line-clamp-2">{row.next_action || '—'}</span>
                  </td>
                  {!readOnly && (
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        disabled={deletingId === row.id}
                        onClick={() => removeRow(row.id)}
                        className="text-gray-400 hover:text-red-600 disabled:opacity-40"
                        title="Xóa"
                      >
                        {deletingId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
