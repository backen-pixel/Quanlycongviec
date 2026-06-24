import { useMemo, useId } from 'react';
import { Factory, Layers, Sparkles } from 'lucide-react';

const RING_SIZE = 88;
const STROKE = 5;

const THEMES = {
  crm: {
    gradient: ['#8b5cf6', '#6366f1', '#06b6d4'],
    track: 'text-violet-100/90',
    pctText: 'from-violet-700 via-indigo-600 to-cyan-600',
    pctSuffix: 'text-violet-500/80',
    shell: 'border-violet-200/70 bg-gradient-to-br from-violet-50/90 via-white to-cyan-50/70 shadow-violet-500/8',
    badge: 'border-violet-200/70 bg-white/70 text-violet-700',
    badgeIcon: 'text-violet-500',
    barTrack: 'bg-violet-100/80',
    barShimmer: 'crm-loader-shimmer-bar',
    company: 'text-violet-700/90',
    orbit: 'crm-loader-orbit-ring',
    skeletonDot: 'from-violet-400 to-indigo-500',
    skeletonCard: 'from-slate-100 via-violet-50 to-slate-100',
    title: 'Đang dựng Dashboard CRM',
    badgeLabel: (pipelineType) => (pipelineType === 'deal' ? 'Deal pipeline' : 'Lead pipeline'),
    skeletonCols: (pipelineType) => (pipelineType === 'deal'
      ? ['Mới', 'Báo giá', 'Thương thảo', 'Thắng']
      : ['Mới', 'Liên hệ', 'Tư vấn', 'Báo giá', 'Chốt']),
  },
  production: {
    gradient: ['#059669', '#0d9488', '#2563eb'],
    track: 'text-emerald-100/90',
    pctText: 'from-emerald-700 via-teal-600 to-blue-600',
    pctSuffix: 'text-emerald-500/80',
    shell: 'border-emerald-200/70 bg-gradient-to-br from-emerald-50/90 via-white to-blue-50/70 shadow-emerald-500/8',
    badge: 'border-emerald-200/70 bg-white/70 text-emerald-800',
    badgeIcon: 'text-emerald-600',
    barTrack: 'bg-emerald-100/80',
    barShimmer: 'sx-loader-shimmer-bar',
    company: 'text-emerald-800/90',
    orbit: 'sx-loader-orbit-ring',
    skeletonDot: 'from-emerald-400 to-teal-500',
    skeletonCard: 'from-slate-100 via-emerald-50 to-slate-100',
    title: 'Đang dựng Dashboard Sản xuất',
    badgeLabel: () => 'Pipeline xưởng',
    skeletonCols: () => ['Chờ vào xưởng', 'Đang SX', 'Lắp đặt', 'Nghiệm thu', 'Hoàn thành'],
  },
};

function clampProgress(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function getLoadingPhase(progress, variant, pipelineType) {
  const pct = clampProgress(progress);
  if (variant === 'production') {
    if (pct >= 96) return 'Sẵn sàng — mở Kanban xưởng…';
    if (pct >= 72) return 'Hoàn thiện KPI & bộ lọc…';
    if (pct >= 48) return 'Đồng bộ dự án & cột pipeline…';
    if (pct >= 22) return 'Kết nối pipeline sản xuất…';
    return 'Khởi tạo không gian xưởng…';
  }
  const entity = pipelineType === 'deal' ? 'deal' : 'lead';
  if (pct >= 96) return 'Sẵn sàng — mở Kanban…';
  if (pct >= 72) return 'Hoàn thiện bộ lọc & KPI…';
  if (pct >= 48) return `Đồng bộ ${entity} & giai đoạn pipeline…`;
  if (pct >= 22) return 'Kết nối pipeline CRM…';
  return 'Khởi tạo không gian làm việc…';
}

function ProgressRing({
  progress,
  size = RING_SIZE,
  stroke = STROKE,
  theme,
  className = '',
}) {
  const uid = useId().replace(/:/g, '');
  const gradientId = `dash-loader-ring-${uid}`;
  const glowId = `dash-loader-glow-${uid}`;
  const pct = clampProgress(progress);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          {theme.gradient.map((color, i) => (
            <stop key={color} offset={`${(i / (theme.gradient.length - 1)) * 100}%`} stopColor={color} />
          ))}
        </linearGradient>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className={theme.track}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        filter={`url(#${glowId})`}
        className="transition-[stroke-dashoffset] duration-500 ease-out"
      />
    </svg>
  );
}

function KanbanSkeletonPreview({ theme, columns }) {
  return (
    <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 px-0.5">
      {columns.map((label, i) => (
        <div
          key={label}
          className="dash-loader-skeleton-col rounded-lg border border-white/60 bg-white/45 backdrop-blur-sm p-2 shadow-sm"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <div className="flex items-center gap-1 mb-2">
            <span className={`h-1.5 w-1.5 rounded-full bg-gradient-to-br ${theme.skeletonDot} opacity-80`} />
            <span className="text-[9px] font-semibold text-slate-500 truncate">{label}</span>
          </div>
          <div className="space-y-1.5">
            {[0, 1].map((row) => (
              <div
                key={row}
                className={`dash-loader-skeleton-card h-7 rounded-md bg-gradient-to-r ${theme.skeletonCard}`}
                style={{ animationDelay: `${(i * 2 + row) * 80}ms` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Loader dashboard — CRM hoặc Sản xuất */
export function DashboardLoader({
  progress = 0,
  variant = 'crm',
  pipelineType = 'lead',
  companyName = '',
  className = '',
  tourId,
}) {
  const theme = THEMES[variant] || THEMES.crm;
  const pct = clampProgress(progress);
  const phase = useMemo(
    () => getLoadingPhase(pct, variant, pipelineType),
    [pct, variant, pipelineType],
  );
  const columns = theme.skeletonCols(pipelineType);
  const BadgeIcon = variant === 'production' ? Factory : Sparkles;

  return (
    <div
      data-tour={tourId || (variant === 'crm' ? 'crm-loading' : 'sx-loading')}
      className={`relative overflow-hidden rounded-xl border shadow-lg ring-1 ring-white/70 ${theme.shell} ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={`Đang tải ${pct}%`}
    >
      <div className={`dash-loader-orb dash-loader-orb-a dash-loader-orb-${variant}`} aria-hidden />
      <div className={`dash-loader-orb dash-loader-orb-b dash-loader-orb-${variant}`} aria-hidden />

      <div className="relative px-4 py-6 sm:px-6 sm:py-7">
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-4 dash-loader-float">
            <div className={`absolute inset-0 rounded-full ${theme.orbit} opacity-60`} aria-hidden />
            <ProgressRing progress={pct} theme={theme} />
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className={`text-2xl font-black tabular-nums tracking-tight bg-gradient-to-br ${theme.pctText} bg-clip-text text-transparent`}>
                {pct}
              </span>
              <span className={`text-[9px] font-bold uppercase tracking-[0.18em] ${theme.pctSuffix} -mt-0.5`}>%</span>
            </div>
          </div>

          <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold shadow-sm backdrop-blur-sm mb-2 ${theme.badge}`}>
            <BadgeIcon className={`h-3 w-3 ${theme.badgeIcon}`} aria-hidden />
            {theme.badgeLabel(pipelineType)}
          </div>

          <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight mb-0.5">
            {theme.title}
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 max-w-sm leading-relaxed transition-all duration-300">
            {phase}
          </p>
          {companyName ? (
            <p className={`inline-flex items-center gap-1 text-[11px] font-medium mt-1.5 ${theme.company}`}>
              <Layers className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
              {companyName}
            </p>
          ) : null}

          <div className={`w-full max-w-[16rem] mt-4 h-1 rounded-full overflow-hidden ${theme.barTrack}`}>
            <div
              className={`h-full rounded-full transition-[width] duration-500 ease-out ${theme.barShimmer}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <KanbanSkeletonPreview theme={theme} columns={columns} />
      </div>
    </div>
  );
}

/** Loader gọn — header / đồng bộ ngầm */
export function DashboardLoaderCompact({
  progress = 0,
  label = 'Đồng bộ',
  variant = 'crm',
}) {
  const theme = THEMES[variant] || THEMES.crm;
  const pct = clampProgress(progress);
  const shell = variant === 'production'
    ? 'border-emerald-200/80 bg-gradient-to-r from-emerald-50/95 to-teal-50/95'
    : 'border-violet-200/90 bg-gradient-to-r from-violet-50/95 to-indigo-50/95';
  const text = variant === 'production' ? 'text-emerald-800' : 'text-violet-800';
  const pctText = variant === 'production' ? 'text-emerald-700' : 'text-violet-700';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border pl-1 pr-2 py-0.5 shadow-sm backdrop-blur-sm ${shell}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={`${label} ${pct}%`}
    >
      <span className="relative inline-flex shrink-0">
        <ProgressRing progress={pct} size={24} stroke={2.5} theme={theme} />
        <span className={`absolute inset-0 flex items-center justify-center text-[7px] font-bold tabular-nums ${pctText}`}>
          {pct}
        </span>
      </span>
      <span className={`text-[10px] font-semibold whitespace-nowrap tabular-nums ${text}`}>
        {label}
      </span>
    </span>
  );
}

export function CrmDashboardLoader(props) {
  return <DashboardLoader {...props} variant="crm" tourId="crm-loading" />;
}

export function CrmDashboardLoaderCompact(props) {
  return <DashboardLoaderCompact {...props} variant="crm" />;
}
