/**
 * CHỖ CẮM ẢNH NHÂN VẬT — sửa đúng file này, không cần đụng vào logic ở đâu khác.
 *
 * ─────────────────────────── CÁCH THÊM MỘT BỘ ───────────────────────────
 *
 * 1. Tạo thư mục riêng cho bộ: `frontend/public/mascot/<mã-bộ>/`, rồi chép ảnh vào đó.
 * 2. Thêm một mục vào `SETS` bên dưới, trỏ đường dẫn bắt đầu bằng `/mascot/…`
 *    (thư mục `public` được phục vụ ở gốc, và được chép nguyên vào bản build).
 * 3. Xong. Bộ mới tự hiện trong ô chọn ở Cài đặt ▸ Trợ lý hướng dẫn ▸ Tinh chỉnh.
 *
 * Trạng thái nào chưa có ảnh thì tự động dùng lại ảnh của `idle`; `idle` cũng trống thì rơi về
 * hình vector dựng sẵn. Nghĩa là thả MỘT ảnh vào cũng chạy được ngay.
 *
 * YÊU CẦU ẢNH:
 *  - SVG, hoặc PNG/WebP NỀN TRONG SUỐT. Ảnh nền trắng sẽ hiện thành một ô vuông trắng đè lên
 *    trang.
 *  - Nhân vật quay mặt SANG PHẢI. Khi nó đứng bên phải thứ cần chỉ, mã sẽ tự lật ngang —
 *    vẽ sẵn hai chiều là thừa.
 *  - KHUNG 146×132 (SVG thì đặt `viewBox="0 0 146 132"`), và ĐẦU NGÓN TAY của tư thế `pointing`
 *    phải nằm ở 94,02% bề ngang × 39,82% chiều cao — tức (137, 53) trong khung. Đây KHÔNG phải
 *    gợi ý thẩm mỹ: `GuideMascot.jsx` đặt nhân vật theo đúng điểm đó (HAND_X/HAND_Y) chứ không
 *    căn giữa khung. Vẽ ngón tay chỗ khác là tay chỉ hụt ra ngoài nút, mà không có lỗi nào báo.
 *  - Ảnh động thì dùng APNG/WebP động; GIF cũng chạy nhưng viền răng cưa vì GIF không có
 *    kênh trong suốt mượt.
 *
 * VÌ SAO KHÔNG `import` ẢNH: `import` bắt Vite phải thấy file lúc build, nên thiếu file là
 * HỎNG CẢ BẢN BUILD. Trỏ đường dẫn tĩnh thì thiếu ảnh chỉ là không hiện ảnh đó, phần còn lại
 * vẫn chạy — đúng thứ ta cần cho một chỗ cắm mà chủ hệ thống tự điền.
 */

/** Trạng thái nhân vật. Giữ đúng bộ này — `mascotState.js` chỉ trả về một trong số đây. */
export const STATES = ['idle', 'thinking', 'working', 'pointing', 'answering', 'done'];

/**
 * SẮC MẶT — TÁCH HẲN khỏi `STATES`, và đây là chỗ dễ nhầm nhất của tệp này.
 *
 * `STATES` suy ra THUẦN CƠ HỌC từ hoạt động của agent, luôn đúng, luôn chạy. Bốn sắc mặt dưới
 * đây là NHẬN XÉT của một subagent về nội dung câu hỏi (xem backend/helpers/guideMood.js): tuỳ
 * chọn, mặc định tắt, và chỉ chèn một nhịp ngắn sau khi lượt kết thúc.
 *
 * Gộp chúng vào `STATES` là sai ngay: `hasSprite()` sẽ coi một bộ thiếu sắc mặt là bộ hỏng, và
 * `deriveMascotState` — vốn không biết gì về subagent — sẽ không bao giờ trả về được chúng.
 *
 * Bộ nào không khai `moods` thì tính năng tự im với bộ đó, không lỗi.
 */
export const MOODS = ['speechless', 'contempt', 'amused', 'helpless'];

/**
 * CÁC BỘ NHÂN VẬT.
 *
 * `poses` khuyết trạng thái nào thì trạng thái đó lùi về `idle`. `directional` liệt kê những tư
 * thế MANG NGHĨA HƯỚNG — chỉ chúng mới được lật ngang khi nhân vật phải đứng bên phải thứ cần
 * chỉ. Lật hết là hỏng: tư thế cầm bảng phép lật ngang thì bảng nhảy sang tay kia giữa chừng
 * một chuỗi; còn tư thế vẫy tay chào thì lật hay không cũng chẳng nói lên điều gì, nên đừng lật
 * cho đỡ nhấp nháy khi nhân vật đổi bên.
 */
export const SETS = [
  {
    id: 'anime',
    name: 'Cô gái áo trắng (ảnh)',
    note: 'Bộ ảnh PNG đã dùng từ tháng 8/2026. Nét mềm, nặng ~1,4 MB cho cả 6 tư thế.',
    directional: ['pointing'],
    poses: {
      idle: '/mascot/greeting.png',
      /**
       * MỌI TRẠNG THÁI "ĐANG TÍNH" DÙNG CHUNG MỘT TƯ THẾ: bảng phép (`analyzing`).
       *
       * `thinking` và `working` là hai nhịp của cùng một việc — model nghĩ, rồi model chạy tool,
       * rồi lại nghĩ tiếp. Trong một chuỗi dài, hai nhịp này xen kẽ nhau vài lần mỗi lượt, nên
       * cho hai ảnh khác nhau là nhân vật nhấp nháy đổi tư thế liên tục mà chẳng nói thêm được
       * gì: người dùng không cần phân biệt "đang nghĩ" với "đang chạy tool", họ chỉ cần biết trợ
       * lý đang làm việc.
       *
       * `thinking.png` (tư thế chống cằm, dấu "?") vì thế nay không dùng nữa. Vẫn giữ file trong
       * public/mascot/ để đổi lại được bằng một dòng ở đây.
       *
       * ĐÃ THỬ ẢNH ĐỘNG RỒI QUAY LẠI ẢNH TĨNH. `analyzing.webp` (170×176, 53 khung, 4,47 giây
       * một vòng) vẫn nằm trong public/mascot/ — đổi hai dòng dưới sang `.webp` là dùng lại được
       * ngay. Nó nặng 534 KB, và dung lượng đó gần như không hạ được bằng cách chỉnh chất lượng:
       * chi phí nằm ở số khung nhân kênh alpha, không nằm ở nén màu. Ai định bật lại thì cân chỗ
       * đó trước.
       */
      thinking: '/mascot/analyzing.png',
      working: '/mascot/analyzing.png',
      pointing: '/mascot/pointing.png',
      answering: '/mascot/answering.png',
      done: '/mascot/success.png',
    },
  },
  {
    id: 'la-ban',
    name: 'Robot la bàn (vector)',
    /**
     * THÂN vector, MẶT là ảnh chụp nhúng base64 — không còn thuần vector như tên gọi.
     *
     * Ảnh phải nhúng thẳng vào tệp chứ không trỏ đường dẫn: `GuideMascot` render bằng
     * `<img src="....svg">`, mà SVG nạp dưới dạng ảnh thì bị cách ly — mọi tham chiếu ra ngoài
     * bị chặn IM LẶNG, trỏ đường dẫn là ra mặt trống trơn mà không một lỗi nào báo.
     *
     * Cái giá là dung lượng: 24 KB (mặt vẽ tay) → ~380 KB. Vẫn nhẹ hơn bộ ảnh (1,4 MB) và chỉ
     * tải khi người dùng mở trợ lý. Muốn giảm thì hạ ảnh gốc trong `E:/CRMtb/meme` từ 180px
     * xuống ~110px rồi nhúng lại — vẫn nét ở màn hình 2×.
     */
    note: 'Thân vector tông tím có mặt la bàn trên ngực; mặt là ảnh chụp nhúng sẵn. '
      + 'Cả 6 tư thế ~380 KB.',
    directional: ['pointing'],
    poses: {
      idle: '/mascot/la-ban/greeting.svg',
      /**
       * Bộ này CÓ tách `thinking` khỏi `working` — khác bộ ảnh ở trên.
       *
       * Lý do đảo ngược được: hai tư thế vector này gần như trùng khung (cùng thân, cùng đầu,
       * chỉ khác cánh tay phải và cặp mắt), nên lúc model xen kẽ nghĩ/chạy tool thì thứ nhúc
       * nhích chỉ là một cánh tay chứ không phải cả nhân vật nhảy chỗ. Ai thấy vẫn chớp thì trỏ
       * `thinking` sang `analyzing.svg` là về đúng cách bộ ảnh đang chạy.
       */
      thinking: '/mascot/la-ban/thinking.svg',
      working: '/mascot/la-ban/analyzing.svg',
      pointing: '/mascot/la-ban/pointing.svg',
      answering: '/mascot/la-ban/answering.svg',
      done: '/mascot/la-ban/success.svg',
    },
    /**
     * Bốn sắc mặt tuỳ chọn — chỉ hiện khi `mood_enabled` bật ở Cài đặt. Cùng thân với tư thế
     * đứng chào, chỉ khác khuôn mặt: thứ đang nói ở đây là THÁI ĐỘ, không phải hành động.
     */
    moods: {
      speechless: '/mascot/la-ban/speechless.svg',
      contempt: '/mascot/la-ban/contempt.svg',
      amused: '/mascot/la-ban/amused.svg',
      helpless: '/mascot/la-ban/helpless.svg',
    },
  },
];

export const DEFAULT_SET = 'anime';

const BY_ID = new Map(SETS.map((s) => [s.id, s]));

/** Mã bộ hợp lệ, hoặc mặc định. Không bao giờ ném lỗi: bộ bị xoá thì quay về bộ mặc định. */
export function normalizeSet(id) {
  return BY_ID.has(String(id || '')) ? String(id) : DEFAULT_SET;
}

/**
 * NHỚ Ở LOCALSTORAGE, KHÔNG CHỈ TRONG BIẾN.
 *
 * Bộ nhân vật do máy chủ quyết (Cài đặt ▸ Tinh chỉnh), nhưng lời đáp đó tới sau khi trang đã vẽ
 * xong. Không nhớ lại thì mỗi lần tải trang người dùng thấy bộ mặc định nhấp một cái rồi mới đổi
 * sang bộ thật. Lưu lại thì lần sau đúng ngay từ khung hình đầu; máy chủ trả về khác thì ghi đè.
 */
const LS_KEY = 'guide.mascotSet';

/**
 * `typeof localStorage` KHÔNG an toàn và phải nằm TRONG try.
 *
 * Nó trông như một phép kiểm tra vô hại, nhưng `typeof` vẫn ĐỌC thuộc tính `localStorage` của
 * `window` — và trong tài liệu có origin rỗng (iframe sandbox, `about:blank`) hay khi trình
 * duyệt chặn lưu trữ, chính phép đọc đó ném `SecurityError`. Để ngoài try là dòng khởi tạo
 * module ném ngay lúc nạp, và vì đây là module cấp cao nên CẢ chunk trợ lý chết theo — đúng cái
 * mà `catch` bên dưới đang cố tránh. Đã tái hiện được trong Chromium headless.
 */
function readStored() {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_SET;
    return normalizeSet(localStorage.getItem(LS_KEY));
  } catch {
    return DEFAULT_SET; // chế độ riêng tư chặn localStorage — không phải lý do để vỡ giao diện
  }
}

let active = readStored();
const listeners = new Set();

/** Mã bộ đang dùng. */
export function mascotSet() {
  return active;
}

/** Bộ đang dùng, dạng đầy đủ (id/name/note/poses). */
export function activeSet() {
  return BY_ID.get(active) || BY_ID.get(DEFAULT_SET);
}

/** Đổi bộ. Trả về `true` nếu thật sự có đổi (để chỗ gọi khỏi vẽ lại thừa). */
export function setMascotSet(id) {
  const next = normalizeSet(id);
  if (next === active) return false;
  active = next;
  try {
    localStorage.setItem(LS_KEY, next);
  } catch { /* không lưu được thì thôi, phiên này vẫn đúng */ }
  listeners.forEach((fn) => { try { fn(next); } catch { /* một chỗ nghe hỏng không kéo theo chỗ khác */ } });
  return true;
}

/** Nghe đổi bộ. Trả về hàm huỷ đăng ký. */
export function onMascotSetChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function canFlip(state) {
  return (activeSet().directional || []).includes(state);
}

/** Có ảnh nào được điền chưa? Chưa thì cả hệ thống dùng hình vector. */
export function hasSprite() {
  const { poses } = activeSet();
  return STATES.some((t) => !!poses[t]);
}

/** Ảnh cho một trạng thái, tự lùi về ảnh `idle` nếu trạng thái đó chưa có riêng. */
export function spriteFor(state) {
  const { poses } = activeSet();
  return poses[state] || poses.idle || '';
}

/**
 * Ảnh cho một SẮC MẶT — trả `''` nếu bộ đang dùng không có.
 *
 * KHÔNG lùi về `idle` như `spriteFor`. Lùi ở đây là nhân vật đổi sang tư thế đứng chào giữa
 * chừng mà không có sắc mặt nào — một cú nhấp nháy vô nghĩa. Trả rỗng thì chỗ gọi biết là "bộ
 * này không có sắc mặt" và giữ nguyên tư thế cơ học, đúng thứ cần.
 */
export function moodSpriteFor(mood) {
  const { moods } = activeSet();
  if (!mood || !moods) return '';
  return moods[mood] || '';
}

/**
 * Bộ đang dùng có sắc mặt không — client khai lên server qua header `x-guide-moods`.
 *
 * Không có hàm này thì bộ "Cô gái áo trắng" vẫn tốn một lời gọi `gpt-4o-mini` MỖI LƯỢT HỎI để
 * rồi `moodSpriteFor` trả rỗng và không hiện gì: trả tiền cho kết quả không ai thấy.
 *
 * Phép kiểm PHẢI nằm ở đây, không chép sang backend. Sổ đăng ký bộ nhân vật ở tệp này là nguồn
 * duy nhất; chép danh sách sang bên kia là thêm một bộ ở đây rồi quên sửa bên đó, và không có
 * lỗi nào báo.
 */
export function hasMoodSprites() {
  const { moods } = activeSet();
  return !!moods && Object.keys(moods).length > 0;
}
