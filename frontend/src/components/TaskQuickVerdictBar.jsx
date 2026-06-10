import { useState } from 'react';
import api from '../lib/api';
import { CheckCircle2, XCircle, MessageSquare } from 'lucide-react';

/**
 * Ghi chú nhanh: Đã đủ / Chưa (+ lý do bắt buộc khi Chưa).
 */
export default function TaskQuickVerdictBar({
  task,
  leadId,
  onUpdated,
  compact = false,
  className = '',
}) {
  const verdict = task?.quick_verdict || null;
  const [reasonDraft, setReasonDraft] = useState(task?.quick_verdict_reason || '');
  const [showReason, setShowReason] = useState(verdict === 'insufficient');
  const [saving, setSaving] = useState(false);

  const saveVerdict = async (nextVerdict, reasonText = '') => {
    if (!leadId || !task?.id) return;
    if (nextVerdict === 'insufficient' && !String(reasonText || '').trim()) {
      alert('Nhập lý do khi chọn «Chưa đủ»');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.put(`/crm/leads/${leadId}/tasks/${task.id}`, {
        quick_verdict: nextVerdict,
        quick_verdict_reason: nextVerdict === 'insufficient' ? String(reasonText).trim() : null,
      });
      const updated = data?.task || data;
      if (updated) onUpdated?.(updated);
      if (nextVerdict === 'sufficient') {
        setShowReason(false);
        setReasonDraft('');
      }
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không lưu được ghi chú nhanh');
    } finally {
      setSaving(false);
    }
  };

  const onPickInsufficient = () => {
    setShowReason(true);
    if (verdict === 'insufficient') return;
    setReasonDraft('');
  };

  const onConfirmInsufficient = () => {
    void saveVerdict('insufficient', reasonDraft);
  };

  return (
    <div className={`rounded-lg border border-sky-200 bg-sky-50/60 ${compact ? 'p-2' : 'p-3'} ${className}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <p className={`font-semibold text-sky-800 flex items-center gap-1 ${compact ? 'text-[10px]' : 'text-xs'}`}>
          <MessageSquare className="h-3.5 w-3.5" />
          Ghi chú nhanh — Đã đủ / Chưa?
        </p>
        {verdict === 'sufficient' && (
          <span className="text-[10px] font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">✓ Đã đủ</span>
        )}
        {verdict === 'insufficient' && (
          <span className="text-[10px] font-medium text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full max-w-[200px] truncate"
            title={task.quick_verdict_reason || ''}>
            ✗ Chưa đủ
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => saveVerdict('sufficient')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer disabled:opacity-50 ${
            verdict === 'sufficient'
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> Đã đủ
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onPickInsufficient}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer disabled:opacity-50 ${
            verdict === 'insufficient'
              ? 'bg-amber-600 text-white border-amber-600'
              : 'bg-white text-amber-800 border-amber-300 hover:bg-amber-50'
          }`}
        >
          <XCircle className="h-3.5 w-3.5" /> Chưa
        </button>
      </div>

      {(showReason || verdict === 'insufficient') && (
        <div className="mt-2 space-y-1.5">
          <label className="text-[10px] font-medium text-amber-800">Lý do (bắt buộc khi chọn Chưa):</label>
          <textarea
            value={reasonDraft}
            onChange={(e) => setReasonDraft(e.target.value)}
            rows={2}
            placeholder="Ví dụ: thiếu file SketchUp, chưa đúng quy cách render…"
            className="w-full px-2 py-1.5 rounded border border-amber-200 text-xs outline-none focus:ring-2 focus:ring-amber-300 resize-y min-h-[52px] bg-white"
          />
          <button
            type="button"
            disabled={saving || !reasonDraft.trim()}
            onClick={onConfirmInsufficient}
            className="h-7 px-3 rounded-md text-[11px] font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 cursor-pointer"
          >
            Lưu «Chưa đủ»
          </button>
        </div>
      )}

      {verdict === 'insufficient' && task?.quick_verdict_reason && !showReason && (
        <p className="mt-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          <strong>Lý do:</strong> {task.quick_verdict_reason}
        </p>
      )}
    </div>
  );
}
