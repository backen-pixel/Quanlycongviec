/**
 * Bảng "Hành động của trợ lý" — dán cạnh BÊN TRÁI khung chat. Hai tab:
 *
 *  • Hành động: dòng thời gian từng lượt. Bấm một dòng để mở DỮ LIỆU THÔ ĐẦY ĐỦ của bước đó —
 *    tham số tool, kết quả tool, nguyên văn suy luận, nguyên văn câu trả lời.
 *  • Ngữ cảnh: chỉ dẫn hệ thống THẬT (lấy từ backend) + toàn bộ readable đang gửi lên model
 *    mỗi lượt, mở ra xem được giá trị đầy đủ.
 *
 * Nguồn dữ liệu:
 *  - `useAgent()` → `agent.messages` cho dòng thời gian. KHÔNG dùng
 *    `useCopilotChatHeadless_c()`: hook đó là đầu chat thứ hai, dùng chung object `agent` với
 *    CopilotSidebar, và effect dọn dẹp của nó gọi `agent.detachActiveRun()` trên agent chung →
 *    cắt lượt đang chờ kết quả action (docs/guide-assistant-current.md §11).
 *  - `useCopilotKit().copilotkit.context` cho readable. Đây là ĐÚNG cái gửi lên model, không
 *    phải bản tự tính lại — tự tính lại thì bảng sẽ nói dối mỗi khi việc đăng ký context lỗi.
 *  - `GET /api/copilotkit/debug/prompt` cho chỉ dẫn hệ thống. Không hard-code lại prompt ở
 *    frontend: hai bản sẽ lệch nhau ngay lần sửa prompt đầu tiên và bảng thành nguồn sai.
 *
 * Vị trí: ĐO thật rect của khung chat rồi đặt theo, không tính bằng biến CSS
 * `--copilot-popup-*`. Lý do: khung thật nằm trong một wrapper `position: fixed` của thư viện
 * (inset do thư viện tự tính, z-index 1200) nên các biến kia không phản ánh vị trí/kích thước
 * thực tế. Đo lại theo nhịp — khung chat mount/unmount và đổi kích thước theo viewport.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GuidePageKnowledge from './GuidePageKnowledge';
import { useAgent, useCopilotKit } from '@copilotkit/react-core/v2';
import { deriveAgentActions, countRealActions } from './lib/agentActions';
import { FULL_ACCESS } from './lib/guideAccess';
import { fullAccessStillOn, onFullAccessChange } from './lib/guideUiFlags';
import { REGION_MAP_CONTEXT, parseRegionMap } from './lib/regionTools';
import GuideRegionMap from './GuideRegionMap';
import api from '../../lib/api';

// Khung chat là CopilotSidebar dán mép phải (`[data-copilot-sidebar]`), không còn popup nổi.
const POPUP_SELECTOR = '[data-copilot-sidebar]';
const PANEL_W = 288;
const PANEL_W_WIDE = 560; // đủ để đọc JSON nhiều tầng mà không phải cuộn ngang liên tục
const GAP = 12;
const EDGE = 8;
const MIN_PANEL_W = 208; // dưới mức này thì chữ vỡ hết, thà ẩn đi
const MEASURE_MS = 300; // đủ mượt cho mắt, một getBoundingClientRect mỗi nhịp
const CONTEXT_POLL_MS = 1000;
const USAGE_POLL_MS = 3000;

const LS_HIDDEN = 'guide.activity.hidden';
const LS_WIDE = 'guide.activity.wide';
const LS_TAB = 'guide.activity.tab';

/** Đo khung chat để dán panel vào cạnh trái nó. null = khung chat đang đóng. */
function usePopupAnchor() {
  const [box, setBox] = useState(null);

  useEffect(() => {
    const measure = () => {
      const el = document.querySelector(POPUP_SELECTOR);
      if (!el) {
        setBox((prev) => (prev === null ? prev : null));
        return;
      }
      const r = el.getBoundingClientRect();
      const next = { left: Math.round(r.left), top: Math.round(r.top), height: Math.round(r.height) };
      setBox((prev) => {
        if (prev && prev.left === next.left && prev.top === next.top && prev.height === next.height) return prev;
        return next;
      });
    };

    measure();
    const id = setInterval(measure, MEASURE_MS);
    window.addEventListener('resize', measure);
    return () => {
      clearInterval(id);
      window.removeEventListener('resize', measure);
    };
  }, []);

  return box;
}

/**
 * Ảnh chụp readable đang đăng ký với core.
 *
 * Poll thay vì subscribe `contextChanged`: tên/hình dạng của kênh subscribe là API nội bộ của
 * thư viện, đổi bản là bảng im lặng ngừng cập nhật mà không ai biết. Poll thì kém sang nhưng
 * hỏng thì hỏng rõ. CHỈ chạy khi tab Ngữ cảnh đang mở — đóng tab là không tốn gì.
 */
function useContextSnapshot(copilotkit, active) {
  const [snap, setSnap] = useState([]);

  useEffect(() => {
    if (!active || !copilotkit) return undefined;
    let lastSig = '';
    const read = () => {
      let entries = [];
      try {
        const store = copilotkit.context || {};
        entries = Object.entries(store).map(([id, c]) => ({
          id,
          description: c?.description || '(không mô tả)',
          value: c?.value,
          agentIds: c?.agentIds,
        }));
      } catch (e) {
        entries = [{ id: 'loi', description: 'Không đọc được context của core', value: String(e?.message || e) }];
      }
      // So chữ ký ĐẦY ĐỦ (kể cả value) rồi mới setState. Bỏ qua bước này là mỗi nhịp poll đều
      // tạo mảng mới → React re-render bảng mỗi giây dù chẳng có gì đổi. Stringify vài KB một
      // giây là không đáng kể, và nó chỉ chạy khi tab Ngữ cảnh đang mở.
      let sig;
      try { sig = JSON.stringify(entries); } catch { sig = String(entries.length); }
      if (sig === lastSig) return;
      lastSig = sig;
      setSnap(entries);
    };
    read();
    const id = setInterval(read, CONTEXT_POLL_MS);
    return () => clearInterval(id);
  }, [copilotkit, active]);

  return snap;
}

/**
 * Token + tiền của từng lượt gọi model, từ `GET /api/copilotkit/debug/usage`.
 *
 * Phải lấy từ backend: `BuiltInAgent` không phát usage qua AG-UI và giao thức không có event
 * mang token, nên client KHÔNG có cách nào tự biết (xem helpers/guideUsage.js). Poll khi bảng
 * đang mở, và nạp lại ngay khi số hành động đổi — số liệu chỉ có SAU khi lượt chạy kết thúc.
 */
/**
 * Sổ SỰ KIỆN PHÍA SERVER của lượt hỏi — thứ luồng message không cho thấy.
 *
 * Tách khỏi `useUsage` vì hai sổ trả lời hai câu khác nhau: usage nói "tốn bao nhiêu", sổ này nói
 * "đã đi qua những đâu". Gộp vào một endpoint thì mỗi lần mở tab Chi phí lại kéo thêm dữ liệu
 * không dùng, và ngược lại.
 */
/**
 * `running` LÀ KHOÁ NẠP LẠI QUAN TRỌNG NHẤT — không phải `tick`.
 *
 * Bản trước chỉ nạp lại khi `actions.length` đổi, tức khi có thêm một bước tool. Nhưng thủ thư,
 * ghi kinh nghiệm và sắc mặt đều chạy SAU bước tool cuối cùng, lúc `actions.length` đã đứng yên
 * — nên chúng không bao giờ tự hiện ra. Đã đo trên màn hình thật: server trả về sự kiện, sơ đồ
 * không có node nào cho nó, và chỉ hiện sau khi bấm sang tab khác rồi quay lại.
 *
 * Nên nạp thêm một nhịp TRỄ sau khi lượt chạy xong. 2,5 giây là vì client còn phải POST
 * `/experience` rồi server mới gọi thủ thư — hỏi ngay lúc `isRunning` tắt thì vẫn sớm.
 */
function useFlow(threadId, active, tick, running) {
  const [data, setData] = useState(null);
  const wasRunning = useRef(false);

  useEffect(() => {
    if (!active || !threadId) return undefined;
    let cancelled = false;
    let timer = null;

    const load = () => api.get('/copilotkit/debug/flow', { params: { thread_id: threadId } })
      .then((r) => { if (!cancelled) setData({ events: r.data?.events || [], layers: r.data?.layers || [] }); })
      .catch(() => { if (!cancelled) setData({ events: [], layers: [] }); });

    load();
    // Vừa chuyển từ ĐANG CHẠY sang XONG → còn sự kiện về muộn, hỏi lại một nhịp nữa.
    if (wasRunning.current && !running) timer = setTimeout(load, 2500);
    wasRunning.current = !!running;

    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [threadId, active, tick, running]);

  return data;
}

function useUsage(threadId, active, tick) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!active || !threadId) return undefined;
    let alive = true;
    const load = () => {
      api.get('/copilotkit/debug/usage', { params: { thread_id: threadId } })
        .then((res) => { if (alive) setData(res.data); })
        .catch(() => { /* 403 trên production cho người không phải admin — bỏ qua im lặng */ });
    };
    load();
    const id = setInterval(load, USAGE_POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [threadId, active, tick]);

  return data;
}

function usd(n) {
  if (n == null) return '—';
  if (n === 0) return '$0';
  return n < 0.01 ? `$${n.toFixed(5)}` : `$${n.toFixed(4)}`;
}

function vnd(n) {
  if (n == null) return '—';
  return `${Math.round(n).toLocaleString('vi-VN')}đ`;
}

function num(n) {
  return Number(n || 0).toLocaleString('vi-VN');
}

/**
 * Chỉ dẫn hệ thống thật — nạp lười (chỉ khi mở tab Ngữ cảnh), và NẠP LẠI khi quyền đổi.
 *
 * Bản trước nạp đúng MỘT lần cho cả phiên. Hệ quả: tắt toàn quyền ở cài đặt xong, mở tab Ngữ
 * cảnh vẫn thấy nguyên bộ chỉ dẫn chế độ toàn quyền cũ — bảng soi lỗi mà lại nói sai về chính
 * thứ nó sinh ra để soi. Nay `quyen` nằm trong danh sách phụ thuộc nên đổi là hỏi lại.
 */
function useSystemPrompt(active, quyen) {
  const [state, setState] = useState({ status: 'idle', data: null, error: null });

  // Quyền đổi → vứt bản đã nạp, để effect dưới hỏi lại từ đầu.
  useEffect(() => { setState({ status: 'idle', data: null, error: null }); }, [quyen]);

  useEffect(() => {
    if (!active || state.status !== 'idle') return;
    setState({ status: 'loading', data: null, error: null });
    // PHẢI gửi kèm cờ chế độ. Server nay trả bản chỉ dẫn ĐÚNG CHẾ ĐỘ (xem helpers/guidePrompt.js);
    // thiếu header thì nó rơi về bản chế độ đọc và bảng này báo sai số ký tự — đã tái hiện: bật
    // toàn quyền, panel vẫn hiện 9.165 trong khi bản thật gửi đi là 11.516.
    api.get('/copilotkit/debug/prompt', { headers: { 'x-guide-full-access': quyen ? '1' : '0' } })
      .then((res) => setState({ status: 'done', data: res.data, error: null }))
      .catch((e) => setState({
        status: 'error',
        data: null,
        error: e?.response?.status === 403
          ? 'Chỉ admin xem được chỉ dẫn hệ thống trên bản production.'
          : (e?.message || 'Không tải được'),
      }));
  }, [active, state.status, quyen]);

  return state;
}

/**
 * Định dạng để đọc. Phải xử lý CHUỖI CHỨA JSON, không chỉ object:
 * core lưu value của readable dưới dạng chuỗi đã `JSON.stringify` (đo được: readable "Giá trị
 * THẬT của bộ lọc" ra một dòng dài duỗi hết), và kết quả tool qua AG-UI cũng luôn là chuỗi.
 * Không thụt lại thì khối dữ liệu thô vô dụng — đúng thứ cần đọc lại là thứ khó đọc nhất.
 */
function pretty(value) {
  if (value == null) return String(value);
  if (typeof value === 'string') {
    const t = value.trim();
    const looksJson = (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
    if (looksJson) {
      try {
        return JSON.stringify(JSON.parse(t), null, 2);
      } catch { /* chuỗi thường bắt đầu bằng { — cứ hiện nguyên văn */ }
    }
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value); // vòng tham chiếu — không nên xảy ra với dữ liệu thuần, nhưng đừng nổ
  }
}

function StatusDot({ status }) {
  return <span className={`guide-act__dot guide-act__dot--${status}`} aria-hidden="true" />;
}

/** Khối dữ liệu thô + nút copy. `<pre>` cuộn ngang riêng, không đẩy bề ngang panel. */
function RawBlock({ value }) {
  const [copied, setCopied] = useState(false);
  const text = pretty(value);

  const copy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false); // clipboard bị chặn (không https / không quyền) — im lặng, không chặn UI
    }
  };

  return (
    <div className="guide-act__raw">
      <button type="button" className="guide-act__copy" onClick={copy}>
        {copied ? '✓ đã copy' : 'copy'}
      </button>
      <pre>{text}</pre>
    </div>
  );
}

function ActionRow({ item, open, onToggle }) {
  if (item.type === 'turn') {
    return (
      <li className="guide-act__turn">
        <button type="button" className="guide-act__turn-btn" onClick={() => onToggle(item.key)}>
          <span className="guide-act__turn-label">{item.label}</span>
          {item.detail ? <span className="guide-act__turn-text">{item.detail}</span> : null}
        </button>
        {open && item.raw ? <RawBlock value={item.raw} /> : null}
      </li>
    );
  }

  const canOpen = !!item.raw;
  return (
    <li className={`guide-act__row guide-act__row--${item.status}`}>
      <button
        type="button"
        className="guide-act__rowbtn"
        onClick={() => canOpen && onToggle(item.key)}
        aria-expanded={canOpen ? open : undefined}
      >
        <span className="guide-act__icon" aria-hidden="true">{item.icon}</span>
        <span className="guide-act__body">
          <span className="guide-act__label">
            {item.label}
            <StatusDot status={item.status} />
            {canOpen ? <span className="guide-act__more" aria-hidden="true">{open ? '−' : '+'}</span> : null}
          </span>
          {item.detail ? <span className="guide-act__detail">{item.detail}</span> : null}
          {item.note ? <span className="guide-act__note">{item.note}</span> : null}
        </span>
      </button>
      {open && canOpen ? <RawBlock value={item.raw} /> : null}
    </li>
  );
}

/* ═══════════════════════ Tab LUỒNG ═══════════════════════
 *
 * Ghép HAI nguồn vốn không nhìn thấy nhau:
 *   · các bước tool — lấy từ luồng message của CopilotKit (phía client, đã đúng thứ tự);
 *   · sự kiện middleware — lấy từ `/debug/luong` (phía server: dò kinh nghiệm, nhúng, cứu hộ,
 *     trần bước).
 *
 * KHÔNG ghép theo mốc thời gian: bước tool phía client KHÔNG có mốc, và lấy giờ của hai máy khác
 * nhau ra so là cách chắc chắn để xếp sai thứ tự. Ghép theo SỐ BƯỚC: mỗi sự kiện server đều mang
 * `step_count` đếm đúng cùng một thứ mà `doTinHieuBi` đếm, nên chèn sau bước thứ N là đúng chỗ.
 * Riêng lần dò kinh nghiệm đầu lượt luôn đứng trước bước 1.
 */
/** Khoá phải khớp `type` do guideFlow.js ghi — đổi một bên là node mất icon và về màu mặc định. */
const NODE_STYLE = {
  experience: { icon: '🧠', color: '#a78bfa' },
  rescue: { icon: '🛟', color: '#fbbf24' },
  step_guard: { icon: '🛑', color: '#f87171' },
  learn: { icon: '📚', color: '#34d399' },
  experience_write: { icon: '💾', color: '#34d399' },
  tool: { icon: '🔧', color: '#38bdf8' },
  model: { icon: '💭', color: '#a78bfa' },
  // Ba khoá dưới đây từng THIẾU, nên node tương ứng rơi về icon '•' và màu mặc định — nhìn
  // giống hệt một loại sự kiện không ai biết tên. Thêm vào cùng lúc với chúng ở guideFlow.js.
  greeting: { icon: '👋', color: '#94a3b8' },
  mood: { icon: '🙂', color: '#fb923c' },
  embed_backfill: { icon: '🧩', color: '#94a3b8' },
  edge: { icon: '•', color: 'currentColor' },
};

function eventText(e) {
  if (e.type === 'experience') {
    if (!e.found) return { name: 'Dò kinh nghiệm — không có gì khớp', sub: `${e.ms} ms` };
    const source = e.tier === 'hybrid'
      ? `${e.by_keyword} theo chữ + ${e.by_semantic} theo nghĩa`
      : `${e.found} theo chữ`;
    const sub = [source, e.embed_ms ? `nhúng ${e.embed_ms} ms` : null, `${e.ms} ms`]
      .filter(Boolean).join(' · ');
    return { name: `Chèn ${e.found} kinh nghiệm`, sub };
  }
  if (e.type === 'rescue') {
    return e.mode === 'stop'
      ? { name: 'Cứu hộ — hết gợi ý, chèn lời DỪNG', sub: `bước ${e.steps} · ${e.signals} tín hiệu bí` }
      : { name: `Cứu hộ — chèn ${e.found} gợi ý khác`, sub: `bước ${e.steps} · ${e.signals} tín hiệu bí` };
  }
  if (e.type === 'step_guard') {
    return e.mode === 'stop'
      ? { name: 'Trần bước — CHẶN, cấm gọi tool', sub: `bước ${e.steps}` }
      : { name: 'Trần bước — nhắc sắp hết', sub: `bước ${e.steps} · còn ${e.remaining}` };
  }
  /**
   * THỦ THƯ (học nền) — chạy SAU khi lượt kết thúc nên nó không nằm trong sơ đồ theo bước, nhưng
   * vẫn phải hiện: đây là chỗ duy nhất người soi biết kho có được ghi hay không.
   */
  if (e.type === 'learn') {
    const label = {
      add: 'Thủ thư — ghi kinh nghiệm MỚI',
      append: 'Thủ thư — bổ sung vào bản có sẵn',
      replace: 'Thủ thư — SỬA bản cũ',
      skip: 'Thủ thư — bỏ qua, kho đã đủ',
    }[e.action] || 'Thủ thư';
    const sub = [e.code ? `[${e.code}]` : null, e.reason || null,
      e.candidates != null ? `${e.candidates} ứng viên` : null].filter(Boolean).join(' · ');
    return { name: label, sub };
  }
  /**
   * LƯỢT CHÀO HỎI — phải hiện, vì nó giải thích vì sao lượt này không có bước nào.
   *
   * Không có dòng này thì người soi nhìn một lượt trống trơn rồi tưởng trợ lý hỏng, trong khi đó
   * là đường tắt cố ý: gỡ tool, gỡ suy luận, để model chỉ viết một câu chào.
   */
  if (e.type === 'greeting') {
    return { name: 'Lượt chào hỏi — bỏ tool và suy luận', sub: 'trả lời thẳng, không tra cứu' };
  }
  if (e.type === 'experience_write') {
    return {
      name: e.saved ? 'Ghi kinh nghiệm (máy móc)' : 'Không ghi kinh nghiệm',
      sub: [e.reason || null, e.merged ? 'gộp vào bản cũ' : null].filter(Boolean).join(' · '),
    };
  }
  return { name: e.type, sub: '' };
}

/* ─────────── Dựng hình cho sơ đồ ───────────
 *
 * SVG không tự xuống dòng: `<text>` là một dòng, dài bao nhiêu tràn bấy nhiêu. Nên phải TỰ ngắt
 * chữ rồi TỰ tính chiều cao từng ô trước khi vẽ — không có đường tắt nào ở đây.
 *
 * Ước lượng bề rộng bằng số ký tự × hệ số, không đo thật bằng canvas: đo thật cần một lần
 * `measureText` cho mỗi dòng ở mỗi lần render, mà sai số của phép ước lượng chỉ khiến một ô cao
 * thừa một dòng — không đáng đánh đổi.
 */
/* ─────────── Dựng dòng thời gian ───────────
 *
 * ĐÃ BỎ sơ đồ SVG tự vẽ ô. Lý do không phải thẩm mỹ: SVG `<text>` không tự xuống dòng, nên bản
 * cũ phải TỰ ngắt chữ theo số ký tự ước lượng rồi TỰ cộng chiều cao từng ô trước khi vẽ. Mỗi
 * nhãn dài bất thường là một lần đoán sai. HTML xuống dòng sẵn, bỏ được cả hai phép đoán.
 *
 * Bố cục ba cột: MỐC GIÂY · RÂY GRAPH · NHÃN.
 *
 * Rây graph là chỗ duy nhất thể hiện được SONG SONG mà không tốn chiều ngang — bảng này rộng
 * 288px. Quy ước:
 *   chấm đặc   = có chạy
 *   chấm rỗng  = tầng có tồn tại nhưng KHÔNG chạy ở lượt này (xem `layers` của /debug/flow)
 *   nhánh tách ra mà KHÔNG nhập lại = bắn rồi bỏ, không ai await (sắc mặt, bù vector)
 *   đoạn đứt nét trên mạch chính    = khoảng trống sau khi lượt đã trả lời xong
 */
const ROW_H = 34;
const RAIL_W = 46;
const LANE_X = [14, 32];

/** Mốc giây tương đối, một chữ số thập phân — đủ để thấy chỗ tốn thời gian, không rối mắt. */
function relSec(ms, t0) {
  if (!Number.isFinite(ms) || !Number.isFinite(t0)) return '';
  return `${((ms - t0) / 1000).toFixed(1)}s`.replace('.', ',');
}

function msOf(v) {
  const t = v ? new Date(v).getTime() : NaN;
  return Number.isFinite(t) ? t : NaN;
}

/**
 * Ghép BA nguồn vốn không nhìn thấy nhau thành một danh sách dòng:
 *   · `actions` — bước tool, từ luồng message CopilotKit (đúng thứ tự, KHÔNG có mốc thời gian)
 *   · `events`  — sự kiện middleware phía server (có `at`, có `ms`, có `phase`/`lane`)
 *   · `usage`   — từng lời gọi model (có `started_at` và `ms` kể từ bản vá sổ tiền)
 *
 * Mốc thời gian của bước tool lấy theo lời gọi model ĐÃ YÊU CẦU nó, vì `actions` không mang mốc
 * nào. Đây là phép xấp xỉ có chủ ý và nó đúng theo thứ tự: model xin gọi tool xong thì tool mới
 * chạy. Lấy giờ của client ra so với giờ server thì mới là sai — hai đồng hồ khác nhau.
 */
function buildRows(actions, events, usage) {
  const first = actions.map((x) => x.type).lastIndexOf('turn');
  const steps = actions.slice(first + 1).filter((x) => x.type === 'tool');

  const calls = Array.isArray(usage?.calls)
    ? [...usage.calls].sort((a, b) => msOf(a.at) - msOf(b.at))
    : [];

  const evs = [...(events || [])].sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const side = evs.filter((e) => e.lane === 'side');
  const main = evs.filter((e) => e.lane !== 'side');

  const t0 = Math.min(
    ...[
      calls.length ? (msOf(calls[0].started_at) || msOf(calls[0].at)) : NaN,
      main.length ? main[0].at : NaN,
    ].filter(Number.isFinite),
  );

  const rows = [];
  const push = (r) => rows.push({ ...r, key: `r${rows.length}` });

  push({ kind: 'edge', name: 'Câu hỏi của người dùng', t: Number.isFinite(t0) ? t0 : NaN });

  for (const e of main.filter((x) => x.phase === 'pre')) {
    const c = eventText(e);
    push({ kind: e.type, name: c.name, sub: c.sub, t: e.at, state: 'ok' });
  }

  steps.forEach((b, i) => {
    const call = calls[i];
    const tok = call?.token?.input_tokens;
    push({
      kind: 'model',
      name: 'Model suy luận',
      sub: [`bước ${i + 1}`, tok ? `${num(tok)} tok` : null, call?.ms ? `${(call.ms / 1000).toFixed(1)}s` : null]
        .filter(Boolean).join(' · '),
      t: call ? (msOf(call.started_at) || msOf(call.at)) : NaN,
      state: 'ok',
    });
    push({
      kind: 'tool',
      name: b.label,
      sub: b.detail || '',
      t: call ? msOf(call.at) : NaN,
      state: b.status === 'done' ? 'ok' : b.status === 'error' ? 'err' : 'warn',
    });
    for (const e of main.filter((x) => x.phase === 'step' && (Number(x.steps) || 0) === i + 1)) {
      const c = eventText(e);
      push({ kind: e.type, name: c.name, sub: c.sub, t: e.at, state: 'warn' });
    }
  });

  push({ kind: 'edge', name: 'Trả lời người dùng', t: calls.length ? msOf(calls[calls.length - 1].at) : NaN });

  const post = main.filter((x) => x.phase === 'post');
  if (post.length) {
    push({ kind: 'divider', name: 'sau khi lượt kết thúc' });
    for (const e of post) {
      const c = eventText(e);
      push({ kind: e.type, name: c.name, sub: c.sub, t: e.at, state: 'ok' });
    }
  }

  return { rows, side, t0 };
}

/**
 * Nhánh song song trên rây: từ dòng thứ 1 xuống tới dòng có mốc giây GẦN NHẤT với lúc nó xong.
 *
 * Không vẽ theo chiều cao tỉ lệ thời gian, vì rây này cố ý cho mọi dòng cao bằng nhau (thời
 * lượng đọc ở cột giây). Neo vào dòng gần nhất là cách giữ đúng quan hệ "nó kết thúc quãng
 * này" mà không phải giãn rây.
 */
function sideSpan(side, rows) {
  const start = side.find((e) => e.state === 'start');
  const done = side.find((e) => e.state === 'done' || e.state === 'failed');
  if (!start) return null;
  const endAt = done ? done.at : null;
  let endRow = 2;
  if (endAt) {
    let best = Infinity;
    rows.forEach((r, i) => {
      if (!Number.isFinite(r.t)) return;
      const d = Math.abs(r.t - endAt);
      if (d < best) { best = d; endRow = i; }
    });
  }
  return { endRow: Math.max(endRow, 2), done: done, failed: done?.state === 'failed', ms: done?.ms ?? null };
}

function FlowTab({ actions, events, usage, layers }) {
  if (events === null) return <p className="guide-act__empty">Đang tải…</p>;

  const { rows, side } = buildRows(actions, events, usage);
  if (rows.length <= 2 && !events.length) {
    return <p className="guide-act__empty">Chưa có lượt nào để vẽ. Hỏi trợ lý một câu.</p>;
  }

  const t0row = rows.find((r) => Number.isFinite(r.t));
  const t0 = t0row ? t0row.t : NaN;
  const span = sideSpan(side, rows);
  const h = rows.length * ROW_H;
  const summary = `Sơ đồ luồng một lượt hỏi: ${rows.filter((r) => r.kind !== 'divider').map((r) => r.name).join(' → ')}`;

  return (
    <div className="guide-flow">
      <div className="guide-flow__legend">
        <span><i style={{ background: NODE_STYLE.model.color }} />model</span>
        <span><i style={{ background: NODE_STYLE.tool.color }} />tool</span>
        <span><i style={{ background: NODE_STYLE.experience.color }} />server</span>
        {span ? <span><i className="guide-flow__hollow" />song song</span> : null}
      </div>

      <div className="guide-flow__grid" style={{ height: h }}>
        <svg className="guide-flow__rail" width={RAIL_W} height={h} role="img" aria-label={summary}>
          {rows.map((r, i) => {
            if (r.kind === 'divider') {
              return <line key={`l${i}`} x1={LANE_X[0]} y1={i * ROW_H} x2={LANE_X[0]} y2={(i + 1) * ROW_H}
                stroke="currentColor" strokeWidth="2" strokeDasharray="3 4" opacity=".4" />;
            }
            if (i === rows.length - 1) return null;
            return <line key={`l${i}`} x1={LANE_X[0]} y1={i * ROW_H + ROW_H / 2} x2={LANE_X[0]} y2={(i + 1) * ROW_H + ROW_H / 2}
              stroke="currentColor" strokeWidth="2" opacity=".4" />;
          })}

          {span ? (
            <>
              <path
                d={`M${LANE_X[0]} ${ROW_H / 2 + ROW_H} C${LANE_X[0]} ${ROW_H * 1.8}, ${LANE_X[1]} ${ROW_H * 1.6}, ${LANE_X[1]} ${ROW_H * 2.1} L${LANE_X[1]} ${span.endRow * ROW_H + ROW_H / 2}`}
                stroke={span.failed ? NODE_STYLE.step_guard.color : NODE_STYLE.experience.color}
                strokeWidth="2" fill="none" opacity=".85"
              />
              <circle cx={LANE_X[1]} cy={span.endRow * ROW_H + ROW_H / 2} r="4.5" fill="none" strokeWidth="2"
                stroke={span.failed ? NODE_STYLE.step_guard.color : NODE_STYLE.experience.color} />
            </>
          ) : null}

          {rows.map((r, i) => {
            if (r.kind === 'divider') return null;
            const color = NODE_STYLE[r.kind]?.color || 'currentColor';
            const hollow = r.state === 'off';
            return (
              <circle
                key={`d${i}`} cx={LANE_X[0]} cy={i * ROW_H + ROW_H / 2} r={hollow ? 4.5 : 5}
                fill={hollow ? 'none' : color} stroke={color} strokeWidth={hollow ? 2 : 0}
                opacity={r.kind === 'edge' ? 0.55 : 1}
              />
            );
          })}
        </svg>

        <ul className="guide-flow__rows">
          {rows.map((r, i) => {
            if (r.kind === 'divider') {
              return <li key={r.key} className="guide-flow__sep" style={{ height: ROW_H }}><span>{r.name}</span></li>;
            }
            return (
              <li key={r.key} className={`guide-flow__row${r.state === 'err' ? ' guide-flow__row--err' : ''}`} style={{ height: ROW_H }}>
                <span className="guide-flow__t">{relSec(r.t, t0)}</span>
                <span className="guide-flow__name" title={r.sub ? `${r.name} — ${r.sub}` : r.name}>
                  {r.name}
                  {r.sub ? <em>{r.sub}</em> : null}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {span ? (
        <p className="guide-flow__side">
          Sắc mặt — subagent chạy song song{span.ms ? `, ${(span.ms / 1000).toFixed(1)}s` : ''}
          {span.failed ? ', hỏng' : ', không ai chờ'}
        </p>
      ) : null}

      {Array.isArray(layers) && layers.length ? (
        <div className="guide-flow__layers">
          <p>Tầng</p>
          <div>
            {layers.map((l) => (
              <span key={l.key} className={l.bat ? 'on' : 'off'} title={l.vi_sao}>{l.ten}</span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}


function ContextTab({ entries, prompt, actions }) {
  const [open, setOpen] = useState({});
  const toggle = (k) => setOpen((p) => ({ ...p, [k]: !p[k] }));

  return (
    <ul className="guide-act__ul">
      <li className="guide-act__row">
        <button type="button" className="guide-act__rowbtn" onClick={() => toggle('__prompt')}>
          <span className="guide-act__icon" aria-hidden="true">📜</span>
          <span className="guide-act__body">
            <span className="guide-act__label">
              Chỉ dẫn hệ thống
              <span className="guide-act__more" aria-hidden="true">{open.__prompt ? '−' : '+'}</span>
            </span>
            <span className="guide-act__detail">
              {prompt.status === 'done'
                ? `${prompt.data?.model || ''} · ${prompt.data?.prompt?.length?.toLocaleString('vi-VN') || 0} ký tự · tối đa ${prompt.data?.max_steps} bước`
                : prompt.status === 'error' ? prompt.error : 'đang tải…'}
            </span>
          </span>
        </button>
        {open.__prompt && prompt.status === 'done' ? (
          <RawBlock value={`# model: ${prompt.data.model}\n# max_steps: ${prompt.data.max_steps}\n# suy luận: ${pretty(prompt.data.reasoning)}\n\n${prompt.data.prompt}`} />
        ) : null}
      </li>

      {entries.length === 0 ? (
        <li className="guide-act__empty-li">
          <p className="guide-act__empty">Chưa có readable nào đăng ký với runtime.</p>
        </li>
      ) : entries.map((e) => (
        <li key={e.id} className="guide-act__row">
          <button type="button" className="guide-act__rowbtn" onClick={() => toggle(e.id)}>
            <span className="guide-act__icon" aria-hidden="true">🧩</span>
            <span className="guide-act__body">
              <span className="guide-act__label">
                {e.description}
                <span className="guide-act__more" aria-hidden="true">{open[e.id] ? '−' : '+'}</span>
              </span>
              <span className="guide-act__note">
                {e.description === REGION_MAP_CONTEXT
                  ? `${parseRegionMap(e.value).regions.length} khu vực · bấm để xem chi tiết từng khu vực · `
                  : ''}
                {pretty(e.value).length.toLocaleString('vi-VN')} ký tự
              </span>
            </span>
          </button>
          {open[e.id]
            ? (e.description === REGION_MAP_CONTEXT
              // Bản đồ khu vực có nút Chi tiết / Chỉ vị trí — gọi đúng hàm của tool trợ lý.
              ? <GuideRegionMap value={e.value} actions={actions} RawBlock={RawBlock} />
              : <RawBlock value={e.value} />)
            : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Tab Chi phí. Gộp các lượt gọi model theo LƯỢT HỎI: một câu hỏi có thể gọi model nhiều lần
 * (mỗi bước tool là một lần gọi), nên "giá của lượt" chỉ đúng khi cộng các lần gọi cùng lượt.
 */
function CostTab({ data }) {
  const [open, setOpen] = useState({});
  if (!data) return <p className="guide-act__empty">Đang đọc số liệu token…</p>;
  if (!data.call_count) {
    return <p className="guide-act__empty">Chưa có lượt gọi model nào trong hội thoại này.</p>;
  }

  const group = new Map();
  for (const r of data.calls) {
    const k = r.turn_no == null ? '?' : String(r.turn_no);
    if (!group.has(k)) group.set(k, []);
    group.get(k).push(r);
  }

  const t = data.total;
  return (
    <>
      <div className="guide-act__cost-total">
        <div className="guide-act__cost-big">
          <span>{usd(t.usd)}</span>
          <span className="guide-act__cost-vnd">≈ {vnd(t.vnd)}</span>
        </div>
        <div className="guide-act__cost-grid">
          <span>vào</span><b>{num(t.input_tokens)}</b>
          <span>ra</span><b>{num(t.output_tokens)}</b>
          <span>đọc cache</span><b>{num(t.cache_read_tokens)}</b>
          <span>ghi cache</span><b>{num(t.cache_write_tokens)}</b>
        </div>
        <div className="guide-act__note">
          {data.call_count} lần gọi model · tỷ giá {num(data.usd_vnd_rate)}đ/$ (env USD_VND_RATE)
        </div>
      </div>

      <ul className="guide-act__ul">
        {[...group.entries()].map(([luot, rows]) => {
          const sum = rows.reduce((a, r) => ({
            usd: a.usd + (r.cost.usd || 0),
            vnd: a.vnd + (r.cost.vnd || 0),
            inp: a.inp + r.token.input_tokens,
            out: a.out + r.token.output_tokens,
          }), { usd: 0, vnd: 0, inp: 0, out: 0 });
          const key = `luot-${luot}`;
          return (
            <li key={key} className="guide-act__row">
              <button type="button" className="guide-act__rowbtn" onClick={() => setOpen((p) => ({ ...p, [key]: !p[key] }))}>
                <span className="guide-act__icon" aria-hidden="true">💵</span>
                <span className="guide-act__body">
                  <span className="guide-act__label">
                    Lượt {luot}
                    <span className="guide-act__more" aria-hidden="true">{open[key] ? '−' : '+'}</span>
                  </span>
                  <span className="guide-act__detail">{usd(sum.usd)} · ≈ {vnd(sum.vnd)}</span>
                  <span className="guide-act__note">
                    {rows.length} lần gọi · vào {num(sum.inp)} / out {num(sum.out)} token
                  </span>
                </span>
              </button>
              {open[key] ? <RawBlock value={rows} /> : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default function AgentActivityPanel() {
  const { agent } = useAgent();
  const { copilotkit } = useCopilotKit();
  const box = usePopupAnchor();
  const listRef = useRef(null);

  // MẶC ĐỊNH ẨN. Bảng này là công cụ soi, không phải thứ cần nhìn mỗi lần chat — hiện sẵn thì
  // nó che mất nội dung trang ngay cạnh khung chat. Chỉ nhớ trạng thái khi người dùng CHỦ ĐỘNG
  // mở: `'0'` (đã mở) mới là hiện, thiếu khoá hoặc bất kỳ giá trị nào khác đều là ẩn.
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(LS_HIDDEN) !== '0'; } catch { return true; }
  });
  const [wide, setWide] = useState(() => {
    try { return localStorage.getItem(LS_WIDE) === '1'; } catch { return false; }
  });
  const [tab, setTab] = useState(() => {
    try {
      /**
       * Danh sách phải kể ĐỦ mọi tab. Bản cũ chỉ có 'context' và 'cost', nên chọn "Luồng" rồi tải
       * lại trang là bị ném về "Hành động" — một lỗi nhỏ nhưng gây bực đúng lúc người ta đang soi
       * một sự cố và phải tải lại trang nhiều lần.
       */
      const t = localStorage.getItem(LS_TAB);
      return ['context', 'cost', 'flow', 'knowledge'].includes(t) ? t : 'actions';
    } catch { return 'actions'; }
  });
  const [openKeys, setOpenKeys] = useState(() => ({}));

  const contextActive = !hidden && tab === 'context';
  const ctxEntries = useContextSnapshot(copilotkit, contextActive);
  /**
   * Quyền SỐNG — cả nhãn trên tiêu đề lẫn lời gọi `/debug/prompt` đều theo nó, không theo hằng
   * `FULL_ACCESS` lúc mount. Thu quyền giữa phiên thì bảng phải nói đúng ngay, vì đây chính là
   * chỗ người ta mở ra để kiểm tra xem núm cài đặt có ăn hay không.
   */
  const [quyenSong, setQuyenSong] = useState(() => FULL_ACCESS && fullAccessStillOn());
  useEffect(() => onFullAccessChange(() => setQuyenSong(FULL_ACCESS && fullAccessStillOn())), []);
  const prompt = useSystemPrompt(contextActive, quyenSong);

  const actions = useMemo(
    () => deriveAgentActions(agent?.messages, !!agent?.isRunning, { fullAccess: FULL_ACCESS }),
    // `agent.messages` bị mutate tại chỗ (splice) nên chiều dài + trạng thái chạy là tín hiệu
    // đáng tin hơn là so sánh tham chiếu mảng.
    [agent, agent?.messages?.length, agent?.isRunning],
  );

  // Poll khi bảng đang mở (bất kể tab nào) để chip chi phí ở tiêu đề luôn có số. `actions.length`
  // làm khoá nạp lại: usage chỉ tồn tại SAU khi lượt chạy xong, đúng lúc dòng thời gian dài ra.
  const usage = useUsage(agent?.threadId, !hidden, actions.length);
  const flow = useFlow(agent?.threadId, !hidden && tab === 'flow', actions.length, agent?.isRunning);

  // Việc mới luôn ở đáy → tự cuộn xuống, giống khung chat. Không cuộn khi người dùng đang mở
  // một khối dữ liệu thô để đọc: giật xuống đáy giữa lúc đọc là mất chỗ.
  const hasOpen = Object.values(openKeys).some(Boolean);
  useEffect(() => {
    if (hasOpen || tab !== 'actions') return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [actions.length, hasOpen, tab]);

  // Ghi nhớ ở effect, KHÔNG ghi trong hàm cập nhật state: updater phải thuần (StrictMode gọi
  // nó hai lần), và đọc localStorage ngay sau click sẽ thấy giá trị cũ.
  useEffect(() => {
    try { localStorage.setItem(LS_HIDDEN, hidden ? '1' : '0'); } catch { /* ignore */ }
  }, [hidden]);
  useEffect(() => {
    try { localStorage.setItem(LS_WIDE, wide ? '1' : '0'); } catch { /* ignore */ }
  }, [wide]);
  useEffect(() => {
    try { localStorage.setItem(LS_TAB, tab); } catch { /* ignore */ }
  }, [tab]);

  const toggleKey = useCallback((key) => {
    setOpenKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  if (!box) return null; // khung chat đóng → không có gì để dán vào

  const room = box.left - GAP - EDGE;
  if (room < MIN_PANEL_W) return null; // màn hình quá hẹp: thẻ tool trong khung chat vẫn còn

  const total = countRealActions(actions);

  // ĐANG ẨN → chỉ một nút nhỏ dán sát mép trái khung chat. Badge số hành động vẫn hiện để biết
  // trợ lý có làm gì hay không mà không phải mở bảng ra.
  if (hidden) {
    return (
      <button
        type="button"
        className="guide-act-open"
        style={{ right: Math.round(window.innerWidth - box.left) + GAP, top: box.top + 10 }}
        onClick={() => setHidden(false)}
        title="Xem hành động của trợ lý"
      >
        <span aria-hidden="true">⚡</span>
        <span>Hành động</span>
        {total > 0 ? <span className="guide-act__count">{total}</span> : null}
      </button>
    );
  }

  const width = Math.min(wide ? PANEL_W_WIDE : PANEL_W, room);
  const style = {
    left: box.left - GAP - width,
    top: box.top,
    width,
    maxHeight: box.height,
  };

  return (
    <aside className="guide-act" style={style} aria-label="Hành động của trợ lý">
      <div className="guide-act__head">
        <span className="guide-act__headmain">
          <span className="guide-act__title">Hành động của trợ lý</span>
          {/* Chế độ toàn quyền cho phép trợ lý bấm cả nút Xoá — phải nhìn thấy được là đang bật.
              Đọc cờ SỐNG chứ không chỉ hằng lúc mount: tắt núm ở cài đặt thì nhóm tool vẫn còn
              đăng ký trong tab này (xem `guardFullAccessTool`), nhưng chúng đã bị khoá — nhãn
              phải nói đúng cái đang có hiệu lực, không nói cái lúc tải trang. */}
          {quyenSong
            ? <span className="guide-act__mode" title="Trợ lý được bấm/điền/điều hướng thật trên trang">toàn quyền</span>
            : null}
          {FULL_ACCESS && !quyenSong
            ? <span className="guide-act__mode guide-act__mode--off" title="Đã tắt ở cài đặt trợ lý — tool thao tác đã bị khoá, tải lại trang để gỡ hẳn">đã khoá</span>
            : null}
          {usage?.total?.usd ? (
            <span className="guide-act__cost" title={`${usage.call_count} lần gọi model · ≈ ${vnd(usage.total.vnd)}`}>
              {usd(usage.total.usd)}
            </span>
          ) : null}
          {total > 0 ? <span className="guide-act__count">{total}</span> : null}
        </span>
        <button
          type="button"
          className="guide-act__iconbtn"
          onClick={() => setWide((v) => !v)}
          title={wide ? 'Thu hẹp bảng' : 'Mở rộng bảng để đọc dữ liệu thô'}
        >
          {wide ? '⇥' : '⇤'}
        </button>
        <button
          type="button"
          className="guide-act__iconbtn"
          onClick={() => setHidden(true)}
          title="Ẩn bảng hành động"
        >
          ✕
        </button>
      </div>

      <>
          <div className="guide-act__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'actions'}
              className={`guide-act__tab${tab === 'actions' ? ' guide-act__tab--on' : ''}`}
              onClick={() => setTab('actions')}
            >
              Hành động
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'flow'}
              className={`guide-act__tab${tab === 'flow' ? ' guide-act__tab--on' : ''}`}
              onClick={() => setTab('flow')}
            >
              Luồng
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'context'}
              className={`guide-act__tab${tab === 'context' ? ' guide-act__tab--on' : ''}`}
              onClick={() => setTab('context')}
            >
              Ngữ cảnh
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'cost'}
              className={`guide-act__tab${tab === 'cost' ? ' guide-act__tab--on' : ''}`}
              onClick={() => setTab('cost')}
            >
              Chi phí
            </button>
            {/* Kiến thức của TRANG ĐANG XEM. Đứng cuối vì nó là việc quản trị kho, không phải
                việc soi một lượt hỏi như bốn tab trước. */}
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'knowledge'}
              className={`guide-act__tab${tab === 'knowledge' ? ' guide-act__tab--on' : ''}`}
              onClick={() => setTab('knowledge')}
            >
              Kiến thức trang
            </button>
          </div>

          <div className="guide-act__list" ref={listRef}>
            {tab === 'knowledge' ? (
              // Mount có điều kiện, không ẩn bằng CSS: component này hỏi `/knowledge/for-path`
              // mỗi lần đổi trang. Ẩn bằng CSS thì nó vẫn hỏi, chỉ là không ai nhìn thấy.
              <GuidePageKnowledge />
            ) : tab === 'flow' ? (
              <FlowTab actions={actions} events={flow?.events ?? null} layers={flow?.layers} usage={usage} />
            ) : tab === 'context' ? (
              <ContextTab entries={ctxEntries} prompt={prompt} actions={actions} />
            ) : tab === 'cost' ? (
              <CostTab data={usage} />
            ) : actions.length === 0 ? (
              <p className="guide-act__empty">Chưa có hành động nào. Hỏi trợ lý một câu để xem nó làm gì.</p>
            ) : (
              <ul className="guide-act__ul">
                {actions.map((item) => (
                  <ActionRow
                    key={item.key}
                    item={item}
                    open={!!openKeys[item.key]}
                    onToggle={toggleKey}
                  />
                ))}
              </ul>
            )}
          </div>
      </>
    </aside>
  );
}
