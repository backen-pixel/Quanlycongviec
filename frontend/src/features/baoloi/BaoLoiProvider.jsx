/**
 * Nối menu chuột phải với hộp nhập — gắn MỘT lần ở App là cả app có lối báo lỗi.
 *
 * Ba mục của menu đi ba đường khác nhau nhưng cùng về một hộp:
 *   mô tả  → mở hộp luôn
 *   chụp   → chụp màn hình, khoanh vùng, rồi mở hộp kèm ảnh   (chưa làm)
 *   quay   → quay màn hình, rồi mở hộp kèm video               (chưa làm)
 *
 * Hai mục sau hiện báo «đang làm» thay vì im lặng — bấm vào mà không có gì xảy ra thì người
 * dùng tưởng app hỏng, và lần sau không bấm nữa.
 */
import { useCallback, useState } from 'react';
import MenuChuotPhaiBaoLoi from './MenuChuotPhaiBaoLoi';
import HopBaoLoi from './HopBaoLoi';

export default function BaoLoiProvider({ batDau = true }) {
  const [hop, setHop] = useState(null);
  const [nhac, setNhac] = useState('');

  const moTuMenu = useCallback(({ kieu, thanh_phan: tp }) => {
    if (kieu === 'mo_ta') { setHop({ thanhPhan: tp }); return; }
    // Chụp/quay chưa có — nói thẳng, và vẫn cho báo lỗi bằng chữ.
    setNhac(kieu === 'chup' ? 'Chụp màn hình đang được làm — tạm thời mô tả bằng chữ nhé.'
      : 'Quay màn hình đang được làm — tạm thời mô tả bằng chữ nhé.');
    setTimeout(() => setNhac(''), 3500);
    setHop({ thanhPhan: tp });
  }, []);

  return (
    <>
      <MenuChuotPhaiBaoLoi batDau={batDau} onBaoLoi={moTuMenu} />
      <HopBaoLoi
        mo={!!hop}
        thanhPhan={hop?.thanhPhan}
        onDong={() => setHop(null)}
      />
      {nhac ? (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 px-3 py-2 rounded-lg bg-slate-900 text-white text-[12px] shadow-xl"
          style={{ zIndex: 99996 }}
        >
          {nhac}
        </div>
      ) : null}
    </>
  );
}
