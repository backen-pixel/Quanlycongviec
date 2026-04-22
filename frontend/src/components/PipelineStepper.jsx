/**
 * Shared MISA-style pipeline stepper used by both LeadDetail and ProductionDetail.
 * Props:
 *   stages        – array of stage objects { id, name, color, icon }
 *   currentStageId – id of the currently active stage
 *   onMoveToStage  – (stageId) => void  called when a step circle is clicked
 */
export default function PipelineStepper({ stages = [], currentStageId, onMoveToStage }) {
  const currentStageIdx = stages.findIndex((s) => s.id === currentStageId);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-start justify-between overflow-x-auto">
        {stages.map((s, i) => {
          const isCurrent = s.id === currentStageId;
          const isPast = i < currentStageIdx;

          return (
            <div key={s.id} className="flex items-start flex-1 min-w-0">
              {/* Step: circle + name */}
              <div className="flex flex-col items-center flex-shrink-0" style={{ minWidth: 70 }}>
                <button
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

              {/* Connecting line */}
              {i < stages.length - 1 && (
                <div className="flex-1 flex items-center pt-5 px-1">
                  <div className={`w-full h-0.5 ${isPast ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
