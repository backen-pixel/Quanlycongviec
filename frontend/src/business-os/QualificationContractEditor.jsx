import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  EyeOff,
  FileCheck2,
  History,
  Loader2,
  LockKeyhole,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import api from '../lib/api';

const MODE_OPTIONS = [
  { key: 'required', label: 'Bắt buộc', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  { key: 'optional', label: 'Tuỳ chọn', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  { key: 'hidden', label: 'Ẩn', className: 'border-slate-200 bg-slate-50 text-slate-600' },
];

const FIELD_TYPES = [
  ['text', 'Văn bản ngắn'],
  ['textarea', 'Văn bản dài'],
  ['number', 'Số'],
  ['date', 'Ngày'],
  ['select', 'Danh sách chọn'],
  ['boolean', 'Có / Không'],
];

const CHANGE_LABELS = {
  seed: 'Cấu hình ban đầu',
  update: 'Đổi Stage Contract',
  custom_field_created: 'Thêm trường tùy biến',
  custom_field_removed: 'Ẩn trường tùy biến',
  rollback: 'Khôi phục phiên bản',
};

function modeMap(contract) {
  return Object.fromEntries((contract?.fields || []).map((field) => [field.key, field.mode]));
}

export default function QualificationContractEditor({ companyId, canConfigure = false }) {
  const [contract, setContract] = useState(null);
  const [versions, setVersions] = useState([]);
  const [modes, setModes] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newField, setNewField] = useState({
    label: '',
    field_type: 'text',
    mode: 'optional',
    options: '',
    placeholder: '',
  });

  const applyContract = useCallback((nextContract) => {
    setContract(nextContract || null);
    setModes(modeMap(nextContract));
  }, []);

  const load = useCallback(async ({ showLoading = true } = {}) => {
    if (!companyId) return;
    if (showLoading) setLoading(true);
    setError('');
    try {
      const [contractResponse, versionsResponse] = await Promise.all([
        api.get('/business-os/qualification-contract', { params: { company_id: companyId } }),
        api.get('/business-os/qualification-contract/versions', { params: { company_id: companyId } }),
      ]);
      applyContract(contractResponse.data?.contract);
      setVersions(versionsResponse.data?.versions || []);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Không tải được cấu hình thông tin Qualification.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [applyContract, companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => (contract?.fields || []).reduce((result, field) => {
    const mode = modes[field.key] || field.mode;
    result[mode] = Number(result[mode] || 0) + 1;
    return result;
  }, { required: 0, optional: 0, hidden: 0 }), [contract?.fields, modes]);

  const updateMode = (field, mode) => {
    if (!canConfigure || field.system_required) return;
    setModes((current) => ({ ...current, [field.key]: mode }));
    setSuccess('');
  };

  const save = async () => {
    if (!companyId || !canConfigure) return;
    setBusy('save');
    setError('');
    setSuccess('');
    try {
      const fields = contract?.fields || [];
      const { data } = await api.put('/business-os/qualification-contract', {
        company_id: companyId,
        required_fields: fields.filter((field) => (modes[field.key] || field.mode) === 'required').map((field) => field.key),
        optional_fields: fields.filter((field) => (modes[field.key] || field.mode) === 'optional').map((field) => field.key),
      });
      applyContract(data?.contract);
      setSuccess('Đã áp dụng Stage Contract. Dữ liệu Lead cũ được giữ nguyên.');
      await load({ showLoading: false });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Không lưu được Stage Contract.');
    } finally {
      setBusy('');
    }
  };

  const createField = async (event) => {
    event.preventDefault();
    if (!newField.label.trim()) {
      setError('Vui lòng nhập tên trường mới.');
      return;
    }
    setBusy('create');
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post('/business-os/qualification-custom-fields', {
        company_id: companyId,
        label: newField.label.trim(),
        field_type: newField.field_type,
        mode: newField.mode,
        options: newField.field_type === 'select' ? newField.options : [],
        placeholder: newField.placeholder.trim() || null,
      });
      applyContract(data?.contract);
      setNewField({ label: '', field_type: 'text', mode: 'optional', options: '', placeholder: '' });
      setSuccess(`Đã thêm trường “${data?.field?.label || newField.label}”.`);
      await load({ showLoading: false });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Không tạo được trường tùy biến.');
    } finally {
      setBusy('');
    }
  };

  const removeField = async (field) => {
    if (!window.confirm(`Ẩn trường “${field.label}”? Giá trị cũ vẫn được giữ để có thể truy vết.`)) return;
    setBusy(`remove:${field.id}`);
    setError('');
    setSuccess('');
    try {
      const { data } = await api.delete(`/business-os/qualification-custom-fields/${field.id}`, {
        params: { company_id: companyId },
      });
      applyContract(data?.contract);
      setSuccess(`Đã ẩn trường “${field.label}”; dữ liệu cũ không bị xóa.`);
      await load({ showLoading: false });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Không ẩn được trường tùy biến.');
    } finally {
      setBusy('');
    }
  };

  const rollback = async (version) => {
    if (!window.confirm(`Khôi phục cách phân loại trường của phiên bản ${version}? Hệ thống sẽ tạo một phiên bản mới.`)) return;
    setBusy(`rollback:${version}`);
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post('/business-os/qualification-contract/rollback', {
        company_id: companyId,
        version,
      });
      applyContract(data?.contract);
      setSuccess(`Đã khôi phục từ phiên bản ${version} thành phiên bản ${data?.contract?.version}.`);
      await load({ showLoading: false });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Không khôi phục được Stage Contract.');
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-extrabold text-slate-950">Stage Contract · Qualification</h3>
            {contract?.version && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500">v{contract.version}</span>}
          </div>
          <p className="mt-1 text-xs text-slate-500">Cấu hình trường chặn chuyển Deal và tự thêm thông tin riêng cho từng công ty.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-extrabold">
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{counts.required} bắt buộc</span>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">{counts.optional} tuỳ chọn</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-500">{counts.hidden} ẩn</span>
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-xs font-semibold text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang tải Stage Contract…
        </div>
      ) : error && !contract ? (
        <div className="m-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      ) : (
        <>
          <div className="grid gap-px bg-slate-200 md:grid-cols-2 xl:grid-cols-4">
            {(contract?.fields || []).map((field) => {
              const selectedMode = modes[field.key] || field.mode;
              return (
                <div key={field.key} className="bg-white p-4">
                  <div className="flex min-h-10 items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-xs font-extrabold text-slate-900">{field.label}</p>
                        {field.custom && <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[8px] font-extrabold uppercase text-violet-600">Tùy biến</span>}
                      </div>
                      <p className="mt-1 font-mono text-[9px] text-slate-400">{field.key}</p>
                      {field.custom && <p className="mt-1 text-[9px] text-slate-400">{FIELD_TYPES.find(([key]) => key === field.field_type)?.[1]}</p>}
                    </div>
                    {field.system_required
                      ? <LockKeyhole className="h-4 w-4 shrink-0 text-slate-400" />
                      : field.custom && canConfigure
                        ? (
                          <button type="button" onClick={() => removeField(field)} disabled={!!busy} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Ẩn ${field.label}`}>
                            {busy === `remove:${field.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </button>
                        )
                        : selectedMode === 'hidden'
                          ? <EyeOff className="h-4 w-4 shrink-0 text-slate-400" />
                          : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-1">
                    {MODE_OPTIONS.map((option) => {
                      const selected = selectedMode === option.key;
                      const disabled = !canConfigure || field.system_required;
                      return (
                        <button key={option.key} type="button" disabled={disabled} onClick={() => updateMode(field, option.key)} className={`rounded-lg border px-1.5 py-2 text-[9px] font-extrabold transition disabled:cursor-not-allowed ${selected ? option.className : 'border-slate-100 bg-white text-slate-400 hover:bg-slate-50'} ${disabled && !selected ? 'opacity-35' : ''}`}>
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  {field.system_required && <p className="mt-2 text-[9px] leading-4 text-slate-400">Trường lõi được khóa để bảo đảm phân quyền và chuyển bước an toàn.</p>}
                </div>
              );
            })}
          </div>

          {canConfigure && (
            <form onSubmit={createField} className="border-t border-slate-200 bg-violet-50/35 px-5 py-5">
              <div className="flex items-center gap-2"><Plus className="h-4 w-4 text-violet-600" /><h4 className="text-xs font-extrabold text-slate-900">Thêm trường riêng của công ty</h4></div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <input value={newField.label} onChange={(event) => setNewField((current) => ({ ...current, label: event.target.value }))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-violet-400" placeholder="Tên trường, ví dụ: Loại công trình" />
                <select value={newField.field_type} onChange={(event) => setNewField((current) => ({ ...current, field_type: event.target.value }))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none">{FIELD_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
                <select value={newField.mode} onChange={(event) => setNewField((current) => ({ ...current, mode: event.target.value }))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none">{MODE_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select>
                {newField.field_type === 'select' ? (
                  <input value={newField.options} onChange={(event) => setNewField((current) => ({ ...current, options: event.target.value }))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none" placeholder="Lựa chọn, cách nhau dấu phẩy" />
                ) : (
                  <input value={newField.placeholder} onChange={(event) => setNewField((current) => ({ ...current, placeholder: event.target.value }))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none" placeholder="Gợi ý nhập (không bắt buộc)" />
                )}
                <button type="submit" disabled={!!busy} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-xs font-extrabold text-white hover:bg-violet-700 disabled:opacity-50">{busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Thêm trường</button>
              </div>
            </form>
          )}

          <div className="grid border-t border-slate-200 lg:grid-cols-[1fr_420px]">
            <div className="flex flex-col gap-3 bg-slate-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className={`text-[10px] leading-4 ${error ? 'text-red-600' : success ? 'text-emerald-700' : 'text-slate-500'}`}>
                {error || success || (canConfigure ? 'Ẩn trường chỉ đổi giao diện và validation; dữ liệu đã nhập không bị xoá.' : 'Bạn có quyền xem. Chỉ quản trị viên công ty được thay đổi cấu hình.')}
              </div>
              {canConfigure && (
                <button type="button" onClick={save} disabled={!!busy} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-extrabold text-white hover:bg-slate-800 disabled:opacity-50">{busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Áp dụng cấu hình</button>
              )}
            </div>
            <div className="border-t border-slate-200 bg-white px-5 py-4 lg:border-l lg:border-t-0">
              <div className="flex items-center gap-2"><History className="h-4 w-4 text-slate-500" /><h4 className="text-xs font-extrabold text-slate-900">Lịch sử phiên bản</h4></div>
              <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
                {versions.length ? versions.slice(0, 10).map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                    <div className="min-w-0"><p className="text-[10px] font-extrabold text-slate-700">v{item.version} · {CHANGE_LABELS[item.change_type] || item.change_type}</p><p className="mt-0.5 text-[9px] text-slate-400">{new Date(item.created_at).toLocaleString('vi-VN')}</p></div>
                    {canConfigure && item.version !== contract?.version && (
                      <button type="button" onClick={() => rollback(item.version)} disabled={!!busy} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[9px] font-bold text-slate-600 hover:border-blue-200 hover:text-blue-700 disabled:opacity-50">{busy === `rollback:${item.version}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Khôi phục</button>
                    )}
                  </div>
                )) : <p className="text-[10px] text-slate-400">Chưa có phiên bản đã lưu.</p>}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
