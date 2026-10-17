/**
 * Chụp màn hình → khoanh vùng lỗi bằng bút, mũi tên, khung.
 *
 * Trình duyệt KHÔNG cho chụp ngầm: `getDisplayMedia` luôn bật hộp chọn cửa sổ của hệ điều
 * hành, người dùng phải tự chọn và tự bấm Chia sẻ. Không lách được, và cũng không nên —
 * đó là thứ ngăn một trang web chụp lén màn hình người khác.
 *
 * Mặc định xin đúng TAB HIỆN TẠI (`preferCurrentTab`). Người dùng vẫn đổi được sang toàn
 * màn hình, nhưng mặc định hẹp thì bớt nguy cơ gửi nhầm cửa sổ Zalo riêng hay bảng lương
 * đang mở bên cạnh vào một báo lỗi mà cả phòng đọc được.
 */
import { useEffect, useRef, useState } from 'react';
import { Pencil, Square, ArrowUpRight, Undo2, X, Check, Loader2 } from 'lucide-react';

const MAU = '#ef4444';
const DAY = 3;

const CONG_CU = [
  { id: 'but', icon: Pencil, nhan: 'Bút' },
  { id: 'khung', icon: Square, nhan: 'Khung' },
  { id: 'mui_ten', icon: ArrowUpRight, nhan: 'Mũi tên' },
];

/** Chụp một khung hình từ luồng màn hình rồi tắt luồng ngay. */
export async function chupMotKhung() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Trình duyệt này không chụp được màn hình. Dùng Chrome hoặc Edge trên máy tính.');
  }
  const luong = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'browser' },
    audio: false,
    preferCurrentTab: true,
  });
  try {
    const track = luong.getVideoTracks()[0];
    const video = document.createElement('video');
    video.srcObject = luong;
    video.muted = true;
    await video.play();
    // Chờ một khung hình thật: play() trả về trước khi có pixel, chụp ngay ra ảnh đen.
    await new Promise((ok) => { video.requestVideoFrameCallback ? video.requestVideoFrameCallback(() => ok()) : setTimeout(ok, 300); });

    const { width, height } = track.getSettings();
    const canvas = document.createElement('canvas');
    canvas.width = width || video.videoWidth;
    canvas.height = height || video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    luong.getTracks().forEach((t) => t.stop());
  }
}

export default function ChupManHinh({ anh, onXong, onHuy, dangGui = false }) {
  const canvasRef = useRef(null);
  const anhRef = useRef(null);
  const [congCu, setCongCu] = useState('khung');
  const [net, setNet] = useState([]);          // các nét đã vẽ xong
  const [dangVe, setDangVe] = useState(null);  // nét đang kéo

  // Vẽ lại toàn bộ mỗi khi nét đổi — đơn giản hơn vẽ chồng, và undo chỉ là bỏ phần tử cuối.
  useEffect(() => {
    const c = canvasRef.current;
    const img = anhRef.current;
    if (!c || !img?.complete) return;
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.strokeStyle = MAU;
    g.fillStyle = MAU;
    g.lineWidth = DAY * (c.width / (img.clientWidth || c.width));
    g.lineCap = 'round';
    g.lineJoin = 'round';

    const veMot = (n) => {
      if (n.loai === 'but') {
        g.beginPath();
        n.diem.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
        g.stroke();
      } else if (n.loai === 'khung') {
        g.strokeRect(n.x1, n.y1, n.x2 - n.x1, n.y2 - n.y1);
      } else if (n.loai === 'mui_ten') {
        g.beginPath(); g.moveTo(n.x1, n.y1); g.lineTo(n.x2, n.y2); g.stroke();
        const goc = Math.atan2(n.y2 - n.y1, n.x2 - n.x1);
        const d = Math.max(14, g.lineWidth * 5);
        g.beginPath();
        g.moveTo(n.x2, n.y2);
        g.lineTo(n.x2 - d * Math.cos(goc - Math.PI / 6), n.y2 - d * Math.sin(goc - Math.PI / 6));
        g.lineTo(n.x2 - d * Math.cos(goc + Math.PI / 6), n.y2 - d * Math.sin(goc + Math.PI / 6));
        g.closePath(); g.fill();
      }
    };
    net.forEach(veMot);
    if (dangVe) veMot(dangVe);
  }, [anh, net, dangVe]);

  /** Toạ độ chuột → toạ độ ảnh gốc (ảnh hiển thị bị thu nhỏ cho vừa màn hình). */
  const toaDo = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (c.width / r.width),
      y: (e.clientY - r.top) * (c.height / r.height),
    };
  };

  const batDau = (e) => {
    const p = toaDo(e);
    setDangVe(congCu === 'but'
      ? { loai: 'but', diem: [p] }
      : { loai: congCu, x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  };
  const keo = (e) => {
    if (!dangVe) return;
    const p = toaDo(e);
    setDangVe(dangVe.loai === 'but'
      ? { ...dangVe, diem: [...dangVe.diem, p] }
      : { ...dangVe, x2: p.x, y2: p.y });
  };
  const thaTay = () => {
    if (!dangVe) return;
    // Bỏ cú bấm lỡ tay: khung/mũi tên 2px không phải chủ ý của ai.
    const nho = dangVe.loai !== 'but'
      && Math.abs(dangVe.x2 - dangVe.x1) < 5 && Math.abs(dangVe.y2 - dangVe.y1) < 5;
    if (!nho) setNet([...net, dangVe]);
    setDangVe(null);
  };

  const xong = () => {
    canvasRef.current?.toBlob((blob) => onXong?.(blob), 'image/png');
  };

  return (
    <div className="fixed inset-0 flex flex-col" style={{ zIndex: 99997, background: 'rgba(15,23,42,.8)' }}>
      <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-slate-200">
        <p className="text-sm font-bold text-slate-800 mr-2">Khoanh vùng lỗi</p>
        {CONG_CU.map((c) => (
          <button
            key={c.id} type="button" onClick={() => setCongCu(c.id)}
            title={c.nhan}
            className={`h-8 px-2.5 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer border ${
              congCu === c.id ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <c.icon className="h-3.5 w-3.5" /> {c.nhan}
          </button>
        ))}
        <button
          type="button" onClick={() => setNet(net.slice(0, -1))} disabled={!net.length}
          className="h-8 px-2.5 rounded-lg text-[12px] font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Undo2 className="h-3.5 w-3.5" /> Hoàn tác
        </button>

        <span className="flex-1" />
        <button
          type="button" onClick={onHuy}
          className="h-8 px-3 rounded-lg text-[12px] font-semibold text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1.5 cursor-pointer"
        >
          <X className="h-3.5 w-3.5" /> Huỷ
        </button>
        <button
          type="button" onClick={xong} disabled={dangGui}
          className="h-8 px-4 rounded-lg text-[12px] font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60 inline-flex items-center gap-1.5 cursor-pointer"
        >
          {dangGui ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang gửi…</>
            : <><Check className="h-3.5 w-3.5" /> Dùng ảnh này</>}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4 flex items-start justify-center">
        <img ref={anhRef} src={anh} alt="" className="hidden" onLoad={() => setNet([])} />
        <canvas
          ref={canvasRef}
          onMouseDown={batDau} onMouseMove={keo} onMouseUp={thaTay} onMouseLeave={thaTay}
          className="max-w-full h-auto rounded-lg shadow-2xl cursor-crosshair bg-white"
        />
      </div>

      <p className="px-4 py-1.5 text-[11px] text-white/70 bg-black/30 text-center">
        Kéo chuột để khoanh vùng bị lỗi · ảnh sẽ gửi kèm báo lỗi
      </p>
    </div>
  );
}
