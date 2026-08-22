import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { AlertTriangle, Plus, Pencil, Trash2, Globe, Save, Loader2, Star, Search, Clock } from 'lucide-react';
import { staffNameMatchesQuery } from '../lib/utils';

const SOURCE_KIND_OPTIONS = [
  { value: 'customer_request', label: 'Phát sinh từ khách hàng' },
  { value: 'employee_error', label: 'Lỗi từ nhân viên' },
];

const STAFF_ROLE_OPTIONS = [
  { value: 'primary', label: 'Chịu trách nhiệm chính' },
  { value: 'executor', label: 'Người thực hiện' },
  { value: 'observer', label: 'Người quan sát' },
  { value: 'manager', label: 'Quản lý' },
];

const SLA_MODE_OPTIONS = [
  { value: 'same_day', label: 'Trong ngày (đến giờ deadline xưởng)' },
  { value: 'noon_cutoff', label: 'Mốc giờ → ngày làm việc sau' },
  { value: 'working_days', label: 'Cộng N ngày làm việc' },
];

const EMPTY_PHAT_FORM = {
  name: '',
  sla_mode: 'same_day',
  sla_days: 1,
  cutoff_time: '12:00',
};

function slaModeLabel(mode) {
  return SLA_MODE_OPTIONS.find((o) => o.value === mode)?.label || mode;
}

function cutoffInputValue(raw) {
  const s = String(raw || '').slice(0, 5);
  return /^\d{2}:\d{2}$/.test(s) ? s : '12:00';
}

function roleBadgeClass(role) {
  if (role === 'primary') return 'bg-amber-50 border-amber-300 text-amber-900';
  if (role === 'manager') return 'bg-violet-50 border-violet-200 text-violet-800';
  if (role === 'observer') return 'bg-slate-50 border-slate-200 text-slate-700';
  return 'bg-emerald-50 border-emerald-200 text-emerald-800';
}

export default function SharedWorkspaceErrorTypesPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);

  const [companies, setCompanies] = useState([]);
  const [types, setTypes] = useState([]);
  const [phatKinds, setPhatKinds] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingStaffId, setSavingStaffId] = useState('');
  const [staffSearch, setStaffSearch] = useState('');

  const [form, setForm] = useState({ name: '', source_kind: 'employee_error' });
  const [editing, setEditing] = useState(null);
  const [phatForm, setPhatForm] = useState(EMPTY_PHAT_FORM);
  const [editingPhat, setEditingPhat] = useState(null);
  const [expandedId, setExpandedId] = useState('');
  const [staffDraft, setStaffDraft] = useState({}); // typeId -> { [userId]: role }

  useEffect(() => {
    api
      .get('/companies')
      .then((r) => {
        const cos = r.data?.companies || r.data || [];
        setCompanies(Array.isArray(cos) ? cos : []);
      })
      .catch(() => setCompanies([]));
  }, []);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [typeRes, userRes, kindRes] = await Promise.all([
        api.get('/crm/error-types', { params: { include_inactive: '1' } }),
        api.get('/users'),
        api.get('/crm/phat-sinh-kinds', { params: { include_inactive: '1' } }),
      ]);
      const list = typeRes.data?.error_types || [];
      setTypes(list);
      setPhatKinds(kindRes.data?.phat_sinh_kinds || []);
      const us = userRes.data?.users || userRes.data || [];
      const byId = new Map();
      for (const u of Array.isArray(us) ? us : []) {
        if (u?.is_active === false || !u?.id) continue;
        byId.set(String(u.id), u);
      }
      for (const t of list) {
        for (const s of t.staff || []) {
          const id = String(s.user_id || s.user?.id || '');
          if (!id || byId.has(id)) continue;
          if (s.user) byId.set(id, s.user);
        }
      }
      setUsers([...byId.values()]);
      const draft = {};
      for (const t of list) {
        const map = {};
        for (const s of t.staff || []) {
          map[String(s.user_id)] = s.role || 'executor';
        }
        draft[String(t.id)] = map;
      }
      setStaffDraft(draft);
    } catch {
      setTypes([]);
      setPhatKinds([]);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const companyLabel = (id) => {
    if (!id) return 'Chung toàn hệ thống';
    return companies.find((c) => String(c.id) === String(id))?.name || id;
  };

  const saveType = async (e) => {
    e?.preventDefault();
    const name = (editing ? editing.name : form.name).trim();
    if (!name) {
      alert('Nhập tên loại lỗi');
      return;
    }
    const source_kind = editing ? editing.source_kind : form.source_kind;
    try {
      if (editing?.id) {
        await api.put(`/crm/error-types/${editing.id}`, { name, source_kind });
      } else {
        await api.post('/crm/error-types', { name, source_kind });
      }
      setEditing(null);
      setForm({ name: '', source_kind: 'employee_error' });
      await load();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Không lưu được loại lỗi');
    }
  };

  const deleteType = async (t) => {
    if (!confirm(`Xóa loại lỗi «${t.name}»?`)) return;
    try {
      await api.delete(`/crm/error-types/${t.id}`);
      await load();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Không xóa được');
    }
  };

  const phatDraft = editingPhat || phatForm;

  const savePhatKind = async (e) => {
    e?.preventDefault();
    const name = String(phatDraft.name || '').trim();
    if (!name) {
      alert('Nhập tên loại phát sinh');
      return;
    }
    const payload = {
      name,
      sla_mode: phatDraft.sla_mode,
      sla_days: Number(phatDraft.sla_days) || 1,
      cutoff_time: phatDraft.cutoff_time,
    };
    try {
      if (editingPhat?.id) {
        await api.put(`/crm/phat-sinh-kinds/${editingPhat.id}`, payload);
      } else {
        await api.post('/crm/phat-sinh-kinds', payload);
      }
      setEditingPhat(null);
      setPhatForm(EMPTY_PHAT_FORM);
      await load();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Không lưu được loại phát sinh');
    }
  };

  const deletePhatKind = async (k) => {
    if (!confirm(`Xóa loại phát sinh «${k.name}»?`)) return;
    try {
      await api.delete(`/crm/phat-sinh-kinds/${k.id}`);
      await load();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Không xóa được');
    }
  };

  const toggleStaff = (typeId, userId) => {
    const key = String(typeId);
    const uid = String(userId);
    setStaffDraft((prev) => {
      const current = { ...(prev[key] || {}) };
      if (current[uid]) delete current[uid];
      else current[uid] = 'executor';
      return { ...prev, [key]: current };
    });
  };

  const setStaffRole = (typeId, userId, role) => {
    const key = String(typeId);
    const uid = String(userId);
    setStaffDraft((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [uid]: role },
    }));
  };

  const saveStaff = async (typeId) => {
    const map = staffDraft[String(typeId)] || {};
    const staff = Object.entries(map).map(([user_id, role]) => ({ user_id, role }));
    setSavingStaffId(String(typeId));
    try {
      await api.put(`/crm/error-types/${typeId}/staff`, { staff });
      await load();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Không lưu được nhân viên');
    } finally {
      setSavingStaffId('');
    }
  };

  const userList = useMemo(
    () => (users || []).slice().sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''), 'vi')),
    [users],
  );

  const usersVisibleFor = (selectedMap) => {
    const q = staffSearch.trim();
    const selected = [];
    const rest = [];
    for (const u of userList) {
      const id = String(u.id);
      const isSel = !!selectedMap[id];
      const uidCompany = u.company_id || u.department?.company_id || null;
      const matches = !q
        || staffNameMatchesQuery(u.full_name, q)
        || String(u.email || '').toLowerCase().includes(q.toLowerCase())
        || String(companyLabel(uidCompany) || '').toLowerCase().includes(q.toLowerCase());
      if (isSel) {
        selected.push(u);
        continue;
      }
      if (!matches) continue;
      rest.push(u);
    }
    return [...selected, ...rest];
  };

  if (!isAdmin) {
    return (
      <div className="p-6 text-sm text-gray-600">Chỉ admin được cấu hình loại lỗi và hạn phát sinh Không gian chung.</div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
        <div>
          <h1 className="text-lg font-bold text-gray-900">Loại lỗi & hạn phát sinh</h1>
          <p className="text-xs text-gray-600 mt-0.5 max-w-2xl leading-snug">
            Dùng chung cả hệ sinh thái (mọi công ty). Đặt tên loại lỗi, gán nhân viên phụ trách,
            và cấu hình loại việc kèm hạn — form giao việc sẽ tự điền.
          </p>
        </div>
      </div>

      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 shadow-sm flex items-start gap-2">
        <Globe className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
        <p className="text-xs text-emerald-900 leading-snug">
          Cài đặt này dùng chung cho toàn hệ sinh thái — không tách theo từng công ty.
          Nhân viên gán bên dưới cũng áp dụng khi giao việc ở mọi công ty.
        </p>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900 mb-3">Tên các loại lỗi</h2>
        <form onSubmit={saveType} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-4 items-end">
          <div className="lg:col-span-2">
            <label className="text-[10px] text-gray-500">Tên loại *</label>
            <input
              value={editing ? editing.name : form.name}
              onChange={(e) => (editing
                ? setEditing((c) => ({ ...c, name: e.target.value }))
                : setForm((f) => ({ ...f, name: e.target.value })))}
              className="w-full border rounded-lg px-2 py-1.5 text-sm"
              placeholder="VD: Lỗi từ nhân viên"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500">Nhóm nguồn</label>
            <select
              value={editing ? editing.source_kind : form.source_kind}
              onChange={(e) => (editing
                ? setEditing((c) => ({ ...c, source_kind: e.target.value }))
                : setForm((f) => ({ ...f, source_kind: e.target.value })))}
              className="w-full border rounded-lg px-2 py-1.5 text-sm"
            >
              {SOURCE_KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="h-9 px-4 bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 cursor-pointer">
              {editing ? 'Cập nhật' : <><Plus className="h-4 w-4 inline" /> Thêm</>}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="h-9 px-3 border rounded-lg text-sm cursor-pointer"
              >
                Hủy
              </button>
            )}
          </div>
        </form>

        {loading ? (
          <p className="text-xs text-gray-500 flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải…</p>
        ) : (
          <div className="space-y-3">
            {types.map((t) => {
              const map = staffDraft[String(t.id)] || {};
              const selectedCount = Object.keys(map).length;
              const primaryCount = Object.values(map).filter((r) => r === 'primary').length;
              const expanded = String(expandedId) === String(t.id);
              return (
                <div key={t.id} className="rounded-lg border border-rose-100 bg-rose-50/30 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-gray-900 min-w-0">
                      {t.name}
                      {t.slug ? (
                        <span className="ml-1.5 text-[10px] font-medium text-gray-500">mặc định</span>
                      ) : null}
                    </p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-rose-100 text-rose-700">
                      {SOURCE_KIND_OPTIONS.find((o) => o.value === t.source_kind)?.label || t.source_kind}
                    </span>
                    {selectedCount > 0 && (
                      <span className="text-[10px] font-medium text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">
                        {primaryCount} chính · {selectedCount} NV
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedId(expanded ? '' : t.id);
                          setStaffSearch('');
                        }}
                        className="text-[11px] font-semibold text-rose-800 border border-rose-200 rounded-lg px-2 py-1 bg-white hover:bg-rose-50 cursor-pointer"
                      >
                        {expanded ? 'Thu gọn NV' : 'Gán nhân viên'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing({
                          id: t.id,
                          name: t.name,
                          source_kind: t.source_kind || 'employee_error',
                        })}
                        className="p-1.5 text-gray-500 hover:text-blue-600 cursor-pointer"
                        title="Sửa tên"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {!t.slug && (
                        <button
                          type="button"
                          onClick={() => deleteType(t)}
                          className="p-1.5 text-gray-500 hover:text-red-600 cursor-pointer"
                          title="Xóa"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-3 bg-white/80 rounded-lg border border-rose-100 p-3 space-y-2">
                      <p className="text-[11px] text-gray-600">
                        Tick nhân viên rồi chọn vai trò. Có thể nhiều người <strong>chịu trách nhiệm chính</strong>.
                        Danh sách nhân viên là toàn hệ sinh thái.
                      </p>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                          value={staffSearch}
                          onChange={(e) => setStaffSearch(e.target.value)}
                          placeholder="Tìm nhân viên theo tên, email, công ty…"
                          className="w-full h-8 pl-8 pr-2 border border-rose-200 rounded-lg text-xs bg-white placeholder:text-slate-400"
                        />
                      </div>
                      {(() => {
                        const visible = usersVisibleFor(map);
                        if (!visible.length) {
                          return (
                            <p className="text-xs text-gray-500">
                              {staffSearch.trim()
                                ? 'Không tìm thấy nhân viên khớp.'
                                : 'Chưa có nhân viên. Gõ tên để tìm trong hệ sinh thái.'}
                            </p>
                          );
                        }
                        return (
                        <div className="max-h-80 overflow-y-auto divide-y divide-rose-50">
                          {visible.map((u) => {
                            const checked = !!map[String(u.id)];
                            const role = map[String(u.id)] || 'executor';
                            const uidCompany = u.company_id || u.department?.company_id || null;
                            const coName = companyLabel(uidCompany);
                            return (
                              <div
                                key={u.id}
                                className={`flex items-center gap-2 px-1.5 py-1.5 text-xs ${checked ? roleBadgeClass(role) : ''}`}
                              >
                                <label className="inline-flex items-center gap-1.5 cursor-pointer min-w-0 flex-1">
                                  <input
                                    type="checkbox"
                                    className="rounded border-gray-300 text-rose-600"
                                    checked={checked}
                                    onChange={() => toggleStaff(t.id, u.id)}
                                  />
                                  <span className="truncate min-w-0">
                                    {u.full_name || u.email}
                                    {role === 'primary' ? <Star className="h-3 w-3 inline ml-1 text-amber-500" /> : null}
                                    {coName && coName !== 'Chung toàn hệ thống' && (
                                      <span className="ml-1 text-[10px] font-medium text-slate-500">
                                        · {coName}
                                      </span>
                                    )}
                                  </span>
                                </label>
                                {checked && (
                                  <select
                                    value={role}
                                    onChange={(e) => setStaffRole(t.id, u.id, e.target.value)}
                                    className="h-7 px-1.5 border border-gray-200 rounded text-[11px] bg-white shrink-0"
                                  >
                                    {STAFF_ROLE_OPTIONS.map((o) => (
                                      <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        );
                      })()}
                      <button
                        type="button"
                        onClick={() => saveStaff(t.id)}
                        disabled={savingStaffId === String(t.id)}
                        className="h-8 px-3 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        {savingStaffId === String(t.id)
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Save className="h-3.5 w-3.5" />}
                        Lưu nhân viên loại này
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {!types.length && !loading && (
              <p className="text-xs text-gray-500">Chưa có loại lỗi.</p>
            )}
          </div>
        )}
      </section>

      <section className="bg-white border border-cyan-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-start gap-2 mb-3">
          <Clock className="h-5 w-5 text-cyan-700 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-bold text-gray-900">Loại phát sinh & thời gian hạn</h2>
            <p className="text-[11px] text-gray-600 mt-0.5">
              Dùng trên form «Loại phát sinh / hạn». Trong ngày = đến giờ deadline xưởng (mặc định 17:30).
              Mốc giờ = trước giờ cắt trong ngày, sau đó chuyển ngày làm việc kế. Cộng N ngày LV = cộng ngày làm việc.
            </p>
          </div>
        </div>
        <form onSubmit={savePhatKind} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mb-4 items-end">
          <div className="lg:col-span-2">
            <label className="text-[10px] text-gray-500">Tên loại *</label>
            <input
              value={phatDraft.name}
              onChange={(e) => {
                const name = e.target.value;
                if (editingPhat) setEditingPhat((c) => ({ ...c, name }));
                else setPhatForm((f) => ({ ...f, name }));
              }}
              className="w-full border rounded-lg px-2 py-1.5 text-sm"
              placeholder="VD: Đá, Phụ kiện, Kính cường lực"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="text-[10px] text-gray-500">Cách tính hạn *</label>
            <select
              value={phatDraft.sla_mode}
              onChange={(e) => {
                const sla_mode = e.target.value;
                if (editingPhat) setEditingPhat((c) => ({ ...c, sla_mode }));
                else setPhatForm((f) => ({ ...f, sla_mode }));
              }}
              className="w-full border rounded-lg px-2 py-1.5 text-sm"
            >
              {SLA_MODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          {phatDraft.sla_mode === 'working_days' && (
            <div>
              <label className="text-[10px] text-gray-500">Số ngày LV</label>
              <input
                type="number"
                min={1}
                max={30}
                value={phatDraft.sla_days}
                onChange={(e) => {
                  const sla_days = Number(e.target.value) || 1;
                  if (editingPhat) setEditingPhat((c) => ({ ...c, sla_days }));
                  else setPhatForm((f) => ({ ...f, sla_days }));
                }}
                className="w-full border rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
          )}
          {phatDraft.sla_mode === 'noon_cutoff' && (
            <div>
              <label className="text-[10px] text-gray-500">Giờ cắt</label>
              <input
                type="time"
                value={cutoffInputValue(phatDraft.cutoff_time)}
                onChange={(e) => {
                  const cutoff_time = e.target.value;
                  if (editingPhat) setEditingPhat((c) => ({ ...c, cutoff_time }));
                  else setPhatForm((f) => ({ ...f, cutoff_time }));
                }}
                className="w-full border rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              className="h-9 px-3 rounded-lg bg-cyan-700 text-white text-xs font-semibold hover:bg-cyan-800 inline-flex items-center gap-1 cursor-pointer"
            >
              {editingPhat ? <Save className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {editingPhat ? 'Lưu loại' : 'Thêm loại'}
            </button>
            {editingPhat && (
              <button
                type="button"
                onClick={() => setEditingPhat(null)}
                className="h-9 px-3 rounded-lg border text-xs text-gray-600 cursor-pointer"
              >
                Hủy
              </button>
            )}
          </div>
        </form>
        <div className="space-y-2">
          {phatKinds.map((k) => (
            <div key={k.id} className="border border-slate-200 rounded-lg px-3 py-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900">{k.name}</p>
                  {k.is_active === false && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800">Tắt</span>
                  )}
                </div>
                <p className="text-[11px] text-cyan-800 mt-0.5">
                  {k.sla_hint || slaModeLabel(k.sla_mode)}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingPhat({
                    ...k,
                    cutoff_time: cutoffInputValue(k.cutoff_time),
                    sla_days: Number(k.sla_days) || 1,
                  })}
                  className="h-7 w-7 rounded-md border border-slate-200 inline-flex items-center justify-center text-slate-600 hover:bg-slate-50 cursor-pointer"
                  title="Sửa"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => deletePhatKind(k)}
                  className="h-7 w-7 rounded-md border border-rose-200 inline-flex items-center justify-center text-rose-600 hover:bg-rose-50 cursor-pointer"
                  title="Xóa"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          {!phatKinds.length && !loading && (
            <p className="text-xs text-gray-500">Chưa có loại phát sinh.</p>
          )}
        </div>
      </section>
    </div>
  );
}
