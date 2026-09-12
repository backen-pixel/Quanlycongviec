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
import { useAgent, useCopilotKit } from '@copilotkit/react-core/v2';
import { deriveAgentActions, countRealActions } from './lib/agentActions';
import { FULL_ACCESS } from './lib/guideAccess';
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
function useFlow(threadId, active, tick) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!active || !threadId) return undefined;
    let cancelled = false;
    api.get('/copilotkit/debug/flow', { params: { thread_id: threadId } })
      .then((r) => { if (!cancelled) setData(r.data?.events || []); })
      .catch(() => { if (!cancelled) setData([]); });
    return () => { cancelled = true; };
  }, [threadId, active, tick]);
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

/** Chỉ dẫn hệ thống thật — nạp một lần, lười (chỉ khi mở tab Ngữ cảnh). */
function useSystemPrompt(active) {
  const [state, setState] = useState({ status: 'idle', data: null, error: null });

  useEffect(() => {
    if (!active || state.status !== 'idle') return;
    setState({ status: 'loading', data: null, error: null });
    // PHẢI gửi kèm cờ chế độ. Server nay trả bản chỉ dẫn ĐÚNG CHẾ ĐỘ (xem helpers/guidePrompt.js);
    // thiếu header thì nó rơi về bản chế độ đọc và bảng này báo sai số ký tự — đã tái hiện: bật
    // toàn quyền, panel vẫn hiện 9.165 trong khi bản thật gửi đi là 11.516.
    api.get('/copilotkit/debug/prompt', { headers: { 'x-guide-full-access': FULL_ACCESS ? '1' : '0' } })
      .then((res) => setState({ status: 'done', data: res.data, error: null }))
      .catch((e) => setState({
        status: 'error',
        data: null,
        error: e?.response?.status === 403
          ? 'Chỉ admin xem được chỉ dẫn hệ thống trên bản production.'
          : (e?.message || 'Không tải được'),
      }));
  }, [active, state.status]);

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
  model: { icon: '💭', color: 'currentColor' },
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
const DIAGRAM_W = 300;
const PAD = 10;
const TEXT_W = DIAGRAM_W - PAD * 2 - 26; // 26 = chỗ cho icon
const CHARS_PER_LINE = Math.floor(TEXT_W / 5.6);
const CHARS_PER_SUBLINE = Math.floor(TEXT_W / 4.9); // chữ phụ nhỏ hơn nên lọt nhiều hơn
const LINE_H = 14;
const SUBLINE_H = 12;
const O_PAD = 8;
const GAP2 = 16; // chỗ cho mũi tên giữa hai ô

function wrapText(text, perLine) {
  const from = String(text || '').split(/\s+/).filter(Boolean);
  const out = [];
  let d = '';
  for (const t of from) {
    if (!d) { d = t; continue; }
    if ((d + ' ' + t).length <= perLine) d += ' ' + t;
    else { out.push(d); d = t; }
  }
  if (d) out.push(d);
  return out.length ? out : [''];
}

function buildDiagram(nodes) {
  let y = 4;
  const o = nodes.map((n) => {
    const lines = wrapText(n.name, CHARS_PER_LINE);
    const subLines = n.sub ? wrapText(n.sub, CHARS_PER_SUBLINE) : [];
    const h = O_PAD * 2 + lines.length * LINE_H + subLines.length * SUBLINE_H;
    const item = { ...n, lines, subLines, y, h };
    y += h + GAP2;
    return item;
  });
  return { o, cao: Math.max(y - GAP2 + 4, 20) };
}

function FlowTab({ actions, events }) {
  if (events === null) return <p className="guide-act__empty">Đang tải…</p>;

  // Chỉ lấy lượt HỎI CUỐI CÙNG: sơ đồ để soi một lượt, không phải cả buổi.
  const first = actions.map((x) => x.type).lastIndexOf('turn');
  const step = actions.slice(first + 1).filter((x) => x.type === 'tool');
  if (!step.length && !events.length) {
    return <p className="guide-act__empty">Chưa có lượt nào để vẽ. Hỏi trợ lý một câu.</p>;
  }

  const turnStart = events.filter((e) => e.type === 'experience');
  const byStep = new Map();
  for (const e of events) {
    if (e.type === 'experience') continue;
    const n = Number(e.steps) || 0;
    if (!byStep.has(n)) byStep.set(n, []);
    byStep.get(n).push(e);
  }

  const nodes = [];
  const add = (loai, name, sub, trangThai) => nodes.push({ loai, name, sub, trangThai });

  add('model', 'Câu hỏi của người dùng', '', 'ok');
  for (const e of turnStart) { const c = eventText(e); add('experience', c.name, c.sub, 'ok'); }
  for (const e of byStep.get(0) || []) { const c = eventText(e); add(e.type, c.name, c.sub, 'canh'); }

  step.forEach((b, i) => {
    add('model', 'Model suy luận', `bước ${i + 1}`, 'ok');
    add('tool', b.label, b.detail || '', b.status === 'done' ? 'ok' : 'loi');
    for (const e of byStep.get(i + 1) || []) { const c = eventText(e); add(e.type, c.name, c.sub, 'canh'); }
  });
  add('model', 'Trả lời người dùng', '', 'ok');

  const { o, cao } = buildDiagram(nodes);
  const summary = `Sơ đồ luồng một lượt hỏi: ${nodes.map((n) => n.name).join(' → ')}`;

  return (
    <div className="guide-flow">
      <svg
        className="guide-flow__svg"
        viewBox={`0 0 ${DIAGRAM_W} ${cao}`}
        width="100%"
        height={cao}
        role="img"
        aria-label={summary}
      >
        <defs>
          {/* Mũi tên dùng currentColor để đổi theo nền sáng/tối của bảng. */}
          <marker id="guide-flow-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>

        {o.map((n, i) => {
          const color = NODE_STYLE[n.loai]?.color || 'currentColor';
          const err = n.trangThai === 'loi';
          const warn = n.trangThai === 'canh';
          const bg = err ? 'rgba(248,113,113,.12)' : warn ? 'rgba(251,191,36,.10)' : 'transparent';
          const dashed = n.loai === 'model' ? '5 4' : undefined;
          let y2 = n.y + O_PAD + 10;
          return (
            <g key={`${n.name}-${i}`}>
              <rect
                x={PAD} y={n.y} width={DIAGRAM_W - PAD * 2} height={n.h} rx="7"
                fill={bg} stroke={color} strokeWidth={err ? 1.6 : 1}
                strokeDasharray={dashed} opacity={n.loai === 'model' ? 0.75 : 1}
              />
              <text x={PAD + 9} y={n.y + O_PAD + 11} fontSize="12">{NODE_STYLE[n.loai]?.icon || '•'}</text>
              {n.lines.map((d, k) => {
                const y = y2 + k * LINE_H;
                return (
                  <text key={`t${k}`} x={PAD + 26} y={y} fontSize="11.5" fontWeight="600" fill="currentColor">{d}</text>
                );
              })}
              {n.subLines.map((d, k) => {
                const y = y2 + n.lines.length * LINE_H + k * SUBLINE_H;
                return (
                  <text key={`p${k}`} x={PAD + 26} y={y} fontSize="10" fill="currentColor" opacity=".62">{d}</text>
                );
              })}
              {i < o.length - 1 ? (
                <line
                  x1={DIAGRAM_W / 2} y1={n.y + n.h} x2={DIAGRAM_W / 2} y2={n.y + n.h + GAP2 - 3}
                  stroke="currentColor" strokeWidth="1.2" opacity=".45" markerEnd="url(#guide-flow-ar)"
                />
              ) : null}
            </g>
          );
        })}
      </svg>
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
      const t = localStorage.getItem(LS_TAB);
      return t === 'context' || t === 'cost' ? t : 'actions';
    } catch { return 'actions'; }
  });
  const [openKeys, setOpenKeys] = useState(() => ({}));

  const contextActive = !hidden && tab === 'context';
  const ctxEntries = useContextSnapshot(copilotkit, contextActive);
  const prompt = useSystemPrompt(contextActive);

  const actions = useMemo(
    () => deriveAgentActions(agent?.messages, !!agent?.isRunning, { fullAccess: FULL_ACCESS }),
    // `agent.messages` bị mutate tại chỗ (splice) nên chiều dài + trạng thái chạy là tín hiệu
    // đáng tin hơn là so sánh tham chiếu mảng.
    [agent, agent?.messages?.length, agent?.isRunning],
  );

  // Poll khi bảng đang mở (bất kể tab nào) để chip chi phí ở tiêu đề luôn có số. `actions.length`
  // làm khoá nạp lại: usage chỉ tồn tại SAU khi lượt chạy xong, đúng lúc dòng thời gian dài ra.
  const usage = useUsage(agent?.threadId, !hidden, actions.length);
  const events = useFlow(agent?.threadId, !hidden && tab === 'flow', actions.length);

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
          {/* Chế độ toàn quyền cho phép trợ lý bấm cả nút Xoá — phải nhìn thấy được là đang bật. */}
          {FULL_ACCESS ? <span className="guide-act__mode" title="Trợ lý được bấm/điền/điều hướng thật trên trang">toàn quyền</span> : null}
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
          </div>

          <div className="guide-act__list" ref={listRef}>
            {tab === 'flow' ? (
              <FlowTab actions={actions} events={events} />
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
