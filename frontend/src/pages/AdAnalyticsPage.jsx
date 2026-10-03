/**
 * Phân tích hiệu quả quảng cáo Facebook.
 * Ba cách nhìn: theo Chiến dịch / theo Quảng cáo / theo Page.
 * Tên chiến dịch đặt tay tại đây cho tới khi nối Marketing API.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import MarketingSpendCoverage from '../components/marketing/MarketingSpendCoverage';
import MarketingLeadTrial from '../components/marketing/MarketingLeadTrial';

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

const HANG = {
  tot:     { nhan: 'Tốt',            lop: 'bg-emerald-100 text-emerald-800' },
  kha:     { nhan: 'Khá',            lop: 'bg-teal-100 text-teal-800' },
  can_xem: { nhan: 'Cần xem lại',    lop: 'bg-amber-100 text-amber-800' },
  kem:     { nhan: 'Kém',            lop: 'bg-rose-100 text-rose-800' },
  chua_du: { nhan: 'Chưa đủ dữ liệu', lop: 'bg-gray-200 text-gray-700' },
};

const MAU_NHAN = {
  rac: 'bg-gray-200 text-gray-700',
  lanh: 'bg-sky-100 text-sky-800',
  am: 'bg-amber-100 text-amber-800',
  nong: 'bg-orange-100 text-orange-800',
  da_chot: 'bg-emerald-100 text-emerald-800',
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

function ThanhChatLuong({ byLabel, tong }) {
  if (!tong) return null;
  const thuTu = ['da_chot', 'nong', 'am', 'lanh', 'rac'];
  const mau = { da_chot: '#059669', nong: '#EA580C', am: '#D97706', lanh: '#0284C7', rac: '#9CA3AF' };
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100">
      {thuTu.map((k) => {
        const v = byLabel?.[k] || 0;
        if (!v) return null;
        return <div key={k} title={`${k}: ${v}`} style={{ width: `${(v / tong) * 100}%`, background: mau[k] }} />;
      })}
    </div>
  );
}

function OSoLieu({ nhan, giaTri, phu, mau = 'text-gray-900' }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{nhan}</div>
      <div className={`mt-1 text-2xl font-bold leading-none ${mau}`}>{giaTri}</div>
      {phu ? <div className="mt-1 text-xs text-gray-500">{phu}</div> : null}
    </div>
  );
}

function KhungMarketing({ trangThai, onXong, companyId, onSyncStart, onSyncFinish }) {
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
      company_id: companyId || undefined,
      access_token: token.trim() || undefined,
    });
    const d = r.data || {};
    return { ok: true, chu: `Kết nối được: ${d.ten || d.ad_account_id} · tiền tệ ${d.tien_te || '—'}` };
  });

  const luu = () => goi('luu', async () => {
    await api.put('/ad-analytics/marketing/account', {
      ad_account_id: actId.trim(),
      company_id: companyId || undefined,
      ten: ten.trim() || null,
      access_token: token.trim() || undefined,
    });
    setToken('');
    if (onXong) await onXong();
    return { ok: true, chu: 'Đã lưu tài khoản. Bấm "Đồng bộ ngay" để kéo tên chiến dịch về.' };
  });

  const dongBo = () => goi('dongbo', async () => {
    onSyncStart?.();
    try {
    const r = await api.post('/ad-analytics/marketing/sync', { ngay: 30 });
    const d = r.data || {};
    const soAd = (d.ket_qua || []).reduce((s, x) => s + (x.so_ad || 0), 0);
    const hong = (d.ket_qua || []).filter((x) => !x.ok);
    if (onXong) await onXong();
    if (hong.length) return { ok: false, chu: `${hong.length} tài khoản lỗi: ${hong[0].loi}` };
    return { ok: true, chu: `Đã kéo ${soAd} quảng cáo về và cập nhật chi tiêu.` };
    } finally { onSyncFinish?.(); }
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

export default function AdAnalyticsPage() {
  const { user } = useAuth();
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
  const [denNgay, setDenNgay] = useState('');
  const [congTy, setCongTy] = useState('');
  const [pageId, setPageId] = useState('');
  const [dsCongTy, setDsCongTy] = useState([]);
  const [dsPage, setDsPage] = useState([]);
  const [heSinhThai, setHeSinhThai] = useState(null);
  const [dangSua, setDangSua] = useState(null);   // ad_id đang đặt tên
  const [tenMoi, setTenMoi] = useState('');
  const [chon, setChon] = useState(() => new Set());
  const [tenLo, setTenLo] = useState('');
  const [dangLuu, setDangLuu] = useState(false);
  const [mkt, setMkt] = useState(null);
  const [spendRefresh, setSpendRefresh] = useState(0);
  const [spendSyncing, setSpendSyncing] = useState(false);

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

  useEffect(() => {
    refreshReportRef.current = tai;
    tai();
    return () => {
      refreshReportRef.current = null;
      reportRequestId.current += 1;
    };
  }, [tai]);
  useEffect(() => { taiMkt(); }, [taiMkt]);

  const luuTen = useCallback(async (adId) => {
    if (!tenMoi.trim()) return;
    setDangLuu(true);
    try {
      await api.put(`/ad-analytics/ads/${adId}`, { campaign_name: tenMoi.trim() });
      setDangSua(null);
      setTenMoi('');
      await refreshReportRef.current?.();
    } catch (e) {
      setLoi(e?.response?.data?.error || 'Không lưu được tên chiến dịch');
    } finally {
      setDangLuu(false);
    }
  }, [tenMoi, tai]);

  const luuTenLo = useCallback(async () => {
    if (!tenLo.trim() || !chon.size) return;
    setDangLuu(true);
    try {
      await api.post('/ad-analytics/ads/bulk-name', { ad_ids: [...chon], campaign_name: tenLo.trim() });
      setChon(new Set());
      setTenLo('');
      await refreshReportRef.current?.();
    } catch (e) {
      setLoi(e?.response?.data?.error || 'Không đặt tên hàng loạt được');
    } finally {
      setDangLuu(false);
    }
  }, [tenLo, chon, tai]);

  const chayLaiPhanTich = useCallback(async () => {
    setDangChayLai(true);
    try {
      await api.post('/ad-analytics/insights/run', {});
      await refreshReportRef.current?.();
    } catch (e) {
      setLoi(e?.response?.data?.error || 'Không chạy lại được phân tích');
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
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Hiệu quả quảng cáo Facebook</h1>
          <p className="mt-0.5 text-[13px] text-gray-500">
            Lead đến từ quảng cáo nào, chất lượng ra sao, chốt được bao nhiêu. Mỗi Lead tính một lần trong từng nhóm; không cộng các nhóm để suy số khách duy nhất.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
        {heSinhThai && (
          <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[12.5px] text-slate-700"
            title="Hệ sinh thái lấy từ tài khoản đăng nhập, không đổi được ở đây">
            Hệ sinh thái: <b>{heSinhThai.ten}</b>
          </span>
        )}

        <select value={congTy} onChange={(e) => doiCongTy(e.target.value)}
          className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-[13px] cursor-pointer">
          <option value="">Tất cả công ty</option>
          {dsCongTy.map((c) => (
            <option key={c.id} value={c.id}>{c.ten}</option>
          ))}
        </select>

        <select value={pageId} onChange={(e) => setPageId(e.target.value)}
          className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-[13px] cursor-pointer">
          <option value="">{congTy ? 'Tất cả page của công ty' : 'Tất cả page'}</option>
          {dsPageHienThi.map((p) => (
            <option key={p.page_id} value={p.page_id}>{p.page_name}</option>
          ))}
        </select>

        <span className="mx-1 h-5 w-px bg-gray-200" />

        <label className="text-[12px] text-gray-500" htmlFor="tu">Từ</label>
        <input id="tu" type="date" value={tuNgay} onChange={(e) => setTuNgay(e.target.value)}
          className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-[13px]" />
        <label className="text-[12px] text-gray-500" htmlFor="den">đến</label>
        <input id="den" type="date" value={denNgay} onChange={(e) => setDenNgay(e.target.value)}
          className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-[13px]" />

        {NHANH.map((n) => (
          <button key={n.nhan} type="button" onClick={() => datKhoang(n.ngay)}
            className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[12.5px] cursor-pointer hover:bg-gray-100">
            {n.nhan}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          {coLoc && (
            <button type="button" onClick={xoaLoc}
              className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-[12.5px] text-gray-600 cursor-pointer hover:bg-gray-50">
              Xoá lọc
            </button>
          )}
          <button type="button" onClick={tai}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[13px] font-semibold cursor-pointer hover:bg-gray-50">
            Tải lại
          </button>
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

      {tongQuan && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <OSoLieu nhan="Lead từ quảng cáo" giaTri={fmtSo(tongQuan.tu_quang_cao?.leads)}
              phu={`${tongQuan.so_quang_cao} quảng cáo · ${tongQuan.ti_le_biet_quang_cao}% lead biết nguồn QC`} />
            <OSoLieu nhan="Lead được gắn nhãn ấm/nóng" giaTri={fmtSo(tongQuan.tu_quang_cao?.quality_leads)}
              phu={`${tongQuan.tu_quang_cao?.quality_rate || 0}% · rác ${tongQuan.tu_quang_cao?.junk_rate || 0}%`}
              mau="text-amber-700" />
            <OSoLieu nhan="Deal đã đánh dấu chốt" giaTri={fmtSo(tongQuan.tu_quang_cao?.closed)}
              phu={`tỉ lệ chốt ${tongQuan.tu_quang_cao?.close_rate || 0}%`} mau="text-emerald-700" />
            <OSoLieu nhan="Giá trị deal chốt (ước tính)" giaTri={fmtTien(tongQuan.tu_quang_cao?.closed_estimated_value)}
              phu={tongQuan.co_chi_tieu
                ? `chi ${fmtTien(tongQuan.tu_quang_cao?.spend)} đ · ${fmtSo(tongQuan.tu_quang_cao?.cost_per_lead)} đ/lead`
                + `${tongQuan.tu_quang_cao?.roas != null ? ` · ROAS ${tongQuan.tu_quang_cao.roas}` : ''}`
                : 'Chi tiêu & ROAS: chờ Marketing API'}
              mau="text-teal-700" />
          </div>

          {tongQuan.ti_le_biet_quang_cao < 100 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
              Chỉ <b>{tongQuan.ti_le_biet_quang_cao}%</b> lead trong kỳ biết được quảng cáo nào.
              Phần còn lại vào từ tin nhắn tự nhiên, hoặc có trước khi hệ thống bắt đầu ghi <code>ad_id</code>.
            </div>
          )}
        </>
      )}

      <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        <b>Mục tiêu thử: 250.000 đồng/khách hợp lệ. Chi phí thực tế: chưa đủ dữ liệu.</b>{' '}
        Khách hợp lệ được loại trùng, xác minh nhu cầu, vùng phục vụ và thông tin liên hệ; nhãn ấm/nóng chưa thay việc xác minh này.
        Giá trị deal là ước tính, chưa phải doanh thu ghi nhận hay tiền đã thu.
        Chi tiêu trên bảng chỉ gồm quảng cáo đã liên kết Lead; có thể thiếu quảng cáo chưa tạo khách.
        Chưa dùng số liệu này để tự tăng ngân sách hoặc kết luận đạt 250.000 đồng/khách hay 7% doanh thu.
      </div>

      <MarketingLeadTrial companyId={congTy} actorId={user?.id || user?.userId} />
      <MarketingSpendCoverage companyId={congTy} from={tuNgay} to={denNgay} refresh={spendRefresh} syncing={spendSyncing} />

      <KhungMarketing trangThai={mkt} companyId={congTy} onSyncStart={() => setSpendSyncing(true)} onSyncFinish={() => { setSpendSyncing(false); setSpendRefresh(n => n + 1); }} onXong={async () => { await taiMkt(); await refreshReportRef.current?.(); }} />

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
                          <div><div className="text-[10px] uppercase text-gray-400">Giá trị deal chốt (ước tính)</div><div className="text-base font-bold tabular-nums text-teal-700">{fmtTien(sl.closed_estimated_value)}</div></div>
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
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {tab === 'ads' && <th className="w-10 px-3 py-2.5" />}
                <th className="px-3 py-2.5">{tab === 'campaigns' ? 'Chiến dịch' : tab === 'ads' ? 'Quảng cáo' : 'Page'}</th>
                <th className="px-3 py-2.5 text-right">Lead</th>
                <th className="px-3 py-2.5 w-40">Phân bố chất lượng</th>
                <th className="px-3 py-2.5 text-right">Chất lượng</th>
                <th className="px-3 py-2.5 text-right">Rác</th>
                <th className="px-3 py-2.5 text-right">Chốt</th>
                <th className="px-3 py-2.5 text-right">Giá trị deal chốt (ước tính)</th>
                <th className="px-3 py-2.5 text-right">Chi tiêu</th>
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
                  <tr key={khoa} className="border-t border-gray-100 hover:bg-gray-50/70">
                    {tab === 'ads' && (
                      <td className="px-3 py-2.5 align-top">
                        <input type="checkbox" checked={chon.has(g.ad_id)} onChange={() => doiChon(g.ad_id)}
                          aria-label={`Chọn ${g.ad_id}`} className="h-4 w-4 cursor-pointer" />
                      </td>
                    )}
                    <td className="px-3 py-2.5 align-top">
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
                    <td className="px-3 py-2.5 text-right align-top font-semibold tabular-nums">{fmtSo(g.leads)}</td>
                    <td className="px-3 py-2.5 align-top"><ThanhChatLuong byLabel={g.by_label} tong={g.leads} /></td>
                    <td className="px-3 py-2.5 text-right align-top tabular-nums">
                      <span className="font-semibold text-amber-700">{g.quality_rate}%</span>
                      <div className="text-[11px] text-gray-400">{fmtSo(g.quality_leads)}</div>
                    </td>
                    <td className={`px-3 py-2.5 text-right align-top tabular-nums ${g.junk_rate >= 30 ? 'font-semibold text-rose-700' : 'text-gray-600'}`}>
                      {g.junk_rate}%
                    </td>
                    <td className="px-3 py-2.5 text-right align-top tabular-nums">
                      <span className="font-semibold text-emerald-700">{fmtSo(g.closed)}</span>
                      <div className="text-[11px] text-gray-400">{g.close_rate}%</div>
                    </td>
                    <td className="px-3 py-2.5 text-right align-top tabular-nums">{fmtTien(g.closed_estimated_value)}</td>
                    <td className="px-3 py-2.5 text-right align-top tabular-nums">
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
      )}

      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-[12.5px] text-gray-600">
        <b>Về cột Chi tiêu:</b> hệ thống chưa nối Facebook Marketing API nên chưa có số tiền đã tiêu,
        do đó chưa tính được giá mỗi lead. Doanh thu kế toán và ROAS còn cần nguồn được đối soát riêng.
        <br />
        <b>Về tên chiến dịch:</b> Facebook chỉ gửi <code>ad_id</code> và tên quảng cáo, không gửi tên chiến dịch.
        Đặt tay tại đây, hoặc nối Marketing API để tự điền.
      </div>
    </div>
  );
}

