/**
 * Chuột phải ở bất kỳ đâu → menu báo lỗi, đã CHỈ SẴN vào thành phần dưới con trỏ.
 *
 * Vì sao chặn menu trình duyệt: người dùng gặp lỗi thì phản xạ là chụp màn hình rồi nhắn Zalo
 * — lỗi đến nơi dưới dạng ảnh không rõ trang nào, nút nào. Đặt lối báo lỗi ngay dưới ngón tay
 * ở đúng chỗ đang hỏng thì mới có dữ liệu để sửa.
 *
 * GIỮ SHIFT + chuột phải = menu gốc của trình duyệt. Phải chừa lối này: người ta còn cần
 * copy/paste, mở tab mới, kiểm tra phần tử — chặn sạch là lấy đi công cụ của chính mình.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bug, Camera, Video, X } from 'lucide-react';
import { batThanhPhan } from '../../lib/batThanhPhanLoi';

const RONG = 208;

export default function MenuChuotPhaiBaoLoi({ onBaoLoi, batDau = true }) {
  const [menu, setMenu] = useState(null);
  const hopRef = useRef(null);

  const dong = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!batDau) return undefined;

    const moMenu = (e) => {
      // Shift = nhường cho trình duyệt.
      if (e.shiftKey) return;
      // Trong ô nhập thì menu gốc có copy/paste/chọn tất cả — đừng cướp.
      const t = e.target;
      if (t?.closest?.('input, textarea, [contenteditable="true"]')) return;

      const tp = batThanhPhan(t);
      if (!tp) return;

      e.preventDefault();
      // Ghim menu trong màn hình: bấm sát mép phải/đáy thì menu tràn ra ngoài.
      const x = Math.min(e.clientX, window.innerWidth - RONG - 8);
      const y = Math.min(e.clientY, window.innerHeight - 150);
      setMenu({ x: Math.max(8, x), y: Math.max(8, y), tp });
    };

    const bamNgoai = (e) => {
      if (hopRef.current && !hopRef.current.contains(e.target)) dong();
    };
    const phim = (e) => { if (e.key === 'Escape') dong(); };

    document.addEventListener('contextmenu', moMenu);
    document.addEventListener('mousedown', bamNgoai);
    document.addEventListener('keydown', phim);
    window.addEventListener('scroll', dong, true);
    window.addEventListener('resize', dong);
    return () => {
      document.removeEventListener('contextmenu', moMenu);
      document.removeEventListener('mousedown', bamNgoai);
      document.removeEventListener('keydown', phim);
      window.removeEventListener('scroll', dong, true);
      window.removeEventListener('resize', dong);
    };
  }, [batDau, dong]);

  /**
   * Khoanh sáng thành phần ngay khi menu mở — người dùng thấy mình đang báo lỗi ĐÚNG CHỖ NÀO
   * trước khi bấm. Không có bước này thì rất dễ chỉ nhầm vào thẻ cha bao ngoài.
   */
  useEffect(() => {
    if (!menu) return undefined;
    const { vi_tri: v } = menu.tp;
    const khung = document.createElement('div');
    khung.style.cssText = [
      'position:fixed', `top:${v.y - 2}px`, `left:${v.x - 2}px`,
      `width:${v.w + 4}px`, `height:${v.h + 4}px`,
      'border:2px dashed #f43f5e', 'border-radius:6px',
      'background:rgba(244,63,94,.07)', 'pointer-events:none', 'z-index:99991',
    ].join(';');
    document.body.appendChild(khung);
    return () => khung.remove();
  }, [menu]);

  if (!menu) return null;

  const chon = (kieu) => {
    const tp = menu.tp;
    dong();
    onBaoLoi?.({ kieu, thanh_phan: tp });
  };

  const Muc = ({ icon: Icon, chu, phu, kieu }) => (
    <button
      type="button"
      onClick={() => chon(kieu)}
      className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-rose-50 cursor-pointer"
    >
      <Icon className="h-4 w-4 mt-0.5 shrink-0 text-rose-600" />
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-slate-800 leading-tight">{chu}</span>
        {phu ? <span className="block text-[11px] text-slate-500 leading-tight mt-0.5">{phu}</span> : null}
      </span>
    </button>
  );

  return (
    <div
      ref={hopRef}
      style={{ top: menu.y, left: menu.x, width: RONG, zIndex: 99992 }}
      className="fixed rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
    >
      <div className="flex items-start gap-2 px-3 py-2 bg-rose-50/70 border-b border-rose-100">
        <Bug className="h-3.5 w-3.5 mt-0.5 shrink-0 text-rose-600" />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold text-rose-900 uppercase tracking-wide">Báo lỗi tại đây</span>
          <span className="block text-[11px] text-rose-700/80 truncate" title={menu.tp.chu || menu.tp.the}>
            {menu.tp.khu_vuc ? `${menu.tp.khu_vuc} · ` : ''}{menu.tp.chu || `<${menu.tp.the}>`}
          </span>
        </span>
        <button
          type="button"
          onClick={dong}
          className="h-5 w-5 shrink-0 rounded hover:bg-rose-100 inline-flex items-center justify-center text-rose-500 cursor-pointer"
          aria-label="Đóng"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <Muc icon={Bug} chu="Mô tả lỗi" phu="Nhập tiêu đề và chi tiết" kieu="mo_ta" />
      <Muc icon={Camera} chu="Chụp màn hình" phu="Khoanh vùng lỗi trên ảnh" kieu="chup" />
      <Muc icon={Video} chu="Quay màn hình" phu="Tối đa 60 giây" kieu="quay" />

      <p className="px-3 py-1.5 text-[10px] text-slate-400 border-t border-slate-100 bg-slate-50/60">
        Shift + chuột phải = menu trình duyệt
      </p>
    </div>
  );
}
