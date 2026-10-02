import { useEffect, useRef, useState } from 'react';
import api from '../../lib/api';

const button = 'rounded-lg border px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed';
const date = value => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

// Parent supplies a key per company/receipt and locks navigation during requests.
export default function FacebookLegacyReview({ companyId, receipt, onBusy, onClose, onDone }) {
  const [proposal, setProposal] = useState(null), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false);
  const [error, setError] = useState(''), [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const alive = useRef(false), pending = useRef(false), command = useRef(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  async function preview() {
    if (pending.current || command.current) return;
    pending.current = true; setLoading(true); onBusy(true); setError(''); setProposal(null); setConfirmed(false);
    try {
      const { data } = await api.post('/facebook/lead-intake/legacy/preview', { companyId, receiptId: receipt.id, expectedVersion: receipt.version }, { timeout: 60000 });
      if (!alive.current) return;
      if (data?.companyId !== companyId || data.receiptId !== receipt.id || !data.proposalId || !data.target?.leadId || !data.target?.customerId
        || !Array.isArray(data.matchedFields) || !data.matchedFields.length || data.matchedFields.some(x => !['phone', 'email'].includes(x))
        || !['PAID', 'ORGANIC', 'UNKNOWN'].includes(data.sourceKind) || !Number.isFinite(Date.parse(data.expiresAt)) || !Number.isFinite(Date.parse(data.acquiredAt))) throw Error('invalid preview');
      setProposal(data);
    } catch (e) {
      if (alive.current) setError(e.response?.status === 409 ? 'Hồ sơ hoặc thông tin liên hệ chưa khớp. Đóng phần này và tải lại hàng chờ để kiểm tra.' : 'Chưa xác minh được nguồn Facebook. Hồ sơ CRM vẫn giữ nguyên.');
    } finally { pending.current = false; if (alive.current) { setLoading(false); onBusy(false); } }
  }

  async function commit(event) {
    event.preventDefault();
    if (pending.current || !proposal || (!command.current && (!confirmed || reason.trim().length < 20))) return;
    if (!command.current && Date.parse(proposal.expiresAt) <= Date.now()) { setProposal(null); setConfirmed(false); setError('Bản đối soát đã hết hạn. Kiểm tra lại nguồn trước khi xác nhận.'); return; }
    if (!command.current) command.current = { companyId, requestId: crypto.randomUUID(), command: { proposalId: proposal.proposalId, reason: reason.trim() } };
    const payload = command.current;
    pending.current = true; setSaving(true); onBusy(true); setError('');
    let keepLocked = false;
    try {
      const { data } = await api.post('/facebook/lead-intake/legacy/commit', payload, { timeout: 15000 });
      if (!alive.current) return;
      if (data?.accepted !== true || data.companyId !== companyId || data.receiptId !== receipt.id || data.leadId !== proposal.target.leadId) throw Error('unconfirmed commit');
      onDone();
    } catch (e) {
      if (!alive.current) return;
      if ([400, 403, 409].includes(e.response?.status)) {
        command.current = null; setUncertain(false); setProposal(null); setConfirmed(false);
        setError('Chưa nối nguồn: quyền, hồ sơ hoặc thời hạn đã thay đổi. Đóng phần này và tải lại hàng chờ.');
      } else {
        keepLocked = true; setUncertain(true); setError('Chưa xác nhận được kết quả. Gửi lại cùng yêu cầu để kiểm tra, kể cả khi bản đối soát đã hết hạn.');
      }
    } finally { pending.current = false; if (alive.current) { setSaving(false); onBusy(keepLocked); } }
  }

  return <section className="mt-3 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4" aria-label="Đối soát hồ sơ khách cũ">
    <h4 className="font-semibold">Nối nguồn vào hồ sơ khách cũ</h4>
    <p className="text-sm">Hệ thống kiểm tra lại Facebook và hồ sơ đang liên kết. Việc xác nhận chỉ bổ sung bằng chứng nguồn; lịch sử, người phụ trách và trạng thái khách được giữ nguyên.</p>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {!proposal && <button type="button" className={button} onClick={preview} disabled={loading || saving}>{loading ? 'Đang kiểm tra nguồn…' : 'Kiểm tra nguồn Facebook'}</button>}
    {proposal && <form onSubmit={commit} className="space-y-3">
      <p className="text-sm">Hồ sơ: <strong>{proposal.target.code || 'Khách đã có'} · {proposal.target.title}</strong></p>
      <p className="text-sm">Đã khớp: {proposal.matchedFields.map(x => x === 'phone' ? 'số điện thoại' : 'email').join(', ')}. Nguồn: {proposal.sourceKind === 'PAID' ? 'quảng cáo' : proposal.sourceKind === 'ORGANIC' ? 'tự nhiên' : 'chưa xác định trả phí'}.</p>
      <p className="text-sm">Khách gửi biểu mẫu lúc {date(proposal.acquiredAt)}. Xác nhận trước {date(proposal.expiresAt)}.</p>
      <label className="block text-sm">Căn cứ đã kiểm tra hồ sơ (ít nhất 20 ký tự)<textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={2000} rows={3} disabled={saving || uncertain} className="mt-1 block w-full rounded border bg-white p-2" /></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={saving || uncertain} />Tôi đã kiểm tra đúng hồ sơ khách và đồng ý nối bằng chứng nguồn này.</label>
      <button type="submit" className={`${button} bg-blue-600 text-white`} disabled={saving || (!uncertain && (!confirmed || reason.trim().length < 20))}>{saving ? 'Đang xác nhận…' : uncertain ? 'Xác nhận lại cùng yêu cầu' : 'Xác nhận nối nguồn'}</button>
    </form>}
    <button type="button" className={button} onClick={onClose} disabled={loading || saving || uncertain}>Đóng</button>
  </section>;
}
