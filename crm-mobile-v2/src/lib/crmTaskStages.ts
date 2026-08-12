/**
 * Gom nhiệm vụ CRM theo giai đoạn pipeline — khớp logic web CRMTasksTab.resolveTaskPipelineStageId.
 */
import type { CrmPipelineStage } from '../types';
import type { LeadCrmTask } from '../api/leadDetail';

export const CRM_TASK_ORPHAN_STAGE_KEY = '__crm_orphan_pipeline__';

export type TaskStageSection = {
  key: string;
  label: string;
  color?: string | null;
  icon?: string | null;
  isOrphan?: boolean;
  isCurrent?: boolean;
  tasks: LeadCrmTask[];
  openCount: number;
  doneCount: number;
};

type TaskLike = LeadCrmTask & {
  pipeline_stage_id?: string | null;
  pipeline_stage?: { id?: string; name?: string | null; color?: string | null; icon?: string | null } | null;
};

export function resolveTaskPipelineStageId(
  task: TaskLike,
  pipelineStages: CrmPipelineStage[],
  leadCurrentStageId?: string | null,
): string | null {
  const stages = pipelineStages || [];
  const validIds = new Set(stages.map((s) => String(s.id)));
  const pid = task.pipeline_stage_id
    ? String(task.pipeline_stage_id)
    : task.pipeline_stage?.id
      ? String(task.pipeline_stage.id)
      : null;
  if (pid && validIds.has(pid)) return pid;

  const slug = String(task.stage_slug || '').trim().toLowerCase();
  if (slug && stages.length) {
    const byCanonical = stages.find(
      (s) => String(s.canonicalSlug || '').toLowerCase() === slug,
    );
    if (byCanonical) return byCanonical.id;
    const bare = slug.replace(/^deal_/, '');
    const byBare = stages.find(
      (s) => String(s.canonicalSlug || '').toLowerCase() === bare,
    );
    if (byBare) return byBare.id;
  }

  if (pid && !validIds.has(pid)) return null;

  if (leadCurrentStageId && validIds.has(String(leadCurrentStageId))) {
    return String(leadCurrentStageId);
  }
  return stages[0]?.id || null;
}

export function groupCrmTasksByStage(
  tasks: LeadCrmTask[],
  pipelineStages: CrmPipelineStage[],
  leadCurrentStageId?: string | null,
): TaskStageSection[] {
  const map = new Map<string, LeadCrmTask[]>();
  for (const s of pipelineStages) map.set(s.id, []);

  for (const t of tasks) {
    const key = resolveTaskPipelineStageId(t, pipelineStages, leadCurrentStageId);
    if (key && map.has(key)) {
      map.get(key)!.push(t);
    } else {
      if (!map.has(CRM_TASK_ORPHAN_STAGE_KEY)) map.set(CRM_TASK_ORPHAN_STAGE_KEY, []);
      map.get(CRM_TASK_ORPHAN_STAGE_KEY)!.push(t);
    }
  }

  const sortTasks = (list: LeadCrmTask[]) =>
    [...list].sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0));

  const sections: TaskStageSection[] = [];
  for (const s of pipelineStages) {
    const list = sortTasks(map.get(s.id) || []);
    if (!list.length) continue;
    sections.push({
      key: s.id,
      label: s.name,
      color: s.color,
      icon: s.icon,
      isCurrent: String(s.id) === String(leadCurrentStageId || ''),
      tasks: list,
      openCount: list.filter((t) => t.status !== 'completed').length,
      doneCount: list.filter((t) => t.status === 'completed').length,
    });
  }

  const orphan = sortTasks(map.get(CRM_TASK_ORPHAN_STAGE_KEY) || []);
  if (orphan.length) {
    sections.push({
      key: CRM_TASK_ORPHAN_STAGE_KEY,
      label: 'Nhiệm vụ pipeline cũ',
      color: '#B45309',
      icon: '⚠️',
      isOrphan: true,
      tasks: orphan,
      openCount: orphan.filter((t) => t.status !== 'completed').length,
      doneCount: orphan.filter((t) => t.status === 'completed').length,
    });
  }

  // Không có pipeline stages → 1 nhóm phẳng theo stage_slug / «Tất cả».
  if (!pipelineStages.length && tasks.length) {
    const bySlug = new Map<string, LeadCrmTask[]>();
    for (const t of tasks) {
      const k = String(t.stage_slug || t.pipeline_stage?.name || 'all');
      if (!bySlug.has(k)) bySlug.set(k, []);
      bySlug.get(k)!.push(t);
    }
    for (const [k, list] of bySlug) {
      const sorted = sortTasks(list);
      sections.push({
        key: k,
        label: list[0]?.pipeline_stage?.name || (k === 'all' ? 'Tất cả nhiệm vụ' : k),
        color: list[0]?.pipeline_stage?.color,
        tasks: sorted,
        openCount: sorted.filter((t) => t.status !== 'completed').length,
        doneCount: sorted.filter((t) => t.status === 'completed').length,
      });
    }
  }

  return sections;
}
