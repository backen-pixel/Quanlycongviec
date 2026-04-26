import { useEffect, useMemo, useState, Fragment } from 'react';
import { Activity, MessageCircle, Phone, Users, AlertTriangle, Clock, ChevronDown, ChevronUp, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// AUTO PIPELINE MONITOR — Realtime KPI + Per-batch Results
// ═══════════════════════════════════════════════════════════════

function formatDuration(startedAt) {
  if (!startedAt) return '--';
  const ms = Date.now() - new Date(startedAt).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}p ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}p`;
}

function formatCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}p ${String(r).padStart(2, '0')}s`;
}

function StatusIcon({ status }) {
  if (status === 'done') return <CheckCircle2 size={13} className="text-green-500 shrink-0" />;
  if (status === 'error') return <XCircle size={13} className="text-red-500 shrink-0" />;
  if (status === 'synced') return <Loader2 size={13} className="text-blue-500 animate-spin shrink-0" />;
  return <Loader2 size={13} className="text-gray-400 animate-spin shrink-0" />;
}

function isSyncStyleScanDetail(row) {
  return row && typeof row === 'object' && ('sync_status' in row || 'synced' in row);
}

function BatchScanDetails({ batch }) {
  const rows = batch.scan_details;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const syncCols = isSyncStyleScanDetail(rows[0]);

  return (
    <details className="group text-[11px]">
      <summary className="cursor-pointer select-none text-violet-700 font-medium hover:text-violet-900 list-none flex items-center gap-1 [&::-webkit-details-marker]:hidden">
        <ChevronDown size={12} className="shrink-0 transition group-open:rotate-180" />
        Chi tiết quét ({rows.length} contact)
      </summary>
      <div className="mt-1.5 max-h-52 overflow-auto rounded border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-[10px]">
          <thead className="bg-gray-100 sticky top-0 text-gray-600">
            <tr>
              <th className="text-left px-2 py-1 font-semibold">Tên / ID</th>
              {syncCols ? (
                <>
                  <th className="text-right px-2 py-1 font-semibold">+Tin</th>
                  <th className="text-left px-2 py-1 font-semibold">Sync</th>
                </>
              ) : null}
              <th className="text-left px-2 py-1 font-semibold">Quét</th>
              <th className="text-left px-2 py-1 font-semibold">SĐT</th>
              {!syncCols ? <th className="text-left px-2 py-1 font-semibold">Địa chỉ</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, j) => (
              <tr key={j} className="border-t border-gray-100 odd:bg-white even:bg-gray-50/80">
                <td className="px-2 py-1 text-gray-800 max-w-[140px] truncate" title={r.name || r.contact_id}>
                  {r.name || '—'}
                  {r.contact_id ? <span className="text-gray-400 font-mono ml-0.5">#{String(r.contact_id).slice(0, 8)}</span> : null}
                </td>
                {syncCols ? (
                  <>
                    <td className="px-2 py-1 text-right font-mono text-blue-700">{r.synced ?? '—'}</td>
                    <td className="px-2 py-1 font-mono text-gray-600">{r.sync_status ?? '—'}</td>
                  </>
                ) : null}
                <td className="px-2 py-1 font-mono text-gray-700">
                  {r.extract ?? r.status ?? '—'}
                  {r.extraPhones?.length ? (
                    <span className="text-gray-500 block truncate max-w-[200px]" title={r.extraPhones.join(', ')}>
                      +{r.extraPhones.length} SĐT phụ
                    </span>
                  ) : null}
                </td>
                <td className="px-2 py-1 font-mono text-green-800">{r.phone || '—'}</td>
                {!syncCols ? (
                  <td className="px-2 py-1 text-gray-600 max-w-[100px] truncate" title={r.address}>{r.address || '—'}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function FullCyclePostSteps({ post }) {
  if (!post || typeof post !== 'object') return null;
  const leadDetails = Array.isArray(post?.create_leads?.details_sample) ? post.create_leads.details_sample : [];
  return (
    <div className="mt-2 text-[10px] text-gray-700 space-y-1 border-t border-gray-200 pt-2">
      <div className="font-semibold text-sky-800">Sau đồng bộ + quét lô (mỗi vòng)</div>
      {post.create_leads && (
        <div className="space-y-1">
          <div>
            Tạo lead: <span className="font-mono text-green-700">{post.create_leads.created ?? 0}</span> mới, bỏ qua{' '}
            <span className="font-mono">{post.create_leads.skipped ?? 0}</span>
          </div>
          {leadDetails.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer select-none text-violet-700 font-medium hover:text-violet-900 list-none flex items-center gap-1 [&::-webkit-details-marker]:hidden">
                <ChevronDown size={12} className="shrink-0 transition group-open:rotate-180" />
                Chi tiết tạo lead ({leadDetails.length})
              </summary>
              <div className="mt-1.5 max-h-44 overflow-auto rounded border border-gray-200 bg-white shadow-sm">
                <table className="w-full text-[10px]">
                  <thead className="bg-gray-100 sticky top-0 text-gray-600">
                    <tr>
                      <th className="text-left px-2 py-1 font-semibold">Tên / ID</th>
                      <th className="text-left px-2 py-1 font-semibold">Trạng thái</th>
                      <th className="text-left px-2 py-1 font-semibold">SĐT</th>
                      <th className="text-left px-2 py-1 font-semibold">Lead</th>
                      <th className="text-left px-2 py-1 font-semibold">Lý do</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leadDetails.map((r, j) => (
                      <tr key={j} className="border-t border-gray-100 odd:bg-white even:bg-gray-50/80">
                        <td className="px-2 py-1 text-gray-800 max-w-[140px] truncate" title={r.contact || r.name || r.contact_id}>
                          {r.contact || r.name || '—'}
                          {(r.contact_id || r.id) ? <span className="text-gray-400 font-mono ml-0.5">#{String(r.contact_id || r.id).slice(0, 8)}</span> : null}
                        </td>
                        <td className="px-2 py-1 font-mono text-gray-700">{r.status || '—'}</td>
                        <td className="px-2 py-1 font-mono text-green-800">{r.phone || '—'}</td>
                        <td className="px-2 py-1 font-mono text-blue-800">{r.lead_code || r.code || '—'}</td>
                        <td className="px-2 py-1 text-gray-600 max-w-[160px] truncate" title={r.reason || r.error}>{r.reason || r.error || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}
      {post.refresh_names && (
        <div>
          Refresh tên: <span className="font-mono">{post.refresh_names.updated ?? 0}</span> /{' '}
          <span className="font-mono">{post.refresh_names.total ?? 0}</span>
        </div>
      )}
      {post.dedup && (
        <div>
          Xóa lead trùng: <span className="font-mono text-amber-800">{post.dedup.merged ?? 0}</span> lead
          {post.dedup.message ? <span className="text-gray-500 ml-1">({post.dedup.message})</span> : null}
        </div>
      )}
      {post.sync_phones && (
        <div>
          Sync SĐT danh bạ → Lead: <span className="font-mono text-sky-800">{post.sync_phones.updated ?? 0}</span> /{' '}
          <span className="font-mono">{post.sync_phones.total ?? 0}</span>
        </div>
      )}
    </div>
  );
}

export default function AutoPipelineMonitor({ auto }) {
  const [showTable, setShowTable] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const { kpi, batchResults, startedAt, running, cycleCount, totalContacts, batchIndex, totalBatches } = auto;
  const pauseRemainingMs = useMemo(() => {
    if (!auto) return 0;
    if (typeof auto.pauseRemainingMs === 'number') return auto.pauseRemainingMs;
    if (typeof auto.pauseUntilMs === 'number') return Math.max(0, auto.pauseUntilMs - nowMs);
    return 0;
  }, [auto, nowMs]);

  if (!running && (!batchResults || batchResults.length === 0)) return null;

  const totalPhones = (kpi?.contactPhones || 0) + (kpi?.customerPhones || 0) + (kpi?.leadPhones || 0);

  return (
    <div className="space-y-3">
      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <KPICard
          icon={<MessageCircle size={16} />}
          label="Tin nhắn sync"
          value={kpi?.messagesSynced || 0}
          color="blue"
        />
        <KPICard
          icon={<Users size={16} />}
          label="Contacts xử lý"
          value={kpi?.contactsProcessed || 0}
          color="teal"
        />
        <KPICard
          icon={<Phone size={16} />}
          label="SĐT tìm được"
          value={totalPhones}
          color="green"
          sub={totalPhones > 0 ? `C:${kpi?.contactPhones || 0} KH:${kpi?.customerPhones || 0} L:${kpi?.leadPhones || 0}` : null}
        />
        <KPICard
          icon={<AlertTriangle size={16} />}
          label="Lỗi"
          value={kpi?.errors || 0}
          color={kpi?.errors > 0 ? 'red' : 'gray'}
        />
        <KPICard
          icon={<Clock size={16} />}
          label="Thời gian"
          value={formatDuration(startedAt)}
          color="amber"
          sub={
            pauseRemainingMs > 0
              ? `⏳ Nghỉ còn ${formatCountdown(pauseRemainingMs)} • Chu kỳ ${cycleCount}`
              : running
                ? `Chu kỳ ${cycleCount}`
                : 'Đã dừng'
          }
        />
      </div>

      {/* ── Progress summary ── */}
      {running && totalBatches > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-gray-200 rounded-full h-2.5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-blue-500 to-teal-500"
              style={{ width: `${Math.min(100, Math.round((batchIndex / totalBatches) * 100))}%` }}
            />
          </div>
          <span className="text-xs font-mono text-gray-500 shrink-0">
            {batchIndex}/{totalBatches} ({Math.round((batchIndex / totalBatches) * 100)}%)
          </span>
        </div>
      )}

      {/* ── Per-Batch Table Toggle ── */}
      {batchResults && batchResults.length > 0 && (
        <div>
          <button
            onClick={() => setShowTable(!showTable)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 font-medium cursor-pointer transition"
          >
            <Activity size={13} />
            Chi tiết {batchResults.length} batch
            {showTable ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {showTable && (
            <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-gray-600">Batch</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-600">Contacts</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-600">Tin nhắn</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-600">📞 Contact</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-600">📞 KH</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-600">📞 Lead</th>
                      <th className="text-center px-3 py-2 font-semibold text-gray-600">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...batchResults].reverse().map((b, i) => {
                      const hasDetails = Array.isArray(b.scan_details) && b.scan_details.length > 0;
                      const hasPost = b.post_steps && typeof b.post_steps === 'object';
                      const showExpand = hasDetails || hasPost;
                      return (
                        <Fragment key={`${b.ts}-${b.batch}-${b.mode || 'legacy'}-${i}`}>
                          <tr className={`border-t border-gray-100 ${b.status === 'error' ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/50 transition`}>
                            <td className="px-3 py-2 font-mono font-medium text-gray-700">
                              {b.mode === 'full_cycle_summary' ? (
                                <span className="text-sky-700 font-medium">Tổng vòng</span>
                              ) : b.batch === 'full' ? (
                                <span className="text-amber-600">Full scan</span>
                              ) : (
                                <span className="inline-flex items-center gap-1">
                                  #{b.batch}
                                  {b.mode === 'chain' && (
                                    <span className="text-[9px] font-normal px-1 py-0 rounded bg-violet-100 text-violet-700">chain</span>
                                  )}
                                  {(b.mode === 'full_cycle_sync' || b.mode === 'manual_batch') && (
                                    <span className="text-[9px] font-normal px-1 py-0 rounded bg-emerald-100 text-emerald-800">
                                      {b.mode === 'manual_batch' ? 'lô' : 'sync'}
                                    </span>
                                  )}
                                  {b.mode === 'full_cycle_summary' && (
                                    <span className="text-[9px] font-normal px-1 py-0 rounded bg-sky-100 text-sky-800">full</span>
                                  )}
                                </span>
                              )}
                              <span className="text-gray-400 ml-1 text-[10px]">CK{b.cycle}</span>
                              {showExpand ? (
                                <span className="block text-[9px] font-normal text-violet-600 mt-0.5">Mở rộng bên dưới</span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-teal-700">{b.contactsProcessed || 0}</td>
                            <td className="px-3 py-2 text-right font-mono text-blue-700">+{b.messagesSynced || 0}</td>
                            <td className="px-3 py-2 text-right font-mono">{b.contactPhones > 0 ? <span className="text-green-600 font-semibold">+{b.contactPhones}</span> : <span className="text-gray-300">0</span>}</td>
                            <td className="px-3 py-2 text-right font-mono">{b.customerPhones > 0 ? <span className="text-green-600 font-semibold">+{b.customerPhones}</span> : <span className="text-gray-300">0</span>}</td>
                            <td className="px-3 py-2 text-right font-mono">{b.leadPhones > 0 ? <span className="text-green-700 font-bold">+{b.leadPhones}</span> : <span className="text-gray-300">0</span>}</td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <StatusIcon status={b.status} />
                                {b.status === 'error' && (
                                  <span className="text-red-500 text-[10px] truncate max-w-[80px]" title={b.error}>{b.error}</span>
                                )}
                              </div>
                            </td>
                          </tr>
                          {showExpand ? (
                            <tr className={`${b.status === 'error' ? 'bg-red-50/80' : 'bg-slate-50/90'} border-t border-gray-100`}>
                              <td colSpan={7} className="px-3 py-2 align-top">
                                <BatchScanDetails batch={b} />
                                <FullCyclePostSteps post={b.post_steps} />
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  {/* Footer: totals */}
                  <tfoot className="bg-gray-100 border-t-2 border-gray-300 sticky bottom-0">
                    <tr className="font-semibold text-gray-700">
                      <td className="px-3 py-2">Tổng ({batchResults.length})</td>
                      <td className="px-3 py-2 text-right font-mono text-teal-700">{kpi?.contactsProcessed || 0}</td>
                      <td className="px-3 py-2 text-right font-mono text-blue-700">+{kpi?.messagesSynced || 0}</td>
                      <td className="px-3 py-2 text-right font-mono text-green-600">{kpi?.contactPhones || 0}</td>
                      <td className="px-3 py-2 text-right font-mono text-green-600">{kpi?.customerPhones || 0}</td>
                      <td className="px-3 py-2 text-right font-mono text-green-700">{kpi?.leadPhones || 0}</td>
                      <td className="px-3 py-2 text-center">
                        {kpi?.errors > 0 ? (
                          <span className="text-red-500 text-[10px]">{kpi.errors} lỗi</span>
                        ) : (
                          <CheckCircle2 size={13} className="text-green-500 mx-auto" />
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KPICard({ icon, label, value, color, sub }) {
  const colors = {
    blue:  'from-blue-50 to-blue-100 border-blue-200 text-blue-700',
    teal:  'from-teal-50 to-teal-100 border-teal-200 text-teal-700',
    green: 'from-green-50 to-green-100 border-green-200 text-green-700',
    red:   'from-red-50 to-red-100 border-red-200 text-red-700',
    gray:  'from-gray-50 to-gray-100 border-gray-200 text-gray-500',
    amber: 'from-amber-50 to-amber-100 border-amber-200 text-amber-700',
  };
  const c = colors[color] || colors.gray;

  return (
    <div className={`bg-gradient-to-br ${c} border rounded-xl px-3 py-2.5`}>
      <div className="flex items-center gap-1.5 mb-1 opacity-70">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-lg font-bold leading-tight">{value}</div>
      {sub && <div className="text-[10px] mt-0.5 opacity-60">{sub}</div>}
    </div>
  );
}
