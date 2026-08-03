/**
 * Mỗi tấm dieline = 1 khung mặt phẳng lớn — hiện kích thước + diện tích giấy.
 */
import { Download } from 'lucide-react';
import { downloadSvg } from '../../lib/rigidBoxDieline';
import { DielineLineLegend } from './boxstudio/DielineStudioCanvas';

function matLabel(m) {
  if (m === 'wrapping') return 'Giấy bọc';
  if (m === 'connection') return 'Connection';
  if (m === 'carton') return 'Carton';
  return 'Hardboard';
}

function matTone(m) {
  if (m === 'wrapping') return 'bg-sky-50 text-sky-800 border-sky-200';
  if (m === 'connection') return 'bg-amber-50 text-amber-800 border-amber-200';
  if (m === 'carton') return 'bg-lime-50 text-lime-800 border-lime-200';
  return 'bg-orange-50 text-orange-800 border-orange-200';
}

function fmt(n, digits = 1) {
  if (!Number.isFinite(n)) return '—';
  return Number(n).toFixed(digits);
}

export default function DielineFacePanels({ parts = [], templateName = '' }) {
  const totalCm2 = parts.reduce((s, p) => s + (Number(p.areaCm2) || 0), 0);
  const totalM2 = totalCm2 / 10000;

  return (
    <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            2D · Từng mặt phẳng
            {templateName ? <span className="font-normal text-gray-500"> · {templateName}</span> : null}
          </h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Mỗi khung = 1 tấm blank · dùng để tính diện tích giấy / chipboard
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DielineLineLegend />
          <div className="text-right text-xs">
            <p className="text-gray-400">Tổng diện tích blank</p>
            <p className="font-semibold tabular-nums text-gray-900">
              {fmt(totalCm2, 0)} cm² · {fmt(totalM2, 4)} m²
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 gap-4">
        {parts.map((p, i) => {
          const w = Number(p.blank?.w) || 0;
          const h = Number(p.blank?.h) || 0;
          const areaCm2 = Number(p.areaCm2) || w * h;
          const areaM2 = Number(p.areaM2) || areaCm2 / 10000;
          return (
            <article
              key={p.id + p.title + i}
              className="border-2 border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{p.title}</p>
                    <span
                      className={`inline-flex mt-0.5 text-[10px] px-1.5 py-0.5 rounded border ${matTone(p.material)}`}
                    >
                      {matLabel(p.material)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">Khổ blank</p>
                    <p className="text-sm font-bold tabular-nums text-gray-900">
                      {fmt(w)} × {fmt(h)} <span className="font-normal text-gray-500">cm</span>
                    </p>
                  </div>
                  <div className="text-right rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-emerald-700">Diện tích</p>
                    <p className="text-sm font-bold tabular-nums text-emerald-900">
                      {fmt(areaCm2, 0)} cm²
                    </p>
                    <p className="text-[11px] tabular-nums text-emerald-700">{fmt(areaM2, 4)} m²</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadSvg(p.svg, p.filename)}
                    className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 px-2.5 py-1.5 rounded-md border border-gray-200 bg-white"
                  >
                    <Download className="h-3.5 w-3.5" />
                    SVG
                  </button>
                </div>
              </div>

              {/* Mặt phẳng lớn — 1 tấm / khung */}
              <div className="p-4 md:p-6 bg-[#eef1f4] flex justify-center items-center min-h-[280px]">
                <div className="w-full max-w-3xl bg-white border border-gray-300 shadow-md rounded-sm p-4 md:p-6 relative">
                  <div className="absolute top-2 left-2 text-[10px] text-gray-400 font-medium">
                    Mặt phẳng · tỉ lệ theo blank
                  </div>
                  <div
                    className="w-full flex justify-center items-center pt-4 [&_svg]:w-full [&_svg]:max-h-[420px] [&_svg]:h-auto"
                    dangerouslySetInnerHTML={{ __html: (p.svg || '').replace(/^<\?xml[^>]*>\s*/i, '') }}
                  />
                  <div className="mt-3 flex justify-between text-[11px] text-gray-500 border-t border-dashed border-gray-200 pt-2">
                    <span>
                      W = <strong className="text-rose-700 tabular-nums">{fmt(w)} cm</strong>
                    </span>
                    <span>
                      H = <strong className="text-emerald-700 tabular-nums">{fmt(h)} cm</strong>
                    </span>
                    <span>
                      S = W×H ={' '}
                      <strong className="text-gray-800 tabular-nums">
                        {fmt(areaCm2, 0)} cm²
                      </strong>
                    </span>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
        {!parts.length ? (
          <p className="text-sm text-gray-400 text-center py-12">Chưa có tấm dieline.</p>
        ) : null}
      </div>
    </section>
  );
}
