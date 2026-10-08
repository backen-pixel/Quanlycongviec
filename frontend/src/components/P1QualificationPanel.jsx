import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import { stateLabel, errorLabel, validateForm, commandBody, createRequestIdentity,
  formatVnd, summaryReasonLabel, summaryCostLabel } from '../lib/p1Qualification';
const ROOT = '/marketing-p1/qualification';
const emptyForm = () => ({ contact_usable: false, need_in_scope: false, area_in_service: false, evidence_ref: '', reason: '' });
export default function P1QualificationPanel({ duongDanLead }) {
  const [enabled, setEnabled] = useState(false), [trials, setTrials] = useState([]);
  const [trialId, setTrialId] = useState(''), [filter, setFilter] = useState('ALL');
  const [rows, setRows] = useState([]), [cursor, setCursor] = useState(null);
  const [more, setMore] = useState(false), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''), [dialog, setDialog] = useState(null);
  const [summary, setSummary] = useState(null), [summaryError, setSummaryError] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false), [summaryVersion, setSummaryVersion] = useState(0);
  const [form, setForm] = useState(emptyForm), identity = useRef(createRequestIdentity());
  const closeButton = useRef(null), opener = useRef(null);
  useEffect(() => {
    if (!enabled || !trialId) { setSummary(null); return; }
    let active = true;
    setSummary(null); setSummaryError(''); setSummaryLoading(true);
    api.get(`${ROOT}/summary`, { params: { trial_id: trialId } })
      .then(({ data }) => { if (active) setSummary(data); })
      .catch(error => { if (active) setSummaryError(errorLabel(error.response?.data?.reason_code)); })
      .finally(() => { if (active) setSummaryLoading(false); });
    return () => { active = false; };
  }, [enabled, trialId, summaryVersion]);
  useEffect(() => {
    let active = true;
    api.get(`${ROOT}/config`).then(() => {
      if (!active) return;
      setEnabled(true);
      return api.get(`${ROOT}/trials`).then(({ data }) => {
        if (!active) return;
        const list = data.trials || []; setTrials(list); setTrialId(list[0]?.id || '');
      });
    }).catch(() => { if (active) setEnabled(false); });
    return () => { active = false; };
  }, []);
  async function load(next = null, append = false) {
    if (!trialId || busy) return;
    setBusy(true);
    try {
      const { data } = await api.get(`${ROOT}/queue`, { params: {
        trial_id: trialId, state: filter, ...(next && { cursor: next }),
      } });
      setRows(old => append ? [...old, ...data.rows] : data.rows);
      setCursor(data.next_cursor); setMore(data.has_more); setMessage('');
    } catch (error) { setMessage(errorLabel(error.response?.data?.reason_code)); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!trialId) return;
    let active = true;
    setRows([]); setCursor(null); setMore(false); setBusy(true);
    api.get(`${ROOT}/queue`, { params: { trial_id: trialId, state: filter } })
      .then(({ data }) => { if (active) {
        setRows(data.rows); setCursor(data.next_cursor); setMore(data.has_more); setMessage('');
      } })
      .catch(error => { if (active) setMessage(errorLabel(error.response?.data?.reason_code)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [trialId, filter]);
  useEffect(() => {
    if (!dialog) return undefined;
    closeButton.current?.focus();
    const onKey = event => { if (event.key === 'Escape') { setDialog(null); opener.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dialog]);
  function open(row, kind, event) {
    opener.current = event.currentTarget; identity.current.reset();
    setForm(emptyForm()); setMessage(''); setDialog({ row, kind });
  }
  function change(key, value) { identity.current.reset(); setForm(old => ({ ...old, [key]: value })); }
  async function submit(event) {
    event.preventDefault();
    const issue = validateForm(dialog.kind, form);
    if (issue) { setMessage(issue); return; }
    setBusy(true);
    const { row, kind } = dialog;
    const body = commandBody(kind, form, row.state.revision, identity.current.current());
    try {
      if (kind === 'revoke') await api.post(`${ROOT}/leads/${row.lead_id}/revoke`, body);
      else await api.put(`${ROOT}/leads/${row.lead_id}`, body);
      identity.current.reset(); setDialog(null); opener.current?.focus();
      setSummaryVersion(value => value + 1);
      // Reload the current filter because the row can move out of it.
      const { data } = await api.get(`${ROOT}/queue`, { params: { trial_id: trialId, state: filter } });
      setRows(data.rows); setCursor(data.next_cursor); setMore(data.has_more); setMessage('Đã lưu trạng thái.');
    } catch (error) {
      const code = error.response?.data?.reason_code;
      if (code === 'REVISION_CONFLICT') {
        identity.current.reset(); setDialog(null); opener.current?.focus();
        try {
          const { data } = await api.get(`${ROOT}/leads/${row.lead_id}`);
          setRows(old => old.map(item => item.lead_id === row.lead_id
            ? { ...item, state: data } : item));
        } catch { /* Keep the conflict message visible. */ }
      }
      setMessage(errorLabel(code));
    } finally { setBusy(false); }
  }
  if (!enabled) return null;
  const counts = rows.reduce((out, row) => {
    out[row.state.status] = (out[row.state.status] || 0) + 1; return out;
  }, {});
  return <section className="rounded-xl border border-gray-200 bg-white p-4" aria-label="Đánh dấu khách hợp lệ">
    <h2 className="text-lg font-semibold">Đánh dấu khách hợp lệ (đợt thử)</h2>
    <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm" aria-label="Tổng hợp đợt thử">
      {summaryLoading && <p role="status">Đang tải tổng hợp đợt thử…</p>}
      {summaryError && <p role="alert">Không tải được tổng hợp: {summaryError}</p>}
      {!trialId && <p>Chưa có đợt thử để tổng hợp.</p>}
      {summary && <>
        <p>Chi tiêu đợt thử: {summary.spend.vnd === null
          ? `Chưa biết — ${(summary.spend.reasons || []).map(summaryReasonLabel).join('; ')}`
          : formatVnd(summary.spend.vnd)}</p>
        <p>Khách ứng viên / Hợp lệ / Chờ / Loại: {summary.leads.candidates} / {summary.leads.qualified} / {summary.leads.pending} / {summary.leads.rejected}</p>
        {summary.leads.excluded_unavailable > 0 && <p>Không còn trong CRM: {summary.leads.excluded_unavailable}</p>}
        <p>{summaryCostLabel(summary.cost_per_qualified_lead)}</p>
        <p>Cập nhật: {new Date(summary.as_of).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>
        <p className="mt-2 font-semibold">Tạm tính, chưa kết luận đạt/không đạt</p>
        <ul className="list-disc pl-5">{(summary.caveats || []).map(code =>
          <li key={code}>{summaryReasonLabel(code)}</li>)}</ul>
      </>}
    </div>
    <div className="my-3 flex flex-wrap gap-2">
      <select aria-label="Đợt thử" value={trialId} onChange={e => setTrialId(e.target.value)} className="rounded border p-2">{trials.map(trial => <option key={trial.id} value={trial.id}>{trial.name}</option>)}</select>
      <select aria-label="Lọc trạng thái" value={filter} onChange={e => setFilter(e.target.value)} className="rounded border p-2">
        {['ALL', 'PENDING', 'QUALIFIED', 'REJECTED'].map(value => <option key={value} value={value}>{value === 'ALL' ? 'Tất cả' : stateLabel(value)}</option>)}
      </select>
    </div>
    {message && <p role="status" className="my-2 text-sm text-rose-700">{message}</p>}
    <p className="text-sm text-gray-600">Trong trang này: Hợp lệ {counts.QUALIFIED || 0} · Chờ {counts.PENDING || 0} · Loại {counts.REJECTED || 0}</p>
    <div className="mt-2 overflow-x-auto"><table className="min-w-[800px] w-full text-left text-sm">
      <thead><tr>{['Mã khách', 'Tiêu đề', 'Chạm lúc', 'Chiến dịch', 'Quảng cáo', 'Trạng thái', 'Thao tác'].map(head => <th key={head} className="border-b p-2">{head}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.lead_id} className="border-b">
        <td className="p-2">{row.code || '—'}</td><td className="p-2">{row.title}</td>
        <td className="p-2">{new Date(row.touched_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</td>
        <td className="p-2">{row.campaign_ref || '—'}</td><td className="p-2">{row.ad_ref || '—'}</td><td className="p-2">{stateLabel(row.state.status)}</td>
        <td className="p-2 whitespace-nowrap">
          <a href={duongDanLead(row.lead_id)} target="_blank" rel="noopener noreferrer" aria-label={`Mở khách ${row.code || ''}`} className="text-blue-700 underline">Mở khách</a>
          {row.state.status !== 'QUALIFIED' && <button type="button" aria-label={`Đánh dấu hợp lệ ${row.code || ''}`} onClick={e => open(row, 'QUALIFIED', e)} className="ml-2 text-emerald-700">Hợp lệ</button>}
          {row.state.status !== 'REJECTED' && <button type="button" aria-label={`Loại khách ${row.code || ''}`} onClick={e => open(row, 'REJECTED', e)} className="ml-2 text-rose-700">Loại</button>}
          {row.state.status !== 'PENDING' && <button type="button" aria-label={`Thu hồi ${row.code || ''}`} onClick={e => open(row, 'revoke', e)} className="ml-2 text-gray-700">Thu hồi</button>}
        </td>
      </tr>)}</tbody></table></div>
    {more && <button type="button" aria-label="Tải thêm khách" disabled={busy} onClick={() => load(cursor, true)} className="mt-3 rounded border px-3 py-2">Tải thêm</button>}
    {dialog && <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form role="dialog" aria-modal="true" aria-label="Xác nhận trạng thái khách" onSubmit={submit} className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
        <button ref={closeButton} type="button" aria-label="Đóng hộp thoại" onClick={() => { setDialog(null); opener.current?.focus(); }} className="float-right">Đóng</button>
        <h3 className="mb-3 font-semibold">{dialog.kind === 'revoke' ? 'Thu hồi' : stateLabel(dialog.kind)} · {dialog.row.code}</h3>
        {message && <p role="alert" className="mb-2 text-sm text-rose-700">{message}</p>}
        {dialog.kind === 'QUALIFIED' ? <>
          {[["contact_usable", 'Liên hệ dùng được'], ['need_in_scope', 'Nhu cầu thuộc sản phẩm'], ['area_in_service', 'Địa chỉ trong vùng phục vụ']].map(([key, label]) =>
            <label key={key} className="block py-1"><input type="checkbox" checked={form[key]} onChange={e => change(key, e.target.checked)} /> {label}</label>)}
          <label className="block py-2">Mã tham chiếu <input className="w-full rounded border p-2" maxLength={200} value={form.evidence_ref} onChange={e => change('evidence_ref', e.target.value)} /></label>
          <p className="text-sm text-amber-800">Không nhập số điện thoại.</p>
        </> : <label className="block py-2">Lý do <textarea className="w-full rounded border p-2" maxLength={500} value={form.reason} onChange={e => change('reason', e.target.value)} /></label>}
        <button type="submit" disabled={busy} aria-label="Lưu trạng thái khách" className="mt-3 rounded bg-blue-700 px-4 py-2 text-white">Lưu</button>
      </form>
    </div>}
  </section>;
}
