import { useState } from 'react';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import { Search, Merge, CheckCircle2, AlertTriangle, Loader2, X, Users, Facebook, ChevronDown, ChevronRight, Radio } from 'lucide-react';

export default function LeadDuplicateScanner({ onClose, onMerged }) {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null); // { groups, total_groups, total_duplicates }
  const [error, setError] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});
  const [selectedKeep, setSelectedKeep] = useState({}); // { groupIdx: leadId }
  const [merging, setMerging] = useState(null); // groupIdx being merged
  const [mergeResults, setMergeResults] = useState({}); // { groupIdx: result }

  const scan = async () => {
    setScanning(true);
    setError('');
    setResult(null);
    setSelectedKeep({});
    setMergeResults({});
    try {
      const { data } = await api.get('/crm/leads/scan-duplicates');
      setResult(data);
      // Auto-select first lead (newest) as keep for each group
      const autoKeep = {};
      (data.groups || []).forEach((g, i) => {
        if (g.leads?.length) autoKeep[i] = g.leads[0].id;
      });
      setSelectedKeep(autoKeep);
      // Auto-expand all
      const exp = {};
      (data.groups || []).forEach((_, i) => { exp[i] = true; });
      setExpandedGroups(exp);
    } catch (e) {
      setError(e.response?.data?.error || 'Lỗi quét trùng');
    }
    setScanning(false);
  };

  const mergeGroup = async (groupIdx) => {
    const group = result.groups[groupIdx];
    const keepId = selectedKeep[groupIdx];
    if (!keepId) return alert('Chọn lead giữ lại trước');
    const deleteIds = group.leads.map(l => l.id).filter(id => id !== keepId);
    if (!deleteIds.length) return;
    if (!confirm(`Gộp ${deleteIds.length} lead vào lead được chọn?\nCác nhiệm vụ, tài liệu, báo giá sẽ được chuyển sang lead giữ lại.`)) return;

    setMerging(groupIdx);
    try {
      const { data } = await api.post('/crm/leads/merge-duplicates', { keep_id: keepId, delete_ids: deleteIds });
      setMergeResults(p => ({ ...p, [groupIdx]: data }));
      onMerged?.();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi gộp lead');
    }
    setMerging(null);
  };

  const mergeAll = async () => {
    if (!result?.groups?.length) return;
    const pending = result.groups.map((_, i) => i).filter(i => !mergeResults[i]);
    if (!pending.length) return alert('Đã gộp hết');
    if (!confirm(`Gộp tất cả ${pending.length} nhóm trùng?`)) return;
    for (const idx of pending) {
      await mergeGroup(idx);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-orange-500" />
            <h2 className="text-lg font-bold text-gray-900">Quét trùng Lead</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg cursor-pointer"><X className="h-5 w-5 text-gray-400" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Scan button */}
          {!result && !scanning && (
            <div className="text-center py-8">
              <div className="h-16 w-16 mx-auto rounded-full bg-orange-100 flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-orange-500" />
              </div>
              <p className="text-sm text-gray-600 mb-1">Quét tất cả lead để tìm trùng lặp dựa vào:</p>
              <p className="text-xs text-gray-400 mb-4">• Cùng khách hàng (customer_id) &nbsp; • Cùng Facebook User (PSID)</p>
              <button onClick={scan} className="h-10 px-6 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium cursor-pointer flex items-center gap-2 mx-auto">
                <Search className="h-4 w-4" /> Bắt đầu quét
              </button>
            </div>
          )}

          {scanning && (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-orange-500 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Đang quét lead trùng...</p>
            </div>
          )}

          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

          {result && (
            <>
              {/* Summary */}
              <div className={`rounded-xl p-4 ${result.total_groups > 0 ? 'bg-orange-50 border border-orange-200' : 'bg-green-50 border border-green-200'}`}>
                <div className="flex items-center gap-3">
                  {result.total_groups > 0 ? (
                    <AlertTriangle className="h-6 w-6 text-orange-500 shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
                  )}
                  <div>
                    <p className="font-semibold text-gray-900">
                      {result.total_groups > 0
                        ? `Tìm thấy ${result.total_groups} nhóm trùng (${result.total_duplicates} lead thừa)`
                        : 'Không tìm thấy lead trùng lặp!'}
                    </p>
                    {result.total_groups > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5">Chọn lead giữ lại cho mỗi nhóm, sau đó nhấn "Gộp"</p>
                    )}
                  </div>
                  {result.total_groups > 0 && (
                    <div className="ml-auto flex gap-2">
                      <button onClick={scan} className="h-8 px-3 bg-white border rounded-lg text-xs font-medium cursor-pointer hover:bg-gray-50">🔄 Quét lại</button>
                      <button onClick={mergeAll} className="h-8 px-3 bg-orange-500 text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-orange-600 flex items-center gap-1">
                        <Merge className="h-3 w-3" /> Gộp tất cả
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Groups */}
              {(result.groups || []).map((group, gi) => {
                const merged = mergeResults[gi];
                const expanded = expandedGroups[gi] !== false;
                return (
                  <div key={gi} className={`border rounded-xl overflow-hidden ${merged ? 'opacity-50 border-green-300 bg-green-50' : 'border-gray-200'}`}>
                    {/* Group header */}
                    <button onClick={() => setExpandedGroups(p => ({ ...p, [gi]: !expanded }))}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 cursor-pointer text-left">
                      {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                      <span className="text-sm">
                        {group.reason === 'customer_id' ? '👤' : '📘'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">
                          {group.reason === 'customer_id'
                            ? `Cùng KH: ${group.customer?.full_name || 'N/A'}`
                            : `Cùng Facebook: ${group.fb_name || group.psid || 'N/A'}`}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {group.leads.length} lead trùng
                          {group.customer?.phone && ` • ${group.customer.phone}`}
                          {group.customer?.email && ` • ${group.customer.email}`}
                        </p>
                      </div>
                      {merged ? (
                        <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Đã gộp ({merged.deleted} xóa)
                        </span>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); mergeGroup(gi); }}
                          disabled={merging === gi}
                          className="h-7 px-3 bg-orange-500 text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1">
                          {merging === gi ? <Loader2 className="h-3 w-3 animate-spin" /> : <Merge className="h-3 w-3" />}
                          Gộp nhóm
                        </button>
                      )}
                    </button>

                    {/* Lead cards */}
                    {expanded && !merged && (
                      <div className="p-3 space-y-2">
                        {group.leads.map((lead, li) => {
                          const isKeep = selectedKeep[gi] === lead.id;
                          return (
                            <div key={lead.id}
                              onClick={() => setSelectedKeep(p => ({ ...p, [gi]: lead.id }))}
                              className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                isKeep ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-300 bg-white'
                              }`}>
                              {/* Radio */}
                              <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                isKeep ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                              }`}>
                                {isKeep && <div className="h-2 w-2 rounded-full bg-white" />}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold text-gray-900">{lead.title}</span>
                                  <span className="text-[10px] text-gray-400">{lead.code}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{
                                    backgroundColor: lead.stage?.color ? lead.stage.color + '20' : '#f3f4f6',
                                    color: lead.stage?.color || '#6b7280',
                                  }}>
                                    {lead.stage?.icon} {lead.stage?.name}
                                  </span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{lead.type}</span>
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400 flex-wrap">
                                  {lead.estimated_value > 0 && <span className="font-medium text-emerald-600">{formatVND(lead.estimated_value)}</span>}
                                  {lead.assignee && <span>👤 {lead.assignee.full_name}</span>}
                                  {lead.source && <span>{lead.source.icon} {lead.source.name}</span>}
                                  <span>📅 {formatDate(lead.created_at)}</span>
                                  {lead.fb_contacts?.length > 0 && (
                                    <span className="text-blue-600">📘 FB: {lead.fb_contacts.map(f => f.fb_name || f.psid).join(', ')}</span>
                                  )}
                                </div>
                              </div>

                              {isKeep && (
                                <span className="text-[10px] bg-blue-500 text-white px-2 py-0.5 rounded-full font-medium shrink-0">
                                  ✓ Giữ lại
                                </span>
                              )}
                              {li === 0 && !isKeep && (
                                <span className="text-[10px] text-gray-400 shrink-0">Mới nhất</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Merge result */}
                    {expanded && merged && (
                      <div className="px-4 py-3 text-xs text-green-700">
                        ✅ Đã gộp: {merged.moved?.tasks || 0} nhiệm vụ, {merged.moved?.documents || 0} tài liệu, {merged.moved?.activities || 0} hoạt động, {merged.moved?.quotations || 0} báo giá được chuyển sang lead giữ lại.
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t flex justify-end">
          <button onClick={onClose} className="h-9 px-4 bg-gray-100 rounded-lg text-sm font-medium cursor-pointer hover:bg-gray-200">Đóng</button>
        </div>
      </div>
    </div>
  );
}
