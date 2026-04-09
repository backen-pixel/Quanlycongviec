import { useState } from 'react';
import { Activity, MessageCircle, Phone, Users, Building2, AlertTriangle, Clock, ChevronDown, ChevronUp, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

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

function StatusIcon({ status }) {
  if (status === 'done') return <CheckCircle2 size={13} className="text-green-500 shrink-0" />;
  if (status === 'error') return <XCircle size={13} className="text-red-500 shrink-0" />;
  if (status === 'synced') return <Loader2 size={13} className="text-blue-500 animate-spin shrink-0" />;
  return <Loader2 size={13} className="text-gray-400 animate-spin shrink-0" />;
}

export default function AutoPipelineMonitor({ auto }) {
  const [showTable, setShowTable] = useState(false);

  const { kpi, batchResults, startedAt, running, cycleCount, totalContacts, batchIndex, totalBatches } = auto;

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
          sub={running ? `Chu kỳ ${cycleCount}` : 'Đã dừng'}
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
                    {[...batchResults].reverse().map((b, i) => (
                      <tr key={i} className={`border-t border-gray-100 ${b.status === 'error' ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/50 transition`}>
                        <td className="px-3 py-2 font-mono font-medium text-gray-700">
                          {b.batch === 'full' ? (
                            <span className="text-amber-600">Full scan</span>
                          ) : (
                            <span>#{b.batch}</span>
                          )}
                          <span className="text-gray-400 ml-1 text-[10px]">CK{b.cycle}</span>
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
                    ))}
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
