/**
 * NHÂN VẬT HỆ THỐNG — sống suốt lượt chat, di chuyển trên màn hình, diễn trạng thái của trợ lý.
 *
 * Khung chat bên phải VẪN GIỮ NGUYÊN: nhân vật không thay thế nó mà diễn ra bên ngoài. Câu trả
 * lời dài đọc trong khung chat; bong bóng của nhân vật chỉ nói một câu ngắn cho biết nó đang bận
 * gì. Bong bóng không phải chỗ đọc.
 *
 * BỐN QUYẾT ĐỊNH:
 *
 * 1. MỘT nhân vật duy nhất. Trước đây `uiSpotlight.js` tự dựng lấy một con bot mỗi khi trỏ nút.
 *    Nay nó chỉ báo "đang trỏ vào phần tử này" (`watchTarget`), còn việc đi tới đó là của
 *    component này. Hai con khác hình trên cùng màn hình là thứ không sửa nổi bằng CSS.
 *
 * 2. Di chuyển bằng `transform`, không bằng `left/top`. Trình duyệt chạy transform trên GPU;
 *    animate `left` bắt nó tính lại layout mỗi khung hình — trên trang kanban 4.800 phần tử thì
 *    thấy giật ngay.
 *
 * 3. Chỉ di chuyển KHI CÓ LÝ DO. Không cho nó lượn lờ vô cớ: một vật thể động ở rìa mắt trong
 *    lúc người ta đang nhập liệu là phiền, không phải sinh động. Lúc rảnh nó đậu ở góc.
 *
 * 4. `pointer-events: none` tuyệt đối. Nhân vật đi khắp màn hình nên bất cứ lúc nào cũng có thể
 *    nằm đè lên nút người dùng định bấm. Nó không bao giờ được chắn một cú bấm nào.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAgent } from '@copilotkit/react-core/v2';
import { watchTarget, clearSpotlight } from './lib/uiSpotlight';
import { watchTempLine, watchConfirm, toggleAskBar, EVENT_ASK } from './lib/openGuide';
import { theoDoiTieuDiem } from '../../lib/productTour/focus';
import { deriveMascotState, latestAnswer, DONE_MS } from './lib/mascotState';
import { deriveAgentActions } from './lib/agentActions';
import { FULL_ACCESS } from './lib/guideAccess';
import { spriteFor, hasSprite, canFlip } from './lib/mascotSprite';
import { useMascotSet } from './lib/useMascotSet';

/**
 * Kích thước khung nhân vật. Vị trí được tính bằng số TRƯỚC khi phần tử kịp có layout, nên các
 * số này phải khớp với `--guide-mascot-w/h` trong appGuideCopilot.css.
 * TAY_Y: tung độ ngón tay trong khung. Căn theo nó (không phải căn giữa khung) thì ngón tay mới
 * chỉ đúng tâm nút — quan trọng khi nút sát mép và khung bị kẹp lại.
 */
/**
 * BỘ ẢNH THÁNG 8/2026 — 6 tư thế, đã tách nền và cắt sát nhân vật.
 *
 * Ảnh gốc chủ hệ thống đưa KHÔNG hề trong suốt: alpha = 255 ở mọi pixel, ô caro là màu vẽ chết
 * vào ảnh. Dán thẳng là một khối xám đè lên trang. Nền được tách bằng cách loang TỪ MÉP ảnh vào,
 * không key theo màu toàn ảnh — nhân vật mặc áo TRẮNG, key màu là mất áo.
 *
 * Sau khi cắt, tỉ lệ rộng/cao lớn nhất trong 6 ảnh là 1,1085 (tư thế `answering`). Khung lấy
 * đúng tỉ lệ đó nên MỌI tư thế đều vẽ hết chiều cao 132 px — nhân vật không phình to thu nhỏ khi
 * đổi trạng thái. Bộ cũ là 290×330, nên đây là lần đổi TỈ LỆ chứ không chỉ đổi ảnh: các số này
 * phải khớp với `.app-guide-mascot` trong appGuideCopilot.css.
 */
const W = 146;
const H = 132;
/**
 * ĐIỂM NGÓN TAY trong khung. Căn theo điểm này — KHÔNG căn giữa khung — thì ngón tay mới chỉ
 * đúng tâm nút; căn giữa thì nhân vật trượt xuống dưới nút vì tay nằm cao hơn thân.
 *
 * ĐO PIXEL THẬT trên `pointing.png` sau khi cắt (416×421): cột không trong suốt ngoài cùng bên
 * phải ở x = 413, trọng tâm dọc của 12 cột cuối ở y = 168 → 99,28% bề ngang, 39,82% chiều cao.
 * Quy về khung 146×132 (ảnh vẽ 130×132, thừa 8 px mỗi bên): TAY_X ≈ 137, TAY_Y ≈ 53.
 *
 * TAY_X là số MỚI: ảnh không chạm mép khung, coi ngón tay nằm ngay mép phải là lệch 8 px — đủ
 * thấy tay chỉ hụt trên những nút nhỏ. Đổi `pointing.png` thì phải đo lại cả hai số.
 */
const HAND_X = Math.round(W * 0.9402);
const HAND_Y = Math.round(H * 0.3982);
const GAP = 10;          // khoảng hở giữa nhân vật và thứ nó chỉ
/**
 * Mép trên nhân vật được phép chạm tới.
 *
 * Trước là 26 px — chỗ chừa cho bong bóng phía trên đầu. Nhưng bong bóng đã BIẾT TỰ LẬT XUỐNG
 * chân từ lúc có `data-bubble-below`, nên chỗ chừa đó chỉ còn là cái trần vô cớ: ngón tay nằm ở
 * 53 px tính từ đỉnh khung, cộng 26 nữa là mọi ô nằm cao hơn y≈79 đều không với tới.
 *
 * Đã đo trên tour Dashboard bước 1: ô ở y 4–56 (góc trên trái), nhân vật bị kẹp xuống y=26 nên
 * tay ở y=79 — chỉ hụt 23 px xuống dưới ô. Hạ trần xuống 4 px là chỉ trúng.
 */
const MARGIN_TOP = 4;
const MARGIN = 8;
/**
 * Câu trả lời KHÔNG tự tắt theo giờ.
 *
 * Bản trước giữ 18 giây rồi xoá. Con số đó luôn sai với một nửa số người: ai đọc chậm, ai vừa
 * quay đi nghe điện thoại, ai đang đối chiếu câu trả lời với một ô trên màn hình — tất cả đều
 * mất chữ giữa chừng và không có cách nào lấy lại ngoài mở khung chat.
 *
 * Nay chữ ở lại tới khi một trong hai việc xảy ra:
 *  - NGƯỜI DÙNG bấm × (chủ động bỏ đi), hoặc
 *  - HỆ THỐNG có thứ mới để nói: câu hỏi mới, câu trả lời mới, một bước tour mới. Thay thế là
 *    tự động, không cần bấm gì.
 */
/** Tối đa bao nhiêu bước hiện dưới bong bóng. Nhiều hơn là thành nhật ký, không phải trạng thái. */
const MAX_ACTIONS = 4;
/**
 * Rảnh bao lâu thì nhân vật TAN đi.
 *
 * Trước đây lúc rảnh nó chỉ mờ còn 32% và đứng đó mãi. Nhưng "mờ" vẫn là 146×132 px đè lên nội
 * dung, và người dùng bình thường không hỏi trợ lý suốt ngày. Nay nó biến hẳn, và quay lại đúng
 * lúc có việc: người dùng nhắn một câu, trợ lý chỉ trỏ, hoặc tour mở.
 *
 * Lối vào lúc nhân vật vắng mặt là nút tròn của ô hỏi — xem GuideAskBar.jsx.
 */
const IDLE_FADE_MS = 10_000;
/** Phải im lặng bao lâu mới coi là lượt đã xong thật — xem chú thích ở hiệu ứng `justFinished`. */
const QUIET_MS = 900;

/**
 * Chỗ đậu lúc rảnh: mép trái của vùng nội dung, phía dưới.
 *
 * Đậu theo `<main>` chứ KHÔNG theo mép trái màn hình. Đã chụp màn hình và thấy: để x = 14 thì
 * nhân vật nằm đè lên thanh menu trái — `elementFromPoint` ngay tâm nó trả về một `<button>` của
 * menu. Dù `pointer-events: none` nên không chặn được cú bấm, nó vẫn che mất chữ, và che đúng
 * khu tài khoản / đăng xuất.
 *
 * Không đậu bên phải: khung chat trợ lý chiếm sẵn góc đó.
 */
/**
 * Chừa chỗ cho THANH HỎI ở đáy.
 *
 * Thanh hỏi (thu gọn thành nút tròn) nay cũng neo ở góc trái dưới, cao ~52 px kể cả lề. Không
 * chừa thì nhân vật đứng đè lên chính cái nút mở nó ra — và vì nhân vật `pointer-events: none`
 * nên nút vẫn bấm được, chỉ là bị che. Loại lỗi nhìn thì rối mà không ai gọi tên được.
 */
const ASK_BAR_SPACE = 76;

function homeSpot() {
  if (typeof window === 'undefined') return { x: MARGIN, y: MARGIN, flip: false };
  const main = document.querySelector('main');
  const sidebarLeft = main ? main.getBoundingClientRect().left : 0;
  const x = Math.max(MARGIN, Math.min(sidebarLeft + 12, window.innerWidth - W - MARGIN));
  return { x, y: Math.max(MARGIN, window.innerHeight - H - ASK_BAR_SPACE), flip: false, dir: undefined };
}

/** Hai hộp có chồng lên nhau không? */
function overlaps(a, b) {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

/**
 * Đặt nhân vật cạnh một phần tử, sao cho NGÓN TAY chỉ vào nó.
 *
 * Ảnh nhân vật chỉ có một tư thế trỏ: trỏ NGANG. Nên đứng bên trái/phải là chỉ đúng, còn đứng
 * trên/dưới thì tay chỉ vào khoảng không — đo trên tour Sự kiện: bước 1 và bước 5 nhân vật đứng
 * phía trên nút, tay ở y=266 trong khi nút nằm ở y=343. Nhìn là "đứng gần", không phải "chỉ vào".
 *
 * Nên trước khi bỏ cuộc và đứng trên/dưới, hãy TRƯỢT DỌC theo cạnh của mục tiêu: tay chỉ cần
 * nằm trong khoảng cao của mục tiêu là chỉ đúng, không bắt buộc phải ngay giữa. Nhờ vậy nhân vật
 * né được tooltip mà vẫn giữ được tư thế chỉ ngang.
 *
 * Chỉ khi mục tiêu rộng gần hết màn hình (không còn chỗ hai bên) mới chịu đứng trên/dưới — lúc
 * đó trả `dir` để component vẽ thêm MŨI TÊN chỉ về phía mục tiêu, bù cho tư thế tay.
 *
 * `avoid` là hộp phải né: tooltip giải thích bước. Đứng đè lên nó là che mất đúng thứ người dùng
 * cần đọc.
 */
function spotBeside(el, avoid) {
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Chỉ tính trên PHẦN NHÌN THẤY của mục tiêu. Bảng kanban cao 1.200 px trong khung nhìn 694 px
  // thì tâm hình học nằm ngoài màn hình — căn theo nó là nhân vật bị kẹp về đáy.
  const top = Math.max(r.top, MARGIN_TOP);
  const bottom = Math.min(r.bottom, vh - 4);
  const height = Math.max(0, bottom - top);
  const edge = Math.min(24, height / 2);
  // Các mốc cho NGÓN TAY, từ giữa lan dần ra hai mép — ưu tiên chỉ vào giữa.
  const handAnchor = [top + height / 2, top + height * 0.28, top + height * 0.72, top + edge, bottom - edge];

  const clampX = (x) => Math.max(MARGIN, Math.min(x, vw - W - MARGIN));
  const inViewport = (v) => v.x >= MARGIN && v.x + W <= vw - MARGIN
    && v.y >= MARGIN_TOP && v.y + H <= vh - 4;
  const boxOf2 = (v) => ({ left: v.x, top: v.y, right: v.x + W, bottom: v.y + H });
  const scoreOf = (v) => {
    if (!avoid) return 0;
    const h = boxOf2(v);
    return Math.max(0, Math.min(h.right, avoid.right) - Math.max(h.left, avoid.left))
      * Math.max(0, Math.min(h.bottom, avoid.bottom) - Math.max(h.top, avoid.top));
  };
  /**
   * Chọn: chỗ đầu tiên vừa màn hình VÀ không đè `avoid`; không có thì chỗ ĐÈ ÍT NHẤT.
   *
   * Bản trước rơi thẳng về "bên trái mục tiêu, kẹp vào màn hình" và có lúc đứng chồng lên chính
   * nút đang được khoanh sáng — che mất thứ mà cả tour đang bảo người dùng nhìn.
   */
  const pick = (list) => {
    const inside = list.filter(inViewport);
    return inside.find((v) => scoreOf(v) === 0)
      || inside.sort((x, y) => scoreOf(x) - scoreOf(y))[0]
      || null;
  };

  /**
   * MỤC TIÊU NẰM HẲN NGOÀI KHUNG NHÌN (trên hoặc dưới) — `height` bằng 0, mọi phép căn theo nó đều
   * vô nghĩa. Đã gặp thật ở bước 14 tour Sự kiện: ô cần chỉ nằm ở y=731 trong khung nhìn cao 702,
   * nhân vật rơi về đáy màn hình và tay chỉ vào khoảng không.
   *
   * Lúc này việc đúng là đứng ở MÉP màn hình phía có mục tiêu và chỉ ra ngoài: "thứ ngươi cần ở
   * dưới kia". Tour cũng đang cuộn tới đó, nên trạng thái này chỉ kéo dài một nhịp.
   */
  if (height <= 0) {
    const belowViewport = r.top >= vh;
    const y = belowViewport ? vh - H - 4 : MARGIN_TOP;
    const dir = belowViewport ? 'top' : 'bottom';
    // Ba mốc ngang rồi mới chấm điểm — cắm cứng "giữa mục tiêu" thì bước 14 tour Sự kiện che
    // mất 20% tooltip, dù lệch sang phải một chút là hết chồng.
    const out = pick([
      clampX(r.left + r.width / 2 - W / 2),
      clampX(r.left + 6),
      clampX(r.right - W - 6),
    ].map((x) => ({ x, y, flip: false, dir })));
    return out || { x: clampX(r.left + r.width / 2 - W / 2), y, flip: false, dir };
  }

  const candidates = [];
  for (const y2 of handAnchor) {
    const y = Math.max(MARGIN_TOP, Math.min(y2 - HAND_Y, vh - H - 4));
    // Đặt theo ĐIỂM NGÓN TAY, không theo mép khung: ảnh chừa 8 px trống bên phải, lấy mép khung
    // là ngón tay dừng cách nút 18 px thay vì 10. Đứng bên phải thì thân bị lật ngang nên ngón
    // tay soi gương sang mép trái — trừ đi đúng phần thừa bên kia.
    candidates.push({ x: r.left - GAP - HAND_X, y, flip: false, dir: 'trai' });
    candidates.push({ x: r.right + GAP - (W - HAND_X), y, flip: true, dir: 'phai' });
  }
  /**
   * Thế đứng trên/dưới có BA mốc ngang, không phải một.
   *
   * Mục tiêu là một dải rộng (thanh công cụ, một hàng bảng) thì đứng giữa hay đứng lệch về mép
   * đều "ở trên nó" như nhau — nhưng chỉ một trong ba mốc là né được tooltip. Có thêm lựa chọn
   * thì đỡ phải rơi xuống nhánh "đè ít nhất" bên dưới.
   */
  for (const x of [
    clampX(r.left + r.width / 2 - W / 2),
    clampX(r.left + 6),
    clampX(r.right - W - 6),
  ]) {
    candidates.push({ x, y: r.top - GAP - H, flip: false, dir: 'top' });
    candidates.push({ x, y: r.bottom + GAP, flip: false, dir: 'bottom' });
  }

  const out = pick(candidates);
  if (out) return out;

  const y = Math.max(MARGIN_TOP, Math.min(top + height / 2 - HAND_Y, vh - H - 4));
  return { x: Math.max(MARGIN, Math.min(r.left, vw - W - MARGIN)), y, flip: false, dir: 'trai' };
}

/** Nới hộp ra một chút rồi trả về dạng so sánh được. `null` nếu phần tử không có kích thước. */
function boxOf(el, pad = 8) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  return { left: r.left - pad, top: r.top - pad, right: r.right + pad, bottom: r.bottom + pad };
}

/** Hộp của tooltip tour, nếu tour đang mở. Đo mỗi lần tính vị trí vì tooltip nhảy theo bước. */
function tourTooltipBox() {
  if (typeof document === 'undefined') return null;
  return boxOf(document.querySelector('[data-product-tour-tip]'));
}

/**
 * CHỖ ĐỨNG LÚC CÓ TOUR — đậu yên, chỉ tránh chỗ.
 *
 * Trước đây nhân vật bay theo từng bước tour và chỉ tay vào ô đang khoanh sáng. Nhìn thì vui,
 * nhưng nó tranh việc với chính tour: tour đã có lỗ sáng khoanh đúng ô và tooltip có mũi tên chỉ
 * vào đó rồi. Thêm một nhân vật nhảy chỗ mỗi bước là hai thứ cùng hét "nhìn đây" ở hai toạ độ,
 * cộng thêm một vật thể động ngay cạnh chữ mà người ta đang đọc.
 *
 * Nay việc duy nhất của nó trong tour là ĐỨNG NGOÀI ĐƯỜNG: giữ chỗ đậu quen thuộc, và chỉ dời đi
 * khi chỗ đó đè lên tooltip hoặc đè lên chính ô đang được khoanh sáng.
 *
 * Danh sách chỗ dời xếp theo mức phiền: mép trái vùng nội dung trước (chỗ nó vẫn hay đứng), rồi
 * mới tới các góc còn lại. Không có chỗ nào sạch thì lấy chỗ đè ít nhất — luôn trả về một toạ độ,
 * không bao giờ để nhân vật kẹt ở chỗ đang che chữ.
 */
function spotAvoiding(avoidList) {
  const home = homeSpot();
  const list = (avoidList || []).filter(Boolean);
  if (!list.length) return home;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const main = document.querySelector('main');
  const sidebarLeft = Math.max(MARGIN, Math.min((main ? main.getBoundingClientRect().left : 0) + 12, vw - W - MARGIN));
  const bottom = Math.max(MARGIN_TOP, vh - H - ASK_BAR_SPACE);
  const middle = Math.max(MARGIN_TOP, Math.round(vh / 2 - H / 2));
  const right = Math.max(MARGIN, vw - W - MARGIN);

  const candidates = [
    home,
    { x: sidebarLeft, y: middle, flip: false, dir: undefined },
    { x: sidebarLeft, y: MARGIN_TOP, flip: false, dir: undefined },
    { x: right, y: bottom, flip: false, dir: undefined },
    { x: right, y: MARGIN_TOP, flip: false, dir: undefined },
    { x: right, y: middle, flip: false, dir: undefined },
  ];

  const score = (v) => {
    const h = { left: v.x, top: v.y, right: v.x + W, bottom: v.y + H };
    return list.reduce((s, t) => s
      + Math.max(0, Math.min(h.right, t.right) - Math.max(h.left, t.left))
      * Math.max(0, Math.min(h.bottom, t.bottom) - Math.max(h.top, t.top)), 0);
  };

  return candidates.find((v) => score(v) === 0)
    || candidates.slice().sort((a, b) => score(a) - score(b))[0];
}

/** Hình vector dựng sẵn — dùng khi chưa cắm ảnh. Vẽ ở tư thế TRỎ SANG PHẢI. */
function VectorFigure({ state }) {
  return (
    <svg viewBox="0 0 74 62" width={W} height={H} aria-hidden="true">
      <defs>
        <linearGradient id="agm-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      {state === 'pointing' && (
        <g className="app-guide-mascot__arm">
          <rect x="40" y="34" width="18" height="7" rx="3.5" fill="#a5b4fc" />
          <circle cx="60" cy="37.5" r="6" fill="#fcd34d" />
          <path d="M65 34.5 L71 37.5 L65 40.5 Z" fill="#fcd34d" />
        </g>
      )}
      <line x1="26" y1="16" x2="26" y2="9" stroke="#a5b4fc" strokeWidth="2.5" strokeLinecap="round" />
      <circle className="app-guide-mascot__antenna" cx="26" cy="7" r="3.5" fill="#fcd34d" />
      <circle cx="26" cy="37" r="20" fill="url(#agm-body)" />
      <ellipse cx="19" cy="27" rx="7" ry="4.5" fill="#ffffff" opacity="0.22" />
      <g className="app-guide-mascot__eyes">
        <circle cx="19" cy="34" r="5.4" fill="#ffffff" />
        <circle cx="32" cy="34" r="5.4" fill="#ffffff" />
        <circle cx="20.6" cy="35" r="2.7" fill="#1e1b4b" />
        <circle cx="33.6" cy="35" r="2.7" fill="#1e1b4b" />
      </g>
      <ellipse cx="12" cy="42" rx="3.2" ry="2.2" fill="#fb7185" opacity="0.55" />
      <ellipse cx="39" cy="42" rx="3.2" ry="2.2" fill="#fb7185" opacity="0.55" />
      <path d="M21 44 q5 4.5 10 0" stroke="#1e1b4b" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export default function GuideMascot() {
  const { agent } = useAgent();
  const [target, setTarget] = useState(null);
  const [spot, setSpot] = useState(homeSpot);
  const [justFinished, setJustFinished] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [tempLine, setTempLine] = useState(null);
  const [tourFocus, setTourFocus] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [faded, setFaded] = useState(false);
  /** Người dùng đã bấm × cho lượt này chưa. Có message mới là mở lại. */
  const [bubbleClosed, setBubbleClosed] = useState(false);
  /** Bong bóng phải tụt xuống chân nhân vật vì trên đầu không đủ chỗ. */
  const [bubbleBelow, setBubbleBelow] = useState(false);
  /** Bong bóng phải trượt ngang bao nhiêu px để không trào ra ngoài mép màn hình. */
  const [bubbleDx, setBubbleDx] = useState(0);
  /**
   * ĐÃ BẮT ĐẦU TRÒ CHUYỆN CHƯA — mốc quyết định nhân vật có được xuất hiện hay không.
   *
   * Panel mount ngay khi người dùng chạm vào nút tròn của ô hỏi, tức TRƯỚC khi họ gõ chữ đầu
   * tiên. Nếu nhân vật hiện ra ngay lúc đó rồi 10 giây sau mới tan, thì mở nhầm ô hỏi cũng đủ để
   * một hình 146×132 px nhảy vào giữa màn hình rồi tự biến mất — đúng loại chuyển động vô cớ mà
   * "chỉ di chuyển khi có lý do" ở đầu file cấm.
   *
   * KHÔNG đếm message có sẵn: hội thoại cũ được khôi phục lại khi mở panel, nên đếm message là
   * người dùng quay lại hôm sau, vừa mở ô hỏi đã thấy nhân vật chào rồi đi — đúng thứ vừa bỏ.
   * Hai tín hiệu dùng thay: sự kiện GỬI CÂU HỎI, và agent bắt đầu chạy (bắt được cả lượt đầu
   * tiên, lượt mà chính nó làm panel mount nên listener chưa kịp gắn).
   */
  const [chatOpened, setChatOpened] = useState(false);
  const bubbleRef = useRef(null);
  const frameRef = useRef(0);
  const wasRunningRef = useRef(false);
  const fadeTimerRef = useRef(0);

  useEffect(() => {
    const g = () => setChatOpened(true);
    window.addEventListener(EVENT_ASK, g);
    return () => window.removeEventListener(EVENT_ASK, g);
  }, []);
  useEffect(() => { if (agent?.isRunning) setChatOpened(true); }, [agent?.isRunning]);

  // Bám mục tiêu do uiSpotlight báo.
  useEffect(() => watchTarget(setTarget), []);

  // Lời thoại TẠM do đoạn mã hành động chủ động đặt (VD: sắp mở tour). Xem lib/openGuide.js.
  useEffect(() => watchTempLine(setTempLine), []);

  /**
   * BIẾT TOUR ĐANG CHỈ VÀO ĐÂU — để NÉ, không phải để bám.
   *
   * Nguồn tin là `lib/productTour/focus.js`, do chính tour phát ra nên đúng cả ở những bước mà
   * phần tử bị React dựng lại. Nhân vật dùng nó đúng hai việc: biết ô nào đang khoanh sáng để
   * đứng tránh ra (xem spotAvoiding), và biết đang ở bước mấy để nói một dòng trong bong bóng.
   */
  useEffect(() => theoDoiTieuDiem(setTourFocus), []);

  /**
   * CÂU HỎI XÁC NHẬN của tool điều hướng — xem lib/openGuide.js.
   *
   * Khung chat mặc định đóng, nên nếu chỉ hỏi trong đó thì người dùng không có chỗ bấm và lượt
   * chạy của agent treo. Nhân vật hỏi hộ, dùng chung đúng hai hàm trả lời với thẻ trong khung
   * chat nên không thể lệch nhau.
   */
  useEffect(() => watchConfirm(setConfirm), []);

  // `agent.messages` bị mutate tại chỗ nên độ dài + cờ chạy mới là tín hiệu đáng tin — cùng lý
  // do đã ghi ở AgentActivityPanel.
  // Bắt đúng NHỊP CHUYỂN từ "đang chạy" sang "đã dừng" — không phải trạng thái "đang dừng".
  // Đọc trạng thái thì mọi lần render lúc rảnh đều tính là vừa xong, và nhân vật kẹt ở tư thế
  // ăn mừng mãi mãi.
  useEffect(() => {
    const running = !!agent?.isRunning;
    if (wasRunningRef.current && !running) {
      wasRunningRef.current = false;
      /**
       * CHỜ LẮNG rồi mới mừng.
       *
       * `isRunning` TỤT XUỐNG FALSE GIỮA CÁC BƯỚC, không chỉ ở cuối lượt. Đã đo trên yêu cầu
       * "đổi bộ lọc sang Metalla": ở mốc 9,2 giây nhân vật reo "Xong rồi!" trong khi chuỗi mới
       * chạy được bước 1 và còn hai bước nữa. Nhìn như trợ lý bỏ dở giữa chừng.
       *
       * Đợi theo THỜI GIAN không cứu được: đo lần hai, khoảng nghỉ giữa bước 1 và bước 2 dài
       * HƠN 2 giây, nên "Xong rồi!" vẫn nháy ở giây 8,2 khi chuỗi mới xong 1/2 bước. Kéo dài
       * ngưỡng chờ thì lúc xong thật lại phản hồi chậm.
       *
       * Tín hiệu đúng là NGỮ NGHĨA chứ không phải thời gian: lượt chỉ xong khi model đã sinh ra
       * CÂU TRẢ LỜI. Giữa chuỗi thì chưa có câu nào — nên không mừng. `QUIET_MS` chỉ còn là lớp
       * chống rung nhẹ.
       */
      const greetTimer = setTimeout(() => {
        // Điều kiện NGỮ NGHĨA, không phải thời gian: chỉ mừng khi lượt đã có CÂU TRẢ LỜI.
        // Xem chú thích trên — chờ theo thời gian bao nhiêu cũng sai.
        if (!latestAnswer(agent)) return;
        setJustFinished(true);
        fadeTimerRef.current = setTimeout(() => setJustFinished(false), DONE_MS);
      }, QUIET_MS);
      return () => { clearTimeout(greetTimer); clearTimeout(fadeTimerRef.current); };
    }
    wasRunningRef.current = running;
    // Bước mới bắt đầu → tắt ngay tư thế ăn mừng nếu nó đang hiện.
    if (running) setJustFinished(false);
    return undefined;
  }, [agent?.isRunning]);

  /**
   * Câu trả lời ở lại trong bong bóng một lúc SAU KHI lượt kết thúc.
   *
   * Bỏ ngay lúc lượt xong là vô dụng: người dùng thường đang nhìn chỗ khác trên trang đúng lúc
   * trợ lý trả lời xong — đó là lý do họ hỏi trợ lý thay vì tự tìm. Bong bóng biến mất trước khi
   * họ kịp quay lại thì coi như chưa từng hiện.
   *
   * Xoá khi: hết giờ, HOẶC lượt mới bắt đầu (câu trả lời cũ không được đè lên câu hỏi mới).
   */
  /**
   * TÍNH MỖI LẦN RENDER, không nhét vào `useMemo`/`useEffect` với danh sách phụ thuộc.
   *
   * Vì sao: nội dung message được SỬA TẠI CHỖ khi chữ chảy về, `agent.messages.length` KHÔNG
   * đổi (message đã được thêm từ đầu, lúc còn rỗng chữ). Nên mọi danh sách phụ thuộc dựng từ
   * `length` + `isRunning` đều đứng im suốt lúc stream — bong bóng sẽ hiện chữ rỗng rồi nhảy
   * một phát ra câu đầy đủ, hoặc không hiện gì.
   *
   * Quét ngược vài chục message mỗi lần render là rẻ; đúng thì quan trọng hơn.
   */
  const liveAnswer = latestAnswer(agent);

  /**
   * AG-UI TRÊN NHÂN VẬT — các bước tool của LƯỢT HIỆN TẠI, hiện ngay dưới bong bóng.
   *
   * Dùng lại `deriveAgentActions` của bảng "Hành động" thay vì tự đọc luồng message: đó là mã đã
   * chạy đúng từ lâu, và quan trọng hơn — hai chỗ cùng một nguồn thì không thể nói khác nhau.
   *
   * Chỉ lấy dòng `tool`, và chỉ của lượt cuối: bong bóng không phải nhật ký, nó chỉ trả lời câu
   * "trợ lý vừa làm gì cho tôi".
   */
  const actions = (() => {
    const all = deriveAgentActions(agent?.messages, !!agent?.isRunning, { fullAccess: FULL_ACCESS });
    const turnStart = all.map((x) => x.type).lastIndexOf('turn');
    return all.slice(turnStart + 1).filter((x) => x.type === 'tool').slice(-MAX_ACTIONS);
  })();

  // Giữ lại sau khi lượt xong — KHÔNG hẹn giờ xoá (xem chú thích ở đầu file). Chỉ chạy đúng lúc
  // `isRunning` đổi: lúc đó chữ đã đủ, không cần theo dõi từng ký tự chảy về.
  useEffect(() => {
    if (agent?.isRunning) { setAnswer(null); return; }
    if (!liveAnswer) return;
    setAnswer(liveAnswer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent?.isRunning]);

  /**
   * Có message MỚI thì mở lại bong bóng đã bị đóng tay.
   *
   * Bấm × chỉ có nghĩa "câu này tôi đọc xong rồi", không phải "im lặng mãi mãi". Bám vào số
   * lượng message vì đó là thứ đổi đúng một lần cho mỗi câu hỏi và mỗi câu trả lời — nội dung
   * thì bị sửa tại chỗ lúc chữ chảy về nên không dùng làm mốc được.
   */
  useEffect(() => {
    setBubbleClosed(false);
  }, [agent?.messages?.length]);

  const inTour = !!tourFocus?.el;

  /**
   * Tư thế TRỎ chỉ do `target` quyết định, KHÔNG do tour.
   *
   * Trong tour nhân vật không chỉ vào đâu cả (xem spotAvoiding) nên bắt nó giơ tay là tay chỉ vào
   * khoảng không — tệ hơn cả không giơ, vì mắt người sẽ dõi theo hướng ngón tay.
   */
  const { state, line } = useMemo(
    () => deriveMascotState(agent, !!target, justFinished),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agent, agent?.messages?.length, agent?.isRunning, target, justFinished],
  );

  /**
   * Tính lại vị trí: bám mục tiêu khi có, về góc đậu khi không.
   *
   * Hai điều phải giữ, cả hai đều là chuyện hiệu năng chứ không phải làm đẹp:
   *
   *  - CHỈ nghe `scroll` KHI ĐANG BÁM MỤC TIÊU. Góc đậu không phụ thuộc vị trí cuộn, nên lúc
   *    rảnh mà vẫn nghe là bắt trang trả giá cho một thứ không đổi. Trang CRM cuộn ngang kanban
   *    liên tục, và listener này bắt ở pha capture nên nhận MỌI sự kiện cuộn của mọi khung con.
   *
   *  - So sánh rồi mới `setState`. `spotBeside()` luôn trả object mới, nên gán thẳng là re-render
   *    ở mỗi khung hình cuộn dù toạ độ y hệt.
   */
  useEffect(() => {
    const placed = (v) => setSpot((cu) => (
      cu.x === v.x && cu.y === v.y && cu.flip === v.flip && cu.dir === v.dir ? cu : v
    ));

    /**
     * BA CHẾ ĐỘ, theo đúng thứ tự ưu tiên này:
     *
     *  1. Người dùng vừa hỏi "nút X ở đâu" → `target` có giá trị → ĐI TỚI VÀ CHỈ TAY. Đây là lúc
     *     duy nhất việc chỉ trỏ là câu trả lời, không phải trang trí: câu hỏi hỏi vị trí thì ngón
     *     tay trả lời nhanh hơn mọi câu chữ.
     *  2. Tour đang chạy → ĐẬU YÊN, chỉ né tooltip và ô đang khoanh sáng. Xem spotAvoiding().
     *  3. Rảnh → về chỗ đậu.
     *
     * Trường hợp 1 THẮNG trường hợp 2 (trước đây ngược lại): nếu người dùng chủ động hỏi vị trí
     * trong lúc tour đang mở thì cái họ vừa hỏi mới là thứ cần chỉ.
     */
    const elTour = tourFocus?.el || null;

    const measure = () => {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        if (target && document.body.contains(target)) {
          placed(spotBeside(target, elTour ? tourTooltipBox() : null));
        } else if (elTour) {
          const litBox = document.body.contains(elTour) ? boxOf(elTour, 12) : null;
          placed(spotAvoiding([tourTooltipBox(), litBox]));
        } else {
          placed(homeSpot());
        }
      });
    };
    measure();

    window.addEventListener('resize', measure);
    if (target || elTour) window.addEventListener('scroll', measure, true);

    /**
     * THU/PHÓNG THANH MENU KHÔNG PHÁT RA SỰ KIỆN NÀO.
     *
     * Chỗ đậu tính theo mép trái của `<main>`, mà `<main>` co giãn khi người dùng thu thanh menu
     * bên trái. Việc đó không sinh `resize` (cửa sổ không đổi) cũng không sinh `scroll` — nên
     * nhân vật đứng nguyên toạ độ cũ: menu thu lại thì nó lơ lửng giữa vùng nội dung, menu bung
     * ra thì nó chui xuống dưới menu. Đã chụp màn hình và thấy đúng ca thứ nhất.
     *
     * `ResizeObserver` trên chính `<main>` là tín hiệu đúng: nó bắt MỌI nguyên nhân làm vùng nội
     * dung đổi bề ngang, không riêng cái nút thu menu. Cùng cách `GuideAskBar` đã dùng cho nút
     * tròn của ô hỏi — hai thứ đậu cạnh nhau nên phải nghe cùng một nguồn, không thì có lúc lệch
     * nhau một nhịp.
     */
    let watch = null;
    const main = document.querySelector('main');
    if (main && typeof ResizeObserver === 'function') {
      watch = new ResizeObserver(measure);
      watch.observe(main);
    }

    /**
     * TRONG TOUR THÌ ĐO LẠI ĐỀU ĐẶN, không chỉ khi cuộn.
     *
     * Tính đúng MỘT lần lúc đổi bước là hỏng: lúc đó tooltip của bước mới CHƯA kịp dời tới chỗ
     * của nó, nên nhân vật né tooltip của bước TRƯỚC rồi đứng nguyên đấy — và thường là đứng
     * đúng chỗ tooltip mới vừa dọn tới. Cùng lý do với những bước mở panel/modal: layout đổi mà
     * không hề có sự kiện cuộn nào.
     *
     * Nay nhân vật không bám theo bước nữa, nhưng nhịp đo này thì vẫn cần — và cần đúng vì lý do
     * cũ: thứ nó phải né là thứ dời chỗ mỗi bước.
     *
     * Chính `ProductTourProvider` cũng đo lại lỗ sáng mỗi 120 ms vì đúng lý do này. 250 ms ở đây
     * là hai lần `getBoundingClientRect` mỗi nhịp, và CHỈ chạy khi tour đang mở.
     */
    let tick = 0;
    if (elTour) tick = setInterval(measure, 250);

    return () => {
      cancelAnimationFrame(frameRef.current);
      clearInterval(tick);
      watch?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [target, tourFocus]);

  // Câu trả lời được ưu tiên hơn câu trạng thái — trừ lúc đang chỉ trỏ, vì khi đó việc của bong
  // bóng là nói "ở đây", không phải kể lại câu trả lời.
  /**
   * Bản GIỮ phải tắt ngay khi có câu hỏi mới, không đợi `isRunning` bật.
   *
   * Giữa lúc ô hỏi gọi `addMessage` và lúc agent kịp đặt `isRunning = true` có một nhịp. Trong
   * nhịp đó `shownAnswer` vẫn lấy bản giữ, nên câu trả lời CŨ nằm chình ình ngay dưới câu hỏi
   * MỚI — người dùng đọc thành "trợ lý trả lời ngay tức khắc, mà trả lời sai".
   *
   * Message cuối là `user` nghĩa là câu hỏi vừa vào và lượt chưa có chữ nào: không có gì để hiện.
   */
  const msgs = Array.isArray(agent?.messages) ? agent.messages : [];
  const lastIsQuestion = msgs[msgs.length - 1]?.role === 'user';
  const shownAnswer = bubbleClosed
    ? null
    : (agent?.isRunning ? liveAnswer : (lastIsQuestion ? null : answer));

  /**
   * Lời thoại TẠM thắng tất cả.
   *
   * Nó chỉ được đặt ngay trước một hành động sắp che màn hình (mở tour), và chỉ sống hơn một
   * giây. Trong khoảnh khắc đó, việc duy nhất đáng nói là báo trước cho người dùng — câu trả lời
   * hay câu trạng thái đều đợi được.
   */
  /**
   * Đang trong tour thì bong bóng chỉ nói MỘT dòng: đang ở bước mấy. Tên bước và phần giải thích
   * đã nằm trong tooltip của tour ngay cạnh đó — chép lại là hai hộp chữ chồng nhau.
   *
   * Và KHÔNG còn chữ "ở đây!": nhân vật không chỉ vào ô nữa, nói "ở đây" trong khi đứng đậu ở góc
   * là chỉ sai chỗ. Tooltip của tour mới là thứ đang chỉ.
   */
  const tourText = inTour ? `Đang hướng dẫn · bước ${tourFocus.step}/${tourFocus.total}` : '';
  /**
   * Đang trỏ vào một nút thì VẪN hiện câu trả lời, không thay bằng "Ở đây!".
   *
   * Trước đây bong bóng nhường chỗ cho chữ "Ở đây!" mỗi khi trợ lý trỏ nút. Hồi khung chat còn
   * mở mặc định thì không sao — chữ nằm bên phải. Nay khung chat đóng, nhân vật là chỗ DUY NHẤT
   * hiện phản hồi, nên nhường chỗ như vậy là nuốt mất câu trả lời: đã đo một lượt "Nút Xuất
   * Excel ở đâu?" — bong bóng đứng nguyên chữ "Ở đây!" suốt 36 giây, tới lúc vòng sáng tự tắt
   * mới hiện câu trả lời. Ngón tay trỏ đã nói "ở đây" rồi, chữ nên nói phần còn lại.
   */
  /**
   * CÂU TRẢ LỜI ĐỨNG TRƯỚC dòng đếm bước tour — thứ tự này từng ngược, và đó là một lỗi thật.
   *
   * Kịch bản: người dùng nhờ mở hướng dẫn → trợ lý gọi tool, tour bật lên → rồi trợ lý mới viết
   * câu trả lời ("Mình đã mở hướng dẫn tới bước 30/52 — tab Công việc. Bấm Tiếp để…"). Nhưng
   * lúc đó `inTour` đã bật, mà `tourText` lại đứng trên `shownAnswer`, nên câu trả lời bị
   * dòng "Đang hướng dẫn · bước 30/52" đè mất. Nó chỉ hiện ra khi người dùng ĐÓNG tour — tức
   * đúng lúc không còn ích gì, vì câu đó dặn cách dùng chính cái tour vừa đóng.
   *
   * Cùng một lý lẽ với chữ "Ở đây!" của đoạn trên: dòng trạng thái mà nuốt câu trả lời thì
   * người dùng mất thứ họ hỏi, để đổi lấy thứ họ đã nhìn thấy sẵn (tour có tooltip riêng, đã ghi
   * rõ đang ở bước nào).
   *
   * Dòng đếm bước không mất hẳn — nó vẫn hiện suốt quãng tour chưa có câu trả lời nào, và quay
   * lại ngay khi người dùng bấm × dọn câu trả lời đi.
   */
  const text = confirm?.text
    || tempLine?.text
    || shownAnswer?.text
    || tourText
    || line
    || '';
  /**
   * Dải bước sống suốt LƯỢT, không tắt giữa chuỗi.
   *
   * Điều kiện cũ (`đang chạy || vừa done || có câu trả lời`) làm dải bước BIẾN MẤT rồi HIỆN LẠI
   * ở mỗi khoảng nghỉ giữa hai bước — đã đo: ở giây 14 số bước tụt về 0 rồi giây 16 lên lại 2.
   * Nhấp nháy như vậy còn tệ hơn không có.
   *
   * Nay dải bước sống bằng đúng vòng đời của bong bóng: mất khi người dùng bấm ×, và được thay
   * bằng dải mới khi có lượt mới. Đóng một nửa (còn dải bước, mất chữ) thì nhìn như hỏng.
   */
  const showActions = actions.length > 0 && !bubbleClosed && !inTour;

  /**
   * Nút × chỉ mọc trên chữ do NGƯỜI dùng cần đọc — tức câu trả lời.
   *
   * Không mọc trên chữ trạng thái ("Để ta nghĩ đã…", "Đang hướng dẫn · bước 3/16"): những câu đó
   * tự bị câu sau thay thế trong vài giây, thêm nút đóng là bắt người dùng dọn một thứ tự nó dọn.
   *
   * KHÔNG loại trừ `inTour` nữa: từ lúc câu trả lời được ưu tiên hơn dòng đếm bước, bong bóng
   * trong tour hoàn toàn có thể đang là câu trả lời — mà thiếu × thì người dùng không có cách nào
   * dọn nó đi để xem lại dòng đếm bước. Điều kiện `text === shownAnswer.text` đã tự lo phần
   * phân biệt, nên chỉ cần bỏ vế thừa.
   */
  const isAnswerBubble = !confirm && !tempLine && !!shownAnswer && text === shownAnswer.text;

  /**
   * Bong bóng CÂU TRẢ LỜI cao cả trăm pixel, mà nó neo phía TRÊN đầu nhân vật. Nhân vật đứng
   * cạnh một nút ở nửa trên màn hình là bong bóng trào ra ngoài mép trên: chụp màn hình thấy mất
   * hai dòng đầu và mất luôn nút × ở góc.
   *
   * Đo hộp thật sau khi vẽ rồi mới quyết định, KHÔNG đoán trước bằng số dòng: chiều cao phụ
   * thuộc chữ, cỡ chữ và bề ngang màn hình. CSS đã có sẵn `data-bubble-below` để lật chóp bong
   * bóng xuống, ở đây chỉ bật cờ.
   */
  /**
   * QUYẾT ĐỊNH PHẢI ĐỘC LẬP VỚI KẾT QUẢ CỦA CHÍNH NÓ.
   *
   * Bản đầu đo `getBoundingClientRect().top` — mà `top` lại phụ thuộc bong bóng đang nằm trên
   * hay dưới, tức phụ thuộc đúng cái cờ mà nó sắp đặt. Hai nhánh lật nhau vô tận: React dừng ở
   * lỗi #185 "Maximum update depth exceeded" và cả trang chết trắng. Đã dựng lại được: hỏi một
   * câu bất kỳ, chờ ~40 giây là app đổ sang màn hình "Đã xảy ra lỗi".
   *
   * Nay chỉ dùng hai số KHÔNG đổi khi lật: chiều cao bong bóng và tung độ nhân vật. Cùng đầu vào
   * thì cùng kết quả, nên chạy tối đa một lần lật rồi đứng yên.
   */
  const pose = tempLine?.state || state;
  /**
   * CÓ THẬT SỰ LẬT KHÔNG — dùng chung cho `data-flip` và cho phép tính kẹp bong bóng bên dưới.
   *
   * `spot.lat` mới chỉ là "nhân vật đứng bên phải mục tiêu"; ảnh có được lật hay không còn phụ
   * thuộc tư thế (`canFlip`). Hai chỗ tính riêng là có ngày lệch nhau: CSS neo bong bóng theo
   * `data-flip`, còn JS lại đoán mép trái theo `spot.lat` — lệch đúng một lần là dịch sai chiều
   * và đẩy bong bóng RA NGOÀI màn hình thay vì kéo vào.
   */
  const flipped = spot.flip && canFlip(pose);

  useLayoutEffect(() => {
    const el = bubbleRef.current;
    const need = el ? spot.y - el.offsetHeight - 6 < 4 : false;
    if (need !== bubbleBelow) setBubbleBelow(need);

    /**
     * KÉO BONG BÓNG VÀO TRONG MÀN HÌNH THEO CHIỀU NGANG.
     *
     * Chiều dọc đã có `bubbleBelow` lo, chiều ngang thì trước đây KHÔNG AI lo — và đó là lỗ hổng
     * thật, không phải giả định: bong bóng rộng tới 322 px trong khi nhân vật chỉ rộng 146 px và
     * đậu sát mép trái vùng nội dung. Thu thanh menu lại là mép trái tụt về gần 0, bong bóng căn
     * giữa đầu nhân vật sẽ trào ra ngoài màn hình — mất luôn phần chữ bên trái, và mất theo kiểu
     * im lặng vì không có thanh cuộn ngang nào báo.
     *
     * Cùng luật với lỗi #185 đã gặp: QUYẾT ĐỊNH PHẢI ĐỘC LẬP VỚI KẾT QUẢ CỦA CHÍNH NÓ. Ở đây
     * chỉ dùng ba số không đổi khi dịch — bề ngang bong bóng, toạ độ nhân vật, bề ngang cửa sổ.
     * `offsetWidth` không phụ thuộc `translateX`, nên chạy đúng một lần rồi đứng yên.
     */
    if (el) {
      const bw = el.offsetWidth;
      const vw = window.innerWidth;
      // Mép trái bong bóng NẾU không dịch gì: căn giữa đầu nhân vật, hoặc căn mép phải khi
      // nhân vật bị lật (xem `--dai` trong CSS: data-lat="1" thì bong bóng neo right: 0).
      const leftEdge = flipped ? spot.x + W - bw : spot.x + W / 2 - bw / 2;
      // Kẹp mép trái vào [4, vw-4-bw] rồi lấy hiệu. Viết thành một phép kẹp DUY NHẤT chứ không
      // phải hai phép `min/max` rời: bản đầu kẹp riêng từng bên và vế phải bị bọc thêm
      // `Math.max(0, …)`, khiến trường hợp tràn sang PHẢI luôn ra 0 — tức là sửa được đúng một
      // nửa số ca. `Math.max(4, …)` ở cận trên lo nốt màn hình quá hẹp so với bong bóng.
      const need = Math.min(Math.max(leftEdge, 4), Math.max(4, vw - 4 - bw));
      const dest = Math.round(need - leftEdge);
      if (dest !== bubbleDx) setBubbleDx(dest);
    }
  });

  // Đăng ký nghe đổi bộ nhân vật: `spriteFor` đọc biến cấp module nên React không tự biết.
  useMascotSet();
  const sprite = spriteFor(pose);
  /** Lúc nào thì thân nhân vật KHÔNG nhận chuột — xem chú thích ở chỗ dùng. */
  const lockClicks = pose === 'pointing' || inTour;
  // Còn bong bóng câu trả lời thì chưa mờ đi — mờ trong lúc người ta đang đọc là phản tác dụng.
  const hidden = state === 'idle' && !target && !inTour && !shownAnswer && !tempLine && !confirm;

  /**
   * Rảnh đủ lâu thì TAN hẳn; có việc thì hiện lại ngay. Xem RANH_TAN_MS.
   *
   * `an` gói sẵn đúng định nghĩa "đang rảnh" mà cả file này dùng (không chạy, không trỏ, không có
   * bong bóng nào), nên bám theo nó thay vì dựng lại một điều kiện thứ hai — hai điều kiện song
   * song rồi sẽ lệch nhau.
   */
  useEffect(() => {
    if (!hidden) { setFaded(false); return undefined; }
    // Chưa bắt đầu trò chuyện → tan NGAY, không có màn chào 10 giây. Xem `chatOpened`.
    if (!chatOpened) { setFaded(true); return undefined; }
    const id = setTimeout(() => setFaded(true), IDLE_FADE_MS);
    return () => clearTimeout(id);
  }, [hidden, chatOpened]);

  return (
    <div
      className={`app-guide-mascot app-guide-mascot--${pose}`}
      data-hidden={hidden ? '1' : '0'}
      data-tan={faded ? '1' : '0'}
      /* Lớp tối của tour nằm ở z-index 100.050. Không nâng lên thì nhân vật bị phủ mờ đi, nhìn
         như đã tắt — xem appGuideCopilot.css. */
      data-tour={inTour ? '1' : '0'}
      data-bubble-below={bubbleBelow ? '1' : undefined}
      data-flip={flipped ? '1' : '0'}
      /* Đứng trên/dưới mục tiêu thì tay không chỉ tới nơi (ảnh chỉ có tư thế trỏ ngang) — vẽ
         thêm mũi tên về phía mục tiêu. Xem spotBeside(). */
      data-dir={spot.dir === 'top' || spot.dir === 'bottom' ? spot.dir : undefined}
      style={{ transform: `translate3d(${spot.x}px, ${spot.y}px, 0)` }}
    >
      {text ? (
        /*
          HAI LỚP cho bong bóng dài, không phải một.
          Khung ngoài (`__bubble--dai`) là CUỘN THƯ: hai trục gỗ ở trên và dưới, đứng yên.
          Lớp trong (`__giay`) là mặt giấy — chỉ lớp này cuộn. Gộp làm một thì hai trục trôi
          theo chữ và biến mất khỏi tầm nhìn ngay khi người đọc cuộn xuống, đúng như nút × đã
          từng bị. Bong bóng NGẮN (viên thuốc một dòng) không có lớp giấy: nó không cuộn.
        */
        <div
          ref={bubbleRef}
          className={`app-guide-mascot__bubble${isAnswerBubble || confirm ? ' app-guide-mascot__bubble--long' : ''}`}
          style={bubbleDx ? { '--agm-bong-dx': `${bubbleDx}px` } : undefined}
        >
        <div className={isAnswerBubble || confirm ? 'app-guide-mascot__shoes' : 'app-guide-mascot__one-line'}>
          {isAnswerBubble ? (
            /* Ngoại lệ `pointer-events` thứ hai của cả tính năng (cùng với ô hỏi nổi): nhân vật
               không bao giờ nhận chuột, riêng nút này thì phải. Nó nhỏ và nằm ở góc bong bóng
               nên vùng chắn chuột chỉ vài chục pixel. */
            <button
              type="button"
              className="app-guide-mascot__close"
              /* Bấm × là "xong việc này rồi", không chỉ "cất chữ đi". Nên nó tắt LUÔN vòng sáng
                 và mục tiêu đang trỏ — nhân vật hết cớ bám và tự về chỗ đậu.
                 Không làm vậy thì nhân vật đứng nguyên cạnh cái nút thêm 45 giây nữa (hết
                 AUTO_CLEAR_BUTTON_MS / AUTO_CLEAR_REGION_MS của uiSpotlight) mà không còn chữ nào giải thích vì sao nó ở đó,
                 lại đúng lúc đang che mấy nút bên cạnh. `clearSpotlight` an toàn khi gọi thừa. */
              onClick={() => { setBubbleClosed(true); clearSpotlight(); }}
              aria-label="Đóng lời thoại"
              title="Đóng (chữ chỉ mất khi bạn bấm, hoặc khi có câu mới)"
            >
              ×
            </button>
          ) : null}
          {text}
          {/* Câu hỏi thì KHÔNG có nút ×: bỏ qua nó là để agent treo giữa lượt. Phải trả lời,
              và trả lời ở đây hay ở khung chat đều được. */}
          {confirm ? (
            <span className="app-guide-mascot__ask">
              {confirm.agree ? (
                <button
                  type="button"
                  className="app-guide-mascot__button app-guide-mascot__button--primary"
                  onClick={() => confirm.agree()}
                >
                  ✅ {confirm.confirm_label || 'Đồng ý'}
                </button>
              ) : null}
              <button
                type="button"
                className="app-guide-mascot__button"
                onClick={() => confirm.decline?.()}
              >
                Thôi
              </button>
            </span>
          ) : null}
        </div>
        </div>
      ) : null}
      {showActions ? (
        <div className="app-guide-mascot__step">
          {actions.map((h) => (
            <div key={h.key} className={`app-guide-mascot__step-row is-${h.status}`}>
              <span className="app-guide-mascot__step-icon">{h.icon}</span>
              <span className="app-guide-mascot__step-label">{h.label}</span>
              {h.note ? <span className="app-guide-mascot__step-note">{h.note}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
      {spot.dir === 'top' || spot.dir === 'bottom' ? (
        <span className="app-guide-mascot__nose" aria-hidden="true" />
      ) : null}
      {/*
        BẤM VÀO NHÂN VẬT ĐỂ BẬT/TẮT Ô HỎI.
        Cả khung vẫn `pointer-events: none` — chỉ riêng thân nhận chuột, và CHỈ KHI đang rảnh.
        Hai lúc phải trả chuột lại cho trang:
         - đang TRỎ: nhân vật đứng sát thứ nó chỉ, nhận chuột là có ngày nó nuốt đúng cú bấm mà nó
           vừa bảo người dùng bấm;
         - đang TOUR: tour bảo người dùng bấm vào ô đang khoanh sáng, mà nhân vật thì đứng né sang
           chỗ khác — chỗ khác đó vẫn có thể là một nút.
      */}
      <div
        className="app-guide-mascot__body"
        data-bam-duoc={lockClicks ? '0' : '1'}
        role={lockClicks ? undefined : 'button'}
        tabIndex={lockClicks ? undefined : 0}
        aria-label={lockClicks ? undefined : 'Mở ô hỏi trợ lý'}
        title={lockClicks ? undefined : 'Bấm để hỏi ta'}
        onClick={lockClicks ? undefined : () => toggleAskBar()}
        onKeyDown={lockClicks ? undefined : (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAskBar(); }
        }}
      >
        {sprite && hasSprite()
          ? <img src={sprite} alt="" width={W} height={H} draggable="false" />
          : <VectorFigure state={pose} />}
      </div>
    </div>
  );
}
