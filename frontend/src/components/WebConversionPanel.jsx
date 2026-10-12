import { useEffect, useState } from 'react';
import api from '../lib/api';
import { PROVIDERS, formatVnd, vietnamRange, parseSpendCsv } from '../lib/webConversions';

const ROOT = '/marketing-web';

/** W4: website conversions (form, call, Zalo, Messenger) and cost by channel. Admin only; hidden otherwise. */
export default function WebConversionPanel() {
  const [days, setDays] = useState(7);
  const [companyId, setCompanyId] = useState(undefined);
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

  // A system admin has no own company: use the company of the latest P1 trial (VPT).
  useEffect(() => {
    let alive = true;
    api.get('/marketing-p1/qualification/trials')
      .then(({ data }) => { if (alive) setCompanyId(data?.trials?.[0]?.company_id || null); })
      .catch(() => { if (alive) setCompanyId(null); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (companyId === undefined) return;
    let alive = true;
    const params = { ...vietnamRange(days), ...(companyId ? { company_id: companyId } : {}) };
    setError('');
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
    setOfflineError('');
    api.get(`${ROOT}/offline-conversions`, { params })
      .then(({ data }) => { if (alive) setOffline(data); })
      .catch(err => { if (alive) setOfflineError(err.response?.data?.error || 'Chưa tải được dữ liệu'); });
    return () => { alive = false; };
  }, [companyId, version]);

  const parsed = csv.trim() ? parseSpendCsv(csv, provider) : null;

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
                <th className={cell}>Điền form</th><th className={cell}>Hợp lệ</th>
                <th className={cell}>Bấm gọi</th><th className={cell}>Bấm Zalo</th><th className={cell}>Bấm Messenger</th>
                <th className={cell}>Tổng chuyển đổi</th><th className={cell}>Chi tiêu</th>
                <th className={cell}>CP / chuyển đổi</th><th className={cell}>CP / khách hợp lệ</th>
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
            {report.from} → {report.to}. Hợp lệ = khách đã kéo sang lạnh/ấm/nóng hoặc chuyển deal.
            Lượt bấm tính 1 lần mỗi lượt truy cập, không biết khách là ai.
            Chi tiêu Facebook chỉ gồm quảng cáo có khách vào web; Google và ChatGPT lấy từ chi tiêu đã nhập.
          </p>
        </div>
      )}
      <div className="mt-3 border-t pt-3 text-xs">
        <h4 className="font-semibold text-gray-800">Gửi chuyển đổi về Google Ads (60 ngày gần nhất)</h4>
        {offlineError && <p className="mt-1 text-red-600">{offlineError}</p>}
        {!offline && !offlineError && <p className="mt-1 text-gray-500">Đang tải…</p>}
        {offline && (
          <div className="mt-1 space-y-1 text-gray-700">
            <p>
              Cuộc gọi thật ghép được quảng cáo: <b className="tabular-nums">{offline.counts.calls}</b>
              {' · '}Khách hợp lệ có gclid: <b className="tabular-nums">{offline.counts.valid_leads}</b>
            </p>
            <p className="text-gray-500">
              Ghi âm từ 30 giây đã xét {offline.diagnostics.recordings_considered}
              {' · '}không ghép được lượt bấm gọi {offline.diagnostics.recordings_without_click}
              {' · '}lượt bấm gọi có gclid {offline.diagnostics.call_clicks_with_gclid} (chưa ghép {offline.diagnostics.call_clicks_unmatched})
              {' · '}chỉ có gbraid/wbraid {offline.diagnostics.call_clicks_braid_only + offline.diagnostics.valid_leads_braid_only}
              {' · '}khách hợp lệ (form web) không có gclid {offline.diagnostics.valid_leads_without_gclid}
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
                          <td className="px-2 py-1">{r.type === 'CALL' ? 'Cuộc gọi thật' : 'Khách hợp lệ'}</td>
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
      <div className="mt-3 border-t pt-3">
        <button type="button" onClick={() => setOpenSpend(o => !o)} className="cursor-pointer text-xs font-medium text-sky-700 hover:underline">
          {openSpend ? '▾' : '▸'} Nhập chi tiêu Google Ads / ChatGPT Ads
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
