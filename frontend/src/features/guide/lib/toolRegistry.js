/**
 * SỔ ĐĂNG KÝ TOOL — nguồn DUY NHẤT cho tên 13 tool của trợ lý và phần hiển thị đi kèm.
 *
 * Vì sao phải gom lại: trước đây tên tool nằm rải ở BA bảng song song —
 * `agentActions.js` (icon + nhãn cho bảng Hành động), `mascotState.js` (câu thoại của linh thú)
 * và các literal `name:` trong `AppGuideCopilotPanel.jsx`. Thêm một tool phải nhớ sửa cả ba, và
 * đã trôi thật: `highlight_region`, `save_experience`, `discard_experience` có nhãn nhưng KHÔNG
 * có thoại, nên linh thú im re đúng lúc nó đang chỉ tay vào một khu vực.
 *
 * Nay mọi thứ khai ở đây một lần. Thêm tool mới:
 *   1. thêm một dòng vào `REGISTRY` (đủ icon + label + line),
 *   2. dùng `TOOL.<name>` khi khai hook trong panel — gõ sai tên là `undefined` và hỏng NGAY,
 *      thay vì im lặng hiện tên thô cho người dùng.
 *
 * ⚠️ BACKEND KHÔNG DÙNG ĐƯỢC TỆP NÀY (khác package). Ba tool `where: 'backend'` dưới đây được
 * `defineTool` khai ở `backend/src/routes/guide/copilotkit.js`, và chỉ dẫn cho model nằm ở
 * `backend/src/helpers/guidePrompt.js`. Đổi tên một trong ba thì phải sửa cả hai phía.
 */

/**
 * @typedef {object} ToolMeta
 * @property {string} icon    biểu tượng trong bảng Hành động
 * @property {string} label   nhãn tiếng Việt trong bảng Hành động
 * @property {string} line    câu linh thú nói khi tool đang chạy ('' = dùng câu chung)
 * @property {'client'|'backend'} where  nơi handler chạy
 * @property {boolean} [confirm]  cần người bấm đồng ý (human-in-the-loop) ở chế độ ĐỌC
 */

/** @type {Record<string, ToolMeta>} */
const REGISTRY = {
  // ── Backend (defineTool) — không có `onToolExecutionStart/End` nào bắn cho chúng, nhưng vẫn
  //    hiện trong bảng vì bảng dựng từ `agent.messages` chứ không từ callback.
  search_knowledge_base: {
    icon: '🔎', label: 'Tra cứu hệ thống', line: 'Để ta tra trong điển tịch…', where: 'backend',
  },
  save_experience: {
    icon: '📝', label: 'Ghi kinh nghiệm', line: 'Ghi vào sổ tay đã…', where: 'backend',
  },
  discard_experience: {
    icon: '🗑️', label: 'Bỏ kinh nghiệm sai', line: 'Bỏ mục sai trong sổ…', where: 'backend',
  },

  // ── Client, chế độ ĐỌC (mount ở mọi chế độ) ──
  highlight_button: {
    icon: '✨', label: 'Chỉ nút trên màn hình', line: 'Chỗ này!', where: 'client',
  },
  highlight_region: {
    icon: '🔆', label: 'Chỉ khu vực trên màn hình', line: 'Khu vực này!', where: 'client',
  },
  read_screen_metrics: {
    icon: '📊', label: 'Đọc chỉ số màn hình', line: 'Đang đọc các con số…', where: 'client',
  },
  read_region: {
    icon: '🔍', label: 'Đọc sâu một khu vực', line: 'Xem kỹ khu vực này…', where: 'client',
  },
  open_page_tour: {
    icon: '🧑‍🏫', label: 'Mở hướng dẫn trên trang', line: 'Mở chỉ dẫn cho ngươi…', where: 'client',
  },
  /**
   * MỘT TÊN, HAI ĐỊNH NGHĨA — có chủ đích, xem `AppGuideCopilotPanel.jsx`:
   * chế độ đọc dùng `useHumanInTheLoop` (chỉ ĐỀ NGHỊ, người bấm mới chuyển), chế độ toàn quyền
   * dùng `useFrontendTool` (chuyển NGAY). Hai nhánh không bao giờ cùng mount, nên không trùng
   * đăng ký. `confirm` chỉ đúng ở nhánh đọc — chỗ dùng phải xét thêm cờ toàn quyền.
   */
  navigate_to_page: {
    icon: '🧭', label: 'Điều hướng', line: 'Đi thôi!', where: 'client', confirm: true,
  },

  // ── Client, CHỈ chế độ toàn quyền — bốn việc THẬT, để nhãn khác hẳn nhóm chỉ-đọc ở trên cho
  //    dễ soát lại khi đọc bảng Hành động.
  read_page_state: {
    icon: '📄', label: 'Đọc trạng thái màn hình', line: 'Đang xem cả màn hình…', where: 'client',
  },
  find_on_page: {
    icon: '🔦', label: 'Rà tìm trên trang', line: 'Đang lần tìm trên trang…', where: 'client',
  },
  click_element: {
    icon: '🖱️', label: 'Bấm nút', line: 'Ta bấm giúp đây.', where: 'client',
  },
  fill_field: {
    icon: '⌨️', label: 'Điền/chọn trường', line: 'Đang điền…', where: 'client',
  },
};

/**
 * Tên tool dùng khi khai hook: `name: TOOL.click_element`.
 *
 * Không viết tay lại chuỗi ở chỗ khai — đó chính là cách ba bảng cũ trôi khỏi nhau.
 */
export const TOOL = Object.freeze(
  Object.fromEntries(Object.keys(REGISTRY).map((name) => [name, name])),
);

/** Icon + nhãn cho bảng Hành động. Tool lạ vẫn hiện, chỉ là không có nhãn tiếng Việt riêng. */
export const TOOL_META = REGISTRY;

/** Câu thoại theo tool đang chạy. Tool lạ thì rơi về câu chung. */
export const LINE_BY_TOOL = Object.freeze(
  Object.fromEntries(Object.entries(REGISTRY).map(([name, m]) => [name, m.line])),
);

/**
 * Tool cần người dùng bấm xác nhận → chưa có kết quả là ĐANG CHỜ NGƯỜI, không phải đang chạy.
 * Ở chế độ toàn quyền tập này coi như rỗng (xem tham số `fullAccess` của `deriveAgentActions`).
 */
export const HUMAN_CONFIRM_TOOLS = Object.freeze(
  new Set(Object.entries(REGISTRY).filter(([, m]) => m.confirm).map(([name]) => name)),
);

// Lưới an toàn lúc dev: thiếu icon/nhãn/thoại thì báo ngay ở console thay vì để người dùng gặp
// tên tool thô hoặc bong bóng trống — đúng cái lỗi đã xảy ra với `highlight_region`.
if (import.meta.env?.DEV) {
  for (const [name, m] of Object.entries(REGISTRY)) {
    const missing = ['icon', 'label', 'line', 'where'].filter((k) => !m[k]);
    if (missing.length) console.warn(`[guide] tool "${name}" thiếu ${missing.join(', ')} trong toolRegistry.js`);
  }
}
