/**
 * KPI Dashboard VC/LĐ — tick dashboard_kpi trên cột; chưa tick thì suy từ tên / cờ cột.
 * Khớp backend/src/helpers/vcOverviewKpis.js
 */

const INTAKE_BUCKET = 'delivery_pending';
const DASHBOARD_KPI_KEYS = new Set(['shipping', 'installing', 'warranty', 'completed']);

export const VC_DASHBOARD_KPI_TICKS = [
  { key: 'shipping', label: 'Đang VC', title: 'Đếm vào ô «Đang vận chuyển» trên Dashboard' },
  { key: 'installing', label: 'Đang LĐ', title: 'Đếm vào ô «Đang lắp đặt» trên Dashboard' },
  { key: 'warranty', label: 'BH', title: 'Đếm vào ô «Bảo hành» trên Dashboard' },
  { key: 'completed', label: 'Xong', title: 'Đếm vào ô «Hoàn thành» trên Dashboard' },
];

function colName(stage) {
  return String(stage?.name || '').toLowerCase();
}

function colSlug(stage) {
  return String(stage?.bucket_slug || stage?.slug || stage?.workflow_stage?.slug || '').toLowerCase();
}

function explicitDashboardKpi(stage) {
  const raw = String(stage?.dashboard_kpi || '').trim();
  return DASHBOARD_KPI_KEYS.has(raw) ? raw : null;
}

function isIntakeCol(stage) {
  if (stage?.bucket_slug === INTAKE_BUCKET) return true;
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

function isInstallCol(stage) {
  if (!stage) return false;
  const name = colName(stage);
  const wfSlug = String(stage.slug || stage.workflow_stage?.slug || '').toLowerCase();
  if (
    name.includes('đang vận chuyển')
    || name.includes('dang van chuyen')
    || wfSlug === 'delivery'
    || wfSlug === 'shipping'
  ) return false;
  if (String(stage.crm_sync_type || '').toLowerCase() === 'installation') return true;
  const bucket = String(stage.bucket_slug || '').toLowerCase();
  return (
    bucket.includes('install')
    || wfSlug.includes('install')
    || name.includes('lắp')
    || name.includes('lap dat')
    || name.includes('lắp đặt')
  );
}

function isDeliveredCol(stage) {
  const name = colName(stage);
  const slug = colSlug(stage);
  return slug === 'delivered' || slug === 'delivery_done'
    || name.includes('đã giao') || name.includes('da giao') || name.includes('giao xong');
}

function isShippingCol(stage) {
  if (isIntakeCol(stage) || isInstallCol(stage) || isDeliveredCol(stage)) return false;
  const name = colName(stage);
  const slug = colSlug(stage);
  return (
    name.includes('đang vận chuyển') || name.includes('dang van chuyen')
    || name.includes('đang giao') || name.includes('dang giao')
    || slug === 'delivery' || slug === 'shipping'
    || (name.includes('vận chuyển') && !name.includes('chờ') && !name.includes('bàn giao') && !name.includes('đã giao'))
  );
}

function isWarrantyCol(stage) {
  const name = colName(stage);
  const slug = colSlug(stage);
  return (
    slug === 'customer-care' || slug.includes('warranty') || slug.includes('issue')
    || name.includes('bảo hành') || name.includes('bao hanh')
    || name.includes('có vấn đề') || name.includes('co van de')
    || name.includes('vấn đề') || name.includes('van de')
    || name.includes('phát sinh') || name.includes('phat sinh')
  );
}

function isAcceptanceCol(stage) {
  if (isWarrantyCol(stage) || isDeliveredCol(stage) || isIntakeCol(stage)) return false;
  const name = colName(stage);
  const slug = colSlug(stage);
  return (
    slug.includes('acceptance') || slug.includes('nghiem') || slug.includes('handover')
    || name.includes('nghiệm thu') || name.includes('nghiem thu')
    || (name.includes('bàn giao') && !name.includes('chờ') && !name.includes('chuyển'))
    || (name.includes('ban giao') && !name.includes('cho') && !name.includes('chuyen'))
  );
}

function isDoneCol(stage) {
  const name = colName(stage);
  const slug = String(stage?.bucket_slug || stage?.slug || '').toLowerCase();
  return (
    slug === 'completed' || slug === 'done' || slug === 'install_completed'
    || name.includes('hoàn thành') || name.includes('hoàn tất')
    || name.includes('hoàn thiện') || name.includes('hoan thien')
  );
}

export function kpiBucketForStage(stage) {
  const explicit = explicitDashboardKpi(stage);
  if (explicit) return explicit;
  if (isDoneCol(stage)) return 'completed';
  if (isAcceptanceCol(stage)) return 'acceptance';
  if (isWarrantyCol(stage)) return 'warranty';
  if (isIntakeCol(stage)) return 'intake';
  if (isDeliveredCol(stage)) return 'delivered';
  if (isInstallCol(stage)) return 'installing';
  if (isShippingCol(stage)) return 'shipping';
  return 'shipping';
}

export function vcColumnDashboardKpiKey(stage) {
  const bucket = kpiBucketForStage(stage);
  if (bucket === 'completed') return 'completed';
  if (bucket === 'warranty') return 'warranty';
  if (bucket === 'installing' || bucket === 'acceptance') return 'installing';
  return 'shipping';
}

/** Cột không theo dõi deadline: tích Tắt hạn hoặc ô Dashboard «Xong». */
export function isVcPipelineStageNoDeadline(stage) {
  if (!stage) return false;
  if (stage.clears_deadline) return true;
  return explicitDashboardKpi(stage) === 'completed';
}
