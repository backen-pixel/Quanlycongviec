/**
 * Cầu nối giữa Ô HỎI NỔI (bundle chính) và AGENT (bundle CopilotKit tải chậm).
 *
 * Không vẽ gì cả. Việc của nó: lấy câu hỏi đang chờ trong hàng đợi rồi gửi cho agent, và báo
 * ngược trạng thái "đang chạy" ra ngoài để ô hỏi khoá ô nhập.
 *
 * GỬI THẲNG QUA API CỦA AGENT, không giả lập gõ vào khung chat:
 *     agent.addMessage({ role: 'user', content })   // AbstractAgent của @ag-ui/client
 *     copilotkit.runAgent({ agent })                // CopilotKitCore
 * Cách giả lập (điền vào <textarea> của thư viện rồi bấm nút) chạy được, nhưng phụ thuộc cấu
 * trúc DOM bên trong thư viện — bản CopilotKit sau đổi layout là hỏng im lặng. Hai đường cùng
 * đi vào một mảng `agent.messages`, nên khung chat vẫn hiện câu hỏi này như thường.
 *
 * PHẢI XỬ LÝ CẢ HAI CA, không chỉ ca dễ:
 *  - Panel đã mount sẵn → sự kiện `guide:ask` tới, lấy hàng đợi ngay.
 *  - Panel CHƯA mount (lần hỏi đầu tiên) → chính câu hỏi đó làm panel mount, và sự kiện đã bay
 *    qua TRƯỚC khi component này tồn tại. Nên lúc mount phải chủ động rút hàng đợi một lần.
 */
import { useEffect, useRef } from 'react';
import { useAgent, useCopilotKit } from '@copilotkit/react-core/v2';
import {
  EVENT_ASK, takeQueuedQuestion, requeueQuestion, hasQueuedQuestion, reportAskFailed, setRunning,
} from './lib/openGuide';

/** Nhịp thử lại khi rút hàng đợi (xem chú thích trong effect). */
const TICK_MS = 250;
const RETRY_MS = 8000;
/** Chờ bao lâu rồi mới kiểm message còn sống — đủ để khung chat khởi tạo xong thread. */
const CONFIRM_MS = 120;
/** Agent phải sống sót qua nhịp này mới được coi là thể hiện thật (xem chú thích trong effect). */
const STABLE_MS = 500;
/** `crypto.randomUUID` không có trên vài trình duyệt cũ / ngữ cảnh không bảo mật. */
function makeId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* ignore */ }
  return `u-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function GuideAskBridge() {
  const { agent } = useAgent();
  const { copilotkit } = useCopilotKit();
  const busyRef = useRef(false);
  const timerRef = useRef(0);

  // Báo trạng thái chạy ra cho ô hỏi ngoài bundle.
  useEffect(() => {
    setRunning(!!agent?.isRunning);
  }, [agent?.isRunning]);

  useEffect(() => {
    if (!agent || !copilotkit) return undefined;

    const handle = () => {
      // Đang chạy thì để câu hỏi nằm lại hàng đợi; nhịp thử lại sẽ rút khi chạy xong.
      if (agent.isRunning || busyRef.current) return;
      // Khung chat chưa có trong DOM nghĩa là nó đang mount dở — thêm message lúc này thì nó
      // khởi tạo thread xong sẽ xoá mất. Cứ để câu hỏi nằm lại, nhịp sau thử tiếp.
      if (!document.querySelector('[data-copilot-sidebar]')) return;

      const question = takeQueuedQuestion();
      if (!question) return;
      busyRef.current = true;

      const id = makeId();
      try {
        agent.addMessage({ id, role: 'user', content: question });
      } catch (e) {
        console.error('[guide] thêm câu hỏi lỗi:', e);
        // Hạ cờ bận TRƯỚC khi trả về: `requeueQuestion` phát `EVENT_ASK` ngay lập tức, còn cờ
        // đang giơ thì lần rút đó bị chặn và phải chờ hết một nhịp nữa.
        busyRef.current = false;
        requeueQuestion(question); // đừng nuốt câu hỏi của người dùng
        return;
      }

      /**
       * XÁC NHẬN MESSAGE CÒN SỐNG rồi mới chạy agent.
       *
       * Đây là nguyên nhân thật của lỗi "câu hỏi đầu tiên mất im lặng", và phải đo mới ra:
       * hàng đợi ĐÃ bị rút (`window.__guide_hang_doi` = null) nên `addMessage` chắc chắn đã
       * chạy — nhưng câu hỏi không hề xuất hiện trong khung chat. Tức message bị XOÁ ngay sau
       * khi thêm, do khung chat mount cùng nhịp và khởi tạo lại thread.
       *
       * Thử lại nhiều nhịp không cứu được, vì hàng đợi đã rỗng từ lần rút đầu. Nên phải kiểm
       * lại: message còn thì chạy; mất thì TRẢ VỀ hàng đợi để nhịp sau gửi lại.
       */
      setTimeout(() => {
        const left = (agent.messages || []).some((m) => m?.id === id);
        if (!left) {
          busyRef.current = false;
          requeueQuestion(question);
          return;
        }
        Promise.resolve(copilotkit.runAgent({ agent }))
          .catch((e) => console.error('[guide] chạy agent lỗi:', e))
          .finally(() => { busyRef.current = false; });
      }, CONFIRM_MS);
    };

    /**
     * Rút hàng đợi NHIỀU NHỊP, không chỉ một lần lúc mount.
     *
     * Ca khó: câu hỏi ĐẦU TIÊN chính là thứ làm panel mount, nên sự kiện `guide:ask` đã bay qua
     * trước khi component này tồn tại. Bản trước rút đúng một lần lúc mount — và mất câu hỏi
     * im lặng: không lỗi, `addMessage` không hề được gọi, tức lúc rút thì hàng đợi còn rỗng
     * hoặc agent chưa sẵn sàng. Tôi không cô lập được chính xác nhịp nào hụt.
     *
     * Thay vì đoán đúng thời điểm, cứ thử lại vài nhịp rồi dừng. Rút thành công thì dừng ngay;
     * hết 5 giây mà không có gì thì cũng dừng, không để một `setInterval` sống mãi.
     */
    /**
     * ĐỢI AGENT ỔN ĐỊNH RỒI MỚI GỬI — đây mới là nguyên nhân thật.
     *
     * Đo được: sau khi hỏi câu ĐẦU TIÊN, hàng đợi đã bị rút (nên `addMessage` chắc chắn chạy),
     * hàm kiểm "message còn sống" KHÔNG trả lại hàng đợi (nên message vẫn còn) — vậy mà bảng
     * "Hành động" đọc `agent.messages` lại rỗng trơn, và khung chat cũng không có gì.
     *
     * Chỉ một lời giải khớp cả ba: message được thêm vào MỘT AGENT KHÁC với agent mà giao diện
     * đang đọc. Cầu nối mount sớm hơn khung chat nên `useAgent()` trả về thể hiện tạm; khung
     * chat khởi tạo thread xong thì core thay bằng thể hiện thật. Câu hỏi rơi vào cái cũ.
     *
     * Effect này chạy lại mỗi khi `agent` đổi. Nên thay vì gửi ngay, hẹn một nhịp ngắn: agent
     * còn đổi nữa thì cleanup huỷ hẹn, chỉ thể hiện SỐNG SÓT qua nhịp chờ mới được gửi.
     */
    const timer = setTimeout(() => {
      handle();
      window.addEventListener(EVENT_ASK, handle);

      /**
       * DỪNG NHỊP KHI HÀNG ĐỢI RỖNG **VÀ** KHÔNG CÒN LẦN GỬI NÀO ĐANG DỞ.
       *
       * Bản trước dừng ngay khi hàng đợi rỗng — và đó chính là chỗ nuốt câu hỏi. `handle()` rút
       * câu ra ở đầu lần thử, nên trong khoảng `CONFIRM_MS` giữa lúc rút và lúc biết message có
       * sống sót hay không, hàng đợi RỖNG một cách hợp lệ. Nhịp kế tiếp rơi đúng vào khoảng đó
       * thì tự `clearInterval`; 120ms sau phép kiểm phát hiện message đã bị xoá và trả câu về
       * hàng đợi — nhưng không còn ai rút nữa. Câu hỏi nằm đó vĩnh viễn, màn hình không có gì
       * xảy ra, log sạch trơn. Đã gặp đúng một lần trong lúc thử và không tái hiện được, vì nó
       * phụ thuộc vào việc nhịp 400ms rơi trúng cửa sổ 120ms.
       *
       * `busyRef` là thứ phân biệt "rỗng vì xong" với "rỗng vì đang dở".
       */
      let remaining = Math.ceil(RETRY_MS / TICK_MS);
      timerRef.current = setInterval(() => {
        remaining -= 1;
        if (!hasQueuedQuestion() && !busyRef.current) { clearInterval(timerRef.current); return; }
        if (remaining <= 0) {
          clearInterval(timerRef.current);
          /**
           * Hết hạn mà câu vẫn nằm đó: KHÔNG im lặng bỏ đi. Rút ra rồi đẩy ngược về ô nhập —
           * người dùng thấy lại nguyên câu mình gõ và tự quyết gửi lại hay không.
           */
          if (hasQueuedQuestion()) reportAskFailed(takeQueuedQuestion());
          return;
        }
        handle();
      }, TICK_MS);
    }, STABLE_MS);

    return () => {
      clearTimeout(timer);
      clearInterval(timerRef.current);
      window.removeEventListener(EVENT_ASK, handle);
    };
  }, [agent, copilotkit, agent?.isRunning]);

  return null;
}
