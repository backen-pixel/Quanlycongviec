/**
 * Canvas 2D kiểu Pacdora — xếp bản trên khổ / khuôn.
 */
import RigidBoxDielineSvg from '../RigidBoxDielineSvg';

export function DielineLineLegend({ className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-gray-600 ${className}`}>
      <span className="inline-flex items-center gap-1" title="Vùng tràn in (bleed)">
        <span className="w-3.5 h-0.5 bg-emerald-500 inline-block rounded" />
        Bleed
      </span>
      <span className="inline-flex items-center gap-1" title="Đường cắt (trim)">
        <span className="w-3.5 h-0.5 bg-blue-600 inline-block rounded" />
        Trim
      </span>
      <span className="inline-flex items-center gap-1" title="Nếp gấp (crease)">
        <span className="w-3.5 h-[2px] border-t-2 border-dashed border-red-600 inline-block" />
        Crease
      </span>
    </div>
  );
}

/**
 * @param {Array} parts — danh sách tấm (thường 1 phần tử primary flat)
 * @param {'grid'|'studio'} [layout]
 */
export default function DielineStudioCanvas({
  parts = [],
  templateName = '',
  embedded = false,
  layout = 'studio',
  faces = [],
  copiesMode = 'auto',
  copiesPerSheet = null,
  copiesByPart = null,
  onCopiesModeChange,
  onCopiesPerSheetChange,
  onCopiesByPartChange,
}) {
  const studio = layout === 'studio' || parts.length <= 1;
  const faceText = faces?.length ? faces.join(' · ') : '';
  const nest = parts[0]?.nest;
  const copiesHint =
    nest?.partNests?.length > 0
      ? nest.partNests.map((p) => `${p.copies}/${p.maxCopies}`).join(' · ')
      : nest?.copies != null
        ? `${nest.copies}/${nest.maxCopies || '—'}`
        : '';

  return (
    <div
      className={`flex flex-col h-full bg-white overflow-hidden ${
        embedded ? 'min-h-0 border-0 rounded-none' : 'min-h-[420px] border border-gray-200 rounded-xl'
      }`}
    >
      <div
        className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 border-b border-gray-100 ${
          embedded || studio ? 'bg-white' : 'bg-slate-50'
        }`}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">
            Dieline generator
            {templateName ? ` · ${templateName}` : ''}
          </p>
          <p className="text-[11px] text-gray-500 truncate">
            Xếp lưới trên khổ / khuôn
            {copiesHint ? ` · ${copiesHint} bản` : ''}
            {faceText ? ` · ${faceText}` : ''} · lăn chuột · kéo thả
          </p>
        </div>
        <DielineLineLegend />
      </div>
      <div className={`flex-1 overflow-auto p-3 ${studio ? 'bg-[#eceff3]' : 'bg-[#f4f6f8]'}`}>
        <div className={studio ? 'flex flex-col gap-3 max-w-5xl mx-auto' : 'grid grid-cols-1 xl:grid-cols-2 gap-3'}>
          {parts.map((p) => (
            <RigidBoxDielineSvg
              key={p.id + p.title}
              title={p.title}
              svg={p.svg}
              filename={p.filename}
              blank={p.blank}
              areaCm2={p.areaCm2}
              sheet={p.sheet}
              nest={p.nest}
              material={p.material}
              faces={p.faces || faces}
              large={studio}
              copiesMode={copiesMode}
              copiesPerSheet={copiesPerSheet}
              copiesByPart={copiesByPart}
              onCopiesModeChange={onCopiesModeChange}
              onCopiesPerSheetChange={onCopiesPerSheetChange}
              onCopiesByPartChange={onCopiesByPartChange}
            />
          ))}
        </div>
        {!parts.length ? (
          <p className="text-sm text-gray-400 text-center py-16">Chưa có dieline 2D.</p>
        ) : null}
      </div>
    </div>
  );
}
