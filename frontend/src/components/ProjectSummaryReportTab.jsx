/**
 * Tab "Tổng kết" — toàn bộ vòng đời dự án dựng thành MỘT dòng thời gian.
 * Mốc, nhiệm vụ, thao tác, phát sinh, tài liệu và hình ảnh xếp chung theo thứ tự thời gian.
 * Animation tự viết, không phụ thuộc thư viện ngoài.
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import api from '../lib/api';
import { downloadElementPdf } from '../lib/domCaptureShare';

const MAU_MODULE = {
  crm: { nen: 'bg-sky-50', vien: 'border-sky-200', chu: 'text-sky-800', cham: 'bg-sky-500', thanh: '#0369A1' },
  sx: { nen: 'bg-violet-50', vien: 'border-violet-200', chu: 'text-violet-800', cham: 'bg-violet-500', thanh: '#6D28D9' },
  vc: { nen: 'bg-teal-50', vien: 'border-teal-200', chu: 'text-teal-800', cham: 'bg-teal-500', thanh: '#0F766E' },
  khac: { nen: 'bg-gray-50', vien: 'border-gray-200', chu: 'text-gray-700', cham: 'bg-gray-400', thanh: '#64748B' },
  project: { nen: 'bg-amber-50', vien: 'border-amber-200', chu: 'text-amber-800', cham: 'bg-amber-500', thanh: '#B45309' },
};

const NHAN_MODULE = { crm: 'CRM', sx: 'Sản xuất', vc: 'VC/LĐ', project: 'Dự án', khac: 'Khác' };

const LOAI_SU_KIEN = {
  moc: { nhan: 'Mốc', cham: 'bg-amber-500', vien: 'border-amber-200', nen: 'bg-amber-50' },
  nv_tao: { nhan: 'Giao việc', cham: 'bg-slate-400', vien: 'border-gray-200', nen: 'bg-white' },
  nv_xong: { nhan: 'Hoàn tất', cham: 'bg-emerald-500', vien: 'border-emerald-200', nen: 'bg-emerald-50' },
  phat_sinh: { nhan: 'Phát sinh', cham: 'bg-rose-500', vien: 'border-rose-200', nen: 'bg-rose-50' },
  tai_lieu: { nhan: 'Tài liệu', cham: 'bg-indigo-500', vien: 'border-indigo-200', nen: 'bg-indigo-50' },
};

const NHAN_PHAT_SINH = {
  deadline_changed: 'Đổi hạn',
  assignee_changed: 'Đổi người',
  deleted: 'Xoá việc',
  nhiem_vu_phat_sinh: 'Nhiệm vụ phát sinh',
  su_co: 'Sự cố',
};

const CSS_HIEU_UNG = `
@keyframes tk-nhip {
  0%   { r: 18; opacity: .75; stroke-width: 5; }
  70%  { r: 58; opacity: 0;   stroke-width: 2; }
  100% { r: 58; opacity: 0;   stroke-width: 2; }
}
@keyframes tk-tho { 0%, 100% { r: 15; } 50% { r: 18; } }
@keyframes tk-hien-len { from { opacity: 0; transform: scale(.97); } to { opacity: 1; transform: none; } }
.tk-vao { opacity: 0; transform: translateY(16px); transition: opacity .5s cubic-bezier(.22,1,.36,1), transform .5s cubic-bezier(.22,1,.36,1); }
.tk-vao-trai { transform: translateX(-20px); }
.tk-vao.tk-hien { opacity: 1; transform: none; }
.tk-duong { transform: scaleY(0); transform-origin: top center; transition: transform 1.1s cubic-bezier(.22,1,.36,1); }
.tk-duong.tk-hien { transform: scaleY(1); }
.tk-thanh { width: 0; transition: width .9s cubic-bezier(.22,1,.36,1) .1s; }
.tk-the { transition: transform .2s cubic-bezier(.22,1,.36,1), box-shadow .2s ease; }
.tk-the:hover { transform: translateY(-2px); box-shadow: 0 8px 22px -14px rgba(16,32,43,.4); }
.tk-gap { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .26s cubic-bezier(.22,1,.36,1); }
.tk-gap.tk-mo { grid-template-rows: 1fr; }
.tk-gap > div { overflow: hidden; }
.tk-mui { transition: transform .2s cubic-bezier(.22,1,.36,1); }
.tk-mui.tk-quay { transform: rotate(90deg); }
.tk-anh { transition: transform .22s cubic-bezier(.22,1,.36,1), box-shadow .22s ease; }
.tk-anh:hover { transform: scale(1.05); box-shadow: 0 6px 18px -8px rgba(16,32,43,.45); }
.tk-den { animation: tk-hien-len .22s cubic-bezier(.22,1,.36,1); }
@media (prefers-reduced-motion: reduce) {
  .tk-vao, .tk-duong, .tk-thanh, .tk-the, .tk-gap, .tk-mui, .tk-anh, .tk-den { transition: none !important; animation: none !important; }
  .tk-vao { opacity: 1; transform: none; }
  .tk-duong { transform: scaleY(1); }
}
`;

function fmtNgay(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtGio(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function fmtNgayDai(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtTien(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return `${Number(n).toLocaleString('vi-VN')} đ`;
}

function fmtDungLuong(n) {
  const b = Number(n) || 0;
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function khoaNgay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'khong-ro';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function khoaPhut(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'x';
  return `${khoaNgay(iso)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function docGiaTri(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime()) && /\d{4}-\d{2}-\d{2}/.test(v)) return `${fmtNgay(v)} ${fmtGio(v)}`.trim();
    return v;
  }
  if (typeof v === 'object') {
    const uuTien = v.title || v.name || v.full_name || v.deadline || v.value;
    if (uuTien) return String(uuTien);
    return JSON.stringify(v).slice(0, 80);
  }
  return String(v);
}

function useHienKhiCuon(nguong = 0.15) {
  const ref = useRef(null);
  const [hien, setHien] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || hien) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setHien(true); return undefined; }
    const ob = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { setHien(true); ob.disconnect(); break; }
    }, { threshold: nguong, rootMargin: '0px 0px -6% 0px' });
    ob.observe(el);
    return () => ob.disconnect();
  }, [hien, nguong]);
  return [ref, hien];
}

function SoDemTang({ giaTri, hauTo = '', chay = true }) {
  const [so, setSo] = useState(0);
  useEffect(() => {
    if (!chay) return undefined;
    const dich = Number(giaTri) || 0;
    if (dich === 0) { setSo(0); return undefined; }
    let raf = 0;
    const t0 = performance.now();
    const buoc = (t) => {
      const p = Math.min(1, (t - t0) / 1000);
      setSo(Math.round(dich * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(buoc);
    };
    raf = requestAnimationFrame(buoc);
    return () => cancelAnimationFrame(raf);
  }, [giaTri, chay]);
  return <span>{so.toLocaleString('vi-VN')}{hauTo}</span>;
}

function VongNhip() {
  return (
    <svg viewBox="0 0 160 160" width="100%" height="100%" aria-hidden="true">
      <circle cx="80" cy="80" r="18" fill="none" stroke="#5EEAD4" strokeWidth="5" style={{ animation: 'tk-nhip 2.6s ease-out infinite' }} />
      <circle cx="80" cy="80" r="18" fill="none" stroke="#5EEAD4" strokeWidth="5" style={{ animation: 'tk-nhip 2.6s ease-out 1.3s infinite' }} />
      <circle cx="80" cy="80" r="15" fill="#2DD4BF" opacity="0.85" style={{ animation: 'tk-tho 2.6s ease-in-out infinite' }} />
    </svg>
  );
}

function ChipModule({ module }) {
  const m = MAU_MODULE[module] || MAU_MODULE.khac;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.nen} ${m.chu} border ${m.vien}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.cham}`} />
      {NHAN_MODULE[module] || 'Khác'}
    </span>
  );
}

function IconLoai({ loai }) {
  const chung = { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: '#fff', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (loai === 'moc') return <svg {...chung}><path d="M5 3v18" /><path d="M5 4h12l-2.5 3.5L17 11H5" /></svg>;
  if (loai === 'nv_xong') return <svg {...chung}><path d="M4 12l5 5L20 6" /></svg>;
  if (loai === 'phat_sinh') return <svg {...chung}><path d="M12 8v5" /><path d="M12 17h.01" /><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>;
  if (loai === 'tai_lieu') return <svg {...chung}><path d="M14 3v5h5" /><path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z" /></svg>;
  return <svg {...chung}><circle cx="12" cy="12" r="4" /></svg>;
}

function LuoiAnh({ files, onMoAnh }) {
  const anh = files.filter((f) => f.la_anh && f.url);
  const khac = files.filter((f) => !(f.la_anh && f.url));
  return (
    <div className="mt-2 space-y-2">
      {anh.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {anh.slice(0, 18).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onMoAnh(f)}
              title={f.ten}
              className="tk-anh block h-[74px] w-[74px] overflow-hidden rounded-lg border border-gray-200 bg-gray-100 cursor-pointer"
            >
              <img src={f.url} alt={f.ten} loading="lazy" crossOrigin="anonymous" className="h-full w-full object-cover" />
            </button>
          ))}
          {anh.length > 18 && (
            <span className="flex h-[74px] w-[74px] items-center justify-center rounded-lg border border-dashed border-gray-300 text-[12px] font-semibold text-gray-500">
              +{anh.length - 18}
            </span>
          )}
        </div>
      )}
      {khac.length > 0 && (
        <ul className="space-y-1">
          {khac.slice(0, 12).map((f) => (
            <li key={f.id} className="flex items-center gap-2 text-[12.5px]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M14 3v5h5" /><path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z" /></svg>
              {f.url ? (
                <a href={f.url} target="_blank" rel="noreferrer" className="text-indigo-700 hover:underline truncate">{f.ten}</a>
              ) : (
                <span className="text-gray-700 truncate">{f.ten}</span>
              )}
              {f.kich_thuoc ? <span className="shrink-0 text-[11px] text-gray-400">{fmtDungLuong(f.kich_thuoc)}</span> : null}
              {f.nhung ? <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">mở ở tab Tài liệu</span> : null}
            </li>
          ))}
          {khac.length > 12 && <li className="text-[11.5px] text-gray-500">… và {khac.length - 12} tệp nữa</li>}
        </ul>
      )}
    </div>
  );
}

function ChiTietNhiemVu({ nv, thaoTac }) {
  if (!nv) return null;
  const coBuoc = nv.checklist?.length > 0;
  const coThaoTac = thaoTac?.length > 0;
  if (!coBuoc && !coThaoTac) return <div className="text-[12px] text-gray-500">Không có bước hay thao tác nào được ghi nhận.</div>;
  return (
    <div className="space-y-3">
      {coBuoc && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Các bước</div>
          <ul className="mt-1.5 space-y-1">
            {nv.checklist.map((c, i) => (
              <li key={`${nv.id}-cl-${i}`} className="flex items-start gap-2 text-[13px]">
                <span className={`mt-[3px] inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border ${c.xong ? 'border-emerald-600 bg-emerald-600' : 'border-gray-300 bg-white'}`}>
                  {c.xong && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6" /></svg>}
                </span>
                <span className={c.xong ? 'text-gray-500 line-through' : 'text-gray-800'}>{c.ten}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {coThaoTac && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Thao tác trên nhiệm vụ</div>
          <ul className="mt-1.5 space-y-1">
            {thaoTac.slice(0, 12).map((t) => (
              <li key={t.id} className="text-[12px] text-gray-600">
                <span className="font-semibold text-gray-800">{t.loai_nhan}</span>
                {t.ai ? ` · ${t.ai}` : ''} · {fmtNgay(t.luc)} {fmtGio(t.luc)}
                {t.loai === 'deadline_changed' && (
                  <span className="text-gray-500"> — {docGiaTri(t.gia_tri_cu)} → {docGiaTri(t.gia_tri_moi)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function NutThoiGian({ nhom, thaoTacTheoViec, onMoAnh }) {
  const [ref, hien] = useHienKhiCuon(0.12);
  const [mo, setMo] = useState(false);
  const kieu = LOAI_SU_KIEN[nhom.loai] || LOAI_SU_KIEN.nv_tao;
  const dau = nhom.items[0];
  const nhieu = nhom.items.length > 1;
  const coChiTiet = nhom.loai === 'tai_lieu'
    || (!nhieu && (nhom.loai === 'nv_tao' || nhom.loai === 'nv_xong'))
    || nhieu;

  let tieuDe = dau.tieu_de;
  if (nhieu) {
    if (nhom.loai === 'tai_lieu') {
      const soAnh = nhom.items.filter((x) => x.file?.la_anh).length;
      tieuDe = soAnh ? `Tải lên ${nhom.items.length} tệp · ${soAnh} ảnh` : `Tải lên ${nhom.items.length} tệp`;
    } else if (nhom.loai === 'nv_tao') tieuDe = `Giao ${nhom.items.length} nhiệm vụ`;
    else if (nhom.loai === 'nv_xong') tieuDe = `Hoàn tất ${nhom.items.length} nhiệm vụ`;
    else if (nhom.loai === 'phat_sinh') tieuDe = `${NHAN_PHAT_SINH[dau.phat_sinh_loai] || 'Thay đổi'} · ${nhom.items.length} nhiệm vụ`;
  } else if (nhom.loai === 'tai_lieu') {
    tieuDe = dau.file?.la_anh ? `Tải lên ảnh: ${dau.tieu_de}` : `Tải lên: ${dau.tieu_de}`;
  }

  const files = nhom.loai === 'tai_lieu' ? nhom.items.map((x) => x.file).filter(Boolean) : [];

  return (
    <li ref={ref} className={`relative tk-vao ${hien ? 'tk-hien' : ''}`}>
      <span className={`absolute -left-[30px] top-2 flex h-[22px] w-[22px] items-center justify-center rounded-full ring-4 ring-white ${kieu.cham}`}>
        <IconLoai loai={nhom.loai} />
      </span>

      <div className={`rounded-xl border ${kieu.vien} ${kieu.nen} tk-the`}>
        <div className="flex items-start gap-3 px-3.5 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">{tieuDe}</span>
              {dau.module && <ChipModule module={dau.module} />}
              {dau.cot && <span className="text-[11px] text-gray-500">{dau.cot}</span>}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[11px] text-gray-500">
              <span>{fmtGio(dau.luc)}</span>
              {dau.ai && <span>· {dau.ai}</span>}
              {dau.phu && <span>· {dau.phu}</span>}
            </div>

            {nhom.loai === 'tai_lieu' && <LuoiAnh files={files} onMoAnh={onMoAnh} />}
          </div>

          {coChiTiet && nhom.loai !== 'tai_lieu' && (
            <button
              type="button"
              onClick={() => setMo((v) => !v)}
              aria-expanded={mo}
              className="shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-gray-500 cursor-pointer hover:bg-white hover:text-gray-800"
            >
              {nhieu ? `${nhom.items.length} việc` : 'Chi tiết'}
              <span className={`tk-mui ${mo ? 'tk-quay' : ''}`} aria-hidden="true">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
              </span>
            </button>
          )}
        </div>

        {coChiTiet && nhom.loai !== 'tai_lieu' && (
          <div className={`tk-gap ${mo ? 'tk-mo' : ''}`}>
            <div>
              <div className="border-t border-black/5 px-3.5 py-3">
                {nhieu ? (
                  <ul className="space-y-1.5">
                    {nhom.items.slice(0, 40).map((it, i) => (
                      <li key={`${it.id}-${i}`} className="text-[12.5px] text-gray-700">
                        <span className="font-medium">{it.tieu_de}</span>
                        {it.phu && <span className="text-gray-500"> — {it.phu}</span>}
                      </li>
                    ))}
                    {nhom.items.length > 40 && <li className="text-[11.5px] text-gray-500">… và {nhom.items.length - 40} mục nữa</li>}
                  </ul>
                ) : (
                  <ChiTietNhiemVu nv={dau.nv} thaoTac={dau.nv ? (thaoTacTheoViec.get(String(dau.nv.id)) || thaoTacTheoViec.get(dau.nv.ten)) : null} />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

function NgayTrongTimeline({ ngay, nhomList, thaoTacTheoViec, onMoAnh }) {
  const [ref, hien] = useHienKhiCuon(0.02);
  const [xemHet, setXemHet] = useState(false);
  const hienThi = xemHet ? nhomList : nhomList.slice(0, 10);
  return (
    <div ref={ref} className="relative">
      <div className={`sticky top-0 z-10 -mx-1 mb-3 flex items-center gap-2 bg-white/95 px-1 py-1.5 backdrop-blur tk-vao tk-vao-trai ${hien ? 'tk-hien' : ''}`}>
        <span className="rounded-full bg-gray-900 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">{fmtNgayDai(ngay)}</span>
        <span className="text-[11px] text-gray-400">{nhomList.length} sự kiện</span>
      </div>
      <ul className="space-y-2.5 pb-6">
        {hienThi.map((n, i) => (
          <NutThoiGian key={`${n.khoa}-${i}`} nhom={n} thaoTacTheoViec={thaoTacTheoViec} onMoAnh={onMoAnh} />
        ))}
        {!xemHet && nhomList.length > 10 && (
          <li className="relative">
            <button
              type="button"
              onClick={() => setXemHet(true)}
              className="w-full rounded-xl border border-dashed border-gray-300 bg-white px-3 py-2 text-[12.5px] font-semibold text-gray-600 cursor-pointer hover:bg-gray-50"
            >
              Xem thêm {nhomList.length - 10} sự kiện trong ngày
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

function DenLongAnh({ anh, danhSach, onDong, onDoi }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onDong();
      if (e.key === 'ArrowRight') onDoi(1);
      if (e.key === 'ArrowLeft') onDoi(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDong, onDoi]);

  if (!anh) return null;
  const idx = danhSach.findIndex((x) => x.id === anh.id);
  return (
    <div className="tk-den fixed inset-0 z-[120] flex flex-col bg-black/85 p-4" role="dialog" aria-modal="true">
      <div className="flex items-start justify-between gap-4 text-white">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{anh.ten}</div>
          <div className="mt-0.5 text-[11.5px] text-white/60">
            {anh.nguon_nhan}{anh.ai ? ` · ${anh.ai}` : ''} · {fmtNgay(anh.luc)} {fmtGio(anh.luc)}
            {idx >= 0 ? ` · ${idx + 1}/${danhSach.length}` : ''}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a href={anh.url} target="_blank" rel="noreferrer" className="rounded-lg border border-white/30 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-white/10">Mở gốc</a>
          <button type="button" onClick={onDong} className="rounded-lg border border-white/30 px-3 py-1.5 text-[12.5px] font-semibold text-white cursor-pointer hover:bg-white/10">Đóng</button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center gap-3 py-3">
        <button type="button" onClick={() => onDoi(-1)} aria-label="Ảnh trước" className="shrink-0 rounded-full border border-white/25 p-2 text-white cursor-pointer hover:bg-white/10">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <img src={anh.url} alt={anh.ten} className="max-h-full max-w-full rounded-xl object-contain" />
        <button type="button" onClick={() => onDoi(1)} aria-label="Ảnh sau" className="shrink-0 rounded-full border border-white/25 p-2 text-white cursor-pointer hover:bg-white/10">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>
    </div>
  );
}

function DaiGiaiDoan({ giaiDoan }) {
  const [ref, hien] = useHienKhiCuon(0.15);
  if (!giaiDoan?.length) return null;
  return (
    <div ref={ref} className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
      {giaiDoan.map((g) => {
        const mau = MAU_MODULE[g.module] || MAU_MODULE.khac;
        const pct = g.so_nhiem_vu ? Math.round((g.so_xong / g.so_nhiem_vu) * 100) : 0;
        return (
          <div key={`${g.module}-${g.ten}`} className={`rounded-xl border ${mau.vien} ${mau.nen} px-3 py-2.5 tk-the`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[12.5px] font-bold text-gray-900">{g.ten}</span>
              <span className="shrink-0 text-[13px] font-bold text-gray-900"><SoDemTang giaTri={pct} hauTo="%" chay={hien} /></span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/70">
              <div className="h-full rounded-full tk-thanh" style={{ width: hien ? `${pct}%` : 0, background: mau.thanh }} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[10.5px] text-gray-500">
              <ChipModule module={g.module} />
              <span>{g.so_xong}/{g.so_nhiem_vu} việc</span>
              {g.so_ngay !== null && <span>· {g.so_ngay} ngày</span>}
              {g.so_tre > 0 && <span className="font-semibold text-rose-700">· {g.so_tre} trễ</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ProjectSummaryReportTab({ projectId }) {
  const [data, setData] = useState(null);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState('');
  const [locModule, setLocModule] = useState('all');
  const [locLoai, setLocLoai] = useState(() => new Set(['moc', 'nv_tao', 'nv_xong', 'phat_sinh', 'tai_lieu']));
  const [dangXuat, setDangXuat] = useState(false);
  const [anhMo, setAnhMo] = useState(null);
  const vungIn = useRef(null);

  useEffect(() => {
    if (!projectId) return undefined;
    let huy = false;
    setDangTai(true);
    setLoi('');
    api.get(`/projects/${projectId}/tong-ket`)
      .then((r) => { if (!huy) setData(r.data || null); })
      .catch((e) => { if (!huy) setLoi(e?.response?.data?.error || 'Không tải được tổng kết dự án'); })
      .finally(() => { if (!huy) setDangTai(false); });
    return () => { huy = true; };
  }, [projectId]);

  const thaoTacTheoViec = useMemo(() => {
    const m = new Map();
    for (const t of data?.thao_tac || []) {
      const k = t.doi_tuong_id || t.doi_tuong;
      if (!k) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(t);
    }
    return m;
  }, [data]);

  /** Trộn mọi nguồn thành một dòng sự kiện theo thời gian. */
  const suKien = useMemo(() => {
    if (!data) return [];
    const out = [];

    for (const m of data.moc || []) {
      out.push({
        id: `moc-${m.key}`, loai: 'moc', luc: m.thoi_diem,
        module: m.nguon === 'project' ? 'project' : m.nguon,
        tieu_de: m.nhan, ai: null, phu: null,
      });
    }

    for (const nv of data.nhiem_vu || []) {
      if (nv.tao_luc) {
        out.push({
          id: `nvt-${nv.id}`, loai: 'nv_tao', luc: nv.tao_luc, module: nv.module,
          tieu_de: nv.ten, cot: nv.cot, ai: nv.nguoi_lam,
          phu: nv.han ? `hạn ${fmtNgay(nv.han)}` : null, nv,
        });
      }
      if (nv.xong_luc) {
        out.push({
          id: `nvx-${nv.id}`, loai: 'nv_xong', luc: nv.xong_luc, module: nv.module,
          tieu_de: nv.ten, cot: nv.cot, ai: nv.nguoi_lam,
          phu: nv.tre_ngay > 0 ? `trễ ${nv.tre_ngay} ngày` : 'đúng hạn', nv,
        });
      }
    }

    for (const p of data.phat_sinh || []) {
      if (p.loai === 'nhiem_vu_phat_sinh') continue;
      out.push({
        id: `ps-${p.loai}-${p.luc}-${p.mo_ta}`, loai: 'phat_sinh', luc: p.luc,
        module: null, phat_sinh_loai: p.loai,
        tieu_de: `${NHAN_PHAT_SINH[p.loai] || p.loai_nhan}: ${p.doi_tuong || p.mo_ta}`,
        ai: p.ai,
        phu: p.loai === 'deadline_changed' ? `${docGiaTri(p.gia_tri_cu)} → ${docGiaTri(p.gia_tri_moi)}` : null,
      });
    }

    for (const d of data.tai_lieu || []) {
      out.push({
        id: `tl-${d.id}`, loai: 'tai_lieu', luc: d.luc, module: d.nguon === 'crm' ? 'crm' : null,
        tieu_de: d.ten, ai: d.ai, phu: d.nhom || d.nguon_nhan, file: d,
      });
    }

    return out
      .filter((e) => e.luc)
      .sort((a, b) => new Date(a.luc) - new Date(b.luc));
  }, [data]);

  const suKienLoc = useMemo(() => suKien.filter((e) => {
    if (!locLoai.has(e.loai)) return false;
    if (locModule === 'all') return true;
    if (e.loai === 'phat_sinh') return true;
    return e.module === locModule;
  }), [suKien, locLoai, locModule]);

  /** Gom theo ngày, trong ngày gộp các sự kiện cùng loại & cùng phút. */
  const theoNgay = useMemo(() => {
    const ngayMap = new Map();
    for (const e of suKienLoc) {
      const kn = khoaNgay(e.luc);
      if (!ngayMap.has(kn)) ngayMap.set(kn, []);
      ngayMap.get(kn).push(e);
    }
    const ra = [];
    for (const [kn, ds] of ngayMap) {
      const nhomMap = new Map();
      for (const e of ds) {
        const khoa = `${e.loai}|${khoaPhut(e.luc)}|${e.phat_sinh_loai || ''}`;
        if (!nhomMap.has(khoa)) nhomMap.set(khoa, { khoa, loai: e.loai, items: [] });
        nhomMap.get(khoa).items.push(e);
      }
      ra.push({ ngay: ds[0].luc, khoa: kn, nhomList: [...nhomMap.values()] });
    }
    return ra;
  }, [suKienLoc]);

  const moiAnh = useMemo(() => (data?.tai_lieu || []).filter((d) => d.la_anh && d.url), [data]);

  const doiAnh = useCallback((buoc) => {
    setAnhMo((cur) => {
      if (!cur || !moiAnh.length) return cur;
      const i = moiAnh.findIndex((x) => x.id === cur.id);
      if (i < 0) return cur;
      return moiAnh[(i + buoc + moiAnh.length) % moiAnh.length];
    });
  }, [moiAnh]);

  const xuatPdf = useCallback(async () => {
    if (!vungIn.current) return;
    setDangXuat(true);
    try {
      await downloadElementPdf(vungIn.current, `Tong-ket_${data?.du_an?.ma || projectId}.pdf`);
    } catch (e) {
      setLoi(e?.message || 'Không xuất được PDF');
    } finally {
      setDangXuat(false);
    }
  }, [data, projectId]);

  const batLoai = useCallback((k) => {
    setLocLoai((cur) => {
      const n = new Set(cur);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n.size ? n : new Set([k]);
    });
  }, []);

  if (dangTai) {
    return (
      <div className="py-16 text-center text-sm text-gray-500">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-teal-600" />
        Đang dựng dòng thời gian dự án…
      </div>
    );
  }

  if (loi) return <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-6 text-center text-sm text-rose-800">{loi}</div>;
  if (!data) return <div className="py-10 text-center text-sm text-gray-500">Chưa có dữ liệu tổng kết.</div>;

  const { du_an: da, thong_ke: tk } = data;
  const tiLeXong = tk.tong_nhiem_vu ? Math.round((tk.so_xong / tk.tong_nhiem_vu) * 100) : 0;
  const giaiDoanLoc = (data.giai_doan || []).filter((g) => locModule === 'all' || g.module === locModule);

  return (
    <div className="space-y-5">
      <style>{CSS_HIEU_UNG}</style>

      {/* THANH CÔNG CỤ */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { key: 'all', nhan: 'Tất cả' },
              { key: 'crm', nhan: 'CRM' },
              { key: 'sx', nhan: 'Sản xuất' },
              { key: 'vc', nhan: 'VC/LĐ' },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setLocModule(t.key)}
                className={`rounded-full px-3 py-1.5 text-[13px] font-semibold cursor-pointer border transition-colors ${
                  locModule === t.key ? 'border-teal-700 bg-teal-700 text-white' : 'border-gray-300 bg-white text-gray-600 hover:text-gray-900'
                }`}
              >
                {t.nhan}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={xuatPdf}
            disabled={dangXuat}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-800 cursor-pointer hover:bg-gray-50 disabled:opacity-60"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M7 12l5 5 5-5" /><path d="M5 21h14" /></svg>
            {dangXuat ? 'Đang xuất…' : 'Xuất PDF'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Hiện</span>
          {Object.entries(LOAI_SU_KIEN).map(([k, v]) => {
            const bat = locLoai.has(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => batLoai(k)}
                aria-pressed={bat}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold cursor-pointer transition-colors ${
                  bat ? 'border-gray-800 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-500 hover:text-gray-800'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${v.cham}`} />
                {v.nhan}
              </button>
            );
          })}
        </div>
      </div>

      <div ref={vungIn} className="space-y-5 bg-white">
        {/* HERO */}
        <section className="relative overflow-hidden rounded-3xl border border-gray-200 bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 px-6 py-6 text-white">
          <div className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 opacity-50"><VongNhip /></div>
          <div className="relative">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-300">Tổng kết vòng đời dự án</div>
            <h2 className="mt-1.5 text-2xl font-bold leading-tight">{da.ten || '—'}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate-300">
              {da.ma && <span className="font-mono">{da.ma}</span>}
              {da.khach_hang && <span>· {da.khach_hang}</span>}
              {da.loai_du_an && <span>· {da.loai_du_an}</span>}
              {da.cong_ty && <span>· {da.cong_ty}</span>}
            </div>
            {da.dia_chi && <div className="mt-1 text-[12px] text-slate-400">{da.dia_chi}</div>}

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm tk-the">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">Tổng thời gian</div>
                <div className="mt-1 text-2xl font-bold"><SoDemTang giaTri={tk.tong_ngay || 0} hauTo=" ngày" /></div>
                <div className="mt-0.5 text-[11px] text-slate-400">{fmtNgay(tk.bat_dau)} → {tk.dang_chay ? 'nay' : fmtNgay(tk.ket_thuc)}</div>
              </div>
              <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm tk-the">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">Nhiệm vụ hoàn tất</div>
                <div className="mt-1 text-2xl font-bold"><SoDemTang giaTri={tiLeXong} hauTo="%" /></div>
                <div className="mt-0.5 text-[11px] text-slate-400">{tk.so_xong}/{tk.tong_nhiem_vu} việc · {tk.checklist_xong}/{tk.tong_checklist} bước</div>
              </div>
              <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm tk-the">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">Tài liệu &amp; ảnh</div>
                <div className="mt-1 text-2xl font-bold"><SoDemTang giaTri={tk.so_tai_lieu || 0} /></div>
                <div className="mt-0.5 text-[11px] text-slate-400">{tk.so_hinh_anh || 0} hình ảnh · {tk.so_phat_sinh} phát sinh</div>
              </div>
              <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm tk-the">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">Giá trị dự án</div>
                <div className="mt-1 text-xl font-bold">{fmtTien(da.gia_tri)}</div>
                <div className="mt-0.5 text-[11px] text-slate-400">{tk.so_lan_doi_han} lần đổi hạn · {tk.tong_thao_tac} thao tác</div>
              </div>
            </div>
          </div>
        </section>

        {/* DẢI GIAI ĐOẠN */}
        {giaiDoanLoc.length > 0 && (
          <section className="rounded-3xl border border-gray-200 bg-white p-4">
            <h3 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-gray-500">Các giai đoạn đã đi qua</h3>
            <DaiGiaiDoan giaiDoan={giaiDoanLoc} />
          </section>
        )}

        {/* DÒNG THỜI GIAN */}
        <section className="rounded-3xl border border-gray-200 bg-white p-5">
          <div className="mb-4">
            <h3 className="text-base font-bold text-gray-900">Dòng thời gian dự án</h3>
            <p className="mt-0.5 text-[13px] text-gray-500">
              {suKienLoc.length.toLocaleString('vi-VN')} sự kiện qua {theoNgay.length} ngày — mốc, nhiệm vụ, phát sinh, tài liệu và hình ảnh xếp theo đúng thứ tự xảy ra.
            </p>
          </div>

          {theoNgay.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
              Không có sự kiện nào khớp bộ lọc.
            </div>
          ) : (
            <div className="relative pl-8">
              <div className="absolute left-[10px] top-1 bottom-1 w-[2px] rounded bg-gray-100" />
              <div className="absolute left-[10px] top-1 bottom-1 w-[2px] rounded bg-gradient-to-b from-sky-400 via-violet-400 to-teal-500 opacity-70" />
              <div>
                {theoNgay.map((n) => (
                  <NgayTrongTimeline
                    key={n.khoa}
                    ngay={n.ngay}
                    nhomList={n.nhomList}
                    thaoTacTheoViec={thaoTacTheoViec}
                    onMoAnh={setAnhMo}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {anhMo && <DenLongAnh anh={anhMo} danhSach={moiAnh} onDong={() => setAnhMo(null)} onDoi={doiAnh} />}
    </div>
  );
}
