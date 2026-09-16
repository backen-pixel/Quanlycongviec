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
  AlertTriangle, PencilLine, Undo2, FlaskConical, Sparkles, Layers,
} from 'lucide-react';
import api from '../lib/api';
import { SCREEN_REGISTRY } from '../features/guide/data/screenRegistry';

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

/**
 * THỬ TRA CỨU — gõ một câu hỏi, xem CHÍNH những gì trợ lý sẽ nhận được, kèm điểm.
 *
 * Khác hẳn ô lọc ở dưới, và sự khác nhau đó là lý do nó tồn tại:
 *
 *   Ô lọc        — khớp chuỗi con trên danh sách đã tải. Tìm một mục bạn ĐÃ BIẾT là có.
 *   Thử tra cứu  — chạy đúng phép tra của trợ lý (IDF + trọng số trường + thưởng cụm, trộn 50/50
 *                  với ngữ nghĩa). Trả lời "người dùng hỏi câu này thì trợ lý thấy gì".
 *
 * Vì sao cần: sửa `keywords` của một màn hình mà không có bảng này thì chỉ là đoán. Ở đây gõ câu
 * hỏi thật, thấy ngay mục mong muốn đứng hạng mấy và thua ai — rồi mới sửa.
 */
/**
 * SOẠN TỪ Ý TƯỞNG — người viết gõ vài dòng, trợ lý dựng thành bản ghi, NGƯỜI bấm Lưu.
 *
 * Vì sao không để trợ lý tự ghi thẳng vào kho: kho kiến thức là thứ mọi câu trả lời của trợ lý
 * dựa vào. Một mục sai ở đây không sai một lần — nó sai với mọi người hỏi, mãi mãi, cho tới khi
 * có ai đó tình cờ phát hiện. Nên bản nháp rơi vào ĐÚNG cái form sửa tay sẵn có, và đi qua đúng
 * nút Lưu đó; không có đường tắt nào cho máy.
 *
 * Ô `path` để trống là CỐ Ý khi trợ lý không chắc: nút Lưu tự khoá cho tới khi người chọn đường
 * dẫn. Thà bắt người chọn còn hơn nhận một đường dẫn nghe hợp lý mà không tồn tại.
 */
function IdeaDrafter({ showToast, onDraft }) {
  const [idea, setIdea] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);     // { path_note, similar }

  const draft = async () => {
    const text = idea.trim();
    if (text.length < 10) { showToast?.('Viết vài câu để trợ lý hiểu bạn muốn ghi gì', 'err'); return; }
    setBusy(true);
    setNote(null);
    try {
      const { data } = await api.post('/copilotkit/knowledge/draft', { idea: text });
      if (!data?.draft) { showToast?.('Trợ lý không soạn được', 'err'); return; }
      setNote({ path_note: data.path_note, similar: data.similar || [] });
      onDraft?.(data.draft);
      showToast?.('Đã soạn xong — xem lại rồi bấm Lưu');
    } catch (e) {
      showToast?.(e?.response?.data?.error || 'Không soạn được', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-amber-600" />
        <div className="text-sm font-semibold text-gray-900">Soạn từ ý tưởng</div>
        <div className="text-xs text-gray-500">gõ ý thô, trợ lý dựng thành mục kiến thức — bạn duyệt rồi lưu</div>
      </div>

      <textarea
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        rows={3}
        placeholder={'Ví dụ: Trang lịch nghỉ cho đăng ký nghỉ nửa ngày (sáng/chiều), nút nằm trong ô chọn khi bấm vào một ngày nên nhiều người không thấy. Trưởng phòng duyệt thì đơn mới có hiệu lực.'}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white resize-y"
      />

      <div className="flex flex-wrap items-center gap-2 mt-2">
        <button
          type="button"
          onClick={draft}
          disabled={busy || idea.trim().length < 10}
          className="h-9 px-4 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy ? 'Đang soạn…' : 'Nhờ trợ lý soạn'}
        </button>
        <span className="text-xs text-gray-500">Bản nháp mở ra trong form bên dưới; chưa có gì được lưu.</span>
      </div>

      {note?.path_note && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-amber-100 text-amber-900 text-xs flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{note.path_note}</span>
        </div>
      )}

      {/* Kho đã có mục gần giống chưa — chỗ dễ sinh bản trùng nhất, nên hiện ngay cạnh nút. */}
      {note?.similar?.length > 0 && (
        <div className="mt-2 text-xs text-gray-600">
          <div className="font-medium text-gray-700 mb-1">Kho đã có những mục gần giống — cân nhắc SỬA thay vì thêm mới:</div>
          <ul className="space-y-0.5">
            {note.similar.slice(0, 4).map((c) => (
              <li key={`${c.path}#${c.label}`} className="flex gap-2">
                <span className="font-mono text-[11px] text-gray-400 shrink-0">{c.path || '—'}</span>
                <span className="truncate">{c.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * (xem KnowledgeProbe ngay dưới — soạn xong thì dùng nó kiểm lại mục vừa lưu có tra ra không)
 */
function KnowledgeProbe({ showToast }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    const query = q.trim();
    if (!query) return;
    setRunning(true);
    try {
      const { data } = await api.get('/copilotkit/knowledge/search', { params: { q: query, limit: 10 } });
      setRes(data);
    } catch (e) {
      showToast?.(e?.response?.data?.error || 'Không tra cứu được', 'err');
    } finally {
      setRunning(false);
    }
  };

  /** Thanh điểm so theo mục đứng đầu — điểm tuyệt đối không có ý nghĩa tự thân. */
  const top = res?.results?.[0]?.score || 1;

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3">
      <div className="flex items-center gap-2 mb-2">
        <FlaskConical className="h-4 w-4 text-violet-600" />
        <div className="text-sm font-semibold text-gray-900">Thử tra cứu</div>
        <div className="text-xs text-gray-500">chạy đúng phép tra của trợ lý, có chấm điểm</div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
          placeholder='Gõ như người dùng hỏi, ví dụ "nút thêm deal mới ở đâu"'
          className="flex-1 min-w-[260px] h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white"
        />
        <button
          type="button"
          onClick={run}
          disabled={running || !q.trim()}
          className="h-9 px-4 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Tìm kiếm
        </button>
      </div>

      {res && (
        <div className="mt-3">
          <div className="text-xs text-gray-600 mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{res.results.length} kết quả · {res.ms} ms</span>
            {res.hybrid ? (
              <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">
                lai 50% từ khoá + 50% ngữ nghĩa · {(res.vectors?.total || 0) - (res.vectors?.missing || 0)}/{res.vectors?.total || 0} mục đã nhúng
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 font-medium">
                thuần từ khoá (tra cứu lai đang tắt hoặc chưa có vector)
              </span>
            )}
            {res.vectors?.missing > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
                {res.vectors.missing} mục chưa nhúng — vòng lặp nền đang bù
              </span>
            )}
          </div>

          {res.results.length === 0 ? (
            <div className="text-sm text-gray-500 py-3">
              Không mục nào khớp. Trợ lý sẽ phải nói là không tìm thấy.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="py-1.5 pr-2 w-8">#</th>
                    <th className="py-1.5 pr-2">Mục</th>
                    <th className="py-1.5 pr-2 w-40">Điểm tổng</th>
                    <th className="py-1.5 pr-2 w-28">Từ khoá</th>
                    <th className="py-1.5 pr-2 w-28">Ngữ nghĩa</th>
                  </tr>
                </thead>
                <tbody>
                  {res.results.map((x) => (
                    <tr key={`${x.path}#${x.label}`} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-2 text-gray-400 tabular-nums">{x.rank}</td>
                      <td className="py-2 pr-2">
                        <div className="font-medium text-gray-900">{x.label}</div>
                        <div className="font-mono text-[11px] text-gray-500">{x.path}</div>
                        {x.keywords?.length > 0 && (
                          <div className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[420px]">
                            {x.keywords.join(' · ')}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        <div className="h-2 w-full rounded bg-gray-100 overflow-hidden flex">
                          <div className="h-full bg-indigo-500" style={{ width: `${100 * (x.keyword_part / top)}%` }} />
                          <div className="h-full bg-violet-400" style={{ width: `${100 * (x.semantic_part / top)}%` }} />
                        </div>
                        <div className="text-[11px] text-gray-500 tabular-nums mt-0.5">{x.score.toFixed(3)}</div>
                      </td>
                      <td className="py-2 pr-2 tabular-nums text-xs">
                        {x.keyword_rank ? (
                          <>
                            <div className="text-indigo-700 font-medium">{x.keyword_part.toFixed(3)}</div>
                            <div className="text-gray-400">hạng {x.keyword_rank} · thô {Math.round(x.keyword_raw || 0)}</div>
                          </>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2 pr-2 tabular-nums text-xs">
                        {x.semantic_rank ? (
                          <>
                            <div className="text-violet-700 font-medium">{x.semantic_part.toFixed(3)}</div>
                            <div className="text-gray-400">hạng {x.semantic_rank} · cos {(x.semantic_cos || 0).toFixed(3)}</div>
                          </>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-[11px] text-gray-400 mt-1.5">
                Thanh <span className="text-indigo-600 font-medium">xanh</span> = phần từ khoá,
                {' '}<span className="text-violet-600 font-medium">tím</span> = phần ngữ nghĩa.
                {' '}Trợ lý chỉ nhận 5 mục đầu.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Đường dẫn CÓ THẬT trong ứng dụng, lấy từ bản đồ màn hình do generator sinh.
 *
 * Ô đường dẫn trước đây là text tự do: gõ sai một ký tự là tạo ra một mục kiến thức trỏ tới
 * trang không tồn tại, và không có gì kêu. Trợ lý sau đó tự tin chỉ người dùng tới trang trắng —
 * hỏng theo đúng kiểu khó lần nhất, vì bản ghi trông hoàn toàn bình thường.
 */
const KNOWN_PATHS = SCREEN_REGISTRY.map((x) => x.path);
const SCREEN_BY_PATH = new Map(SCREEN_REGISTRY.map((x) => [x.path, x]));

/**
 * Đường dẫn này có neo được vào một màn hình thật không.
 *
 * Chấp nhận cả dạng con `/crm/leads/:id#tab-dat-hang`: mục con là chuyện bình thường trong kho
 * (lead-detail.json toàn loại đó), và phần trước dấu `#` mới là thứ phải tồn tại.
 */
function pathKnown(p) {
  const raw = String(p || '').trim();
  if (!raw) return true;                       // chưa gõ gì thì chưa phải lúc kêu
  return SCREEN_BY_PATH.has(raw.split('#')[0]);
}

/**
 * ĐỦ HAY THIẾU — bốn trường quyết định một mục có tra ra được và có hướng dẫn nổi hay không.
 *
 * Thứ tự cố ý theo mức thiệt hại khi thiếu, không theo thứ tự trong lược đồ:
 *   mô tả   — thiếu thì không ai biết màn hình để làm gì
 *   từ khoá — thiếu thì gần như KHÔNG BAO GIỜ được tra ra (trọng số cao nhất khi chấm điểm)
 *   sâu     — thiếu thì trợ lý chỉ đọc lại được tên nút, không hướng dẫn được
 *   nút     — thiếu thì trợ lý không bấm hộ được
 */
const PARTS = [
  { id: 'summary',  nhan: 'mô tả',   co: (x) => !!x.summary },
  { id: 'keywords', nhan: 'từ khoá', co: (x) => (x.keywords || []).length > 0 },
  { id: 'content',  nhan: 'sâu',     co: (x) => !!x.content },
  { id: 'actions',  nhan: 'nút',     co: (x) => (x.actions || []).length > 0 },
];

/** Module của một mục = đoạn đầu đường dẫn. Luôn có, khác `menu` (79/334 bỏ trống). */
function moduleOf(x) {
  return (String(x.path || '/').split('/')[1] || '(gốc)').split('#')[0];
}

/**
 * Thanh bốn vạch: đặc = có, rỗng = thiếu.
 *
 * Vì sao là thanh chứ không phải chữ: danh sách 334 dòng thì đọc chữ từng dòng là không đọc. Bốn
 * vạch cùng vị trí trên mọi dòng cho phép LƯỚT — chỗ nào rỗng nhiều là chỗ cần làm, thấy được
 * mà không cần đọc.
 */
function Completeness({ x }) {
  const thieu = PARTS.filter((p) => !p.co(x));
  return (
    <span
      className="inline-flex items-center gap-[3px] shrink-0"
      title={thieu.length ? `Thiếu: ${thieu.map((p) => p.nhan).join(', ')}` : 'Đầy đủ cả bốn phần'}
    >
      {PARTS.map((p) => (
        <span
          key={p.id}
          className={`w-1.5 h-3.5 rounded-[1px] ${p.co(x) ? 'bg-emerald-500' : 'bg-gray-200'}`}
        />
      ))}
    </span>
  );
}

/**
 * SOẠN HÀNG LOẠT nội dung sâu — chạy theo lô, NGƯỜI duyệt từng bản.
 *
 * ═══════════════ VÌ SAO KHÔNG TỰ LƯU ═══════════════
 *
 * 157 mục đủ chất liệu là quá nhiều để mở từng hộp thoại, nhưng cũng là quá nhiều để tin máy ghi
 * thẳng vào kho — kho kiến thức là thứ mọi câu trả lời dựa vào, một mục sai ở đây sai với mọi
 * người hỏi cho tới khi có ai tình cờ phát hiện.
 *
 * Nên đường giữa: máy soạn cả lô, người duyệt bằng MỘT cú bấm mỗi mục thay vì mở-đọc-đóng. Công
 * đọc vẫn còn nguyên, chỉ bỏ đi phần thao tác.
 *
 * ═══════════════ LÔ NHỎ, CÓ CHỦ Ý ═══════════════
 *
 * Tám mục một lượt. Nhiều hơn thì request treo hàng phút và người dùng không biết nó còn sống
 * không; ít hơn thì bấm quá nhiều lần. Tám là vừa một màn hình duyệt không phải cuộn.
 */
function BulkDraft({ items, busy, onSaved, showToast }) {
  const [running, setRunning] = useState(false);
  const [queue, setQueue] = useState([]);     // bản đã soạn, chờ duyệt
  const [skipped, setSkipped] = useState([]); // mục bị bỏ qua, kèm lý do
  const [model, setModel] = useState('');
  const [savingKey, setSavingKey] = useState('');

  /** Chỉ mục ĐỦ CHẤT LIỆU. Server kiểm lại lần nữa — đây chỉ là để nút nói đúng con số. */
  const duChatLieu = items.filter((x) => (x.actions || []).length > 0 && x.summary);
  const conLai = duChatLieu.filter((x) => !queue.some((q) => q.path === x.path && q.label === x.label));

  const run = async () => {
    setRunning(true);
    try {
      const lo = conLai.slice(0, 8).map((x) => ({ path: x.path, label: x.label }));
      const { data } = await api.post('/copilotkit/knowledge/draft-bulk', { items: lo });
      setModel(data.model || '');
      setQueue((cu) => [...cu, ...(data.results || []).filter((r) => r.ok)]);
      setSkipped((cu) => [...cu, ...(data.results || []).filter((r) => !r.ok)]);
      if (!data.da_soan) showToast?.('Lô này không soạn được mục nào — xem lý do bên dưới', 'err');
    } catch (e) {
      showToast?.(e?.response?.data?.error || 'Không soạn được', 'err');
    } finally {
      setRunning(false);
    }
  };

  const luu = async (r) => {
    const key = `${r.source}::${r.path}`;
    setSavingKey(key);
    try {
      // Chỉ gửi `content`: PUT nhận patch, nên các trường khác giữ nguyên. Gửi cả bản ghi là
      // mời một trường cũ trên màn hình ghi đè lên bản vừa ai đó sửa ở tab khác.
      const { data } = await api.put('/copilotkit/knowledge', {
        source: r.source, path: r.path, content: r.content,
      });
      if (data?.ok === false) { showToast?.(data.reason || 'Không lưu được', 'err'); return; }
      setQueue((cu) => cu.filter((x) => x !== r));
      onSaved?.();
    } catch (e) {
      showToast?.(e?.response?.data?.reason || 'Không lưu được', 'err');
    } finally {
      setSavingKey('');
    }
  };

  if (!duChatLieu.length && !queue.length && !skipped.length) return null;

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Layers className="h-4 w-4 text-emerald-700" />
        <div className="text-sm font-semibold text-gray-900">Soạn hàng loạt nội dung sâu</div>
        <div className="text-xs text-gray-600">
          {duChatLieu.length} mục đủ chất liệu trong danh sách đang lọc
          {items.length > duChatLieu.length && (
            <> · {items.length - duChatLieu.length} mục thiếu nhãn nút nên bỏ qua</>
          )}
        </div>
        <button
          type="button"
          onClick={run}
          disabled={running || busy || !conLai.length}
          className="ml-auto h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
          {running ? 'Đang soạn…' : `Soạn ${Math.min(8, conLai.length)} mục tiếp theo`}
        </button>
      </div>

      {model && (
        <div className="text-[11px] text-gray-500 mt-1">
          Dùng model nhỏ <span className="font-mono">{model}</span> — việc ở đây là diễn đạt lại
          nhãn nút đã có, không phải suy luận. Cần sâu hơn thì mở trang đó rồi bấm “Quét &amp; cập nhật”.
        </div>
      )}

      {queue.map((r) => (
        <div key={`${r.source}::${r.path}`} className="mt-2 rounded-lg border border-gray-200 bg-white p-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900">{r.label}</span>
            <span className="text-[11px] font-mono text-gray-400">{r.path}</span>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => luu(r)}
                disabled={!!savingKey}
                className="h-7 px-2.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1"
              >
                {savingKey === `${r.source}::${r.path}`
                  ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Lưu
              </button>
              <button
                type="button"
                onClick={() => setQueue((cu) => cu.filter((x) => x !== r))}
                className="h-7 px-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                Bỏ qua
              </button>
            </div>
          </div>

          {r.transient?.length > 0 && (
            <div className="mt-1.5 px-2 py-1 rounded bg-rose-50 border border-rose-200 text-[11px] text-rose-800">
              Còn dữ liệu của thời điểm này: {[...new Set(r.transient.map((t) => t.mau))].join(' · ')} — sửa trước khi lưu.
            </div>
          )}

          <div className="text-xs text-gray-700 whitespace-pre-wrap mt-1.5 max-h-44 overflow-y-auto">
            {r.content}
          </div>
        </div>
      ))}

      {skipped.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-gray-500 cursor-pointer">
            {skipped.length} mục bị bỏ qua — vì sao
          </summary>
          <ul className="mt-1 space-y-0.5">
            {skipped.map((r) => (
              <li key={`${r.path}::${r.label}`} className="text-[11px] text-gray-600 flex gap-2">
                <span className="font-mono text-gray-400 shrink-0">{r.path}</span>
                <span>{r.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export default function GuideKnowledgeTab({ showToast }) {
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState([]);
  const [storage, setStorage] = useState(null);
  const [readOnly, setReadOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  /** Các phần ĐANG lọc theo "thiếu". Nhiều chip = AND — thiếu cả hai mới hiện. */
  const [missing, setMissing] = useState([]);
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

  /** Module kèm số mục, nhiều trước — 53 nhóm với cái đuôi dài toàn 1 mục nên phải xếp theo số. */
  const modulesAvailable = useMemo(() => {
    const m = new Map();
    for (const x of list) {
      if (x.discarded_at) continue;
      const k = moduleOf(x);
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [list]);

  /**
   * Đếm cho từng chip "thiếu".
   *
   * Đếm trên TOÀN kho (trừ mục đã bỏ), không đếm trên danh sách đang lọc: con số này là để trả
   * lời "còn bao nhiêu việc", và nó phải giữ nguyên khi người dùng bật tắt chip — nếu nó tụt
   * theo bộ lọc thì bật chip xong sẽ tưởng việc vừa ít đi.
   */
  const missingCounts = useMemo(() => {
    const live = list.filter((x) => !x.discarded_at);
    const out = {};
    for (const p of PARTS) out[p.id] = live.filter((x) => !p.co(x)).length;
    return out;
  }, [list]);

  const loc = useMemo(() => {
    const t = search.trim().toLowerCase();
    return list.filter((x) => {
      if (!showDiscarded && x.discarded_at) return false;
      if (sourceFilter && x.source !== sourceFilter) return false;
      if (moduleFilter && moduleOf(x) !== moduleFilter) return false;
      for (const id of missing) {
        const p = PARTS.find((q) => q.id === id);
        if (p && p.co(x)) return false;
      }
      if (!t) return true;
      return `${x.path} ${x.label} ${x.summary} ${(x.keywords || []).join(' ')}`.toLowerCase().includes(t);
    });
  }, [list, search, sourceFilter, moduleFilter, missing, showDiscarded]);

  const toggleMissing = (id) => setMissing((cu) => (cu.includes(id) ? cu.filter((k) => k !== id) : [...cu, id]));

  const call = async (fn, thanhCong, note) => {
    setBusy(true);
    try {
      const { data } = await fn();
      if (data?.ok === false) { showToast?.(data.reason || 'Không thực hiện được', 'err'); return false; }
      showToast?.(note ? note(data) || thanhCong : thanhCong);
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
      /**
       * NÓI RA khi mục vừa lưu KHÔNG nhúng được vector.
       *
       * Im lặng ở đây là đúng loại suy thoái âm thầm mà cả tính năng này sinh ra để tránh: mục
       * vẫn lưu thành công, vẫn tra được bằng từ khoá, chỉ là mất tầng ngữ nghĩa — và không ai
       * biết cho tới khi tình cờ thấy nó không ra trong "Thử tra cứu".
       */
      (data) => {
        if (!data?.vector || data.vector === 'ok') return null;
        const why = data.vector === 'embedding_off' ? 'tính năng nhúng đang tắt'
          : data.vector === 'embed_failed' ? 'gọi nhúng không thành công'
            : data.vector;
        return `Đã lưu, nhưng chưa nhúng được vector (${why}) — mục này tạm thời chỉ tra được bằng từ khoá.`;
      },
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

      <IdeaDrafter
        showToast={showToast}
        onDraft={(d) => { setIsNew(true); setEditing(d); }}
      />

      <KnowledgeProbe showToast={showToast} />

      <div className="rounded-xl border border-gray-200 bg-white p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Lọc danh sách bên dưới theo đường dẫn, tên, từ khoá…"
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
        {/* Module = đoạn đầu đường dẫn. Dùng ô chọn chứ không chip: 53 nhóm với cái đuôi dài
            toàn 1 mục, bày hết thành chip là lấp mất thanh lọc. */}
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="h-9 px-2 rounded-lg border border-gray-200 text-sm bg-white"
        >
          <option value="">Mọi module</option>
          {modulesAvailable.map(([k, n]) => (
            <option key={k} value={k}>/{k} ({n})</option>
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

      {/* HÀNG VIỆC CẦN LÀM.
          Đặt ngay dưới thanh lọc, trên danh sách, vì đây là thứ trả lời "làm gì tiếp theo" —
          trước khi có nó, 246 mục thiếu nội dung sâu nằm lẫn trong 334 dòng và không có cách nào
          tìm ra. Bấm một chip là danh sách bên dưới thành đúng hàng việc đó. */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        <span className="text-xs text-gray-500">Còn thiếu:</span>
        {PARTS.map((p) => {
          const n = missingCounts[p.id] || 0;
          const on = missing.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggleMissing(p.id)}
              disabled={!n && !on}
              title={n ? `Lọc ${n} mục chưa có ${p.nhan}` : `Mọi mục đều đã có ${p.nhan}`}
              className={`h-7 px-2.5 rounded-full text-xs font-medium border cursor-pointer disabled:cursor-default disabled:opacity-45 ${
                on
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {p.nhan} <span className="tabular-nums opacity-80">{n}</span>
            </button>
          );
        })}
        {(missing.length > 0 || moduleFilter) && (
          <button
            type="button"
            onClick={() => { setMissing([]); setModuleFilter(''); }}
            className="h-7 px-2 rounded-full text-xs text-gray-500 hover:bg-gray-100 cursor-pointer"
          >
            bỏ lọc
          </button>
        )}
      </div>

      {/* Chỉ hiện khi đang lọc "thiếu sâu": công cụ này chỉ có nghĩa với đúng hàng việc đó, bày
          sẵn ở mọi lúc là một nút to mời bấm nhầm vào cả kho. */}
      {missing.includes('content') && (
        <BulkDraft
          items={loc}
          busy={busy || readOnly}
          onSaved={load}
          showToast={showToast}
        />
      )}

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
          <Completeness x={x} />
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
            <Field
              label="Đường dẫn (bắt buộc)"
              note="Gõ để lọc trong danh sách màn hình có thật, hoặc thêm #neo cho một mục con."
            >
              <input
                value={x.path}
                onChange={(e) => {
                  const v = e.target.value;
                  setField('path', v);
                  // Chọn trúng một màn hình có thật thì điền hộ tên và menu — hai trường đó đã
                  // nằm sẵn trong bản đồ màn hình, bắt gõ lại là mời sai lệch vào.
                  const m = SCREEN_BY_PATH.get(v.trim());
                  if (m) {
                    if (!x.label) setField('label', m.label || '');
                    if (!x.menu && m.menu) setField('menu', m.menu);
                  }
                }}
                list="kb-known-paths"
                className={inputCss}
                placeholder="/crm/..."
              />
              <datalist id="kb-known-paths">
                {KNOWN_PATHS.map((v) => <option key={v} value={v} />)}
              </datalist>
              {!pathKnown(x.path) && (
                <div className="mt-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  Không có màn hình nào ở đường dẫn này. Lưu vẫn được, nhưng trợ lý sẽ chỉ người
                  dùng tới một trang không tồn tại — kiểm lại, hoặc chạy <code>npm run guide:sync</code>
                  nếu đây là route mới thêm.
                </div>
              )}
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
