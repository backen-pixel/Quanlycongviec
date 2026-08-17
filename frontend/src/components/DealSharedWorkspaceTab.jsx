import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Loader2, ShoppingCart } from 'lucide-react';
import api from '../lib/api';
import LeadMemberAssignmentsPanel from './LeadMemberAssignmentsPanel';

/**
 * Danh sách deal «đơn hàng phát sinh» gắn deal khách hàng nguồn — liên kết mở chi tiết.
 * Nếu đang xem chính deal phát sinh: hiện liên kết về deal nguồn (+ anh em nếu có).
 */
function SpawnedAdditionalDealsPanel({ leadId, refreshKey = null, dealResponsible = null }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const sourceId = dealResponsible?.source_customer_deal_id
    || dealResponsible?.source_customer_deal?.id
    || null;
  const sourceMeta = dealResponsible?.source_customer_deal || null;
  const listParentId = sourceId || leadId;

  const load = useCallback(async () => {
    if (!listParentId) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/crm/deals/${listParentId}/spawned-additional`);
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      setItems([]);
      setError(e.response?.data?.error || e.message || 'Không tải được đơn phát sinh');
    } finally {
      setLoading(false);
    }
  }, [listParentId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const siblings = sourceId
    ? items.filter((r) => String(r.id) !== String(leadId))
    : items;

  return (
    <div className="border-t border-gray-100 pt-6 space-y-3">
      <div className="rounded-xl border border-teal-200/80 bg-teal-50/40 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-teal-950 flex items-center gap-1.5">
              <ShoppingCart className="h-4 w-4 shrink-0 text-teal-700" />
              Đơn hàng phát sinh
            </p>
            <p className="text-[11px] text-teal-800/80 mt-0.5">
              {sourceId
                ? 'Deal này phát sinh từ deal khách hàng — mở nguồn hoặc các đơn phát sinh khác.'
                : 'Deal tạo từ deal khách hàng này — bấm để mở chi tiết / pipeline.'}
            </p>
          </div>
          {!loading && !sourceId ? (
            <span className="text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
              {items.length}
            </span>
          ) : null}
        </div>

        {sourceId ? (
          <button
            type="button"
            onClick={() => navigate(`/crm/leads/${sourceId}`)}
            className="w-full text-left rounded-lg border border-teal-300 bg-white hover:bg-teal-50 px-3 py-2.5 transition-colors cursor-pointer group"
          >
            <p className="text-[11px] font-bold uppercase tracking-wide text-teal-700">Deal khách hàng nguồn</p>
            <p className="text-sm font-semibold text-gray-900 mt-0.5 break-words group-hover:text-teal-950">
              {[sourceMeta?.code, sourceMeta?.title].filter(Boolean).join(' — ')
                || String(sourceId).slice(0, 8)}
            </p>
            <p className="text-[11px] text-teal-700 mt-1 inline-flex items-center gap-1">
              Mở deal nguồn <ExternalLink className="h-3.5 w-3.5" />
            </p>
          </button>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-teal-800/70 py-3">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
          </div>
        ) : error ? (
          <p className="text-sm text-red-600 py-1">{error}</p>
        ) : siblings.length === 0 ? (
          sourceId ? null : (
            <p className="text-sm text-teal-800/60 py-2">
              Chưa có đơn hàng phát sinh. Dùng nút «Tạo đơn hàng phát sinh» trên deal khách hàng.
            </p>
          )
        ) : (
          <ul className="space-y-2">
            {sourceId ? (
              <li className="text-[11px] font-semibold text-teal-800/80 px-0.5">
                Đơn phát sinh khác ({siblings.length})
              </li>
            ) : null}
            {siblings.map((row) => {
              const stageName = row.stage?.name || null;
              const stageColor = row.stage?.color || '#0f766e';
              const created = row.created_at
                ? new Date(row.created_at).toLocaleString('vi-VN', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
                : null;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/crm/leads/${row.id}`)}
                    className="w-full text-left rounded-lg border border-teal-200/90 bg-white hover:bg-teal-50/80 hover:border-teal-300 px-3 py-2.5 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <p className="text-xs font-mono text-teal-700/90">{row.code || '—'}</p>
                        <p className="text-sm font-semibold text-gray-900 leading-snug break-words group-hover:text-teal-950">
                          {row.title || 'Không tên'}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
                          {stageName ? (
                            <span
                              className="inline-flex items-center gap-1 font-medium px-1.5 py-0.5 rounded border"
                              style={{
                                color: stageColor,
                                borderColor: `${stageColor}55`,
                                backgroundColor: `${stageColor}12`,
                              }}
                            >
                              {stageName}
                            </span>
                          ) : null}
                          {created ? <span>Tạo: {created}</span> : null}
                        </div>
                      </div>
                      <ExternalLink className="h-4 w-4 shrink-0 text-teal-600 opacity-70 group-hover:opacity-100 mt-0.5" />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Tab «Không gian chung» — phân công thành viên deal + danh sách đơn hàng phát sinh.
 */
export default function DealSharedWorkspaceTab({
  leadId,
  leadType = 'deal',
  users = [],
  taskScope = 'production',
  /** Tab phân công mặc định: all | crm | production | logistics */
  defaultAssignModule = null,
  /** Công ty CRM của deal */
  companyId = null,
  /** Công ty xưởng SX (nếu khác CRM) */
  sxCompanyId = null,
  /** Công ty VC (nếu khác CRM) */
  vcCompanyId = null,
  onArtifactsSynced = null,
  linkedProjectId = null,
  embeddedSxKanbanStages = null,
  embeddedVcKanbanStages = null,
  embeddedWorkshopTypeId = null,
  sxTemplateCompanyId = null,
  vcTemplateCompanyId = null,
  dealResponsible = null,
  workshopProject = null,
  refreshKey = null,
}) {
  if (!leadId) {
    return (
      <p className="text-sm text-gray-500 text-center py-8">
        Cần deal CRM gắn dự án để dùng Không gian chung.
      </p>
    );
  }

  const assignModule = defaultAssignModule
    || (taskScope === 'logistics' ? 'logistics'
      : taskScope === 'production' ? 'production'
        : 'crm');

  const resolvedCompanyId = companyId
    || dealResponsible?.company_id
    || null;
  const resolvedSxCompanyId = sxCompanyId || sxTemplateCompanyId || resolvedCompanyId;
  const resolvedVcCompanyId = vcCompanyId || vcTemplateCompanyId || resolvedCompanyId;

  return (
    <div className="space-y-8">
      <LeadMemberAssignmentsPanel
        leadId={leadId}
        defaultModule={assignModule}
        companyId={resolvedCompanyId}
        sxCompanyId={resolvedSxCompanyId}
        vcCompanyId={resolvedVcCompanyId}
        linkedProjectId={linkedProjectId}
        refreshKey={refreshKey}
      />

      <SpawnedAdditionalDealsPanel
        leadId={leadId}
        refreshKey={refreshKey}
        dealResponsible={dealResponsible}
      />
    </div>
  );
}
