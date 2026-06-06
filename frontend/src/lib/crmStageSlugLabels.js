/** Khớp backend crm.js — slug derive khi bộ mẫu gắn pipeline_stage_id. */
export function derivePlStageSlug(stageName, stageId) {
  const baseName = String(stageName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const shortId = String(stageId || '').slice(0, 8);
  return `pl_${baseName || 'stage'}_${shortId}`.slice(0, 60);
}

export function isPlDerivedStageSlug(slug) {
  return /^pl_.+_[a-f0-9]{8}$/i.test(String(slug || ''));
}

/** Nhãn giai đoạn CRM — ưu tiên tên cột pipeline, không hiện slug pl_* + uuid. */
export function resolveCrmPipelineStageLabel(stageSlug, {
  slugLabelMap = {},
  taskMetaMap = {},
  staticLabels = {},
} = {}) {
  if (!stageSlug || stageSlug === '_other') return '📋 Khác';
  const slug = String(stageSlug);
  if (staticLabels[slug]) return staticLabels[slug];
  if (slugLabelMap[slug]) return slugLabelMap[slug];

  const fromTask = Object.values(taskMetaMap || {}).find(
    (m) => m.stage_slug === slug && m.stage_name,
  );
  if (fromTask?.stage_name) return fromTask.stage_name;

  if (slug.startsWith('sx_')) {
    const inner = slug.replace(/^sx_/, '').replace(/[-_][a-f0-9]{8}$/i, '').replace(/_/g, ' ');
    return `🏭 ${inner}`;
  }

  if (isPlDerivedStageSlug(slug)) {
    const mid = slug.replace(/^pl_/i, '').replace(/_[a-f0-9]{8}$/i, '').replace(/_/g, ' ');
    return mid || slug;
  }

  return slug.replace(/_/g, ' ');
}

export function buildCrmStageSlugLabelMapFromTasks(tasks, pipelineStages = []) {
  const map = {};
  (tasks || []).forEach((t) => {
    if (t.stage_slug && t.pipeline_stage?.name) {
      map[t.stage_slug] = t.pipeline_stage.name;
    }
  });
  (pipelineStages || []).forEach((st) => {
    if (!st?.id || !st?.name) return;
    const derived = derivePlStageSlug(st.name, st.id);
    map[derived] = st.name;
    if (st.canonical_slug) map[st.canonical_slug] = st.name;
  });
  return map;
}
