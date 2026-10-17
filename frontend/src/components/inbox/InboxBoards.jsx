/**
 * Khung bảng dùng chung cho các trang kiểu «hộp việc»: Kanban · Deadline · Lịch.
 *
 * Tách ra khỏi CRMAssignmentsPage.jsx (~6.300 dòng) để trang Báo lỗi dùng lại ĐÚNG
 * bộ khung đó. Chép sang file mới thì sớm muộn sửa một bên quên bên kia — màu cột,
 * bề ngang, cách đếm sẽ lệch dần giữa hai trang vốn phải trông y hệt nhau.
 *
 * Ba component này KHÔNG biết gì về nhiệm vụ hay lỗi: chúng nhận `columns` + `grouped`
 * + một hàm `renderItem` để vẽ từng thẻ. Mọi thứ riêng của từng trang nằm ở thẻ.
 */
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  useKanbanColumnTheme,
  KANBAN_COLUMN_RAIL_CLASS,
  KANBAN_BOARD_COLUMN_RAILS_CLASS,
} from '../../lib/kanbanColumnTheme';

export function InboxKanbanColumn({
  label, count, columnIndex, children, emptyLabel = 'Không có mục nào',
  onDragOver, onDragLeave, onDrop, noiBat = false,
}) {
  const columnTheme = useKanbanColumnTheme(columnIndex);
  return (
    <div
      className={`flex flex-col flex-shrink-0 w-[15rem] max-[400px]:w-[13.5rem] rounded-lg kanban-column-surface ${KANBAN_COLUMN_RAIL_CLASS} ${
        noiBat ? 'ring-2 ring-rose-400 ring-offset-1' : ''
      }`}
      style={{ backgroundColor: columnTheme.columnBg }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div
        className="sticky top-0 z-10 px-2 py-2.5 border-b rounded-t-md kanban-column-surface"
        style={{
          backgroundColor: columnTheme.headerBg,
          borderColor: columnTheme.border,
          boxShadow: columnTheme.headerShadow,
        }}
      >
        <div className="flex flex-nowrap items-center gap-1 min-w-0">
          <h3 className="flex-1 min-w-0 text-sm font-semibold truncate leading-snug text-black" title={label}>
            {label}
          </h3>
          <span
            className="inline-flex items-center justify-center min-w-[24px] h-[22px] px-1.5 rounded-md text-[13px] font-bold tabular-nums leading-none shrink-0"
            style={{
              backgroundColor: columnTheme.badgeBg,
              color: columnTheme.accent,
              border: `1px solid ${columnTheme.badgeBorder}`,
            }}
          >
            {count}
          </span>
        </div>
      </div>
      <div className="flex-1 p-1.5 space-y-1.5 min-h-[120px] max-h-[62vh] overflow-y-auto">
        {count > 0 ? children : (
          <p className="text-[11px] text-slate-400 text-center py-8">{emptyLabel}</p>
        )}
      </div>
    </div>
  );
}

/**
 * `renderItem(item)` quyết định hình hài từng thẻ — đây là chỗ DUY NHẤT hai trang khác nhau.
 * Thiếu nó thì bảng vẫn vẽ ra cột và con số đúng, chỉ là trống ruột; nên cảnh báo chứ không
 * để im lìm.
 */
/**
 * `keoTha` (tuỳ chọn) bật kéo thả giữa các cột:
 *   { cotDangKeo, onVao(key), onRa(), onTha(key) }
 * Trang nào không truyền thì bảng y như cũ — thẻ không kéo được, không thêm handler nào.
 */
export function InboxKanbanBoard({ columns, grouped, renderItem, emptyLabel, keoTha }) {
  return (
    <div
      className={`flex gap-2 overflow-x-auto pb-2 ${KANBAN_BOARD_COLUMN_RAILS_CLASS}`}
      style={{ minHeight: 300 }}
    >
      {columns.map((col, i) => {
        const list = grouped[col.key] || [];
        return (
          <InboxKanbanColumn
            key={col.key}
            label={col.label}
            count={list.length}
            columnIndex={i}
            emptyLabel={emptyLabel}
            noiBat={keoTha?.cotDangKeo === col.key}
            onDragOver={keoTha ? (e) => { e.preventDefault(); keoTha.onVao?.(col.key); } : undefined}
            onDragLeave={keoTha ? () => keoTha.onRa?.() : undefined}
            onDrop={keoTha ? (e) => { e.preventDefault(); keoTha.onTha?.(col.key); } : undefined}
          >
            {list.map((item) => renderItem(item))}
          </InboxKanbanColumn>
        );
      })}
    </div>
  );
}

/**
 * Lịch tháng — mỗi ô là một ngày, mục xếp theo hạn.
 *
 * Bảng Deadline trả lời «còn bao lâu», lịch trả lời «ngày nào dồn việc». Hai câu khác
 * nhau: nhìn rổ «Tuần này» không biết 14 mục đó rơi vào một ngày hay rải đều năm ngày.
 *
 * Mục chưa có hạn không lên lịch được — đếm riêng ở chân lịch cho khỏi biến mất.
 */
export function InboxCalendarBoard({ items, renderItem, nhanChuaCoHan = 'chưa có hạn' }) {
  const homNay = new Date();
  const [moc, setMoc] = useState(() => new Date(homNay.getFullYear(), homNay.getMonth(), 1));

  const { oNgay, chuaCoHan } = useMemo(() => {
    const map = new Map();
    let trong = 0;
    (items || []).forEach((t) => {
      if (!t.deadline) { trong += 1; return; }
      const d = new Date(t.deadline);
      if (Number.isNaN(d.getTime())) { trong += 1; return; }
      const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(t);
    });
    return { oNgay: map, chuaCoHan: trong };
  }, [items]);

  // Lịch bắt đầu từ thứ Hai — tuần làm việc của xưởng, không phải Chủ nhật kiểu Mỹ.
  const dauThang = new Date(moc.getFullYear(), moc.getMonth(), 1);
  const lech = (dauThang.getDay() + 6) % 7;
  const dauLuoi = new Date(dauThang);
  dauLuoi.setDate(dauLuoi.getDate() - lech);

  const oLich = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(dauLuoi);
    d.setDate(d.getDate() + i);
    oLich.push(d);
  }

  const laHomNay = (d) => d.toDateString() === homNay.toDateString();
  const trongThang = (d) => d.getMonth() === moc.getMonth();
  const doiThang = (n) => setMoc(new Date(moc.getFullYear(), moc.getMonth() + n, 1));

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50/80">
        <button
          type="button"
          onClick={() => doiThang(-1)}
          className="h-7 w-7 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 cursor-pointer inline-flex items-center justify-center"
          aria-label="Tháng trước"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-bold text-slate-900 tabular-nums">
          Tháng {moc.getMonth() + 1}/{moc.getFullYear()}
        </p>
        <button
          type="button"
          onClick={() => doiThang(1)}
          className="h-7 w-7 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 cursor-pointer inline-flex items-center justify-center"
          aria-label="Tháng sau"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setMoc(new Date(homNay.getFullYear(), homNay.getMonth(), 1))}
          className="ml-auto h-7 px-2.5 rounded-md border border-slate-200 bg-white text-[12px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
        >
          Hôm nay
        </button>
      </div>

      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/60">
        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => (
          <div key={d} className="px-2 py-1.5 text-[11px] font-bold text-slate-500 text-center">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {oLich.map((d) => {
          const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          const ds = oNgay.get(k) || [];
          const trong = trongThang(d);
          // Ngày đã trôi qua mà còn mục đọng — tô đỏ cả ô để thấy ngay chỗ dồn việc quá hạn.
          const quaHan = ds.length > 0 && d < new Date(homNay.getFullYear(), homNay.getMonth(), homNay.getDate());
          return (
            <div
              key={k}
              className={`min-h-[92px] border-b border-r border-slate-100 p-1 ${
                quaHan ? 'bg-rose-50/60' : trong ? 'bg-white' : 'bg-slate-50/50'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded text-[11px] font-bold tabular-nums ${
                    laHomNay(d) ? 'bg-indigo-600 text-white'
                      : trong ? 'text-slate-700' : 'text-slate-300'
                  }`}
                >
                  {d.getDate()}
                </span>
                {ds.length > 0 ? (
                  <span
                    className={`ml-auto text-[10px] font-bold tabular-nums px-1 rounded ${
                      quaHan ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {ds.length}
                  </span>
                ) : null}
              </div>
              <div className="space-y-0.5">
                {ds.slice(0, 3).map((t) => renderItem(t, { quaHan, ngay: d }))}
                {ds.length > 3 ? (
                  <p className="px-1 text-[10px] font-medium text-slate-400">+{ds.length - 3} nữa</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {chuaCoHan > 0 ? (
        <p className="px-3 py-2 text-[11px] text-slate-500 border-t border-slate-200 bg-slate-50/60">
          ⏳ {chuaCoHan} mục {nhanChuaCoHan} — không hiện trên lịch.
        </p>
      ) : null}
    </div>
  );
}
