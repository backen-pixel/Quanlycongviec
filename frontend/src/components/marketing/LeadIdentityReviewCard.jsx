import { useEffect, useRef, useState } from 'react';
import api from '../../lib/api';

const actionNames = { RECONFIRM: 'Xác nhận lại nhóm khách', LINK: 'Cùng một khách', UNLINK: 'Gỡ liên kết trực tiếp', DISTINCT: 'Là hai khách khác nhau', REVOKE_DISTINCT: 'Thu hồi kết luận khác khách', DETACH_UNAVAILABLE: 'Gỡ liên kết với hồ sơ không còn trong phạm vi' };
const reasonNames = { MEMBER_UNAVAILABLE: 'Có hồ sơ không còn trong phạm vi', REVIEW_REQUIRED: 'Cần xác nhận lại sau thay đổi', CROSS_COMPANY_HISTORY: 'Còn lịch sử liên kết ở công ty khác', CONTACT_UNMATCHABLE: 'Thông tin liên hệ chưa đủ để so trùng', STALE_IDENTITY_EVIDENCE: 'Bằng chứng liên kết đã cũ', CONTRADICTORY_DISTINCTION: 'Các quyết định đang mâu thuẫn', UNRESOLVED_CONTACT_MATCH: 'Có hồ sơ khác dùng chung thông tin liên hệ' };
const button = 'rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50';
export default function LeadIdentityReviewCard({ leadId, companyId, revisionKey }) {
  if (!leadId || !companyId) return null;
  return <Review key={`${companyId}:${leadId}`} leadId={leadId} companyId={companyId} revisionKey={revisionKey} />;
}
function Review({ leadId, companyId, revisionKey }) {
  const [opened, setOpened] = useState(false), [data, setData] = useState(null), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [reload, setReload] = useState(0), [message, setMessage] = useState('');
  const [peer, setPeer] = useState(''), [search, setSearch] = useState(''), [action, setAction] = useState('RECONFIRM');
  const [evidence, setEvidence] = useState(''), [confirmed, setConfirmed] = useState(false), [uncertain, setUncertain] = useState(false);
  const seq = useRef(0), pending = useRef(null), saving = useRef(false);
  const previousRevision = useRef(revisionKey), [sourceChanged, setSourceChanged] = useState(false);
  function accept(next) {
    if (next?.companyId !== companyId || !Array.isArray(next.groups) || !Array.isArray(next.candidates) || !Array.isArray(next.distinctions) || !next.snapshotToken || !next.groups.every(g => Array.isArray(g.members) && Array.isArray(g.reasons)) || !next.groups.some(g => g.members.some(m => m.leadId === leadId && m.available))) throw Error('invalid scope');
    setData(next); setSourceChanged(false); setError(''); setPeer(''); setSearch(''); setAction('RECONFIRM'); setEvidence(''); setConfirmed(false); setUncertain(false); pending.current = null;
  }
  useEffect(() => {
    if (previousRevision.current === revisionKey) return;
    previousRevision.current = revisionKey; setSourceChanged(true);
    if (pending.current) return; // Preserve the exact request until its outcome is known.
    ++seq.current; setData(null); setConfirmed(false); setReload(n => n + 1);
  }, [revisionKey]);
  useEffect(() => {
    const current = ++seq.current; if (!opened) return () => { seq.current++; };
    const controller = new AbortController();setData(null);setError('');setBusy(true);
    api.get(`/crm/leads/${leadId}/identity-review`, { signal: controller.signal, timeout: 20000 })
      .then(({ data: next }) => { if (seq.current === current) accept(next); })
      .catch(e => { if (seq.current === current) { setData(null); setError(e.response?.data?.error || 'Chưa rà được dữ liệu khách. Hãy tải lại.'); } })
      .finally(() => { if (seq.current === current) setBusy(false); });
    return () => { ++seq.current; controller.abort(); };
  }, [opened, reload, leadId, companyId]);
  async function save(event) {
    event.preventDefault(); if (saving.current || !data || (!pending.current && (!confirmed || evidence.trim().length < 20 || (action !== 'RECONFIRM' && !peer)))) return;
    const current = seq.current;
    if (!pending.current) pending.current = { requestId: crypto.randomUUID(), action, ...(action !== 'RECONFIRM' ? { peerLeadId: peer } : {}), snapshotToken: data.snapshotToken, evidence: evidence.trim() };
    saving.current = true; setBusy(true); setMessage('');
    try { const { data: next } = await api.post(`/crm/leads/${leadId}/identity-review`, pending.current, { timeout: 20000 }); if (seq.current === current) { accept(next); setMessage('Đã ghi nhận quyết định và cập nhật kết quả rà khách.'); } }
    catch (e) { if (seq.current !== current) return;
      if ([400,403,404,409].includes(e.response?.status)) { setData(null); setUncertain(false); pending.current = null; setError(e.response?.data?.error || 'Hồ sơ hoặc quyền đã thay đổi. Cần tải lại.'); }
      else { setUncertain(true); setMessage('Chưa xác nhận được kết quả. Gửi lại cùng yêu cầu để xác nhận; không đổi nội dung trong lúc này.'); }
    } finally { saving.current = false; if (seq.current === current) setBusy(false); }
  }
  const group = data?.groups.find(g => g.members.some(m => m.leadId === leadId));
  const members = data?.groups.flatMap(g => g.members.map(m => ({ ...m, groupId: g.groupId }))) || [];
  const related = data?.candidates.filter(c => c.leftGroupId === group?.groupId || c.rightGroupId === group?.groupId) || [];
  const label = id => members.find(m => m.leadId === id)?.title || 'Hồ sơ không còn trong phạm vi';
  const candidates = members.filter(m => m.leadId !== leadId && (action === 'DETACH_UNAVAILABLE' ? !m.available && m.groupId === group?.groupId : m.available) && (!search || `${m.title || ''} ${m.leadId}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))));
  return <section aria-label="Rà khách trùng" className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
    <div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">Rà khách trùng</h3><p className="mt-1 text-sm text-slate-600">So thông tin liên hệ với hồ sơ toàn công ty; giữ nguyên khách, lịch sử và nguồn quảng cáo.</p></div><button type="button" className={button} disabled={busy || uncertain} onClick={() => { setOpened(true); setReload(n => n + 1); }}>{opened ? 'Rà lại' : 'Kiểm tra khách trùng'}</button></div>
    {busy && <p role="status">Đang kiểm tra…</p>}{error && <p role="alert" className="text-amber-800">{error}</p>}{message && <p role="status" className="text-sm text-blue-800">{message}</p>}
    {group && <>
      <p className="font-medium">{sourceChanged ? 'Hồ sơ vừa thay đổi; đang xác nhận lại kết quả' : group.deduplicationComplete ? 'Đã rà xong theo thông tin liên hệ tại lần kiểm tra' : 'Còn điểm cần xác minh trước khi tính khách duy nhất'}</p>
      <p className="text-xs text-slate-600">Lần kiểm tra: {new Date(data.asOf).toLocaleString('vi-VN')}</p>
      {!!group.reasons.length && <ul className="list-disc pl-5 text-sm text-amber-800">{group.reasons.map(r => <li key={r}>{reasonNames[r] || 'Cần kiểm tra thêm'}</li>)}</ul>}
      <p className="text-sm">Nhóm hiện tại: {group.members.map(m => m.available ? m.title || 'Hồ sơ chưa có tên' : 'Hồ sơ không còn trong phạm vi').join(' · ')}</p>
      {!!related.length && <ul className="space-y-2 text-sm">{related.map(c => { const other = data.groups.find(g => g.groupId === (c.leftGroupId === group.groupId ? c.rightGroupId : c.leftGroupId));return <li key={`${c.leftGroupId}:${c.rightGroupId}`} className="rounded-lg bg-slate-50 p-2">{other?.members.filter(m => m.available).map(m => m.title || 'Hồ sơ chưa có tên').join(' · ')} — {c.resolved ? 'Đã xác nhận khác khách' : 'Cần xác minh cùng hay khác khách'} ({c.matchingFields.map(f => f === 'PHONE' ? 'số điện thoại' : 'email').join(', ')})</li>;})}</ul>}
      {!!data.distinctions.filter(d => group.members.some(m => m.leadId === d.leftLeadId || m.leadId === d.rightLeadId)).length && <details><summary className="cursor-pointer text-sm">Các kết luận khác khách đã ghi</summary><ul className="text-sm space-y-1 mt-2">{data.distinctions.filter(d => group.members.some(m => m.leadId === d.leftLeadId || m.leadId === d.rightLeadId)).map(d => <li key={`${d.leftLeadId}:${d.rightLeadId}`}>{label(d.leftLeadId)} / {label(d.rightLeadId)} · {d.current ? 'Thông tin hai hồ sơ còn khớp' : 'Thông tin đã thay đổi, cần rà lại'}</li>)}</ul></details>}
      <form onSubmit={save} className="space-y-3 border-t pt-3">
        <label className="block text-sm">Kết luận cần ghi<select className="mt-1 block w-full rounded-lg border p-2" value={action} disabled={busy || uncertain} onChange={e => { setAction(e.target.value); setPeer(''); setConfirmed(false); }}>{Object.entries(actionNames).map(([key,name]) => <option key={key} value={key}>{name}</option>)}</select></label>
        {action !== 'RECONFIRM' && <><label className="block text-sm">Tìm hồ sơ đối chiếu<input type="search" className="mt-1 block w-full rounded-lg border p-2" value={search} disabled={busy || uncertain} onChange={e => { setSearch(e.target.value); setPeer(''); setConfirmed(false); }} /></label><label className="block text-sm">Hồ sơ đối chiếu<select className="mt-1 block w-full rounded-lg border p-2" value={peer} disabled={busy || uncertain} onChange={e => { setPeer(e.target.value); setConfirmed(false); }}><option value="">Chọn hồ sơ</option>{candidates.slice(0,50).map(m => <option key={m.leadId} value={m.leadId}>{m.title || 'Hồ sơ không còn trong phạm vi'} · {m.leadId.slice(0,8)}</option>)}</select></label>{candidates.length > 50 && <p className="text-xs text-slate-600">Đang hiện 50 kết quả đầu. Nhập tên để thu hẹp danh sách.</p>}</>}
        <label className="block text-sm">Bằng chứng đã xác minh<textarea className="mt-1 block w-full rounded-lg border p-2" rows={3} minLength={20} maxLength={2000} value={evidence} disabled={busy || uncertain} onChange={e => setEvidence(e.target.value)} /></label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy || uncertain} onChange={e => setConfirmed(e.target.checked)} />Tôi đã kiểm tra toàn bộ hồ sơ liên quan và chịu trách nhiệm về kết luận này.</label>
        <button className={`${button} bg-blue-700 text-white`} disabled={busy || (!uncertain && (!confirmed || evidence.trim().length < 20 || (action !== 'RECONFIRM' && !peer)))}>{uncertain ? 'Xác nhận lại cùng yêu cầu' : 'Lưu kết luận'}</button>
      </form>
      <p className="text-xs text-slate-600">Đây là kết quả so trùng tại thời điểm đọc, chưa xác nhận nhu cầu hoặc nguồn trả phí. Hồ sơ mới và thông tin đổi sẽ được rà lại. Gỡ liên kết không xóa khách hay bằng chứng nguồn.</p>
    </>}
  </section>;
}
