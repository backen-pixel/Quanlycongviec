import { useState, useCallback, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

const API = import.meta.env.VITE_API_URL || '';
const hdr = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json',
});

const EXEC_CHUNK = 80;
const MAX_CONTACTS_LINK_CLEANUP_CAP = 5000;
const DEFAULT_MAX_CONTACTS_LINK_CLEANUP = 500;

function clampMaxContactsInput(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 1) return DEFAULT_MAX_CONTACTS_LINK_CLEANUP;
  return Math.min(MAX_CONTACTS_LINK_CLEANUP_CAP, Math.floor(x));
}

function toDayBoundsISO(dateStr) {
  if (!dateStr) return { from: '', to: '' };
  const from = new Date(`${dateStr}T00:00:00`);
  const to = new Date(`${dateStr}T23:59:59.999`);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function FacebookLinkPhoneCleanupPage() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [companyId, setCompanyId] = useState('');
  const [maxContacts, setMaxContacts] = useState(DEFAULT_MAX_CONTACTS_LINK_CLEANUP);
  const [companies, setCompanies] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [lastPayload, setLastPayload] = useState(null);
  const [executeLog, setExecuteLog] = useState(null);
  const [error, setError] = useState('');
  const [scanProgress, setScanProgress] = useState(null);
  const [execProgress, setExecProgress] = useState(null);

  const loadCompanies = useCallback(() => {
    api
      .get('/companies?for_module=crm')
      .then((r) => {
        const list = r.data?.companies || r.data || [];
        setCompanies(Array.isArray(list) ? list : []);
      })
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  const runPreview = async ({ afterExecute = false } = {}) => {
    setError('');
    if (!afterExecute) setExecuteLog(null);
    if (!dateFrom || !dateTo) {
      setError('Chọn đủ từ ngày và đến ngày');
      return;
    }
    const d1 = toDayBoundsISO(dateFrom);
    const d2 = toDayBoundsISO(dateTo);
    const from = d1.from;
    const toTo = d2.to;
    setScanning(true);
    const maxContactsPayload = clampMaxContactsInput(maxContacts);
    setScanProgress({
      percent: 0,
      detail: afterExecute ? 'Làm mới danh sách sau khi xử lý…' : 'Đang kết nối server…',
    });
    try {
      const res = await fetch(`${API}/api/facebook/tools/link-only-phones/preview`, {
        method: 'POST',
        headers: hdr(),
        body: JSON.stringify({
          date_from: from,
          date_to: toTo,
          company_id: companyId || null,
          max_contacts: maxContactsPayload,
          stream: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Quét thất bại');
        setRows([]);
        setMeta(null);
        setSelected(new Set());
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) {
        setError('Trình duyệt không hỗ trợ đọc stream');
        return;
      }
      const dec = new TextDecoder();
      let buf = '';
      let donePayload = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev;
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.type === 'progress') {
            setScanProgress({
              percent: ev.percent ?? 0,
              detail: ev.detail || 'Đang xử lý…',
              stage: ev.stage,
              messagesScanned: ev.messagesScanned,
              totalMessages: ev.totalMessages,
              distinctContacts: ev.distinctContacts,
              contactsSelectedForAnalysis: ev.contactsSelectedForAnalysis,
              maxContactsLimit: ev.maxContactsLimit,
              contactAnalysisCapped: ev.contactAnalysisCapped,
              scanned: ev.scanned,
              totalContacts: ev.totalContacts,
              candidates: ev.candidates,
              previewRowsCapped: ev.previewRowsCapped ?? ev.scanCapHit,
            });
          } else if (ev.type === 'done') {
            donePayload = ev;
          } else if (ev.type === 'error') {
            throw new Error(ev.message || 'Lỗi quét');
          }
        }
      }
      if (!donePayload) throw new Error('Không nhận được kết quả từ server');
      setRows(donePayload.rows || []);
      setMeta(donePayload.meta || null);
      const sel = new Set((donePayload.rows || []).map((r) => r.contact_id));
      setSelected(sel);
      setLastPayload({
        date_from: from,
        date_to: toTo,
        max_contacts: maxContactsPayload,
      });
      setScanProgress((prev) => ({
        ...(prev || {}),
        percent: donePayload.percent ?? 100,
        detail: 'Hoàn tất',
      }));
    } catch (e) {
      setError(e.message || 'Lỗi mạng');
      if (!afterExecute) {
        setRows([]);
        setMeta(null);
        setSelected(new Set());
      }
    } finally {
      setScanning(false);
      setTimeout(() => setScanProgress(null), 1400);
    }
  };

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (on) => {
    if (!on) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.contact_id)));
  };

  const selectedList = useMemo(
    () => rows.filter((r) => selected.has(r.contact_id)),
    [rows, selected],
  );

  const runExecute = async () => {
    if (!lastPayload) {
      setError('Hãy quét lại trước khi thực hiện');
      return;
    }
    if (!selectedList.length) {
      setError('Chọn ít nhất một dòng');
      return;
    }
    const msg = `Xóa SĐT trên KH/contact + gỡ dòng SĐT trong mô tả lead (nếu có) và CHẶN tái tạo lead FB cho ${selectedList.length} số?\n\nHành động không hoàn tác tự động.`;
    if (!window.confirm(msg)) return;

    setError('');
    setExecuting(true);
    setExecuteLog(null);
    const items = selectedList.map((r) => ({ contact_id: r.contact_id, phone: r.phone }));
    const chunks = [];
    for (let i = 0; i < items.length; i += EXEC_CHUNK) {
      chunks.push(items.slice(i, i + EXEC_CHUNK));
    }
    const allResults = [];
    const total = items.length;
    setExecProgress({
      percent: 0,
      detail: `Chuẩn bị ${total} dòng (${chunks.length} lô)…`,
      chunk: 0,
      totalChunks: chunks.length,
      processed: 0,
      total,
    });
    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        setExecProgress({
          percent: Math.round((i / Math.max(1, chunks.length)) * 100),
          detail: `Đang xử lý lô ${i + 1}/${chunks.length} (${chunk.length} dòng) — gọi API…`,
          chunk: i + 1,
          totalChunks: chunks.length,
          processed: allResults.length,
          total,
        });
        const res = await fetch(`${API}/api/facebook/tools/link-only-phones/execute`, {
          method: 'POST',
          headers: hdr(),
          body: JSON.stringify({
            items: chunk,
            ...lastPayload,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || 'Thực hiện lỗi');
          setExecuteLog({ partial: true, results: allResults });
          return;
        }
        allResults.push(...(data.results || []));
        setExecProgress({
          percent: Math.round(((i + 1) / chunks.length) * 100),
          detail: `Đã xong lô ${i + 1}/${chunks.length} — tổng ${allResults.length}/${total} dòng đã gửi`,
          chunk: i + 1,
          totalChunks: chunks.length,
          processed: allResults.length,
          total,
        });
      }
      setExecuteLog({ partial: false, results: allResults });
      setExecProgress({
        percent: 100,
        detail: `Hoàn tất ${allResults.length} phản hồi — đang làm mới danh sách…`,
        chunk: chunks.length,
        totalChunks: chunks.length,
        processed: allResults.length,
        total,
      });
      await runPreview({ afterExecute: true });
    } catch (e) {
      setError(e.message || 'Lỗi mạng');
    } finally {
      setExecuting(false);
      setTimeout(() => setExecProgress(null), 1600);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4 flex-wrap">
          <Link
            to="/crm/facebook?tab=settings"
            className="text-sm text-blue-600 hover:underline"
          >
            ← Facebook · Cài đặt
          </Link>
        </div>

        <div>
          <h1 className="text-xl font-bold text-gray-900">Dọn SĐT nghi từ link (Messenger)</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-3xl">
            Tìm các liên hệ có <strong>ít nhất một tin</strong> (bất kỳ hướng) trong khoảng ngày chọn, đang lưu SĐT
            nhưng trong <strong>đúng khoảng ngày đó</strong> không có tin <strong>inbound</strong> nào (sau khi loại
            URL) chứa đúng số — thường là số chỉ lộ từ link/meta hoặc nhập ngoài khoảng. Xem lại danh sách, bỏ chọn
            dòng cần giữ, rồi xóa SĐT và chặn tái tạo lead FB.
          </p>
        </div>

        <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Từ ngày</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Đến ngày</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Lọc Page theo công ty (tuỳ chọn)</label>
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Tất cả Page</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.short_name || c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Tối đa liên hệ phân tích SĐT (sau khi đã gom đủ user có tin trong khoảng)
              </label>
              <input
                type="number"
                min={1}
                max={MAX_CONTACTS_LINK_CLEANUP_CAP}
                value={maxContacts}
                onChange={(e) => setMaxContacts(parseInt(e.target.value, 10) || 0)}
                onBlur={() => setMaxContacts((v) => clampMaxContactsInput(v))}
                className="w-full border rounded-lg px-3 py-2 text-sm tabular-nums"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Bước gom liên hệ luôn đọc hết tin trong khoảng ngày. Số này chỉ giới hạn bao nhiêu liên hệ được
                đưa vào bước kiểm tra SĐT (ưu tiên liên hệ có tin sớm nhất trong khoảng). Tối đa{' '}
                {MAX_CONTACTS_LINK_CLEANUP_CAP}.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => runPreview()}
              disabled={scanning}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {scanning ? 'Đang quét…' : '1. Quét'}
            </button>
            {meta && !scanning && (
              <span className="text-xs text-gray-500">
                Liên hệ có tin trong khoảng: <strong>{meta.total_distinct_contacts_in_range ?? '—'}</strong> · Phân
                tích SĐT: <strong>{meta.contacts_selected_for_analysis ?? '—'}</strong>
                {meta.max_contacts_limit != null ? (
                  <>
                    {' '}
                    (tối đa <strong>{meta.max_contacts_limit}</strong>)
                  </>
                ) : null}
                {meta.contact_analysis_capped ? ' · (còn liên hệ trong khoảng chưa vào lô phân tích)' : ''} · Ứng
                viên: <strong>{meta.candidates}</strong>
                {meta.preview_rows_capped ? ' · (đã đủ dòng preview)' : ''}
              </span>
            )}
          </div>

          {scanning && scanProgress && (
            <div className="rounded-lg border border-blue-100 bg-blue-50/80 p-3 space-y-2">
              <div className="flex justify-between gap-3 text-xs text-gray-700">
                <span className="font-medium leading-snug">{scanProgress.detail}</span>
                <span className="tabular-nums shrink-0 font-semibold text-blue-800">{scanProgress.percent}%</span>
              </div>
              <div className="h-2.5 bg-blue-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-[width] duration-200 ease-out rounded-full"
                  style={{ width: `${Math.min(100, Math.max(0, scanProgress.percent))}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-600">
                {scanProgress.stage && (
                  <span>
                    Bước:{' '}
                    <strong className="text-gray-800">
                      {scanProgress.stage === 'collect_contacts'
                        ? 'Gom liên hệ'
                        : scanProgress.stage === 'collect_contacts_done'
                          ? 'Đã gom xong'
                          : scanProgress.stage === 'analysis_cohort'
                            ? 'Chọn lô phân tích'
                            : scanProgress.stage === 'scan_contacts'
                              ? 'Phân tích SĐT'
                              : scanProgress.stage}
                    </strong>
                  </span>
                )}
                {scanProgress.messagesScanned != null && (
                  <span>
                    Tin đã đọc:{' '}
                    <strong>
                      {scanProgress.messagesScanned}
                      {scanProgress.totalMessages != null ? ` / ${scanProgress.totalMessages}` : ''}
                    </strong>
                  </span>
                )}
                {scanProgress.distinctContacts != null && scanProgress.stage === 'collect_contacts' && (
                  <span>
                    Liên hệ distinct (đang gom): <strong>{scanProgress.distinctContacts}</strong>
                  </span>
                )}
                {scanProgress.stage === 'analysis_cohort' &&
                  scanProgress.contactsSelectedForAnalysis != null &&
                  scanProgress.distinctContacts != null && (
                    <span>
                      Lô phân tích:{' '}
                      <strong>
                        {scanProgress.contactsSelectedForAnalysis}/{scanProgress.distinctContacts}
                      </strong>{' '}
                      liên hệ
                    </span>
                  )}
                {scanProgress.contactAnalysisCapped ? (
                  <span className="text-amber-700">Chỉ phân tích một phần liên hệ trong khoảng</span>
                ) : null}
                {scanProgress.scanned != null && scanProgress.totalContacts != null && (
                  <span>
                    Liên hệ đã phân tích:{' '}
                    <strong>
                      {scanProgress.scanned}/{scanProgress.totalContacts}
                    </strong>
                  </span>
                )}
                {scanProgress.candidates != null && scanProgress.stage === 'scan_contacts' && (
                  <span>
                    Ứng viên hiện tại: <strong>{scanProgress.candidates}</strong>
                  </span>
                )}
                {scanProgress.previewRowsCapped ? (
                  <span className="text-amber-700">(đã đủ dòng preview)</span>
                ) : null}
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
          )}
        </div>

        {rows.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <h2 className="font-semibold text-amber-900 text-sm mb-2">2. Xem lại trước khi xóa & chặn</h2>
            <p className="text-xs text-amber-800 mb-3">
              Đối chiếu SĐT chỉ với tin <strong>inbound trong khoảng ngày đã chọn</strong>. Bỏ chọn dòng cần giữ; các
              dòng chọn sẽ bị xóa SĐT (KH + contact), gỡ SĐT trong mô tả lead và chặn tái tạo lead FB. Tối đa{' '}
              {EXEC_CHUNK} dòng mỗi lần gọi API — tool tự chia lô.
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                onClick={() => toggleAll(true)}
                className="text-xs px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50"
              >
                Chọn tất cả
              </button>
              <button
                type="button"
                onClick={() => toggleAll(false)}
                className="text-xs px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50"
              >
                Bỏ chọn
              </button>
              <button
                type="button"
                onClick={runExecute}
                disabled={executing || !selectedList.length}
                className="text-xs px-4 py-1.5 rounded-lg bg-amber-700 text-white font-medium hover:bg-amber-800 disabled:opacity-50"
              >
                {executing ? 'Đang xử lý…' : `3. Xóa SĐT + chặn (${selectedList.length})`}
              </button>
            </div>

            {executing && execProgress && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-white p-3 space-y-2">
                <div className="flex justify-between gap-3 text-xs text-gray-800">
                  <span className="font-medium leading-snug">{execProgress.detail}</span>
                  <span className="tabular-nums shrink-0 font-semibold text-amber-900">{execProgress.percent}%</span>
                </div>
                <div className="h-2.5 bg-amber-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-600 transition-[width] duration-200 ease-out rounded-full"
                    style={{ width: `${Math.min(100, Math.max(0, execProgress.percent))}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-600">
                  Lô {execProgress.chunk ?? 0}/{execProgress.totalChunks ?? '—'} · Đã xử lý{' '}
                  <strong>{execProgress.processed ?? 0}</strong>
                  {execProgress.total != null ? ` / ${execProgress.total} dòng chọn` : ''}
                </p>
              </div>
            )}

            <div className="overflow-x-auto border rounded-lg bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100 text-left text-xs text-gray-600">
                  <tr>
                    <th className="p-2 w-10" />
                    <th className="p-2">SĐT lưu</th>
                    <th className="p-2">Facebook</th>
                    <th className="p-2">Lead</th>
                    <th className="p-2 text-center">Inbound trong khoảng</th>
                    <th className="p-2">Gợi ý</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.contact_id} className="border-t border-gray-100 hover:bg-gray-50/80">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selected.has(r.contact_id)}
                          onChange={() => toggle(r.contact_id)}
                          className="cursor-pointer"
                        />
                      </td>
                      <td className="p-2 font-mono text-xs">{r.phone}</td>
                      <td className="p-2">
                        <div className="font-medium text-gray-800">{r.fb_name || '—'}</div>
                        <div className="text-[10px] text-gray-400">contact {r.contact_id?.slice(0, 8)}…</div>
                      </td>
                      <td className="p-2">
                        {r.lead_id ? (
                          <Link
                            className="text-blue-600 hover:underline text-xs"
                            to={`/crm/leads/${r.lead_id}`}
                          >
                            {r.lead_code || r.lead_id.slice(0, 8)}
                          </Link>
                        ) : (
                          '—'
                        )}
                        {r.lead_title && (
                          <div className="text-[10px] text-gray-500 truncate max-w-[200px]">{r.lead_title}</div>
                        )}
                      </td>
                      <td className="p-2 text-xs text-center tabular-nums">
                        {r.inbound_in_range_count ?? '—'}
                      </td>
                      <td className="p-2 text-xs">
                        {r.analyze?.likely_from_link && (
                          <span className="text-amber-700">Nghi từ link · </span>
                        )}
                        {r.analyze?.is_bad && <span className="text-gray-600">Chuỗi bất thường · </span>}
                        <span className="text-gray-400">{r.analyze?.digit_count} chữ số</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {executeLog && (
          <div className="bg-white border rounded-xl p-4 text-sm">
            <h3 className="font-semibold mb-2">Kết quả thực hiện</h3>
            <ul className="text-xs space-y-1 max-h-48 overflow-y-auto font-mono">
              {(executeLog.results || []).map((x, i) => (
                <li key={i}>
                  {x.contact_id?.slice(0, 8)}… {x.ok ? '✓' : '✗'} {x.phone || x.error}
                </li>
              ))}
            </ul>
            {executeLog.partial && <p className="text-amber-700 text-xs mt-2">Dừng giữa chừng do lỗi.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
