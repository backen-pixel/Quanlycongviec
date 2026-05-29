import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { Clock, AlertTriangle, CheckCircle2, BookOpen, ClipboardList, Loader2, History } from 'lucide-react';

export function formatDeadlineDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Banner hạn hoàn thành khoá — nhận object `deadline` từ API computeUserDeadline */
export function KnowledgeDeadlineBanner({ deadline, compact = false }) {
  if (!deadline?.supported || deadline.mode === 'none' || !deadline.deadline_at) return null;

  const days = deadline.days_remaining;
  const overdue = deadline.is_overdue;
  const urgent = !overdue && days != null && days <= 3;

  const bg = overdue
    ? 'from-red-50 to-rose-50 border-red-300'
    : urgent
      ? 'from-amber-50 to-orange-50 border-amber-300'
      : 'from-sky-50 to-blue-50 border-sky-200';

  const textMain = overdue ? 'text-red-900' : urgent ? 'text-amber-900' : 'text-sky-900';
  const textSub = overdue ? 'text-red-700' : urgent ? 'text-amber-700' : 'text-sky-700';

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
          overdue ? 'bg-red-100 text-red-700' : urgent ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'
        }`}
        title={`Hạn: ${formatDeadlineDate(deadline.deadline_at)}`}
      >
        {overdue ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
        {overdue ? `Quá hạn ${Math.abs(days)} ngày` : days === 0 ? 'Hết hạn hôm nay' : `Còn ${days} ngày`}
      </span>
    );
  }

  return (
    <div className={`rounded-xl border-2 bg-gradient-to-r ${bg} p-4 mb-4`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
          overdue ? 'bg-red-200 text-red-700' : urgent ? 'bg-amber-200 text-amber-700' : 'bg-sky-200 text-sky-700'
        }`}>
          {overdue ? <AlertTriangle className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${textMain}`}>
            {overdue ? 'Đã quá hạn hoàn thành khoá học' : 'Hạn hoàn thành khoá học'}
          </p>
          <p className={`text-xs mt-0.5 ${textSub}`}>
            Hạn chót: <strong>{formatDeadlineDate(deadline.deadline_at)}</strong>
            {deadline.mode === 'relative' && deadline.duration_days && (
              <span className="opacity-80"> · {deadline.duration_days} ngày kể từ khi bắt đầu</span>
            )}
          </p>
          {!overdue && days != null && (
            <p className={`text-xs mt-1 font-semibold ${urgent ? 'text-amber-800' : 'text-sky-800'}`}>
              ⏳ Còn {days === 0 ? 'hôm nay' : `${days} ngày`} để hoàn thành
            </p>
          )}
          {overdue && (
            <p className="text-xs mt-1 text-red-600 font-medium">
              Bạn vẫn có thể học tiếp — các hoạt động sau hạn sẽ được ghi nhận là &quot;trễ hạn&quot;.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const EVENT_META = {
  lesson_started: { icon: BookOpen, label: 'Bắt đầu học', color: 'text-blue-600 bg-blue-50' },
  lesson_completed: { icon: CheckCircle2, label: 'Hoàn thành bài học', color: 'text-emerald-600 bg-emerald-50' },
  exercise_submitted: { icon: ClipboardList, label: 'Nộp bài tập', color: 'text-purple-600 bg-purple-50' },
};

function TimelineEvent({ ev }) {
  const meta = EVENT_META[ev.type] || EVENT_META.lesson_started;
  const Icon = meta.icon;
  const isGraded = ev.type === 'exercise_submitted';

  return (
    <li className="flex gap-3 relative">
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${meta.color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="w-px flex-1 bg-gray-200 min-h-[12px] mt-1" />
      </div>
      <div className="flex-1 pb-4 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500">{meta.label}</span>
          {ev.is_late ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">Trễ hạn</span>
          ) : (ev.type === 'lesson_completed' || ev.type === 'exercise_submitted') && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">Đúng hạn</span>
          )}
        </div>
        <p className="text-sm font-medium text-gray-900 line-clamp-2 mt-0.5">{ev.title}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          {formatDeadlineDate(ev.at)}
          {isGraded && ev.score != null && (
            <span className="ml-2">
              · Điểm: <strong className={ev.status === 'passed' ? 'text-emerald-600' : 'text-amber-600'}>{ev.score}%</strong>
              {ev.attempt_number > 1 && ` (lần ${ev.attempt_number})`}
            </span>
          )}
        </p>
        {ev.lesson_id && isGraded && (
          <Link to={`/knowledge/lessons/${ev.lesson_id}`} className="text-[11px] text-violet-600 hover:underline mt-0.5 inline-block">
            Xem bài học
          </Link>
        )}
      </div>
    </li>
  );
}

/** Lịch học + bài tập theo thời gian (on_time / late) */
export function KnowledgeLearningTimeline({ categoryId, title = 'Lịch học của bạn' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!categoryId) return;
    setLoading(true);
    api.get(`/knowledge/categories/${categoryId}/learning-timeline`)
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [categoryId]);

  if (!categoryId) return null;
  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!data?.timeline?.length) {
    return (
      <p className="text-sm text-gray-400 text-center py-4">Chưa có hoạt động học tập nào được ghi nhận.</p>
    );
  }

  const events = expanded ? data.timeline : data.timeline.slice(0, 8);
  const summary = data.summary || {};

  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <History className="h-4 w-4 text-violet-600" /> {title}
        </h3>
        <div className="flex gap-2 text-[10px] font-semibold">
          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">✓ Đúng hạn: {summary.on_time || 0}</span>
          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700">⚠ Trễ: {summary.late || 0}</span>
        </div>
      </div>

      {data.deadline?.supported && data.deadline.mode !== 'none' && (
        <div className="px-4 pt-3">
          <KnowledgeDeadlineBanner deadline={data.deadline} compact />
        </div>
      )}

      <ul className="px-4 pt-3 pb-2">
        {events.map((ev, i) => (
          <TimelineEvent key={`${ev.type}-${ev.at}-${i}`} ev={ev} />
        ))}
      </ul>

      {data.timeline.length > 8 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full py-2 text-xs text-violet-600 font-medium hover:bg-violet-50 border-t"
        >
          {expanded ? 'Thu gọn' : `Xem thêm ${data.timeline.length - 8} hoạt động`}
        </button>
      )}
    </section>
  );
}
