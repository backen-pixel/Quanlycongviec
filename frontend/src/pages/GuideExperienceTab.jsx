/**
 * TAB "KINH NGHIỆM" — soi và dọn kho đường đi mà trợ lý tự học được khi chạy thật.
 *
 * KHÁC TAB KIẾN THỨC ở chỗ căn bản: kiến thức do NGƯỜI viết và trợ lý chỉ đọc; kinh nghiệm do
 * chính TRỢ LÝ viết lúc chạy. Nên màn hình này không phải chỗ soạn nội dung — nó là chỗ **kiểm
 * lại xem trợ lý đã học đúng chưa**, và bỏ đi những gì học sai.
 *
 * Vì thế không có nút "thêm mới" và không cho sửa nội dung: một kinh nghiệm do người gõ vào thì
 * đúng ra phải nằm ở kho KIẾN THỨC. Chỉ có hai hành động — bỏ và khôi phục.
 *
 * Ba thứ phải nhìn thấy ngay trên mỗi dòng, vì chúng quyết định bản ghi đó đáng giữ hay không:
 *   · ĐƯỜNG ĐI (chuỗi bước) — thứ thật sự được nhắc lại cho model
 *   · NGÕ CỤT — thứ cắt hẳn một nhánh mò, thường giá trị hơn cả đường đi
 *   · SỐ LẦN DÙNG LẠI — bản ghi 0 lần suốt nhiều tuần là bản ghi không ai cần
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Search, Trash2, RotateCcw, AlertTriangle, Bot, User,
  CornerDownRight, Ban, Lightbulb,
} from 'lucide-react';
import api from '../lib/api';

export default function GuideExperienceTab({ showToast }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [store, setStore] = useState('company');   // 'cong-ty' | 'chung'
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/copilotkit/experience/list');
      setData(data);
      // Kho của công ty rỗng mà kho 'chung' có dữ liệu → mở thẳng cái có dữ liệu, đỡ phải đoán
      // vì sao màn hình trống.
      if (!(data.list || []).length && (data.shared_store || []).length) setStore('chung');
    } catch (e) {
      showToast?.(e?.response?.data?.error || 'Không tải được kho kinh nghiệm', 'err');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const source = store === 'chung' ? (data?.shared_store || []) : (data?.list || []);

  const loc = useMemo(() => {
    const t = search.trim().toLowerCase();
    return source.filter((x) => {
      if (!showDiscarded && x.discarded_at) return false;
      if (!t) return true;
      const haystack = `${x.question} ${x.path} ${x.lesson} ${(x.keywords || []).join(' ')} `
        + `${(x.steps || []).map((b) => b.summary || b.tool).join(' ')} ${(x.dead_ends || []).join(' ')}`;
      return haystack.toLowerCase().includes(t);
    });
  }, [source, search, showDiscarded]);

  const call = async (fn, ok) => {
    setBusy(true);
    try {
      const { data } = await fn();
      if (data?.ok === false) { showToast?.(data.reason || 'Không thực hiện được', 'err'); return; }
      showToast?.(ok);
      await load();
    } catch (e) {
      showToast?.(e?.response?.data?.reason || e?.response?.data?.error || 'Lỗi', 'err');
    } finally {
      setBusy(false);
    }
  };

  const discard = (x) => {
    // Bắt nhập lý do, đúng như tool của trợ lý phải làm: nó buộc người bấm dừng một nhịp để nói
    // ra sai ở chỗ nào — và đó là thứ duy nhất người đọc lại dùng được để quyết định khôi phục.
    const reason = window.prompt(`Bỏ kinh nghiệm "${x.question.slice(0, 60)}…"\n\nSai ở chỗ nào?`, '');
    if (!reason || !reason.trim()) return;
    call(() => api.post('/copilotkit/experience/discard', { code: x.code, reason: reason.trim(), store: store === 'chung' ? 'chung' : undefined }),
      'Đã bỏ — lần sau trợ lý không được nhắc nó nữa');
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>;
  }

  const discardedCount = source.filter((x) => x.discarded_at).length;

  return (
    <div className="space-y-3">
      {data?.on === false && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Bộ nhớ kinh nghiệm đang tắt</div>
            <div className="text-xs mt-0.5">Trợ lý không đọc và không ghi kinh nghiệm. Bật lại ở tab Tinh chỉnh — kho cũ vẫn còn nguyên.</div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo câu hỏi, đường đi, ngõ cụt, bài học…"
            className="w-full h-9 pl-8 pr-2 rounded-lg border border-gray-200 text-sm"
          />
        </div>
        {/* Hai kho tách biệt: người chưa có company_id ghi vào kho 'chung'. Gộp hiển thị thì
            không ai biết bản ghi nào sẽ được nhắc cho ai. */}
        <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-lg">
          {[['company', `Công ty (${(data?.list || []).length})`], ['chung', `Chung (${(data?.shared_store || []).length})`]].map(([code, nhan]) => (
            <button
              key={code}
              type="button"
              onClick={() => setStore(code)}
              className={`px-3 h-8 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                store === code ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {nhan}
            </button>
          ))}
        </div>
        <label className="text-xs text-gray-600 flex items-center gap-1.5 cursor-pointer select-none">
          <input type="checkbox" checked={showDiscarded} onChange={(e) => setShowDiscarded(e.target.checked)} />
          Hiện cả mục đã bỏ ({discardedCount})
        </label>
      </div>

      <div className="text-xs text-gray-500 px-1">
        {loc.length} / {source.length} mục
        {data?.storage?.state ? ` · lưu trữ: ${data.storage.state === 'in_use' ? 'Supabase' : 'tệp JSON'}` : ''}
        {' · '}trợ lý tự ghi, không ai gõ tay
      </div>

      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
        {loc.length === 0 && (
          <div className="p-6 text-center text-sm text-gray-400">
            {source.length === 0
              ? 'Kho này chưa có kinh nghiệm nào — trợ lý sẽ tự ghi sau những lượt nhiều bước.'
              : 'Không có mục nào khớp.'}
          </div>
        )}
        {loc.map((x) => (
          <Row
            key={x.code}
            x={x}
            busy={busy}
            onDiscard={() => discard(x)}
            onRestore={() => call(
              () => api.post('/copilotkit/experience/restore', { code: x.code, store: store === 'chung' ? 'chung' : undefined }),
              'Đã khôi phục',
            )}
          />
        ))}
      </div>
    </div>
  );
}

function Row({ x, busy, onDiscard, onRestore }) {
  const asDate = (s) => (s ? new Date(s).toLocaleDateString('vi-VN') : '');
  return (
    <div className={`px-3 py-2.5 flex items-start gap-3 ${x.discarded_at ? 'bg-gray-50/70' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{x.code}</code>
          <span className={`text-sm font-semibold ${x.discarded_at ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
            {x.question}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 ${
            x.source === 'agent' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'
          }`}
          >
            {x.source === 'agent' ? <Bot className="h-2.5 w-2.5" /> : <User className="h-2.5 w-2.5" />}
            {x.source === 'agent' ? 'trợ lý tự ghi' : 'hệ thống nhặt'}
          </span>
          {x.use_count > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              gặp lại {x.use_count} lần
            </span>
          )}
          {/* Vế đối trọng của "gặp lại": số lần bản ghi được nhắc mà lượt vẫn bí. Phải hiện cạnh
              nhau, vì "gặp lại 12 lần" một mình trông như bằng chứng bản ghi tốt. */}
          {x.fail_count > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
              dẫn tới bí {x.fail_count} lần
            </span>
          )}
          {x.broken && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
              thôi nhắc
            </span>
          )}
          {x.discarded_at && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">đã bỏ</span>}
        </div>

        {x.path && <div className="text-[11px] font-mono text-gray-400 mt-0.5">{x.path}</div>}

        {/* Đường đi là thứ THẬT SỰ được nhắc lại cho model — phải hiện, không giấu sau nút mở. */}
        {!!(x.steps || []).length && (
          <div className="text-xs text-gray-600 mt-1 flex items-start gap-1.5">
            <CornerDownRight className="h-3 w-3 mt-0.5 shrink-0 text-gray-400" />
            <span>{x.steps.map((b) => b.summary || b.tool).join(' → ')}</span>
          </div>
        )}
        {!!(x.dead_ends || []).length && (
          <div className="text-xs text-rose-700 mt-1 flex items-start gap-1.5">
            <Ban className="h-3 w-3 mt-0.5 shrink-0" />
            <span>Đừng thử: {x.dead_ends.join(' | ')}</span>
          </div>
        )}
        {x.lesson && (
          <div className="text-xs text-amber-800 mt-1 flex items-start gap-1.5">
            <Lightbulb className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{x.lesson}</span>
          </div>
        )}

        <div className="text-[10px] text-gray-400 mt-1">
          học {asDate(x.created_at)}
          {x.used_at ? ` · nhắc gần nhất ${asDate(x.used_at)}` : ' · chưa từng được nhắc'}
        </div>
        {x.discarded_at && (
          <div className="text-[10px] text-gray-500 mt-0.5 italic">
            Bỏ {asDate(x.discarded_at)}: {x.discard_reason || '(không ghi lý do)'}
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={x.discarded_at ? onRestore : onDiscard}
        title={x.discarded_at ? 'Khôi phục' : 'Bỏ khỏi kho'}
        className="h-8 w-8 shrink-0 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 cursor-pointer inline-flex items-center justify-center"
      >
        {x.discarded_at ? <RotateCcw className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
      </button>
    </div>
  );
}
