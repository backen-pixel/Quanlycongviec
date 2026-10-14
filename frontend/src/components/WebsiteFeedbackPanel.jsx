import { useEffect, useState } from 'react';
import api from '../lib/api';

const VPT = '991dc79d-cbf5-49f9-a364-35227cb47635';
const labels = {
  NON_META_PAID_SOURCE: 'Nguồn khác quảng cáo Meta',
  META_CONSENT_REQUIRED: 'Chưa đồng ý đo quảng cáo',
  META_MATCHING_UNVERIFIED: 'Thiếu mã nhấp hoặc bằng chứng thời điểm',
  META_AD_SCOPE_UNVERIFIED: 'Chưa đối soát quảng cáo và chiến dịch',
  META_ACCOUNT_SCOPE_UNVERIFIED: 'Chưa đối soát tài khoản quảng cáo',
  META_ACCOUNT_STALE: 'Dữ liệu tài khoản cần đồng bộ lại',
  META_CATALOG_STALE: 'Danh mục quảng cáo cần đồng bộ lại',
  META_EVENT_EXPIRED: 'Quá thời hạn gửi sự kiện',
};
const states = { pending: 'Chờ gửi', processing: 'Đang xử lý', accepted: 'Meta đã nhận',
  held: 'Đang giữ', unknown: 'Chưa rõ kết quả', cancelled: 'Đã dừng' };
const time = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
const LeadLink = ({ id }) => <a href={`/crm/leads/${id}`} target="_blank" rel="noopener noreferrer"
  className="text-sky-700 underline">Khách {id.slice(0, 8)}</a>;

export default function WebsiteFeedbackPanel({ companyId }) {
  const [snapshot, setSnapshot] = useState(null), [error, setError] = useState('');
  const [version, setVersion] = useState(0), [running, setRunning] = useState(false), [message, setMessage] = useState('');
  useEffect(() => {
    if (companyId !== VPT) return;
    let alive = true;
    setSnapshot(null); setError('');
    api.get('/website-feedback/preview', { params: { company_id: VPT } })
      .then(({ data }) => { if (alive) setSnapshot(data); })
      .catch(err => { if (alive) setError(err.response?.data?.error || 'Chưa đủ nguồn để đối soát khách website.'); });
    return () => { alive = false; };
  }, [companyId, version]);
  if (companyId !== VPT) return null;
  const ready = snapshot?.enabled && snapshot?.configured && snapshot?.delivery?.available
    && snapshot?.delivery?.guard?.blocked === false;
  async function run() {
    if (!ready || running) return;
    setRunning(true); setMessage('');
    try {
      await api.post('/website-feedback/run', { limit: 10 }, { params: { company_id: VPT } });
      setMessage('Đã xử lý lượt đồng bộ. Xem lịch sử nhận bên dưới để kiểm kết quả.');
    } catch (err) {
      setMessage(err.response?.data?.error || 'Chưa xác nhận kết quả; cần kiểm lịch sử trước khi gửi tiếp.');
    } finally { setRunning(false); setVersion(value => value + 1); }
  }
  return <div className="mt-3 border-t pt-3 text-xs" aria-label="Khách website đã xác minh">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="font-semibold text-gray-800">Khách website đã xác minh và phản hồi Meta (60 ngày)</h4>
      <button type="button" onClick={() => setVersion(value => value + 1)} className="rounded border px-2 py-1">Tải lại đối soát</button>
    </div>
    {error && <p role="alert" className="mt-2 text-red-600">{error}</p>}
    {!snapshot && !error && <p role="status" className="mt-2 text-gray-500">Đang đối soát…</p>}
    {snapshot && <div className="mt-2 space-y-2 text-gray-700">
      <p>Đã xác minh, khử trùng và có bằng chứng lưu form: <b>{snapshot.counts.verified_receipted}</b>
        {' · '}Đủ điều kiện chuẩn bị gửi Meta: <b>{snapshot.counts.meta_ready}</b>
        {' · '}Chưa đủ điều kiện gửi Meta: <b>{snapshot.counts.meta_held}</b>.</p>
      <p className="text-gray-500">Cập nhật {time(snapshot.as_of)}. Chỉ gồm khách có phiếu xác minh thực tế và biên nhận form mới.
        Lịch sử khách ngoài CRM vẫn cần đối soát. Chưa dùng số này để nghiệm thu CPL.</p>
      <p className="text-gray-500">Thiếu biên nhận form: {snapshot.diagnostics.no_website_receipt ?? 0}
        {' · '}khách cũ/trùng: {snapshot.diagnostics.duplicate_or_returning ?? 0}
        {' · '}chưa chứng minh khách mới: {snapshot.diagnostics.new_customer_unproven ?? 0}
        {' · '}hồ sơ đổi sau xác minh: {snapshot.diagnostics.qualification_stale ?? 0}.</p>
      {!!snapshot.rows.length && <details><summary className="cursor-pointer text-sky-700">Xem {snapshot.rows.length} hồ sơ đối soát</summary>
        <ul className="mt-1 space-y-1">{snapshot.rows.map(row => <li key={row.lead_id}>
          <LeadLink id={row.lead_id} />{' · '}xác minh {time(row.qualified_at)}{' · '}
          {row.delivery_supported ? 'Đủ điều kiện chuẩn bị gửi' : (labels[row.hold_reason] || 'Cần đối soát thêm')}
        </li>)}</ul>
      </details>}
      <p>Kết nối: <b>{snapshot.enabled ? (snapshot.mode === 'test' ? 'Đang bật chế độ thử' : 'Đang bật chế độ thật') : 'Chưa bật'}</b>
        {snapshot.scope.dataset_id && <> · Bộ dữ liệu Meta {snapshot.scope.dataset_id}</>}.</p>
      {snapshot.delivery.available ? <>
        <p>Lịch sử gửi toàn bộ: {Object.entries(states).map(([key, label]) => `${label}: ${snapshot.delivery.counts[key] ?? 0}`).join(' · ')}.</p>
        {snapshot.delivery.guard?.blocked && <p role="alert" className="text-amber-700">Có kết quả chưa rõ hoặc hồ sơ đã gửi thay đổi. Cần đối soát lịch sử trước khi gửi tiếp.</p>}
        {!!snapshot.delivery.rows.length && <details><summary className="cursor-pointer text-sky-700">Xem lịch sử gửi</summary>
          <ul className="mt-1 space-y-1">{snapshot.delivery.rows.map(row => <li key={row.id}>
            <LeadLink id={row.lead_id} />{' · '}{states[row.status] || 'Chưa rõ'}{' · '}
            {row.mode === 'test' ? 'thử nghiệm' : 'thật'}{' · '}{time(row.accepted_at || row.created_at)}
            {row.stale && ' · Hồ sơ đã thay đổi, cần kiểm lại'}
          </li>)}</ul>
        </details>}
      </> : <p className="text-gray-500">Chưa có lịch sử kết nối để xác nhận Meta đã nhận.</p>}
      <p className="text-gray-500">“Meta đã nhận” chỉ xác nhận tiếp nhận sự kiện; còn phải kiểm Meta ghi nhận cho quảng cáo nào.
        Chế độ thử không được cộng vào kết quả quảng cáo thật.</p>
      <button type="button" disabled={!ready || running} onClick={run}
        className="rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50">
        {running ? 'Đang xử lý…' : (snapshot.mode === 'test' ? 'Đồng bộ khách đủ điều kiện vào chế độ thử' : 'Đồng bộ khách đủ điều kiện')}
      </button>
    </div>}
    {message && <p role="status" className="mt-2 text-gray-700">{message}</p>}
  </div>;
}
