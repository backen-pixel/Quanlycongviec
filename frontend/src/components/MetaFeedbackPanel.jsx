import { useEffect, useState } from 'react';
import api from '../lib/api';

const number = value => Number.isSafeInteger(value) && value >= 0 ? value : 'chưa rõ';
const states = { pending: 'Chờ gửi', processing: 'Đang gửi', accepted: 'Meta đã nhận',
  held: 'Cần xử lý', unknown: 'Chưa rõ kết quả', cancelled: 'Đã dừng' };

export default function MetaFeedbackPanel() {
  const [report, setReport] = useState(null), [error, setError] = useState('');
  const [hidden, setHidden] = useState(false), [version, setVersion] = useState(0);
  const [sending, setSending] = useState(false), [message, setMessage] = useState('');
  useEffect(() => {
    let alive = true;
    setReport(null); setError('');
    api.get('/meta-feedback/preview').then(({ data }) => { if (alive) setReport(data); })
      .catch(err => {
        if (!alive) return;
        if (err.response?.status === 403 || err.response?.status === 404) setHidden(true);
        else setError(err.response?.data?.error || 'Chưa tải được kết quả xác minh Facebook');
      });
    return () => { alive = false; };
  }, [version]);
  async function sync() {
    if (sending) return;
    setSending(true); setMessage('');
    try {
      const { data } = await api.post('/meta-feedback/run', { limit: 10 });
      setMessage(data.status === 'busy' ? 'Một lượt đồng bộ đang chạy.'
        : data.status === 'held' ? 'Đang giữ lượt gửi để đối soát lịch sử.'
          : data.status === 'disabled' ? 'Kết nối gửi kết quả đang dừng.'
            : `Đã ghi nhận ${number(data.sent)} sự kiện có xác nhận Meta trong lượt này. Kiểm lịch sử để xem kết quả còn chờ xử lý.`);
    } catch (err) { setMessage(err.response?.data?.error || 'Chưa xác nhận được kết quả gửi'); }
    finally { setSending(false); setVersion(value => value + 1); }
  }
  if (hidden) return null;
  return <section className="mt-4 rounded-xl border border-gray-200 bg-white p-4 text-xs" aria-label="Khách Facebook đã xác minh VPT">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-gray-800">Khách Facebook đã xác minh — VPT</h3>
      <button type="button" onClick={() => setVersion(value => value + 1)} className="rounded border px-2 py-1">Tải lại Facebook</button>
    </div>
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    {!report && !error && <p role="status" className="mt-2 text-gray-500">Đang tải…</p>}
    {report && <div className="mt-2 space-y-2 text-gray-700">
      <p>{report.configured ? report.enabled ? 'Đã bật gửi kết quả về Meta.' : 'Đã cấu hình kết nối; đang dừng gửi.'
        : 'Chưa hoàn tất kết nối gửi kết quả về Meta.'}{report.mode === 'test' && ' Đang ở chế độ thử nghiệm.'}</p>
      {report.scope && <p>Tài khoản quảng cáo: {report.scope.ad_account_id.replace(/^act_/, '')}</p>}
      {report.as_of && <p className="text-gray-500">Cập nhật: {new Date(report.as_of).toLocaleString('vi-VN')}.
        {' '}Khách hợp lệ được đếm trong 60 ngày gần nhất theo ngày xác minh. Chi phía trên dùng bộ lọc riêng; cần đối chiếu cùng kỳ để tính CPL.</p>}
      {report.counts && <>
        <p>Khách hợp lệ đã đối soát trong CRM: <b>{number(report.counts.qualified_reconciled)}</b>
          {' · '}Lead Form đã xác minh sẵn sàng gửi: <b>{number(report.counts.instant_forms_ready)}</b>
          {' · '}Messenger chờ xác nhận cách đo trên Meta: <b>{number(report.counts.messenger_held)}</b></p>
        <p>Lead Form mới đủ bằng chứng tiếp nhận và sẵn sàng gửi: <b>{number(report.counts.initial_leads_ready)}</b>.
          {' '}Đây là sự kiện tiếp nhận trong bảy ngày gần nhất; khách vẫn cần được xác minh.</p>
        <p className="text-gray-500">Khách cũ/trùng, hồ sơ đã đổi và nguồn chưa đủ bằng chứng được giữ ngoài danh sách đủ điều kiện. Thiếu lịch sử CRM vẫn cần đối soát; đây chưa phải số nghiệm thu CPL.</p>
        {!!Object.entries(report.diagnostics || {}).some(([, value]) => value > 0) && <details>
          <summary className="cursor-pointer">Lý do cần đối soát</summary>
          <ul className="mt-1 space-y-1">{Object.entries(report.diagnostics).filter(([, value]) => value > 0).map(([key, value]) =>
            <li key={key}>{({ duplicate_or_returning: 'Khách cũ hoặc trùng', new_customer_unproven: 'Chưa chứng minh khách mới',
              qualification_stale: 'Hồ sơ đổi sau xác minh', identity_unknown: 'Chưa rõ danh tính', identity_ambiguous: 'Danh tính cần kiểm tra',
              source_unverified: 'Nguồn cần đối soát', ad_scope_unverified: 'Chưa đối chiếu được tài khoản quảng cáo',
              source_conflict: 'Nguồn xung đột', not_current_qualified: 'Chưa có xác minh hợp lệ hiện tại',
              messenger_source_unverified: 'Thiếu bằng chứng nguồn Messenger' })[key] || 'Bằng chứng chưa đủ'}: {number(value)}</li>)}</ul>
        </details>}
      </>}
      {report.delivery?.available ? <>
        {report.delivery.guard?.blocked && <p role="alert" className="text-amber-800">Đang giữ toàn bộ lượt gửi của tài khoản này để đối soát lịch sử chưa rõ hoặc danh tính đã đổi. Cần kiểm kết quả Meta và khách trùng trước khi tiếp tục.</p>}
        <p>Sự kiện Meta đã nhận: <b>{number(report.delivery.counts?.accepted)}</b>
          {' · '}chưa rõ kết quả gửi: <b>{number(report.delivery.counts?.unknown)}</b>.</p>
        <p className="text-gray-500">Meta nhận sự kiện chưa chứng minh đã quy được cho quảng cáo. Sự kiện thử nghiệm không tính vào kết quả thật.</p>
        {!!report.delivery.rows?.length && <details><summary className="cursor-pointer">Lịch sử gửi gần đây</summary>
          <ul className="mt-1 space-y-1">{report.delivery.rows.map(row => <li key={row.id}>
            <a href={`/crm/leads/${row.lead_id}`} target="_blank" rel="noopener noreferrer" className="underline">Mở hồ sơ</a>
            {' · '}{row.event_name === 'qualified_lead' ? 'Khách hợp lệ' : 'Khách mới vào CRM'}
            {' · '}{states[row.status] || 'Chưa rõ'}{row.mode === 'test' && ' (thử nghiệm)'}{row.stale && ' · Hồ sơ cần đối soát lại'}
          </li>)}</ul></details>}
        </> : <p className="text-gray-500">Chưa tải được lịch sử gửi Meta; chưa thể xác nhận số sự kiện đã nhận.</p>}
      <button type="button" disabled={!report.enabled || !report.configured || !report.delivery?.available || report.delivery.guard?.blocked || sending}
        onClick={sync} className="rounded border px-3 py-1.5 disabled:opacity-50">{sending ? 'Đang đồng bộ…' : 'Đồng bộ kết quả về Meta'}</button>
      {message && <p role="status">{message}</p>}
    </div>}
  </section>;
}
