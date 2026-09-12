/**
 * PHÉP NHẬN BIẾT "MỘT LƯỢT VỪA XONG" — dùng chung cho bộ ghi kinh nghiệm và nhật ký hỏi đáp.
 *
 * ═══════════════ VÌ SAO KHÔNG BẮT SƯỜN `isRunning` ═══════════════
 *
 * Cách hiển nhiên là đợi `isRunning` chuyển true → false rồi báo. Bản trước làm đúng vậy và
 * KHÔNG BAO GIỜ CHẠY: không một lời gọi `/nhat-ky` hay `/kinh-nghiem` nào trong log server suốt
 * cả buổi thử.
 *
 * Vấn đề của cách bắt sườn là nó chỉ có MỘT cơ hội. Lỡ một lần render — vì hai thay đổi gộp vào
 * một lượt cập nhật, vì component render lại do nguyên nhân khác đúng lúc đó, vì `isRunning` nhấp
 * nháy nhanh hơn nhịp render — là tín hiệu mất hẳn, không có gì cứu và không để lại dấu vết.
 * Đây là dạng lỗi đã ngốn nhiều vòng dựng lại ở chỗ khôi phục hội thoại: hỏng im lặng vì mọi
 * nhánh thoát đều là đường hợp lệ.
 *
 * Nên đổi sang DÒ TRẠNG THÁI, không bắt sự kiện: cứ vài giây nhìn xem "hiện có một lượt đã xong
 * mà chưa báo không". Không cần đúng khoảnh khắc, tự phục hồi nếu lỡ nhịp, và bên nhận vốn đã
 * khử trùng theo khoá nên báo thừa cũng vô hại.
 *
 * ═══════════════ GIỮ RẺ ═══════════════
 *
 * `deriveAgentActions` duyệt toàn bộ luồng message nên không gọi mỗi nhịp. Trước hết so một CHỮ
 * KÝ rẻ tiền (số message + đang chạy + độ dài câu trả lời); giống hệt nhịp trước thì thôi.
 */
import { useEffect, useRef } from 'react';
import { deriveAgentActions } from './agentActions';
import { latestAnswer } from './mascotState';
import { FULL_ACCESS } from './guideAccess';

const TICK_MS = 1500;

/** Câu hỏi cuối cùng của người dùng trong luồng message. */
export function lastQuestion(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role === 'user' && String(m.content || '').trim()) return String(m.content).trim();
  }
  return '';
}

/** Số lượt hỏi tính tới hiện tại — cùng đơn vị với hạn mức và nhật ký ở backend. */
export function turnCount(messages) {
  return (messages || []).filter((m) => m?.role === 'user').length || 1;
}

/**
 * @param {object} agent  từ `useAgent()`
 * @param {(payload: {messages, answer, steps, question, turn, threadId}) => void} onFinished
 *   Gọi lại MỖI KHI thấy một lượt đã xong và chữ ký đổi. Bên nhận PHẢI tự khử trùng theo khoá
 *   của mình — hàm này cố ý không nhớ đã báo gì, để nó không thành một cái cờ nữa có thể kẹt.
 */
export function useTurnFinished(agent, onFinished) {
  /**
   * Cả agent lẫn callback đều đi qua ref, và effect chạy với deps RỖNG.
   *
   * Bất cứ thứ gì trong deps đổi cũng làm cleanup gỡ mất bộ đếm giờ, còn lần chạy mới thì có thể
   * thoát sớm — chính xác cái đã giết phép khôi phục hội thoại ba lần liên tiếp (`user` là object
   * mới mỗi render, rồi `agent` bị CopilotKit dựng lại khi runtime nối xong). Callback inline
   * cũng là tham chiếu mới mỗi render, nên nó cũng không được vào deps.
   */
  const agentRef = useRef(null);
  agentRef.current = agent;
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  const signatureRef = useRef('');

  useEffect(() => {
    const id = setInterval(() => {
      const a = agentRef.current;
      if (!a || a.isRunning) return;

      const messages = Array.isArray(a.messages) ? a.messages : [];
      if (!messages.length) return;

      const answer = latestAnswer(a);
      if (!answer?.text) return;

      // Chữ ký rẻ tiền: đủ để biết "có gì mới không" mà không phải duyệt lại cả luồng.
      const signature = `${a.threadId || ''}#${messages.length}#${answer.text.length}`;
      if (signature === signatureRef.current) return;

      const question = lastQuestion(messages);
      if (!question) return;

      const all = deriveAgentActions(messages, false, { fullAccess: FULL_ACCESS });
      const turnStart = all.map((x) => x.type).lastIndexOf('turn');
      const steps = all.slice(turnStart + 1).filter((x) => x.type === 'tool');

      /**
       * CÒN BƯỚC CHƯA XONG THÌ LƯỢT CHƯA XONG — dù `isRunning` đã về false.
       *
       * `navigate_to_page` làm đổi route: React tháo rồi dựng lại cả nhánh, và trong nhịp đó
       * `agent.isRunning` đọc ra false trong khi tool vẫn đang chạy. Bộ dò chộp đúng khoảnh khắc
       * ấy, báo một lượt "đã xong" chỉ có nửa câu trả lời và một bước còn `running`. Đo được:
       * 2/2 lượt có điều hướng đều vào nhật ký ở dạng cụt như vậy, và khoá `(thread_id, turn)`
       * khiến bản đầy đủ sau đó không ghi đè được.
       *
       * `waiting` cũng nằm trong danh sách: đó là lúc đang chờ NGƯỜI dùng bấm xác nhận — lượt
       * còn chưa quyết xong thì càng không phải lúc chốt sổ.
       */
      if (steps.some((x) => x.status === 'running' || x.status === 'waiting')) return;

      // Ghi chữ ký SAU phép chặn trên: ghi trước thì một nhịp bị chặn cũng đốt luôn chữ ký, và
      // nếu luồng message không đổi nữa thì lượt đó vĩnh viễn không được báo.
      signatureRef.current = signature;

      onFinishedRef.current?.({
        messages, answer, steps, question, turn: turnCount(messages), threadId: a.threadId || '',
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);
}
