import { useEffect, useRef, useState } from 'react';
import api from '../../lib/api';

const labels = { PENDING: 'Chờ xử lý', LEASED: 'Đang xử lý', DONE: 'Đã vào CRM', REVIEW: 'Cần kiểm tra' };
const explanations = {
  PROVIDER_UNAVAILABLE: 'Chưa đọc được thông tin từ Facebook. Kiểm tra kết nối và quyền truy cập.',
  SOURCE_CONFIG: 'Cấu hình kết nối Facebook cần được kiểm tra.',
  PROVIDER_SCOPE_MISMATCH: 'Thông tin Facebook chưa khớp Page, biểu mẫu hoặc tài khoản quảng cáo.',
  CONFLICTING_PAID_SOURCE: 'Bằng chứng nguồn quảng cáo chưa khớp.',
  INTAKE_PROCESSING_UNAVAILABLE: 'Chưa hoàn tất nhận khách. Kiểm tra cấu hình và quyền người nhận.',
  INVALID_PROVIDER_FIELDS: 'Các trường trong biểu mẫu chưa đọc được.',
  AMBIGUOUS_CONTACT: 'Thông tin liên hệ trong biểu mẫu chưa rõ.',
  INVALID_CONTACT: 'Thông tin liên hệ cần được kiểm tra.',
  ENVELOPE_SCOPE_CONFLICT: 'Thông tin công ty hoặc biểu mẫu mâu thuẫn; cần đối soát riêng.',
  LEGACY_RECONCILIATION_REQUIRED: 'Đã có dấu vết nhận khách trong dữ liệu cũ; cần đối soát để tránh trùng.',
};
const blocks = {
  CRM_ALREADY_LINKED: 'Đã có dấu vết hồ sơ CRM. Cần đối soát riêng.', SCOPE_CONFLICT: explanations.ENVELOPE_SCOPE_CONFLICT,
  LEGACY_RECONCILIATION_REQUIRED: explanations.LEGACY_RECONCILIATION_REQUIRED,
  WORKER_OWNS_RECEIPT: 'Hệ thống đang xử lý hoặc chờ hết thời gian giữ việc.', ALREADY_QUEUED: 'Đã nằm trong hàng chờ tự động.',
  BINDING_UNAVAILABLE: 'Cần hoàn thiện cấu hình biểu mẫu trước.', PAGE_UNAVAILABLE: 'Page chưa sẵn sàng trong công ty này.',
};
const date = value => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
const button = 'rounded-lg border px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed';

// Keyed scope prevents old company data/commands from surviving a company switch.
export default function FacebookLeadIntakeConsole({ companyId }) {
  if (!companyId) return <div className="p-6 text-sm text-gray-600">Chọn một công ty để xem việc tiếp nhận khách từ biểu mẫu.</div>;
  return <CompanyConsole key={companyId} companyId={companyId} />;
}

function CompanyConsole({ companyId }) {
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [cursor, setCursor] = useState(''), [history, setHistory] = useState([]), [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState(null), [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false), [notice, setNotice] = useState(''), [uncertain, setUncertain] = useState(false);
  const generation = useRef(0), alive = useRef(false), writing = useRef(false), command = useRef(null);
  useEffect(() => {
    alive.current = true;
    const seq = ++generation.current, controller = new AbortController();
    setLoading(true); setData(null); setError(''); setSelected(null); setReason(''); setConfirmed(false); command.current = null; setUncertain(false);
    api.get('/facebook/lead-intake/console', { params: { companyId, ...(cursor ? { cursor } : {}) }, signal: controller.signal, timeout: 15000 })
      .then(({ data: next }) => {
        if (!alive.current || generation.current !== seq) return;
        if (next?.companyId !== companyId || !Array.isArray(next.items) || !Array.isArray(next.bindings) || !next.receiptCounts || Object.values(next.receiptCounts).some(n => !Number.isSafeInteger(n) || n < 0)) throw Error('invalid response');
        setData(next);
      })
      .catch(() => { if (alive.current && generation.current === seq) { setData(null); setError('Chưa đọc được hàng chờ. Kiểm tra quyền hoặc kết nối rồi tải lại.'); } })
      .finally(() => { if (alive.current && generation.current === seq) setLoading(false); });
    return () => { alive.current = false; ++generation.current; controller.abort(); };
  }, [companyId, cursor, refresh]);

  function reload() { setCursor(''); setHistory([]); setRefresh(n => n + 1); }
  function choose(item) { command.current = null; setSelected(item); setReason(''); setConfirmed(false); setNotice(''); setUncertain(false); }
  async function recover(event) {
    event.preventDefault();
    if (writing.current || !selected || !data?.recoveryEnabled || (!command.current && (!confirmed || reason.trim().length < 20))) return;
    if (!command.current) command.current = { companyId, requestId: crypto.randomUUID(), command: { receiptId: selected.id, expectedVersion: selected.version, bindingRevision: selected.currentBindingRevision, reason: reason.trim() } };
    const payload = command.current, seq = generation.current;
    writing.current = true; setSaving(true); setNotice('');
    try {
      const result = await api.post('/facebook/lead-intake/recover', payload, { timeout: 15000 });
      if (!alive.current || generation.current !== seq) return;
      if (result.data?.accepted !== true || result.data.receiptId !== payload.command.receiptId) throw Error('unconfirmed response');
      setNotice('Đã ghi nhận yêu cầu thử lại. Khách chỉ được tính đã vào CRM sau khi xử lý thành công.');
      reload();
    } catch (e) {
      if (!alive.current || generation.current !== seq) return;
      if ([400, 403, 409].includes(e.response?.status)) {
        setData(null); setSelected(null); command.current = null; setUncertain(false);
        setError('Chưa thực hiện: quyền, hồ sơ hoặc cấu hình cần được kiểm tra lại. Hãy tải lại hàng chờ.');
      } else {
        setUncertain(true); setNotice('Chưa xác nhận được kết quả. Gửi lại cùng yêu cầu để kiểm tra; hệ thống sẽ không tạo thêm lần xử lý nếu yêu cầu đã được nhận.');
      }
    } finally { writing.current = false; if (alive.current && generation.current === seq) setSaving(false); }
  }
  const binding = item => data?.bindings.find(b => b.pageId === item.pageId && b.formId === item.formId);
  return <section className="h-full overflow-y-auto bg-gray-50 p-4 sm:p-6" aria-label="Tiếp nhận khách từ biểu mẫu Facebook">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold text-gray-900">Tiếp nhận khách từ biểu mẫu</h2><p className="mt-1 text-sm text-gray-600">Theo dõi khách đã vào CRM và xử lý những lần nhận chưa hoàn tất.</p></div>
      <button type="button" className={button} onClick={reload} disabled={saving || loading || uncertain}>Tải lại</button>
    </div>
    <p className="my-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">Số đã vào CRM là số lần nhận thành công. Chi phí 250.000 đồng/khách chỉ được đánh giá sau khi xác minh khách hợp lệ, không trùng và có nguồn quảng cáo.</p>
    {loading && <p role="status">Đang đọc hàng chờ…</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
    {notice && <p role="status" className="my-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{notice}</p>}
    {data && !loading && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Object.entries(labels).map(([key, label]) => <div key={key} className="rounded-xl border bg-white p-4"><p className="text-sm text-gray-600">{label}</p><p className="mt-1 text-2xl font-semibold">{(data.receiptCounts[key] || 0).toLocaleString('vi-VN')}</p></div>)}</div>
      <p className="mt-2 text-xs text-gray-500">Toàn bộ lịch sử tiếp nhận của công ty · Cập nhật {date(data.observedAt)}</p>
      <details className="my-5 rounded-xl border bg-white p-4"><summary className="cursor-pointer font-medium">Biểu mẫu và người nhận ({data.bindings.length})</summary>
        {data.bindings.length === 0 ? <p className="mt-3 text-sm">Chưa có cấu hình nhận biểu mẫu.</p> : <ul className="mt-3 space-y-3">{data.bindings.map(b => <li key={`${b.pageId}:${b.formId}`} className="border-t pt-3 text-sm"><strong>{b.pageName}</strong> · Biểu mẫu {b.formId}<p>{b.regionName} · {b.ownerName} · {b.productName}</p><p className="text-gray-500">Bản cấu hình {b.revision} · {b.active ? 'Được phép xử lý khi hệ thống tiếp nhận đã mở' : 'Tạm ngừng'}</p></li>)}</ul>}
      </details>
      <h3 className="font-semibold">Khách đang chờ</h3><p className="mb-3 text-sm text-gray-500">Tối đa 50 bản ghi mỗi trang, cũ nhất trước. Tổng phía trên bao gồm các trang khác.</p>
      {!data.recoveryEnabled && <p className="mb-3 text-sm text-amber-800">Thao tác thử lại chưa được mở. Có thể xem hàng chờ và cấu hình hiện tại.</p>}
      {data.items.length === 0 ? <p className="rounded-lg border bg-white p-4">Không có bản ghi đang chờ trên trang này.</p> : <ul className="space-y-3">{data.items.map(item => <li key={item.id} className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap justify-between gap-2"><strong>{binding(item)?.pageName || `Page ${item.pageId}`} · Biểu mẫu {item.formId}</strong><span className="text-sm">{labels[item.state] || 'Cần kiểm tra'}</span></div>
        <p className="mt-1 text-xs text-gray-500">Nhận lúc {date(item.receivedAt)} · Đã thử {item.attempts} lần</p>
        <p className="mt-2 text-sm">{item.failureCode ? explanations[item.failureCode] || 'Chưa hoàn tất nhận khách; cần kiểm tra trước khi thử lại.' : 'Đang chờ hệ thống xử lý.'}</p>
        {item.retryBlock ? <p className="mt-2 text-sm text-gray-600">{blocks[item.retryBlock] || 'Cần đối soát riêng trước khi tiếp tục.'}</p> : <button type="button" className={`${button} mt-3`} disabled={!data.recoveryEnabled || saving || uncertain} onClick={() => choose(item)}>Xem và thử lại</button>}
        {selected?.id === item.id && <form onSubmit={recover} className="mt-4 space-y-3 rounded-lg bg-gray-50 p-3">
          <p className="text-sm">Cấu hình đã nhận: {item.bindingRevision ?? 'chưa có'} → dùng bản {item.currentBindingRevision}. Người nhận: <strong>{binding(item)?.ownerName}</strong>; khu vực: <strong>{binding(item)?.regionName}</strong>.</p>
          <label className="block text-sm">Lý do thử lại và việc đã kiểm tra (ít nhất 20 ký tự)<textarea className="mt-1 block w-full rounded-lg border bg-white p-2" rows={3} maxLength={2000} value={reason} disabled={saving || uncertain} onChange={e => setReason(e.target.value)} /></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmed} disabled={saving || uncertain} onChange={e => setConfirmed(e.target.checked)} />Tôi đã kiểm tra người nhận và đồng ý dùng bản cấu hình hiện tại cho lần nhận này.</label>
          <button type="submit" className={`${button} bg-blue-600 text-white`} disabled={saving || (!uncertain && (!confirmed || reason.trim().length < 20))}>{saving ? 'Đang xác nhận…' : uncertain ? 'Xác nhận lại cùng yêu cầu' : 'Xác nhận thử lại'}</button>
          {!uncertain && <button type="button" className={`${button} ml-2`} disabled={saving} onClick={() => setSelected(null)}>Hủy</button>}
        </form>}
      </li>)}</ul>}
      <div className="mt-4 flex gap-3"><button type="button" className={button} disabled={!history.length || saving || uncertain} onClick={() => { setCursor(history.at(-1)); setHistory(h => h.slice(0, -1)); }}>Trang trước</button><button type="button" className={button} disabled={!data.nextCursor || saving || uncertain} onClick={() => { setHistory(h => [...h, cursor]); setCursor(data.nextCursor); }}>Trang tiếp</button></div>
    </>}
  </section>;
}
