/**
 * SẮC MẶT SAU MỖI LƯỢT — hỏi backend một lần khi lượt vừa xong, giữ mặt đó một nhịp ngắn.
 *
 * Phần quyết định nằm ở backend (helpers/guideMood.js): một subagent nhỏ đọc câu vừa hỏi cùng 3
 * câu gần nhất rồi trả về một nhãn. Ở đây chỉ có phần hiển thị.
 *
 * ═══════════════ VÌ SAO HỎI SAU, KHÔNG NHẬN QUA LUỒNG TRẢ LỜI ═══════════════
 *
 * Subagent chạy SONG SONG với agent chính và thường xong sau khi chữ đã chảy hết. Muốn gửi kèm
 * luồng thì phải chờ nó — tức cộng độ trễ một lời gọi model vào mọi lượt hỏi, để đổi lấy một
 * thứ trang trí. Hỏi sau thì lượt trả lời không chậm đi một mili-giây nào.
 *
 * ═══════════════ HAI CHỐT ═══════════════
 *
 *  1. Tính năng tắt (mặc định) → backend trả `{on:false}`, hook này im hẳn, không hẹn giờ, không
 *     giữ state. Không tốn gì.
 *  2. Bộ nhân vật không có sắc mặt → `moodSpriteFor` trả rỗng, chỗ gọi bỏ qua. Xem lý do vì sao
 *     KHÔNG lùi về ảnh `idle` trong mascotSprite.js.
 *
 * MỘT LƯỢT MỘT LẦN: `useTurnFinished` đã lo phần nhận biết "lượt vừa xong" (dùng chung với nhật
 * ký hỏi đáp và kho kinh nghiệm), nên ở đây không tự dò lại luồng message — hai phép dò song
 * song là hai chỗ sẽ lệch nhau.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../../lib/api';
import { useTurnFinished } from './useTurnFinished';

/**
 * Giữ sắc mặt bao lâu.
 *
 * Dài hơn `DONE_MS` (2,2 giây) của trạng thái "xong" một chút, cố ý: sắc mặt xuất hiện SAU khi
 * lượt kết thúc, nên nếu ngắn bằng nhau thì nó bị trạng thái "xong" nuốt mất và người dùng
 * không kịp thấy. Đủ lâu để liếc một cái, đủ ngắn để không thành mặt mặc định.
 */
const HOLD_MS = 3200;

/**
 * HỎI LẠI MỘT LẦN khi lần đầu về tay không — KHÔNG phải để "chắc ăn", mà vá một lỗ đo được.
 *
 * Subagent được bắn đi lúc BẮT ĐẦU lượt và mất 0,9–1,7 giây (đo thật với gpt-4o-mini). Lượt dài
 * thì nó xong từ lâu. Nhưng lượt NGẮN — model trả lời thẳng, không gọi tool nào — có thể kết
 * thúc trước khi nó kịp, và client hỏi đúng một lần rồi bỏ: sắc mặt mất hẳn.
 *
 * Cay ở chỗ đó chính là ca đáng quan tâm nhất: "nút đó ở đâu" (→ khinh bỉ) là loại câu được trả
 * lời nhanh nhất. Đã đo trong trình duyệt: lần đầu trả `mood:null` thì mặt KHÔNG BAO GIỜ hiện.
 *
 * 1200 ms đủ phủ phần đuôi của dải 0,9–1,7 giây. Chỉ hỏi lại khi lần đầu về rỗng mà tính năng
 * vẫn bật — có sắc mặt rồi thì không tốn thêm request nào.
 */
const RETRY_MS = 1200;

export function useMoodFace(agent) {
  const [mood, setMood] = useState(null);
  const timerRef = useRef(null);
  /** Tắt hẳn sau lần đầu backend báo `on:false` — khỏi hỏi lại ở mọi lượt. */
  const offRef = useRef(false);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const onFinished = useCallback(async () => {
    if (offRef.current) return;
    try {
      const ask = async () => {
        const { data } = await api.get('/copilotkit/mood', {
          params: { thread_id: agent?.threadId || '' },
        });
        return data;
      };

      let data = await ask();
      if (data?.on === false) { offRef.current = true; return; }
      if (!data?.mood) {
        // Lượt ngắn: subagent chưa kịp xong. Xem RETRY_MS cho số đo.
        await new Promise((r) => { timerRef.current = setTimeout(r, RETRY_MS); });
        data = await ask();
      }
      if (!data?.mood) return;
      setMood(data.mood);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setMood(null), HOLD_MS);
    } catch {
      /**
       * Im lặng, KHÔNG báo gì cho người dùng: đây là thứ trang trí. Một lỗi mạng ở đây mà hiện
       * thông báo thì phiền hơn hẳn việc nhân vật giữ nguyên mặt bình thường.
       */
    }
  }, [agent?.threadId]);

  useTurnFinished(agent, onFinished);

  return mood;
}
