/**
 * Đồng bộ chip CRM/SX/VC với «Bộ Quy Trình» (flowAssignments).
 *
 * - CRM: SoR chip + danh sách NV = khối KD (flow assignment).
 * - SX / VC: danh sách NV + đếm tiến độ = công việc module Xưởng
 *   (workshop_area production / logistics từ deal bundle). Chỉ gắn
 *   công ty / người phụ trách từ flow assignment — không thay danh sách NV.
 */

const PIPE_KEY = {
  crm: 'crm',
  production: 'sx',
  sx: 'sx',
  logistics: 'vc',
  vc: 'vc',
};

const STATUS_LABEL = {
  done: 'Hoàn thành',
  in_progress: 'Đang làm',
  pending: 'Chờ',
};

const STATUS_COLOR = {
  done: '#059669',
  in_progress: '#2563eb',
  pending: '#94a3b8',
};

function assignmentByModule(flowAssignments) {
  const map = {};
  for (const a of flowAssignments || []) {
    const key = PIPE_KEY[a.module_key] || null;
    if (!key) continue;
    const prev = map[key];
    if (!prev) {
      map[key] = a;
      continue;
    }
    const prevScore = (prev.tasks_total || 0) * 10 + (prev.progress || 0);
    const nextScore = (a.tasks_total || 0) * 10 + (a.progress || 0);
    if (nextScore > prevScore) map[key] = a;
  }
  return map;
}

function statusLabelOf(a) {
  const st = String(a?.status || '');
  if (STATUS_LABEL[st]) return STATUS_LABEL[st];
  if ((a?.tasks_total || 0) > 0 && (a?.tasks_completed || 0) >= a.tasks_total) return 'Hoàn thành';
  if ((a?.tasks_completed || 0) > 0) return 'Đang làm';
  return a?.division?.name || a?.division?.short_name || 'Chưa có';
}

function flowMeta(a) {
  if (!a) return null;
  return {
    id: a.id,
    division: a.division,
    company: a.display_company,
    person: a.responsible_user,
    status: a.status,
    progress: a.progress,
  };
}

/**
 * @param {object|null} bundle — /management/by-project
 * @param {object[]} flowAssignments — project.flowAssignments
 */
export function overlayDealBundleWithFlowAssignments(bundle, flowAssignments) {
  if (!bundle) return null;
  const byMod = assignmentByModule(flowAssignments);
  if (!Object.keys(byMod).length) return bundle;

  const overlayPipeCrm = (pipe) => {
    const a = byMod.crm;
    if (!a) return pipe;
    const total = Number(a.tasks_total) || 0;
    const done = Number(a.tasks_completed) || 0;
    if (total <= 0 && !(pipe?.tasks_total > 0)) {
      return {
        ...pipe,
        name: statusLabelOf(a),
        color: STATUS_COLOR[a.status] || pipe?.color,
        company_label: a.display_company?.short_name || a.display_company?.name || null,
        person: a.responsible_user || null,
      };
    }
    if (total <= 0) return pipe;
    const pct = a.progress != null ? a.progress : Math.round((done / total) * 100);
    return {
      ...pipe,
      name: statusLabelOf(a),
      color: STATUS_COLOR[a.status] || pipe?.color,
      tasks_done: done,
      tasks_total: total,
      pct,
      empty: false,
      company_label: a.display_company?.short_name || a.display_company?.name || null,
      person: a.responsible_user || null,
      from_flow_assignment: true,
    };
  };

  /** SX/VC: giữ đếm NV xưởng; chỉ gắn công ty / người từ khối. */
  const overlayPipeWorkshop = (pipeKey, pipe) => {
    const a = byMod[pipeKey];
    if (!a) return pipe;
    const sec = bundle.sections?.[pipeKey];
    const st = sec?.stats?.tasks;
    const total = Number(st?.total) || Number(pipe?.tasks_total) || 0;
    const done = Number(st?.done) || Number(pipe?.tasks_done) || 0;
    const pct = total > 0 ? Math.round((done / total) * 100) : (pipe?.pct || 0);
    return {
      ...pipe,
      ...(total > 0
        ? {
          tasks_done: done,
          tasks_total: total,
          pct,
          empty: false,
        }
        : {}),
      company_label: a.display_company?.short_name || a.display_company?.name || pipe?.company_label || null,
      person: a.responsible_user || pipe?.person || null,
      from_workshop_tasks: true,
    };
  };

  const pipelines = {
    ...bundle.pipelines,
    crm: overlayPipeCrm(bundle.pipelines?.crm),
    sx: overlayPipeWorkshop('sx', bundle.pipelines?.sx),
    vc: overlayPipeWorkshop('vc', bundle.pipelines?.vc),
  };

  const overlaySectionCrm = () => {
    const a = byMod.crm;
    const sec = bundle.sections?.crm;
    if (!a || !sec) return sec;
    const total = Number(a.tasks_total) || 0;
    if (total <= 0) return sec;
    const done = Number(a.tasks_completed) || 0;
    const mappedTasks = Array.isArray(a.tasks) && a.tasks.length
      ? a.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        deadline: t.due_date || t.deadline || null,
        assignee_id: t.assignee_id || t.assignee?.id || null,
        assignee: t.assignee || null,
        assignee_name: t.assignee?.full_name || null,
        stage_name: t.stage?.name || statusLabelOf(a),
        stage_slug: t.stage?.slug || a.status || 'crm',
        href: (t.id && (bundle.project?.id || a.project_id))
          ? `/projects/${bundle.project?.id || a.project_id}?tab=aggregate`
          : null,
        source: 'project_flow',
      }))
      : sec.tasks;
    return {
      ...sec,
      tasks: mappedTasks,
      stats: {
        ...sec.stats,
        tasks: { done, total },
      },
      flow_assignment: flowMeta(a),
    };
  };

  /** SX/VC: giữ NV module; gắn meta khối (không đổi danh sách). */
  const keepWorkshopSection = (secKey) => {
    const sec = bundle.sections?.[secKey];
    if (!sec) return sec;
    const a = byMod[secKey];
    if (!a) return sec;
    return {
      ...sec,
      flow_assignment: flowMeta(a),
    };
  };

  const sections = {
    ...bundle.sections,
    crm: overlaySectionCrm(),
    sx: keepWorkshopSection('sx'),
    vc: keepWorkshopSection('vc'),
  };

  const owners = {
    ...(bundle.overview?.owners || {}),
  };
  if (byMod.crm?.responsible_user) owners.crm = byMod.crm.responsible_user;
  if (byMod.sx?.responsible_user) owners.sx = byMod.sx.responsible_user;
  if (byMod.vc?.responsible_user) owners.vc = byMod.vc.responsible_user;

  const taskSum = ['crm', 'sx', 'vc'].reduce((acc, k) => {
    const st = sections?.[k]?.stats?.tasks;
    if (st?.total) {
      acc.done += st.done || 0;
      acc.total += st.total || 0;
    }
    return acc;
  }, { done: 0, total: 0 });

  return {
    ...bundle,
    pipelines,
    sections,
    totals: {
      ...bundle.totals,
      tasks: taskSum.total > 0 ? taskSum.total : bundle.totals?.tasks,
      tasks_done: taskSum.total > 0 ? taskSum.done : bundle.totals?.tasks_done,
    },
    overview: bundle.overview
      ? { ...bundle.overview, owners }
      : bundle.overview,
    flow_assignments_overlay: true,
  };
}
