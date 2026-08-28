import { useIsMobile } from '../hooks/useIsMobile';

/**
 * Bảng đổi sang danh sách thẻ khi ở mobile.
 *
 * Vấn đề đang giải: app có 141 bảng, nhiều bảng `min-w-[960px]`..`min-w-[1500px]`.
 * Trên điện thoại 375px người dùng chỉ thấy 2/7 cột, phải vuốt ngang mới thấy
 * "Trạng thái" hay "Hạn bàn giao" — đúng những cột cần liếc nhanh nhất.
 *
 * Cách dùng — khai báo cột một lần, dùng cho cả 2 dạng hiển thị:
 *
 *   <ResponsiveTable
 *     rows={items}
 *     rowKey={(r) => r.id}
 *     onRowClick={(r) => navigate(`/x/${r.id}`)}
 *     columns={[
 *       { key: 'code',   header: 'Dự án',       primary: true, cell: (r) => r.code },
 *       { key: 'status', header: 'Trạng thái',  cell: (r) => <Badge s={r.status} /> },
 *       { key: 'note',   header: 'Ghi chú',     hideOnMobile: true, cell: (r) => r.note },
 *     ]}
 *   />
 *
 * Thuộc tính cột:
 * - `primary`      : lên làm tiêu đề thẻ ở mobile (không kèm nhãn). Nên đặt cho 1 cột.
 * - `secondary`    : hiện ngay dưới tiêu đề, cũng không kèm nhãn (vd. tên khách hàng).
 * - `hideOnMobile` : bỏ hẳn khỏi thẻ — dùng cho cột phụ gây rối trên màn nhỏ.
 * - `align`        : 'left' | 'right' | 'center' (chỉ ảnh hưởng dạng bảng).
 */
export default function ResponsiveTable({
  rows = [],
  columns = [],
  rowKey,
  onRowClick,
  empty = 'Không có dữ liệu',
  className = '',
  tableClassName = '',
  cardClassName = '',
  /** Danh sách class độ rộng cho <colgroup> — giữ nguyên bố cục cột sẵn có trên desktop. */
  colWidths = null,
}) {
  const isMobile = useIsMobile();
  const keyOf = (row, i) => (rowKey ? rowKey(row) : (row?.id ?? i));

  if (!rows.length) {
    return <p className="text-sm text-slate-400 py-6 text-center">{empty}</p>;
  }

  if (isMobile) {
    const primary = columns.find((c) => c.primary);
    const secondary = columns.find((c) => c.secondary);
    const rest = columns.filter((c) => !c.primary && !c.secondary && !c.hideOnMobile);

    return (
      <div className={`space-y-2 ${className}`}>
        {rows.map((row, i) => {
          const clickable = typeof onRowClick === 'function';
          return (
            <div
              key={keyOf(row, i)}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={clickable ? () => onRowClick(row) : undefined}
              onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row); } } : undefined}
              className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm ${
                clickable ? 'cursor-pointer active:bg-slate-50' : ''
              } ${cardClassName}`}
            >
              {primary && (
                <div className="text-sm font-semibold text-slate-900 mb-0.5">
                  {primary.cell(row, i)}
                </div>
              )}
              {secondary && (
                <div className="text-xs text-slate-500 mb-2">{secondary.cell(row, i)}</div>
              )}
              {rest.length > 0 && (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {rest.map((col) => (
                    <div key={col.key} className="min-w-0">
                      <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400 truncate">
                        {col.header}
                      </dt>
                      <dd className="text-xs text-slate-700 mt-0.5">{col.cell(row, i)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className={`w-full text-sm ${tableClassName}`}>
        {colWidths && (
          <colgroup>
            {colWidths.map((w, i) => <col key={i} className={w} />)}
          </colgroup>
        )}
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`py-2 px-2 font-semibold whitespace-nowrap ${
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''
                } ${col.headerClassName || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const clickable = typeof onRowClick === 'function';
            return (
              <tr
                key={keyOf(row, i)}
                onClick={clickable ? () => onRowClick(row) : undefined}
                className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/60 ${
                  clickable ? 'cursor-pointer' : ''
                }`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`py-2.5 px-2 align-middle ${
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''
                    } ${col.cellClassName || ''}`}
                  >
                    {col.cell(row, i)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
