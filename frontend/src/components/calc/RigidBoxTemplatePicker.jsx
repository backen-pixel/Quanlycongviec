/**
 * Gallery chọn mẫu: sidebar Danh mục + Cấu trúc, lưới thẻ 2D | 3D.
 */
import { useMemo, useState } from 'react';
import { Search, Check } from 'lucide-react';
import {
  RIGID_BOX_CATEGORIES,
  RIGID_BOX_FAMILIES,
  RIGID_BOX_TEMPLATES,
  filterTemplates,
} from '../../lib/rigidBoxCatalog';
import { DielineThumb } from './boxstudio/rigidBoxFamilyArt';
import Family3dThumb from './boxstudio/Family3dThumb';

const FAMILY_ORDER = [
  'all',
  'lid_base',
  'magnetic',
  'flip_top',
  'drawer',
  'sleeve_drawer',
  'double_door',
  'book',
  'shoulder',
  'tall_bottle',
  'tuck_end',
];

export default function RigidBoxTemplatePicker({ selectedId, onSelect, compact = false }) {
  const [category, setCategory] = useState('all');
  const [familyFilter, setFamilyFilter] = useState('all');
  const [q, setQ] = useState('');

  const categoryCounts = useMemo(() => {
    const map = { all: RIGID_BOX_TEMPLATES.length };
    for (const t of RIGID_BOX_TEMPLATES) map[t.category] = (map[t.category] || 0) + 1;
    return map;
  }, []);

  const familyCounts = useMemo(() => {
    const map = { all: RIGID_BOX_TEMPLATES.length };
    for (const t of RIGID_BOX_TEMPLATES) map[t.family] = (map[t.family] || 0) + 1;
    return map;
  }, []);

  const list = useMemo(
    () =>
      filterTemplates({
        category,
        q,
        family: familyFilter === 'all' ? '' : familyFilter,
      }),
    [category, q, familyFilter]
  );

  const categoryLabel =
    RIGID_BOX_CATEGORIES.find((c) => c.id === category)?.label || 'Tất cả';

  return (
    <div className={`bg-white border border-gray-200 rounded-xl overflow-hidden ${compact ? '' : ''}`}>
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[480px]">
        <aside className="lg:col-span-3 border-b lg:border-b-0 lg:border-r border-gray-200 bg-slate-50/80 p-3 space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 px-2 mb-2">
              Danh mục
            </p>
            <ul className="space-y-0.5">
              {RIGID_BOX_CATEGORIES.map((c) => {
                const count = categoryCounts[c.id] || 0;
                const active = category === c.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setCategory(c.id)}
                      className={`w-full flex items-center justify-between gap-2 text-left px-2.5 py-2 rounded-md text-sm ${
                        active
                          ? 'bg-white border border-gray-300 shadow-sm font-medium text-gray-900'
                          : 'text-gray-600 hover:bg-white/80'
                      }`}
                    >
                      <span className="truncate">{c.label}</span>
                      <span className="text-xs text-gray-400 tabular-nums">{count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 px-2 mb-2">
              Cấu trúc
            </p>
            <ul className="space-y-0.5 max-h-64 overflow-y-auto">
              {FAMILY_ORDER.map((fid) => {
                const label = fid === 'all' ? 'Tất cả cấu trúc' : RIGID_BOX_FAMILIES[fid]?.name || fid;
                const count = familyCounts[fid] || 0;
                return (
                  <li key={fid}>
                    <button
                      type="button"
                      onClick={() => setFamilyFilter(fid)}
                      className={`w-full flex items-center justify-between gap-2 text-left px-2.5 py-1.5 rounded-md text-xs ${
                        familyFilter === fid
                          ? 'bg-indigo-50 text-indigo-900 font-medium'
                          : 'text-gray-600 hover:bg-white/80'
                      }`}
                    >
                      <span className="truncate">{label}</span>
                      <span className="tabular-nums text-gray-400">{count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        <div className="lg:col-span-9 flex flex-col min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">
              {list.length} mẫu
              <span className="font-normal text-gray-400">
                {' '}
                · {categoryLabel}
                {familyFilter !== 'all' ? ` · ${RIGID_BOX_FAMILIES[familyFilter]?.name}` : ''}
              </span>
            </h2>
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm mẫu…"
                className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-300 w-48 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 max-h-[640px]">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {list.map((t) => {
                const active = t.id === selectedId;
                return (
                  <div
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect?.(t)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect?.(t);
                      }
                    }}
                    className={`group text-left rounded-xl border bg-white overflow-hidden transition-all cursor-pointer ${
                      active
                        ? 'border-indigo-400 ring-2 ring-indigo-200 shadow-md'
                        : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="relative grid grid-cols-2 gap-0 bg-[#f3f4f6] border-b border-gray-100">
                      <div className="absolute top-1.5 right-1.5 z-[1] flex flex-col items-end gap-0.5">
                        <span className="text-[9px] text-gray-400 bg-white/80 px-1 rounded">Printable</span>
                        <span className="text-[9px] text-gray-400 bg-white/80 px-1 rounded">Downloadable</span>
                      </div>
                      {active ? (
                        <span className="absolute top-1.5 left-1.5 z-[1] w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                          <Check className="h-3 w-3" />
                        </span>
                      ) : null}
                      <div className="aspect-[5/4] p-2 flex items-center justify-center border-r border-gray-200/80 bg-white">
                        <DielineThumb family={t.family} className="max-h-full" />
                      </div>
                      <div className="aspect-[5/4] p-0 overflow-hidden bg-[#eceff3]">
                        <Family3dThumb
                          family={t.family}
                          L={t.defaults.L}
                          W={t.defaults.W}
                          H={t.defaults.H}
                          lidH={t.defaults.lidH}
                          openT={0.5}
                          className="h-full"
                        />
                      </div>
                    </div>
                    <div className="px-3 py-2.5">
                      <p
                        className={`text-sm font-medium leading-snug ${
                          active ? 'text-indigo-700' : 'text-gray-800 group-hover:text-indigo-600'
                        }`}
                      >
                        {t.name}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                        {RIGID_BOX_FAMILIES[t.family]?.name} · {t.defaults.L}×{t.defaults.W}×
                        {t.defaults.H} cm
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            {!list.length ? (
              <p className="text-sm text-gray-400 text-center py-16">Không có mẫu khớp.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
