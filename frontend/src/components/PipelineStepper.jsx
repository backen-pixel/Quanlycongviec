/**
 * Shared MISA-style pipeline stepper used by both LeadDetail and ProductionDetail.
 * Props:
 *   stages        – array of stage objects { id, name, color, icon, order_index }
 *   currentStageId – id of the currently active stage
 *   onMoveToStage  – (stageId) => void  called when a step circle is clicked
 *   currentStageName – tên stage khi stage_id không có trong `stages` (orphan)
 */
import { sortAndDedupePipelineStages, pipelineStageSortKey } from '../lib/crmPipelineStages';

export default function PipelineStepper({
  stages = [],
  currentStageId,
  currentStageName,
  onMoveToStage,
}) {
  const sortedStages = sortAndDedupePipelineStages(stages);
  const curId = currentStageId != null ? String(currentStageId) : '';
  const currentStageIdx = sortedStages.findIndex((s) => String(s.id) === curId);
  const currentStage = currentStageIdx >= 0 ? sortedStages[currentStageIdx] : null;
  const curSortKey =
    currentStageIdx >= 0
      ? pipelineStageSortKey(currentStage, currentStageIdx)
      : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-start justify-between overflow-x-auto pb-1">
        {sortedStages.map((s, i) => {
          const isCurrent = String(s.id) === curId;
          const sortKey = pipelineStageSortKey(s, i);
          const isPast =
            curSortKey != null && !isCurrent && sortKey < curSortKey;
          const connectorPast =
            curSortKey != null &&
            i < sortedStages.length - 1 &&
            pipelineStageSortKey(sortedStages[i + 1], i + 1) <= curSortKey;

          return (
            <div key={s.id} className="flex items-start flex-1 min-w-0">
              <div className="flex flex-col items-center flex-shrink-0" style={{ minWidth: 70 }}>
                <button
                  type="button"
                  onClick={() => onMoveToStage?.(s.id)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200 cursor-pointer ${
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
                  className={`mt-2 text-xs text-center leading-tight max-w-[80px] ${
                    isCurrent
                      ? 'text-gray-900 font-bold'
                      : isPast
                        ? 'text-emerald-600 font-medium'
                        : 'text-gray-500'
                  }`}
                >
                  {s.name}
                </p>
              </div>

              {i < sortedStages.length - 1 && (
                <div className="flex-1 flex items-center pt-5 px-1 min-w-[12px]">
                  <div
                    className={`w-full h-0.5 ${connectorPast ? 'bg-emerald-400' : 'bg-gray-200'}`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
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
