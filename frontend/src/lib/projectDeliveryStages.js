/**
 * Map workflow stage slug → projects.status (legacy enum) khi kéo Kanban / chuyển stage.
 */

export const PROJECT_DELIVERY_STAGE_SLUGS = [
  'order',
  'design',
  'approve',
  'measure',
  'production',
  'materials',
  'delivery',
  'installation',
  'acceptance',
  'warranty',
];

const SLUG_TO_STATUS = {
  order: 'contract_signed',
  design: 'designing',
  approve: 'designing',
  measure: 'designing',
  production: 'producing',
  materials: 'producing',
  delivery: 'shipping',
  installation: 'installing',
  acceptance: 'completed',
  warranty: 'warranty',
  // legacy aliases
  consulting: 'consulting',
  quotation: 'quoting',
  contract: 'contract_signed',
  shipping: 'shipping',
  'customer-care': 'warranty',
};

const STATUS_TO_SLUG = {
  consulting: 'order',
  designing: 'design',
  quoting: 'design',
  contract_signed: 'order',
  producing: 'production',
  shipping: 'delivery',
  installing: 'installation',
  completed: 'acceptance',
  warranty: 'warranty',
  on_hold: 'order',
  new: 'order',
};

export function projectStatusForStageSlug(slug) {
  const s = String(slug || '').trim().toLowerCase();
  return SLUG_TO_STATUS[s] || 'producing';
}

/** Fallback cột khi project chưa có current_stage_id */
export function stageSlugForProjectStatus(status) {
  const s = String(status || '').trim().toLowerCase();
  return STATUS_TO_SLUG[s] || 'order';
}

export function resolveProjectKanbanStageId(project, stages) {
  if (!project || !Array.isArray(stages) || !stages.length) return null;
  if (project.current_stage_id) {
    const hit = stages.find((st) => String(st.id) === String(project.current_stage_id));
    if (hit) return hit.id;
  }
  if (project.current_stage?.slug) {
    const bySlug = stages.find((st) => st.slug === project.current_stage.slug);
    if (bySlug) return bySlug.id;
  }
  const mappedSlug = stageSlugForProjectStatus(project.status);
  const byMapped = stages.find((st) => st.slug === mappedSlug);
  if (byMapped) return byMapped.id;
  return stages[0]?.id || null;
}

const PERSON_KEY_BY_SLUG = {
  order: 'contract_person',
  design: 'design_person',
  approve: 'design_person',
  measure: 'design_person',
  production: 'production_person',
  materials: 'production_person',
  delivery: 'shipping_person',
  installation: 'installation_person',
  acceptance: 'care_person',
  warranty: 'care_person',
  consulting: 'consulting_person',
  quotation: 'quotation_person',
  contract: 'contract_person',
  shipping: 'shipping_person',
  'customer-care': 'care_person',
};

export function isProjectDeliveryStage(stage) {
  if (!stage?.is_active) return false;
  if (stage.company_id) return false;
  const slug = String(stage.slug || '');
  if (slug.startsWith('sx-sample-')) return false;
  return true;
}

/** Chuẩn hóa workflow_stages → shape stepper / advance modal */
export function mapStagesToProjectFlow(stages) {
  return (stages || []).map((s) => ({
    id: s.id,
    slug: s.slug,
    status: projectStatusForStageSlug(s.slug),
    label: s.name,
    personKey: PERSON_KEY_BY_SLUG[s.slug] || null,
    color: s.color,
  }));
}
