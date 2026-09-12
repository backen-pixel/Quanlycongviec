/**
 * Ô HỎI NỔI — lối vào THƯỜNG TRỰC của trợ lý, ở góc dưới trái.
 *
 * Hai hình dạng:
 *  - THU GỌN: đúng một nút tròn hình nhân vật. Đây là thứ duy nhất của trợ lý còn nằm trên màn
 *    hình khi không ai dùng tới nó — nhân vật đứng thì tự biến mất sau 10 giây, nên nếu nút này
 *    cũng ẩn thì không còn lối vào nào cả.
 *  - MỞ RỘNG: nút tròn + ô nhập + ☰ (mở khung hội thoại đầy đủ) + × (thu lại) + ➤.
 *
 * NẰM TRONG BUNDLE CHÍNH, cố ý. Nó KHÔNG import CopilotKit: nếu import, cả thư viện 634 KB gzip
 * sẽ tải ngay khi vào bất cứ trang nào, xoá sạch việc tải chậm mà AppGuideCopilot.jsx dựng ra.
 *
 * Nó chỉ biết làm hai việc: nhận chữ, rồi `askGuide(text)`. Câu hỏi được xếp hàng trong
 * lib/openGuide.js và phát sự kiện mở trợ lý; panel (khi đã tải xong) lấy ra và gửi cho agent —
 * xem GuideAskBridge.jsx. Lần hỏi đầu tiên vì thế mất thêm một nhịp để tải thư viện, các lần
 * sau tức thì.
 *
 * `pointer-events: auto` — ngoại lệ so với nhân vật. Nhân vật đi khắp màn hình nên không bao giờ
 * được nhận chuột; thanh này đứng yên và tồn tại để được bấm.
 */
import { useEffect, useRef, useState } from 'react';
import {
  askGuide, watchRunning, openChatWindow, watchAskBar, toggleAskBar, watchAskFailed,
} from './lib/openGuide';
import { spriteFor } from './lib/mascotSprite';
import { useMascotSet } from './lib/useMascotSet';

/** Cách mép trái vùng nội dung bao nhiêu. Khớp với chỗ đậu của nhân vật. */
const LEFT_MARGIN = 12;

/**
 * NEO VÀO MÉP TRÁI VÙNG NỘI DUNG, không neo giữa màn hình.
 *
 * Bản trước căn giữa (`left: 50%`), nên lúc thu gọn quả bóng rơi vào giữa màn hình — trên màn
 * rộng 1920 nó nằm chình ình giữa nội dung. Neo theo `<main>` chứ không theo mép trái màn hình:
 * mép trái màn hình là thanh menu, đặt ở đó là đè lên menu.
 */
function sidebarLeft() {
  if (typeof document === 'undefined') return LEFT_MARGIN;
  const main = document.querySelector('main');
  return Math.max(LEFT_MARGIN, (main ? main.getBoundingClientRect().left : 0) + LEFT_MARGIN);
}

/**
 * KHUNG CHAT DÁN MÉP PHẢI CHIẾM BAO NHIÊU BỀ NGANG.
 *
 * Phải trừ đi, không thì thanh hỏi thò xuống DƯỚI khung chat. Nó vẫn vẽ ra bình thường nên trông
 * như không sao, nhưng khung chat có `z-index: 1200` còn thanh hỏi `56`, nên mọi cú bấm vào phần
 * bị che rơi vào ô soạn thảo của khung chat. Đo được trên màn 1080px: nút ➤ nằm ở x=746 trong khi
 * khung chat bắt đầu từ x=660 — `elementFromPoint` ngay tâm nút trả về khung chat, và bấm gửi
 * không có tác dụng gì cả. Đây là ca im lặng khó chịu nhất: nút sáng, không disabled, bấm không
 * chạy.
 *
 * Trả 0 khi khung đã trượt ra ngoài mép phải (CopilotKit không tháo phần tử, chỉ đẩy đi).
 */
function sidebarRight() {
  if (typeof document === 'undefined') return 0;
  const el = document.querySelector('[data-copilot-sidebar]');
  if (!el) return 0;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.left >= window.innerWidth) return 0;
  return Math.max(0, Math.round(window.innerWidth - r.left));
}

/** Hẹp hơn ngần này thì ô nhập không còn dùng được — thu về đúng nút tròn. */
const MIN_ROOM = 220;

/** Khoảng trống thật còn lại cho thanh hỏi. */
function roomFor(left, right) {
  if (typeof window === 'undefined') return MIN_ROOM;
  return window.innerWidth - left - right - 16;
}

export default function GuideAskBar() {
  useMascotSet(); // ảnh đại diện lấy từ bộ đang chọn — phải vẽ lại khi admin đổi bộ
  const [text, setText] = useState('');
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [left, setLeft] = useState(sidebarLeft);
  const [right, setRight] = useState(0);
  const oRef = useRef(null);

  /**
   * Chỗ quá hẹp thì THU VỀ NÚT TRÒN, không cố vẽ ô nhập tí hon.
   *
   * Không ẩn hẳn cả thanh: nút tròn là lối vào thường trực duy nhất còn lại khi nhân vật đã tự
   * biến mất, ẩn nốt là người dùng không còn cách nào gọi trợ lý. Nút tròn rộng 40px, đứng sát
   * mép trái vùng nội dung nên không bao giờ chạm tới khung chat.
   */
  const cramped = roomFor(left, right) < MIN_ROOM;
  const open = expanded && !cramped;

  /**
   * Theo dõi bằng ResizeObserver, KHÔNG chỉ nghe `resize` của cửa sổ.
   *
   * Thu/mở thanh menu trái làm `<main>` đổi mép trái mà KHÔNG phát sự kiện resize nào — chỉ nghe
   * `resize` thì thanh hỏi đứng lại chỗ cũ, hoặc thò vào dưới menu.
   */
  useEffect(() => {
    const measure = () => { setLeft(sidebarLeft()); setRight(sidebarRight()); };
    measure();
    window.addEventListener('resize', measure);
    const main = document.querySelector('main');
    const watch = (main && typeof ResizeObserver !== 'undefined') ? new ResizeObserver(measure) : null;
    if (main) watch?.observe(main);
    /**
     * Khung chat TRƯỢT ra vào chứ không mount/unmount, nên không có sự kiện nào để bám: không
     * resize, không mutation trên `<main>`, và ResizeObserver cũng im vì bề ngang của nó không
     * đổi. Đo theo nhịp là cách duy nhất chắc chắn — hai lần `getBoundingClientRect` mỗi 400ms.
     */
    const tick = setInterval(measure, 400);
    return () => {
      window.removeEventListener('resize', measure);
      watch?.disconnect();
      clearInterval(tick);
    };
  }, []);

  useEffect(() => watchRunning(setRunning), []);

  /**
   * MỌI lần đóng/mở đều đi qua kênh `toggleAskBar`, kể cả cú bấm vào chính nút tròn này.
   *
   * Đổi thẳng state cục bộ thì nhanh hơn một nhịp, nhưng `AppGuideCopilot` lại lắng nghe đúng
   * kênh đó để NẠP TRƯỚC bundle CopilotKit lúc người dùng vừa mở ô nhập. Trước đây việc nạp
   * trước vẫn chạy vì nút tĩnh của nhân vật có gọi `toggleAskBar`; bỏ nút đó đi mà không nối lại
   * chỗ này thì 634 KB chỉ bắt đầu tải lúc bấm Gửi — câu hỏi đầu tiên phải đứng đợi.
   */
  useEffect(() => watchAskBar((show) => {
    setExpanded((current) => (typeof show === 'boolean' ? show : !current));
  }), []);

  /**
   * KHÔNG GỬI ĐƯỢC THÌ TRẢ CHỮ VỀ Ô NHẬP.
   *
   * Đáy an toàn của đường xếp hàng (xem `reportAskFailed`). Không ghi đè thứ người dùng đang gõ
   * dở — họ đã sang câu khác thì câu cũ không còn quan trọng bằng.
   */
  useEffect(() => watchAskFailed((failed) => {
    setText((current) => (current.trim() ? current : failed));
    toggleAskBar(true);
  }), []);

  // Mở ra thì con trỏ nhảy thẳng vào ô nhập: mở xong còn phải bấm thêm một cú nữa mới gõ được
  // là thừa một thao tác ở thứ người ta dùng mỗi ngày.
  useEffect(() => {
    if (open) oRef.current?.focus();
  }, [open]);

  const send = () => {
    const content = text.trim();
    if (!content || running) return;
    askGuide(content);
    setText('');
  };

  const onKey = (e) => {
    // Enter gửi, Shift+Enter xuống dòng — thói quen chung của mọi ô chat.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
    if (e.key === 'Escape') toggleAskBar(false);
  };

  return (
    <div
      className={`app-guide-askbar${open ? '' : ' app-guide-askbar--collapsed'}`}
      style={{ '--agb-trai': `${left}px`, '--agb-phai': `${right}px` }}
    >
      {/* Nút tròn: vừa là mặt nhân vật, vừa là nút bật/tắt ô nhập. */}
      <button
        type="button"
        className="app-guide-askbar__avatar-button"
        onClick={() => toggleAskBar()}
        aria-label={open ? 'Thu ô hỏi' : 'Hỏi trợ lý hướng dẫn'}
        aria-expanded={open}
        title={open ? 'Thu lại' : 'Bấm để hỏi ta'}
      >
        <img
          className="app-guide-askbar__avatar"
          src={spriteFor('idle')}
          alt=""
          draggable="false"
        />
      </button>

      {/* Giữ trong DOM cả lúc thu gọn để còn animation trượt ra, và để `focus()` có chỗ bám. */}
      <textarea
        ref={oRef}
        className="app-guide-askbar__input"
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        placeholder={running ? 'Đang trả lời…' : 'Hỏi ta bất cứ điều gì…'}
        disabled={running}
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        aria-label="Hỏi trợ lý hướng dẫn"
      />
      {/* Khung chat mặc định ĐÓNG — mọi phản hồi hiện trên nhân vật. Nút này để đọc lại lịch sử
          và những câu trả lời dài mà bong bóng phải cắt bớt. */}
      <button
        type="button"
        className="app-guide-askbar__history"
        onClick={() => openChatWindow()}
        tabIndex={open ? 0 : -1}
        aria-label="Mở khung hội thoại"
        title="Xem hội thoại đầy đủ"
      >
        ☰
      </button>
      <button
        type="button"
        className="app-guide-askbar__close"
        onClick={() => toggleAskBar(false)}
        tabIndex={open ? 0 : -1}
        aria-label="Thu ô hỏi"
        title="Thu lại (Esc)"
      >
        ×
      </button>
      <button
        type="button"
        className="app-guide-askbar__send"
        onClick={send}
        disabled={running || !text.trim()}
        tabIndex={open ? 0 : -1}
        aria-label="Gửi câu hỏi"
        title="Gửi (Enter)"
      >
        ➤
      </button>
    </div>
  );
}
