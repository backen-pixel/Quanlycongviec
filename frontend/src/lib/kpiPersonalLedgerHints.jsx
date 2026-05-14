import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { KPI_DEFS } from '../pages/KpiGuidePage.jsx';

export const CRM_KPI_COACH_EVENT = 'tbp:assistant-crm-kpi-coach';

export const CRM_KPI_COACH_USER_MESSAGE_AGGREGATE =
  'Phân tích điểm KPI sổ cái CRM (tháng đang xem trên dashboard). Đây là tổng theo pipeline chưa lọc một phụ trách — cho ưu tiên chung; nếu cần soi từng người thì nhắc chọn «Phụ trách» trên dashboard. Dựa trên JSON trong context — không bịa số.';

export const CRM_KPI_COACH_USER_MESSAGE_ASSIGNEE =
  'Phân tích điểm KPI sổ cái CRM cho đúng nhân viên đang được lọc ở «Phụ trách» (tháng và bộ lọc Kanban hiện tại) và cho biết ưu tiên để tăng điểm ròng của người đó. Dựa trên JSON trong context — không bịa số.';

/** @deprecated dùng CRM_KPI_COACH_USER_MESSAGE_ASSIGNEE / _AGGREGATE hoặc buildCrmKpiCoachUserMessage */
export const CRM_KPI_COACH_USER_MESSAGE = CRM_KPI_COACH_USER_MESSAGE_AGGREGATE;

export function buildCrmKpiCoachUserMessage(assigneeProfile) {
  return assigneeProfile?.id ? CRM_KPI_COACH_USER_MESSAGE_ASSIGNEE : CRM_KPI_COACH_USER_MESSAGE_AGGREGATE;
}

/** Sự kiện + helper cho «Hỏi AI giải thích cách tính» trên trang Hướng dẫn KPI. */
export const KPI_EXPLAIN_EVENT = 'tbp:assistant-kpi-explain';

/** @param {object} kpi - một item trong KPI_DEFS (frontend/src/pages/KpiGuidePage.jsx). */
export function buildKpiDefinitionExplainPack(kpi) {
  if (!kpi) return null;
  const safe = {
    code: kpi.code,
    name: kpi.name,
    group: kpi.group || null,
    weight: kpi.weight ?? null,
    target: kpi.target || null,
    targetNote: kpi.targetNote || null,
    formula: kpi.formula || null,
    applies: Array.isArray(kpi.applies) ? kpi.applies : [],
    isGating: !!kpi.isGating,
    criticalNote: kpi.criticalNote || null,
    howMeasured: kpi.howMeasured || null,
    infoFields: Array.isArray(kpi.infoFields) ? kpi.infoFields : null,
    actions: Array.isArray(kpi.actions) ? kpi.actions.slice(0, 8) : [],
    mistakes: Array.isArray(kpi.mistakes) ? kpi.mistakes.slice(0, 6) : null,
  };
  return { kind: 'kpi_definition_explain', payload: safe };
}

export function buildKpiExplainUserMessage(kpi) {
  if (!kpi) return 'Giải thích cách tính KPI này theo định nghĩa trong context_pack.';
  return `Giải thích cách tính KPI ${kpi.code} «${kpi.name}» dựa trên định nghĩa trong context_pack: ý nghĩa, công thức, cách hệ thống đo, ví dụ minh hoạ và mẹo đạt mục tiêu.`;
}

/** Tiện ích: dispatch sự kiện để bong bóng AIAssistantChat tự mở và gửi câu hỏi. */
export function dispatchKpiExplain(kpi) {
  const context_pack = buildKpiDefinitionExplainPack(kpi);
  if (!context_pack) return;
  window.dispatchEvent(
    new CustomEvent(KPI_EXPLAIN_EVENT, {
      detail: { message: buildKpiExplainUserMessage(kpi), context_pack },
    }),
  );
}
const ROLE_LABELS_VI = {
  sales_admin: 'Sales Admin / Telesales',
  sales: 'Kinh doanh (SAE)',
  deal: 'Tư vấn / Deal',
};

const OVERSIGHT_ROLES = new Set([
  'admin',
  'superadmin',
  'super_admin',
  'administrator',
  'manager',
  'region_admin',
]);

/**
 * Ánh xạ role tài khoản app → một hoặc nhiều "persona" trong bảng KPI hướng dẫn (sales_admin | sales | deal).
 */
export function resolveGuidePersonas(appRole, pipelineType) {
  const r = String(appRole || '')
    .trim()
    .toLowerCase();
  const out = new Set();
  if (r === 'sales_admin') out.add('sales_admin');
  if (r === 'sales') out.add('sales');
  if (OVERSIGHT_ROLES.has(r)) {
    out.add('sales_admin');
    out.add('sales');
    if (pipelineType === 'deal') out.add('deal');
  }
  if (out.size === 0) {
    if (pipelineType === 'deal') {
      out.add('deal');
      out.add('sales');
    } else {
      out.add('sales');
    }
  }
  return [...out];
}

function defsForPersona(persona) {
  return KPI_DEFS.filter((k) => k.applies.includes(persona) || k.applies.includes('all')).sort(
    (a, b) => (b.weight || 0) - (a.weight || 0),
  );
}

function buildStaticHintsPlainForCoach(personas, pipelineType) {
  const lines = [];
  const maxPerPersona = 4;
  const maxKpis = 4;
  for (const p of personas) {
    lines.push(`[${p}]`);
    const defs = defsForPersona(p).slice(0, maxKpis);
    let n = 0;
    for (const k of defs) {
      for (const a of (k.actions || []).slice(0, 1)) {
        lines.push(`- ${k.code} ${k.name}: ${a}`);
        n += 1;
        if (n >= maxPerPersona) break;
      }
      if (n >= maxPerPersona) break;
    }
  }
  return lines.join('\n').slice(0, 2400);
}

/** Payload gửi kèm /assistant/chat (context_pack) để AI phân tích KPI sổ cái. */
export function buildCrmKpiLedgerCoachPack({
  kpis,
  pipelineType,
  viewerUser,
  assigneeProfile,
  ledgerNetByLead,
}) {
  const hasAssigneeFilter = !!(assigneeProfile && String(assigneeProfile.id || '').trim());
  const subjectRole = assigneeProfile?.role ?? viewerUser?.role;
  const personas = resolveGuidePersonas(subjectRole, pipelineType);
  const viewerId = viewerUser?.id || viewerUser?.userId;
  const entries = Object.entries(ledgerNetByLead || {})
    .map(([leadId, v]) => ({
      lead_id_short: String(leadId).replace(/-/g, '').slice(0, 10),
      net: Math.round(Number(v) * 100) / 100,
    }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
    .slice(0, 16);
  return {
    kind: 'crm_kpi_ledger',
    payload: {
      analysis_scope: hasAssigneeFilter ? 'assignee' : 'pipeline_aggregate',
      analysis_scope_vi: hasAssigneeFilter
        ? 'Điểm và ledger_lead_top chỉ gồm lead/deal do nhân viên được chọn ở bộ lọc «Phụ trách» phụ trách (theo quy tắc tab Lead/Deal trên server).'
        : 'Điểm và ledger là tổng trên mọi lead/deal khớp bộ lọc Kanban (chưa chọn một phụ trách). Để AI phân tích từng cá nhân: trên CRM Dashboard chọn «Phụ trách» = người đó, rồi mở lại tooltip «Điểm KPI (tháng)» → Phân tích với AI.',
      period_start: kpis?.kpi_ledger_period_start ?? null,
      kpi_ledger_month_net_sum: kpis?.kpi_ledger_month_net_sum ?? null,
      pipeline_tab: pipelineType,
      personas,
      viewer: {
        id: viewerId ?? null,
        name: (viewerUser?.full_name && String(viewerUser.full_name).trim()) || null,
        role: viewerUser?.role || null,
      },
      subject: hasAssigneeFilter
        ? {
            id: String(assigneeProfile.id),
            name:
              (assigneeProfile?.full_name && String(assigneeProfile.full_name).trim()) ||
              (assigneeProfile?.email && String(assigneeProfile.email).trim()) ||
              null,
            role: assigneeProfile?.role || null,
            viewing_filtered_assignee: !!(
              viewerId && String(assigneeProfile.id) !== String(viewerId)
            ),
          }
        : {
            id: null,
            name: null,
            role: null,
            viewing_filtered_assignee: false,
          },
      ledger_lead_top: entries,
      static_hints_paragraph: buildStaticHintsPlainForCoach(personas, pipelineType),
    },
  };
}

/**
 * Tooltip «Điểm KPI (tháng)»: phần sổ cái + gợi ý gom theo từng vai trò (cá nhân đang xem hoặc NV lọc).
 */
export function buildKpiLedgerMonthTooltipHint({
  periodLabel,
  viewerUser,
  assigneeProfile,
  pipelineType,
  kpis,
  ledgerNetByLead,
}) {
  const subjectRole = assigneeProfile?.role ?? viewerUser?.role;
  const personas = resolveGuidePersonas(subjectRole, pipelineType);
  const viewerId = viewerUser?.id || viewerUser?.userId;
  const hasAssigneeFilter = !!(assigneeProfile && String(assigneeProfile.id || '').trim());
  const isOther =
    assigneeProfile?.id && viewerId && String(assigneeProfile.id) !== String(viewerId);
  const subjectName = hasAssigneeFilter
    ? (assigneeProfile?.full_name && String(assigneeProfile.full_name).trim()) ||
      (assigneeProfile?.email && String(assigneeProfile.email).trim()) ||
      'Nhân viên đang lọc'
    : 'Toàn pipeline (chưa lọc 1 phụ trách)';
  const subjectRoleLine = hasAssigneeFilter
    ? subjectRole
      ? `Vai trò hệ thống: ${String(subjectRole)}`
      : 'Chưa xác định vai trò — gợi ý theo tab Lead/Deal.'
    : `Người đang xem dashboard: ${(viewerUser?.full_name && String(viewerUser.full_name).trim()) || viewerUser?.email || '—'} — gợi ý hành động theo vai trò của bạn, còn con số KPI là tổng nhiều phụ trách.`;

  const maxBulletsPerPersona = 10;
  const maxKpisPerPersona = 6;

  return (
    <div className="space-y-2.5 text-left font-normal normal-case tracking-normal">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/80">Sổ cái KPI tháng</p>
      <p>
        Số trên thẻ là <strong>tổng điểm ròng</strong> (cộng/trừ) trong <strong>crm_kpi_ledger</strong> cho kỳ{' '}
        <strong>{periodLabel}</strong>, trên các lead/deal đang khớp bộ lọc dashboard (công ty, thời gian Kanban, nhân
        viên nếu chọn).
      </p>
      <p className="rounded-md border border-amber-400/25 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-snug text-amber-50/95">
        <strong>Phân tích theo từng người:</strong> chọn nhân viên ở bộ lọc <strong>«Phụ trách»</strong> trên dashboard,
        đợi Kanban tải xong, rồi mở lại tooltip này và bấm «Phân tích với AI» — điểm và sổ cái gửi cho AI sẽ chỉ của{' '}
        <strong>một cá nhân</strong> đó. Không chọn phụ trách thì số là <strong>tổng nhiều người</strong> (pipeline chung).
      </p>
      <p>
        <strong>Cách tính nhanh:</strong> mỗi sự kiện đủ điều kiện → một dòng điểm theo quy tắc công ty; tổng ={' '}
        <strong>Σ</strong> các dòng trong tháng (không phải một phép chia cố định cho “đạt 10 điểm”).
      </p>

      <div className="rounded-lg border border-white/15 bg-white/5 px-2 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-200/95">
          Việc nên làm — gợi ý theo cá nhân
        </p>
        <p className="mt-1 text-[11px] text-white/90">
          Phạm vi điểm / gợi ý: <strong>{subjectName}</strong>
          {hasAssigneeFilter && isOther ? ' (đang xem theo bộ lọc nhân viên)' : ''}
          {hasAssigneeFilter && !isOther ? ' (bạn đang lọc chính mình)' : ''}
          {subjectRoleLine ? (
            <>
              <br />
              <span className="text-white/75">{subjectRoleLine}</span>
            </>
          ) : null}
        </p>
        <div className="mt-2 space-y-3 border-t border-white/10 pt-2">
          {personas.map((persona) => {
            const label = ROLE_LABELS_VI[persona] || persona;
            const defs = defsForPersona(persona).slice(0, maxKpisPerPersona);
            const items = [];
            let n = 0;
            for (const k of defs) {
              for (const a of (k.actions || []).slice(0, 2)) {
                if (n >= maxBulletsPerPersona) break;
                items.push(
                  <li key={`${persona}-${k.code}-${n}`} className="text-white/95">
                    <span className="font-mono text-[10px] text-sky-200/90">{k.code}</span>{' '}
                    <span className="text-white/70">({k.name}):</span> {a}
                  </li>,
                );
                n += 1;
              }
              if (n >= maxBulletsPerPersona) break;
            }
            if (!items.length) return null;
            return (
              <div key={persona}>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-100/95">{label}</p>
                <ul className="list-disc space-y-1 pl-4 text-[11px] leading-snug">{items}</ul>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-white/65">
          Mục tiêu % / ngưỡng từng KPI (ví dụ ≥ 90%) và trọng số — xem đầy đủ tại trang hướng dẫn.
        </p>
      </div>

      <p className="text-[11px] text-white/90">
        Chi tiết mục tiêu, công thức điểm trên thang 100 và checklist:{' '}
        <Link to="/crm/kpi/guide" className="text-sky-300 underline underline-offset-2 hover:text-white">
          Hướng dẫn KPI
        </Link>
        .
      </p>

      <div className="pointer-events-auto border-t border-white/10 pt-2 mt-1">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-2 py-1.5 text-[11px] font-semibold text-white shadow hover:from-violet-700 hover:to-indigo-700"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const context_pack = buildCrmKpiLedgerCoachPack({
              kpis,
              pipelineType,
              viewerUser,
              assigneeProfile,
              ledgerNetByLead,
            });
            const message = buildCrmKpiCoachUserMessage(assigneeProfile);
            window.dispatchEvent(
              new CustomEvent(CRM_KPI_COACH_EVENT, {
                detail: { message, context_pack },
              }),
            );
          }}
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          {hasAssigneeFilter ? 'Phân tích AI (theo NV đang lọc)' : 'Phân tích AI (tổng pipeline)'}
        </button>
        <p className="mt-1 text-center text-[9px] text-white/55">Cần OPENAI_API_KEY trên server</p>
      </div>
    </div>
  );
}
