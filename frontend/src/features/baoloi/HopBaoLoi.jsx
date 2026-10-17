/**
 * Hộp nhập báo lỗi — mở ra từ menu chuột phải, đã kèm sẵn thành phần bị lỗi.
 *
 * Giữ THẬT NGẮN: người đang gặp lỗi là người đang bực. Bắt họ điền 8 ô thì họ bỏ, quay lại
 * chụp màn hình gửi Zalo như cũ. Bắt buộc đúng MỘT ô (tiêu đề); loại lỗi đã chọn sẵn, dấu vết
 * kỹ thuật máy tự ghi.
 *
 * Ảnh/video/tệp do BaoLoiProvider giữ chứ không giữ ở đây: chụp và quay phải chạy khi hộp
 * đang ẨN (nếu không thì thứ chụp được lại chính là cái hộp này), nên chủ sở hữu danh sách
 * tệp phải sống lâu hơn hộp. Hộp chỉ hiển thị và gọi lên.
 */
import { useEffect, useRef, useState } from 'react';
import { Bug, X, Loader2, Check, Camera, Video, Paperclip, FileText } from 'lucide-react';
import api from '../../lib/api';
import { guiTepBaoLoi, coTep, LOAI_TEP_NHAN } from './guiTepBaoLoi';

const MUC_DO = [
  { id: 'low', nhan: 'Nhẹ', mau: '#94A3B8' },
  { id: 'medium', nhan: 'Vừa', mau: '#F59E0B' },
  { id: 'high', nhan: 'Nặng', mau: '#F97316' },
  { id: 'critical', nhan: 'Chặn việc', mau: '#EF4444' },
];

export default function HopBaoLoi({
  mo, thanhPhan, onDong, onXong,
  an = false,
  tep = [], onThemTep, onXoaTep,
  onChup, onQuay,
}) {
  const [tieuDe, setTieuDe] = useState('');
  const [chiTiet, setChiTiet] = useState('');
  const [mucDo, setMucDo] = useState('medium');
  const [han, setHan] = useState('');   // hạn mong muốn, không bắt buộc
  const [loaiId, setLoaiId] = useState('');
  const [dsLoai, setDsLoai] = useState([]);
  const [dangGui, setDangGui] = useState(false);
  const [buoc, setBuoc] = useState('');     // câu hiện trên nút khi gửi nhiều bước
  const [xong, setXong] = useState(false);
  const [loi, setLoi] = useState('');
  const oRef = useRef(null);
  const oTepRef = useRef(null);

  useEffect(() => {
    if (!mo) return;
    setTieuDe(''); setChiTiet(''); setMucDo('medium'); setHan(''); setXong(false); setLoi(''); setBuoc('');
    setTimeout(() => oRef.current?.focus(), 80);
    api.get('/crm/error-types')
      .then(({ data }) => {
        // Route trả `{ error_types: [...] }` — không phải mảng trần, cũng không phải `data`.
        const tho = Array.isArray(data) ? data : (data?.error_types || data?.data || []);
        const ds = tho.filter((x) => ['loi_van_hanh', 'loi_he_thong'].includes(x.source_kind));
        setDsLoai(ds);
        // Chọn sẵn «Lỗi hệ thống» khi báo từ menu chuột phải: người dùng chuột phải vào một
        // thành phần giao diện thì gần như luôn là phần mềm hỏng, không phải sai quy trình.
        const mac = ds.find((x) => x.source_kind === 'loi_he_thong') || ds[0];
        if (mac) setLoaiId(mac.id);
      })
      .catch(() => setDsLoai([]));
  }, [mo]);

  if (!mo) return null;

  const gui = async () => {
    const t = tieuDe.trim();
    if (!t) { setLoi('Cần một dòng tiêu đề cho lỗi.'); oRef.current?.focus(); return; }
    setDangGui(true); setLoi(''); setBuoc('Đang gửi…');
    let daTao = null;
    try {
      const { data } = await api.post('/bao-loi', {
        title: t,
        description: chiTiet.trim(),
        severity: mucDo,
        error_type_id: loaiId || null,
        deadline: han ? new Date(han).toISOString() : null,
        thanh_phan: thanhPhan || null,
      });
      daTao = data;

      // Tệp đi sau vì cần id của lỗi. Hỏng ở bước này KHÔNG phải hỏng cả báo lỗi — nói rõ
      // «đã ghi lỗi, chưa gắn được tệp», đừng để người dùng tưởng ảnh đã tới nơi.
      if (tep.length) {
        setBuoc(`Đang gửi ${tep.length} tệp…`);
        const kq = await guiTepBaoLoi(data.id, tep.map((x) => x.file));
        if (kq.hong) setLoi(`Đã ghi lỗi, nhưng ${kq.hong} tệp không gửi được.`);
      }

      setXong(true);
      onXong?.(data);
      setTimeout(() => { setXong(false); onDong?.(); }, 1400);
    } catch (e) {
      const tn = e?.response?.data?.error || e.message || 'Không gửi được.';
      setLoi(daTao ? `Đã ghi lỗi, nhưng không gửi được tệp: ${tn}` : tn);
      if (daTao) { setXong(true); onXong?.(daTao); }
    } finally {
      setDangGui(false); setBuoc('');
    }
  };

  const phim = (e) => {
    if (e.key === 'Escape') onDong?.();
    // Ctrl/Cmd + Enter gửi — tay đang ở ô chi tiết thì không phải với chuột.
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') gui();
  };

  const chonTep = (e) => {
    Array.from(e.target.files || []).slice(0, 10).forEach((f) => onThemTep?.(f));
    e.target.value = '';
  };

  const NutKem = ({ icon: Icon, chu, onClick }) => (
    <button
      type="button" onClick={onClick} disabled={dangGui || xong}
      className="h-8 px-2.5 rounded-lg text-[12px] font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-rose-300 hover:text-rose-600 disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
    >
      <Icon className="h-3.5 w-3.5" /> {chu}
    </button>
  );

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 99995, background: 'rgba(15,23,42,.45)', display: an ? 'none' : undefined }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onDong?.(); }}
    >
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden" onKeyDown={phim}>
        <div className="flex items-center gap-2 px-4 py-3 bg-rose-50 border-b border-rose-100 shrink-0">
          <Bug className="h-4 w-4 text-rose-600 shrink-0" />
          <h2 className="flex-1 text-sm font-bold text-rose-900">Báo lỗi</h2>
          <button
            type="button" onClick={onDong}
            className="h-7 w-7 rounded-lg hover:bg-rose-100 inline-flex items-center justify-center text-rose-500 cursor-pointer"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {thanhPhan ? (
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 shrink-0">
            <p className="text-[11px] text-slate-500">Thành phần bị lỗi</p>
            <p className="text-[12px] font-semibold text-slate-800 truncate">
              {thanhPhan.khu_vuc ? `${thanhPhan.khu_vuc} · ` : ''}
              {thanhPhan.chu || `<${thanhPhan.the}>`}
            </p>
            <p className="text-[11px] text-slate-400 truncate">{thanhPhan.trang?.url}</p>
          </div>
        ) : null}

        <div className="p-4 space-y-3 overflow-y-auto">
          <div>
            <label htmlFor="bao-loi-tieu-de" className="block text-[12px] font-semibold text-slate-700 mb-1">
              Chuyện gì xảy ra? <span className="text-rose-500">*</span>
            </label>
            <input
              id="bao-loi-tieu-de" ref={oRef} value={tieuDe}
              onChange={(e) => setTieuDe(e.target.value)}
              placeholder="VD: Bấm Lưu không thấy gì xảy ra"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-rose-200 focus:border-rose-400 outline-none"
            />
          </div>

          <div>
            <label htmlFor="bao-loi-chi-tiet" className="block text-[12px] font-semibold text-slate-700 mb-1">
              Chi tiết thêm
            </label>
            <textarea
              id="bao-loi-chi-tiet" value={chiTiet} rows={3}
              onChange={(e) => setChiTiet(e.target.value)}
              placeholder="Bạn đang làm gì trước khi gặp lỗi? Đã thử lại chưa?"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-rose-200 focus:border-rose-400 outline-none resize-none"
            />
          </div>

          {/* Ảnh/video nói hộ cả đoạn mô tả — để ngay dưới ô chữ, không giấu sau nút nào. */}
          <div>
            <p className="text-[12px] font-semibold text-slate-700 mb-1.5">Hình ảnh / video</p>
            <div className="flex flex-wrap gap-1.5">
              <NutKem icon={Camera} chu="Chụp màn hình" onClick={onChup} />
              <NutKem icon={Video} chu="Quay màn hình" onClick={onQuay} />
              <NutKem icon={Paperclip} chu="Đính kèm tệp" onClick={() => oTepRef.current?.click()} />
              <input
                ref={oTepRef} type="file" multiple accept={LOAI_TEP_NHAN}
                className="hidden" onChange={chonTep}
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Chụp/quay mặc định chỉ lấy tab này; hộp báo lỗi tự ẩn trong lúc chụp.
            </p>

            {tep.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {tep.map((x) => (
                  <div
                    key={x.id}
                    className="relative w-24 rounded-lg border border-slate-200 overflow-hidden bg-slate-50"
                    title={`${x.file.name} · ${coTep(x.file.size)}`}
                  >
                    {x.kieu === 'anh' ? (
                      <img src={x.xem} alt="" className="h-16 w-full object-cover" />
                    ) : x.kieu === 'video' ? (
                      <video src={x.xem} className="h-16 w-full object-cover bg-black" muted />
                    ) : (
                      <div className="h-16 w-full flex items-center justify-center text-slate-400">
                        <FileText className="h-6 w-6" />
                      </div>
                    )}
                    <p className="px-1 py-0.5 text-[10px] text-slate-500 truncate">{coTep(x.file.size)}</p>
                    <button
                      type="button" onClick={() => onXoaTep?.(x.id)} aria-label="Bỏ tệp"
                      className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-slate-900/70 text-white inline-flex items-center justify-center hover:bg-rose-600 cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-slate-700 mb-1">Loại lỗi</p>
              <select
                value={loaiId} onChange={(e) => setLoaiId(e.target.value)}
                className="w-full px-2 py-1.5 text-[13px] border border-slate-200 rounded-lg bg-white outline-none focus:border-rose-400"
              >
                {dsLoai.length ? dsLoai.map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                )) : <option value="">(chưa có loại lỗi)</option>}
              </select>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-slate-700 mb-1">Mức độ</p>
              <div className="flex gap-1">
                {MUC_DO.map((m) => (
                  <button
                    key={m.id} type="button" onClick={() => setMucDo(m.id)}
                    className={`flex-1 px-1 py-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer transition ${
                      mucDo === m.id ? 'text-white' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                    }`}
                    style={mucDo === m.id ? { backgroundColor: m.mau, borderColor: m.mau } : undefined}
                  >
                    {m.nhan}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="bao-loi-han" className="block text-[12px] font-semibold text-slate-700 mb-1">
              Cần xong trước <span className="font-normal text-slate-400">— không bắt buộc</span>
            </label>
            <input
              id="bao-loi-han" type="datetime-local" value={han}
              onChange={(e) => setHan(e.target.value)}
              className="w-full sm:max-w-[14rem] px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-rose-400"
            />
            {/* Để trống thì lỗi nằm rổ «chưa có hạn» ở trang Quản lý lỗi — vẫn thấy, chỉ là không giục. */}
          </div>

          {loi ? <p className="text-[12px] text-rose-600 font-medium">{loi}</p> : null}
        </div>

        <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-t border-slate-100 shrink-0">
          <p className="flex-1 text-[11px] text-slate-400">Ctrl + Enter để gửi nhanh</p>
          <button
            type="button" onClick={onDong}
            className="px-3 py-1.5 text-[13px] font-semibold text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            Huỷ
          </button>
          <button
            type="button" onClick={gui} disabled={dangGui || xong}
            className="px-4 py-1.5 text-[13px] font-bold text-white bg-rose-600 rounded-lg hover:bg-rose-700 disabled:opacity-60 cursor-pointer inline-flex items-center gap-1.5"
          >
            {xong ? <><Check className="h-3.5 w-3.5" /> Đã gửi</>
              : dangGui ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {buoc || 'Đang gửi…'}</>
                : 'Gửi báo lỗi'}
          </button>
        </div>
      </div>
    </div>
  );
}
