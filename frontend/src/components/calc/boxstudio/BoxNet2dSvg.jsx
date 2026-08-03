import { useMemo } from 'react';
import { Download } from 'lucide-react';
import { buildBoxNet2d, downloadBoxNetSvg } from './boxNet2d';

export default function BoxNet2dSvg({
  widthCm,
  heightCm,
  lengthCm,
  opening = 'lid_from_back',
  className = '',
}) {
  const net = useMemo(
    () =>
      buildBoxNet2d({
        width: widthCm,
        height: heightCm,
        length: lengthCm,
        opening,
      }),
    [widthCm, heightCm, lengthCm, opening]
  );

  const filename = `box-net-W${widthCm}-H${heightCm}-L${lengthCm}.svg`;

  return (
    <div className={`bg-white border border-gray-200 rounded-xl overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-100 bg-slate-50">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Bản trải 2D</h3>
          <p className="text-[11px] text-gray-500">
            Net carton · nét liền = cắt · nét đứt đỏ = gấp · tai keo vàng
          </p>
        </div>
        <button
          type="button"
          onClick={() => downloadBoxNetSvg(net.svg, filename)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 hover:text-gray-900 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white"
        >
          <Download className="h-3.5 w-3.5" />
          Tải SVG
        </button>
      </div>
      <div className="p-3 overflow-auto max-h-[480px] bg-slate-100">
        <div
          className="mx-auto bg-white shadow-sm border border-gray-200 rounded p-2 [&_svg]:w-full [&_svg]:h-auto [&_svg]:max-h-[440px]"
          dangerouslySetInnerHTML={{
            __html: net.svg
              .replace(/^<\?xml[^>]*>\s*/i, '')
              .replace(/\swidth="[^"]*"/, '')
              .replace(/\sheight="[^"]*"/, ''),
          }}
        />
      </div>
    </div>
  );
}
