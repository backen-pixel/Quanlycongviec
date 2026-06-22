/**
 * Thanh vị trí — breadcrumb kiểu Google Drive (Drive của tôi › Root › Folder).
 */
import { ChevronRight, ChevronDown, ChevronLeft, Home } from 'lucide-react';

export function driveScopeHomeLabel(scope, root) {
  if (scope === 'user') return 'Drive của tôi';
  if (scope === 'company') return 'Drive công ty';
  if (scope === 'shared') {
    if (root?.shared_kind === 'shared_company') return 'Drive chung công ty';
    if (root?.shared_kind === 'shared_region') return 'Drive chung khu vực';
    if (root?.shared_kind === 'company_images') return 'Kho ảnh chung';
    return 'Drive chung module';
  }
  return 'Drive';
}

/** Thêm mục scope (Drive của tôi, …) trước root trong breadcrumb. */
export function enrichDriveBreadcrumb(chain, root) {
  if (!chain?.length) return [];
  if (chain[0]?.type === 'scope' || chain[0]?.type === 'view') return chain;
  const rootItem = chain.find((c) => c.type === 'root');
  const scope = root?.scope || rootItem?.scope;
  if (!scope || !rootItem) return chain;
  return [
    {
      type: 'scope',
      id: `scope-${scope}`,
      name: driveScopeHomeLabel(scope, root || rootItem),
      rootId: rootItem.id,
    },
    ...chain,
  ];
}

export default function DriveLocationBar({
  items = [],
  onNavigate,
  readOnly = false,
  className = '',
  canGoBack = false,
  canGoForward = false,
  onBack,
  onForward,
}) {
  if (!items.length && !canGoBack && !canGoForward) return null;

  const showNav = onBack || onForward;

  return (
    <div className={`shrink-0 border-b bg-[#f8f9fa] px-3 py-2 flex items-center gap-2 min-w-0 ${className}`}>
      {showNav && (
        <div className="flex items-center shrink-0 border border-slate-200 rounded-md overflow-hidden bg-white">
          <button
            type="button"
            onClick={onBack}
            disabled={!canGoBack}
            title="Quay lại"
            aria-label="Quay lại thư mục"
            className="h-8 w-8 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent transition"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={onForward}
            disabled={!canGoForward}
            title="Tiến tới"
            aria-label="Tiến tới thư mục"
            className="h-8 w-8 flex items-center justify-center text-slate-600 hover:bg-slate-50 border-l border-slate-200 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent transition"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
      {items.length > 0 && (
      <nav
        className="flex items-center gap-0.5 text-sm flex-1 min-w-0 overflow-x-auto"
        aria-label="Vị trí hiện tại trên Drive"
      >
        {items.map((c, idx) => {
          const isLast = idx === items.length - 1;
          const canClick = !readOnly && !isLast && onNavigate;
          return (
            <span key={`${c.type}-${c.id}`} className="flex items-center gap-0.5 shrink-0 min-w-0">
              {idx > 0 && <ChevronRight size={14} className="text-slate-400 shrink-0" strokeWidth={2} />}
              {canClick ? (
                <button
                  type="button"
                  onClick={() => onNavigate(c, idx)}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-slate-600 hover:bg-white hover:text-slate-900 transition-colors max-w-[220px]"
                  title={c.name}
                >
                  {c.type === 'scope' && <Home size={13} className="shrink-0 text-slate-500" />}
                  <span className="truncate">{c.name}</span>
                </button>
              ) : (
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 max-w-[240px] ${
                    isLast ? 'font-medium text-slate-900' : 'text-slate-600'
                  }`}
                  title={c.name}
                >
                  {idx === 0 && c.type === 'scope' && <Home size={13} className="shrink-0 text-slate-500" />}
                  <span className="truncate">{c.name}</span>
                  {isLast && c.type === 'folder' && (
                    <ChevronDown size={13} className="shrink-0 text-slate-400 ml-0.5" aria-hidden />
                  )}
                </span>
              )}
            </span>
          );
        })}
      </nav>
      )}
    </div>
  );
}
