/**
 * KPI Tổng quan VC/LĐ — đếm theo cột Kanban ở server.
 *
 * Phải khớp 1:1 với vc-mobile/src/lib/vcBoardKpis.ts (computeVcBoardKpis)
 * để Tổng quan mobile không cần tải toàn bộ danh sách dự án chỉ để đếm.
 */

const INTAKE_BUCKET = 'delivery_pending';

function colName(stage) {
  return String(stage?.name || '').toLowerCase();
}

/** bucket_slug ưu tiên, rồi slug cột, rồi slug workflow stage. */
function colSlug(stage) {
  return String(
    stage?.bucket_slug || stage?.slug || stage?.workflow_stage?.slug || '',
  ).toLowerCase();
}

/** Cột Lắp đặt — mirror isInstallVcStage (mobile productionFilters.ts). */
function isInstallCol(stage) {
  if (!stage) return false;
  const name = colName(stage);
  const bucket = String(stage.bucket_slug || '').toLowerCase();
  const wfSlug = String(stage.slug || stage.workflow_stage?.slug || '').toLowerCase();

  if (
    name.includes('đang vận chuyển')
    || name.includes('dang van chuyen')
    || wfSlug === 'delivery'
    || wfSlug === 'shipping'
  ) {
    return false;
  }
  if (String(stage.crm_sync_type || '').toLowerCase() === 'installation') return true;
  return (
    bucket.includes('install')
    || wfSlug.includes('install')
    || name.includes('lắp')
    || name.includes('lap dat')
    || name.includes('lắp đặt')
  );
}

function isIntakeCol(stage) {
  if (stage?.bucket_slug === INTAKE_BUCKET) return true;
  const id = String(stage?.id || '');
  if (id.startsWith('__vc_intake') || id === '__vc_intake') return true;
  const name = colName(stage);
  return (
    name.includes('chờ vc')
    || name.includes('chờ vận')
    || name.includes('chờ xác nhận')
    || name.includes('cho xac nhan')
    || name.includes('tiếp nhận')
    || name.includes('tiep nhan')
  );
}

function isDeliveredCol(stage) {
  const name = colName(stage);
  const slug = colSlug(stage);
  return (
    slug === 'delivered'
    || slug === 'delivery_done'
    || name.includes('đã giao')
    || name.includes('da giao')
    || name.includes('giao xong')
  );
}

function isShippingCol(stage) {
  if (isIntakeCol(stage) || isInstallCol(stage) || isDeliveredCol(stage)) return false;
  const name = colName(stage);
  const slug = colSlug(stage);
  return (
    name.includes('đang vận chuyển')
    || name.includes('dang van chuyen')
    || name.includes('đang giao')
    || name.includes('dang giao')
    || slug === 'delivery'
    || slug === 'shipping'
    || (name.includes('vận chuyển') && !name.includes('chờ') && !name.includes('bàn giao') && !name.includes('đã giao'))
  );
}

function isWarrantyCol(stage) {
  const name = colName(stage);
  const slug = colSlug(stage);
  return (
    slug === 'customer-care'
    || slug.includes('warranty')
    || slug.includes('issue')
    || slug.includes('phat_sinh')
    || slug.includes('phatsinh')
    || name.includes('bảo hành')
    || name.includes('bao hanh')
    || name.includes('có vấn đề')
    || name.includes('co van de')
    || name.includes('vấn đề')
    || name.includes('van de')
    || name.includes('phát sinh')
    || name.includes('phat sinh')
  );
}

function isAcceptanceCol(stage) {
  if (isWarrantyCol(stage) || isDeliveredCol(stage) || isIntakeCol(stage)) return false;
  const name = colName(stage);
  const slug = colSlug(stage);
  return (
    slug.includes('acceptance')
    || slug.includes('nghiem')
    || slug.includes('handover')
    || name.includes('nghiệm thu')
    || name.includes('nghiem thu')
    || (name.includes('bàn giao') && !name.includes('chờ') && !name.includes('chuyển'))
    || (name.includes('ban giao') && !name.includes('cho') && !name.includes('chuyen'))
  );
}

function isDoneCol(stage) {
  const name = colName(stage);
  const slug = String(stage?.bucket_slug || stage?.slug || '').toLowerCase();
  return (
    slug === 'completed'
    || name.includes('hoàn thành')
    || name.includes('hoàn tất')
    || name.includes('hoàn thiện')
    || name.includes('hoan thien')
  );
}

/** Phân loại cột → bucket KPI. Mirror kpiBucketForStage (mobile). */
function kpiBucketForStage(stage) {
  if (isDoneCol(stage)) return 'completed';
  if (isAcceptanceCol(stage)) return 'acceptance';
  if (isWarrantyCol(stage)) return 'warranty';
  if (isIntakeCol(stage)) return 'intake';
  if (isDeliveredCol(stage)) return 'delivered';
  if (isInstallCol(stage)) return 'installing';
  if (isShippingCol(stage)) return 'shipping';
  return 'shipping';
}

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function projectIsDeadlineOverdue(project, todayMs) {
  if (String(project?.status || '') === 'completed') return false;
  const raw = project?.deadline;
  if (!raw) return false;
  const t = new Date(raw);
  if (Number.isNaN(t.getTime())) return false;
  return startOfLocalDay(t).getTime() < startOfLocalDay(new Date(todayMs)).getTime();
}

/**
 * Đếm KPI từ danh sách dự án đã enrich (có vc_kanban_column_id trỏ cột hiện hành)
 * + danh sách cột pipeline VC của công ty đang xem.
 */
function computeVcOverviewKpis(projects, stages = []) {
  const nowMs = Date.now();
  const list = Array.isArray(projects) ? projects : [];
  const cols = Array.isArray(stages) ? stages : [];

  let intake = 0;
  let shipping = 0;
  let delivered = 0;
  let installing = 0;
  let warranty = 0;
  let acceptance = 0;
  let completed = 0;
  let overdue = 0;
  let totalShipping = 0;
  let totalInstall = 0;

  const stageById = new Map(cols.map((s) => [String(s.id), s]));

  for (const p of list) {
    if (projectIsDeadlineOverdue(p, nowMs)) overdue += 1;

    const colId = String(p.vc_kanban_column_id || '');
    const stage = colId && cols.length ? stageById.get(colId) : undefined;

    if (!stage) {
      // Không map được cột → suy theo status (giống nhánh fallback của client).
      const status = String(p.status || '');
      if (p.vc_intake) { intake += 1; totalShipping += 1; }
      else if (status === 'completed') { completed += 1; totalShipping += 1; }
      else if (status === 'warranty') { warranty += 1; totalShipping += 1; }
      else if (status === 'installing') { installing += 1; totalInstall += 1; }
      else { shipping += 1; totalShipping += 1; }
      continue;
    }

    if (isInstallCol(stage)) totalInstall += 1;
    else totalShipping += 1;

    const bucket = kpiBucketForStage(stage);
    if (bucket === 'completed') completed += 1;
    else if (bucket === 'acceptance') acceptance += 1;
    else if (bucket === 'warranty') warranty += 1;
    else if (bucket === 'intake') intake += 1;
    else if (bucket === 'delivered') delivered += 1;
    else if (bucket === 'installing') installing += 1;
    else shipping += 1;
  }

  return {
    total: list.length,
    totalShipping,
    totalInstall,
    intake,
    shipping,
    delivered,
    installing,
    warranty,
    acceptance,
    inProgress: shipping + installing,
    completed,
    overdue,
  };
}

module.exports = {
  computeVcOverviewKpis,
  kpiBucketForStage,
  isInstallCol,
  projectIsDeadlineOverdue,
};
