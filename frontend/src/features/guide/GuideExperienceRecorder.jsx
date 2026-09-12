/**
 * GHI KINH NGHIỆM — không vẽ gì, chỉ nhìn một lượt kết thúc rồi gửi đường đi về server.
 *
 * Vì sao ghi ở CLIENT chứ không ở server: server chỉ thấy từng lần gọi model rời rạc và không
 * biết "một lượt của người dùng" bắt đầu, kết thúc ở đâu — nhất là khi chuỗi tool chạy qua nhiều
 * request. Client giữ nguyên luồng `agent.messages` nên biết chính xác lượt nào vừa xong, xong
 * bằng câu trả lời nào, và đã đi qua những bước nào.
 *
 * Server vẫn là nơi quyết định CÓ LƯU HAY KHÔNG (helpers/guideExperience.js): client chỉ đề nghị,
 * và công ty thì lấy từ JWT chứ không lấy từ thân request.
 *
 * CHỈ GHI LƯỢT ĐÁNG GHI — ≥2 bước tool, không có bước lỗi, và có câu trả lời tử tế. Lượt một
 * bước vốn đã nhanh; ghi vào chỉ làm loãng kho rồi kéo theo dò nhầm ở những câu sau.
 */
import { useRef } from 'react';
import { useAgent } from '@copilotkit/react-core/v2';
import api from '../../lib/api';
import { useTurnFinished } from './lib/useTurnFinished';

export default function GuideExperienceRecorder() {
  const { agent } = useAgent();
  // Đã gửi lượt nào rồi thì thôi: một lượt chỉ đáng ghi một lần.
  const sentRef = useRef(new Set());

  /**
   * Phép nhận biết "lượt vừa xong" nay nằm ở `useTurnFinished` — dùng chung với nhật ký hỏi đáp.
   * Chỗ này chỉ còn phần RIÊNG của kho kinh nghiệm: quyết định lượt nào ĐÁNG HỌC.
   */
  useTurnFinished(agent, ({ messages, answer, steps, question, threadId }) => {
    /**
     * TÁCH BƯỚC LÀM HAI RỔ, thay vì bỏ cả lượt khi có bước hỏng.
     *
     * Bản trước loại thẳng lượt nào có bước `empty`/`failed`. Nghe hợp lý, nhưng nó loại đúng
     * loại lượt đáng học nhất: cả lớp tool được xây để trợ lý mò rồi tự sửa (mỗi lần trượt nhãn
     * đều trả về kèm danh sách nhãn đang có), rồi lượt tự sửa xong lại bị coi là lượt hỏng.
     *
     * Đo trên kho thật khi phát hiện: 0/55 bản ghi tự động có `dead_ends`, còn 7/10 bản do agent
     * chủ động ghi thì có — và chúng là nội dung giá trị nhất trong kho ("panel Bộ lọc đóng mặc
     * định, phải bấm trước", "ô date phải BẤM để mở picker, không điền text"). Tri thức đó sinh
     * ra từ chính những lượt đang bị loại.
     *
     * Nên: bước `done` → đường đi; bước `empty`/`failed` → NGÕ CỤT. Không nới cổng mà không tách
     * rổ: bước hỏng đi vào `steps` là dạy người sau một bước không chạy được ở đúng vị trí đó.
     *
     * `cancelled` bỏ hẳn khỏi cả hai rổ — người dùng từ chối điều hướng là QUYẾT ĐỊNH CỦA NGƯỜI,
     * không phải một sự thật về giao diện. `running`/`waiting` cũng bỏ: lượt chưa xong hẳn.
     */
    const ok = steps.filter((b) => b.status === 'done');
    const broken = steps.filter((b) => b.status === 'empty' || b.status === 'failed');

    /**
     * ĐÁNG GHI = có ngõ cụt (bao nhiêu bước đúng cũng được, KỂ CẢ KHÔNG CÓ), HOẶC ≥2 bước đúng.
     *
     * Một dòng, ba ca:
     *   ≥2 bước đúng, không ngõ cụt   → ghi (đường đi sạch)
     *   có ngõ cụt, ≥1 bước đúng      → ghi (mò rồi tìm ra)
     *   có ngõ cụt, 0 bước đúng       → GHI — đây là ca vừa được mở
     *   1 bước đúng, không ngõ cụt    → bỏ (lượt tầm thường, vốn đã nhanh)
     *   không có gì                   → bỏ
     *
     * ═══════ VÌ SAO CA "0 BƯỚC ĐÚNG" PHẢI ĐƯỢC GHI ═══════
     *
     * Bản trước có `if (!ok.length) return;` với lý lẽ "không có bước nào chạy được thì chẳng
     * có đường đi nào để dạy lại". Lý lẽ đó SAI, và nó chặn đúng loại lượt tốn kém nhất:
     *
     * Trợ lý thử 3 cách trên một màn hình, cả 3 đều không được, nó báo thật là chưa làm được.
     * Lượt đó tốn 3 bước, 3 vòng gọi model, và người dùng ngồi xem. Lần sau có người hỏi y hệt
     * thì nó mò lại đúng 3 cách đó — vì kho không được phép học gì từ lần trước.
     *
     * Mà "3 cách này không được" là tri thức HOÀN CHỈNH, không phải tri thức thiếu. Nó cắt hẳn
     * ba nhánh mò. Kho vốn đã có chỗ đúng cho nó (`dead_ends`) và server vốn đã nhận bản ghi chỉ
     * có ngõ cụt (nhánh `nguon: 'agent'` trong themKinhNghiem) — chỉ cổng này chặn.
     */
    if (ok.length < 2 && !broken.length) return;

    /**
     * GIẬM CHÂN — nay chỉ xét trên NHỮNG BƯỚC CHẠY ĐƯỢC.
     *
     * Bản trước xét cả lượt, nên "điền (trượt) → bấm mở panel → điền lại (được)" bị tính là
     * lặp và bị loại — trong khi đó là tự sửa, không phải giậm chân. Xét trên rổ `ok` thì lần
     * trượt không còn nằm trong danh sách, nên ca đó tự hết trùng; còn giậm chân thật (gọi y hệt
     * hai lần mà lần nào cũng `done`) vẫn bị bắt.
     *
     * Cùng định nghĩa với `doTinHieuBi` ở backend — hai nơi phải hiểu giống nhau.
     */
    const signature = ok.map((b) => `${b.raw?.tool_name || b.label}|${b.detail || ''}`);
    if (new Set(signature).size < signature.length) return;

    const key = `${question}::${messages.length}`;
    if (sentRef.current.has(key)) return;
    sentRef.current.add(key);

    /**
     * Cắt phần SAU dấu " = " ở mọi dòng gửi lên — cùng luật `tayBuoc` của server đang dùng cho
     * `steps`. Ngõ cụt đi qua `tayDuLieu` chứ KHÔNG qua `tayBuoc`, nên nếu không cắt ở đây
     * thì giá trị thật ("Công ty = Metalla") vào kho dùng chung — đúng thứ quyết định số 2 của
     * kho cấm ("nhớ thao tác, không nhớ dữ liệu").
     */
    const dropValues = (t) => String(t || '').split(/\s=\s/)[0].trim();

    api.post('/copilotkit/experience', {
      question: question,
      path: window.location?.pathname || '',
      thread_id: threadId || '',
      // Mỗi bước rút gọn còn "tên tool: tham số" — đủ để lần sau đi lại, không kéo theo cả kết
      // quả thô (có thể là vài nghìn ký tự dữ liệu màn hình, và là dữ liệu của HÔM NAY).
      steps: ok.map((b) => ({
        tool: b.raw?.tool_name || b.label,
        summary: [b.label, b.detail].filter(Boolean).join(': ').slice(0, 120),
      })),
      // Ngõ cụt: THAO TÁC đã thử + LÝ DO nó không được, đúng cái lần sau cần biết trước.
      dead_ends: broken.map((b) => {
        const task = [b.label, dropValues(b.detail)].filter(Boolean).join(': ');
        return [task, b.note].filter(Boolean).join(' — ').slice(0, 200);
      }),
      answer: answer.text,
    }).catch(() => { /* ghi kinh nghiệm hỏng thì thôi, không được làm phiền người dùng */ });
  });

  return null;
}
