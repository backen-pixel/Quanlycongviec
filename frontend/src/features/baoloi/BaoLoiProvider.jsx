/**
 * Nối menu chuột phải với hộp nhập — gắn MỘT lần ở App là cả app có lối báo lỗi.
 *
 * Ba mục của menu đi ba đường khác nhau nhưng cùng về một hộp:
 *   mô tả  → mở hộp luôn
 *   chụp   → chụp màn hình → khoanh vùng → mở hộp kèm ảnh
 *   quay   → quay màn hình (≤60s) → mở hộp kèm video
 *
 * VÌ SAO DANH SÁCH TỆP NẰM Ở ĐÂY, KHÔNG NẰM TRONG HỘP: lúc chụp/quay thì hộp phải biến mất,
 * nếu không ảnh chụp được lại chính là cái hộp đang che chỗ hỏng. Hộp bị ẩn (display:none)
 * chứ không bị gỡ — gỡ là mất chữ người dùng vừa gõ — nhưng tệp vẫn phải do thứ ở ngoài giữ,
 * vì với đường «chụp trước, mở hộp sau» thì lúc có ảnh hộp còn chưa tồn tại.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import MenuChuotPhaiBaoLoi from './MenuChuotPhaiBaoLoi';
import HopBaoLoi from './HopBaoLoi';
import ChupManHinh, { chupMotKhung } from './ChupManHinh';
import ThanhQuay from './ThanhQuay';
import { batDauQuay, quayDuocKhong } from './quayManHinh';
import { tenAnhLoi, tenVideoLoi } from './guiTepBaoLoi';

/** Lỗi của getDisplayMedia nói bằng tiếng máy — dịch sang câu người dùng hiểu được. */
function cauLoi(e) {
  const ten = e?.name || '';
  if (ten === 'NotAllowedError') return 'Bạn đã bỏ qua hộp chia sẻ màn hình — chưa chụp/quay được.';
  if (ten === 'NotFoundError' || ten === 'NotReadableError') {
    return 'Không lấy được hình màn hình. Thử lại, hoặc đính kèm ảnh chụp sẵn.';
  }
  return e?.message || 'Không chụp/quay được màn hình.';
}

/** Chờ trình duyệt vẽ xong lần ẩn hộp rồi mới xin luồng — không thì hộp lọt vào ảnh. */
function choVeXong() {
  return new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
}

export default function BaoLoiProvider({ batDau = true }) {
  const [hop, setHop] = useState(null);      // { thanhPhan } — hộp đang mở
  const [tep, setTep] = useState([]);        // [{ id, file, kieu, xem }]
  const [anhVe, setAnhVe] = useState(null);  // ảnh vừa chụp, đang khoanh vùng
  const [giayQuay, setGiayQuay] = useState(null); // số giây đã quay; null = không quay
  const [an, setAn] = useState(false);       // tạm ẩn hộp trong lúc chụp/quay
  const [nhac, setNhac] = useState('');

  const dieuKhienRef = useRef(null);  // bộ điều khiển của phiên quay
  const tpChoRef = useRef(null);      // thành phần bị lỗi, giữ hộ trong lúc chụp/quay
  const tepRef = useRef(tep);
  tepRef.current = tep;

  const baoNhac = useCallback((chu) => {
    setNhac(chu);
    setTimeout(() => setNhac(''), 4000);
  }, []);

  const demRef = useRef(0);  // id tệp phải duy nhất kể cả khi xoá rồi thêm lại đúng tệp đó

  const themTep = useCallback((file, kieu) => {
    demRef.current += 1;
    const id = `tep-${demRef.current}`;
    setTep((ds) => [...ds, {
      id,
      file,
      kieu: kieu || (file.type.startsWith('image/') ? 'anh' : file.type.startsWith('video/') ? 'video' : 'tep'),
      xem: URL.createObjectURL(file),
    }]);
  }, []);

  const xoaTep = useCallback((id) => {
    setTep((ds) => {
      const bo = ds.find((x) => x.id === id);
      if (bo?.xem) URL.revokeObjectURL(bo.xem);
      return ds.filter((x) => x.id !== id);
    });
  }, []);

  /** Mở hộp (nếu chưa mở) với thành phần đang giữ. */
  const moHop = useCallback(() => {
    setHop((h) => h || { thanhPhan: tpChoRef.current });
  }, []);

  const dongTatCa = useCallback(() => {
    tepRef.current.forEach((x) => { if (x.xem) URL.revokeObjectURL(x.xem); });
    setTep([]);
    setHop(null);
    setAn(false);
    tpChoRef.current = null;
  }, []);

  // ── CHỤP ───────────────────────────────────────────────────────────────────
  const chup = useCallback(async (tp) => {
    if (tp) tpChoRef.current = tp;
    setAn(true);
    await choVeXong();
    try {
      setAnhVe(await chupMotKhung());
    } catch (e) {
      baoNhac(cauLoi(e));
      setAn(false);
      moHop();  // vẫn cho báo lỗi bằng chữ — đừng để người dùng tay trắng
    }
  }, [baoNhac, moHop]);

  const xongVe = useCallback((blob) => {
    if (blob?.size) themTep(new File([blob], tenAnhLoi(), { type: 'image/png' }), 'anh');
    setAnhVe(null);
    setAn(false);
    moHop();
  }, [themTep, moHop]);

  // ── QUAY ───────────────────────────────────────────────────────────────────
  /**
   * Kết thúc phiên quay và lấy tệp. Gọi được từ ba chỗ: nút Dừng, chạm trần 60 giây, và
   * người dùng bấm «Dừng chia sẻ» trên thanh của trình duyệt — nên phải chịu được gọi hai
   * lần (lấy ref ra rồi xoá ngay).
   */
  const dungQuay = useCallback(async () => {
    const dk = dieuKhienRef.current;
    if (!dk) return;
    dieuKhienRef.current = null;
    let blob = null;
    try { blob = await dk.dung(); } catch { /* luồng đã chết — coi như không có tệp */ }
    setGiayQuay(null);
    if (blob?.size) themTep(new File([blob], tenVideoLoi(dk.kieu), { type: blob.type }), 'video');
    else baoNhac('Không thu được video — thử chụp ảnh màn hình thay thế.');
    setAn(false);
    moHop();
  }, [themTep, moHop, baoNhac]);

  const huyQuay = useCallback(() => {
    const dk = dieuKhienRef.current;
    dieuKhienRef.current = null;
    dk?.huy?.();
    setGiayQuay(null);
    setAn(false);
    moHop();
  }, [moHop]);

  const dungQuayRef = useRef(dungQuay);
  dungQuayRef.current = dungQuay;

  const quay = useCallback(async (tp) => {
    if (tp) tpChoRef.current = tp;
    if (dieuKhienRef.current) return;  // đang quay rồi
    const kiem = quayDuocKhong();
    if (!kiem.duoc) { baoNhac(kiem.vi_sao); moHop(); return; }

    setAn(true);
    await choVeXong();
    try {
      const dk = await batDauQuay({
        onGiay: (g) => setGiayQuay(g),
        // Chạm trần 60s, hoặc người dùng bấm «Dừng chia sẻ» — cùng một lối ra.
        onTuDung: () => { dungQuayRef.current(); },
      });
      dieuKhienRef.current = dk;
      setGiayQuay(0);
    } catch (e) {
      baoNhac(cauLoi(e));
      setAn(false);
      moHop();
    }
  }, [baoNhac, moHop]);

  // ── MENU ───────────────────────────────────────────────────────────────────
  const moTuMenu = useCallback(({ kieu, thanh_phan: tp }) => {
    tpChoRef.current = tp;
    if (kieu === 'chup') { chup(tp); return; }
    if (kieu === 'quay') { quay(tp); return; }
    setHop({ thanhPhan: tp });
  }, [chup, quay]);

  // Rời trang giữa chừng mà còn đang quay thì luồng màn hình vẫn sống — chấm đỏ của trình
  // duyệt sáng mãi. Dọn khi gỡ.
  useEffect(() => () => {
    dieuKhienRef.current?.huy?.();
    tepRef.current.forEach((x) => { if (x.xem) URL.revokeObjectURL(x.xem); });
  }, []);

  return (
    <>
      <MenuChuotPhaiBaoLoi batDau={batDau && !anhVe && giayQuay === null} onBaoLoi={moTuMenu} />

      <HopBaoLoi
        mo={!!hop}
        an={an}
        thanhPhan={hop?.thanhPhan}
        tep={tep}
        onThemTep={(f) => themTep(f)}
        onXoaTep={xoaTep}
        onChup={() => chup()}
        onQuay={() => quay()}
        onDong={dongTatCa}
      />

      {anhVe ? (
        <ChupManHinh
          anh={anhVe}
          onXong={xongVe}
          onHuy={() => { setAnhVe(null); setAn(false); moHop(); }}
        />
      ) : null}

      {giayQuay !== null ? (
        <ThanhQuay giay={giayQuay} onDung={dungQuay} onHuy={huyQuay} />
      ) : null}

      {nhac ? (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 px-3 py-2 rounded-lg bg-slate-900 text-white text-[12px] shadow-xl max-w-sm text-center"
          style={{ zIndex: 99996 }}
        >
          {nhac}
        </div>
      ) : null}
    </>
  );
}
