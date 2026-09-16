/**
 * Công tắc CHẾ ĐỘ TOÀN QUYỀN của trợ lý.
 *
 * Bật thì trợ lý được: đọc giá trị thật của bộ lọc/ô nhập/bảng đang hiển thị, tự bấm nút, tự
 * điền trường, tự điều hướng — KHÔNG cần người dùng xác nhận, KHÔNG lọc PII. Nói cách khác nó
 * làm được mọi thứ người dùng làm được bằng chuột trên trang đó, kể cả nút Xoá.
 *
 * VÌ SAO PHẢI CÓ CÔNG TẮC, không hard-code `true`:
 * bản build production dùng chung mã nguồn này. Không có cờ thì một lần `npm run build` là
 * trợ lý có quyền bấm Xoá trên dữ liệu thật của khách. Mặc định vì thế là: BẬT khi chạy dev
 * (`vite dev`), TẮT khi build production — trừ khi có người cố ý đặt VITE_GUIDE_FULL_ACCESS=1.
 *
 * Ba nguồn, ưu tiên từ trên xuống:
 *  1. localStorage `guide.fullAccess` = '1' | '0'  → bật/tắt ngay, không cần restart Vite.
 *  2. env `VITE_GUIDE_FULL_ACCESS` = '1'|'true' | '0'|'false'  → chốt theo build.
 *  3. mặc định: `import.meta.env.DEV`.
 *
 * `FULL_ACCESS` đọc MỘT LẦN lúc import và không đổi trong suốt vòng đời trang. Đó là điều kiện
 * để mount tool theo nhánh (`{FULL_ACCESS ? <A/> : <B/>}`) mà không phá thứ tự hook của React:
 * giá trị hằng thì nhánh không bao giờ đổi giữa hai lần render. Đổi cờ trong localStorage phải
 * TẢI LẠI TRANG mới có tác dụng — cố tình như vậy.
 */

const LS_KEY = 'guide.fullAccess';

function fromStorage() {
  try {
    return localStorage.getItem(LS_KEY);
  } catch {
    return null; // Safari chế độ riêng tư / localStorage bị chặn
  }
}

function resolve() {
  const ls = fromStorage();
  if (ls === '1') return true;
  if (ls === '0') return false;

  const env = import.meta.env?.VITE_GUIDE_FULL_ACCESS;
  if (env === '1' || env === 'true') return true;
  if (env === '0' || env === 'false') return false;

  return !!import.meta.env?.DEV;
}

export const FULL_ACCESS = resolve();

/** Đổi cờ rồi tải lại trang — dùng khi cần tắt nhanh giữa lúc đang thử nghiệm. */
export function setFullAccess(on) {
  try {
    localStorage.setItem(LS_KEY, on ? '1' : '0');
  } catch { /* ignore */ }
}

/* ═══════════════════════ CÔNG TẮC RIÊNG CHO VIỆC PHÁ HUỶ ═══════════════════════
 *
 * TÁCH KHỎI `FULL_ACCESS`, cố ý. Toàn quyền và quyền xoá là HAI câu hỏi khác nhau:
 * "trợ lý có được tự bấm nút không" và "trợ lý có được bấm nút Xoá không". Gộp làm một thì
 * bản production chỉ còn hai lựa chọn đều sai — hoặc trợ lý vô dụng (không bấm được gì),
 * hoặc trợ lý xoá được dữ liệu thật của khách.
 *
 * MẶC ĐỊNH LÀ TẮT Ở MỌI MÔI TRƯỜNG, kể cả dev. Khác với `FULL_ACCESS` (mặc định theo
 * `import.meta.env.DEV`): một thao tác xoá nhầm trên dev vẫn là mất dữ liệu thật của người
 * đang thử, và không có lý do nào để nó tự bật. Ai cần thì bật tường minh.
 *
 * Bật bằng một trong hai, ưu tiên từ trên xuống:
 *  1. localStorage `guide.allowDelete` = '1'
 *  2. env `VITE_GUIDE_ALLOW_DELETE` = '1' | 'true'
 *
 * CỜ NÀY KHÔNG PHẢI LỚP BẢO VỆ DUY NHẤT. Nó chặn ở client (xem `pageActions.clickByLabel`)
 * và khai vào ngữ cảnh để model biết. Phân quyền thật vẫn nằm ở backend: trợ lý chỉ bấm được
 * những nút mà chính người dùng đó bấm được, vì nó thao tác trên đúng giao diện của họ.
 */
const LS_DELETE_KEY = 'guide.allowDelete';

function resolveDelete() {
  if (!FULL_ACCESS) return false; // chế độ đọc thì không bấm được gì, khỏi bàn tới xoá

  /**
   * ENV THẮNG localStorage — NGƯỢC với `FULL_ACCESS`, và cố ý ngược.
   *
   * Ở `FULL_ACCESS` thì localStorage được ưu tiên vì đó là công tắc tiện tay lúc thử nghiệm.
   * Với quyền XOÁ thì thứ tự đó sai: bản production dựng với `VITE_GUIDE_ALLOW_DELETE=0` là
   * một quyết định lúc TRIỂN KHAI, không nên để một dòng gõ trong devtools lật lại.
   *
   * Nói cho đúng mức: đây KHÔNG phải ranh giới bảo mật. Ai mở được devtools thì cũng tự bấm
   * được nút Xoá bằng chuột — hàng rào thật vẫn là phân quyền ở backend. Chỗ này chỉ đảm bảo
   * bản production không tự dưng nới quyền cho TRỢ LÝ vì một cờ còn sót trong trình duyệt.
   */
  const env = import.meta.env?.VITE_GUIDE_ALLOW_DELETE;
  if (env === '0' || env === 'false') return false;
  if (env === '1' || env === 'true') return true;

  // Không khai env (chạy `vite dev`) → mới xét tới công tắc cục bộ.
  try {
    return localStorage.getItem(LS_DELETE_KEY) === '1';
  } catch {
    return false; // localStorage bị chặn → giữ nguyên mặc định an toàn
  }
}

export const ALLOW_DELETE = resolveDelete();

/** Bật/tắt quyền xoá rồi TẢI LẠI TRANG mới có tác dụng (giống `FULL_ACCESS`). */
export function setAllowDelete(on) {
  try {
    localStorage.setItem(LS_DELETE_KEY, on ? '1' : '0');
  } catch { /* ignore */ }
}

/* ═════════════════ BẢNG "HÀNH ĐỘNG CỦA TRỢ LÝ" — CÔNG CỤ CHO NGƯỜI PHÁT TRIỂN ═════════════════
 *
 * Bảng này (AgentActivityPanel) bày ra thứ người dùng cuối không nên thấy và cũng không cần:
 * tham số + kết quả THÔ của từng tool, nguyên văn suy luận của model, chỉ dẫn hệ thống thật,
 * số token và tiền từng lượt. Trên bản khách hàng dùng, nó vừa rối vừa lộ nội bộ.
 *
 * MẶC ĐỊNH THEO KIỂU BUILD: hiện khi `vite dev`, ẩn khi `vite build`. Nghĩa là bản production
 * tự ẩn mà không cần khai thêm biến nào — khác `FULL_ACCESS` (mặc định bật cho bản Docker nội
 * bộ qua ARG trong Dockerfile).
 *
 * CHO PHÉP localStorage BẬT LẠI, cố ý khác với `ALLOW_DELETE` ở ngay trên. Lý do khác nhau về
 * BẢN CHẤT RỦI RO: quyền xoá là thao tác GHI, bật nhầm thì mất dữ liệu; bảng này chỉ ĐỌC, và
 * mọi endpoint nuôi nó (`/debug/prompt`, `/debug/flow`, `/debug/usage`) đã chặn `isAdminLike`
 * khi NODE_ENV=production. Người không phải admin có bật cũng chỉ nhận 403. Đổi lại, giữ được
 * đường soi lỗi ngay trên bản production khi có sự cố thật.
 *
 * Ẩn bảng cũng bỏ luôn nhịp poll `/debug/usage` mà nó chạy nền.
 *
 * ADMIN KHÔNG CẦN CỜ NÀY NỮA. Từ khi `AppGuideCopilotPanel` mount bảng cho mọi tài khoản admin,
 * `DEV_PANEL` chỉ còn phục vụ hai ca: bản `vite dev`, và người KHÔNG phải admin cần bật tay để
 * soi lỗi. Ca thứ hai vẫn giữ vì nó vô hại (mọi endpoint trả 403 cho họ) nhưng đừng dùng nó để
 * cấp quyền xem cho admin — họ đã có sẵn, và bật thêm ở đây chỉ tạo ra hai đường điều khiển cho
 * cùng một thứ.
 */
const LS_PANEL_KEY = 'guide.devPanel';

function resolvePanel() {
  const env = import.meta.env?.VITE_GUIDE_DEV_PANEL;
  if (env === '1' || env === 'true') return true;

  try {
    const ls = localStorage.getItem(LS_PANEL_KEY);
    if (ls === '1') return true;
    if (ls === '0') return false;
  } catch { /* localStorage bị chặn — rơi xuống mặc định */ }

  if (env === '0' || env === 'false') return false;
  return !!import.meta.env?.DEV;
}

export const DEV_PANEL = resolvePanel();

/** Bật/tắt bảng hành động rồi TẢI LẠI TRANG — lối soi lỗi trên bản production. */
export function setDevPanel(on) {
  try {
    localStorage.setItem(LS_PANEL_KEY, on ? '1' : '0');
  } catch { /* ignore */ }
}
