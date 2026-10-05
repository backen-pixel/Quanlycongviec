import { useEffect, useRef, useState } from 'react';
import api from '../../lib/api';
import { uuid, queueResult, detailResult, receiptResult, pendingRead, pendingSave, pendingClear } from './surveyHandoffState.mjs';

const endpoint = '/facebook/customer-care/survey';
const date = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Chưa có';
const modes = { WAITING: 'Chưa có yêu cầu tiếp quản', HUMAN_REQUESTED: 'Khách cần người hỗ trợ', HUMAN_ACTIVE: 'Nhân viên đang tiếp quản', OPTED_OUT: 'Khách yêu cầu ngừng liên hệ' };
const button = 'rounded border px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed';
export default function SurveyHandoffs({ companyId, actorId }) {
  if (!uuid(companyId) || !uuid(actorId)) return <p role="status">Chọn một công ty để xem bàn giao khảo sát.</p>;
  return <Workspace key={`${actorId}:${companyId}`} company={companyId} actor={actorId} />;
}
function Workspace({ company, actor }) {
  const [state, setState] = useState('PENDING'), [queue, setQueue] = useState(null), [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [receipt, setReceipt] = useState(null), [pending, setPending] = useState(null), [storageError, setStorageError] = useState('');
  const life = useRef(0), lock = useRef(false);
  useEffect(() => {
    const generation = ++life.current;
    try { setPending(pendingRead(sessionStorage, actor, company)); } catch { setStorageError('Không đọc được yêu cầu đã lưu. Chưa thể gửi xác nhận mới; cần kiểm tra trình duyệt.'); }
    void loadQueue('PENDING', false, generation);
    return () => { life.current++; lock.current = false; };
    // Company/actor changes remount the workspace, invalidating late responses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function perform(operation, generation = life.current) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await operation(() => generation === life.current); }
    catch (e) {
      if (generation !== life.current) return;
      setDetail(null); setQueue(null);
      setError(e.response?.data?.error || e.message || 'Chưa tải được dữ liệu.');
    } finally { if (generation === life.current) { lock.current = false; setBusy(false); } }
  }
  async function loadQueue(nextState = state, more = false, generation) {
    const previous = queue;
    await perform(async current => {
      if (!more) { setQueue(null); setDetail(null); setState(nextState); }
      const { data } = await api.get(`${endpoint}/handoffs`, { params: { companyId: company, state: nextState, ...(more ? { after: previous.nextAfter, version: previous.version } : {}) } });
      if (!current()) return;
      const value = queueResult(data, company, nextState);
      if (more && (value.version !== previous.version || value.items.some(i => previous.items.some(p => p.proposalId === i.proposalId)))) throw Error('Danh sách đã đổi. Tải lại từ đầu.');
      setQueue({ ...value, items: more ? [...previous.items, ...value.items] : value.items });
    }, generation);
  }
  async function open(proposal, more = false) {
    const previous = detail;
    await perform(async current => {
      if (!more) { setDetail(null); setReceipt(null); }
      const { data } = await api.get(`${endpoint}/handoff`, { params: { companyId: company, proposalId: proposal, ...(more ? { before: previous.nextBefore, version: previous.version } : {}) } });
      if (!current()) return;
      const value = detailResult(data, company, proposal);
      if (more && (value.version !== previous.version || value.messages.some(m => previous.messages.some(p => p.id === m.id)))) throw Error('Hội thoại đã thay đổi. Mở lại hồ sơ.');
      setDetail({ ...value, messages: more ? [...value.messages, ...previous.messages] : value.messages });
    });
  }
  async function acknowledge(retry = false) {
    if (storageError || (!retry && (pending || !detail?.canAcknowledge || detail.recipientId !== actor))) return;
    const command = retry ? pending : { companyId: company, requestId: crypto.randomUUID(), command: { proposalId: detail.proposalId, expectedVersion: detail.version } };
    if (!command) return;
    await perform(async current => {
      // Store before any POST, including across reload/unknown response.
      try { pendingSave(sessionStorage, actor, company, command); } catch { setStorageError('Không lưu được yêu cầu an toàn. Chưa gửi xác nhận.'); return; }
      setPending(command);
      try {
        const { data } = await api.post(`${endpoint}/handoff/ack`, command);
        if (!current()) return;
        const value = receiptResult(data, command, actor);
        setReceipt(value); setDetail(null); setQueue(null);
        pendingClear(sessionStorage, actor, company); setPending(null);
      } catch (e) {
        if (!current()) return;
        if ([400, 409].includes(e.response?.status)) { pendingClear(sessionStorage, actor, company); setPending(null); }
        throw e;
      }
    });
  }
  return <section className="space-y-4" aria-label="Bàn giao khảo sát">
    <p className="text-sm text-gray-600">Khách xác nhận lịch và nhân viên nhận hồ sơ là hai bước riêng. Xác nhận dưới đây chỉ ghi nhận đã nhận bàn giao.</p>
    <div className="flex flex-wrap gap-2">
      <button className={button} disabled={busy} aria-pressed={state === 'PENDING'} onClick={() => loadQueue('PENDING')}>Chờ nhận</button>
      <button className={button} disabled={busy} aria-pressed={state === 'ACKNOWLEDGED'} onClick={() => loadQueue('ACKNOWLEDGED')}>Đã nhận</button>
      <button className={button} disabled={busy} onClick={() => loadQueue()}>Tải lại danh sách</button>
    </div>
    {busy && <p role="status">Đang đối chiếu hồ sơ…</p>}
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error} Dữ liệu cũ đã được ẩn.</p>}
    {storageError && <p role="alert" className="rounded bg-amber-50 p-3">{storageError}</p>}
    {pending && <div role="status" className="rounded border border-amber-400 p-3">
      <p>Một yêu cầu nhận bàn giao chưa được đối chiếu. Gửi lại đúng yêu cầu sẽ kiểm tra kết quả đã lưu.</p>
      <button className={button} disabled={busy || !!storageError} onClick={() => acknowledge(true)}>Kiểm tra lại kết quả nhận việc</button>
    </div>}
    {receipt && <p role="status" className="rounded bg-emerald-50 p-3">Đã ghi nhận anh/chị nhận hồ sơ lúc {date(receipt.receivedAt)}. Tải lại danh sách để xem trạng thái mới.</p>}
    {queue && <>
      <p className="text-sm">Trong phạm vi được xem: <strong>{queue.counts.PENDING} chờ nhận</strong> · {queue.counts.ACKNOWLEDGED} đã nhận. Cập nhật {date(queue.observedAt)}.</p>
      {queue.unavailableCount > 0 && <p className="text-amber-800">{queue.unavailableCount} hồ sơ cần kiểm tra lại quyền hoặc liên kết nguồn. Chi tiết khách được ẩn.</p>}
      <ul className="space-y-2">{queue.items.map(item => <li key={item.proposalId} className="rounded border p-3 flex flex-wrap justify-between gap-2">
        <div><strong>{item.scopeReady ? item.title || 'Hồ sơ khảo sát' : 'Cần kiểm tra phạm vi bàn giao'}</strong>
          <p className="text-sm">{item.scopeReady ? date(item.appointment?.startsAt) : `Mã hồ sơ: ${item.proposalId}`}</p></div>
        <button className={button} disabled={busy || !item.scopeReady} onClick={() => open(item.proposalId)}>Xem hồ sơ</button>
      </li>)}</ul>
      {!queue.items.length && <p>Không có hồ sơ ở trạng thái này trong phạm vi được xem.</p>}
      {queue.nextAfter && <button className={button} disabled={busy} onClick={() => loadQueue(state, true)}>Xem thêm bàn giao</button>}
    </>}
    {detail && <article className="rounded border p-4 space-y-4" aria-label="Chi tiết bàn giao">
      <h2 className="font-semibold text-lg">{detail.leadTitle || 'Hồ sơ khảo sát'}</h2>
      <dl className="grid gap-2 sm:grid-cols-2 text-sm">
        <div><dt>Khách hàng</dt><dd>{detail.customer.name || 'Chưa có tên'} · {detail.customer.phone || 'Chưa có điện thoại'}</dd></div>
        <div><dt>Người nhận</dt><dd>{detail.recipientName || detail.recipientId}</dd></div>
        <div><dt>Lịch hiện tại (giờ Việt Nam)</dt><dd>{date(detail.appointment.startsAt)} — {date(detail.appointment.endsAt)}</dd></div>
        <div><dt>Địa điểm</dt><dd className="whitespace-pre-wrap">{detail.appointment.location || 'Chưa có'}</dd></div>
      </dl>
      <div><h3 className="font-medium">Nhu cầu đã lưu trong CRM</h3><p className="whitespace-pre-wrap">{detail.requirements || 'Chưa có bản tóm tắt. Xem hội thoại bên dưới.'}</p></div>
      <p className="rounded bg-amber-50 p-3">{modes[detail.careMode]}. Việc nhận hồ sơ không cho phép AI nhắn tiếp và không xác nhận khảo sát đã hoàn thành.</p>
      {detail.deliveryConflict && <p role="alert">Có sai lệch bằng chứng gửi lịch; cần người phụ trách kiểm tra.</p>}
      {!detail.assignmentCurrent && <p role="alert">Người nhận hoặc quyền khu vực đã thay đổi. Chưa thể xác nhận nhận việc.</p>}
      {!detail.appointmentUnchanged && <p role="alert">Lịch hiện tại khác lịch khách đã xác nhận: {date(detail.confirmedAppointment.startsAt)}, {detail.confirmedAppointment.location}. Cần xử lý thay đổi trước.</p>}
      {detail.receipt ? <p>Đã nhận bàn giao lúc {date(detail.receipt.receivedAt)}.</p> : <button className={`${button} bg-blue-700 text-white`} disabled={busy || !!pending || !!storageError || !detail.canAcknowledge || detail.recipientId !== actor} onClick={() => acknowledge()}>Tôi đã nhận hồ sơ khảo sát</button>}
      {!detail.canAcknowledge && !detail.receipt && detail.recipientId !== actor && <p className="text-sm">Chỉ người đang được giao khảo sát mới xác nhận nhận hồ sơ.</p>}
      <h3 className="font-medium">Hội thoại · đã tải {detail.messages.length}/{detail.messageCount} tin</h3>
      {detail.nextBefore && <button className={button} disabled={busy} onClick={() => open(detail.proposalId, true)}>Tải hội thoại cũ hơn</button>}
      <ol className="space-y-3">{detail.messages.map(message => <li key={message.id} className="rounded bg-gray-50 p-3">
        <p className="text-xs text-gray-500">{message.direction === 'inbound' ? 'Khách' : 'Trang'} · {date(message.sent_at)}</p>
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        {message.attachments.length > 0 && <details><summary>{message.attachments.length} tệp đính kèm — thông tin nguồn</summary>
          <p className="text-sm">Địa chỉ chỉ được hiển thị để đối chiếu, không tự mở hoặc tải tệp.</p>
          <pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(message.attachments, null, 2)}</pre>
        </details>}
      </li>)}</ol>
    </article>}
  </section>;
}
