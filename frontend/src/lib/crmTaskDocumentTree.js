/**
 * Nhóm ghi chú / file nhiệm vụ CRM theo cấu trúc tab Nhiệm vụ:
 * giai đoạn pipeline → nhiệm vụ (order_index) → mục checklist → tài liệu.
 */
import { resolveCrmPipelineStageLabel } from './crmStageSlugLabels';

const LEAD_STAGES = [
  { slug: 'consulting', label: 'Tư vấn', icon: '💬', color: '#3B82F6' },
];
const DEAL_STAGES = [
  { slug: 'deal_new', label: 'Nhiệm vụ Deal mới', icon: '📋', color: '#3B82F6' },
  { slug: 'deal_quote_contract', label: 'Báo giá & Hợp đồng', icon: '📄', color: '#8B5CF6' },
  { slug: 'deal_ordering', label: 'Tiến hành đặt hàng', icon: '🛒', color: '#F59E0B' },
  { slug: 'deal_schedule', label: 'Hẹn ngày lắp đặt', icon: '📅', color: '#10B981' },
  { slug: 'deal_shipping', label: 'Đặt Vận chuyển', icon: '🚛', color: '#EF4444' },
  { slug: 'deal_notes', label: 'Ghi chú khác', icon: '📝', color: '#6B7280' },
];
const SX_ORDER_STAGES = [
  { slug: 'sx_tiep_nhan', label: 'Tiếp nhận', icon: '1️⃣', color: '#2563EB' },
  { slug: 'sx_thiet_ke_ke_hoach', label: 'Thiết kế và lên kế hoạch', icon: '2️⃣', color: '#7C3AED' },
  { slug: 'sx_kiem_tra_cheo', label: 'Kiểm tra chéo', icon: '3️⃣', color: '#0EA5E9' },
  { slug: 'sx_vat_tu', label: 'Vật tư', icon: '4️⃣', color: '#D97706' },
  { slug: 'sx_san_xuat_thung', label: 'Sản xuất thùng', icon: '5️⃣', color: '#059669' },
  { slug: 'sx_san_xuat_alu', label: 'Sản xuất alu', icon: '6️⃣', color: '#0891B2' },
  { slug: 'sx_hoan_thien', label: 'Hoàn thiện', icon: '7️⃣', color: '#16A34A' },
  { slug: 'sx_dong_goi', label: 'Đóng gói', icon: '8️⃣', color: '#EA580C' },
  { slug: 'sx_giao_hang', label: 'Giao hàng', icon: '9️⃣', color: '#DC2626' },
];

export function normalizeCrmChecklist(arr) {
  return (Array.isArray(arr) ? arr : []).map((c, i) => (
    typeof c === 'string'
      ? { id: `ckidx_${i}`, title: c, description: '', notes: '', done: false }
      : {
          id: c?.id || `ckidx_${i}`,
          title: c?.title || c?.label || '',
          description: c?.description || '',
          notes: c?.notes || '',
          done: !!(c?.done ?? c?.is_completed),
        }
  ));
}

export function isSxStageSlug(slug) {
  return String(slug || '').startsWith('sx_');
}

/** Khớp CRMTasksTab.resolveTaskPipelineStageId */
export function resolveTaskPipelineStageId(task, pipelineStages, leadCurrentStageId) {
  const stages = pipelineStages || [];
  const validIds = new Set(stages.map((s) => String(s.id)));
  const pid = task.pipeline_stage_id ? String(task.pipeline_stage_id) : null;
  if (pid && validIds.has(pid)) return task.pipeline_stage_id;

  const slug = String(task.stage_slug || '').trim().toLowerCase();
  if (slug && stages.length) {
    const byCanonical = stages.find(
      (s) => String(s.canonical_slug || '').toLowerCase() === slug,
    );
    if (byCanonical) return byCanonical.id;
    const bare = slug.replace(/^deal_/, '');
    const byBare = stages.find(
      (s) => String(s.canonical_slug || '').toLowerCase() === bare,
    );
    if (byBare) return byBare.id;
  }

  if (leadCurrentStageId && validIds.has(String(leadCurrentStageId))) {
    return leadCurrentStageId;
  }
  return stages[0]?.id || null;
}

function pipelineStagesAsUiStages(pipelineStages) {
  return (pipelineStages || []).map((s, i) => ({
    slug: s.id,
    label: s.name || 'Giai đoạn',
    icon: s.icon || '📌',
    color: s.color || '#3B82F6',
    isPipelineStage: true,
    pipelineStageId: s.id,
    order_index: s.order_index ?? i,
  }));
}

export function getDocumentStageList({ leadType = 'lead', pipelineStages = [] }) {
  const pipelineUi = pipelineStagesAsUiStages(pipelineStages);
  if (leadType === 'deal') {
    if (pipelineStages.length) return [...pipelineUi, ...SX_ORDER_STAGES];
    return [...DEAL_STAGES, ...SX_ORDER_STAGES];
  }
  if (pipelineStages.length) return pipelineUi;
  return LEAD_STAGES;
}

function resolveTaskStageKey(task, pipelineStages, leadCurrentStageId) {
  if (isSxStageSlug(task.stage_slug)) return task.stage_slug;
  if (pipelineStages.length) {
    return resolveTaskPipelineStageId(task, pipelineStages, leadCurrentStageId) || '_other';
  }
  return task.stage_slug || '_other';
}

function isNoteArtifact(a) {
  const dt = a?.doc_type;
  return dt === 'task_note' || dt === 'task_inline_note' || dt === 'checklist_inline_note';
}

function sortArtifacts(list) {
  return [...list].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
}

/** task_id → Map(checklistKey → artifacts[]) */
export function groupArtifactsByTaskChecklist(artifacts) {
  const map = new Map();
  for (const a of artifacts || []) {
    const tid = a.task_id;
    if (!tid) continue;
    const ckKey = a.checklist_id ? String(a.checklist_id) : '_task';
    if (!map.has(tid)) map.set(tid, new Map());
    const inner = map.get(tid);
    if (!inner.has(ckKey)) inner.set(ckKey, []);
    inner.get(ckKey).push(a);
  }
  return map;
}

function buildTaskChecklistGroups(task, taskArts) {
  if (!taskArts?.size) return [];
  const checklist = normalizeCrmChecklist(task?.checklist);
  const groups = [];

  const taskLevel = sortArtifacts(taskArts.get('_task') || []);
  if (taskLevel.length) {
    groups.push({ checklistId: '_task', checklistTitle: null, artifacts: taskLevel });
  }

  for (const ck of checklist) {
    const ckArts = sortArtifacts(taskArts.get(String(ck.id)) || []);
    if (ckArts.length) {
      groups.push({ checklistId: ck.id, checklistTitle: ck.title, artifacts: ckArts });
    }
  }

  for (const [ckKey, arts] of taskArts) {
    if (ckKey === '_task') continue;
    if (checklist.some((c) => String(c.id) === ckKey)) continue;
    const sorted = sortArtifacts(arts);
    if (sorted.length) {
      groups.push({
        checklistId: ckKey,
        checklistTitle: sorted[0]?.checklist_title || ckKey,
        artifacts: sorted,
      });
    }
  }

  return groups;
}

/**
 * @returns {{ sections: Array, totalCount: number }}
 */
export function buildCrmTaskDocumentSections({
  tasks = [],
  artifacts = [],
  pipelineStages = [],
  leadCurrentStageId = null,
  leadType = 'lead',
}) {
  const stages = getDocumentStageList({ leadType, pipelineStages });
  const artByTask = groupArtifactsByTaskChecklist(artifacts);

  const taskById = new Map((tasks || []).map((t) => [t.id, t]));
  const tasksByStage = {};
  stages.forEach((s) => { tasksByStage[s.slug] = []; });

  for (const t of tasks || []) {
    const key = resolveTaskStageKey(t, pipelineStages, leadCurrentStageId);
    if (!tasksByStage[key]) tasksByStage[key] = [];
    tasksByStage[key].push(t);
  }
  for (const k of Object.keys(tasksByStage)) {
    tasksByStage[k].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  }

  const placedTaskIds = new Set();
  const sections = [];

  for (const stage of stages) {
    const stageTasks = tasksByStage[stage.slug] || [];
    const taskNodes = [];

    for (const task of stageTasks) {
      const taskArts = artByTask.get(task.id);
      const checklistGroups = buildTaskChecklistGroups(task, taskArts);
      if (!checklistGroups.length) continue;
      placedTaskIds.add(task.id);
      taskNodes.push({
        taskId: task.id,
        taskTitle: task.title,
        orderIndex: task.order_index ?? 0,
        checklistGroups,
        fileCount: checklistGroups.reduce((n, g) => n + g.artifacts.filter((a) => !isNoteArtifact(a)).length, 0),
        noteCount: checklistGroups.reduce((n, g) => n + g.artifacts.filter(isNoteArtifact).length, 0),
      });
    }

    if (!taskNodes.length) continue;
    const allArts = taskNodes.flatMap((t) => t.checklistGroups.flatMap((g) => g.artifacts));
    sections.push({
      stageKey: stage.slug,
      stageLabel: stage.label,
      stageIcon: stage.icon,
      stageColor: stage.color,
      orderIndex: stage.order_index ?? 0,
      fileCount: allArts.filter((a) => !isNoteArtifact(a)).length,
      noteCount: allArts.filter(isNoteArtifact).length,
      tasks: taskNodes,
    });
  }

  // Nhiệm vụ còn file nhưng không nằm trong danh sách tasks (đã xóa / lead con)
  const orphanTasks = [];
  for (const [taskId, taskArts] of artByTask) {
    if (placedTaskIds.has(taskId)) continue;
    const task = taskById.get(taskId);
    const checklistGroups = buildTaskChecklistGroups(
      task || { id: taskId, title: taskArts.get('_task')?.[0]?.task_title, checklist: [] },
      taskArts,
    );
    if (!checklistGroups.length) continue;
    orphanTasks.push({
      taskId,
      taskTitle: task?.title || checklistGroups[0]?.artifacts[0]?.task_title || 'Nhiệm vụ',
      orderIndex: task?.order_index ?? 9999,
      checklistGroups,
      fileCount: checklistGroups.reduce((n, g) => n + g.artifacts.filter((a) => !isNoteArtifact(a)).length, 0),
      noteCount: checklistGroups.reduce((n, g) => n + g.artifacts.filter(isNoteArtifact).length, 0),
    });
  }

  if (orphanTasks.length) {
    const allArts = orphanTasks.flatMap((t) => t.checklistGroups.flatMap((g) => g.artifacts));
    sections.push({
      stageKey: '_other',
      stageLabel: 'Khác',
      stageIcon: '📋',
      stageColor: '#6B7280',
      orderIndex: 99999,
      fileCount: allArts.filter((a) => !isNoteArtifact(a)).length,
      noteCount: allArts.filter(isNoteArtifact).length,
      tasks: orphanTasks.sort((a, b) => a.orderIndex - b.orderIndex),
    });
  }

  const totalCount = (artifacts || []).length;
  return { sections, totalCount };
}

/** Nhóm lead_documents (đồng bộ từ NV) — giai đoạn → NV → checklist */
export function buildCrmLeadDocTaskSections(docs, taskMetaMap = {}, stageSlugLabelMap = {}, staticLabels = {}) {
  const fromTask = (docs || []).filter(
    (d) => !!(d?.source_attachment_id || d?.source_crm_task_id || d?.is_from_task),
  );

  const stageBuckets = new Map();
  for (const doc of fromTask) {
    const taskId = doc.source_crm_task_id;
    const meta = taskId ? taskMetaMap[taskId] : null;
    const stageSlug = doc.crm_stage_slug || meta?.stage_slug || '_other';
    const taskKey = taskId ? String(taskId) : `_att_${doc.source_attachment_id || doc.id}`;
    const ckKey = doc.source_checklist_id ? String(doc.source_checklist_id) : '_task';

    if (!stageBuckets.has(stageSlug)) stageBuckets.set(stageSlug, new Map());
    const taskMap = stageBuckets.get(stageSlug);
    if (!taskMap.has(taskKey)) {
      taskMap.set(taskKey, {
        taskKey,
        taskTitle: meta?.title || doc.crm_task_title || 'Nhiệm vụ',
        taskOrder: meta?.order_index ?? 0,
        checklistMap: new Map(),
      });
    }
    const taskNode = taskMap.get(taskKey);
    if (!taskNode.checklistMap.has(ckKey)) {
      let ckTitle = null;
      if (ckKey !== '_task' && meta?.checklist) {
        const ck = normalizeCrmChecklist(meta.checklist).find((c) => String(c.id) === ckKey);
        ckTitle = ck?.title || null;
      }
      taskNode.checklistMap.set(ckKey, { checklistId: ckKey, checklistTitle: ckTitle, docs: [] });
    }
    taskNode.checklistMap.get(ckKey).docs.push(doc);
  }

  const stageOrder = (slug) => {
    const meta = Object.values(taskMetaMap).find((m) => m.stage_slug === slug);
    if (Number.isFinite(meta?.stage_order_index)) return meta.stage_order_index;
    return 9999;
  };

  const sections = [...stageBuckets.entries()]
    .sort(([a], [b]) => stageOrder(a) - stageOrder(b) || String(a).localeCompare(String(b)))
    .map(([stageSlug, taskMap]) => {
      const tasks = [...taskMap.values()]
        .sort((a, b) => a.taskOrder - b.taskOrder || a.taskTitle.localeCompare(b.taskTitle, 'vi'))
        .map((task) => {
          const checklistGroups = [...task.checklistMap.entries()]
            .sort(([a], [b]) => (a === '_task' ? -1 : b === '_task' ? 1 : a.localeCompare(b)))
            .map(([, g]) => ({
              ...g,
              docs: [...g.docs].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)),
            }));
          return { ...task, checklistGroups };
        });
      const stageLabel = resolveCrmPipelineStageLabel(stageSlug, {
        slugLabelMap: stageSlugLabelMap,
        taskMetaMap,
        staticLabels,
      });
      const fileCount = tasks.reduce(
        (n, t) => n + t.checklistGroups.reduce((m, g) => m + g.docs.length, 0),
        0,
      );
      return { stageSlug, stageLabel, tasks, fileCount };
    });

  const manual = (docs || []).filter(
    (d) => !(d?.source_attachment_id || d?.source_crm_task_id || d?.is_from_task),
  );
  manual.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  return { sections, manualDocs: manual };
}

export { DEAL_STAGES, SX_ORDER_STAGES, LEAD_STAGES };
