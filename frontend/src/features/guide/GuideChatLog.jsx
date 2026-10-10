/**
 * NHẬT KÝ HỎI ĐÁP — không vẽ gì, chỉ gửi mỗi lượt vừa xong về server.
 *
 * KHÁC BỘ GHI KINH NGHIỆM ở đúng một điểm, và đó là lý do nó tồn tại riêng: kho kinh nghiệm chỉ
 * nhận lượt ĐÁNG HỌC (≥2 bước, không bước hỏng, không giậm chân) vì nó sẽ được nhắc lại cho
 * những câu hỏi sau — dạy lại một đường đi hỏng là làm hại chính mình. Nhật ký thì ngược lại:
 * ghi MỌI lượt, nhất là lượt hỏng, vì đó mới là thứ cần đối chiếu khi có người báo "trợ lý trả
 * lời sai".
 *
 * Cả hai dùng chung `useTurnFinished` để không bao giờ lệch nhau về việc "lượt nào đã xong".
 */
import { useRef } from 'react';
import { useAgent } from '@copilotkit/react-core/v2';
import api from '../../lib/api';
import { useTurnFinished } from './lib/useTurnFinished';
import { isRestored } from './lib/restoreMarker';

export default function GuideChatLog() {
  const { agent } = useAgent();
  // Một lượt chỉ gửi một lần. Server cũng khử trùng bằng khoá (thread_id, luot), nhưng chặn ở
  // đây thì đỡ hẳn một lượt gọi mạng vô ích cho mỗi lần `isRunning` nhấp nháy.
  const sentRef = useRef(new Set());

  useTurnFinished(agent, ({ messages, answer, steps, question, turn }) => {
    /**
     * ĐỪNG GHI LẠI PHẦN VỪA KHÔI PHỤC.
     *
     * Nhật ký dò trạng thái nên ngay sau khi tải lại trang nó thấy một lượt "vừa xong" hoàn toàn
     * hợp lệ — dù lượt đó đã xảy ra trước lần F5. Đã đo: lượt cũ vào bảng thêm một lần nữa dưới
     * `thread_id` MỚI, nên khoá duy nhất `(thread_id, turn)` ở DB không chặn được.
     */
    if (isRestored(messages?.length)) return;

    const threadId = agent?.threadId || '';
    const key = `${threadId}#${turn}`;
    if (sentRef.current.has(key)) return;
    sentRef.current.add(key);

    api.post('/copilotkit/chat-log', {
      thread_id: threadId,
      turn,
      path: window.location?.pathname || '',
      question: question,
      answer: answer.text,
      /**
       * Mỗi bước rút gọn còn "nhãn: chi tiết" kèm trạng thái. KHÔNG kéo theo kết quả thô: một
       * lần đọc màn hình trả về vài nghìn ký tự dữ liệu của HÔM NAY — lưu lại thì bảng phình
       * nhanh mà sang tuần đọc lại cũng không còn đúng với màn hình nữa.
       */
      steps: steps.map((b) => ({
        tool: b.raw?.tool_name || b.label,
        summary: [b.label, b.detail].filter(Boolean).join(': '),
        status: b.status || '',
      })),
    }).catch(() => { /* ghi nhật ký hỏng thì thôi, tuyệt đối không làm phiền người đang hỏi */ });
  });

  return null;
}
