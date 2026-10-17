/**
 * Hộp chi tiết một lỗi — đọc, đổi trạng thái, giao người, xem ảnh/video, trao đổi.
 *
 * Mỗi thao tác LƯU NGAY chứ không gom vào nút «Lưu»: người xử lý lỗi thường chỉ đổi đúng
 * một thứ (bấm «Đang làm», hoặc gán cho người khác) rồi đóng. Bắt họ bấm thêm nút lưu là
 * thêm một chỗ để quên, và lỗi nằm im ở trạng thái cũ thì cả hai bên cùng chờ nhau.
 *
 * Ảnh và video tải riêng qua `/bao-loi/:id/files`: danh sách lỗi chỉ trả về SỐ tệp để thẻ
 * Kanban nhẹ, nên chi tiết phải tự đi lấy.
 *
 * PHẢI portal ra `document.body`. Trong App, sidebar là `relative z-30` còn khung nội dung
 * là `relative z-10` — hai anh em cùng một ngăn xếp. Hộp nằm trong khung nội dung thì
 * z-index bao nhiêu cũng vô nghĩa: cả khung chỉ ở tầng 10, sidebar luôn đè lên trên.
 */
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Loader2, Paperclip, Send, UserRound, Clock, Bug, AlertTriangle, ExternalLink,
} from 'lucide-react';
import api from '../../lib/api';
import { coTep } from './guiTepBaoLoi';
import {
  TRANG_THAI, MUC_DO, trangThai, mucDo, quaHan, gioNgan, ngay, choONhapGio, tachMoTa,
} from './loiMeta';

function Nhan({ nen, chu, children }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${nen} ${chu}`}>
      {children}
    </span>
  );
}

function O({ nhan, children }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold text-slate-500 mb-1">{nhan}</p>
      {children}
    </div>
  );
}

export default function HopChiTietLoi({ loi, dsLoai = [], dsNguoi = [], onDong, onDoi }) {
  const [ban, setBan] = useState(loi);
  const [dangLuu, setDangLuu] = useState('');
  const [loiLuu, setLoiLuu] = useState('');
  const [tep, setTep] = useState([]);
  const [binhLuan, setBinhLuan] = useState([]);
  const [dangTai, setDangTai] = useState(true);
  const [oBinhLuan, setOBinhLuan] = useState('');
  const [dangGuiBl, setDangGuiBl] = useState(false);

  useEffect(() => { setBan(loi); }, [loi]);

  useEffect(() => {
    if (!loi?.id) return;
    let huy = false;
    setDangTai(true);
    Promise.all([
      api.get(`/bao-loi/${loi.id}/files`).catch(() => ({ data: { data: [] } })),
      api.get(`/bao-loi/${loi.id}/comments`).catch(() => ({ data: { data: [] } })),
    ]).then(([f, c]) => {
      if (huy) return;
      setTep(f.data?.data || []);
      setBinhLuan(c.data?.data || []);
      setDangTai(false);
    });
    return () => { huy = true; };
  }, [loi?.id]);

  /** Gửi đúng những trường vừa đổi — PUT ở backend chỉ đụng tới khoá có mặt trong body. */
  const luu = useCallback(async (thayDoi, ten) => {
    setDangLuu(ten); setLoiLuu('');
    try {
      const { data } = await api.put(`/bao-loi/${loi.id}`, thayDoi);
      setBan((cu) => ({ ...cu, ...data }));
      onDoi?.({ ...loi, ...data });
    } catch (e) {
      setLoiLuu(e?.response?.data?.error || e.message || 'Không lưu được.');
    } finally {
      setDangLuu('');
    }
  }, [loi, onDoi]);

  const guiBinhLuan = async () => {
    const t = oBinhLuan.trim();
    if (!t) return;
    setDangGuiBl(true);
    try {
      const { data } = await api.post(`/bao-loi/${loi.id}/comments`, { content: t });
      setBinhLuan((ds) => [...ds, data]);
      setOBinhLuan('');
    } catch (e) {
      setLoiLuu(e?.response?.data?.error || e.message || 'Không gửi được bình luận.');
    } finally {
      setDangGuiBl(false);
    }
  };

  if (!ban) return null;

  const { loiKe: moTaNguoi, dauVet } = tachMoTa(ban.description);
  const tt = trangThai(ban.status);
  const md = mucDo(ban.severity);
  const tre = quaHan(ban);

  const hop = (
    <div
      className="fixed inset-0 flex items-start justify-center p-4 overflow-y-auto"
      style={{ zIndex: 99990, background: 'rgba(15,23,42,.45)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onDong?.(); }}
    >
      <div className="w-full max-w-3xl my-8 rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-start gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
          <Bug className="h-4 w-4 mt-0.5 shrink-0" style={{ color: md.mau }} />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-slate-900 break-words">{ban.title}</h2>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <Nhan nen={tt.nen} chu={tt.chu}>{tt.nhan}</Nhan>
              <Nhan nen={md.nen} chu={md.chu}>{md.nhan}</Nhan>
              {ban.loai?.name ? <Nhan nen="bg-indigo-50" chu="text-indigo-700">{ban.loai.name}</Nhan> : null}
              {tre ? (
                <Nhan nen="bg-rose-100" chu="text-rose-700">
                  <AlertTriangle className="h-3 w-3" /> Quá hạn
                </Nhan>
              ) : null}
            </div>
          </div>
          <button
            type="button" onClick={onDong} aria-label="Đóng"
            className="h-7 w-7 rounded-lg hover:bg-slate-200 inline-flex items-center justify-center text-slate-500 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Đổi trạng thái — việc hay làm nhất, để trên cùng và bấm một nhát là xong. */}
          <div className="flex flex-wrap gap-1.5">
            {TRANG_THAI.map((x) => (
              <button
                key={x.id} type="button"
                onClick={() => x.id !== ban.status && luu({ status: x.id }, 'status')}
                disabled={!!dangLuu}
                className={`h-8 px-3 rounded-lg text-[12px] font-bold border cursor-pointer disabled:opacity-60 ${
                  ban.status === x.id ? 'text-white' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
                style={ban.status === x.id ? { backgroundColor: x.mau, borderColor: x.mau } : undefined}
              >
                {dangLuu === 'status' && ban.status !== x.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : x.nhan}
              </button>
            ))}
          </div>

          {moTaNguoi ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
              <p className="text-[13px] text-slate-700 whitespace-pre-wrap break-words">{moTaNguoi}</p>
            </div>
          ) : null}

          {dauVet.length ? (
            <details className="rounded-xl border border-slate-200 bg-white overflow-hidden" open>
              <summary className="px-3 py-2 text-[12px] font-semibold text-slate-600 bg-slate-50 cursor-pointer select-none">
                Thành phần bị lỗi — máy tự ghi
              </summary>
              <dl className="px-3 py-2 space-y-1">
                {dauVet.map((d, i) => (
                  <div key={`${d.ten}-${i}`} className="flex gap-2 text-[12px]">
                    {d.ten ? <dt className="w-24 shrink-0 text-slate-500">{d.ten}</dt> : null}
                    <dd className="min-w-0 flex-1 font-mono text-[11.5px] text-slate-700 break-all">{d.gt}</dd>
                  </div>
                ))}
              </dl>
            </details>
          ) : null}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <O nhan="Người báo">
              <p className="text-[13px] font-semibold text-slate-800 truncate">
                {ban.nguoi_bao?.full_name || '—'}
              </p>
              <p className="text-[11px] text-slate-400">{gioNgan(ban.created_at)}</p>
            </O>

            <O nhan="Người xử lý">
              <select
                value={ban.assignee_id || ''} disabled={!!dangLuu}
                onChange={(e) => luu({ assignee_id: e.target.value || null }, 'assignee')}
                className="w-full px-2 py-1.5 text-[12px] border border-slate-200 rounded-lg bg-white outline-none focus:border-rose-400 cursor-pointer"
              >
                <option value="">— chưa giao —</option>
                {dsNguoi.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                ))}
              </select>
            </O>

            <O nhan="Loại lỗi">
              <select
                value={ban.error_type_id || ''} disabled={!!dangLuu}
                onChange={(e) => luu({ error_type_id: e.target.value || null }, 'type')}
                className="w-full px-2 py-1.5 text-[12px] border border-slate-200 rounded-lg bg-white outline-none focus:border-rose-400 cursor-pointer"
              >
                <option value="">— chưa phân loại —</option>
                {dsLoai.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </O>

            <O nhan="Hạn xử lý">
              <input
                type="datetime-local" value={choONhapGio(ban.deadline)} disabled={!!dangLuu}
                onChange={(e) => luu({ deadline: e.target.value ? new Date(e.target.value).toISOString() : null }, 'deadline')}
                className={`w-full px-2 py-1.5 text-[12px] border rounded-lg bg-white outline-none focus:border-rose-400 cursor-pointer ${
                  tre ? 'border-rose-300 text-rose-700' : 'border-slate-200'
                }`}
              />
            </O>
          </div>

          <div>
            <p className="text-[12px] font-semibold text-slate-700 mb-1">Mức độ</p>
            <div className="flex gap-1 max-w-sm">
              {MUC_DO.map((x) => (
                <button
                  key={x.id} type="button" disabled={!!dangLuu}
                  onClick={() => x.id !== ban.severity && luu({ severity: x.id }, 'severity')}
                  className={`flex-1 px-1 py-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer disabled:opacity-60 ${
                    ban.severity === x.id ? 'text-white' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}
                  style={ban.severity === x.id ? { backgroundColor: x.mau, borderColor: x.mau } : undefined}
                >
                  {x.nhan}
                </button>
              ))}
            </div>
          </div>

          {loiLuu ? <p className="text-[12px] text-rose-600 font-medium">{loiLuu}</p> : null}

          {/* ẢNH / VIDEO — thứ người sửa đọc trước cả phần mô tả. */}
          <div>
            <p className="text-[12px] font-semibold text-slate-700 mb-1.5 inline-flex items-center gap-1.5">
              <Paperclip className="h-3.5 w-3.5" /> Ảnh · video · tệp
              {tep.length ? <span className="text-slate-400 font-normal">({tep.length})</span> : null}
            </p>
            {dangTai ? (
              <p className="text-[12px] text-slate-400">Đang tải…</p>
            ) : tep.length ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {tep.map((f) => {
                  const laAnh = String(f.mime_type || '').startsWith('image/');
                  const laVideo = String(f.mime_type || '').startsWith('video/');
                  return (
                    <div key={f.id} className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
                      {laAnh ? (
                        <a href={f.file_url} target="_blank" rel="noreferrer" title="Mở ảnh gốc">
                          <img src={f.file_url} alt={f.file_name} className="w-full h-32 object-cover hover:opacity-90" />
                        </a>
                      ) : laVideo ? (
                        <video src={f.file_url} controls className="w-full h-32 object-contain bg-black" />
                      ) : (
                        <a
                          href={f.file_url} target="_blank" rel="noreferrer"
                          className="h-32 flex flex-col items-center justify-center gap-1 text-slate-500 hover:bg-slate-100"
                        >
                          <Paperclip className="h-6 w-6" />
                          <span className="text-[11px] inline-flex items-center gap-1">
                            Mở tệp <ExternalLink className="h-3 w-3" />
                          </span>
                        </a>
                      )}
                      <p className="px-2 py-1 text-[11px] text-slate-500 truncate" title={f.file_name}>
                        {f.file_name} · {coTep(f.file_size)}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[12px] text-slate-400">Không có tệp nào.</p>
            )}
          </div>

          {/* TRAO ĐỔI — người báo và người sửa hỏi đáp tại chỗ, khỏi nhảy qua Zalo. */}
          <div>
            <p className="text-[12px] font-semibold text-slate-700 mb-1.5">
              Trao đổi {binhLuan.length ? <span className="text-slate-400 font-normal">({binhLuan.length})</span> : null}
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {binhLuan.map((c) => (
                <div key={c.id} className="flex gap-2">
                  <div className="h-7 w-7 shrink-0 rounded-full bg-slate-200 inline-flex items-center justify-center text-slate-500">
                    {c.user?.avatar
                      ? <img src={c.user.avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
                      : <UserRound className="h-3.5 w-3.5" />}
                  </div>
                  <div className="min-w-0 flex-1 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5">
                    <p className="text-[11px] font-semibold text-slate-700">
                      {c.user?.full_name || c.user?.email || 'Người dùng'}
                      <span className="ml-1.5 font-normal text-slate-400 inline-flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" /> {gioNgan(c.created_at)}
                      </span>
                    </p>
                    <p className="text-[13px] text-slate-700 whitespace-pre-wrap break-words">{c.content}</p>
                  </div>
                </div>
              ))}
              {!dangTai && !binhLuan.length ? (
                <p className="text-[12px] text-slate-400">Chưa có trao đổi nào.</p>
              ) : null}
            </div>

            <div className="flex gap-2 mt-2">
              <input
                value={oBinhLuan} onChange={(e) => setOBinhLuan(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); guiBinhLuan(); } }}
                placeholder="Viết trao đổi… (Enter để gửi)"
                className="flex-1 px-3 py-2 text-[13px] border border-slate-200 rounded-lg outline-none focus:border-rose-400"
              />
              <button
                type="button" onClick={guiBinhLuan} disabled={dangGuiBl || !oBinhLuan.trim()}
                className="h-9 px-3 rounded-lg bg-rose-600 text-white text-[12px] font-bold hover:bg-rose-700 disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
              >
                {dangGuiBl ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Gửi
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-t border-slate-200">
          <p className="flex-1 text-[11px] text-slate-400">
            Báo lúc {ngay(ban.created_at)}
            {ban.closed_at ? ` · xong lúc ${ngay(ban.closed_at)}` : ''}
          </p>
          <button
            type="button" onClick={onDong}
            className="px-3 py-1.5 text-[13px] font-semibold text-slate-600 rounded-lg hover:bg-slate-200 cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? hop : createPortal(hop, document.body);
}
