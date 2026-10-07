import type { Result } from './bridge.js';
const labels: Record<string,string> = { attribution_events: 'Sự kiện attribution đã quan sát', linked_crm_leads: 'Hồ sơ CRM có liên kết', unlinked_attributions: 'Attribution chưa liên kết', crm_records_created: 'Hồ sơ CRM tạo trong kỳ', atomic_intake_receipts: 'Biên nhận tiếp nhận nguyên tử', unprocessed_intake_events: 'Sự kiện chưa xử lý', spend_vnd: 'Chi tiêu đã đối soát', cost_per_qualified_lead: 'Chi phí / khách hợp lệ', first_response_sla: 'SLA phản hồi đầu tiên', gap_to_target: 'Khoảng cách mục tiêu' };
const known: Record<string,string> = { COMPLETE: 'Đã đọc hết phạm vi database', PARTIAL: 'Chưa đầy đủ', UNKNOWN: 'Chưa xác minh', OK: 'Đọc thành công', ERROR: 'Lỗi nguồn', OBSERVED: 'Đã quan sát', MET: 'Đạt SLA', BREACHED: 'Vượt SLA', DRAFT: 'Nháp', APPROVED: 'Đã duyệt', REJECTED: 'Đã từ chối', RECORDED: 'Đã ghi nhận', VALID: 'Hợp lệ', UNASSIGNED: 'Chưa giao', NOT_EXECUTED: 'Chưa thực thi' };
export const labelStatus = (v: unknown) => typeof v === 'string' ? (known[v] || 'Chưa xác minh') : 'Chưa xác minh';
function objects(v: unknown): Record<string,unknown>[] { return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []; }
export function present(result: Result) {
  const d = result.data;
  const metrics = d.metrics && typeof d.metrics === 'object' ? d.metrics as Record<string,unknown> : {};
  return { title: result.synthetic ? 'Founder Control Center · DỮ LIỆU MẪU' : 'Founder Control Center',
    outcome: labelStatus(result.outcome), scope: result.scope.company_id,
    period: result.window ? `${result.window.start} → ${result.window.end} · ${result.window.timezone}` : 'Quyết định theo phiên bản đề xuất',
    fetched: result.fetched_at, sourceAsOf: result.source_as_of || 'Chưa xác minh thời điểm cập nhật toàn nguồn',
    metrics: Object.entries(metrics).map(([k,m]) => {
      const v = m as { value?: unknown; status?: string; reason?: string; source_refs?: string[] };
      return { key:k, label: labels[k] || k, value: typeof v?.value === 'number' ? v.value.toLocaleString('vi-VN') : 'Chưa đo được',
        status: labelStatus(v?.status), reason: v?.reason || null, sources: v?.source_refs?.join(', ') || 'Chưa có nguồn đối soát' };
    }),
    systems: objects(d.systems).map(s => ({ title:String(s.title || ''), next:String(s.next_step || ''), owner: s.owner_id ? String(s.owner_id) : 'Chưa xác minh người phụ trách' })),
    sources: result.source_refs.map(s => ({ ref:s.ref, status: labelStatus(s.status), coverage:labelStatus(s.coverage), freshness: s.freshness === 'STALE_SYNC_OVER_15_MINUTES' ? `Dữ liệu đồng bộ cũ: ${s.last_sync_observed_at}` : s.freshness === 'INVALID_FUTURE_SYNC' ? 'Thời điểm đồng bộ không hợp lệ' : s.source_as_of || 'Chưa có watermark đầy đủ nguồn', reason:s.reason })),
    objectives: objects(d.objectives).map(o => ({ id:String(o.id), title:String(o.title || ''), owner:String(o.owner_id || 'Chưa giao'), status:labelStatus(o.status) })),
    decisions: objects(d.decisions).map(o => ({ id:String(o.id), proposal:String(o.proposal_id || ''), version:String(o.proposal_version || ''), decision:o.decision === 'APPROVE' ? 'Đồng ý' : 'Từ chối' })),
    evidence: d.lead_ref ? { lead:String(d.lead_ref), next:String(d.next_step || ''),
      response: labelStatus((d.first_response as Record<string,unknown>)?.status),
      minutes: typeof (d.first_response as Record<string,unknown>)?.minutes === 'number' ? String((d.first_response as Record<string,unknown>).minutes) : 'Chưa đo được',
      refs: objects(d.attribution).map(a => String(a.evidence_ref)).concat(Array.isArray(d.receipt_refs) ? d.receipt_refs.map(String) : []) } : null,
    recording: d.execution === 'NOT_EXECUTED' ? 'Quyết định/mục tiêu chỉ được ghi nhận; chưa thực thi.' : null,
  };
}
