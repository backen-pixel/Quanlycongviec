/**
 * Vòng sáng chỉ nút — tìm phần tử theo NHÃN HIỂN THỊ (không theo CSS selector, vì model không
 * thể biết selector và hard-code selector cho ~200 route sẽ hỏng ngay lần đổi giao diện đầu).
 *
 * Kèm LINH VẬT: một bé bot nhỏ đứng cạnh nút, tay trỏ vào nút, kèm bong bóng "Ở đây!". Vòng
 * sáng một mình dễ bị bỏ qua khi trang nhiều màu — có nhân vật trỏ vào thì mắt bắt ngay.
 * Cả hai đều `pointer-events: none` nên không bao giờ chắn cú bấm của người dùng.
 */

import { findRegion } from './pageRegions';
import { scanRoots, EXCLUDE_SELECTOR } from './pageStructureScanner';

const SPOTLIGHT_CLASS = 'app-guide-spotlight';
/**
 * BAO LÂU THÌ VÒNG SÁNG TỰ TẮT — tách riêng nút và khu vực.
 *
 * Bản trước dùng chung 45 giây. Người dùng báo lại đúng cảm giác đó: nhân vật đứng trỏ vào
 * một khu vực rất lâu, che mất phần trang bên cạnh, và không có chỗ nào để tắt. 45 giây được
 * chọn hồi câu trả lời còn nằm trong khung chat, người dùng phải đọc xong bên đó rồi mới quay
 * sang màn hình. Nay câu trả lời hiện ngay trên nhân vật, cạnh chỗ được trỏ, nên chỉ cần đủ để
 * mắt liếc tới và nhận ra.
 *
 * Khu vực ngắn hơn nút: khu vực là một mảng lớn, nhìn một cái là thấy; vòng sáng của nó lại che
 * nhiều trang hơn. Muốn tắt sớm hơn thì có nút ×, phím Esc, hoặc bấm ra ngoài — xem `attachDismiss`.
 */
const AUTO_CLEAR_BUTTON_MS = 12_000;
const AUTO_CLEAR_REGION_MS = 8_000;
const POLL_MS = 150;
const MAX_WAIT_MS = 4_000; // trang vừa navigate có thể chưa render xong


let overlayEl = null;
let clearTimer = null;
let scrollListenerAttached = false;
let dismissCleanup = null;

function norm(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function labelOf(el) {
  return norm(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.textContent);
}

/**
 * Tìm element khớp nhãn — ưu tiên khớp chính xác, rồi tới khớp chứa NGẮN NHẤT.
 *
 * Quét theo `scanRoots()` chứ KHÔNG chỉ trong `<main>`. Hộp thoại của dự án được portal thẳng ra
 * `<body>`, nên tìm trong `<main>` là mọi nút bên trong một modal đang mở đều "không tồn tại" —
 * hỏi "nút Lưu ở đâu" khi đang mở hộp thoại Thêm Lead thì trợ lý trả lời không thấy. Dùng chung
 * `scanRoots` với các tool đọc/bấm để thứ trợ lý ĐỌC được, BẤM được và CHỈ được luôn là một.
 */
function findByLabel(label) {
  if (typeof document === 'undefined') return null;
  const target = norm(label);
  if (!target) return null;

  const candidates = scanRoots()
    .flatMap((r) => [...r.querySelectorAll('button, [role="tab"], a, [role="button"]')])
    .filter((el) => !el.closest(EXCLUDE_SELECTOR));

  let exact = null;
  let bestContains = null;
  for (const el of candidates) {
    const l = labelOf(el);
    if (!l) continue;
    if (l === target) { exact = el; break; }
    if (l.includes(target) || target.includes(l)) {
      if (!bestContains || l.length < labelOf(bestContains).length) bestContains = el;
    }
  }
  return exact || bestContains || null;
}

/** Poll tối đa MAX_WAIT_MS cho tới khi nhãn xuất hiện (trang vừa điều hướng, chưa render xong). */
export function waitForLabel(label, { timeoutMs = MAX_WAIT_MS, intervalMs = POLL_MS } = {}) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const el = findByLabel(label);
      if (el) return resolve(el);
      if (Date.now() - start >= timeoutMs) return resolve(null);
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function ensureOverlay() {
  if (overlayEl && document.body.contains(overlayEl)) return overlayEl;
  overlayEl = document.createElement('div');
  overlayEl.className = SPOTLIGHT_CLASS;
  /**
   * NÚT × TRÊN CHÍNH VÒNG SÁNG. Vòng sáng vẫn `pointer-events: none` để không chắn trang, chỉ
   * riêng nút này nhận chuột. Đặt ở đây chứ không chỉ trên bong bóng nhân vật: lúc đang trỏ, bong
   * bóng chỉ còn chữ "Ở đây!" và không có nút tắt nào — đúng chỗ người dùng tìm mà không thấy.
   */
  const close = document.createElement('button');
  close.type = 'button';
  close.className = `${SPOTLIGHT_CLASS}__close`;
  close.setAttribute('aria-label', 'Tắt chỉ dẫn');
  close.title = 'Tắt chỉ dẫn (Esc)';
  close.textContent = '×';
  close.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearSpotlight();
  });
  overlayEl.appendChild(close);
  document.body.appendChild(overlayEl);
  return overlayEl;
}

function positionOverlay(el) {
  if (!overlayEl || !el) return;
  const rect = el.getBoundingClientRect();
  const pad = 4;
  overlayEl.style.top = `${rect.top - pad}px`;
  overlayEl.style.left = `${rect.left - pad}px`;
  overlayEl.style.width = `${rect.width + pad * 2}px`;
  overlayEl.style.height = `${rect.height + pad * 2}px`;
  // Khu vực sát mép trên / mép phải thì nút × thò ra ngoài màn hình — thu nó vào trong khung.
  overlayEl.classList.toggle(`${SPOTLIGHT_CLASS}--inset`, rect.top < 16 || rect.right > window.innerWidth - 16);
}

/**
 * CUỘN CHO THẤY, nhưng chỉ khi cần.
 *
 * `scrollIntoView({block:'center'})` vô điều kiện là một lỗi nhỏ mà hay gặp: thứ cần chỉ đang
 * nằm ngay trước mắt, vẫn bị giật một phát để nó nhảy vào chính giữa — người dùng mất luôn ngữ
 * cảnh xung quanh mà họ đang nhìn.
 *
 * Khối CAO HƠN khung nhìn (một khu vực dài, chẳng hạn cột thông tin) thì căn giữa còn sai hẳn:
 * giữa của nó nằm ở đâu đó lưng chừng, tiêu đề vùng — thứ giúp nhận ra "à, khu này" — bị đẩy lên
 * trên mép. Với khối cao thì đưa ĐỈNH nó lên là đúng.
 */
function scrollIntoView2(el) {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  const seen = r.top >= 0 && r.bottom <= vh;
  if (seen) return;
  const height = r.height > vh * 0.9;
  el.scrollIntoView({ behavior: 'smooth', block: height ? 'start' : 'center', inline: 'nearest' });
}

/**
 * MỤC TIÊU ĐANG ĐƯỢC TRỎ — phát ra ngoài để NHÂN VẬT bám theo.
 *
 * Trước đây file này tự dựng lấy một con bot rồi tự đặt vị trí. Nay nhân vật là một component
 * React thường trú (GuideMascot.jsx) sống suốt lượt chat, nên nếu để đây dựng thêm một con nữa
 * thì màn hình có HAI nhân vật khác hình, và khi chủ hệ thống thay ảnh thì phải thay hai chỗ.
 *
 * Chia việc: file này lo VÒNG SÁNG và tìm phần tử theo nhãn, rồi báo "đang trỏ vào cái này";
 * nhân vật tự lo việc di chuyển tới.
 */
let target = null;
const watchers = new Set();

function notifyTarget() {
  for (const cb of watchers) {
    try { cb(target); } catch { /* một người nghe lỗi không được làm hỏng những người còn lại */ }
  }
}

/** Đăng ký nhận phần tử đang được trỏ (gọi ngay một lần với giá trị hiện tại). Trả về hàm huỷ. */
export function watchTarget(cb) {
  watchers.add(cb);
  try { cb(target); } catch { /* ignore */ }
  return () => watchers.delete(cb);
}

function attachFollowListeners(el) {
  if (scrollListenerAttached) return;
  scrollListenerAttached = true;
  const onScroll = () => { positionOverlay(el); notifyTarget(); };
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll);
  overlayEl._cleanupFollow = () => {
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onScroll);
    scrollListenerAttached = false;
  };
}

export function clearSpotlight() {
  if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
  if (dismissCleanup) { dismissCleanup(); dismissCleanup = null; }
  if (overlayEl) {
    overlayEl._cleanupFollow?.();
    overlayEl.remove();
    overlayEl = null;
  }
  if (target) {
    target = null;
    notifyTarget();
  }
}

/**
 * CÁC CÁCH TẮT SỚM — ngoài nút × và hẹn giờ.
 *
 *  · Esc: ở đâu cũng tắt.
 *  · Bấm vào trang: với NÚT, bấm bất cứ đâu (kể cả chính nút đó) nghĩa là "tôi thấy rồi". Với
 *    KHU VỰC thì bấm BÊN TRONG không tắt — khu vực chiếm cả mảng màn hình, cú bấm đầu tiên của
 *    người dùng gần như chắc chắn rơi vào trong nó (cuộn, mở một dòng); chỉ bấm ra NGOÀI mới tắt.
 *  · Bấm vào giao diện của CHÍNH trợ lý (khung chat, ô hỏi, bảng Hành động) không tính: người dùng
 *    đang gõ câu hỏi tiếp theo hay bấm "Chỉ vị trí" thì không phải là muốn tắt.
 *
 * `pointerdown` ở pha capture, không phải `click`: chạy trước mọi xử lý của trang nên nút được bấm
 * vẫn nhận cú bấm bình thường, và không bị trang nào `stopPropagation` nuốt mất. Gắn trễ một
 * nhịp để chính cú bấm vừa gọi ra vòng sáng (nút "Chỉ vị trí") không tắt nó ngay lập tức.
 */
function attachDismiss(el, { clickInsideClears }) {
  const onKey = (e) => { if (e.key === 'Escape') clearSpotlight(); };
  const onDown = (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (overlayEl?.contains(t)) return; // nút × tự lo
    if (t.closest(EXCLUDE_SELECTOR) || t.closest('.guide-act, .guide-act-open, [data-copilot-sidebar]')) return;
    if (!clickInsideClears && el.contains(t)) return;
    clearSpotlight();
  };
  const armTimer = setTimeout(() => document.addEventListener('pointerdown', onDown, true), 0);
  document.addEventListener('keydown', onKey, true);
  dismissCleanup = () => {
    clearTimeout(armTimer);
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
  };
}

/** Phần dùng chung của mọi cách chỉ: dọn cái cũ, cuộn cho thấy, khoanh sáng, báo cho nhân vật. */
function pointAt(el, { clickToClear = true } = {}) {
  clearSpotlight();
  scrollIntoView2(el);
  ensureOverlay();
  const ms = clickToClear ? AUTO_CLEAR_BUTTON_MS : AUTO_CLEAR_REGION_MS;
  // Vạch đếm ngược dưới vòng sáng chạy đúng bằng thời gian tự tắt — thấy được là nó sắp tự đi.
  overlayEl.style.setProperty('--spot-ms', `${ms}ms`);
  positionOverlay(el);
  target = el;
  notifyTarget();
  attachFollowListeners(el);
  attachDismiss(el, { clickInsideClears: clickToClear });
  clearTimer = setTimeout(clearSpotlight, ms);
}

/** Làm sáng phần tử khớp `label`. Tự tắt sau AUTO_CLEAR_BUTTON_MS, hoặc khi bấm ×, Esc, hay bấm vào trang. */
export async function highlightByLabel(label) {
  const el = await waitForLabel(label);
  if (!el) return { ok: false, reason: 'label_not_found' };
  pointAt(el);
  return { ok: true };
}

/**
 * Làm sáng cả một KHU VỰC — không phải một nút.
 *
 * Vì sao cần cái này bên cạnh `highlightByLabel`: rất nhiều câu hỏi vị trí KHÔNG hỏi về nút.
 * "Thông tin deadline nằm ở đâu?" — deadline là một cụm chữ trong cột Thông tin, không có nút
 * nào tên "deadline" để mà khoanh. Trước đây trợ lý gặp loại câu này thì đành TẢ BẰNG LỜI ("ở
 * khu vực Thông tin, bên phải màn hình") trong khi nhân vật vẫn đứng đậu ở góc trái — tức là
 * câu trả lời nói một đằng, ngón tay chỉ một nẻo. Product tour làm tốt hơn đúng ở chỗ này, vì
 * mỗi bước tour có sẵn một phần tử neo.
 *
 * Dùng chung phép khớp tên với tool `read_region` (`findRegion` trong pageRegions.js) nên khu vực
 * mà trợ lý ĐỌC và khu vực mà nó CHỈ luôn là một.
 */
export function highlightByRegion(ref) {
  const found = findRegion(ref);
  if (!found.ok) {
    return {
      ok: false,
      reason: found.reason,
      ...(found.available_regions ? { available_regions: found.available_regions } : {}),
    };
  }
  pointAt(found.el, { clickToClear: false });
  return { ok: true, name: found.name, id: `kv${found.idx + 1}` };
}

export { findByLabel };
