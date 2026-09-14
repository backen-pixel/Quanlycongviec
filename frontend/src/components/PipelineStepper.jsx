/**
 * Shared MISA-style pipeline stepper used by both LeadDetail and ProductionDetail.
 * Props:
 *   stages        – array of stage objects { id, name, color, icon, order_index }
 *   currentStageId – id of the currently active stage
 *   onMoveToStage  – (stageId) => void  called when a step circle is clicked
 *   currentStageName – tên stage khi stage_id không có trong `stages` (orphan)
 *   visitedStageIds – Set<string> các stage_id đã từng vào (lịch sử CRM)
 *   linearProgress  – true: pipeline xưởng/VC (tích ✓ theo order_index); false: CRM deal (bỏ qua cột SX/VC)
 *   stageDates      – { [stageId]: 'dd/mm/yyyy' } ngày vào cột (không kèm giờ)
 *
 *   ── Chế độ CỘT LỒNG (chỉ dùng cho pipeline xưởng, mặc định TẮT) ───────────────
 *   nhomSongSong    – true: gom cột theo `group_key` thành CỘT LỚN nối tiếp; các cột nhỏ
 *                     cùng group hiện SONG SONG trong một thẻ — khớp chế độ «Gộp cột» của
 *                     bảng Kanban SX. false = đi nhánh cũ, CRM/LeadDetail không đổi một nét.
 *   trangThaiO      – { [stageId]: 'chua'|'dang'|'xong' } trạng thái từng việc song song của
 *                     RIÊNG dự án đang mở (bảng project_substage_status — migration 605).
 *   onDoiTrangThai  – (stageId, trangThaiMoi) => void; có thì hiện nút đổi trạng thái.
 *
 * CÁCH VẼ CỘT LỒNG: cột lớn chạy NGANG, nối nhau bằng dấu «›» — đó là phần nối tiếp.
 * Việc song song xếp DỌC bên trong thẻ và cùng treo trên một thanh dọc bên trái.
 * Xếp ngang thành một hàng bi tròn thì mắt tự đọc ra thứ tự — đúng cái hiểu lầm
 * mà chế độ này sinh ra để xoá, nên cố ý không xếp ngang.
 */
import { sortAndDedupePipelineStages, pipelineStageSortKey } from '../lib/crmPipelineStages';
import { classifyCrmPostWonManagedKind } from '../lib/crmDealStageGate';
import { nhanCotLon } from '../lib/sxGopCot';

const KE_TIEP_TT = { chua: 'dang', dang: 'xong', xong: 'chua' };
const NHAN_TT = { chua: 'Chưa tới', dang: 'Đang làm', xong: 'Xong' };
const NHAN_TT_NGAN = { chua: 'Chưa', dang: 'Đang làm', xong: 'Xong' };

export default function PipelineStepper({
  stages = [],
  currentStageId,
  currentStageName,
  onMoveToStage,
  visitedStageIds = null,
  linearProgress = false,
  stageDates = null,
  nhomSongSong = false,
  trangThaiO = null,
  onDoiTrangThai = null,
}) {
  const sortedStages = sortAndDedupePipelineStages(stages);
  const curId = currentStageId != null ? String(currentStageId) : '';
  const currentStageIdx = sortedStages.findIndex((s) => String(s.id) === curId);
  const currentStage = currentStageIdx >= 0 ? sortedStages[currentStageIdx] : null;
  const curSortKey =
    currentStageIdx >= 0
      ? pipelineStageSortKey(currentStage, currentStageIdx)
      : null;
  const visited = visitedStageIds instanceof Set ? visitedStageIds : null;

  const stageIsPast = (s, i) => {
    const isCurrent = String(s.id) === curId;
    if (isCurrent) return false;
    const sortKey = pipelineStageSortKey(s, i);
    // Không tích các cột đứng sau cột hiện tại trên pipeline (tránh sync cũ làm ✓ Đàm phán/SX sau Thắng).
    if (curSortKey != null && sortKey > curSortKey) return false;
    // Chỉ bỏ ✓ trên cột SX/VC thật (sync_role) — không dùng heuristic tên «thiết kế»
    // kẻo «Đã cọc thiết kế» / «Đang trao đổi thiết kế» mất dấu đã qua.
    if (!linearProgress && classifyCrmPostWonManagedKind(s)) return false;
    if (visited?.has(String(s.id))) return true;
    return curSortKey != null && sortKey < curSortKey;
  };

  /** Trạng thái một việc song song: lấy từ bảng, chưa có dòng thì suy từ cột đang đứng. */
  const ttCua = (s) => (trangThaiO?.[String(s.id)] || (String(s.id) === curId ? 'dang' : 'chua'));

  /** Một bước trên stepper cổ điển — dùng cho CRM và cho pipeline chưa gán cột lớn. */
  const veBuoc = (s, i) => {
    const isCurrent = String(s.id) === curId;
    const isPast = stageIsPast(s, i);
    return (
      <div key={s.id} className="flex flex-col items-center shrink-0 px-1 w-[7.5rem]">
        <button
          type="button"
          onClick={() => onMoveToStage?.(s.id)}
          disabled={!onMoveToStage}
          className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200 shrink-0 ${
            onMoveToStage ? 'cursor-pointer' : 'cursor-default'
          } ${
            isPast
              ? 'bg-emerald-500 text-white shadow-sm'
              : isCurrent
                ? 'text-white shadow-lg ring-4 ring-blue-100'
                : 'border-2 border-gray-300 text-gray-400 hover:border-gray-400'
          }`}
          style={isCurrent ? { backgroundColor: s.color || '#3B82F6' } : {}}
          title={s.name}
        >
          {isPast ? '✓' : s.icon || i + 1}
        </button>
        <p
          className={`mt-2.5 text-[11px] text-center leading-snug w-full break-words hyphens-auto ${
            isCurrent
              ? 'font-bold'
              : isPast
                ? 'text-emerald-600 font-medium'
                : 'text-gray-500'
          }`}
          style={isCurrent ? { color: '#000000' } : undefined}
        >
          {s.name}
        </p>
        {stageDates?.[String(s.id)] ? (
          <p className="mt-0.5 text-[10px] tabular-nums text-gray-400 leading-none">
            {stageDates[String(s.id)]}
          </p>
        ) : null}
      </div>
    );
  };

  const noi = (xanh) => (
    <div className="flex items-center pt-5 w-10 shrink-0 px-1">
      <div className={`w-full h-0.5 ${xanh ? 'bg-emerald-400' : 'bg-gray-200'}`} />
    </div>
  );

  /** Chấm trạng thái của một việc song song. Bấm = chuyển dự án sang cột đó. */
  const veCham = (s, tt, here, to) => (
    <button
      type="button"
      onClick={() => onMoveToStage?.(s.id)}
      disabled={!onMoveToStage}
      title={`${s.name} — ${NHAN_TT[tt]}${here ? ' · thẻ dự án đang nằm ở cột này' : ''}${onMoveToStage ? '. Bấm để chuyển dự án sang cột này.' : ''}`}
      className={`${to ? 'h-7 w-7 text-[12px]' : 'h-5 w-5 text-[10px]'} shrink-0 rounded-full border-2 flex items-center justify-center font-bold transition-colors ${
        onMoveToStage ? 'cursor-pointer' : 'cursor-default'
      } ${
        tt === 'xong'
          ? 'border-emerald-500 bg-emerald-500 text-white'
          : tt === 'dang'
            ? 'border-transparent text-white'
            : 'border-gray-300 bg-white text-gray-400'
      } ${here ? 'ring-2 ring-violet-400 ring-offset-1' : ''}`}
      style={tt === 'dang' ? { backgroundColor: s.color || '#3B82F6' } : undefined}
    >
      {tt === 'xong' ? '✓' : tt === 'dang' ? '●' : ''}
    </button>
  );

  // Gom các cột LIÊN TIẾP cùng group_key thành một cột lớn. Danh sách đã sắp theo
  // order_index nên gom theo vị trí liền kề là đúng — không sắp lại lần nữa.
  const cumNhom = (() => {
    if (!nhomSongSong) return null;
    const ra = [];
    sortedStages.forEach((s, i) => {
      const k = String(s.group_key || '').trim();
      const cuoi = ra[ra.length - 1];
      if (k && cuoi && cuoi.key === k) { cuoi.buoc.push({ s, i }); return; }
      ra.push({
        key: k || `__rieng__${s.id}`,
        nhan: nhanCotLon(k) || s.name,
        buoc: [{ s, i }],
      });
    });
    return ra;
  })();

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      {cumNhom ? (
        <div className="flex items-start overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
          {cumNhom.map((g, gi) => {
            const nhieu = g.buoc.length > 1;
            const cuoiCum = g.buoc[g.buoc.length - 1];
            const buocSau = sortedStages[cuoiCum.i + 1];
            const noiXanh = buocSau ? stageIsPast(buocSau, cuoiCum.i + 1) : false;
            const xongHet = nhieu && g.buoc.every(({ s }) => ttCua(s) === 'xong');
            const dau = g.buoc[0];
            const soloPast = !nhieu && stageIsPast(dau.s, dau.i);
            const soloHere = !nhieu && String(dau.s.id) === curId;

            return (
              <div key={g.key} className="flex items-start shrink-0">
                <div
                  className={`shrink-0 overflow-hidden rounded-xl border bg-white ${
                    nhieu ? 'min-w-[13.5rem]' : 'min-w-[9rem]'
                  } ${
                    xongHet ? 'border-emerald-300' : nhieu ? 'border-violet-300' : 'border-gray-200'
                  }`}
                >
                  {/* Dải tiêu đề cột lớn — chỗ duy nhất mang tên giai đoạn nối tiếp. */}
                  <div
                    className={`flex items-center gap-1.5 border-b px-2.5 py-1.5 ${
                      xongHet
                        ? 'border-emerald-100 bg-emerald-50'
                        : nhieu
                          ? 'border-violet-100 bg-violet-50'
                          : 'border-gray-100 bg-gray-50'
                    }`}
                  >
                    <span
                      className={`shrink-0 rounded px-1.5 py-px text-[10px] font-bold tabular-nums text-white ${
                        xongHet ? 'bg-emerald-500' : nhieu ? 'bg-violet-500' : 'bg-slate-500'
                      }`}
                    >
                      {gi + 1}
                    </span>
                    <span className="whitespace-nowrap text-[11.5px] font-bold uppercase tracking-wide text-gray-800">
                      {g.nhan}
                    </span>
                    {nhieu && (
                      <span className="ml-auto whitespace-nowrap text-[9.5px] text-gray-400">
                        {g.buoc.length} việc song song
                      </span>
                    )}
                  </div>

                  {nhieu ? (
                    /* Việc song song: xếp DỌC, cùng treo trên một thanh dọc bên trái. */
                    <div className="relative flex flex-col gap-1.5 py-2 pl-6 pr-2.5">
                      <span
                        className="absolute left-[15px] top-4 bottom-4 w-0.5 rounded bg-violet-200"
                        aria-hidden="true"
                      />
                      {g.buoc.map(({ s }) => {
                        const tt = ttCua(s);
                        const here = String(s.id) === curId;
                        return (
                          <div key={s.id} className="relative flex items-center gap-2">
                            <span
                              className="absolute left-[-7px] top-1/2 h-0.5 w-[7px] bg-violet-200"
                              aria-hidden="true"
                            />
                            {veCham(s, tt, here, false)}
                            <span
                              className={`min-w-0 flex-1 text-[11px] leading-tight ${
                                tt === 'chua' ? 'text-gray-500' : 'font-semibold text-gray-900'
                              }`}
                              title={s.name}
                            >
                              {s.name}
                            </span>
                            {onDoiTrangThai && (
                              <button
                                type="button"
                                onClick={() => onDoiTrangThai(s.id, KE_TIEP_TT[tt] || 'dang')}
                                title="Bấm để đổi trạng thái việc song song này"
                                className={`shrink-0 cursor-pointer rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wide transition-colors ${
                                  tt === 'xong'
                                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                    : tt === 'dang'
                                      ? 'bg-teal-100 text-teal-700 hover:bg-teal-200'
                                      : 'bg-gray-100 text-gray-400 hover:bg-violet-100 hover:text-violet-600'
                                }`}
                              >
                                {NHAN_TT_NGAN[tt]}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-2.5 py-2.5">
                      {veCham(
                        dau.s,
                        soloPast ? 'xong' : soloHere ? 'dang' : 'chua',
                        false,
                        true,
                      )}
                      <span
                        className={`min-w-0 flex-1 text-[11.5px] leading-tight ${
                          soloHere ? 'font-semibold text-gray-900' : soloPast ? 'text-emerald-700' : 'text-gray-500'
                        }`}
                        title={dau.s.name}
                      >
                        {dau.s.name}
                      </span>
                    </div>
                  )}

                  {!nhieu && stageDates?.[String(dau.s.id)] ? (
                    <p className="border-t border-gray-100 px-2.5 py-1 text-[10px] tabular-nums text-gray-400">
                      {stageDates[String(dau.s.id)]}
                    </p>
                  ) : null}
                </div>

                {gi < cumNhom.length - 1 && (
                  <span
                    className={`flex w-6 shrink-0 items-start justify-center pt-2.5 text-[15px] leading-none ${
                      noiXanh ? 'text-emerald-500' : 'text-gray-300'
                    }`}
                    aria-hidden="true"
                  >
                    ›
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-start overflow-x-auto pb-2 -mx-1 px-1 gap-0.5 scrollbar-thin">
          {sortedStages.map((s, i) => {
            const connectorPast =
              i < sortedStages.length - 1 &&
              stageIsPast(sortedStages[i + 1], i + 1);
            return (
              <div key={s.id} className="flex items-start shrink-0">
                {veBuoc(s, i)}
                {i < sortedStages.length - 1 && noi(connectorPast)}
              </div>
            );
          })}
        </div>
      )}
      {curId && currentStageIdx < 0 && (
        <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Giai đoạn hiện tại trên hệ thống:{' '}
          <strong>{currentStage?.name || currentStageName || curId}</strong>
          {' '}
          (không nằm trong danh sách cột đang hiển thị — có thể cột đã tắt hoặc đổi pipeline).
        </p>
      )}
    </div>
  );
}
