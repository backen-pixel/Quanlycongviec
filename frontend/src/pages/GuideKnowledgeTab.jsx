/**
 * TAB "KIẾN THỨC" — quản lý kho tra cứu của trợ lý hướng dẫn.
 *
 * Đây là thứ thay cho việc mở `backend/data/guide-knowledge/*.json` bằng editor rồi build lại
 * image. Sửa ở đây có hiệu lực ở lượt hỏi kế tiếp.
 *
 * BA THỨ PHẢI NHÌN THẤY NGAY TRÊN DANH SÁCH, vì thiếu chúng thì không ai quản lý được kho 316
 * mục: chunk đến từ tệp nào, đã bị sửa tay chưa, và đã bị bỏ chưa. Hai cái sau quyết định số
 * phận của nó ở lần chạy generator kế tiếp.
 *
 * KHOÁ LÀ CẶP (source, path), không phải path — `/crm/leads/:id` có mặt ở cả `screens.json` lẫn
 * `guides.json` và đó là chủ ý. Mọi lời gọi API đều gửi cả hai.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Search, Plus, Save, X, Trash2, RotateCcw, RefreshCw,
  AlertTriangle, PencilLine, Undo2,
} from 'lucide-react';
import api from '../lib/api';

/** Tên tệp → nhãn ngắn cho chip lọc. Tệp lạ vẫn hiện, dùng luôn tên tệp. */
const SOURCE_LABEL = {
  'screens.json': 'Màn hình',
  'guides.json': 'Hướng dẫn',
  'lead-detail.json': 'Lead/Deal',
  'tour-guides.json': 'Tour',
  manual: 'Tự thêm',
};

const WIDTH = {
  path: '', source: 'manual', label: '', menu: '', summary: '', content: '',
  keywords: [], actions: [], needs_admin: false,
};

export default function GuideKnowledgeTab({ showToast }) {
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState([]);
  const [storage, setStorage] = useState(null);
  const [readOnly, setReadOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [editing, setEditing] = useState(null);      // bản ghi đang mở form
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/copilotkit/knowledge');
      setList(data.list || []);
      setStorage(data.storage || null);
      setReadOnly(!!data.read_only);
    } catch (e) {
      showToast?.(e?.response?.data?.error || 'Không tải được kho kiến thức', 'err');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const sourcesAvailable = useMemo(() => [...new Set(list.map((x) => x.source))].sort(), [list]);

  const loc = useMemo(() => {
    const t = search.trim().toLowerCase();
    return list.filter((x) => {
      if (!showDiscarded && x.discarded_at) return false;
      if (sourceFilter && x.source !== sourceFilter) return false;
      if (!t) return true;
      return `${x.path} ${x.label} ${x.summary} ${(x.keywords || []).join(' ')}`.toLowerCase().includes(t);
    });
  }, [list, search, sourceFilter, showDiscarded]);

  const call = async (fn, thanhCong) => {
    setBusy(true);
    try {
      const { data } = await fn();
      if (data?.ok === false) { showToast?.(data.reason || 'Không thực hiện được', 'err'); return false; }
      showToast?.(thanhCong);
      await load();
      return true;
    } catch (e) {
      showToast?.(e?.response?.data?.reason || e?.response?.data?.error || 'Lỗi', 'err');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async (x) => {
    const ok = await call(
      () => (isNew ? api.post('/copilotkit/knowledge', x)
        : api.put('/copilotkit/knowledge', x)),
      isNew ? 'Đã thêm mục kiến thức' : 'Đã lưu — lượt hỏi tiếp theo dùng ngay bản mới',
    );
    if (ok) { setEditing(null); setIsNew(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>;
  }

  return (
    <div className="space-y-3">
      {/* Chưa chạy migration thì kho vẫn chạy bằng tệp — nói rõ chứ đừng hiện bảng trống. */}
      {readOnly && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Chưa bật lưu kiến thức vào Supabase</div>
            <div className="text-xs mt-0.5">
              Trợ lý vẫn tra cứu bình thường bằng các tệp JSON trong image, nhưng chưa sửa được ở đây.
              Chạy <code className="font-mono">database/593_guide_assistant_gop.sql</code> rồi tải lại trang.
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo đường dẫn, tên, tóm tắt, từ khoá…"
            className="w-full h-9 pl-8 pr-2 rounded-lg border border-gray-200 text-sm"
          />
        </div>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="h-9 px-2 rounded-lg border border-gray-200 text-sm bg-white"
        >
          <option value="">Mọi nguồn ({list.length})</option>
          {sourcesAvailable.map((n) => (
            <option key={n} value={n}>{SOURCE_LABEL[n] || n} ({list.filter((x) => x.source === n).length})</option>
          ))}
        </select>
        <label className="text-xs text-gray-600 flex items-center gap-1.5 cursor-pointer select-none">
          <input type="checkbox" checked={showDiscarded} onChange={(e) => setShowDiscarded(e.target.checked)} />
          Hiện cả mục đã bỏ
        </label>
        <button
          type="button"
          disabled={busy || readOnly}
          onClick={() => { setIsNew(true); setEditing({ ...WIDTH }); }}
          className="h-9 px-3 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" /> Thêm mục
        </button>
        {/* Đồng bộ tay: dùng sau khi ai đó chạy `npm run guide:sync` trên máy dev. */}
        <button
          type="button"
          disabled={busy || readOnly}
          title="Đẩy lại nội dung từ các tệp JSON lên DB. Mục đã sửa tay được giữ nguyên."
          onClick={() => call(() => api.post('/copilotkit/knowledge/sync'), 'Đã đồng bộ từ tệp')}
          className="h-9 px-3 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
        >
          <RefreshCw className="h-4 w-4" /> Đồng bộ từ tệp
        </button>
      </div>

      <div className="text-xs text-gray-500 px-1">
        {loc.length} / {list.length} mục
        {storage?.state ? ` · lưu trữ: ${storage.state === 'in_use' ? 'Supabase' : 'tệp JSON'}` : ''}
        {' · '}
        {list.filter((x) => x.hand_edited).length} mục đã sửa tay (generator không đè lên)
      </div>

      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
        {loc.length === 0 && <div className="p-6 text-center text-sm text-gray-400">Không có mục nào khớp.</div>}
        {loc.map((x) => (
          <Row
            key={`${x.source}::${x.path}`}
            x={x}
            busy={busy || readOnly}
            onEdit={() => { setIsNew(false); setEditing({ ...x }); }}
            onDiscard={() => call(
              () => api.post('/copilotkit/knowledge/discard', { source: x.source, path: x.path, discard: !x.discarded_at }),
              x.discarded_at ? 'Đã khôi phục' : 'Đã bỏ khỏi kho tra cứu',
            )}
            onReset={() => call(
              () => api.post('/copilotkit/knowledge/reset', { source: x.source, path: x.path }),
              'Đã trả về bản gốc do generator sinh',
            )}
          />
        ))}
      </div>

      {editing && (
        <EditForm
          x={editing}
          isNew={isNew}
          busy={busy}
          onChange={setEditing}
          onClose={() => { setEditing(null); setIsNew(false); }}
          onSave={() => save(editing)}
        />
      )}
    </div>
  );
}

function Row({ x, busy, onEdit, onDiscard, onReset }) {
  return (
    <div className={`px-3 py-2.5 flex items-start gap-3 ${x.discarded_at ? 'bg-gray-50/70' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-semibold ${x.discarded_at ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
            {x.label || '(không tên)'}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {SOURCE_LABEL[x.source] || x.source}
          </span>
          {x.hand_edited && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 inline-flex items-center gap-1">
              <PencilLine className="h-2.5 w-2.5" /> đã sửa tay
            </span>
          )}
          {x.needs_admin && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">chỉ admin</span>
          )}
          {x.discarded_at && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">đã bỏ</span>
          )}
        </div>
        <div className="text-[11px] font-mono text-gray-400 truncate">{x.path}</div>
        {x.summary && <div className="text-xs text-gray-600 mt-0.5 line-clamp-2">{x.summary}</div>}
        <div className="text-[10px] text-gray-400 mt-0.5">
          {(x.keywords || []).length} từ khoá · {(x.actions || []).length} thao tác
          {x.content ? ` · nội dung ${x.content.length} ký tự` : ''}
          {x.edited_by ? ` · sửa bởi ${x.edited_by}` : ''}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {x.hand_edited && x.source !== 'manual' && (
          <button
            type="button" disabled={busy} onClick={onReset} title="Trả về bản do generator sinh"
            className="h-8 w-8 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 cursor-pointer inline-flex items-center justify-center"
          >
            <Undo2 className="h-4 w-4" />
          </button>
        )}
        <button
          type="button" disabled={busy} onClick={onDiscard} title={x.discarded_at ? 'Khôi phục' : 'Bỏ khỏi kho tra cứu'}
          className="h-8 w-8 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 cursor-pointer inline-flex items-center justify-center"
        >
          {x.discarded_at ? <RotateCcw className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
        </button>
        <button
          type="button" disabled={busy || !!x.discarded_at} onClick={onEdit}
          className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
        >
          Sửa
        </button>
      </div>
    </div>
  );
}

function EditForm({ x, isNew, busy, onChange, onClose, onSave }) {
  const setField = (k, v) => onChange({ ...x, [k]: v });
  // Từ khoá và thao tác nhập MỖI DÒNG MỘT MỤC, không phải JSON: người viết nội dung không nên
  // phải gõ đúng cú pháp mảng, và một dấu phẩy thiếu không được phép làm hỏng cả bản ghi.
  const linesOf = (a) => (a || []).map((t) => (typeof t === 'string' ? t : t?.label || '')).join('\n');

  return (
    <div className="fixed inset-0 z-[10060] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <h3 className="text-base font-bold text-gray-900">{isNew ? 'Thêm mục kiến thức' : 'Sửa mục kiến thức'}</h3>
            <p className="text-[11px] text-gray-400 font-mono">{x.path || '(chưa có đường dẫn)'}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {isNew && (
            <Field label="Đường dẫn (bắt buộc)" note="Dạng /crm/tasks, hoặc /crm/leads/:id#neo cho một mục con.">
              <input value={x.path} onChange={(e) => setField('path', e.target.value)} className={inputCss} placeholder="/crm/..." />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tên hiển thị"><input value={x.label} onChange={(e) => setField('label', e.target.value)} className={inputCss} /></Field>
            <Field label="Vị trí menu"><input value={x.menu} onChange={(e) => setField('menu', e.target.value)} className={inputCss} placeholder="CRM → Bán hàng" /></Field>
          </div>

          <Field label="Tóm tắt" note="Một câu. Đây là thứ trợ lý đọc trước tiên khi chọn kết quả.">
            <textarea value={x.summary} onChange={(e) => setField('summary', e.target.value)} rows={2} className={inputCss} />
          </Field>

          <Field
            label="Từ khoá — mỗi dòng một cụm"
            note="Trọng số CAO NHẤT khi chấm điểm. Viết cả cách gọi dân dã (“lấy lại lead đã xoá”), không chỉ tên chính thức."
          >
            <textarea
              value={linesOf(x.keywords)}
              onChange={(e) => setField('keywords', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
              rows={4} className={`${inputCss} font-mono text-xs`}
            />
          </Field>

          <Field
            label="Nội dung chuyên sâu"
            note="Quy tắc, phân biệt mục này với mục kia, điều kiện mục mới hiện. Để trống nếu tóm tắt đã đủ — khối càng dài càng dễ lấn hạng các mục khác."
          >
            <textarea value={x.content} onChange={(e) => setField('content', e.target.value)} rows={8} className={`${inputCss} text-xs`} />
          </Field>

          <Field label="Nhãn nút — mỗi dòng một nút" note="Phải khớp NGUYÊN VĂN chữ trên giao diện, nếu không trợ lý bấm sẽ trượt.">
            <textarea
              value={linesOf(x.actions)}
              onChange={(e) => setField('actions', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean).map((label) => ({ label })))}
              rows={4} className={`${inputCss} font-mono text-xs`}
            />
          </Field>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={!!x.needs_admin} onChange={(e) => setField('needs_admin', e.target.checked)} />
            Chỉ quản trị viên thấy mục này trong kết quả tra cứu
          </label>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2 sticky bottom-0 bg-white">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Hủy</button>
          <button
            type="button" onClick={onSave} disabled={busy || (isNew && !x.path.trim())}
            className="h-9 px-4 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCss = 'w-full px-2.5 py-2 rounded-lg border border-gray-200 text-sm bg-white';

function Field({ label, note, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      {children}
      {note && <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{note}</p>}
    </div>
  );
}
