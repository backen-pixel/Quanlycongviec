/**
 * Phân tích hiệu quả quảng cáo Facebook.
 * Ba cách nhìn: theo Chiến dịch / theo Quảng cáo / theo Page.
 * Tên chiến dịch đặt tay tại đây cho tới khi nối Marketing API.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import api from '../lib/api';

const TAB = [
  { key: 'insights', nhan: 'Nhận xét tự động' },
  { key: 'campaigns', nhan: 'Theo chiến dịch' },
  { key: 'ads', nhan: 'Theo quảng cáo' },
  { key: 'pages', nhan: 'Theo page' },
];

const MUC = {
  tot:       { nhan: 'Tốt',     lop: 'border-emerald-300 bg-emerald-50', cham: 'bg-emerald-500', chu: 'text-emerald-900' },
  canh_bao:  { nhan: 'Lưu ý',   lop: 'border-amber-300 bg-amber-50',     cham: 'bg-amber-500',   chu: 'text-amber-900' },
  xau:       { nhan: 'Xấu',     lop: 'border-rose-300 bg-rose-50',       cham: 'bg-rose-500',    chu: 'text-rose-900' },
  thong_tin: { nhan: 'Thông tin', lop: 'border-gray-200 bg-gray-50',      cham: 'bg-gray-400',    chu: 'text-gray-700' },
};

/**
 * Màu trạng thái là màu DÀNH RIÊNG, không được mượn để trang trí.
 * Chỉ ba sắc: tốt (lục) · cần chú ý (hổ phách) · xấu (đỏ), cộng xám cho "chưa rõ".
 * "Khá" dùng bậc nhạt hơn của chính sắc lục, không phải một màu thứ tư.
 */
const HANG = {
  tot:     { nhan: 'Tốt',             lop: 'bg-emerald-100 text-emerald-900' },
  kha:     { nhan: 'Khá',             lop: 'bg-emerald-50 text-emerald-800' },
  can_xem: { nhan: 'Cần xem lại',     lop: 'bg-amber-100 text-amber-900' },
  kem:     { nhan: 'Kém',             lop: 'bg-rose-100 text-rose-900' },
  chua_du: { nhan: 'Chưa đủ dữ liệu', lop: 'bg-gray-100 text-gray-600' },
};

/**
 * Nhãn chất lượng là một THANG CÓ THỨ TỰ (lạnh < ấm < nóng < đã chốt), nên tô
 * bằng một dải MỘT MÀU đậm dần, không phải mỗi nhãn một màu cầu vồng — cầu vồng
 * làm người đọc tưởng chúng là bốn thứ không liên quan.
 * Riêng "rác" nằm NGOÀI thang (không dùng được) nên để xám trung tính.
 * Dải này đã chạy qua validator: cặp sát nhau gần nhất ΔE 17.3 (thường) / 14.8 (mù màu).
 */
const THANG_CHAT_LUONG = {
  da_chot: '#1E3A8A',
  nong: '#2563EB',
  am: '#60A5FA',
  lanh: '#BFDBFE',
  rac: '#9CA3AF',
};

const TEN_NHAN = {
  da_chot: 'Đã chốt', nong: 'Nóng', am: 'Ấm', lanh: 'Lạnh', rac: 'Rác',
};

const MAU_NHAN = {
  rac: 'bg-gray-100 text-gray-600',
  lanh: 'bg-blue-50 text-blue-700',
  am: 'bg-blue-100 text-blue-800',
  nong: 'bg-blue-200 text-blue-900',
  da_chot: 'bg-blue-900 text-white',
};

const NHANH = [
  { nhan: '7 ngày', ngay: 7 },
  { nhan: '30 ngày', ngay: 30 },
  { nhan: '90 ngày', ngay: 90 },
];

function ngayYMD(d) {
  const z = new Date(d);
  return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, '0')}-${String(z.getDate()).padStart(2, '0')}`;
}

function fmtSo(n) {
  return Number(n || 0).toLocaleString('vi-VN');
}

function fmtTien(n) {
  const v = Number(n || 0);
  if (!v) return '—';
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)} tỷ`;
  if (v >= 1e6) return `${Math.round(v / 1e6)} tr`;
  return v.toLocaleString('vi-VN');
}

function fmtNgay(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

const THU_TU_NHAN = ['da_chot', 'nong', 'am', 'lanh', 'rac'];

function ThanhChatLuong({ byLabel, tong, chuThich = false }) {
  if (!tong) return null;
  const co = THU_TU_NHAN.filter((k) => (byLabel?.[k] || 0) > 0);
  return (
    <div>
      {/* gap-[2px] là khe nền giữa các đoạn — nhờ nó hai đoạn sát nhau không dính làm một */}
      <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-gray-100">
        {co.map((k) => {
          const v = byLabel[k];
          return (
            <div key={k} title={`${TEN_NHAN[k]}: ${v} (${Math.round((v / tong) * 100)}%)`}
              style={{ width: `${(v / tong) * 100}%`, background: THANG_CHAT_LUONG[k] }} />
          );
        })}
      </div>
      {chuThich && co.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {co.map((k) => (
            <span key={k} className="flex items-center gap-1.5 text-[11.5px] text-gray-600">
              <span className="h-2 w-2 rounded-full" style={{ background: THANG_CHAT_LUONG[k] }} />
              {TEN_NHAN[k]} {byLabel[k]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function OSoLieu({ nhan, giaTri, phu }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{nhan}</div>
      <div className="mt-1 text-2xl font-bold leading-none tabular-nums text-gray-900">{giaTri}</div>
      {phu ? <div className="mt-1 text-xs text-gray-500">{phu}</div> : null}
    </div>
  );
}

function ChuCaiDau({ ten }) {
  const chu = String(ten || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0] || '').join('').toUpperCase();
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-[15px] font-bold text-slate-600">
      {chu || '?'}
    </div>
  );
}

function AnhDaiDien({ pageId, ten }) {
  const [hong, setHong] = useState(false);
  if (!pageId || hong) return <ChuCaiDau ten={ten} />;
  return (
    <img
      src={`https://graph.facebook.com/${pageId}/picture?type=square&width=120&height=120`}
      alt=""
      onError={() => setHong(true)}
      className="h-12 w-12 shrink-0 rounded-xl object-cover"
    />
  );
}

/**
 * Ô số trong thẻ. Số luôn mang màu mực, không tô màu trang trí — màu trong trang
 * này chỉ dành cho trạng thái, tô số đẹp mắt sẽ làm loãng tín hiệu đó.
 */
/** Ô số cho thứ CHƯA CÓ dữ liệu — chữ xám, không phải số 0. */
function OTrong({ nhan, chu, phu }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{nhan}</div>
      <div className="mt-1 text-xl font-semibold leading-none text-gray-400">{chu}</div>
      {phu ? <div className="mt-1.5 text-xs text-gray-500">{phu}</div> : null}
    </div>
  );
}

function ONho({ nhan, giaTri, phu }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-400">{nhan}</div>
      <div className="mt-0.5 text-[17px] font-bold leading-none tabular-nums text-gray-900">{giaTri}</div>
      {phu && <div className="mt-1 text-[11.5px] text-gray-500">{phu}</div>}
    </div>
  );
}

/**
 * Thẻ hồ sơ một page.
 *
 * Gốc thẻ là <div role="button"> chứ không phải <button>: dải ảnh mẫu bên trong
 * cũng là nút bấm (mở khung xem ảnh), mà HTML không cho lồng <button> trong
 * <button> — trình duyệt sẽ tự gỡ, và cú bấm vào ảnh rơi về thẻ cha.
 */
function TheTrangPage({ p, onMo, onXemAnh }) {
  const imLang = p.canh_bao === 'im_lang';
  const mau = p.mau_quang_cao || [];
  return (
    <div role="button" tabIndex={0} onClick={() => onMo(p)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMo(p); }
      }}
      className="group flex w-full flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 text-left
        cursor-pointer transition-all hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md
        focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      <div className="flex items-start gap-3">
        <AnhDaiDien pageId={p.page_id} ten={p.page_name} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-bold text-gray-900">{p.page_name}</div>
          <div className="truncate text-[12px] text-gray-500">
            {p.cong_ty || '— chưa gắn công ty —'}
            {p.he_sinh_thai ? ` · ${p.he_sinh_thai}` : ''}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${imLang ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            <span className={`text-[11.5px] ${imLang ? 'text-amber-700' : 'text-gray-500'}`}>
              {imLang
                ? `Im lặng ${p.im_lang_ngay} ngày`
                : `${p.lead_7_ngay} lead trong 7 ngày`}
            </span>
          </div>
        </div>
        <span className="shrink-0 self-center text-[13px] text-gray-300 transition group-hover:text-blue-500"
          aria-hidden="true">→</span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 border-y border-gray-100 py-3 sm:grid-cols-4">
        <ONho nhan="Lead" giaTri={fmtSo(p.leads)}
          phu={p.chua_thanh_lead > 0
            ? `+${fmtSo(p.chua_thanh_lead)} chưa thành lead · ${p.so_quang_cao} quảng cáo`
            : `${p.so_quang_cao} quảng cáo`} />
        <ONho nhan="Chất lượng" giaTri={`${p.quality_rate}%`} phu={`rác ${p.junk_rate}%`} />
        <ONho nhan="Chốt" giaTri={fmtSo(p.closed)} phu={`tỉ lệ ${p.close_rate}%`} />
        <ONho
          nhan={p.spend == null ? 'Doanh thu' : 'Chi tiêu'}
          giaTri={p.spend == null ? fmtTien(p.revenue) : fmtTien(p.spend)}
          phu={p.spend == null ? null : `${fmtSo(p.cost_per_lead)} đ/lead`}
        />
      </div>

      <ThanhChatLuong byLabel={p.by_label} tong={p.leads} chuThich />

      {mau.length > 0 && (
        <div>
          <div className="mb-2 text-[11px] uppercase tracking-wide text-gray-400">
            Mẫu quảng cáo gần đây — bấm để xem lớn
          </div>
          <div className="flex gap-2">
            {mau.slice(0, 5).map((m, i) => (
              <button key={`${m.url}-${i}`} type="button"
                onClick={(e) => { e.stopPropagation(); onXemAnh(p, i); }}
                title="Xem ảnh lớn"
                className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-gray-200
                  bg-gray-50 cursor-pointer transition hover:border-blue-400
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <img src={m.url} alt="" loading="lazy"
                  onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                  className="h-full w-full object-cover" />
                {laAnhBiaVideo(m) && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/25
                    text-[13px] leading-none text-white" aria-hidden="true">▶</span>
                )}
              </button>
            ))}
            {p.so_mau > 5 && (
              <button type="button"
                onClick={(e) => { e.stopPropagation(); onXemAnh(p, Math.min(5, mau.length - 1)); }}
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg
                  border border-dashed border-gray-200 text-[12px] font-semibold text-gray-400
                  cursor-pointer transition hover:border-blue-400 hover:text-blue-600
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                +{p.so_mau - 5}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Mẫu này là ẢNH BÌA VIDEO hay ẢNH QUẢNG CÁO?
 *
 * Không tin cột fb_creative_type: nó chỉ ghi lại Facebook gửi qua trường nào,
 * và thực tế cả 302 dòng đều ghi 'video' kể cả 7 dòng là ảnh tĩnh.
 * Đọc từ đường dẫn mới đúng: /t15. là ảnh bìa video, /ads/image/ là ảnh quảng cáo.
 */
function laAnhBiaVideo(m) {
  const u = String(m?.url || '');
  if (u.includes('/ads/image/')) return false;
  if (u.includes('/t15.')) return true;
  return m?.loai === 'video';
}

/**
 * Phân tích đã cũ bao nhiêu giờ, và cũ tới mức đáng báo động chưa.
 *
 * Job chạy mỗi 60 phút. Quá 3 tiếng nghĩa là nó đã trượt ít nhất 2 lượt — gần như
 * chắc chắn đang lỗi chứ không phải chậm. Đây KHÔNG phải cảnh báo thừa: ngày
 * 04/10/2026 job chết lặng 5 ngày vì một lỗi bị nuốt vào log, màn hình vẫn hiện
 * số cũ như bình thường và không ai biết. Số cũ mà trông như số mới là loại sai
 * nguy hiểm nhất trên một trang nói về tiền.
 */
function doCu(tinhLuc) {
  if (!tinhLuc) return { gio: null, hong: true };
  const gio = (Date.now() - new Date(tinhLuc).getTime()) / 3600000;
  return { gio, hong: gio >= 3 };
}

/**
 * Đường dẫn tới các trang CHI TIẾT CÓ SẴN của CRM.
 *
 * Không dựng lại màn chi tiết ở đây: /crm/leads/:id đã có đủ thông tin khách,
 * tin nhắn Facebook, nhiệm vụ, tài liệu, lịch sử — 8.791 dòng đã chạy ổn định.
 * Mở ở TAB MỚI để không đá người dùng ra khỏi màn phân tích đang xem dở.
 */
function duongDanLead(leadId, tab) {
  if (!leadId) return null;
  return `/crm/leads/${leadId}${tab ? `?tab=${tab}` : ''}`;
}

/** Chi tiết dự án nằm ở Work Unified; /projects/:id cũ chỉ còn là chuyển hướng. */
function duongDanDuAn(duAnId) {
  return duAnId ? `/management/work-unified/${duAnId}` : null;
}

/** Đường dẫn tới bài viết gốc trên Facebook. */
function duongDanBaiViet(pageId, postId) {
  if (!pageId || !postId) return null;
  return `https://www.facebook.com/${pageId}/posts/${postId}`;
}

/**
 * Khung xem ảnh mẫu quảng cáo phóng to.
 * Ảnh Facebook cấp bằng link có hạn nên mẫu cũ sẽ hỏng — báo rõ thay vì để ô vỡ.
 */
function KhungXemAnh({ qc, chiSo, onDong, onDoi }) {
  const ds = qc?.mau_quang_cao || [];
  const [hong, setHong] = useState(false);

  useEffect(() => { setHong(false); }, [chiSo]);

  useEffect(() => {
    const phim = (e) => {
      if (e.key === 'Escape') onDong();
      if (e.key === 'ArrowRight') onDoi(1);
      if (e.key === 'ArrowLeft') onDoi(-1);
    };
    window.addEventListener('keydown', phim);
    return () => window.removeEventListener('keydown', phim);
  }, [onDong, onDoi]);

  if (!qc || !ds.length) return null;
  const anh = ds[chiSo] || ds[0];
  // Mở từ màn chi tiết thì qc là một quảng cáo (một bài); mở từ thẻ page thì qc là
  // cả page, mỗi ảnh thuộc một bài khác nhau — nên hỏi ảnh trước, hỏi qc sau.
  const lien = duongDanBaiViet(qc.page_id, anh.post_id || qc.post_id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog" aria-modal="true" onClick={onDong}>
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-gray-900">
              {qc.campaign_name || qc.ad_title || qc.page_name || qc.ad_id}
            </div>
            <code className="text-[11px] text-gray-400">{anh.ad_id || qc.ad_id || ''}</code>
          </div>
          <span className="text-[12px] text-gray-500">{chiSo + 1}/{ds.length}</span>
          <button type="button" onClick={onDong} aria-label="Đóng"
            className="rounded-lg px-2 py-1 text-[15px] text-gray-500 cursor-pointer hover:bg-gray-100">✕</button>
        </div>

        <div className="relative flex min-h-[220px] flex-1 items-center justify-center bg-gray-900">
          {hong ? (
            <div className="px-8 py-14 text-center text-[13px] leading-relaxed text-gray-300">
              Ảnh này không mở được nữa.<br />
              Facebook cấp ảnh mẫu bằng link có hạn — mẫu cũ hết hạn sau vài ngày.
              Dữ liệu không mất, chỉ riêng ảnh là không xem lại được.
            </div>
          ) : (
            <img src={anh.url} alt="" onError={() => setHong(true)}
              className="max-h-[62vh] w-auto object-contain" />
          )}
          {ds.length > 1 && (
            <>
              <button type="button" onClick={() => onDoi(-1)} aria-label="Ảnh trước"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-white cursor-pointer hover:bg-black/70">‹</button>
              <button type="button" onClick={() => onDoi(1)} aria-label="Ảnh sau"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-white cursor-pointer hover:bg-black/70">›</button>
            </>
          )}
        </div>

        {laAnhBiaVideo(anh) && (
          <div className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-[12.5px] leading-relaxed text-amber-900">
            Đây là <b>ảnh bìa của video</b>. Facebook không gửi file video qua Messenger,
            nên không phát được tại đây — bấm <b>Mở bài viết</b> để xem video gốc.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 px-4 py-2.5">
          <span className="text-[12px] text-gray-500">
            {fmtSo(qc.leads)} lead · {fmtSo(qc.closed)} đơn · {fmtSo(qc.so_mau)} mẫu
          </span>
          {lien ? (
            <a href={lien} target="_blank" rel="noopener noreferrer"
              className="ml-auto rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-50">
              Mở bài viết trên Facebook ↗
            </a>
          ) : (
            <span className="ml-auto text-[12px] text-gray-400">
              Quảng cáo này không kèm bài viết gốc
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Nhận xét cho MỘT quảng cáo, sinh bằng luật.
 * Mỗi câu phải chỉ ra được con số đứng sau nó, và phải lặp lại y hệt khi tải lại.
 * Quảng cáo là chuyện tiền bạc — không đoán.
 */
function nhanXetQuangCao(a, nenChot) {
  const r = [];
  if (a.leads < 10) {
    r.push(['tin', 'Chưa đủ dữ liệu',
      `Mới ${a.leads} lead. Cần ít nhất 10 lead mới nói được gì có ích.`]);
  } else {
    if (a.closed === 0) {
      r.push(['xau', 'Chưa ra đơn nào', `${a.leads} lead, chưa chốt được đơn nào.`]);
    } else if (a.closed >= 2 && a.close_rate >= nenChot * 1.5) {
      r.push(['tot', 'Tỉ lệ chốt cao hơn mặt bằng',
        `Chốt ${a.close_rate}% (${a.closed}/${a.leads}), mặt bằng chung ${nenChot}%.`]);
    } else if (a.closed > 0 && a.close_rate <= nenChot * 0.4) {
      r.push(['canh_bao', 'Tỉ lệ chốt thấp hơn hẳn',
        `Chốt ${a.close_rate}% so với mặt bằng ${nenChot}%. Ra lead nhưng khó thành đơn.`]);
    }
  }
  if (a.im_lang_ngay >= 7) {
    r.push(['canh_bao', `Không có lead mới ${a.im_lang_ngay} ngày`,
      'Kiểm tra quảng cáo còn chạy không, hay đã tắt.']);
  }
  if (a.closed > 0 && !(a.revenue > 0)) {
    r.push(['canh_bao', 'Đơn chốt chưa điền giá trị',
      `${a.closed} đơn để giá 0 — không tính được hiệu quả đồng tiền.`]);
  }
  return r;
}

function HangQuangCao({ a, nenChot, onDatTen, onXemAnh, onXemLead }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:p-5">
      {a.mau_quang_cao?.length > 0 && (
        <div className="flex shrink-0 gap-1.5">
          {a.mau_quang_cao.slice(0, 2).map((m, i) => (
            <button key={`${m.url}-${i}`} type="button" onClick={() => onXemAnh(a, i)}
              title="Xem phóng to"
              className="relative h-16 w-16 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 cursor-zoom-in">
              <img src={m.url} alt="" loading="lazy"
                onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                className="h-full w-full object-cover transition hover:scale-105" />
              {laAnhBiaVideo(m) && (
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] leading-4 text-white"
                  title="Ảnh bìa video — bấm để xem, video gốc nằm ở bài viết">▶</span>
              )}
              {i === 1 && a.so_mau > 2 && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[12px] font-semibold text-white">
                  +{a.so_mau - 2}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <code className="text-[11.5px] text-gray-400">{a.ad_id}</code>
          {a.campaign_name ? (
            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11.5px] font-semibold text-blue-700">
              {a.campaign_name}
            </span>
          ) : (
            <button type="button" onClick={() => onDatTen(a)}
              className="rounded-md border border-dashed border-gray-300 px-2 py-0.5 text-[11.5px] text-gray-500 cursor-pointer hover:border-gray-400 hover:text-gray-700">
              + đặt tên chiến dịch
            </button>
          )}
          {duongDanBaiViet(a.page_id, a.post_id) && (
            <a href={duongDanBaiViet(a.page_id, a.post_id)} target="_blank" rel="noopener noreferrer"
              className="text-[11.5px] text-blue-700 hover:underline">
              Xem bài viết ↗
            </a>
          )}
          <button type="button" onClick={() => onXemLead(a)}
            className="rounded-md border border-gray-300 px-2 py-0.5 text-[11.5px] font-semibold
              text-gray-700 cursor-pointer hover:border-blue-400 hover:text-blue-700">
            Xem {fmtSo(a.leads)} lead
          </button>
        </div>
        <div className="mt-1 truncate text-[13.5px] font-semibold text-gray-900" title={a.ad_title || ''}>
          {a.ad_title || '— không có tiêu đề —'}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-7 gap-y-3">
          <ONho nhan="Lead" giaTri={fmtSo(a.leads)}
            phu={a.chua_thanh_lead > 0 ? `+${fmtSo(a.chua_thanh_lead)} chưa thành lead` : null} />
          <ONho nhan="Deal" giaTri={fmtSo(a.deals)} />
          <ONho nhan="Chốt" giaTri={fmtSo(a.closed)} phu={`tỉ lệ ${a.close_rate}%`} />
          <ONho nhan="Mẫu" giaTri={fmtSo(a.so_mau)} />
          {a.spend == null
            ? <div><div className="text-[11px] uppercase tracking-wide text-gray-400">Chi tiêu</div>
                <div className="mt-0.5 text-[17px] font-semibold leading-none text-gray-300">—</div></div>
            : <ONho nhan="Chi tiêu" giaTri={fmtTien(a.spend)} phu={`${fmtSo(a.cost_per_lead)} đ/lead`} />}
        </div>

        <div className="mt-3">
          <ThanhChatLuong byLabel={a.by_label} tong={a.leads} chuThich />
        </div>

        {nhanXetQuangCao(a, nenChot).map(([muc, tieu, giai]) => {
          const m = MUC[muc] || MUC.thong_tin;
          return (
            <div key={tieu} className={`mt-2 rounded-lg border px-3 py-2 text-[12.5px] leading-relaxed ${m.lop} ${m.chu}`}>
              <b>{tieu}</b> — {giai}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Dải chẩn đoán: gọi thẳng từng endpoint và báo mã trạng thái + số dòng.
 * Có nó thì "không thấy gì" không còn là câu đố — nhìn một cái biết ngay
 * endpoint nào chết, chết vì 404 (backend cũ) hay 500 (lỗi truy vấn).
 */
function DaiChanDoan({ params }) {
  const [mo, setMo] = useState(false);
  const [kq, setKq] = useState([]);
  const [dangChay, setDangChay] = useState(false);

  const chay = useCallback(async () => {
    setDangChay(true);
    const dsGoi = [
      ['/ad-analytics/summary', params],
      ['/ad-analytics/bo-loc', {}],
      ['/ad-analytics/pages-profile', params],
      ['/ad-analytics/marketing/status', {}],
    ];
    const ra = [];
    for (const [duong, p] of dsGoi) {
      const t0 = Date.now();
      try {
        const r = await api.get(duong, { params: p });
        const d = r.data;
        const dem = Array.isArray(d?.data) ? d.data.length
          : Array.isArray(d?.pages) ? d.pages.length
            : d ? 'có' : 'rỗng';
        ra.push({ duong, ma: r.status, dem, ms: Date.now() - t0 });
      } catch (e) {
        ra.push({
          duong,
          ma: e?.response?.status || 'không gọi được',
          loi: e?.response?.data?.error || e.message,
          ms: Date.now() - t0,
        });
      }
    }
    setKq(ra);
    setDangChay(false);
  }, [params]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button type="button" onClick={() => { setMo(!mo); if (!mo && !kq.length) chay(); }}
        className="flex w-full items-center justify-between px-4 py-2 text-left text-[12.5px] cursor-pointer">
        <span className="text-gray-600">Chẩn đoán kết nối</span>
        <span className="text-blue-700">{mo ? 'Thu gọn' : 'Mở'}</span>
      </button>
      {mo && (
        <div className="space-y-1 border-t border-gray-100 px-4 py-2.5">
          {dangChay && <div className="text-[12.5px] text-gray-500">Đang gọi…</div>}
          {kq.map((x) => (
            <div key={x.duong} className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <span className={`inline-block h-2 w-2 rounded-full ${x.ma === 200 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <code className="text-gray-700">{x.duong}</code>
              <b className={x.ma === 200 ? 'text-emerald-700' : 'text-rose-700'}>{x.ma}</b>
              {x.dem !== undefined && <span className="text-gray-500">{x.dem} dòng</span>}
              <span className="text-gray-400">{x.ms}ms</span>
              {x.loi && <span className="text-rose-700">{x.loi}</span>}
            </div>
          ))}
          <button type="button" onClick={chay} disabled={dangChay}
            className="mt-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[12px] cursor-pointer hover:bg-gray-50 disabled:opacity-50">
            Gọi lại
          </button>
        </div>
      )}
    </div>
  );
}

/** Nhận xét cho MỘT BÀI VIẾT. Dùng lại luật của quảng cáo, thêm luật riêng của bài. */
function nhanXetBaiViet(b, nenChot) {
  const r = nhanXetQuangCao(b, nenChot);
  if (b.so_quang_cao > 1) {
    r.push(['thong_tin', `Bài này đang chạy bằng ${b.so_quang_cao} quảng cáo`,
      'Nhìn theo từng quảng cáo thì số lead bị xé nhỏ nên dễ tưởng là ít — gom theo bài mới thấy đúng quy mô.']);
  }
  return r;
}

function HangBaiViet({ b, nenChot, onXemAnh, onXemLead }) {
  const lien = duongDanBaiViet(b.page_id, b.post_id);
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:p-5">
      {b.mau_quang_cao?.length > 0 && (
        <div className="flex shrink-0 gap-1.5">
          {b.mau_quang_cao.slice(0, 2).map((m, i) => (
            <button key={`${m.url}-${i}`} type="button" onClick={() => onXemAnh(b, i)}
              title="Xem phóng to"
              className="relative h-20 w-20 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 cursor-zoom-in">
              <img src={m.url} alt="" loading="lazy"
                onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                className="h-full w-full object-cover transition hover:scale-105" />
              {laAnhBiaVideo(m) && (
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] leading-4 text-white"
                  title="Ảnh bìa video — bấm để xem, video gốc nằm ở bài viết">▶</span>
              )}
              {i === 1 && b.so_mau > 2 && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[12px] font-semibold text-white">
                  +{b.so_mau - 2}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <code className="text-[11.5px] text-gray-400">bài {b.post_id}</code>
          <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11.5px] text-gray-600">
            {b.so_quang_cao} quảng cáo
          </span>
          <button type="button" onClick={() => onXemLead(b)}
            className="rounded-md border border-gray-300 px-2 py-0.5 text-[11.5px] font-semibold
              text-gray-700 cursor-pointer hover:border-blue-400 hover:text-blue-700">
            Xem {fmtSo(b.leads)} lead
          </button>
          {lien && (
            <a href={lien} target="_blank" rel="noopener noreferrer"
              className="text-[11.5px] text-blue-700 hover:underline">
              Mở bài viết ↗
            </a>
          )}
        </div>
        <div className="mt-1 truncate text-[13.5px] font-semibold text-gray-900" title={b.tieu_de || ''}>
          {b.tieu_de || '— không có tiêu đề —'}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-7 gap-y-3">
          <ONho nhan="Lead" giaTri={fmtSo(b.leads)}
            phu={b.chua_thanh_lead > 0 ? `+${fmtSo(b.chua_thanh_lead)} chưa thành lead` : null} />
          <ONho nhan="Deal" giaTri={fmtSo(b.deals)} />
          <ONho nhan="Chốt" giaTri={fmtSo(b.closed)} phu={`tỉ lệ ${b.close_rate}%`} />
          <ONho nhan="Mẫu" giaTri={fmtSo(b.so_mau)} />
          {b.spend == null
            ? <div><div className="text-[11px] uppercase tracking-wide text-gray-400">Chi tiêu</div>
                <div className="mt-0.5 text-[17px] font-semibold leading-none text-gray-300">—</div></div>
            : <ONho nhan="Chi tiêu" giaTri={fmtTien(b.spend)} phu={`${fmtSo(b.cost_per_lead)} đ/lead`} />}
        </div>

        <div className="mt-3">
          <ThanhChatLuong byLabel={b.by_label} tong={b.leads} chuThich />
        </div>

        {nhanXetBaiViet(b, nenChot).map(([muc, tieu, giai]) => {
          const m = MUC[muc] || MUC.thong_tin;
          return (
            <div key={tieu} className={`mt-2 rounded-lg border px-3 py-2 text-[12.5px] leading-relaxed ${m.lop} ${m.chu}`}>
              <b>{tieu}</b> — {giai}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Danh sách TỪNG LEAD của một bài viết (hoặc một quảng cáo).
 *
 * Màn gom chỉ nói "181 lead, 3 đơn"; khung này nói 178 người còn lại đang ở đâu.
 * Mỗi dòng là một người có thật trong CRM — không suy diễn, không gộp.
 */
function KhungDanhSachLead({ mo, params, onDong }) {
  const [dang, setDang] = useState(true);
  const [loi, setLoi] = useState('');
  const [ds, setDs] = useState([]);
  const [tt, setTt] = useState(null);
  const [bai, setBai] = useState(null);
  const [locLoai, setLocLoai] = useState('tat_ca');   // tat_ca | deal | chot | du_an

  useEffect(() => {
    const phim = (e) => { if (e.key === 'Escape') onDong(); };
    window.addEventListener('keydown', phim);
    return () => window.removeEventListener('keydown', phim);
  }, [onDong]);

  useEffect(() => {
    let huy = false;
    setDang(true);
    setLoi('');
    api.get('/ad-analytics/post-leads', {
      params: { ...params, page_id: mo.page_id, ...(mo.post_id ? { post_id: mo.post_id } : {}), ...(mo.ad_id ? { ad_id: mo.ad_id } : {}) },
    }).then((r) => {
      if (huy) return;
      setDs(r.data?.data || []);
      setTt(r.data?.tom_tat || null);
      setBai(r.data?.bai || null);
    }).catch((e) => {
      if (huy) return;
      setDs([]);
      setLoi(e?.response?.status === 404
        ? 'Backend chưa có endpoint /post-leads — khởi động lại backend để nạp code mới.'
        : (e?.response?.data?.error || e.message || 'Không tải được danh sách lead'));
    }).finally(() => { if (!huy) setDang(false); });
    return () => { huy = true; };
  }, [mo.page_id, mo.post_id, mo.ad_id, params]);

  const loc = useMemo(() => {
    if (locLoai === 'deal') return ds.filter((x) => x.loai === 'deal');
    if (locLoai === 'chot') return ds.filter((x) => x.da_chot);
    if (locLoai === 'du_an') return ds.filter((x) => x.du_an?.length > 0);
    return ds;
  }, [ds, locLoai]);

  const NUT = [
    ['tat_ca', `Tất cả ${tt ? `(${tt.leads})` : ''}`],
    ['deal', `Deal ${tt ? `(${tt.deals})` : ''}`],
    ['chot', `Đã chốt ${tt ? `(${tt.closed})` : ''}`],
    ['du_an', `Có dự án ${tt ? `(${tt.so_du_an})` : ''}`],
  ];

  const lien = duongDanBaiViet(mo.page_id, mo.post_id || bai?.post_id);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 sm:p-8"
      role="dialog" aria-modal="true" onClick={onDong}>
      <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 border-b border-gray-200 px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-bold text-gray-900">
              {mo.nhan || bai?.tieu_de || 'Danh sách lead'}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11.5px] text-gray-400">
              <code>{mo.post_id ? `bài ${mo.post_id}` : `quảng cáo ${mo.ad_id}`}</code>
              {bai?.so_quang_cao > 0 && <span>· {bai.so_quang_cao} quảng cáo</span>}
              {lien && (
                <a href={lien} target="_blank" rel="noopener noreferrer"
                  className="text-blue-700 hover:underline">Mở bài viết ↗</a>
              )}
            </div>
          </div>
          <button type="button" onClick={onDong} aria-label="Đóng"
            className="rounded-lg px-2 py-1 text-[15px] text-gray-500 cursor-pointer hover:bg-gray-100">✕</button>
        </div>

        {tt && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-gray-200 bg-gray-50 px-5 py-2.5">
            <ONho nhan="Lead" giaTri={fmtSo(tt.leads)} />
            <ONho nhan="Deal" giaTri={fmtSo(tt.deals)} />
            <ONho nhan="Đã chốt" giaTri={fmtSo(tt.closed)} />
            <ONho nhan="Doanh thu" giaTri={fmtTien(tt.revenue)}
              phu={tt.don_chua_co_gia > 0 ? `${tt.don_chua_co_gia} đơn để giá 0` : null} />
            <ONho nhan="Dự án" giaTri={fmtSo(tt.so_du_an)} />
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 border-b border-gray-200 px-5 py-2">
          {NUT.map(([k, nhan]) => (
            <button key={k} type="button" onClick={() => setLocLoai(k)}
              className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold cursor-pointer transition
                ${locLoai === k ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {nhan}
            </button>
          ))}
        </div>

        <div className="min-h-[160px] flex-1 overflow-auto">
          {dang && <div className="px-5 py-10 text-center text-[13px] text-gray-500">Đang tải…</div>}
          {!dang && loi && (
            <div className="m-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-900">{loi}</div>
          )}
          {!dang && !loi && !loc.length && (
            <div className="px-5 py-10 text-center text-[13px] text-gray-500">Không có dòng nào khớp bộ lọc này.</div>
          )}
          {!dang && !loi && loc.length > 0 && (
            <table className="w-full border-collapse text-[12.5px]">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="px-5 py-2 font-semibold">Khách</th>
                  <th className="px-3 py-2 font-semibold">Vào lúc</th>
                  <th className="px-3 py-2 font-semibold">Chất lượng</th>
                  <th className="px-3 py-2 font-semibold">Giai đoạn</th>
                  <th className="px-3 py-2 text-right font-semibold">Giá trị</th>
                  <th className="px-3 py-2 font-semibold">Dự án</th>
                  <th className="px-5 py-2 font-semibold">Phụ trách</th>
                </tr>
              </thead>
              <tbody>
                {loc.map((x) => {
                  const mau = THANG_CHAT_LUONG[x.nhan] || null;
                  return (
                    <tr key={x.lead_id} className="border-b border-gray-100 align-top hover:bg-gray-50">
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <a href={duongDanLead(x.lead_id)} target="_blank" rel="noopener noreferrer"
                            title="Mở hồ sơ đầy đủ ở tab mới"
                            className="font-semibold text-gray-900 hover:text-blue-700 hover:underline">
                            {x.ten}
                          </a>
                          {x.da_chot && (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-emerald-900">
                              đã chốt
                            </span>
                          )}
                          {!x.da_chot && x.loai === 'deal' && (
                            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-blue-700">
                              deal
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                          <code>{x.ma || x.lead_id.slice(0, 8)}</code>
                          {x.dien_thoai && <span className="text-gray-600">{x.dien_thoai}</span>}
                          <a href={duongDanLead(x.lead_id, 'facebook')} target="_blank" rel="noopener noreferrer"
                            className="text-blue-700 hover:underline">Tin nhắn ↗</a>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">{fmtNgay(x.ngay_vao)}</td>
                      <td className="px-3 py-2.5">
                        {mau ? (
                          <span className="inline-flex items-center gap-1.5 text-gray-700">
                            <span className="h-2 w-2 rounded-full" style={{ background: mau }} />
                            {TEN_NHAN[x.nhan] || x.nhan}{x.diem != null ? ` · ${x.diem}` : ''}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">{x.giai_doan || <span className="text-gray-300">—</span>}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right text-gray-700">
                        {x.gia_tri > 0 ? fmtTien(x.gia_tri)
                          : <span className={x.da_chot ? 'text-amber-700' : 'text-gray-300'}>
                              {x.da_chot ? 'chưa điền giá' : '—'}
                            </span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {x.du_an?.length ? x.du_an.map((d) => (
                          <a key={d.id} href={duongDanDuAn(d.id)} target="_blank" rel="noopener noreferrer"
                            title="Mở chi tiết dự án ở tab mới"
                            className="block text-gray-700 hover:text-blue-700 hover:underline">
                            <code className="text-[11px] text-gray-500">{d.ma || d.id.slice(0, 8)}</code>
                            {d.ten ? ` ${d.ten}` : ''}
                            {d.trang_thai ? <span className="text-gray-400"> · {d.trang_thai}</span> : null}
                          </a>
                        )) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-2.5 text-gray-600">{x.phu_trach || <span className="text-gray-300">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {!dang && !loi && loc.length > 0 && (
          <div className="border-t border-gray-200 px-5 py-2 text-[12px] text-gray-500">
            Bấm vào <b>tên khách</b> để mở hồ sơ đầy đủ (thông tin, nhiệm vụ, tài liệu, lịch sử),
            hoặc <b>Tin nhắn ↗</b> để vào thẳng hội thoại Facebook. Cả hai mở ở tab mới nên màn
            phân tích này không mất.
          </div>
        )}

        {!dang && !loi && tt && tt.so_du_an === 0 && (
          <div className="border-t border-gray-200 bg-amber-50 px-5 py-2 text-[12px] leading-relaxed text-amber-900">
            Chưa có dự án liên kết nằm trong phạm vi anh được xem ở danh sách này.
          </div>
        )}
      </div>
    </div>
  );
}

function KhungMarketing({ trangThai, onXong }) {
  const [mo, setMo] = useState(false);
  const [actId, setActId] = useState('');
  const [ten, setTen] = useState('');
  const [token, setToken] = useState('');
  const [dangChay, setDangChay] = useState('');
  const [bao, setBao] = useState(null);

  const daNoi = !!trangThai?.da_noi;
  const ds = trangThai?.tai_khoan || [];

  const goi = async (viec, ham) => {
    setDangChay(viec);
    setBao(null);
    try {
      setBao(await ham());
    } catch (e) {
      setBao({ ok: false, chu: e?.response?.data?.error || e.message || 'Không gọi được' });
    } finally {
      setDangChay('');
    }
  };

  const thu = () => goi('thu', async () => {
    const r = await api.post('/ad-analytics/marketing/test', {
      ad_account_id: actId.trim(),
      access_token: token.trim() || undefined,
    });
    const d = r.data || {};
    return { ok: true, chu: `Kết nối được: ${d.ten || d.ad_account_id} · tiền tệ ${d.tien_te || '—'}` };
  });

  const luu = () => goi('luu', async () => {
    await api.put('/ad-analytics/marketing/account', {
      ad_account_id: actId.trim(),
      ten: ten.trim() || null,
      access_token: token.trim() || undefined,
    });
    setToken('');
    if (onXong) await onXong();
    return { ok: true, chu: 'Đã lưu tài khoản. Bấm "Đồng bộ ngay" để kéo tên chiến dịch về.' };
  });

  const dongBo = () => goi('dongbo', async () => {
    const r = await api.post('/ad-analytics/marketing/sync', { ngay: 30 });
    const d = r.data || {};
    const soAd = (d.ket_qua || []).reduce((s, x) => s + (x.so_ad || 0), 0);
    const hong = (d.ket_qua || []).filter((x) => !x.ok);
    if (onXong) await onXong();
    if (hong.length) return { ok: false, chu: `${hong.length} tài khoản lỗi: ${hong[0].loi}` };
    return { ok: true, chu: `Đã kéo ${soAd} quảng cáo về, phân tích lại ${d.phan_tich_lai ?? 0} quảng cáo.` };
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <button type="button" onClick={() => setMo(!mo)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left cursor-pointer">
        <span className="flex items-center gap-2 text-[13px]">
          <span className={`h-2 w-2 rounded-full ${daNoi ? 'bg-emerald-500' : 'bg-gray-300'}`} />
          <b className="text-gray-900">Marketing API</b>
          <span className="text-gray-500">
            {daNoi
              ? `${ds.length} tài khoản · tên chiến dịch và chi tiêu tự về`
              : 'Chưa nối — tên chiến dịch phải đặt tay, chưa có chi tiêu'}
          </span>
        </span>
        <span className="text-[12px] text-blue-700">{mo ? 'Thu gọn' : 'Mở'}</span>
      </button>

      {mo && (
        <div className="space-y-3 border-t border-gray-100 px-4 py-3">
          {ds.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-[12.5px]">
                <thead className="bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Tài khoản</th>
                    <th className="px-3 py-2">Token</th>
                    <th className="px-3 py-2">Đồng bộ lần cuối</th>
                    <th className="px-3 py-2">Kết quả</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ds.map((x) => (
                    <tr key={x.ad_account_id}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900">{x.ten || x.ad_account_id}</div>
                        <code className="text-[11px] text-gray-400">{x.ad_account_id}</code>
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {x.co_token ? `đã lưu (${x.do_dai_token} ký tự)` : '— chưa có —'}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{fmtNgay(x.lan_dong_bo_cuoi)}</td>
                      <td className="px-3 py-2">
                        {x.ket_qua_cuoi?.ok
                          ? <span className="text-emerald-700">{x.ket_qua_cuoi.so_ad || 0} quảng cáo</span>
                          : <span className="text-rose-700">{x.ket_qua_cuoi?.loi || '—'}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-3">
            <input value={actId} onChange={(e) => setActId(e.target.value)} placeholder="Ad Account ID (act_…)"
              className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-[13px]" />
            <input value={ten} onChange={(e) => setTen(e.target.value)} placeholder="Tên gợi nhớ (vd: NextGo)"
              className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-[13px]" />
            <input value={token} onChange={(e) => setToken(e.target.value)} type="password"
              autoComplete="new-password" placeholder="Access token có quyền ads_read"
              className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-[13px]" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={thu} disabled={!actId.trim() || !!dangChay}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[13px] font-semibold cursor-pointer hover:bg-gray-50 disabled:opacity-50">
              {dangChay === 'thu' ? 'Đang thử…' : 'Thử kết nối'}
            </button>
            <button type="button" onClick={luu} disabled={!actId.trim() || !!dangChay}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-[13px] font-semibold text-white cursor-pointer hover:bg-blue-700 disabled:opacity-50">
              {dangChay === 'luu' ? 'Đang lưu…' : 'Lưu tài khoản'}
            </button>
            <button type="button" onClick={dongBo} disabled={!daNoi || !!dangChay}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[13px] font-semibold text-emerald-800 cursor-pointer hover:bg-emerald-100 disabled:opacity-50">
              {dangChay === 'dongbo' ? 'Đang đồng bộ…' : 'Đồng bộ ngay'}
            </button>
            <span className="text-[12px] text-gray-500">Để trống ô token khi sửa = giữ token cũ.</span>
          </div>

          {bao && (
            <div className={`rounded-lg border px-3 py-2 text-[13px] ${
              bao.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}>
              {bao.chu}
            </div>
          )}

          <p className="text-[12px] leading-relaxed text-gray-500">
            Token chỉ được lưu trong cơ sở dữ liệu và không bao giờ hiện lại trên màn hình.
            Tên chiến dịch anh đã tự đặt tay sẽ <b>không</b> bị đồng bộ ghi đè.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * @param {boolean} embedded — đang nằm trong tab của trang Facebook:
 *   bỏ tiêu đề riêng (nhãn tab đã nói) và tự cuộn trong khung tab.
 */
export default function AdAnalyticsPage({ embedded = false }) {
  const reportRequestId = useRef(0);
  const refreshReportRef = useRef(null);
  const [tab, setTab] = useState('campaigns');
  const [tongQuan, setTongQuan] = useState(null);
  const [rows, setRows] = useState([]);
  const [nhanXet, setNhanXet] = useState([]);
  const [tomTat, setTomTat] = useState(null);
  const [tinhLuc, setTinhLuc] = useState(null);
  const [dangChayLai, setDangChayLai] = useState(false);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState('');
  const [tuNgay, setTuNgay] = useState('');
  const [loiThaoTac, setLoiThaoTac] = useState('');
  const [denNgay, setDenNgay] = useState('');
  const [congTy, setCongTy] = useState('');
  const [pageId, setPageId] = useState('');
  const [dsCongTy, setDsCongTy] = useState([]);
  const [dsPage, setDsPage] = useState([]);
  const [heSinhThai, setHeSinhThai] = useState(null);
  const [manHinh, setManHinh] = useState('the');   // 'the' = lưới hồ sơ page, 'chi_tiet' = 4 tab
  const [hoSo, setHoSo] = useState([]);
  const [taiHoSo, setTaiHoSo] = useState(true);
  // Mặc định 'bai': gom theo bài viết là cách nhìn đúng quy mô nhất —
  // một bài có thể đang chạy bằng cả chục quảng cáo.
  const [kieuCt, setKieuCt] = useState('bai');
  const [dsBai, setDsBai] = useState([]);
  const [taiDsBai, setTaiDsBai] = useState(false);
  const [dsQc, setDsQc] = useState([]);
  const [taiDsQc, setTaiDsQc] = useState(false);
  const [xemAnh, setXemAnh] = useState(null);   // { qc, chiSo }
  // { page_id, post_id?, ad_id?, nhan } — mở danh sách từng lead của bài/quảng cáo
  const [xemLead, setXemLead] = useState(null);
  const [dangSua, setDangSua] = useState(null);   // ad_id đang đặt tên
  const [tenMoi, setTenMoi] = useState('');
  const [chon, setChon] = useState(() => new Set());
  const [tenLo, setTenLo] = useState('');
  const [dangLuu, setDangLuu] = useState(false);
  const [mkt, setMkt] = useState(null);

  const params = useMemo(() => {
    const p = {};
    if (tuNgay) p.from = tuNgay;
    if (denNgay) p.to = denNgay;
    if (congTy) p.company_id = congTy;
    if (pageId) p.page_id = pageId;
    return p;
  }, [tuNgay, denNgay, congTy, pageId]);

  // Page hiện trong ô chọn: cắt theo công ty đang chọn.
  const dsPageHienThi = useMemo(
    () => (congTy ? dsPage.filter((x) => x.company_id === congTy) : dsPage),
    [dsPage, congTy],
  );
  const tenCongTyDangChon = useMemo(
    () => dsCongTy.find((x) => x.id === congTy)?.ten || '',
    [dsCongTy, congTy],
  );
  const coLoc = !!(congTy || pageId || tuNgay || denNgay);
  // Nút nhanh nào đang đúng với khoảng ngày hiện tại — để tô trạng thái chọn.
  const khoangDangChon = useMemo(() => {
    if (!tuNgay || !denNgay) return null;
    const n = Math.round((new Date(denNgay) - new Date(tuNgay)) / 86400000) + 1;
    return NHANH.some((x) => x.ngay === n) ? n : null;
  }, [tuNgay, denNgay]);
  const pageDangChon = useMemo(
    () => (pageId ? dsPage.find((x) => x.page_id === pageId) || null : null),
    [dsPage, pageId],
  );
  // Mặt bằng tỉ lệ chốt để so từng quảng cáo — lấy từ tổng quan, không bịa.
  const nenChot = tongQuan?.tu_quang_cao?.close_rate || 0;

  // Đổi công ty mà page đang chọn không thuộc công ty đó thì bỏ chọn page,
  // nếu không bộ lọc sẽ ra rỗng một cách khó hiểu.
  const doiCongTy = useCallback((idMoi) => {
    setCongTy(idMoi);
    setPageId((hienTai) => {
      if (!hienTai || !idMoi) return hienTai;
      const p = dsPage.find((x) => x.page_id === hienTai);
      return p && p.company_id === idMoi ? hienTai : '';
    });
  }, [dsPage]);

  const datKhoang = useCallback((soNgay) => {
    const nay = new Date();
    setDenNgay(ngayYMD(nay));
    setTuNgay(ngayYMD(new Date(nay.getTime() - (soNgay - 1) * 86400000)));
  }, []);

  const xoaLoc = useCallback(() => {
    setCongTy(''); setPageId(''); setTuNgay(''); setDenNgay('');
  }, []);

  const tai = useCallback(async () => {
    const requestId = ++reportRequestId.current;
    const isCurrent = () => requestId === reportRequestId.current;
    setDangTai(true);
    setLoi('');
    // A new filter invalidates the previous snapshot immediately.
    setTongQuan(null);
    setRows([]);
    setNhanXet([]);
    setTomTat(null);
    setTinhLuc(null);
    try {
      const tq = await api.get('/ad-analytics/summary', { params });
      if (!isCurrent()) return;
      const ds = await api.get(tab === 'insights'
        ? '/ad-analytics/insights' : `/ad-analytics/${tab}`, { params });
      if (!isCurrent()) return;
      // Commit one consistent report only after both reads succeed.
      setTongQuan(tq.data || null);
      if (tab === 'insights') {
        setNhanXet(ds.data?.data || []);
        setTomTat(ds.data?.tom_tat || null);
        setTinhLuc(ds.data?.tinh_luc || null);
        setRows([]);
      } else {
        setRows(ds.data?.data || []);
      }
    } catch (e) {
      if (!isCurrent()) return;
      setTongQuan(null);
      setRows([]);
      setNhanXet([]);
      setTomTat(null);
      setTinhLuc(null);
      setLoi(e?.response?.data?.error || 'Không tải được dữ liệu quảng cáo');
    } finally {
      if (isCurrent()) setDangTai(false);
    }
  }, [tab, params]);

  const taiMkt = useCallback(async () => {
    try {
      const r = await api.get('/ad-analytics/marketing/status');
      setMkt(r.data || null);
    } catch { setMkt(null); }
  }, []);

  useEffect(() => {
    let huy = false;
    api.get('/ad-analytics/bo-loc')
      .then((r) => {
        if (huy) return;
        setDsCongTy(r.data?.cong_ty || []);
        setDsPage(r.data?.pages || []);
        setHeSinhThai(r.data?.he_sinh_thai || null);
      })
      .catch(() => {});
    return () => { huy = true; };
  }, []);

  const taiHoSoPage = useCallback(async () => {
    const requestId = ++reportRequestId.current;
    const isCurrent = () => requestId === reportRequestId.current;
    setHoSo([]);
    setTongQuan(null);
    setLoi('');
    setTaiHoSo(true);
    try {
      const [r, tq] = await Promise.all([
        api.get('/ad-analytics/pages-profile', { params }),
        api.get('/ad-analytics/summary', { params }),
      ]);
      if (!isCurrent()) return;
      setHoSo(r.data?.data || []);
      setTongQuan(tq.data || null);
    } catch (e) {
      if (!isCurrent()) return;
      setHoSo([]);
      setTongQuan(null);
      setLoi(e?.response?.data?.error || 'Chưa tải được báo cáo. Vui lòng thử lại.');
    } finally {
      if (isCurrent()) setTaiHoSo(false);
    }
  }, [params]);

  const taiDanhSachQc = useCallback(async () => {
    const requestId = ++reportRequestId.current;
    const isCurrent = () => requestId === reportRequestId.current;
    setDsQc([]);
    setTongQuan(null);
    setLoi('');
    setTaiDsQc(true);
    try {
      if (!pageId) return;
      const [r, tq] = await Promise.all([
        api.get('/ad-analytics/page-ads', { params }),
        api.get('/ad-analytics/summary', { params }),
      ]);
      if (!isCurrent()) return;
      setDsQc(r.data?.data || []);
      setTongQuan(tq.data || null);
    } catch (e) {
      if (!isCurrent()) return;
      setDsQc([]);
      setTongQuan(null);
      setLoi(e?.response?.data?.error || 'Chưa tải được báo cáo. Vui lòng thử lại.');
    } finally {
      if (isCurrent()) setTaiDsQc(false);
    }
  }, [pageId, params]);

  const taiDanhSachBai = useCallback(async () => {
    const requestId = ++reportRequestId.current;
    const isCurrent = () => requestId === reportRequestId.current;
    setDsBai([]);
    setTongQuan(null);
    setLoi('');
    setTaiDsBai(true);
    try {
      if (!pageId) return;
      const [r, tq] = await Promise.all([
        api.get('/ad-analytics/page-posts', { params }),
        api.get('/ad-analytics/summary', { params }),
      ]);
      if (!isCurrent()) return;
      setDsBai(r.data?.data || []);
      setTongQuan(tq.data || null);
    } catch (e) {
      if (!isCurrent()) return;
      setDsBai([]);
      setTongQuan(null);
      setLoi(e?.response?.data?.error || 'Chưa tải được báo cáo. Vui lòng thử lại.');
    } finally {
      if (isCurrent()) setTaiDsBai(false);
    }
  }, [pageId, params]);

  const taiHienTai = manHinh === 'the' ? taiHoSoPage
    : kieuCt === 'bai' ? taiDanhSachBai : kieuCt === 'qc' ? taiDanhSachQc : tai;
  useEffect(() => {
    setTongQuan(null); setHoSo([]); setDsBai([]); setDsQc([]); setRows([]);
    setNhanXet([]); setTomTat(null); setTinhLuc(null);
    setTaiHoSo(false); setTaiDsBai(false); setTaiDsQc(false); setDangTai(false);
    setXemLead(null); setXemAnh(null); setChon(new Set());
    setLoiThaoTac('');
    refreshReportRef.current = taiHienTai;
    taiHienTai();
    return () => {
      refreshReportRef.current = null;
      reportRequestId.current += 1;
    };
  }, [taiHienTai]);
  useEffect(() => { taiMkt(); }, [taiMkt]);

  const luuTen = useCallback(async (adId) => {
    if (!tenMoi.trim()) return;
    const actionLoader = refreshReportRef.current;
    setLoiThaoTac('');
    setDangLuu(true);
    try {
      await api.put(`/ad-analytics/ads/${adId}`, { campaign_name: tenMoi.trim() });
      setDangSua(null);
      setTenMoi('');
      await refreshReportRef.current?.();
    } catch (e) {
      if (actionLoader && actionLoader === refreshReportRef.current) {
        setLoiThaoTac(e?.response?.data?.error || 'Không lưu được tên chiến dịch');
      }
    } finally {
      setDangLuu(false);
    }
  }, [tenMoi, tai]);

  const luuTenLo = useCallback(async () => {
    if (!tenLo.trim() || !chon.size) return;
    const actionLoader = refreshReportRef.current;
    setLoiThaoTac('');
    setDangLuu(true);
    try {
      await api.post('/ad-analytics/ads/bulk-name', { ad_ids: [...chon], campaign_name: tenLo.trim() });
      setChon(new Set());
      setTenLo('');
      await refreshReportRef.current?.();
    } catch (e) {
      if (actionLoader && actionLoader === refreshReportRef.current) {
        setLoiThaoTac(e?.response?.data?.error || 'Không đặt tên hàng loạt được');
      }
    } finally {
      setDangLuu(false);
    }
  }, [tenLo, chon, tai]);

  const chayLaiPhanTich = useCallback(async () => {
    const actionLoader = refreshReportRef.current;
    setLoiThaoTac('');
    setDangChayLai(true);
    try {
      await api.post('/ad-analytics/insights/run', {});
      await refreshReportRef.current?.();
    } catch (e) {
      if (actionLoader && actionLoader === refreshReportRef.current) {
        setLoiThaoTac(e?.response?.data?.error || 'Không chạy lại được phân tích');
      }
    } finally {
      setDangChayLai(false);
    }
  }, [tai]);

  const doiChon = (adId) => setChon((cur) => {
    const n = new Set(cur);
    if (n.has(adId)) n.delete(adId); else n.add(adId);
    return n;
  });

  return (
    <div className={embedded
      ? 'h-full space-y-5 overflow-y-auto p-6'
      : 'p-4 sm:p-6 space-y-5'}>
      {!embedded && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Hiệu quả quảng cáo Facebook</h1>
            <p className="mt-0.5 text-[13px] text-gray-500">
              Lead đến từ quảng cáo nào, chất lượng ra sao, chốt được bao nhiêu. Mỗi Lead tính một lần trong từng nhóm; không cộng các nhóm để suy số khách duy nhất.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-3.5 py-3">

          {/* Cụm 1 — phạm vi: xem của ai */}
          <div className="flex flex-wrap items-center gap-2">
            {heSinhThai && (
              <span className="text-[12.5px] text-gray-500"
                title="Hệ sinh thái lấy từ tài khoản đăng nhập, không đổi được ở đây">
                {heSinhThai.ten}
              </span>
            )}
            <span className="text-gray-300">/</span>
            <select value={congTy} onChange={(e) => doiCongTy(e.target.value)}
              className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[13px] cursor-pointer hover:bg-gray-100">
              <option value="">Tất cả công ty</option>
              {dsCongTy.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ten}{c.lead_quang_cao === 0 ? ' — chưa có lead QC' : ''}
                </option>
              ))}
            </select>
            <span className="text-gray-300">/</span>
            <select value={pageId} onChange={(e) => setPageId(e.target.value)}
              className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[13px] cursor-pointer hover:bg-gray-100">
              <option value="">{congTy ? 'Tất cả page của công ty' : 'Tất cả page'}</option>
              {dsPageHienThi.map((p) => (
                <option key={p.page_id} value={p.page_id}>
                  {p.page_name}
                  {p.lead_quang_cao == null ? '' : p.lead_quang_cao === 0 ? ' — chưa có lead QC' : ` (${p.lead_quang_cao})`}
                </option>
              ))}
            </select>
          </div>

          {/* Cụm 2 — thời gian: xem lúc nào */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-gray-200">
              {NHANH.map((n) => (
                <button key={n.nhan} type="button" onClick={() => datKhoang(n.ngay)}
                  className={`border-l border-gray-200 px-2.5 py-1.5 text-[12.5px] cursor-pointer first:border-l-0 ${
                    khoangDangChon === n.ngay
                      ? 'bg-blue-600 font-semibold text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}>
                  {n.nhan}
                </button>
              ))}
            </div>
            <input type="date" value={tuNgay} onChange={(e) => setTuNgay(e.target.value)}
              aria-label="Từ ngày"
              className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[13px]" />
            <span className="text-[12px] text-gray-400">→</span>
            <input type="date" value={denNgay} onChange={(e) => setDenNgay(e.target.value)}
              aria-label="Đến ngày"
              className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[13px]" />
          </div>

          <div className="ml-auto flex items-center gap-2">
            {coLoc && (
              <button type="button" onClick={xoaLoc}
                className="rounded-lg px-2.5 py-1.5 text-[12.5px] text-gray-500 cursor-pointer hover:bg-gray-100 hover:text-gray-700">
                Xoá lọc
              </button>
            )}
            <button type="button" onClick={taiHienTai}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-gray-700 cursor-pointer hover:bg-gray-50">
              Tải lại
            </button>
          </div>
        </div>
      </div>
      {coLoc && (
        <p className="-mt-2 text-[12px] text-gray-500">
          Đang lọc: {tenCongTyDangChon || 'tất cả công ty'}
          {pageId ? ` · ${dsPage.find((p) => p.page_id === pageId)?.page_name || pageId}` : ''}
          {tuNgay || denNgay ? ` · ${tuNgay || '…'} → ${denNgay || 'nay'}` : ' · toàn bộ thời gian'}
        </p>
      )}

      {loi && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-[13px] text-rose-800">{loi}</div>}
      {loiThaoTac && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">{loiThaoTac}</div>}

      {tongQuan && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <OSoLieu nhan="Lead từ quảng cáo" giaTri={fmtSo(tongQuan.tu_quang_cao?.leads)}
              phu={`${tongQuan.so_quang_cao} quảng cáo · ${tongQuan.so_page || 0} page`} />
            <OSoLieu nhan="Lead chất lượng" giaTri={`${tongQuan.tu_quang_cao?.quality_rate || 0}%`}
              phu={`rác ${tongQuan.tu_quang_cao?.junk_rate || 0}%`} />
            <OSoLieu nhan="Đơn đã chốt" giaTri={fmtSo(tongQuan.tu_quang_cao?.closed)}
              phu={`tỉ lệ chốt ${tongQuan.tu_quang_cao?.close_rate || 0}%`} />
            {/* Chưa nối Marketing API thì ghi "chưa có" chứ KHÔNG hiện số 0 —
                số 0 đọc như đã tiêu 0 đồng, sai hẳn nghĩa. */}
            {tongQuan.co_chi_tieu ? (
              <OSoLieu nhan="Chi tiêu" giaTri={fmtTien(tongQuan.tu_quang_cao?.spend)}
                phu={`${fmtSo(tongQuan.tu_quang_cao?.cost_per_lead)} đ/lead`
                  + `${tongQuan.tu_quang_cao?.roas != null ? ` · ROAS ${tongQuan.tu_quang_cao.roas}` : ''}`} />
            ) : (
              <OTrong nhan="Chi tiêu" chu="chưa có" phu="cần nối Marketing API" />
            )}
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] leading-relaxed text-amber-900">
            <b>Hai thứ Facebook không gửi qua Messenger:</b> tên chiến dịch và số tiền đã tiêu.
            Webhook chỉ mang <code>ad_id</code>, nên quảng cáo hiện bằng dãy số và ảnh mẫu.
            {tongQuan.don_chua_co_gia > 0 && (
              <>
                {' '}Ngoài ra <b>{tongQuan.don_chua_co_gia}/{tongQuan.tu_quang_cao?.closed || 0} đơn chốt
                đang để giá trị 0</b> — phải điền giá trước khi tin vào bất kỳ con số ROAS nào.
              </>
            )}
          </div>

          {tongQuan.ti_le_biet_quang_cao < 100 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
              Chỉ <b>{tongQuan.ti_le_biet_quang_cao}%</b> lead trong kỳ biết được quảng cáo nào.
              Phần còn lại vào từ tin nhắn tự nhiên, hoặc có trước khi hệ thống bắt đầu ghi <code>ad_id</code>.
            </div>
          )}
        </>
      )}

      <KhungMarketing trangThai={mkt} onXong={async () => { await taiMkt(); await refreshReportRef.current?.(); }} />

      <DaiChanDoan params={params} />

      {manHinh === 'the' ? (
        <>
          {loi ? null : taiHoSo ? (
            <div className="py-14 text-center text-sm text-gray-500">
              <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
              Đang dựng hồ sơ page…
            </div>
          ) : hoSo.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center">
              <p className="text-sm font-semibold text-gray-900">
                Không có page nào có lead từ quảng cáo trong phạm vi đang lọc
              </p>
              {pageDangChon && pageDangChon.lead_quang_cao === 0 ? (
                <p className="mx-auto mt-2 max-w-xl text-[13px] leading-relaxed text-gray-600">
                  Page <b>{pageDangChon.page_name}</b> có khách nhắn tin, nhưng <b>chưa lead nào
                  mang <code>ad_id</code></b> — tức là chưa ai vào từ quảng cáo nhắn tin, hoặc page
                  này chưa bật trường <code>messaging_referrals</code>.
                  Trang này chỉ tính lead đến từ quảng cáo nên sẽ luôn trống với page đó.
                </p>
              ) : (
                <p className="mx-auto mt-2 max-w-xl text-[13px] leading-relaxed text-gray-600">
                  Thử nới bộ lọc — chọn lại tất cả công ty, tất cả page, hoặc bỏ khoảng ngày.
                </p>
              )}
              {coLoc && (
                <button type="button" onClick={xoaLoc}
                  className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white cursor-pointer hover:bg-blue-700">
                  Xoá lọc, xem tất cả page
                </button>
              )}
              {dsPage.some((x) => x.lead_quang_cao > 0) && (
                <p className="mt-4 text-[12px] text-gray-500">
                  Page đang có lead quảng cáo:{' '}
                  {dsPage.filter((x) => x.lead_quang_cao > 0)
                    .sort((a, b) => b.lead_quang_cao - a.lead_quang_cao)
                    .map((x) => `${x.page_name} (${x.lead_quang_cao})`).join(' · ')}
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="grid gap-3 lg:grid-cols-2">
                {hoSo.map((p) => (
                  <TheTrangPage key={p.page_id || p.page_name} p={p}
                    onXemAnh={(x, i) => setXemAnh({ qc: x, chiSo: i })}
                    onMo={(x) => {
                      setPageId(x.page_id || '');
                      setManHinh('chi_tiet');
                      setKieuCt('bai');
                      setTab('ads');
                    }} />
                ))}
              </div>
              <p className="text-[12px] text-gray-500">
                Bấm vào một thẻ để xem chiến dịch, quảng cáo và nhận xét tự động của page đó.
                Bấm thẳng vào ảnh mẫu để xem ảnh lớn và mở bài viết gốc trên Facebook.
                Ảnh mẫu quảng cáo do Facebook cấp bằng link có hạn — mẫu cũ sẽ không hiện được nữa,
                đó là giới hạn của Facebook chứ không phải mất dữ liệu.
              </p>
            </>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button"
              onClick={() => { setManHinh('the'); setPageId(''); setDsQc([]); setDsBai([]); setRows([]); }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[13px] font-semibold cursor-pointer hover:bg-gray-50">
              ← Tất cả page
            </button>
            {pageDangChon && (
              <span className="text-[13px] text-gray-600">
                Đang xem <b className="text-gray-900">{pageDangChon.page_name}</b>
              </span>
            )}
            <div className="ml-auto flex overflow-hidden rounded-lg border border-gray-200">
              {[{ k: 'bai', n: 'Bài viết' }, { k: 'qc', n: 'Quảng cáo' }, { k: 'bang', n: 'Bảng chi tiết' }].map((x) => (
                <button key={x.k} type="button" onClick={() => setKieuCt(x.k)}
                  className={`border-l border-gray-200 px-3 py-1.5 text-[12.5px] cursor-pointer first:border-l-0 ${
                    kieuCt === x.k ? 'bg-blue-600 font-semibold text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}>
                  {x.n}
                </button>
              ))}
            </div>
          </div>

          {kieuCt === 'bai' ? (
            loi ? null : taiDsBai ? (
              <div className="py-14 text-center text-sm text-gray-500">
                <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
                Đang tải bài viết…
              </div>
            ) : dsBai.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white py-12 text-center text-sm text-gray-500">
                Page này chưa có bài viết nào ra lead trong khoảng đang lọc.
              </div>
            ) : (
              <div className="space-y-2.5">
                {dsBai.map((b) => (
                  <HangBaiViet key={b.post_id} b={b} nenChot={nenChot}
                    onXemAnh={(x, i) => setXemAnh({ qc: x, chiSo: i })}
                    onXemLead={(x) => setXemLead({
                      page_id: x.page_id, post_id: x.post_id,
                      nhan: x.tieu_de || `Bài ${x.post_id}`,
                    })} />
                ))}
                <p className="pt-1 text-[12px] leading-relaxed text-gray-500">
                  Một bài viết có thể đang được chạy bằng nhiều quảng cáo cùng lúc. Gom theo bài
                  cho thấy đúng quy mô; chuyển sang <b>Quảng cáo</b> để xem từng cái tách riêng.
                  Dòng <b>&quot;chưa thành lead&quot;</b> là người đã nhắn tin từ quảng cáo nhưng
                  chưa được tạo lead trong CRM — không cộng vào cột Lead, vì cộng vào sẽ làm
                  loãng tỉ lệ chốt và mọi so sánh cũ hoá sai.
                </p>
              </div>
            )
          ) : kieuCt === 'qc' ? (
            loi ? null : taiDsQc ? (
              <div className="py-14 text-center text-sm text-gray-500">
                <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
                Đang tải quảng cáo…
              </div>
            ) : dsQc.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white py-12 text-center text-sm text-gray-500">
                Page này chưa có quảng cáo nào ra lead trong khoảng đang lọc.
              </div>
            ) : (
              <div className="space-y-2.5">
                {dsQc.map((a) => (
                  <HangQuangCao key={a.ad_id} a={a} nenChot={nenChot}
                    onXemAnh={(x, i) => setXemAnh({ qc: x, chiSo: i })}
                    onXemLead={(x) => setXemLead({
                      page_id: x.page_id, ad_id: x.ad_id,
                      nhan: x.campaign_name || x.ad_title || `Quảng cáo ${x.ad_id}`,
                    })}
                    onDatTen={(x) => { setDangSua(x.ad_id); setTenMoi(''); setKieuCt('bang'); setTab('ads'); }} />
                ))}
                <p className="pt-1 text-[12px] leading-relaxed text-gray-500">
                  Quảng cáo hiện bằng <b>dãy số và ảnh mẫu</b> chứ không phải tên, vì Facebook không
                  gửi tên chiến dịch qua Messenger — và tiêu đề nó gửi thì phần lớn trùng nhau nên
                  không dùng để phân biệt được.
                </p>
              </div>
            )
          ) : (
            <>
          <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-200">
        {TAB.map((t) => (
          <button key={t.key} type="button" onClick={() => { setTab(t.key); setChon(new Set()); }}
            className={`-mb-px px-3 py-2 text-sm font-medium cursor-pointer ${
              tab === t.key ? 'border-b-2 border-blue-600 font-semibold text-blue-700' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.nhan}
          </button>
        ))}
      </div>

      {tab === 'ads' && chon.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5">
          <span className="text-[13px] font-semibold text-blue-900">Đã chọn {chon.size} quảng cáo</span>
          <input value={tenLo} onChange={(e) => setTenLo(e.target.value)} placeholder="Tên chiến dịch…"
            className="flex-1 min-w-[180px] rounded-lg border border-blue-300 px-2.5 py-1.5 text-[13px]" />
          <button type="button" onClick={luuTenLo} disabled={dangLuu || !tenLo.trim()}
            className="rounded-lg bg-blue-700 px-3 py-1.5 text-[13px] font-semibold text-white cursor-pointer disabled:opacity-50">
            {dangLuu ? 'Đang lưu…' : 'Gán tên cho tất cả'}
          </button>
          <button type="button" onClick={() => setChon(new Set())}
            className="text-[13px] text-blue-800 underline cursor-pointer">Bỏ chọn</button>
        </div>
      )}

      {loi && !tongQuan ? (
        <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          Dữ liệu chưa xác minh. Hãy tải lại; chưa thể kết luận có 0 Lead.
        </div>
      ) : tab === 'insights' ? (
        dangTai ? (
          <div className="py-14 text-center text-sm text-gray-500">
            <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
            Đang tải nhận xét…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-[12.5px] text-gray-500">
                {tinhLuc ? `Phân tích lần cuối: ${new Date(tinhLuc).toLocaleString('vi-VN')}` : 'Chưa chạy lần nào'}
                <span className="ml-2">· tự chạy mỗi 60 phút</span>
              </div>
              <button type="button" onClick={chayLaiPhanTich} disabled={dangChayLai}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[13px] font-semibold cursor-pointer hover:bg-gray-50 disabled:opacity-50">
                {dangChayLai ? 'Đang phân tích…' : 'Phân tích lại ngay'}
              </button>
            </div>

            {doCu(tinhLuc).hong && (
              <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2.5 text-[12.5px] leading-relaxed text-rose-900">
                <b>Số liệu dưới đây đã cũ.</b>{' '}
                {tinhLuc
                  ? `Lần phân tích gần nhất cách đây ${Math.round(doCu(tinhLuc).gio)} giờ, trong khi job phải chạy mỗi 60 phút — nghĩa là nó đang lỗi.`
                  : 'Chưa chạy lần nào.'}{' '}
                Bấm <b>Phân tích lại ngay</b> để thử; vẫn không đổi thì xem log máy chủ
                mục <code>[phan-tich-qc]</code>.
              </div>
            )}

            {(tuNgay || denNgay) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-900">
                Tab này luôn tính trên <b>90 ngày gần nhất</b> — bộ lọc ngày không áp dụng ở đây.
                Lọc theo công ty và page thì vẫn có tác dụng.
                Lý do: một quảng cáo phải chạy đủ 14 ngày và có đủ 10 lead thì mới nhận xét được,
                cắt ngắn kỳ lại thì hầu hết sẽ rơi vào &quot;chưa đủ dữ liệu&quot;.
              </div>
            )}

            {tomTat && (
              <>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(HANG).map(([k, v]) => (
                    <span key={k} className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${v.lop}`}>
                      {v.nhan}: {tomTat.dem?.[k] || 0}
                    </span>
                  ))}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                    <h3 className="text-sm font-bold text-rose-900">Cân nhắc tắt trước</h3>
                    {tomTat.nen_tat?.length ? (
                      <ul className="mt-2 space-y-1.5">
                        {tomTat.nen_tat.map((x) => (
                          <li key={x.ad_id} className="text-[13px] text-rose-900">
                            <span className="font-semibold">{x.ten}</span>
                            <span className="ml-1.5 text-rose-700">— {x.leads} lead, chưa ra đơn</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="mt-2 text-[13px] text-rose-800">Không có quảng cáo nào đáng tắt.</p>}
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <h3 className="text-sm font-bold text-emerald-900">Cân nhắc tăng ngân sách</h3>
                    {tomTat.nen_tang?.length ? (
                      <ul className="mt-2 space-y-1.5">
                        {tomTat.nen_tang.map((x) => (
                          <li key={x.ad_id} className="text-[13px] text-emerald-900">
                            <span className="font-semibold">{x.ten}</span>
                            <span className="ml-1.5 text-emerald-700">— chốt {x.ti_le_chot}%</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="mt-2 text-[13px] text-emerald-800">Chưa có quảng cáo nào nổi trội rõ rệt.</p>}
                  </div>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-900">
                  {tomTat.canh_bao_chung}
                </div>
              </>
            )}

            {nhanXet.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
                Chưa có kết quả phân tích. Bấm “Phân tích lại ngay”.
              </div>
            ) : (
              <div className="space-y-3">
                {nhanXet.map((r) => {
                  const sl = r.so_lieu || {};
                  const h = HANG[r.xep_hang] || HANG.chua_du;
                  return (
                    <article key={r.ad_id} className="rounded-xl border border-gray-200 bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${h.lop}`}>{h.nhan}</span>
                            <span className="text-sm font-bold text-gray-900">
                              {sl.campaign_name || sl.ad_title || r.ad_id}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-400">
                            <span className="font-mono">{r.ad_id}</span>
                            {sl.page_name && <span>· {sl.page_name}</span>}
                            {sl.so_ngay_chay ? <span>· chạy {sl.so_ngay_chay} ngày</span> : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3 text-right">
                          <div><div className="text-[10px] uppercase text-gray-400">Lead</div><div className="text-base font-bold tabular-nums">{fmtSo(sl.leads)}</div></div>
                          <div><div className="text-[10px] uppercase text-gray-400">Chốt</div><div className="text-base font-bold tabular-nums text-emerald-700">{fmtSo(sl.closed)}</div></div>
                          <div><div className="text-[10px] uppercase text-gray-400">Tỉ lệ</div><div className="text-base font-bold tabular-nums">{sl.ti_le_chot || 0}%</div></div>
                          <div><div className="text-[10px] uppercase text-gray-400">Doanh thu</div><div className="text-base font-bold tabular-nums text-gray-900">{fmtTien(sl.revenue)}</div></div>
                        </div>
                      </div>

                      <ul className="mt-3 space-y-2">
                        {(r.nhan_xet || []).map((n, i) => {
                          const m = MUC[n.muc] || MUC.thong_tin;
                          return (
                            <li key={`${r.ad_id}-${n.ma}-${i}`} className={`rounded-lg border px-3 py-2 ${m.lop}`}>
                              <div className="flex items-center gap-2">
                                <span className={`h-2 w-2 shrink-0 rounded-full ${m.cham}`} />
                                <span className={`text-[13px] font-semibold ${m.chu}`}>{n.tieu_de}</span>
                              </div>
                              <p className="mt-1 pl-4 text-[12.5px] text-gray-700">{n.giai_thich}</p>
                              {n.hanh_dong && (
                                <p className="mt-1 pl-4 text-[12.5px] font-medium text-gray-900">→ {n.hanh_dong}</p>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )
      ) : dangTai ? (
        <div className="py-14 text-center text-sm text-gray-500">
          <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
          Đang tải…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
          Chưa có dữ liệu trong kỳ này.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-gray-100 px-4 py-2.5">
            <span className="text-[11px] uppercase tracking-wide text-gray-400">Phân bố chất lượng</span>
            {THU_TU_NHAN.map((k) => (
              <span key={k} className="flex items-center gap-1.5 text-[11.5px] text-gray-600">
                <span className="h-2 w-2 rounded-full" style={{ background: THANG_CHAT_LUONG[k] }} />
                {TEN_NHAN[k]}
              </span>
            ))}
          </div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-400">
                {tab === 'ads' && <th className="w-10 px-4 py-3" />}
                <th className="px-4 py-3 font-medium">{tab === 'campaigns' ? 'Chiến dịch' : tab === 'ads' ? 'Quảng cáo' : 'Page'}</th>
                <th className="px-4 py-3 text-right font-medium">Lead</th>
                <th className="w-44 px-4 py-3 font-medium">Phân bố chất lượng</th>
                <th className="px-4 py-3 text-right font-medium">Chất lượng</th>
                <th className="px-4 py-3 text-right font-medium">Rác</th>
                <th className="px-4 py-3 text-right font-medium">Chốt</th>
                <th className="px-4 py-3 text-right font-medium">Doanh thu</th>
                <th className="px-4 py-3 text-right font-medium">Chi tiêu</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => {
                const khoa = tab === 'campaigns'
                  ? (g.campaign_id ? `campaign:${g.campaign_id}`
                    : g.campaign_name ? `name:${g.campaign_name}`
                      : `ads:${[...(g.ad_ids || [])].sort().join(',')}`)
                  : `${tab}:${g.ad_id || g.page_id || 'unknown'}`;
                return (
                  <tr key={khoa} className="border-t border-gray-50 transition-colors hover:bg-blue-50/40">
                    {tab === 'ads' && (
                      <td className="px-4 py-3 align-top">
                        <input type="checkbox" checked={chon.has(g.ad_id)} onChange={() => doiChon(g.ad_id)}
                          aria-label={`Chọn ${g.ad_id}`} className="h-4 w-4 cursor-pointer" />
                      </td>
                    )}
                    <td className="px-4 py-3 align-top">
                      {tab === 'campaigns' && (
                        g.chua_dat_ten ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">Chưa đặt tên</span>
                            <span className="text-[12px] text-gray-500">{g.so_quang_cao} quảng cáo</span>
                          </span>
                        ) : (
                          <span className="font-semibold text-gray-900">{g.campaign_name}
                            <span className="ml-2 text-[12px] font-normal text-gray-500">{g.so_quang_cao} QC</span>
                          </span>
                        )
                      )}

                      {tab === 'campaigns' && g.campaign_id && (
                        <div className="mt-0.5 font-mono text-[11px] text-gray-500">{g.campaign_id}</div>
                      )}

                      {tab === 'ads' && (
                        <div className="min-w-0">
                          {dangSua === g.ad_id ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <input autoFocus value={tenMoi} onChange={(e) => setTenMoi(e.target.value)}
                                placeholder="Tên chiến dịch…"
                                className="rounded-lg border border-blue-300 px-2 py-1 text-[13px]" />
                              <button type="button" onClick={() => luuTen(g.ad_id)} disabled={dangLuu}
                                className="rounded bg-blue-700 px-2 py-1 text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50">Lưu</button>
                              <button type="button" onClick={() => { setDangSua(null); setTenMoi(''); }}
                                className="text-[12px] text-gray-500 underline cursor-pointer">Huỷ</button>
                            </div>
                          ) : (
                            <button type="button"
                              onClick={() => { setDangSua(g.ad_id); setTenMoi(g.campaign_name || ''); }}
                              className="block text-left cursor-pointer">
                              {g.campaign_name ? (
                                <span className="font-semibold text-gray-900">{g.campaign_name}</span>
                              ) : (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
                                  Bấm để đặt tên chiến dịch
                                </span>
                              )}
                            </button>
                          )}
                          <div className="mt-0.5 truncate text-[12px] text-gray-600">{g.ad_title_fb || '(Facebook không gửi tên)'}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-400">
                            <span className="font-mono">{g.ad_id}</span>
                            {g.page_name && <span>· {g.page_name}</span>}
                            <span>· {fmtNgay(g.lan_dau)}–{fmtNgay(g.lan_cuoi)}</span>
                          </div>
                        </div>
                      )}

                      {tab === 'pages' && (
                        <div>
                          <div className="font-semibold text-gray-900">{g.page_name || '(không rõ)'}</div>
                          <div className="mt-0.5 text-[11px] text-gray-400">
                            <span className="font-mono">{g.page_id}</span> · {g.co_ad_id} lead biết QC
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right align-top font-semibold tabular-nums text-gray-900">{fmtSo(g.leads)}</td>
                    <td className="px-4 py-3 align-top"><ThanhChatLuong byLabel={g.by_label} tong={g.leads} /></td>
                    <td className="px-4 py-3 text-right align-top tabular-nums text-gray-900">
                      <span className="font-semibold text-amber-700">{g.quality_rate}%</span>
                      <div className="text-[11px] text-gray-400">{fmtSo(g.quality_leads)}</div>
                    </td>
                    <td className={`px-3 py-2.5 text-right align-top tabular-nums ${g.junk_rate >= 30 ? 'font-semibold text-rose-700' : 'text-gray-600'}`}>
                      {g.junk_rate}%
                    </td>
                    <td className="px-4 py-3 text-right align-top tabular-nums text-gray-900">
                      <span className="font-semibold text-emerald-700">{fmtSo(g.closed)}</span>
                      <div className="text-[11px] text-gray-400">{g.close_rate}%</div>
                    </td>
                    <td className="px-4 py-3 text-right align-top tabular-nums text-gray-900">{fmtTien(g.revenue)}</td>
                    <td className="px-4 py-3 text-right align-top tabular-nums text-gray-900">
                      {g.spend == null ? (
                        <span className="text-[12px] text-gray-400">—</span>
                      ) : (
                        <>
                          <div className="font-medium text-gray-900">{fmtTien(g.spend)}</div>
                          <div className="text-[11.5px] text-gray-500">
                            {fmtSo(g.cost_per_lead)} đ/lead
                            {g.roas != null && <> · ROAS <b className={g.roas < 1 ? 'text-rose-700' : 'text-emerald-700'}>{g.roas}</b></>}
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
            </>
          )}
        </>
      )}

      {xemLead && (
        <KhungDanhSachLead mo={xemLead} params={params} onDong={() => setXemLead(null)} />
      )}

      {xemAnh && (
        <KhungXemAnh qc={xemAnh.qc} chiSo={xemAnh.chiSo}
          onDong={() => setXemAnh(null)}
          onDoi={(b) => setXemAnh((cur) => {
            if (!cur) return cur;
            const n = cur.qc.mau_quang_cao?.length || 1;
            return { ...cur, chiSo: ((cur.chiSo + b) % n + n) % n };
          })} />
      )}

      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-[12.5px] text-gray-600">
        {mkt?.da_noi ? (
          <>
            <b>Về chi tiêu:</b> số tiền lấy từ Marketing API. ROAS chỉ đúng với những đơn
            đã điền giá trị — đơn để giá 0 sẽ kéo ROAS xuống sai.
          </>
        ) : (
          <>
            <b>Về cột Chi tiêu:</b> hệ thống chưa nối Facebook Marketing API nên chưa có số tiền đã tiêu,
            do đó chưa tính được giá mỗi lead và ROAS. Cần Ad Account ID và token có quyền <code>ads_read</code>.
            <br />
            <b>Về tên chiến dịch:</b> Facebook chỉ gửi <code>ad_id</code> và tên quảng cáo, không gửi tên chiến dịch.
            Đặt tay tại đây, hoặc nối Marketing API để tự điền.
          </>
        )}
      </div>
    </div>
  );
}
