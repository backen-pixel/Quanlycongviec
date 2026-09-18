/**
 * TRẦN BƯỚC THẬT của một lượt hỏi — thứ `maxSteps` của BuiltInAgent KHÔNG làm được.
 *
 * ═══════════════ VÌ SAO `maxSteps` KHÔNG BÓ ĐƯỢC GÌ ═══════════════
 *
 * `BuiltInAgent({ maxSteps: 12 })` dịch thành `stopWhen: stepCountIs(12)` của AI SDK, mà
 * `steps` là mảng CỤC BỘ của một lần gọi `streamText`:
 *
 *     function stepCountIs(stepCount) { return ({ steps }) => steps.length === stepCount; }
 *
 * Hết request là mảng đó mất, request sau đếm lại từ 0. Và request kết thúc RẤT sớm: tool của
 * frontend được runtime dựng KHÔNG có `execute` (`convertToolsToVercelAITools` chỉ đặt
 * `description` + `inputSchema`), nên AI SDK không có kết quả để chạy tiếp:
 *
 *     (clientToolCalls.length > 0 && clientToolOutputs.length === clientToolCalls.length || …)
 *       && !await isStopConditionMet({ stopConditions, steps })
 *
 * Thiếu output → điều kiện sai → vòng lặp dừng, request đóng. Trình duyệt chạy tool, gửi kết quả
 * về, và đó là một request MỚI với bộ đếm bằng 0.
 *
 * 10 trong 13 tool của trợ lý là tool frontend (`read_page_state`, `click_element`, `fill_field`,
 * `find_on_page`, `read_region`, `read_screen_metrics`, `highlight_button`,
 * `highlight_region`, `open_page_tour`, `navigate_to_page`). Chuỗi bấm–đọc–điền
 * toàn nằm ở nhóm đó. Kết quả: `maxSteps` chỉ chặn được khi model gọi liền 12 lần TRA CỨU —
 * chuyện gần như không xảy ra. Thực tế trước bản này: KHÔNG có trần nào cả, agent chỉ dừng khi
 * nó tự muốn dừng, và người dùng ngồi xem nó mò 20+ bước rồi tắt đi.
 *
 * ═══════════════ ĐẾM Ở ĐÂU MỚI ĐÚNG ═══════════════
 *
 * Ở tầng MODEL (`transformParams`), trên `params.prompt` — mảng này là TOÀN BỘ lượt hiện tại,
 * ghép lại từ mọi request đã đi qua. `measureStuckSignals()` của guideExperience.js vốn đã duyệt đúng
 * mảng đó và đếm từng `tool-call`; nó là chỗ duy nhất trong hệ thống biết con số thật. Trước
 * bản này con số ấy chỉ dùng để quyết định có chèn kinh nghiệm cứu hộ hay không, rồi vứt đi.
 *
 * ═══════════════ HAI NẤC, VÀ VÌ SAO PHẢI CÓ NẤC CỨNG ═══════════════
 *
 * NẤC 1 — NHẮC (mặc định 8 bước). Chèn một message bảo model tự kết thúc. Rẻ, lịch sự, và
 * thường là đủ. Nhưng nó chỉ là lời nói: model có quyền phớt lờ, và đúng những lượt đang hỏng
 * là lúc nó hay phớt lờ nhất.
 *
 * NẤC 2 — CHẶN (mặc định 14 bước). Đặt `toolChoice: { type: 'none' }`. Provider Anthropic dịch
 * cái này thành BỎ HẲN `tools` khỏi request (`case "none": return { tools: void 0, … }`), nên
 * model không còn tool nào để gọi kể cả khi nó muốn. Đây mới là trần thật.
 *
 * Đã kiểm bằng gọi thẳng API: lịch sử có `tool_use`/`tool_result` mà request không kèm `tools`
 * thì Anthropic vẫn nhận — HTTP 200 cả ba cách (không kèm `tools`, `tools: []`, và
 * `tools` + `tool_choice: none`). Không phải chuyện hiển nhiên nên phải đo trước khi dùng.
 *
 * CÁI GIÁ: bỏ `tools` làm đổi tiền tố nên lần gọi đó TRƯỢT CACHE — mất thêm một lần ghi cache
 * (~350 ₫). Chấp nhận được: nó là lần gọi CUỐI của một lượt vốn đã hỏng, và cái nó cứu là
 * người dùng khỏi ngồi nhìn agent mò thêm 10 bước nữa.
 *
 * Nấc 2 luôn phải > nấc 1: gỡ tool mà chưa từng nhắc thì model bị cụt tay giữa chừng, không
 * hiểu vì sao, và câu trả lời cuối ra lủng củng.
 */

const settings = require('./guideSettings');
const { measureStuckSignals } = require('./guideExperience');
const flowLog = require('./guideFlow');

const warnThreshold = () => settings.get('step_guard_warn');
const stopThreshold = () => settings.get('step_guard_stop');

/** Nhật ký để đo: trần có nổ không, nổ ở bước bao nhiêu. 20 lần gần nhất. */
const recentTrips = [];

function recordTrip(level, d) {
  recentTrips.unshift({
    at: Date.now(),
    level,
    step_count: d.step_count,
    signals: d.signals.slice(0, 6),
    path: d.path,
  });
  recentTrips.length = Math.min(recentTrips.length, 20);
}

function warnText(d, remaining) {
  const stuckNote = d.signals.length
    ? ` Trong đó có ${d.signals.length} lần trượt hoặc gọi lại y hệt.`
    : '';
  return [
    '## Cảnh báo số bước',
    '',
    `Bạn đã gọi ${d.step_count} bước trong lượt này.${stuckNote} Lượt hỏi bình thường tốn 5–6 bước, nên`,
    'nhiều khả năng cách bạn đang thử KHÔNG dẫn tới đâu.',
    '',
    ...(remaining
      ? [`CÒN ${remaining} BƯỚC nữa là tool bị gỡ khỏi lượt này và bạn buộc phải trả lời bằng lời.`, '']
      : []),
    'Hãy chốt trong 1–2 bước nữa. Nếu vẫn chưa xong thì DỪNG gọi tool và trả lời bằng lời:',
    '- bạn đã thử những gì,',
    '- vướng ở chỗ nào (nói đúng cái tool trả về, đừng đoán),',
    '- người dùng cần tự làm gì, hoặc cần cho bạn biết thêm gì.',
    '',
    'Báo là chưa làm được KHÔNG phải thất bại. Để người dùng ngồi nhìn bạn mò tiếp mới là hỏng.',
  ].join('\n');
}

function stopText(d) {
  return [
    '## Hết bước — trả lời ngay',
    '',
    `Đã ${d.step_count} bước. Tool đã bị GỠ khỏi lượt gọi này, bạn không gọi được nữa.`,
    '',
    'Trả lời người dùng bằng lời, ngắn gọn và thành thật:',
    '- bạn định làm gì và đã đi tới đâu,',
    '- vướng ở chỗ nào — trích đúng lý do tool trả về,',
    '- bước tiếp theo họ nên làm, hoặc thông tin họ cần cung cấp.',
    '',
    'KHÔNG nói là đã làm xong. KHÔNG bịa kết quả. KHÔNG hứa "để tôi thử lại".',
  ].join('\n');
}

function appendText(params, text) {
  return {
    ...params,
    prompt: [...params.prompt, { role: 'user', content: [{ type: 'text', text: text }] }],
  };
}

/**
 * Middleware tầng model. Cắm TRƯỚC `cacheControlMiddleware` vì nó nối thêm message vào cuối
 * prompt, mà điểm cắt cache tính từ cuối lên.
 *
 * @param {string} moc Mốc khối ngữ cảnh biến động — chèn kèm để `cacheControlMiddleware` nhận ra
 *   khối này là phần biến động và không đặt điểm cắt vào giữa nó.
 */
function createStepGuardMiddleware(marker = '## Ngữ cảnh hiện tại', session = null) {
  /*
   * KHÔNG dùng biến closure kiểu `daNhac` để nhắc đúng một lần. Nghe hợp lý nhưng SAI ở đây:
   * agent được dựng LẠI mỗi request (xem "bẫy 2" trong copilotkit.js), mà mỗi bước tool frontend
   * lại là một request mới — nên closure reset liên tục và "một lần" thành "mọi lần". Khối chèn
   * cũng không nằm trong lịch sử hội thoại mà client giữ, nên dò lại trong prompt cũng không thấy.
   *
   * Nên: nhắc ở MỌI bước trong khoảng [nhắc, dừng), nhưng kèm ĐẾM NGƯỢC số bước còn lại. Chữ đổi
   * mỗi lần nên nó đọc ra như một cái đồng hồ đang chạy, không phải một câu lải nhải bị bỏ qua.
   * Giá phải trả nhỏ: ~130 token mỗi bước, và chỉ ở những lượt vốn đã hỏng.
   */
  return {
    transformParams: async ({ params }) => {
      const prompt = Array.isArray(params?.prompt) ? params.prompt : null;
      if (!prompt) return params;

      const nStop = stopThreshold();
      const nWarn = warnThreshold();
      if (!nStop && !nWarn) return params;

      const d = measureStuckSignals(prompt);

      // Nấc 2 xét TRƯỚC: quá cả hai ngưỡng thì chặn, không nhắc suông nữa.
      if (nStop && d.step_count >= nStop) {
        recordTrip('dung', d);
        flowLog.record(session?.key, 'step_guard', { mode: 'stop', steps: d.step_count, signals: d.signals.length });
        return {
          ...appendText(params, [marker, '', stopText(d)].join('\n')),
          toolChoice: { type: 'none' },
        };
      }

      if (nWarn && d.step_count >= nWarn) {
        // `nStop` có thể bằng 0 (tắt chặn cứng) — khi đó không có gì để đếm ngược.
        const remaining = nStop ? Math.max(1, nStop - d.step_count) : null;
        recordTrip('nhac', d);
        flowLog.record(session?.key, 'step_guard', { mode: 'warn', steps: d.step_count, remaining: remaining });
        return appendText(params, [marker, '', warnText(d, remaining)].join('\n'));
      }

      return params;
    },
  };
}

/** Cho `GET /debug/kinh-nghiem` — soi xem trần có nổ không, và nổ ở bước bao nhiêu. */
function stats() {
  return {
    thresholds: { warn: warnThreshold(), stop: stopThreshold() },
    recent: recentTrips,
  };
}

module.exports = { createStepGuardMiddleware, stats, recentTrips };
