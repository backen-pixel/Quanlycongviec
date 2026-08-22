import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../lib/api';
import { specialMeta, NODE_KIND, nodeDisplayLabel } from '../../lib/flowNodeCatalog';
import { availableVariables, previewWithLabels, brokenTokens } from '../../lib/flowDataBindings';

/**
 * Form cấu hình khối điều khiển / hành động đặc biệt.
 *
 * Khối hành động (Lấy báo cáo / AI viết báo cáo / Nhắn tin) chạy thật qua
 * POST /flows/:id/run-actions. Khối điều khiển vẫn chỉ là thiết kế.
 */

const PICKER_ENDPOINTS = {
  company: { url: '/companies', params: { for_module: 'crm' }, pick: (d) => d?.companies || d, label: (r) => r.short_name || r.name },
  department: { url: '/departments', pick: (d) => d?.departments || d, label: (r) => r.name },
  user: { url: '/users', pick: (d) => d?.users || d, label: (r) => r.full_name || r.email },
  group: { url: '/messenger/groups', pick: (d) => d?.groups || d, label: (r) => r.name || 'Nhóm' },
  playbook: {
    url: '/ai-chat-bot/playbooks',
    pick: (d) => (d?.playbooks || d || []).filter((p) => p.enabled !== false),
    label: (r) => `${r.icon ? `${r.icon} ` : ''}${r.name}`,
    empty: 'Chưa có mẫu AI nào — tạo ở Cài đặt AI Chat Bot',
  },
};

const optionCache = new Map();

function usePickerOptions(source) {
  const [options, setOptions] = useState(() => optionCache.get(source) || null);

  useEffect(() => {
    if (!source || optionCache.has(source)) return;
    const cfg = PICKER_ENDPOINTS[source];
    if (!cfg) return;
    let alive = true;
    api.get(cfg.url, { params: cfg.params })
      .then((r) => {
        const rows = cfg.pick(r.data) || [];
        const list = (Array.isArray(rows) ? rows : []).map((row) => ({
          value: String(row.id),
          label: cfg.label(row) || String(row.id),
        }));
        optionCache.set(source, list);
        if (alive) setOptions(list);
      })
      .catch(() => {
        optionCache.set(source, []);
        if (alive) setOptions([]);
      });
    return () => { alive = false; };
  }, [source]);

  return options;
}

function PickerField({ field, value, onChange }) {
  const options = usePickerOptions(field.source);
  const loading = options === null;
  const emptyLabel = loading
    ? 'Đang tải…'
    : (!options.length && PICKER_ENDPOINTS[field.source]?.empty) || '— Chọn —';
  return (
    <select
      value={value || ''}
      disabled={loading}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-9 px-2.5 rounded-lg text-[12px] bg-slate-50 border-0 ring-1 ring-slate-200 outline-none disabled:opacity-60"
    >
      <option value="">{emptyLabel}</option>
      {(options || []).map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/** Nhóm người nhận suy ra lúc chạy, không chốt cứng danh sách khi thiết kế luồng. */
const DYNAMIC_AUDIENCES = [
  {
    id: 'project_members',
    label: 'Thành viên hồ sơ',
    desc: 'Sale, NV xưởng, NV vận chuyển / lắp đặt đang phụ trách deal hoặc dự án lúc chạy',
  },
];

const NO_COMPANY = '__none__';
const peopleCache = { users: null, companies: null };

/** Bỏ dấu để gõ "duc" hay "dức" đều ra "Đức"; đ/Đ không tự tách dấu nên xử riêng. */
function deaccent(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

function usePeopleDirectory() {
  const [dir, setDir] = useState(peopleCache.users ? { ...peopleCache } : null);

  useEffect(() => {
    if (peopleCache.users) return;
    let alive = true;
    Promise.all([
      api.get('/users').then((r) => r.data?.users || r.data || []).catch(() => []),
      api.get('/companies').then((r) => r.data?.companies || r.data || []).catch(() => []),
    ]).then(([users, companies]) => {
      peopleCache.users = (Array.isArray(users) ? users : []).map((u) => ({
        id: String(u.id),
        name: u.full_name || u.email || 'Không tên',
        // Users API trả công ty lồng trong phòng ban; ai chưa có phòng ban thì coi như
        // chưa gắn công ty — vẫn phải chọn được vì hệ sinh thái có nhóm nhân sự dùng chung.
        companyId: u.department?.company_id ? String(u.department.company_id) : NO_COMPANY,
        subtitle: u.department?.name || u.email || '',
        search: deaccent(`${u.full_name || ''} ${u.email || ''} ${u.department?.name || ''}`),
      }));
      peopleCache.companies = (Array.isArray(companies) ? companies : []).map((c) => ({
        id: String(c.id),
        name: c.short_name || c.name || 'Công ty',
      }));
      if (alive) setDir({ ...peopleCache });
    });
    return () => { alive = false; };
  }, []);

  return dir;
}

/** Giá trị cũ chỉ lưu một người ở target_id — đọc lên thành danh sách một phần tử. */
function normalizeRecipients(value, legacyTargetId) {
  if (value && typeof value === 'object') {
    return {
      dynamic: Array.isArray(value.dynamic) ? value.dynamic : [],
      user_ids: Array.isArray(value.user_ids) ? value.user_ids.map(String) : [],
    };
  }
  return { dynamic: [], user_ids: legacyTargetId ? [String(legacyTargetId)] : [] };
}

function PeopleField({ value, legacyTargetId, onChange }) {
  const dir = usePeopleDirectory();
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const picked = normalizeRecipients(value, legacyTargetId);
  const chosen = new Set(picked.user_ids);

  const shown = useMemo(() => {
    const users = dir?.users || [];
    const kw = deaccent(search.trim());
    return users.filter((u) => {
      // Có từ khoá thì tìm toàn danh sách: người cần tìm hay nằm ngoài công ty đang lọc.
      if (!kw && companyFilter && u.companyId !== companyFilter) return false;
      if (kw && !u.search.includes(kw)) return false;
      return true;
    });
  }, [dir, search, companyFilter]);

  const toggleUser = (id) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...picked, user_ids: [...next] });
  };

  const toggleDynamic = (id) => {
    const next = new Set(picked.dynamic);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...picked, dynamic: [...next] });
  };

  const nameById = useMemo(
    () => new Map((dir?.users || []).map((u) => [u.id, u.name])),
    [dir],
  );

  return (
    <div className="space-y-1.5">
      {DYNAMIC_AUDIENCES.map((a) => (
        <label
          key={a.id}
          className="flex items-start gap-2 rounded-lg bg-teal-50 ring-1 ring-teal-100 px-2 py-1.5 cursor-pointer"
        >
          <input
            type="checkbox"
            checked={picked.dynamic.includes(a.id)}
            onChange={() => toggleDynamic(a.id)}
            className="mt-0.5"
          />
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold text-teal-800">{a.label}</span>
            <span className="block text-[10px] leading-snug text-teal-700/70">{a.desc}</span>
          </span>
        </label>
      ))}

      {picked.user_ids.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {picked.user_ids.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => toggleUser(id)}
              title="Bỏ chọn"
              className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700 hover:bg-rose-50 hover:text-rose-700 cursor-pointer"
            >
              {nameById.get(id) || id.slice(0, 8)} ×
            </button>
          ))}
        </div>
      )}

      <select
        value={companyFilter}
        onChange={(e) => setCompanyFilter(e.target.value)}
        className="w-full h-8 px-2 rounded-lg text-[11px] bg-slate-50 border-0 ring-1 ring-slate-200 outline-none"
      >
        <option value="">Tất cả công ty</option>
        {(dir?.companies || []).map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
        <option value={NO_COMPANY}>Chưa gắn công ty</option>
      </select>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Tìm tên hoặc email (không cần dấu)…"
        className="w-full h-8 px-2 rounded-lg text-[11px] bg-slate-50 border-0 ring-1 ring-slate-200 outline-none"
      />
      {search.trim() && companyFilter && (
        <p className="text-[10px] text-slate-400">Đang tìm trong toàn hệ sinh thái, bỏ qua bộ lọc công ty.</p>
      )}

      <div className="max-h-44 overflow-auto rounded-lg ring-1 ring-slate-200 bg-slate-50 p-1 space-y-0.5">
        {!dir && <p className="px-1.5 py-1 text-[10px] text-slate-400">Đang tải danh sách…</p>}
        {dir && !shown.length && <p className="px-1.5 py-1 text-[10px] text-slate-400">Không có ai khớp.</p>}
        {shown.map((u) => (
          <label key={u.id} className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-white cursor-pointer">
            <input type="checkbox" checked={chosen.has(u.id)} onChange={() => toggleUser(u.id)} />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] text-slate-700 truncate">{u.name}</span>
              {u.subtitle && <span className="block text-[10px] text-slate-400 truncate">{u.subtitle}</span>}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

const CUSTOM_EVENT = '__custom__';
let waitEventCache = null;

function EventPickerField({ value, onChange }) {
  const [groups, setGroups] = useState(waitEventCache);
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    if (waitEventCache) return;
    let alive = true;
    api.get('/flows/meta/wait-events')
      .then((r) => {
        waitEventCache = r.data?.groups || [];
        if (alive) setGroups(waitEventCache);
      })
      .catch(() => {
        waitEventCache = [];
        if (alive) setGroups([]);
      });
    return () => { alive = false; };
  }, []);

  const known = useMemo(
    () => new Set((groups || []).flatMap((g) => g.events.map((e) => e.key))),
    [groups],
  );
  // Giá trị cũ gõ tay không nằm trong danh mục thì mở sẵn ô nhập để không mất dữ liệu.
  const isCustom = custom || (Boolean(value) && groups !== null && !known.has(value));

  return (
    <div className="space-y-1.5">
      <select
        value={isCustom ? CUSTOM_EVENT : (value || '')}
        disabled={groups === null}
        onChange={(e) => {
          if (e.target.value === CUSTOM_EVENT) { setCustom(true); onChange(''); return; }
          setCustom(false);
          onChange(e.target.value);
        }}
        className="w-full h-9 px-2.5 rounded-lg text-[12px] bg-slate-50 border-0 ring-1 ring-slate-200 outline-none disabled:opacity-60"
      >
        <option value="">{groups === null ? 'Đang tải…' : '— Chọn sự kiện —'}</option>
        {(groups || []).map((g) => (
          <optgroup key={g.id} label={g.label}>
            {g.events.map((e) => (
              <option key={e.key} value={e.key}>{e.label}</option>
            ))}
          </optgroup>
        ))}
        <option value={CUSTOM_EVENT}>Khác — tự nhập mã</option>
      </select>

      {isCustom && (
        <input
          value={value || ''}
          placeholder="Mã sự kiện, ví dụ vc_handover_done"
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-9 px-2.5 rounded-lg text-[12px] bg-slate-50 border-0 ring-1 ring-slate-200 outline-none"
        />
      )}
    </div>
  );
}

function VariableMenu({ variables, onPick }) {
  const [open, setOpen] = useState(false);
  if (!variables.length) {
    return (
      <span className="text-[10px] text-slate-400">
        Chưa có khối nào phía trước để lấy dữ liệu
      </span>
    );
  }

  const byNode = new Map();
  for (const v of variables) {
    if (!byNode.has(v.nodeId)) byNode.set(v.nodeId, { label: v.nodeLabel, items: [] });
    byNode.get(v.nodeId).items.push(v);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-[10px] font-semibold px-2 py-1 rounded-md bg-[#296DFF]/10 text-[#296DFF] hover:bg-[#296DFF]/20"
      >
        Chèn dữ liệu
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-64 max-h-64 overflow-auto rounded-xl bg-white shadow-lg ring-1 ring-slate-200 p-1">
          {[...byNode.entries()].map(([nodeId, group]) => (
            <div key={nodeId} className="mb-1">
              <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
                {group.label}
              </p>
              {group.items.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => { onPick(v.token); setOpen(false); }}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-50"
                >
                  <span className="block text-[11px] font-medium text-slate-700">{v.outputLabel}</span>
                  <span className="block text-[10px] text-slate-400 truncate">{v.desc}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TextareaField({ field, value, variables, onChange }) {
  const ref = useRef(null);

  const insert = (token) => {
    const el = ref.current;
    const cur = value || '';
    if (!el) { onChange(cur + token); return; }
    const start = el.selectionStart ?? cur.length;
    const end = el.selectionEnd ?? cur.length;
    const next = cur.slice(0, start) + token + cur.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const preview = useMemo(
    () => (value ? previewWithLabels(value, variables) : ''),
    [value, variables],
  );
  const usesVariable = preview !== value;

  return (
    <div className="space-y-1.5">
      {field.variables && (
        <div className="flex justify-end">
          <VariableMenu variables={variables} onPick={insert} />
        </div>
      )}
      <textarea
        ref={ref}
        rows={field.rows || 4}
        value={value || ''}
        placeholder={field.placeholder || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2.5 py-2 rounded-lg text-[12px] leading-relaxed bg-slate-50 border-0 ring-1 ring-slate-200 outline-none resize-y"
      />
      {usesVariable && (
        <p className="text-[10px] leading-relaxed text-slate-500 bg-slate-50 rounded-lg px-2 py-1.5">
          Xem trước: {preview}
        </p>
      )}
    </div>
  );
}

function VariablesField({ variables, value, onChange }) {
  const selected = new Set(Array.isArray(value) ? value : []);
  const toggle = (token) => {
    const next = new Set(selected);
    if (next.has(token)) next.delete(token);
    else next.add(token);
    onChange([...next]);
  };
  if (!variables.length) {
    return <p className="text-[10px] text-slate-400">Chưa có khối nào phía trước.</p>;
  }
  return (
    <div className="max-h-40 overflow-auto rounded-lg ring-1 ring-slate-200 bg-slate-50 p-1.5 space-y-0.5">
      {variables.map((v) => (
        <label key={v.token} className="flex items-start gap-2 px-1.5 py-1 rounded-md hover:bg-white cursor-pointer">
          <input
            type="checkbox"
            checked={selected.has(v.token)}
            onChange={() => toggle(v.token)}
            className="mt-0.5"
          />
          <span className="min-w-0">
            <span className="block text-[11px] text-slate-700 truncate">
              {v.nodeLabel} · {v.outputLabel}
            </span>
            <span className="block text-[10px] text-slate-400 truncate">{v.desc}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

/** Danh sách nhãn của khối AI phân loại — mỗi nhãn khớp với label của một cạnh đi ra. */
function LabelsField({ value, onChange }) {
  const list = Array.isArray(value) ? value : [];
  const setAt = (i, text) => onChange(list.map((item, idx) => (idx === i ? text : item)));

  return (
    <div className="space-y-1.5">
      {list.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={item}
            placeholder="Tên nhãn"
            onChange={(e) => setAt(i, e.target.value)}
            className="flex-1 h-8 px-2 rounded-lg text-[12px] bg-slate-50 border-0 ring-1 ring-slate-200 outline-none"
          />
          <button
            type="button"
            onClick={() => onChange(list.filter((_, idx) => idx !== i))}
            className="h-8 w-8 shrink-0 rounded-lg text-[13px] text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
            title="Xoá nhãn"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...list, ''])}
        className="w-full h-8 rounded-lg text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
      >
        + Thêm nhãn
      </button>
    </div>
  );
}

/** Mã trường được chuẩn hoá ngay khi gõ: token {{node.key}} không nhận dấu và khoảng trắng. */
function slugKey(text) {
  return deaccent(text).replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

/** Khai báo các trường khối AI bóc dữ liệu phải rút ra: mã trường + mô tả cho AI. */
function ExtractFieldsField({ value, onChange }) {
  const list = Array.isArray(value) ? value : [];
  const setAt = (i, patch) => onChange(list.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  return (
    <div className="space-y-2">
      {list.map((row, i) => (
        <div key={i} className="rounded-lg bg-slate-50 ring-1 ring-slate-200 p-1.5 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <input
              value={row?.key || ''}
              placeholder="ma_truong"
              onChange={(e) => setAt(i, { key: slugKey(e.target.value) })}
              className="flex-1 h-8 px-2 rounded-md text-[12px] font-mono bg-white border-0 ring-1 ring-slate-200 outline-none"
            />
            <button
              type="button"
              onClick={() => onChange(list.filter((_, idx) => idx !== i))}
              className="h-8 w-8 shrink-0 rounded-md text-[13px] text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
              title="Xoá trường"
            >
              ×
            </button>
          </div>
          <input
            value={row?.label || ''}
            placeholder="Mô tả cho AI: cần bóc gì"
            onChange={(e) => setAt(i, { label: e.target.value })}
            className="w-full h-8 px-2 rounded-md text-[12px] bg-white border-0 ring-1 ring-slate-200 outline-none"
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...list, { key: '', label: '' }])}
        className="w-full h-8 rounded-lg text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
      >
        + Thêm trường
      </button>
    </div>
  );
}

/** Bài học Kiến thức làm tài liệu tham chiếu cho khối AI hỏi đáp. */
function LessonsField({ value, onChange }) {
  const [lessons, setLessons] = useState(null);
  const [search, setSearch] = useState('');
  const picked = Array.isArray(value) ? value.map(String) : [];

  useEffect(() => {
    let alive = true;
    api.get('/knowledge/lessons')
      .then((r) => {
        const rows = r.data?.lessons || r.data || [];
        if (alive) setLessons(Array.isArray(rows) ? rows : []);
      })
      .catch(() => { if (alive) setLessons([]); });
    return () => { alive = false; };
  }, []);

  const shown = useMemo(() => {
    const kw = deaccent(search.trim());
    return (lessons || []).filter((l) => !kw || deaccent(`${l.title || ''} ${l.summary || ''}`).includes(kw));
  }, [lessons, search]);

  if (lessons === null) {
    return <p className="text-[11px] text-slate-400">Đang tải danh sách bài học…</p>;
  }
  if (!lessons.length) {
    return <p className="text-[11px] text-slate-400">Chưa có bài học nào trong mục Kiến thức.</p>;
  }

  const toggle = (id) => {
    const key = String(id);
    onChange(picked.includes(key) ? picked.filter((x) => x !== key) : [...picked, key]);
  };

  return (
    <div className="space-y-1.5">
      <input
        value={search}
        placeholder="Tìm bài học…"
        onChange={(e) => setSearch(e.target.value)}
        className="w-full h-8 px-2 rounded-lg text-[12px] bg-slate-50 border-0 ring-1 ring-slate-200 outline-none"
      />
      <div className="max-h-40 overflow-y-auto rounded-lg ring-1 ring-slate-200 divide-y divide-slate-100">
        {shown.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => toggle(l.id)}
            className={`w-full flex items-start gap-2 px-2 py-1.5 text-left cursor-pointer ${
              picked.includes(String(l.id)) ? 'bg-indigo-50' : 'hover:bg-slate-50'
            }`}
          >
            <span className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded border text-[9px] leading-[13px] text-center ${
              picked.includes(String(l.id)) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300'
            }`}
            >
              {picked.includes(String(l.id)) ? '✓' : ''}
            </span>
            <span className="min-w-0 flex-1 text-[11px] leading-snug text-slate-700 truncate">{l.title}</span>
          </button>
        ))}
        {!shown.length && <p className="px-2 py-2 text-[11px] text-slate-400">Không tìm thấy bài học.</p>}
      </div>
      {picked.length > 0 && (
        <p className="text-[10px] text-slate-500">Đã chọn {picked.length} bài học.</p>
      )}
    </div>
  );
}

/**
 * Đối chiếu nhãn AI với nhãn cạnh đi ra — chỗ duy nhất người dùng thấy được nhánh nào
 * sẽ chạy, vì việc khớp nhãn diễn ra lúc chạy chứ không hiện trên sơ đồ.
 */
function ClassifyBranchHint({ nodeId, nodes, edges, labels }) {
  const outgoing = edges.filter((e) => e.source === nodeId);
  if (!outgoing.length) {
    return (
      <p className="text-[10px] leading-relaxed text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
        Khối này chưa có nhánh đi ra. Nối sang các khối sau rồi đặt nhãn cạnh đúng bằng tên nhãn ở trên.
      </p>
    );
  }
  const known = (Array.isArray(labels) ? labels : []).map((l) => String(l).trim().toLowerCase());
  const nameOf = (id) => {
    const n = nodes.find((x) => x.id === id);
    return n ? nodeDisplayLabel(n.data) : id;
  };

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold text-slate-500">Nhánh đi ra</p>
      {outgoing.map((e) => {
        const edgeLabel = String(e.data?.label || '').trim();
        const state = !edgeLabel
          ? { text: 'Không nhãn — luôn chạy', cls: 'text-slate-500 bg-slate-50 ring-slate-200' }
          : known.includes(edgeLabel.toLowerCase())
            ? { text: `Chạy khi AI chọn «${edgeLabel}»`, cls: 'text-emerald-700 bg-emerald-50 ring-emerald-200' }
            : { text: `Nhãn «${edgeLabel}» không có trong danh sách — nhánh này sẽ không chạy`, cls: 'text-rose-700 bg-rose-50 ring-rose-200' };
        return (
          <div key={e.id} className={`rounded-lg px-2 py-1.5 ring-1 ${state.cls}`}>
            <p className="text-[11px] font-medium truncate">→ {nameOf(e.target)}</p>
            <p className="text-[10px] leading-relaxed opacity-90">{state.text}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function SpecialNodeInspector({
  nodeData, nodeId, nodes = [], edges = [], moduleLabelFn, moduleVars = null, onChange,
}) {
  const meta = specialMeta(nodeData?.node_kind);
  const config = nodeData?.node_config || {};

  const variables = useMemo(
    () => (nodeId ? availableVariables(nodes, edges, nodeId, moduleLabelFn, moduleVars) : []),
    [nodes, edges, nodeId, moduleLabelFn, moduleVars],
  );

  const broken = useMemo(
    () => (nodeId ? brokenTokens(nodes, edges, nodeId, config.content || '', moduleVars) : []),
    [nodes, edges, nodeId, config.content, moduleVars],
  );

  if (!meta) return null;
  const fields = meta.configFields || [];
  const defaults = meta.configDefaults || {};
  const isAction = meta.category === 'action';

  const setConfig = (key, value) => {
    onChange({ node_config: { ...config, [key]: value } });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Cấu hình khối
      </p>
      <p className="text-[10px] leading-relaxed text-slate-400">{meta.desc}</p>

      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold text-slate-500">Tên hiển thị</span>
        <input
          value={nodeData.label || meta.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="w-full h-9 px-2.5 rounded-lg text-[12px] bg-slate-50 border-0 ring-1 ring-slate-200 outline-none"
        />
      </label>

      {fields.map((field, i) => {
        if (field.showIf) {
          // Node lưu từ trước có thể thiếu khoá mới → xét theo giá trị mặc định của catalog.
          const hidden = Object.entries(field.showIf)
            .some(([k, v]) => (config[k] ?? defaults[k]) !== v);
          if (hidden) return null;
        }
        const value = config[field.key] ?? defaults[field.key] ?? '';
        return (
          <label key={`${field.key}-${i}`} className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-500">{field.label}</span>
            {field.type === 'select' ? (
              <select
                value={value}
                onChange={(e) => setConfig(field.key, e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg text-[12px] bg-slate-50 border-0 ring-1 ring-slate-200 outline-none"
              >
                {(field.options || []).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : field.type === 'number' ? (
              <input
                type="number"
                min={field.min}
                max={field.max}
                step={field.step}
                value={value}
                onChange={(e) => setConfig(field.key, Number(e.target.value) || 0)}
                className="w-full h-9 px-2.5 rounded-lg text-[12px] bg-slate-50 border-0 ring-1 ring-slate-200 outline-none"
              />
            ) : field.type === 'picker' ? (
              <PickerField field={field} value={value} onChange={(v) => setConfig(field.key, v)} />
            ) : field.type === 'textarea' ? (
              <TextareaField
                field={field}
                value={value}
                variables={variables}
                onChange={(v) => setConfig(field.key, v)}
              />
            ) : field.type === 'variables' ? (
              <VariablesField
                variables={variables}
                value={config[field.key]}
                onChange={(v) => setConfig(field.key, v)}
              />
            ) : field.type === 'event' ? (
              <EventPickerField value={value} onChange={(v) => setConfig(field.key, v)} />
            ) : field.type === 'people' ? (
              <PeopleField
                value={config[field.key]}
                legacyTargetId={config.target_id}
                onChange={(v) => setConfig(field.key, v)}
              />
            ) : field.type === 'labels' ? (
              <LabelsField
                value={config[field.key] ?? defaults[field.key]}
                onChange={(v) => setConfig(field.key, v)}
              />
            ) : field.type === 'fields' ? (
              <ExtractFieldsField
                value={config[field.key] ?? defaults[field.key]}
                onChange={(v) => setConfig(field.key, v)}
              />
            ) : field.type === 'lessons' ? (
              <LessonsField
                value={config[field.key] ?? defaults[field.key]}
                onChange={(v) => setConfig(field.key, v)}
              />
            ) : (
              <input
                value={value}
                placeholder={field.placeholder || ''}
                onChange={(e) => setConfig(field.key, e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg text-[12px] bg-slate-50 border-0 ring-1 ring-slate-200 outline-none"
              />
            )}
            {field.hint && (
              <span className="mt-1 block text-[10px] leading-relaxed text-slate-400">{field.hint}</span>
            )}
          </label>
        );
      })}

      {nodeData.node_kind === NODE_KIND.AI_CLASSIFY && (
        <ClassifyBranchHint
          nodeId={nodeId}
          nodes={nodes}
          edges={edges}
          labels={config.labels ?? defaults.labels}
        />
      )}

      {broken.length > 0 && (
        <p className="text-[10px] leading-relaxed text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-2 py-1.5">
          Nội dung đang trỏ tới khối không còn nằm phía trước: {broken.join(', ')}. Nối lại cạnh hoặc xoá token này.
        </p>
      )}

      {isAction ? (
        <p className="text-[10px] leading-relaxed text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1.5">
          {nodeData.node_kind === NODE_KIND.AI_DEADLINE
            ? 'Khối này chạy theo lịch nhắc deadline sẵn có.'
            : 'Khối này chạy thật. Bấm «Chạy thử» trên thanh công cụ để xem kết quả trước khi gửi.'}
        </p>
      ) : (
        <p className="text-[10px] leading-relaxed text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
          Khối điều khiển đã lưu trên sơ đồ. Điều kiện trên cạnh đã có hiệu lực khi bật thực thi đồ thị.
        </p>
      )}
    </div>
  );
}
