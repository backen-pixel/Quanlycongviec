import { useEffect, useRef, useState } from 'react';
import api from '../../lib/api';
import { uuid, kinds, registryResult, receiptResult, initialEntries, pendingRead, pendingSave, pendingClear } from './sourceRegistryState.mjs';
const button = 'rounded border px-3 py-2 text-sm disabled:opacity-50';
const input = 'block w-full rounded border p-2';
const statuses = { MISSING: 'Chưa xác nhận phạm vi', CURRENT: 'Danh mục còn khớp cấu hình', STALE_AUTHORITY: 'Cần người hiện có quyền xác nhận lại', STALE_CONFIGURATION: 'Cấu hình nguồn đã đổi — cần rà lại' };
const gaps = { TRIAL_ACCOUNT_ROSTER_CHANGED: 'Danh sách tài khoản đã khác kỳ đo', ACCOUNT_UNAVAILABLE: 'Tài khoản chưa sẵn sàng', FORM_ROUTING_UNVERIFIED: 'Chưa xác minh đường nhận của biểu mẫu', FORM_ACCOUNT_UNRESOLVED: 'Chưa xác định tài khoản của biểu mẫu', ENTRYPOINT_COVERAGE_UNVERIFIED: 'Chưa đối soát đủ khách ở điểm nhận này', PAGE_UNAVAILABLE: 'Page chưa sẵn sàng', KNOWN_FORM_NOT_DECLARED: 'Có biểu mẫu đã biết chưa được khai báo' };
export default function SourceRegistry({ actorId, companyId, trialId, summary, onRefresh }) {
  const [open, setOpen] = useState(false), [visibleSummary, setVisibleSummary] = useState(summary);
  return <section className="rounded border p-3 space-y-3" aria-label="Phạm vi nguồn khách">
    <h3 className="font-semibold">Phạm vi nguồn khách</h3>
    <p>{visibleSummary ? statuses[visibleSummary.status] || 'Chưa đọc được danh mục' : 'Chưa xác nhận được danh mục hiện tại'}. Danh mục xác nhận phạm vi cần đo; số khách từ nền tảng vẫn cần đối soát.</p>
    {!!visibleSummary?.gaps?.length && <ul className="list-disc pl-5 text-sm text-amber-800">{visibleSummary.gaps.map((g, n) => <li key={n}>{gaps[g.code] || 'Cần kiểm tra nguồn'}{g.accountId ? ` · ${g.accountId}` : ''}{g.pageId ? ` · Page ${g.pageId}` : ''}{g.formId ? ` · Biểu mẫu ${g.formId}` : ''}</li>)}</ul>}
    {uuid(actorId) && <button className={button} onClick={() => setOpen(v => !v)}>{open ? 'Đóng danh mục' : 'Xem và xác nhận danh mục nguồn'}</button>}
    {open && uuid(actorId) && <Editor key={`${actorId}:${companyId}:${trialId}`} actor={actorId} company={companyId} trial={trialId} onRefresh={onRefresh} onSummary={setVisibleSummary} />}
  </section>;
}
function Editor({ actor, company, trial, onRefresh, onSummary }) {
  const [registry, setRegistry] = useState(null), [entries, setEntries] = useState([]), [reference, setReference] = useState(''), [sourceDate, setSourceDate] = useState(''), [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false), [pending, setPending] = useState(null), [receipt, setReceipt] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [storageError, setStorageError] = useState('');
  const life = useRef(0), lock = useRef(false), url = `/crm/marketing-trials/${trial}/source-registry`;
  useEffect(() => {
    const generation = ++life.current;
    try { setPending(pendingRead(sessionStorage, actor, company, trial)); } catch { setStorageError('Không đọc được yêu cầu đã lưu. Chưa thể gửi yêu cầu mới.'); }
    void load(generation);
    return () => { life.current++; lock.current = false; };
    // Identity/scope changes remount this editor and invalidate late responses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function perform(operation, generation = life.current) {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try { await operation(() => generation === life.current); }
    catch (e) { if (generation === life.current) { setRegistry(null); onSummary(null); setError(e.response?.data?.error || e.message || 'Chưa đọc được nguồn.'); } }
    finally { if (generation === life.current) { lock.current = false; setBusy(false); } }
  }
  async function load(generation) {
    await perform(async current => {
      setRegistry(null); onSummary(null); setConfirmed(false); setReceipt(null);
      const { data } = await api.get(url, { params: { company_id: company }, timeout: 20000 }); if (!current()) return;
      const x = registryResult(data, actor, company, trial); setRegistry(x); onSummary(x); setEntries(initialEntries(x));
      setReference(x.declaration?.sourceReference || ''); setSourceDate(x.declaration?.sourceDate || ''); setNote(x.declaration?.sourceNote || '');
    }, generation);
  }
  function change(index, patch) { setEntries(rows => rows.map((row, n) => n === index ? { ...row, ...patch } : row)); setConfirmed(false); }
  async function save(retry = false) {
    if (storageError || (!retry && (!registry || pending || !confirmed))) return;
    const request = retry ? pending : { requestId: crypto.randomUUID(), command: { expectedRevision: registry.declaration?.revision || 0, expectedInventoryVersion: registry.inventoryVersion,
      sourceReference: reference, sourceDate, sourceNote: note, entries } };
    if (!request) return;
    await perform(async current => {
      try { pendingSave(sessionStorage, actor, company, trial, request); } catch { setStorageError('Không lưu được yêu cầu an toàn. Chưa gửi xác nhận.'); return; }
      setPending(request); setReceipt(null);
      try {
        const { data } = await api.post(url, request, { params: { company_id: company }, timeout: 20000 }); if (!current()) return;
        const value = receiptResult(data, request, actor, company, trial);
        pendingClear(sessionStorage, actor, company, trial); setPending(null); setRegistry(null); onSummary(null); setReceipt(value); setConfirmed(false);
        onRefresh?.();
      } catch (e) {
        if (!current()) return;
        if (e.response?.status === 400 || (e.response?.status === 409 && e.response.data?.code === 'SOURCE_CHANGED')) { pendingClear(sessionStorage, actor, company, trial); setPending(null); }
        // A 409 can be a reused request ID with a different prior command. Keep
        // ambiguous requests until their original outcome is accounted for.
        throw e;
      }
    });
  }
  const locked = busy || !!pending || !!storageError;
  return <div className="space-y-3 border-t pt-3">
    <p className="text-sm">Khai báo tất cả nơi nhận khách của từng tài khoản, kể cả tài khoản chưa có khách. Biểu mẫu cũ chưa rõ tài khoản cần ghi lý do để tiếp tục đối soát.</p>
    <button className={button} disabled={busy} onClick={() => load()}>Tải lại danh mục</button>
    {busy && <p role="status">Đang đối chiếu danh mục…</p>}
    {error && <p role="alert" className="text-red-800">{error} Dữ liệu xác nhận cũ đã được ẩn.</p>}
    {storageError && <p role="alert">{storageError}</p>}
    {pending && <div className="rounded bg-amber-50 p-3"><p>Có yêu cầu chưa xác nhận kết quả. Kiểm tra lại sẽ gửi đúng nội dung đã lưu.</p><button className={button} disabled={busy || !!storageError} onClick={() => save(true)}>Kiểm tra lại kết quả lưu</button></div>}
    {receipt && <p role="status">Đã lưu phiên bản {receipt.revision}. Tải lại danh mục để xem tình trạng hiện tại.</p>}
    {registry && <form className="space-y-3" onSubmit={e => { e.preventDefault(); void save(); }}>
      <p>{statuses[registry.status]} · {registry.inventory.trial.since} – {registry.inventory.trial.until}</p>
      {entries.map((row, index) => <fieldset disabled={locked} key={index} className="grid gap-2 rounded border p-3 sm:grid-cols-2">
        <legend>Nguồn {index + 1}</legend>
        <label>Tài khoản<select className={input} value={row.accountId || ''} disabled={row.kind === 'UNRESOLVED_FORM'} onChange={e => change(index, { accountId: e.target.value || null })}><option value="">Chưa xác định</option>{registry.inventory.accounts.map(a => <option key={a.id} value={a.id}>{a.id}</option>)}</select></label>
        <label>Điểm nhận<select className={input} required value={row.kind} onChange={e => { const kind = e.target.value; change(index, { kind, ...(kind === 'UNRESOLVED_FORM' ? { accountId: null } : {}), pageId: ['META_LEAD_ADS', 'MESSENGER', 'UNRESOLVED_FORM'].includes(kind) ? row.pageId || '' : null, formId: ['META_LEAD_ADS', 'UNRESOLVED_FORM'].includes(kind) ? row.formId || '' : null, destination: ['META_LEAD_ADS', 'MESSENGER'].includes(kind) ? null : '' }); }}><option value="">Chọn điểm nhận</option>{Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        {['META_LEAD_ADS', 'MESSENGER', 'UNRESOLVED_FORM'].includes(row.kind) && <label>Mã Page<input className={input} value={row.pageId || ''} required pattern="[0-9]{1,32}" maxLength={32} onChange={e => change(index, { pageId: e.target.value })} /></label>}
        {['META_LEAD_ADS', 'UNRESOLVED_FORM'].includes(row.kind) && <label>Mã biểu mẫu<input className={input} value={row.formId || ''} required pattern="[0-9]{1,32}" maxLength={32} onChange={e => change(index, { formId: e.target.value })} /></label>}
        {!['META_LEAD_ADS', 'MESSENGER', ''].includes(row.kind) && <label>Địa chỉ nhận hoặc lý do<input className={input} value={row.destination || ''} required minLength={row.kind === 'UNRESOLVED_FORM' ? 10 : 3} maxLength={500} onChange={e => change(index, { destination: e.target.value })} /></label>}
        <button type="button" className={button} onClick={() => { setEntries(rows => rows.filter((_, n) => n !== index)); setConfirmed(false); }}>Bỏ dòng</button>
      </fieldset>)}
      <button type="button" className={button} disabled={locked || entries.length >= 300} onClick={() => { setEntries(rows => [...rows, { accountId: registry.inventory.accounts[0]?.id || null, kind: '', pageId: null, formId: null, destination: '' }]); setConfirmed(false); }}>Thêm điểm nhận</button>
      <label className="block">Tài liệu hoặc hồ sơ đối chiếu<input className={input} value={reference} disabled={locked} required minLength={8} maxLength={500} onChange={e => { setReference(e.target.value); setConfirmed(false); }} /></label>
      <label className="block">Ngày của hồ sơ<input type="date" className={input} value={sourceDate} disabled={locked} required onChange={e => { setSourceDate(e.target.value); setConfirmed(false); }} /></label>
      <label className="block">Căn cứ xác nhận và điểm chưa rõ<textarea className={input} value={note} disabled={locked} required minLength={20} maxLength={2000} onChange={e => { setNote(e.target.value); setConfirmed(false); }} /></label>
      <label className="flex gap-2"><input type="checkbox" checked={confirmed} disabled={locked} onChange={e => setConfirmed(e.target.checked)} />Tôi xác nhận đây là phạm vi cần đo theo hồ sơ trên. Các điểm chưa rõ đã được ghi lại; xác nhận này không chứng minh đã nhận đủ khách từ nền tảng.</label>
      <button className={`${button} bg-blue-700 text-white`} disabled={locked || !confirmed || !entries.length}>Lưu danh mục nguồn</button>
    </form>}
  </div>;
}
