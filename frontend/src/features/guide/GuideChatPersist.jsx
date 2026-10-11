/**
 * GIỮ HỘI THOẠI QUA LẦN TẢI LẠI TRANG.
 *
 * ═══════════════ VÌ SAO CẦN ═══════════════
 *
 * Runtime của trợ lý KHÔNG lưu thread: máy chủ chỉ nhận danh sách message client gửi lên rồi trả
 * lời, không giữ gì giữa hai request. Toàn bộ hội thoại sống trong bộ nhớ của tab. Nhấn F5 hoặc
 * bấm vào một liên kết mở lại trang là mất sạch — kể cả khi trợ lý vừa thao tác xong một chuỗi
 * dài mà người dùng còn đang đọc.
 *
 * ═══════════════ VÌ SAO localStorage CHỨ KHÔNG PHẢI SERVER ═══════════════
 *
 * Lưu server thì hội thoại theo được sang máy khác, nhưng phải thêm bảng, thêm endpoint, và mỗi
 * lượt hỏi cõng thêm một lượt ghi DB. Cái người dùng cần ở đây hẹp hơn nhiều: TẢI LẠI TRANG trên
 * CÙNG một máy. localStorage phủ đúng ca đó, tốn 0 lượt gọi mạng, và hỏng thì cũng chỉ mất phần
 * lịch sử chứ không chặn ai hỏi.
 *
 * ═══════════════ BA THỨ PHẢI CẨN THẬN ═══════════════
 *
 * 1. CẮT ĐÚNG MỐC LƯỢT. Không được cắt giữa một lượt: message `tool` mồ côi lời gọi sinh ra nó
 *    làm provider trả 400 chứ không bỏ qua. Cùng luật với `catLichSu` ở backend.
 * 2. KHOÁ THEO NGƯỜI DÙNG. Hai người đăng nhập trên cùng máy mà chung khoá là người sau đọc được
 *    hội thoại của người trước.
 * 3. HẠN DÙNG. Hội thoại ba ngày trước khôi phục lên chỉ gây bối rối, và nó còn kéo theo ngữ
 *    cảnh cũ vào lượt hỏi mới — tốn token cho một thứ không ai muốn.
 */
import { useEffect, useRef } from 'react';
import { useAgent } from '@copilotkit/react-core/v2';
import { useAuth } from '../../lib/auth';
import { setRestoreMark } from './lib/restoreMarker';

/** Quá hạn này thì bỏ, coi như phiên mới. 12 giờ = trong ngày làm việc thì còn, hôm sau thì thôi. */
const TTL_MS = 12 * 60 * 60 * 1000;
/** Giữ tối đa ngần này lượt hỏi. Khớp tinh thần với `so_luot_nho` của server. */
const MAX_TURNS = 8;
/** Chặn trên cho dung lượng — localStorage thường chỉ 5 MB cho cả origin. */
const MAX_CHARS = 400_000;
const DEBOUNCE_MS = 800;
/** Canh gác khôi phục: kiểm mỗi NHIP_MS, tối đa THOI_HAN_MS. */
const TICK_MS = 250;
const DEADLINE_MS = 8000;

/** Message này có mở đầu một lượt hỏi không? */
function isTurnMark(m) {
  return m?.role === 'user';
}

/**
 * Giữ lại N lượt cuối, cắt ĐÚNG tại một message của người dùng.
 *
 * Cắt ở chỗ khác là để lại `tool` mồ côi — thứ mà provider trả 400. Đây chính là lý do không
 * dùng `slice(-N)` cho gọn.
 */
function trimToTurns(list, n) {
  if (!Array.isArray(list) || list.length === 0) return [];
  let count = 0;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (!isTurnMark(list[i])) continue;
    count += 1;
    if (count === n) return list.slice(i);
  }
  return list;
}

export default function GuideChatPersist() {
  const { agent } = useAgent();
  const { user } = useAuth();
  /**
   * CHUỖI id, KHÔNG phải object `user`.
   *
   * `useAuth()` trả về object mới ở mỗi lần render. Để nó trong danh sách phụ thuộc của effect
   * thì mỗi render là một lần dựng lại: cleanup `clearInterval` chạy trước, rồi lần chạy mới
   * thoát ngay ở cờ `restored` — canh gác bị gỡ sau vài chục mili giây và không bao giờ dựng
   * lại. Nhìn từ ngoài thì y hệt "không làm gì cả", không lỗi, không log.
   */
  const userKey = user?.id || user?.userId || '';
  const key = `guide.chat.${userKey || 'khach'}`;
  const restored = useRef(false);

  /**
   * AGENT GIỮ TRONG REF, KHÔNG ĐỂ TRONG DEPS.
   *
   * Đây là chỗ đã sai hai lần liên tiếp. Canh gác khôi phục là một `setInterval`; hễ có thứ gì
   * trong danh sách phụ thuộc đổi thì cleanup `clearInterval` chạy, còn lần chạy mới thoát ngay
   * ở cờ `restored` — canh gác chết mà không để lại dấu vết nào.
   *
   * Lần một là `user` (object mới mỗi render). Sửa xong thì tới `agent`: CopilotKit dựng lại
   * object agent khi runtime nối xong — ĐÚNG khoảnh khắc ta cần canh. Nên agent phải đi qua ref,
   * và effect chỉ phụ thuộc vào một chuỗi id.
   */
  const agentRef = useRef(null);
  agentRef.current = agent;

  useEffect(() => {
    if (!userKey || restored.current) return undefined;

    let raw = null;
    try { raw = localStorage.getItem(key); } catch { return undefined; }
    if (!raw) { restored.current = true; return undefined; }

    let saved = null;
    try { saved = JSON.parse(raw); } catch { /* hỏng — dọn bên dưới */ }
    const expired = !saved || Date.now() - (Number(saved.luc) || 0) > TTL_MS;
    if (expired || !Array.isArray(saved?.messages) || !saved.messages.length) {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
      restored.current = true;
      return undefined;
    }
    restored.current = true;

    /**
     * CANH GÁC CÓ THỜI HẠN. Đã đo trên trang thật: gọi `setMessages` lúc mount thì
     * `agent.messages` lên đúng số ngay lập tức rồi vài trăm mili giây sau về 0 — runtime dựng
     * xong trạng thái agent thì ghi đè. Gọi tay sau khi trang ổn định thì giữ nguyên và khung
     * chat vẽ đủ. Nên vấn đề là THỜI ĐIỂM: cứ vài nhịp lại kiểm, thấy rỗng thì đặt lại.
     *
     * Dừng khi giữ được hai nhịp liên tiếp, hoặc hết hạn. Người dùng gõ câu mới thì `messages`
     * khác rỗng nên vòng tự im.
     */
    let left = Math.ceil(DEADLINE_MS / TICK_MS);
    let idle = 0;
    const id = setInterval(() => {
      left -= 1;
      const a = agentRef.current;
      if (!a) { if (left <= 0) clearInterval(id); return; }
      try {
        if (a.messages?.length) {
          idle += 1;
          if (idle >= 2 || left <= 0) clearInterval(id);
          return;
        }
        idle = 0;
        a.setMessages(saved.messages);
        if (saved.threadId) a.threadId = saved.threadId;
        // Báo cho nhật ký biết ngần này message là ĐỒ CŨ — xem lib/restoreMarker.js.
        setRestoreMark(saved.messages.length);
      } catch (e) {
        console.warn('[guide] không khôi phục được hội thoại:', e?.message || e);
        clearInterval(id);
        return;
      }
      if (left <= 0) clearInterval(id);
    }, TICK_MS);
    return () => clearInterval(id);
    // CHỈ hai chuỗi. Thêm `agent` hay `user` vào đây là làm sống lại đúng lỗi vừa sửa.
  }, [userKey, key]);

  // ── LƯU, hoãn một nhịp ──
  // `agent.messages` bị mutate tại chỗ nên chiều dài + trạng thái chạy là tín hiệu đáng tin hơn
  // so sánh tham chiếu mảng (cùng lý do với bảng Hành động).
  const msgCount = agent?.messages?.length || 0;
  const running = !!agent?.isRunning;
  useEffect(() => {
    if (!agent || !restored.current) return undefined;
    // Đang chạy dở thì chưa lưu: nửa chừng một lượt là lúc dễ có lời gọi tool chưa có kết quả.
    if (running) return undefined;
    const id = setTimeout(() => {
      try {
        const ms = trimToTurns(agent.messages || [], MAX_TURNS);
        if (!ms.length) return;
        const text = JSON.stringify({ luc: Date.now(), threadId: agent.threadId || '', messages: ms });
        if (text.length > MAX_CHARS) {
          // Quá to thì lưu ít lượt hơn thay vì bỏ hẳn — thà giữ được vài lượt cuối.
          const it = JSON.stringify({ luc: Date.now(), threadId: agent.threadId || '', messages: trimToTurns(ms, 2) });
          if (it.length <= MAX_CHARS) localStorage.setItem(key, it);
          return;
        }
        localStorage.setItem(key, text);
      } catch {
        // Hết chỗ hoặc trình duyệt chặn — dọn khoá của mình rồi thôi, đây là tiện ích chứ không
        // phải chức năng chính.
        try { localStorage.removeItem(key); } catch { /* ignore */ }
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [agent, msgCount, running, key]);

  return null;
}
