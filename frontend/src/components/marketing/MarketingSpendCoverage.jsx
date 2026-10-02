import { useEffect, useState } from 'react';
import api from '../../lib/api';

const REASONS = {
  SOURCE_NOT_ENABLED: 'Chưa mở nguồn chi tiêu đã đối soát.',
  NO_CONFIGURED_ACCOUNTS: 'Chưa có tài khoản quảng cáo được cấu hình cho công ty.',
  ACCOUNT_SCOPE_MISMATCH: 'Có tài khoản chưa xác định được phạm vi hoặc đang ngừng đồng bộ.',
  ACCOUNT_PERMISSION_EXPIRED: 'Quyền đọc tài khoản quảng cáo đã hết hạn.',
  LATEST_SYNC_NOT_COMPLETE: 'Lần đồng bộ mới nhất chưa hoàn tất hoặc gặp lỗi.',
  MISSING_ACCOUNT_SNAPSHOT: 'Chưa đủ bằng chứng chi tiêu cho mọi tài khoản.',
  MISSING_DATE_COVERAGE: 'Chưa đọc đủ các ngày trong khoảng đã chọn.',
  SPEND_STALE: 'Số liệu đã quá thời hạn cập nhật; cần đồng bộ lại.',
  INVALID_DATE_RANGE: 'Chọn khoảng ngày hợp lệ, tối đa 93 ngày.',
};

function Coverage({ companyId, from, to }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setResult(null);
    api.get('/ad-analytics/marketing/spend-coverage', { params: { company_id: companyId, from, to } })
      .then(response => { if (active) setResult(response.data); })
      .catch(() => { if (active) setResult({ status: 'UNKNOWN', reason: 'SPEND_SOURCE_UNAVAILABLE' }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, from, to, reload]);
  const known = !loading && result?.status === 'KNOWN_TO_DATE'
    && result?.scope === 'CONFIGURED_FACEBOOK_ACCOUNTS' && Number.isSafeInteger(result.spendVnd) && result.spendVnd >= 0;
  return <section aria-label="Chi tiêu Facebook đã đối soát" className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-semibold text-slate-900">Chi tiêu Facebook — tài khoản đã cấu hình</h2>
        <p className="mt-1 text-sm text-slate-600">Toàn bộ chi tiêu, kể cả quảng cáo chưa tạo khách. Khung này không thu hẹp theo Page.</p>
      </div>
      <button type="button" disabled={loading} onClick={() => { setResult(null); setLoading(true); setReload(n => n + 1); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Tải lại chi tiêu</button>
    </div>
    <div aria-live="polite" className="mt-3">
      <p className="text-2xl font-bold text-slate-900">{known ? `${result.spendVnd.toLocaleString('vi-VN')} đ` : loading ? 'Đang kiểm tra…' : 'Chưa biết'}</p>
      {known ? <p className="mt-1 text-sm text-slate-600">
        Khoảng {from} – {to} · {result.sources?.length ?? '—'} tài khoản · Múi giờ Việt Nam.
        {result.asOf ? ` Đọc từ ${new Date(result.asOf).toLocaleString('vi-VN')}.` : ''}
        {result.provisionalToday ? ' Số hôm nay còn cập nhật.' : ''}
      </p> : !loading ? <p className="mt-1 text-sm text-amber-800">{REASONS[result?.reason] || 'Chưa đọc đủ nguồn chi tiêu. Các số cũ được ẩn; vui lòng thử lại.'}</p> : null}
    </div>
    <p className="mt-3 text-sm text-slate-600">Chi phí/khách hợp lệ: chưa có kết quả. Cần nối hồ sơ khách đã loại trùng và kỳ thử được chốt trước khi so với mục tiêu 250.000 đồng.</p>
  </section>;
}

export default function MarketingSpendCoverage({ companyId, from, to, refresh, syncing }) {
  if (!companyId) return <section aria-label="Chi tiêu Facebook đã đối soát" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Chọn một công ty để kiểm tra toàn bộ chi tiêu Facebook của công ty đó.</section>;
  if (!from || !to) return <section aria-label="Chi tiêu Facebook đã đối soát" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Chọn ngày bắt đầu và kết thúc để kiểm tra đủ chi tiêu Facebook trong kỳ.</section>;
  if (syncing) return <section aria-label="Chi tiêu Facebook đã đối soát" aria-live="polite" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Đang đồng bộ chi tiêu Facebook. Số cũ được ẩn trong lúc kiểm tra.</section>;
  // Remount on scope change: previous company figures cannot flash while the
  // effect for a new company/date range is waiting to execute.
  return <Coverage key={`${companyId}|${from}|${to}|${refresh}`} companyId={companyId} from={from} to={to} />;
}
