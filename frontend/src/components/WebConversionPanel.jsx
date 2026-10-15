import { useEffect, useState } from 'react';
import api from '../lib/api';
import { PROVIDERS, formatVnd, vietnamRange, parseSpendCsv } from '../lib/webConversions';
import WebsiteFeedbackPanel from './WebsiteFeedbackPanel';

const ROOT = '/marketing-web';
const VPT_COMPANY = '991dc79d-cbf5-49f9-a364-35227cb47635';

/** W4: website conversions (form, call, Zalo, Messenger) and cost by channel. Admin only; hidden otherwise. */
export default function WebConversionPanel() {
  const [days, setDays] = useState(7);
  const companyId = VPT_COMPANY;
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState(false);
  const [version, setVersion] = useState(0);
  const [openSpend, setOpenSpend] = useState(false);
  const [provider, setProvider] = useState('GOOGLE');
  const [csv, setCsv] = useState('');
  const [spendMsg, setSpendMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [offline, setOffline] = useState(null);
  const [offlineError, setOfflineError] = useState('');
  const [qualified, setQualified] = useState(null), [qualifiedError, setQualifiedError] = useState('');

  useEffect(() => {
    if (companyId === undefined) return;
    let alive = true;
    const params = { ...vietnamRange(days), ...(companyId ? { company_id: companyId } : {}) };
    setReport(null); setError('');
    api.get(`${ROOT}/summary`, { params })
      .then(({ data }) => { if (alive) setReport(data); })
      .catch(err => {
        if (!alive) return;
        if (err.response?.status === 403 || err.response?.status === 404) setHidden(true);
        else setError(err.response?.data?.error || 'Chưa tải được dữ liệu');
      });
    return () => { alive = false; };
  }, [days, companyId, version]);

  // Google Ads offline conversions (same 60-day window as the scheduled upload).
  useEffect(() => {
    if (companyId === undefined) return;
    let alive = true;
    const params = { ...vietnamRange(60), ...(companyId ? { company_id: companyId } : {}) };
    setOffline(null); setOfflineError('');
    api.get(`${ROOT}/offline-conversions`, { params })
      .then(({ data }) => { if (alive) setOffline(data); })
      .catch(err => { if (alive) setOfflineError(err.response?.data?.error || 'Chưa tải được dữ liệu'); });
    return () => { alive = false; };
  }, [companyId, version]);

  const parsed = csv.trim() ? parseSpendCsv(csv, provider) : null;

  useEffect(() => {
    if (companyId === undefined) return;
    let alive = true;
    setQualified(null); setQualifiedError('');
    const params = { ...vietnamRange(60), ...(companyId ? { company_id: companyId } : {}) };
    api.get(`${ROOT}/qualified-offline-conversions`, { params })
      .then(({ data }) => { if (alive) setQualified(data); })
      .catch(err => { if (alive) setQualifiedError(err.response?.data?.error || 'Chưa tải được dữ liệu xác minh'); });
    return () => { alive = false; };
  }, [companyId, version]);

  async function saveSpend() {
    if (!parsed?.rows.length || saving) return;
    setSaving(true); setSpendMsg('');
    try {
      const { data } = await api.put(`${ROOT}/spend`, { nguon: 'csv', rows: parsed.rows },
        { params: companyId ? { company_id: companyId } : {} });
      setSpendMsg(`Đã lưu ${data.saved} dòng chi tiêu.`); setCsv(''); setVersion(v => v + 1);
    } catch (err) {
      setSpendMsg(err.response?.data?.error || 'Chưa lưu được, vui lòng thử lại');
    } finally { setSaving(false); }
  }

  if (hidden) return null;
  const cell = 'px-2 py-1.5 text-right tabular-nums';
  return (
    <section className="mt-4 rounded-xl border border-sky-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">Chuyển đổi website (vanphuthanh.net)</h3>
        <div className="flex gap-1 text-xs">
          {[7, 30].map(d => (
            <button key={d} type="button" onClick={() => setDays(d)}
              className={`rounded-md px-2 py-1 cursor-pointer ${days === d ? 'bg-sky-100 text-sky-800' : 'text-gray-500 hover:bg-gray-100'}`}>
              {d} ngày
            </button>
          ))}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {!report && !error && <p className="mt-2 text-xs text-gray-500">Đang tải…</p>}
      {report && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="text-gray-500">
              <tr className="border-b">
                <th className="px-2 py-1.5 text-left font-medium">Kênh</th>
                <th className={cell}>Điền form</th><th className={cell}>Có mốc bán hàng</th>
                <th className={cell}>Bấm gọi</th><th className={cell}>Bấm Zalo</th><th className={cell}>Bấm Messenger</th>
                <th className={cell}>Tổng chuyển đổi</th><th className={cell}>Chi tiêu</th>
                <th className={cell}>CP / chuyển đổi</th><th className={cell}>CP / mốc bán hàng</th>
              </tr>
            </thead>
            <tbody>
              {report.channels.map(c => (
                <tr key={c.key} className="border-b last:border-0">
                  <td className="px-2 py-1.5 text-gray-800">{c.label}</td>
                  <td className={cell}>{c.form_leads}</td><td className={cell}>{c.valid_leads}</td>
                  <td className={cell}>{c.calls}</td><td className={cell}>{c.zalo}</td><td className={cell}>{c.messenger}</td>
                  <td className={`${cell} font-semibold`}>{c.conversions}</td>
                  <td className={cell}>{c.spend_vnd === null ? 'chưa có' : formatVnd(c.spend_vnd)}</td>
                  <td className={cell}>{formatVnd(c.cost_per_conversion_vnd)}</td>
                  <td className={cell}>{formatVnd(c.cost_per_valid_vnd)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-semibold">
                <td className="px-2 py-1.5">Tổng</td>
                <td className={cell}>{report.totals.form_leads}</td><td className={cell}>{report.totals.valid_leads}</td>
                <td className={cell}>{report.totals.calls}</td><td className={cell}>{report.totals.zalo}</td>
                <td className={cell}>{report.totals.messenger}</td><td className={cell}>{report.totals.conversions}</td>
                <td className={cell}>{formatVnd(report.totals.spend_vnd)}</td><td className={cell} /><td className={cell} />
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-gray-500">
            {report.from} → {report.to}. Mốc bán hàng = khách đã kéo sang lạnh/ấm/nóng hoặc chuyển deal; chưa chứng minh khách hợp lệ đã xác minh.
            Lượt bấm tính 1 lần mỗi lượt truy cập, không biết khách là ai.
            Chi tiêu Facebook chỉ gồm quảng cáo có khách vào web; Google, TikTok, Zalo Ads và ChatGPT lấy từ chi tiêu đã nhập.
          </p>
        </div>
      )}
      <div className="mt-3 border-t pt-3 text-xs">
        <h4 className="font-semibold text-gray-800">Nguồn Google Ads cũ: cuộc gọi và mốc bán hàng (60 ngày)</h4>
        <p className="mt-1 text-gray-500">Nguồn này dùng tín hiệu bán hàng trước đây; chưa phải kết quả xác minh chất lượng khách.</p>
        {offlineError && <p className="mt-1 text-red-600">{offlineError}</p>}
        {!offline && !offlineError && <p className="mt-1 text-gray-500">Đang tải…</p>}
        {offline && (
          <div className="mt-1 space-y-1 text-gray-700">
            <p>
              Cuộc gọi thật ghép được quảng cáo: <b className="tabular-nums">{offline.counts.calls}</b>
              {' · '}Khách có mốc bán hàng và mã nhấp: <b className="tabular-nums">{offline.counts.valid_leads}</b>
            </p>
            <p className="text-gray-500">
              Ghi âm đã xét {offline.diagnostics.recordings_considered}
              {' · '}không ghép được lượt bấm gọi {offline.diagnostics.recordings_without_click}
              {' · '}thiếu giờ gọi (bỏ qua) {offline.diagnostics.recordings_no_call_time ?? 0}
              {' · '}upload trùng {offline.diagnostics.recordings_duplicates_merged ?? 0}
              {' · '}lượt bấm gọi có gclid {offline.diagnostics.call_clicks_with_gclid} (chưa ghép {offline.diagnostics.call_clicks_unmatched})
              {' · '}chỉ có gbraid/wbraid {offline.diagnostics.call_clicks_braid_only + offline.diagnostics.valid_leads_braid_only}
              {' · '}khách có mốc (form web) không có gclid {offline.diagnostics.valid_leads_without_gclid}
              {' · '}chưa đồng ý đo quảng cáo {offline.diagnostics.measurement_consent_required ?? 0}
              {' · '}bỏ qua dữ liệu thử {offline.diagnostics.test_excluded}
            </p>
            {offline.rows.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sky-700">Xem {offline.rows.length} dòng sẽ gửi</summary>
                <div className="overflow-x-auto">
                  <table className="mt-1 w-full min-w-[560px]">
                    <thead className="text-gray-500"><tr className="border-b">
                      <th className="px-2 py-1 text-left font-medium">Loại</th><th className="px-2 py-1 text-left font-medium">Thời điểm</th>
                      <th className="px-2 py-1 text-left font-medium">gclid</th><th className="px-2 py-1 text-left font-medium">Chiến dịch</th>
                      <th className="px-2 py-1 text-left font-medium">Lead</th>
                    </tr></thead>
                    <tbody>
                      {offline.rows.map((r, i) => (
                        <tr key={`${r.type}-${r.recording_id || r.lead_id}-${i}`} className="border-b last:border-0">
                          <td className="px-2 py-1">{r.type === 'CALL' ? 'Cuộc gọi thật' : 'Có mốc bán hàng'}</td>
                          <td className="px-2 py-1 tabular-nums">{r.conversion_time}</td>
                          <td className="px-2 py-1 font-mono">{r.gclid_tail}</td>
                          <td className="px-2 py-1">{r.campaign_id || '—'}</td>
                          <td className="px-2 py-1 font-mono">{r.lead_id ? r.lead_id.slice(0, 8) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        )}
      </div>
      <div className="mt-3 border-t pt-3 text-xs" aria-label="Lead đã xác minh gửi Google Ads">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-semibold">Lead hợp lệ đã xác minh → Google Ads (60 ngày)</h4>
          <button type="button" onClick={() => setVersion(value => value + 1)} className="rounded border px-2 py-1">Tải lại xác minh</button>
        </div>
        {qualifiedError && <p role="alert" className="mt-1 text-red-600">{qualifiedError}</p>}
        {!qualified && !qualifiedError && <p role="status" className="mt-1 text-gray-500">Đang tải…</p>}
        {qualified && <div className="mt-2 space-y-1">
          <p>Đủ điều kiện xuất: <b>{qualified.counts.qualified_leads}</b>. Đây là danh sách CRM chuẩn bị gửi; chưa chứng minh Google đã nhận hoặc quy được quảng cáo.</p>
          <p className="text-gray-600">Loại do khách cũ/trùng trong CRM: {qualified.diagnostics.duplicate_or_returning}
            {' · '}chưa rõ danh tính: {qualified.diagnostics.identity_unknown + qualified.diagnostics.identity_ambiguous}
            {' · '}chưa chứng minh khách mới trong CRM: {qualified.diagnostics.new_customer_unproven}
            {' · '}hồ sơ đổi sau xác minh: {qualified.diagnostics.qualification_stale}
            {' · '}thiếu nguồn website/mã nhấp: {qualified.diagnostics.no_website_source + qualified.diagnostics.no_gclid + qualified.diagnostics.braid_only}
            {' · '}nguồn cần đối soát: {qualified.diagnostics.source_conflict + qualified.diagnostics.source_time_unknown + qualified.diagnostics.invalid_gclid + qualified.diagnostics.qualification_before_source}
            {' · '}dữ liệu thử/khách không còn: {qualified.diagnostics.test_source + qualified.diagnostics.missing_or_test_lead}</p>
          <p className="text-gray-600">Form mới chưa đồng ý đo quảng cáo: {qualified.diagnostics.measurement_consent_required ?? 0}.</p>
          <p className="text-gray-600">Giữ do đã rời Warm/Hot hoặc Deal đang ở cột thua: {qualified.diagnostics.stage_policy_held ?? 0}. Chính sách giai đoạn dùng lần chuyển hợp lệ đầu tiên; các lần Warm → Hot → Deal không cộng thêm khách.</p>
          <p className="text-gray-600">Khử trùng theo thông tin CRM đang có. Lịch sử khách thiếu hoặc chưa nhập vẫn cần đối soát; số này chưa dùng để nghiệm thu CPL khách mới.</p>
          {!!qualified.rows.length && <details><summary className="cursor-pointer text-sky-700">Xem khách đủ điều kiện</summary>
            <ul className="mt-1 space-y-1">{qualified.rows.map(row => <li key={row.lead_id}>
              <a href={`/crm/leads/${row.lead_id}`} target="_blank" rel="noopener noreferrer" className="text-sky-700 underline">Mở khách {row.lead_id.slice(0, 8)}</a>
              {' · '}{row.conversion_time}{' · '}{row.gclid_tail}{' · '}{row.qualification_method === 'stage_based_v1' ? 'Theo giai đoạn CRM' : 'Xác minh thủ công'}
            </li>)}</ul>
          </details>}
        </div>}
      </div>
      <WebsiteFeedbackPanel companyId={companyId} />
      <div className="mt-3 border-t pt-3">
        <button type="button" onClick={() => setOpenSpend(o => !o)} className="cursor-pointer text-xs font-medium text-sky-700 hover:underline">
          {openSpend ? '▾' : '▸'} Nhập chi tiêu Google / TikTok / Zalo / ChatGPT Ads
        </button>
        {openSpend && (
          <div className="mt-2 space-y-2 text-xs">
            <p className="text-gray-600">
              Dán báo cáo xuất từ Google Ads (cột Ngày, Chiến dịch, Chi phí) hoặc gõ mỗi dòng: <code>2026-10-12, Tên chiến dịch, 450000</code>.
              Nhập lại cùng ngày và chiến dịch sẽ ghi đè (có lưu lịch sử).
            </p>
            <select value={provider} onChange={e => setProvider(e.target.value)} className="rounded border px-2 py-1">
              {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={5}
              className="w-full rounded border px-2 py-1 font-mono" placeholder="Ngày,Chiến dịch,Chi phí" />
            {parsed && (
              <p className={parsed.errors.length ? 'text-amber-700' : 'text-gray-600'}>
                Đọc được {parsed.rows.length} dòng, tổng {formatVnd(parsed.rows.reduce((s, r) => s + r.chi_tieu_vnd, 0))}
                {parsed.errors.length > 0 && ` · ${parsed.errors.slice(0, 3).join('; ')}`}
              </p>
            )}
            <button type="button" disabled={!parsed?.rows.length || saving} onClick={saveSpend}
              className="cursor-pointer rounded bg-sky-600 px-3 py-1 text-white disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? 'Đang lưu…' : 'Lưu chi tiêu'}
            </button>
            {spendMsg && <p className="text-gray-700">{spendMsg}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
