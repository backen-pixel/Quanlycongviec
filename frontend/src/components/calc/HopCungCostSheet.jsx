/**
 * Sheet bóc tách COST kiểu Excel NEXTGO (T7-TRINH-HỘP CỨNG).
 * Cột: Hạng mục | Giá/hộp | m² | Khổ | Size mm | Nest | Số khuôn | Giá khuôn
 */
import { formatVnd } from '../../lib/hopCungCost';

function fmtM2(n) {
  if (n == null || !Number.isFinite(n) || n === 0) return '';
  return n.toFixed(3);
}

export default function HopCungCostSheet({
  result,
  customer = '',
  templateName = '',
  className = '',
}) {
  const { size, qty, excelRows = [], unitPriceRow = {}, costPerBox } = result || {};
  const sizeLabel = size ? `${size.L}×${size.W}×${size.H}` : '—';

  return (
    <div className={`overflow-x-auto border border-gray-300 rounded-lg bg-white shadow-sm ${className}`}>
      <table className="w-full min-w-[1080px] text-[12px] border-collapse font-sans">
        <thead>
          <tr className="bg-[#1f4e79] text-white">
            <th colSpan={8} className="px-3 py-2.5 text-left text-sm font-bold tracking-wide">
              CÔNG TY TNHH BAO BÌ NEXTGO — Bóc tách COST hộp cứng
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-gray-200">
            <td className="px-2 py-1.5 font-semibold text-gray-700 bg-slate-50 w-[20%]">Hạng mục</td>
            <td className="px-2 py-1.5 font-medium text-gray-900" colSpan={7}>
              HỘP CỨNG{templateName ? ` · ${templateName}` : ''}
            </td>
          </tr>
          <tr className="border-b border-gray-100">
            <td className="px-2 py-1.5 text-gray-600 bg-slate-50">Khách hàng</td>
            <td className="px-2 py-1.5" colSpan={7}>
              {customer || '—'}
            </td>
          </tr>
          <tr className="border-b border-gray-100">
            <td className="px-2 py-1.5 text-gray-600 bg-slate-50">Kích thước (cm)</td>
            <td className="px-2 py-1.5 font-medium tabular-nums" colSpan={3}>
              {sizeLabel}
            </td>
            <td className="px-2 py-1.5 text-gray-600 bg-slate-50">Số lượng Q</td>
            <td className="px-2 py-1.5 font-medium tabular-nums" colSpan={3}>
              {Number(qty || 0).toLocaleString('vi-VN')}
            </td>
          </tr>

          <tr className="bg-[#fff2cc] border-y border-amber-200">
            <td className="px-2 py-1 text-[11px] font-semibold text-amber-900">Giá màng</td>
            <td className="px-2 py-1 text-[11px] font-semibold text-amber-900">Giá giấy</td>
            <td className="px-2 py-1 text-[11px] font-semibold text-amber-900" colSpan={2}>
              Tổng khuôn bế (job)
            </td>
            <td className="px-2 py-1 text-[11px] font-semibold text-amber-900">Giá in</td>
            <td className="px-2 py-1 text-[11px] font-semibold text-amber-900">Khuôn ép kim</td>
            <td className="px-2 py-1 text-[11px] font-semibold text-amber-900" colSpan={2}>
              Keo / hộp
            </td>
          </tr>
          <tr className="bg-[#fffbeb] border-b border-amber-100">
            <td className="px-2 py-1 tabular-nums">{formatVnd(unitPriceRow.film)}</td>
            <td className="px-2 py-1 tabular-nums">{formatVnd(unitPriceRow.paper)}</td>
            <td className="px-2 py-1 tabular-nums" colSpan={2}>
              {formatVnd(unitPriceRow.dieCutJob)}
            </td>
            <td className="px-2 py-1 tabular-nums">{formatVnd(unitPriceRow.printJob)}</td>
            <td className="px-2 py-1 tabular-nums">{formatVnd(unitPriceRow.foilDieJob)}</td>
            <td className="px-2 py-1 tabular-nums" colSpan={2}>
              {formatVnd(unitPriceRow.glue)}
            </td>
          </tr>

          <tr className="bg-[#d6dce4] border-y border-gray-300 text-[11px] font-semibold text-gray-700">
            <td className="px-2 py-1.5">Hạng mục NVL / gia công</td>
            <td className="px-2 py-1.5 text-right w-[10%]">Giá / hộp</td>
            <td className="px-2 py-1.5 text-right w-[8%]">m²</td>
            <td className="px-2 py-1.5 text-center w-[11%]">Khổ giấy</td>
            <td className="px-2 py-1.5 text-center w-[12%]">Kích thước (mm)</td>
            <td className="px-2 py-1.5 text-center w-[8%]">Nest</td>
            <td className="px-2 py-1.5 text-center w-[8%]">Số khuôn</td>
            <td className="px-2 py-1.5 text-right w-[11%]">Giá khuôn</td>
          </tr>

          {excelRows.map((row) => {
            if (row.type === 'section') {
              return (
                <tr key={row.key} className="bg-[#bdd7ee] border-y border-sky-200">
                  <td colSpan={8} className="px-2 py-1.5 font-bold text-sky-950 uppercase tracking-wide text-[11px]">
                    {row.label}
                  </td>
                </tr>
              );
            }
            if (row.type === 'total') {
              return (
                <tr key={row.key} className="bg-rose-100 border-y border-rose-300">
                  <td className="px-2 py-2 font-bold text-rose-900">{row.label}</td>
                  <td className="px-2 py-2 text-right font-bold text-rose-950 tabular-nums text-sm">
                    {formatVnd(row.amount ?? costPerBox)}
                  </td>
                  <td colSpan={6} className="px-2 py-2 text-xs text-rose-700">
                    = Nắp + Đáy + Gia công / hộp
                  </td>
                </tr>
              );
            }
            if (row.type === 'sell') {
              return (
                <tr key={row.key} className="border-b border-gray-100 bg-emerald-50/60">
                  <td className="px-2 py-1.5 font-medium text-emerald-900">{row.label}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-emerald-950 tabular-nums">
                    {formatVnd(row.amount)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-emerald-700 tabular-nums">
                    {row.margin != null ? `${Math.round(row.margin * 100)}%` : ''}
                  </td>
                  <td colSpan={5} className="px-2 py-1.5 text-[11px] text-gray-400">
                    COST ÷ margin
                  </td>
                </tr>
              );
            }
            if (row.type === 'grand') {
              return (
                <tr key={row.key} className="bg-slate-800 text-white border-t border-slate-900">
                  <td className="px-2 py-2 font-bold">{row.label}</td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums text-sm">
                    {formatVnd(row.amount)}
                  </td>
                  <td colSpan={6} />
                </tr>
              );
            }

            const hasDie = (row.dieCount || 0) > 0;
            return (
              <tr key={row.key} className="border-b border-gray-100 hover:bg-slate-50/80">
                <td className="px-2 py-1.5 text-gray-800 pl-3">
                  {row.label}
                  {row.note ? (
                    <span className="block text-[10px] text-gray-400 font-normal">{row.note}</span>
                  ) : null}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums font-medium text-gray-900">
                  {formatVnd(row.amount)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">{fmtM2(row.m2)}</td>
                <td className="px-2 py-1.5 text-center tabular-nums text-gray-600">{row.sheet || ''}</td>
                <td className="px-2 py-1.5 text-center tabular-nums text-gray-600">
                  {row.sizeMm?.label || ''}
                </td>
                <td className="px-2 py-1.5 text-center tabular-nums text-gray-600">
                  {row.nest != null && row.nest !== '' ? row.nest : ''}
                </td>
                <td className="px-2 py-1.5 text-center tabular-nums text-violet-800 font-medium">
                  {hasDie ? row.dieCount : ''}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-violet-800">
                  {hasDie ? formatVnd(row.dieTotal) : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-3 py-2 text-[10px] text-gray-400 border-t border-gray-100 bg-slate-50">
        NextGo: nắp wrap (L+W+2H)×(W+H) · đáy (L+2H)×(W+2H) · NVL = (m² khổ × đơn giá) ÷ nest · khuôn bế =
        Σ(số khuôn × đơn giá) ÷ Q
      </p>
    </div>
  );
}
