import { useMemo, useState, useCallback, useEffect } from 'react';
import { Search, X, Pin, Pencil, LayoutGrid } from 'lucide-react';
import api from '../lib/api';
import {
  APP_MODULE_DEFINITIONS,
  defaultAppSwitcherFavorites,
  readAppSwitcherFavorites,
  writeAppSwitcherFavorites,
  resolveActiveAppModuleId,
  canUseAppModule,
  mapCustomAppModuleToDef,
} from '../lib/appSwitcherModules';
import ModuleAccessDeniedModal from './ModuleAccessDeniedModal';
import ModuleBrandIcon from './ModuleBrandIcon';
import { navigateToAppModule } from '../lib/sidebarModuleContext';

function normalizeSearch(s) {
  return String(s || '').trim().toLowerCase();
}

function moduleMatchesSearch(mod, q) {
  if (!q) return true;
  return (
    mod.name.toLowerCase().includes(q)
    || mod.desc.toLowerCase().includes(q)
    || mod.category.toLowerCase().includes(q)
    || String(mod.adminCategory || '').toLowerCase().includes(q)
  );
}

const activeModuleCardClass =
  'border-blue-400 bg-blue-50/80 ring-2 ring-blue-200/90 shadow-md shadow-blue-200/45 hover:border-blue-500 hover:bg-blue-100/80 hover:ring-blue-300 hover:shadow-lg hover:shadow-blue-200/55';
const idleModuleCardClass =
  'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/90 hover:shadow-md';
const lockedModuleCardClass =
  'border-slate-100 bg-white/90 opacity-[0.68] saturate-[0.42] cursor-not-allowed';

export function AppSwitcherButton({ open, onClick, collapsed }) {
  return (
    <button
      type="button"
      data-tour="app-switcher"
      onClick={onClick}
      title="Tất cả ứng dụng"
      aria-label="Tất cả ứng dụng"
      aria-expanded={open}
      className={`shrink-0 flex items-center justify-center rounded-lg transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/35 ${
        collapsed ? 'w-9 h-9' : 'w-9 h-9'
      } ${
        open
          ? 'bg-white/18 text-white ring-1 ring-white/25'
          : 'bg-white/8 text-white/85 hover:bg-white/14 hover:text-white'
      }`}
    >
      <LayoutGrid className="h-[18px] w-[18px]" strokeWidth={2} />
    </button>
  );
}

export default function AppSwitcherPanel({
  open,
  onClose,
  navigate,
  canAccessModule,
  crmOnly,
  pinnedModule,
  onPinModule,
  isKnowledge,
  isCalc,
  isKetoan,
  isMuahang,
  isVC,
  isSX,
  isCRM,
  isCongViec,
  customModuleId = null,
  customModules: customModulesProp = null,
  panelRef,
}) {
  const [search, setSearch] = useState('');
  const [editFavorites, setEditFavorites] = useState(false);
  const [favoritePaths, setFavoritePaths] = useState(() => readAppSwitcherFavorites() || []);
  const [deniedModule, setDeniedModule] = useState(null);
  const [customModulesLocal, setCustomModulesLocal] = useState([]);

  useEffect(() => {
    if (Array.isArray(customModulesProp)) {
      setCustomModulesLocal(customModulesProp);
      return undefined;
    }
    if (!open) return undefined;
    let cancelled = false;
    api.get('/app-modules', { params: { for_switcher: 1 } })
      .then((r) => {
        if (cancelled) return;
        const defs = (r.data?.modules || []).map(mapCustomAppModuleToDef).filter(Boolean);
        setCustomModulesLocal(defs);
      })
      .catch(() => {
        if (!cancelled) setCustomModulesLocal([]);
      });
    return () => { cancelled = true; };
  }, [open, customModulesProp]);

  const customModules = Array.isArray(customModulesProp) ? customModulesProp : customModulesLocal;

  const catalog = useMemo(
    () => [...APP_MODULE_DEFINITIONS, ...customModules],
    [customModules],
  );

  const activeModuleId = resolveActiveAppModuleId({
    isKnowledge,
    isCalc,
    isKetoan,
    isMuahang,
    isVC,
    isSX,
    isCRM,
    isCongViec,
    customModuleId,
  });

  const allModulePaths = useMemo(
    () => catalog.map((m) => m.path),
    [catalog],
  );

  const moduleAccessCtx = useMemo(
    () => ({ canAccessModule, crmOnly }),
    [canAccessModule, crmOnly],
  );

  const canUseModule = useCallback(
    (mod) => canUseAppModule(mod, moduleAccessCtx),
    [moduleAccessCtx],
  );

  const resolvedFavorites = useMemo(() => {
    const stored = favoritePaths.filter((p) => allModulePaths.includes(p));
    if (stored.length) return stored;
    return defaultAppSwitcherFavorites(allModulePaths);
  }, [favoritePaths, allModulePaths]);

  const q = normalizeSearch(search);

  const favoriteModules = useMemo(() => {
    const list = resolvedFavorites
      .map((path) => catalog.find((m) => m.path === path))
      .filter(Boolean);
    return q ? list.filter((m) => moduleMatchesSearch(m, q)) : list;
  }, [resolvedFavorites, q, catalog]);

  const allModules = useMemo(() => {
    return catalog.filter((m) => moduleMatchesSearch(m, q));
  }, [q, catalog]);

  const builtInModules = useMemo(
    () => allModules.filter((m) => !m.isCustom),
    [allModules],
  );

  const customAppModules = useMemo(
    () => allModules.filter((m) => m.isCustom),
    [allModules],
  );

  const toggleFavorite = useCallback((path, e) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    setFavoritePaths((prev) => {
      const base = prev.length ? prev.filter((p) => allModulePaths.includes(p)) : [...resolvedFavorites];
      const next = base.includes(path) ? base.filter((p) => p !== path) : [...base, path];
      writeAppSwitcherFavorites(next);
      return next;
    });
  }, [allModulePaths, resolvedFavorites]);

  const openModule = useCallback((mod) => {
    if (!canUseAppModule(mod, moduleAccessCtx)) {
      setDeniedModule(mod);
      return;
    }
    setDeniedModule(null);
    onClose();
    navigateToAppModule(navigate, mod);
  }, [moduleAccessCtx, navigate, onClose]);

  const closeDeniedModal = useCallback(() => {
    setDeniedModule(null);
  }, []);

  const handlePanelClose = useCallback(() => {
    setDeniedModule(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) setDeniedModule(null);
  }, [open]);

  const renderModuleCard = (mod) => {
    const isActive = mod.id === activeModuleId;
    const isPinnedLogin = pinnedModule === mod.path;
    const isFavorite = resolvedFavorites.includes(mod.path);
    const canUse = canUseModule(mod);
    return (
      <div
        key={mod.id}
        role="button"
        tabIndex={0}
        data-tour={mod.id === 'crm' ? 'app-switcher-crm' : undefined}
        onClick={() => openModule(mod)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openModule(mod); }}
        className={`group relative flex items-center gap-2 rounded-xl border px-2 py-2 text-left shadow-sm transition-all ${
          !canUse
            ? lockedModuleCardClass
            : isActive
              ? `${activeModuleCardClass} cursor-pointer`
              : `${idleModuleCardClass} cursor-pointer`
        }`}
      >
        <ModuleBrandIcon mod={mod} size="md" />
        <div className="min-w-0 flex-1 pr-11">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[13px] font-bold text-slate-900 truncate">{mod.name}</span>
            {isActive && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500 text-white shrink-0">
                Đang dùng
              </span>
            )}
          </div>
          {!mod.isCustom && (
            <span className={`inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${mod.categoryClass}`}>
              {mod.category}
            </span>
          )}
        </div>
        <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleFavorite(mod.path, e); }}
            title={isFavorite ? 'Bỏ khỏi ưa thích' : 'Thêm vào ưa thích'}
            className={`p-1 rounded-md cursor-pointer transition-colors ${
              isFavorite ? 'text-emerald-600 bg-emerald-50' : 'text-slate-300 opacity-0 group-hover:opacity-100 hover:text-slate-600 hover:bg-slate-50'
            } ${isFavorite ? 'opacity-100' : ''}`}
          >
            <Pin className={`h-3 w-3 ${isFavorite ? 'fill-current rotate-45' : ''}`} />
          </button>
          {canUse && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onPinModule(mod.path); }}
              title={isPinnedLogin ? 'Mặc định khi đăng nhập' : 'Ghim — đăng nhập vào module này'}
              className={`p-1 rounded-md cursor-pointer transition-colors ${
                isPinnedLogin ? 'text-amber-600 bg-amber-50' : 'text-slate-300 opacity-0 group-hover:opacity-100 hover:text-slate-600 hover:bg-slate-50'
              } ${isPinnedLogin ? 'opacity-100' : ''}`}
            >
              <Pin className={`h-3 w-3 ${isPinnedLogin ? 'fill-current' : ''}`} />
            </button>
          )}
        </div>
      </div>
    );
  };

  if (!open) return null;

  return (
    // z-[60] để luôn nằm trên drawer sidebar mobile (z-50) — cả hai đều trượt từ cạnh trái.
    <div className="fixed inset-0 z-[60] flex">
      {deniedModule && (
        <ModuleAccessDeniedModal
          moduleName={deniedModule.name}
          onClose={closeDeniedModal}
        />
      )}
      <div
        ref={panelRef}
        className="w-full max-w-[392px] bg-gradient-to-b from-slate-50 via-white to-slate-50 shadow-2xl border-r border-slate-200/80 flex flex-col animate-slide-in overflow-hidden"
      >
        <div className="shrink-0 px-3.5 pt-3.5 pb-2.5 border-b border-slate-100/80 bg-white/80 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2.5 mb-2.5">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">Ứng dụng</h2>
            <button
              type="button"
              onClick={handlePanelClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
              aria-label="Đóng"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm ứng dụng…"
              className="w-full h-9 pl-9 pr-3 rounded-full border border-blue-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-shadow"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3.5 py-3.5 space-y-4 [scrollbar-width:thin]">
          {favoriteModules.length > 0 && (
            <section>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-[13px] font-bold text-slate-900">Ưa thích</h3>
                <button
                  type="button"
                  onClick={() => setEditFavorites((v) => !v)}
                  className={`inline-flex items-center gap-1 text-[11px] font-semibold cursor-pointer transition-colors ${
                    editFavorites ? 'text-blue-700' : 'text-slate-500 hover:text-blue-600'
                  }`}
                >
                  <Pencil className="h-3 w-3" />
                  {editFavorites ? 'Xong' : 'Chỉnh sửa'}
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
                {favoriteModules.map((mod) => {
                  const isPinned = resolvedFavorites.includes(mod.path);
                  const isActive = mod.id === activeModuleId;
                  const canUse = canUseModule(mod);
                  return (
                    <div
                      key={mod.id}
                      role="button"
                      tabIndex={0}
                      data-tour={mod.id === 'crm' ? 'app-switcher-crm' : undefined}
                      onClick={() => openModule(mod)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openModule(mod); }}
                      className={`relative shrink-0 w-[86px] rounded-xl border px-2 py-2.5 text-center shadow-sm transition-all ${
                        !canUse
                          ? lockedModuleCardClass
                          : isActive
                            ? `${activeModuleCardClass} cursor-pointer`
                            : `${idleModuleCardClass} cursor-pointer`
                      }`}
                    >
                      {(editFavorites || isPinned) && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => toggleFavorite(mod.path, e)}
                          onKeyDown={(e) => { if (e.key === 'Enter') toggleFavorite(mod.path, e); }}
                          className={`absolute top-1 right-1 p-0.5 rounded-md cursor-pointer transition-colors ${
                            isPinned ? 'text-emerald-600 bg-emerald-50' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-50'
                          }`}
                          title={isPinned ? 'Bỏ khỏi ưa thích' : 'Thêm vào ưa thích'}
                        >
                          <Pin className={`h-3 w-3 ${isPinned ? 'fill-current rotate-45' : ''}`} />
                        </span>
                      )}
                      <ModuleBrandIcon mod={mod} size="lg" wrapClass="mx-auto" />
                      <p className="mt-2 text-xs font-bold text-slate-900 leading-tight line-clamp-2">{mod.name}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <h3 className="text-[13px] font-bold text-slate-900 mb-2">Module có sẵn</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {builtInModules.map((mod) => renderModuleCard(mod))}
            </div>
            {builtInModules.length === 0 && customAppModules.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-6">Không tìm thấy ứng dụng phù hợp.</p>
            )}
            {builtInModules.length === 0 && customAppModules.length > 0 && q && (
              <p className="text-xs text-slate-500 text-center py-3">Không có module có sẵn khớp tìm kiếm.</p>
            )}
          </section>

          {customAppModules.length > 0 && (
            <section>
              <h3 className="text-[13px] font-bold text-slate-900 mb-2">Module tùy chỉnh</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {customAppModules.map((mod) => renderModuleCard(mod))}
              </div>
            </section>
          )}
        </div>

        <div className="shrink-0 px-3.5 py-2 border-t border-slate-100 bg-white/90">
          <p className="text-[10px] text-slate-400 text-center">TuBep Pro © 2026</p>
        </div>
      </div>
      <button
        type="button"
        className="flex-1 bg-slate-900/40 backdrop-blur-[2px] cursor-pointer border-0"
        aria-label="Đóng bảng ứng dụng"
        onClick={deniedModule ? closeDeniedModal : handlePanelClose}
      />
    </div>
  );
}
