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
