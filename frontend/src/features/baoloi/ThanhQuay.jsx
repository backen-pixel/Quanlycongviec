/**
 * Thanh nổi trong lúc quay màn hình — đồng hồ, nút Dừng, nút Huỷ.
 *
 * Nằm GÓC DƯỚI TRÁI và cố tình nhỏ: nó bị quay vào video, nên phải che ít giao diện nhất
 * có thể. Vẫn phải có, vì người đang quay cần thấy đã quay bao lâu và còn bao lâu nữa thì
 * tự dừng — bị cắt giữa chừng mà không báo trước là mất công quay lại từ đầu.
 */
import { Square, X } from 'lucide-react';
import { GIAY_TOI_DA, doiGiay } from './quayManHinh';

export default function ThanhQuay({ giay = 0, onDung, onHuy }) {
  const conLai = Math.max(0, GIAY_TOI_DA - giay);

  return (
    <div
      className="fixed bottom-4 left-4 flex items-center gap-2 px-3 py-2 rounded-full bg-slate-900/95 shadow-2xl"
      style={{ zIndex: 99998 }}
    >
      <span className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
      <span className="text-[13px] font-bold text-white tabular-nums">{doiGiay(giay)}</span>
      <span className="text-[11px] text-white/50">còn {conLai}s</span>
      <button
        type="button" onClick={onDung}
        className="ml-1 h-7 px-2.5 rounded-full text-[12px] font-bold text-white bg-rose-600 hover:bg-rose-700 inline-flex items-center gap-1 cursor-pointer"
      >
        <Square className="h-3 w-3 fill-current" /> Dừng
      </button>
      <button
        type="button" onClick={onHuy} aria-label="Huỷ quay"
        className="h-7 w-7 rounded-full text-white/60 hover:text-white hover:bg-white/10 inline-flex items-center justify-center cursor-pointer"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
