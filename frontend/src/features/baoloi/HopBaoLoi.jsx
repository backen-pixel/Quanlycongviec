/**
 * Hộp nhập báo lỗi — mở ra từ menu chuột phải, đã kèm sẵn thành phần bị lỗi.
 *
 * Giữ THẬT NGẮN: người đang gặp lỗi là người đang bực. Bắt họ điền 8 ô thì họ bỏ, quay lại
 * chụp màn hình gửi Zalo như cũ. Bắt buộc đúng MỘT ô (tiêu đề); loại lỗi đã chọn sẵn, dấu vết
 * kỹ thuật máy tự ghi.
 */
import { useEffect, useRef, useState } from 'react';
import { Bug, X, Loader2, Check } from 'lucide-react';
import api from '../../lib/api';

const MUC_DO = [
  { id: 'low', nhan: 'Nhẹ', mau: '#94A3B8' },
  { id: 'medium', nhan: 'Vừa', mau: '#F59E0B' },
  { id: 'high', nhan: 'Nặng', mau: '#F97316' },
  { id: 'critical', nhan: 'Chặn việc', mau: '#EF4444' },
];

export default function HopBaoLoi({ mo, thanhPhan, onDong, onXong }) {
  const [tieuDe, setTieuDe] = useState('');
  const [chiTiet, setChiTiet] = useState('');
  const [mucDo, setMucDo] = useState('medium');
  const [loaiId, setLoaiId] = useState('');
  const [dsLoai, setDsLoai] = useState([]);
  const [dangGui, setDangGui] = useState(false);
  const [xong, setXong] = useState(false);
  const [loi, setLoi] = useState('');
  const oRef = useRef(null);

  useEffect(() => {
    if (!mo) return;
    setTieuDe(''); setChiTiet(''); setMucDo('medium'); setXong(false); setLoi('');
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
    setDangGui(true); setLoi('');
    try {
      const { data } = await api.post('/bao-loi', {
        title: t,
        description: chiTiet.trim(),
        severity: mucDo,
        error_type_id: loaiId || null,
        thanh_phan: thanhPhan || null,
      });
      setXong(true);
      onXong?.(data);
      setTimeout(() => { setXong(false); onDong?.(); }, 1400);
    } catch (e) {
      setLoi(e?.response?.data?.error || e.message || 'Không gửi được.');
    } finally {
      setDangGui(false);
    }
  };

  const phim = (e) => {
    if (e.key === 'Escape') onDong?.();
    // Ctrl/Cmd + Enter gửi — tay đang ở ô chi tiết thì không phải với chuột.
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') gui();
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 99995, background: 'rgba(15,23,42,.45)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onDong?.(); }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden" onKeyDown={phim}>
        <div className="flex items-center gap-2 px-4 py-3 bg-rose-50 border-b border-rose-100">
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
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
            <p className="text-[11px] text-slate-500">Thành phần bị lỗi</p>
            <p className="text-[12px] font-semibold text-slate-800 truncate">
              {thanhPhan.khu_vuc ? `${thanhPhan.khu_vuc} · ` : ''}
              {thanhPhan.chu || `<${thanhPhan.the}>`}
            </p>
            <p className="text-[11px] text-slate-400 truncate">{thanhPhan.trang?.url}</p>
          </div>
        ) : null}

        <div className="p-4 space-y-3">
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

          {loi ? <p className="text-[12px] text-rose-600 font-medium">{loi}</p> : null}
        </div>

        <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-t border-slate-100">
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
              : dangGui ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang gửi…</>
                : 'Gửi báo lỗi'}
          </button>
        </div>
      </div>
    </div>
  );
}
