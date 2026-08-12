import type { CrmKanbanItem } from '../types';

export type CrmPipelineStageBadge = NonNullable<CrmKanbanItem['sxPipelineStage']>;

/** Chuẩn hoá sx/vc_pipeline_stage từ socket hoặc API. */
export function mapPipelineStageBadge(raw: unknown): CrmPipelineStageBadge | null {
  if (raw == null) return null;
  if (typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const name = o.name != null ? String(o.name) : null;
  if (!name && o.id == null) return null;
  return {
    id: o.id != null ? String(o.id) : null,
    name,
    color: o.color != null ? String(o.color) : null,
    icon: o.icon != null ? String(o.icon) : null,
  };
}

/** Áp patch badge SX/VC (+ project) từ payload `crm:badge_updated`. */
export function applyCrmBadgeFieldsToItem<T extends {
  sxPipelineStage?: CrmKanbanItem['sxPipelineStage'];
  vcPipelineStage?: CrmKanbanItem['vcPipelineStage'];
  projectId?: string | null;
}>(item: T, detail: Record<string, unknown>): T {
  const next: T = { ...item };
  if (Object.prototype.hasOwnProperty.call(detail, 'sx_pipeline_stage')) {
    next.sxPipelineStage = mapPipelineStageBadge(detail.sx_pipeline_stage);
  }
  if (Object.prototype.hasOwnProperty.call(detail, 'vc_pipeline_stage')) {
    next.vcPipelineStage = mapPipelineStageBadge(detail.vc_pipeline_stage);
  }
  if (Object.prototype.hasOwnProperty.call(detail, 'project_id')) {
    next.projectId = detail.project_id ? String(detail.project_id) : null;
  }
  return next;
}

export function crmBadgeDetailAffectsChip(detail?: Record<string, unknown> | null): boolean {
  if (!detail) return false;
  return (
    Object.prototype.hasOwnProperty.call(detail, 'sx_pipeline_stage')
    || Object.prototype.hasOwnProperty.call(detail, 'vc_pipeline_stage')
    || Object.prototype.hasOwnProperty.call(detail, 'project_id')
    || detail.reason === 'project_deleted'
    || detail.action === 'stage_changed'
  );
}
