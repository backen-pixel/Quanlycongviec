import { AlertCircle, X, Lock } from 'lucide-react';

/**
 * Modal cảnh báo khi không thể chuyển giai đoạn vì còn nhiệm vụ chưa hoàn thành.
 * Hiển thị sau khi backend trả về code: 'CRM_BLOCKING_TASKS_INCOMPLETE'.
 *
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 *  - currentStageName: string
 *  - targetStageName: string
 *  - remainingTasks: [{ id, title, status, blocks_stage_advance? }]
 *  - onGoToTasks?: () => void  (optional: chuyển sang tab Nhiệm vụ của deal)
 */
export default function BlockingTasksAlertModal({
  open,
  onClose,
  currentStageName,
  targetStageName,
  remainingTasks = [],
  onGoToTasks,
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-4 flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1 text-white">
            <h3 className="text-base font-bold">⛔ Không thể chuyển giai đoạn</h3>
            <p className="text-xs mt-0.5 text-amber-50">
              Còn <b>{remainingTasks.length}</b> nhiệm vụ chưa hoàn thành ở giai đoạn
              {' '}<b>"{currentStageName || '—'}"</b>
            </p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1 rounded cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          <p className="text-sm text-gray-700 mb-3">
            Phải hoàn thành (hoặc đánh dấu hủy) <b>tất cả</b> nhiệm vụ dưới đây mới chuyển sang giai đoạn
            {' '}<b className="text-emerald-700">"{targetStageName || 'giai đoạn mới'}"</b>:
          </p>
          <div className="space-y-1.5">
            {remainingTasks.map((t, i) => (
              <div
                key={t.id || i}
                className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg"
              >
                <span className="text-xs font-bold text-amber-700 w-5 shrink-0">{i + 1}.</span>
                <span className="text-sm text-gray-800 flex-1 truncate" title={t.title}>{t.title}</span>
                {t.blocks_stage_advance && (
                  <span className="shrink-0 text-[10px] text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-semibold">
                    <Lock className="h-2.5 w-2.5" /> Chặn
                  </span>
                )}
                <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  t.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {t.status === 'in_progress' ? 'Đang làm' : 'Chờ'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-gray-50 border-t flex items-center justify-end gap-2">
          {onGoToTasks && (
            <button
              onClick={() => { onGoToTasks(); onClose?.(); }}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
            >
              📋 Mở tab Nhiệm vụ
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
