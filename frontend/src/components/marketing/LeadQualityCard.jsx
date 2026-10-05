import { useEffect, useRef, useState } from 'react';
import api from '../../lib/api';

const labels = { PENDING: 'Chờ xác minh', QUALIFIED: 'Đủ điều kiện về nhu cầu', REJECTED: 'Không đủ điều kiện' };
const emptyFacts = { contactVerified: false, demandMatches: false, serviceAreaVerified: false };

function QualityForm({ leadId }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [status, setStatus] = useState('PENDING');
  const [facts, setFacts] = useState(emptyFacts);
  const [evidence, setEvidence] = useState('');
  const generation = useRef(0);

  function accept(data) {
    if (!data || !labels[data.status] || !Number.isSafeInteger(data.revision) || !data.contextVersion) throw new Error('INVALID_RESPONSE');
    setResult(data); setStatus(data.status);
    setFacts(data.needsRecheck ? emptyFacts : Object.fromEntries(Object.keys(emptyFacts).map(k => [k, data.decision?.[k] === true])));
    setEvidence('');
  }
  useEffect(() => {
    const current = ++generation.current;
    setResult(null); setError(''); setBusy(true);
    api.get(`/crm/leads/${leadId}/marketing-quality`)
      .then(({ data }) => { if (generation.current === current) accept(data); })
      .catch(e => { if (generation.current === current) setError(e.response?.data?.error || 'Chưa đọc được hồ sơ xác nhận. Hãy tải lại.'); })
      .finally(() => { if (generation.current === current) setBusy(false); });
    return () => { generation.current++; };
  }, [leadId, reload]);

  async function save(event) {
    event.preventDefault();
    if (busy || !result) return;
    const current = ++generation.current;
    const body = { requestId: crypto.randomUUID(), expectedRevision: result.revision, contextVersion: result.contextVersion, status, ...facts, evidence: evidence.trim() };
    setBusy(true); setError(''); setResult(null);
    try {
      const { data } = await api.post(`/crm/leads/${leadId}/marketing-quality`, body);
      if (generation.current === current) accept(data);
    } catch (e) {
      if (generation.current === current) setError(e.response?.data?.error || 'Chưa xác nhận được kết quả lưu. Hãy tải lại trước khi thao tác tiếp.');
    } finally { if (generation.current === current) setBusy(false); }
  }

  const canQualify = result?.readyToQualify === true && Object.values(facts).every(v => v === true);
  return <section aria-label="Xác nhận nhu cầu khách" className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
    <div className="flex flex-wrap justify-between gap-3">
      <div><h3 className="font-semibold text-slate-900">Xác nhận nhu cầu khách</h3><p className="text-sm text-slate-600 mt-1">Ghi căn cứ từ trao đổi thực tế để xác nhận thông tin và nhu cầu.</p></div>
      <button type="button" disabled={busy} className="border rounded-lg px-3 py-2 text-sm disabled:opacity-50" onClick={() => { setResult(null); setBusy(true); setReload(x => x + 1); }}>Tải lại</button>
    </div>
    <div aria-live="polite">{busy ? <p>Đang kiểm tra hồ sơ…</p> : error ? <p role="alert" className="text-amber-800">{error}</p> : <p className="font-semibold">{labels[result?.status] || 'Chưa biết'}</p>}</div>
    {!busy && result && <>
      {result.needsRecheck && <p className="text-amber-800">Thông tin khách hoặc người phụ trách đã thay đổi. Cần xác minh lại; kết quả trước đang được giữ trong lịch sử.</p>}
      {!result.readyToQualify && <p className="text-amber-800">Cần thông tin liên hệ dùng được, khu vực phục vụ và người phụ trách đang hoạt động trước khi xác nhận đủ điều kiện.</p>}
      {result.decision?.evidence && <div className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-medium">Căn cứ đã ghi</p><p className="whitespace-pre-wrap break-words">{result.decision.evidence}</p><p className="mt-1 text-slate-600">{result.recordedAt ? new Date(result.recordedAt).toLocaleString('vi-VN') : ''}{result.needsRecheck ? ' · Cần kiểm tra lại' : ''}</p></div>}
      <form onSubmit={save} className="space-y-3">
        {Object.entries({ contactVerified: 'Đã xác minh liên hệ được với khách', demandMatches: 'Khách có nhu cầu thuộc sản phẩm VPT', serviceAreaVerified: 'Địa điểm thuộc vùng phục vụ đã xác nhận' }).map(([key, label]) => <label key={key} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={facts[key]} onChange={e => setFacts(v => ({ ...v, [key]: e.target.checked }))} className="mt-1" />{label}</label>)}
        <label className="block text-sm">Kết quả<select value={status} onChange={e => setStatus(e.target.value)} className="block w-full border rounded-lg p-2 mt-1"><option value="PENDING">Chờ xác minh</option><option value="QUALIFIED" disabled={!canQualify}>Đủ điều kiện về nhu cầu</option><option value="REJECTED">Không đủ điều kiện</option></select></label>
        <label className="block text-sm">Căn cứ xác nhận<textarea value={evidence} onChange={e => setEvidence(e.target.value)} minLength={20} maxLength={2000} required rows={3} placeholder="Ghi ngày trao đổi, thông tin đã xác minh và nhu cầu của khách…" className="block w-full border rounded-lg p-2 mt-1" /></label>
        <button disabled={busy || evidence.trim().length < 20 || (status === 'QUALIFIED' && !canQualify)} className="bg-blue-700 text-white px-4 py-2 rounded-lg disabled:opacity-50">Lưu xác nhận</button>
      </form>
    </>}
    <p className="text-sm text-slate-600">Kết quả này xác nhận nhu cầu. Để tính chi phí/khách quảng cáo, hệ thống còn phải kiểm tra khách trùng và nguồn quảng cáo.</p>
  </section>;
}
export default function LeadQualityCard({ leadId, companyId, revisionKey }) {
  if (!leadId || !companyId) return null;
  return <QualityForm key={`${companyId}|${leadId}|${revisionKey || ''}`} leadId={leadId} />;
}
