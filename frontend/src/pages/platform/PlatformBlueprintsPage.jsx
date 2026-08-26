import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FilePlus2,
  Plus,
  Rocket,
  Save,
  Trash2,
} from 'lucide-react';
import api from '../../lib/api';

const MODULE_OPTIONS = [
  ['business_os', 'Business OS'],
  ['crm', 'CRM'],
  ['tasks', 'Công việc'],
  ['projects', 'Dự án'],
  ['production', 'Sản xuất'],
  ['logistics', 'Vận chuyển & lắp đặt'],
  ['procurement', 'Mua hàng & kho'],
  ['customers', 'Khách hàng & bảo hành'],
  ['accounting', 'Tài chính & kế toán'],
  ['drive', 'Drive'],
  ['knowledge', 'Kiến thức'],
  ['ai_assistant', 'AI Agent'],
];

const DEPARTMENT_OPTIONS = [
  ['sales', 'Tư vấn (Sales)'],
  ['design', 'Thiết kế'],
  ['production', 'Sản xuất'],
  ['delivery', 'Vận chuyển & lắp đặt'],
  ['customer-care', 'Chăm sóc khách hàng'],
  ['accounting', 'Kế toán'],
];

const DEFAULT_PROCESSES = [
  {
    key: 'sales_lifecycle_v1',
    name: 'Vòng đời kinh doanh',
    stages_text: 'lead, qualification, deal, survey, design, quotation, negotiation, order',
  },
  {
    key: 'order_delivery_v1',
    name: 'Thực hiện đơn hàng',
    stages_text: 'project, production, quality_control, delivery, installation, handover, warranty',
  },
];

function blankDraft() {
  return {
    modules: ['business_os', 'crm', 'tasks', 'projects'],
    departments: ['sales', 'design', 'production', 'delivery'],
    processes: DEFAULT_PROCESSES.map((process) => ({ ...process })),
    release_notes: '',
  };
}

function draftFromVersion(version) {
  if (!version?.definition) return blankDraft();
  const definition = version.definition;
  return {
    modules: (definition.modules || []).filter((module) => module.enabled !== false).map((module) => module.key),
    departments: definition.department_templates || [],
    processes: (definition.processes || []).map((process) => ({
      key: process.key || '',
      name: process.name || '',
      stages_text: (process.stages || []).join(', '),
    })),
    release_notes: '',
  };
}

function versionStatus(version) {
  if (version.status === 'published') return { label: 'Đang phát hành', className: 'bg-green-50 text-green-700' };
  if (version.status === 'retired') return { label: 'Đã thay thế', className: 'bg-gray-100 text-gray-600' };
  return { label: 'Bản nháp', className: 'bg-amber-50 text-amber-700' };
}

export default function PlatformBlueprintsPage() {
  const [blueprints, setBlueprints] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(blankDraft);

  const load = useCallback(async ({ keepSelection = true } = {}) => {
    setLoading(true);
    try {
      const { data } = await api.get('/platform/blueprints', { params: { catalog: 1 } });
      const rows = data?.blueprints || [];
      setBlueprints(rows);
      setSelectedId((current) => (keepSelection && rows.some((item) => item.id === current) ? current : rows[0]?.id || ''));
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Không tải được danh mục Blueprint.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load({ keepSelection: false }); }, [load]);

  const selected = useMemo(
    () => blueprints.find((blueprint) => blueprint.id === selectedId) || null,
    [blueprints, selectedId],
  );

  useEffect(() => {
    setDraft(draftFromVersion(selected?.versions?.[0]));
  }, [selectedId]);

  const toggleChoice = (field, key) => {
    setDraft((previous) => ({
      ...previous,
      [field]: previous[field].includes(key)
        ? previous[field].filter((item) => item !== key)
        : [...previous[field], key],
    }));
  };

  const updateProcess = (index, field, value) => {
    setDraft((previous) => ({
      ...previous,
      processes: previous.processes.map((process, processIndex) => (
        processIndex === index ? { ...process, [field]: value } : process
      )),
    }));
  };

  const removeProcess = (index) => {
    setDraft((previous) => ({
      ...previous,
      processes: previous.processes.filter((_, processIndex) => processIndex !== index),
    }));
  };

  const createVersion = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const definition = {
        schema_version: 1,
        modules: draft.modules.map((key) => ({ key, enabled: true })),
        department_templates: draft.departments,
        processes: draft.processes.map((process) => ({
          key: process.key.trim(),
          name: process.name.trim(),
          stages: process.stages_text.split(',').map((stage) => stage.trim()).filter(Boolean),
        })),
        operating_kernel: {
          record: true,
          task: true,
          sla: true,
          kpi: true,
          automation: true,
          audit: true,
          ai_requires_permission: true,
        },
      };
      await api.post(`/platform/blueprints/${selected.id}/versions`, {
        definition,
        release_notes: draft.release_notes,
      });
      setSuccess('Đã tạo phiên bản nháp mới.');
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Không tạo được phiên bản.');
    } finally {
      setSaving(false);
    }
  };

  const publishVersion = async (version) => {
    if (!selected || version.status === 'published') return;
    if (!confirm(`Phát hành Blueprint ${selected.name} phiên bản ${version.version_number}?`)) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.post(`/platform/blueprints/${selected.id}/versions/${version.id}/publish`);
      setSuccess(`Đã phát hành phiên bản ${version.version_number}.`);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Không phát hành được phiên bản.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <Copy className="h-5 w-5 text-teal-600" /> Business Blueprint
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">Quản trị bộ mẫu dùng để nhân bản cấu hình cho nhiều hệ sinh thái.</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700">
          <Plus className="h-4 w-4" /> Tạo Blueprint
        </button>
      </div>

      {error && <div className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {success && <div className="flex items-start gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{success}</div>}

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-500">Đang tải Blueprint…</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-2">
            {blueprints.length === 0 && <div className="rounded-2xl border border-dashed p-5 text-sm text-gray-500">Chưa có Blueprint.</div>}
            {blueprints.map((blueprint) => {
              const published = blueprint.versions?.find((version) => version.status === 'published');
              return (
                <button
                  key={blueprint.id}
                  type="button"
                  onClick={() => setSelectedId(blueprint.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === blueprint.id ? 'border-teal-300 bg-teal-50' : 'bg-white hover:border-gray-300'}`}
                >
                  <div className="font-semibold text-gray-900">{blueprint.name}</div>
                  <div className="mt-1 text-xs text-gray-500">{blueprint.blueprint_key}</div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-gray-500">{blueprint.industry}</span>
                    <span className={published ? 'text-green-700' : 'text-amber-700'}>{published ? `v${published.version_number}` : 'Chưa phát hành'}</span>
                  </div>
                </button>
              );
            })}
          </aside>

          {selected && (
            <main className="space-y-4">
              <section className="rounded-2xl border bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{selected.name}</h3>
                    <p className="mt-1 max-w-3xl text-sm text-gray-500">{selected.description || 'Chưa có mô tả.'}</p>
                  </div>
                  <span className={`rounded-lg px-2.5 py-1 text-xs font-medium ${selected.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {selected.is_active ? 'Đang sử dụng' : 'Tạm dừng'}
                  </span>
                </div>
              </section>

              <section className="rounded-2xl border bg-white p-5 space-y-5">
                <div>
                  <h3 className="flex items-center gap-2 font-semibold"><FilePlus2 className="h-4 w-4 text-teal-600" /> Soạn phiên bản mới</h3>
                  <p className="mt-1 text-xs text-gray-500">Bản nháp không ảnh hưởng tenant cho đến khi được phát hành và áp dụng.</p>
                </div>

                <div>
                  <div className="mb-2 text-sm font-medium text-gray-800">Module được khởi tạo</div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {MODULE_OPTIONS.map(([key, label]) => (
                      <label key={key} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${draft.modules.includes(key) ? 'border-teal-200 bg-teal-50 text-teal-800' : 'text-gray-600'}`}>
                        <input type="checkbox" checked={draft.modules.includes(key)} onChange={() => toggleChoice('modules', key)} />{label}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-sm font-medium text-gray-800">Phòng ban mẫu</div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {DEPARTMENT_OPTIONS.map(([key, label]) => (
                      <label key={key} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${draft.departments.includes(key) ? 'border-blue-200 bg-blue-50 text-blue-800' : 'text-gray-600'}`}>
                        <input type="checkbox" checked={draft.departments.includes(key)} onChange={() => toggleChoice('departments', key)} />{label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-gray-800">Quy trình mẫu</div>
                    <button type="button" onClick={() => setDraft((previous) => ({ ...previous, processes: [...previous.processes, { key: '', name: '', stages_text: '' }] }))} className="inline-flex items-center gap-1 text-xs font-medium text-teal-700">
                      <Plus className="h-3.5 w-3.5" /> Thêm quy trình
                    </button>
                  </div>
                  {draft.processes.map((process, index) => (
                    <div key={index} className="grid gap-2 rounded-xl border p-3 md:grid-cols-[180px_220px_minmax(0,1fr)_36px]">
                      <input value={process.key} onChange={(event) => updateProcess(index, 'key', event.target.value)} className="rounded-lg border px-3 py-2 text-sm" placeholder="process_key" />
                      <input value={process.name} onChange={(event) => updateProcess(index, 'name', event.target.value)} className="rounded-lg border px-3 py-2 text-sm" placeholder="Tên quy trình" />
                      <input value={process.stages_text} onChange={(event) => updateProcess(index, 'stages_text', event.target.value)} className="rounded-lg border px-3 py-2 text-sm" placeholder="lead, qualification, deal" />
                      <button type="button" onClick={() => removeProcess(index)} className="flex h-9 w-9 items-center justify-center rounded-lg text-red-500 hover:bg-red-50" aria-label="Xóa quy trình"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>

                <textarea value={draft.release_notes} onChange={(event) => setDraft((previous) => ({ ...previous, release_notes: event.target.value }))} rows={3} className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Nội dung thay đổi của phiên bản…" />

                <div className="flex justify-end">
                  <button type="button" onClick={createVersion} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
                    <Save className="h-4 w-4" /> {saving ? 'Đang lưu…' : 'Lưu bản nháp mới'}
                  </button>
                </div>
              </section>

              <section className="rounded-2xl border bg-white p-5">
                <h3 className="font-semibold">Lịch sử phiên bản</h3>
                <div className="mt-4 space-y-2">
                  {(selected.versions || []).map((version) => {
                    const status = versionStatus(version);
                    return (
                      <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
                        <div>
                          <div className="font-medium text-gray-900">Phiên bản {version.version_number}</div>
                          <div className="mt-1 text-xs text-gray-500">{version.release_notes || 'Không có ghi chú phát hành.'}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-lg px-2.5 py-1 text-xs font-medium ${status.className}`}>{status.label}</span>
                          {version.status === 'draft' && (
                            <button type="button" onClick={() => publishVersion(version)} disabled={saving} className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50">
                              <Rocket className="h-3.5 w-3.5" /> Phát hành
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </main>
          )}
        </div>
      )}

      {showCreate && <CreateBlueprintModal onClose={() => setShowCreate(false)} onCreated={async (blueprint) => { setShowCreate(false); await load({ keepSelection: false }); setSelectedId(blueprint.id); }} />}
    </div>
  );
}

function CreateBlueprintModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', blueprint_key: '', industry: 'general', description: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const slugify = (value) => String(value || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/platform/blueprints', form);
      await onCreated(data.blueprint);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Không tạo được Blueprint.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(event) => event.stopPropagation()} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold">Tạo Business Blueprint</h2>
        {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="mb-1 block text-sm font-medium">Tên Blueprint</label>
          <input
            value={form.name}
            onChange={(event) => setForm((previous) => ({
              ...previous,
              name: event.target.value,
              blueprint_key: !previous.blueprint_key || previous.blueprint_key === slugify(previous.name) ? slugify(event.target.value) : previous.blueprint_key,
            }))}
            className="w-full rounded-xl border px-3 py-2.5 text-sm"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Blueprint key</label>
          <input value={form.blueprint_key} onChange={(event) => setForm((previous) => ({ ...previous, blueprint_key: event.target.value }))} className="w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="cabinet-business-os" required />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Ngành</label>
          <input value={form.industry} onChange={(event) => setForm((previous) => ({ ...previous, industry: event.target.value }))} className="w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="cabinet_manufacturing" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Mô tả</label>
          <textarea value={form.description} onChange={(event) => setForm((previous) => ({ ...previous, description: event.target.value }))} rows={3} className="w-full rounded-xl border px-3 py-2.5 text-sm" />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Hủy</button>
          <button type="submit" disabled={saving} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? 'Đang tạo…' : 'Tạo Blueprint'}
          </button>
        </div>
      </form>
    </div>
  );
}
