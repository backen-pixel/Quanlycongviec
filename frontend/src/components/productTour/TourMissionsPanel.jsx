import { useEffect, useMemo } from 'react';
import { BookOpen, CheckCircle2, Circle, X, Play } from 'lucide-react';
import { listTourMissions, missionStepCount } from '../../lib/productTour/tourMissions';
import { isTourDone } from '../../lib/productTour/storage';

export default function TourMissionsPanel({ open, onClose, onStartTour }) {
  const missions = useMemo(() => listTourMissions(), []);
  const doneCount = useMemo(
    () => missions.filter((m) => isTourDone(m.tourId)).length,
    // re-read when panel opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [missions, open],
  );

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[99960] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Nhiệm vụ hướng dẫn CRM">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/45 cursor-pointer"
        aria-label="Đóng"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-sky-50 to-white">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900">Nhiệm vụ hướng dẫn CRM</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Tour trên màn hình — bấm từng nút theo bước.
                {' '}
                <span className="font-semibold text-sky-700">{doneCount}/{missions.length}</span>
                {' '}đã hoàn thành
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            aria-label="Đóng danh sách"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="h-1.5 bg-slate-100">
          <div
            className="h-full bg-sky-500 transition-all"
            style={{ width: `${missions.length ? (doneCount / missions.length) * 100 : 0}%` }}
          />
        </div>

        <ul className="max-h-[min(60vh,480px)] overflow-y-auto divide-y divide-slate-100 [scrollbar-width:thin]">
          {missions.map((m) => {
            const done = isTourDone(m.tourId);
            const steps = missionStepCount(m.tourId);
            return (
              <li key={m.id} className="px-5 py-3.5 flex items-start gap-3">
                <div className={`mt-0.5 shrink-0 ${done ? 'text-emerald-600' : 'text-slate-300'}`}>
                  {done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{m.title}</p>
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600">
                      {m.group}
                    </span>
                    {done && (
                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700">
                        Đã học
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{m.desc}</p>
                  <p className="text-[11px] text-slate-400 mt-1">{steps} bước</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onStartTour?.(m.tourId);
                  }}
                  className="shrink-0 h-9 px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 text-white bg-sky-600 hover:bg-sky-700 cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  {done ? 'Học lại' : 'Bắt đầu'}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
