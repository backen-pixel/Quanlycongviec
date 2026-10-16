/**
 * Nhận diện THÀNH PHẦN đang bị lỗi dưới con trỏ, để báo lỗi chỉ đúng chỗ.
 *
 * Người báo lỗi thường viết «nút này không chạy» — người sửa mở lên không biết «nút này» là
 * nút nào trong 40 nút của trang. Ở đây bắt luôn thẻ DOM dưới chuột và ghi lại đủ dấu vết để
 * tìm lại: đường dẫn CSS, chữ trên thẻ, toạ độ, và khu vực giao diện gần nhất.
 *
 * KHÔNG lấy toàn bộ innerHTML: thẻ cha có thể chứa cả bảng dữ liệu khách hàng, mà báo lỗi thì
 * nhiều người đọc được. Chỉ lấy chữ ngắn đủ để nhận ra.
 */

const CHU_TOI_DA = 120;

/**
 * Class do Tailwind sinh (hàng chục class mỗi thẻ) vô dụng để tìm lại — bỏ.
 *
 * Loại TRƯỚC HẾT mọi class chứa ký tự cần escape trong CSS selector (`:` `[` `/` `.` `%` …).
 * Tailwind đầy những cái như `last:border-b-0`, `w-[15rem]`, `top-1/2` — ghép thẳng vào
 * selector là `querySelector` ném lỗi, và thành phần bị lỗi không bao giờ tìm lại được.
 * Bộ lọc tiền tố bên dưới không đủ: `last:border-b-0` bắt đầu bằng "last", không khớp
 * tiền tố nào cả — đã đo thấy nó lọt vào selector thật.
 */
function classOnDinh(el) {
  const ds = Array.from(el.classList || []);
  return ds.filter((c) => (
    /^[a-zA-Z_][\w-]*$/.test(c)
    && !/^(w|h|p|m|px|py|pt|pb|pl|pr|mx|my|mt|mb|ml|mr|gap|text|bg|border|rounded|flex|grid|items|justify|min|max|absolute|relative|fixed|sticky|z|opacity|shadow|hover|focus|transition|overflow|truncate|font|leading|tracking|space|inline|block|cursor|select|top|left|right|bottom|col|row|prose|group|ring|divide|from|via|to|backdrop|animate|duration|ease|delay|scale|rotate|translate|origin|whitespace|break|align|order|basis|shrink|grow|object|aspect|list|decoration|underline|uppercase|lowercase|capitalize|tabular|antialiased)([-_]|$)/.test(c)
    && c.length < 40
  ));
}

/** Một bậc trong đường dẫn — ưu tiên dấu hiệu ổn định qua các lần dựng lại. */
function moBac(el) {
  if (el.id) return `#${el.id}`;
  const guide = el.getAttribute?.('data-guide-khu-vuc');
  if (guide) return `[data-guide-khu-vuc="${guide}"]`;
  const test = el.getAttribute?.('data-testid');
  if (test) return `[data-testid="${test}"]`;
  const aria = el.getAttribute?.('aria-label');
  if (aria) return `${el.tagName.toLowerCase()}[aria-label="${aria}"]`;
  const cls = classOnDinh(el);
  if (cls.length) return `${el.tagName.toLowerCase()}.${cls[0]}`;
  const cha = el.parentElement;
  if (cha) {
    const anhEm = Array.from(cha.children).filter((x) => x.tagName === el.tagName);
    if (anhEm.length > 1) return `${el.tagName.toLowerCase()}:nth-of-type(${anhEm.indexOf(el) + 1})`;
  }
  return el.tagName.toLowerCase();
}

/** Đường dẫn CSS từ thẻ lên trên, dừng sớm khi đã đủ để tìm duy nhất. */
export function duongDanCss(el, toiDa = 6) {
  if (!el || el.nodeType !== 1) return '';
  const bac = [];
  let cur = el;
  while (cur && cur.nodeType === 1 && bac.length < toiDa && cur !== document.body) {
    bac.unshift(moBac(cur));
    const thu = bac.join(' > ');
    try {
      if (document.querySelectorAll(thu).length === 1) return thu;
    } catch { /* selector không hợp lệ — đi tiếp */ }
    cur = cur.parentElement;
  }
  return bac.join(' > ');
}

/** Khu vực giao diện gần nhất — để người sửa biết «ở vùng nào của màn hình». */
function khuVucGanNhat(el) {
  let cur = el;
  while (cur && cur !== document.body) {
    const v = cur.getAttribute?.('data-guide-khu-vuc');
    if (v) return v;
    const vaiTro = cur.getAttribute?.('role');
    if (vaiTro === 'dialog' || vaiTro === 'region') {
      return cur.getAttribute('aria-label') || `vùng ${vaiTro}`;
    }
    if (cur.tagName === 'HEADER') return 'thanh trên';
    if (cur.tagName === 'NAV') return 'thanh điều hướng';
    if (cur.tagName === 'ASIDE') return 'cột bên';
    cur = cur.parentElement;
  }
  return null;
}

/** Chữ hiển thị trên thẻ — cắt ngắn, không kéo theo cả bảng dữ liệu. */
function chuTrenThe(el) {
  const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  if (!t) {
    return el.getAttribute?.('aria-label')
      || el.getAttribute?.('placeholder')
      || el.getAttribute?.('title')
      || '';
  }
  return t.length > CHU_TOI_DA ? `${t.slice(0, CHU_TOI_DA)}…` : t;
}

/**
 * Gom mọi thứ cần biết về thành phần bị lỗi.
 * Trả `null` nếu không phải phần tử thật (ví dụ bấm vào nền trống của tài liệu).
 */
export function batThanhPhan(el) {
  if (!el || el.nodeType !== 1) return null;
  const r = el.getBoundingClientRect();
  return {
    css: duongDanCss(el),
    the: el.tagName.toLowerCase(),
    chu: chuTrenThe(el),
    khu_vuc: khuVucGanNhat(el),
    vi_tri: {
      x: Math.round(r.x), y: Math.round(r.y),
      w: Math.round(r.width), h: Math.round(r.height),
    },
    trang: {
      url: window.location.pathname + window.location.search,
      tieu_de: document.title,
      man_hinh: `${window.innerWidth}×${window.innerHeight}`,
    },
  };
}

/** Mô tả một câu cho người đọc — đi kèm nội dung lỗi. */
export function moTaThanhPhan(tp) {
  if (!tp) return '';
  const phan = [];
  if (tp.khu_vuc) phan.push(`Khu vực: ${tp.khu_vuc}`);
  if (tp.chu) phan.push(`Thành phần: “${tp.chu}”`);
  phan.push(`Thẻ: <${tp.the}>`);
  phan.push(`Trang: ${tp.trang.url}`);
  return phan.join(' · ');
}

/**
 * Khoanh sáng lại thành phần khi người sửa mở lỗi ra xem.
 * Trả hàm dọn — gọi để bỏ khoanh. Trả `null` nếu không tìm lại được thẻ (giao diện đã đổi).
 */
export function khoanhLaiThanhPhan(css, { mau = '#ef4444', giay = 6 } = {}) {
  if (!css) return null;
  let el = null;
  try { el = document.querySelector(css); } catch { return null; }
  if (!el) return null;

  const r = el.getBoundingClientRect();
  const khung = document.createElement('div');
  khung.style.cssText = [
    'position:fixed', `top:${r.top - 3}px`, `left:${r.left - 3}px`,
    `width:${r.width + 6}px`, `height:${r.height + 6}px`,
    `border:2px solid ${mau}`, 'border-radius:6px',
    `box-shadow:0 0 0 4px ${mau}33, 0 0 18px ${mau}66`,
    'pointer-events:none', 'z-index:99990',
    'transition:opacity .2s ease',
  ].join(';');
  document.body.appendChild(khung);
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });

  const don = () => { khung.remove(); };
  if (giay > 0) setTimeout(don, giay * 1000);
  return don;
}
