/**
 * Quay màn hình cho báo lỗi — tối đa 60 giây.
 *
 * VÌ SAO CÓ TRẦN THỜI GIAN: quay 1 phút đã 5–20 MB. Không chặn thì sẽ có người bật rồi
 * quên tắt, kho tệp phình nhanh và video 300 MB không ai mở nổi để xem. Tự dừng ở 60 giây
 * và báo cho người dùng biết trước, chứ không cắt lén.
 *
 * KHÔNG chạy trên Safari và trên điện thoại: `getDisplayMedia` chưa có ở iOS, và Android
 * Chrome chỉ chia sẻ được tab. Kiểm trước rồi báo thẳng — để người dùng bấm rồi mới biết
 * không được thì tệ hơn nhiều.
 */

export const GIAY_TOI_DA = 60;

/** Trình duyệt này quay được không, và nếu không thì vì sao. */
export function quayDuocKhong() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    return { duoc: false, vi_sao: 'Trình duyệt này không quay được màn hình. Dùng Chrome hoặc Edge trên máy tính.' };
  }
  if (typeof MediaRecorder === 'undefined') {
    return { duoc: false, vi_sao: 'Trình duyệt này thiếu MediaRecorder — không quay được.' };
  }
  const diDong = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (diDong) {
    return { duoc: false, vi_sao: 'Điện thoại chưa quay được màn hình. Hãy chụp ảnh hoặc mô tả bằng chữ.' };
  }
  return { duoc: true, vi_sao: null };
}

/** Định dạng tốt nhất trình duyệt chịu — thứ tự ưu tiên theo độ nén. */
function kieuTep() {
  const ds = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  return ds.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
}

/**
 * Bắt đầu quay. Trả về bộ điều khiển:
 *   dung()    → Promise<Blob>  dừng và lấy tệp
 *   huy()     → bỏ, không trả tệp
 *   onGiay    → gán hàm để nhận số giây đã quay (vẽ đồng hồ đếm)
 *
 * Người dùng bấm "Dừng chia sẻ" của trình duyệt cũng kết thúc — bắt sự kiện `ended` của
 * track, nếu không thì giao diện vẫn đếm giờ trong khi màn hình đã ngừng thu từ lâu.
 */
export async function batDauQuay({ onGiay, onTuDung } = {}) {
  const kiem = quayDuocKhong();
  if (!kiem.duoc) throw new Error(kiem.vi_sao);

  const luong = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'browser', frameRate: 15 },
    audio: false,
    preferCurrentTab: true,
  });

  const mime = kieuTep();
  const may = new MediaRecorder(luong, mime ? { mimeType: mime } : undefined);
  const manh = [];
  may.ondataavailable = (e) => { if (e.data?.size) manh.push(e.data); };
  may.start(1000);

  let giay = 0;
  const nhip = setInterval(() => {
    giay += 1;
    onGiay?.(giay);
    if (giay >= GIAY_TOI_DA) { onTuDung?.(); dungThat(); }
  }, 1000);

  let giaiQuyet = null;
  const xong = new Promise((ok) => { giaiQuyet = ok; });

  const donDep = () => {
    clearInterval(nhip);
    luong.getTracks().forEach((t) => t.stop());
  };

  // Gán `onstop` NGAY, không gán lúc dừng: khi người dùng tắt chia sẻ thì trình duyệt tự
  // dừng máy ghi, 'stop' bắn ra trước khi mình kịp gán — gán muộn là mất tệp và treo chờ.
  may.onstop = () => {
    donDep();
    giaiQuyet(new Blob(manh, { type: mime || 'video/webm' }));
  };

  function dungThat() {
    if (may.state === 'inactive') return;
    may.stop();
  }

  // Người dùng bấm "Dừng chia sẻ" trên thanh của trình duyệt.
  luong.getVideoTracks()[0]?.addEventListener('ended', () => { onTuDung?.(); dungThat(); });

  return {
    dung: () => { dungThat(); return xong; },
    huy: () => { donDep(); if (may.state !== 'inactive') may.stop(); },
    kieu: mime || 'video/webm',
  };
}

/** 83 → "1:23" */
export function doiGiay(n) {
  const p = Math.floor(n / 60);
  const g = n % 60;
  return `${p}:${String(g).padStart(2, '0')}`;
}
