import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../lib/api';
import { publicFileUrl } from '../lib/publicFileUrl';
import KnowledgeMediaGallery from '../components/KnowledgeMediaGallery';
import KnowledgeSimulationPlayer from '../components/KnowledgeSimulationPlayer';
import { youtubeEmbedUrl } from '../lib/knowledgeMarkdown';
import {
  ChevronLeft, ChevronRight, CheckCircle2, Clock, Award, Loader2,
  PartyPopper, RotateCcw, BookOpen, ListChecks, ArrowRight, Trophy,
  XCircle,
} from 'lucide-react';
import { KNOWLEDGE_BACK_LINK_CLASS, knowledgeBackLinkStyle } from '../lib/knowledgeNavStyles';

function formatCorrectAnswer(q) {
  const indices = q.correct || [];
  if (!indices.length || !q.options?.length) return '—';
  return indices.map((i) => q.options[i]).filter(Boolean).join('; ');
}

function ExerciseMediaHeader({ exercise }) {
  const hasImage = !!exercise.image_url;
  const hasVideo = !!exercise.video_url;
  if (!hasImage && !hasVideo) return null;
  const embed = exercise.video_embed_id
    ? youtubeEmbedUrl(exercise.video_url, exercise.video_embed_id)
    : (exercise.video_type === 'youtube' || (exercise.video_url || '').match(/(youtu\.be|youtube\.com)/))
      ? youtubeEmbedUrl(exercise.video_url)
      : null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
      {hasImage && (
        <img src={publicFileUrl(exercise.image_url)} alt="" className="w-full aspect-video object-cover rounded-xl border border-gray-200" />
      )}
      {hasVideo && (
        <div className="aspect-video rounded-xl overflow-hidden bg-black border border-gray-200">
          {embed ? (
            <iframe src={embed} title="Video" className="w-full h-full" allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
          ) : (
            <video controls className="w-full h-full"><source src={exercise.video_url} /></video>
          )}
        </div>
      )}
    </div>
  );
}

function formatTimer(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function QuizPlayer({ exercise, onSubmit, submitting, onAnswersChange }) {
  const items = exercise.questions?.items || [];
  const [answers, setAnswers] = useState({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const current = items[currentIdx];

  useEffect(() => { onAnswersChange?.(answers); }, [answers, onAnswersChange]);

  const answered = useMemo(
    () => items.filter((q) => {
      const a = answers[q.id];
      if (q.type === 'multiple') return Array.isArray(a) && a.length > 0;
      return a !== undefined && a !== null;
    }).length,
    [answers, items],
  );

  const setAnswer = (qId, value) => setAnswers((prev) => ({ ...prev, [qId]: value }));

  const toggleMultiple = (qId, optionIdx) => {
    const prev = answers[qId] || [];
    const next = prev.includes(optionIdx) ? prev.filter((x) => x !== optionIdx) : [...prev, optionIdx];
    setAnswer(qId, next);
  };

  if (!items.length) {
    return <div className="text-center text-gray-500 py-12">Bài tập này chưa có câu hỏi.</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 lg:p-8">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-gray-500">
            Câu {currentIdx + 1} / {items.length}
          </span>
          <span className="text-xs text-gray-400">{answered} / {items.length} đã trả lời</span>
        </div>

        {current.type === 'multiple' ? (
          <div className="mb-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border-2 border-emerald-300 text-emerald-800 text-sm font-bold animate-in fade-in">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-emerald-600 text-white text-[11px]">✓✓</span>
            Câu này chọn nhiều đáp án
          </div>
        ) : (
          <div className="mb-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border-2 border-blue-300 text-blue-800 text-sm font-bold">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[11px]">●</span>
            Chọn 1 đáp án đúng
          </div>
        )}

        <h3 className="text-lg font-semibold mb-2 leading-relaxed" style={{ color: '#000000' }}>{current.question}</h3>

        {current.type === 'multiple' && (
          <p className="text-xs text-emerald-700 mb-4 italic">
            💡 Có thể có nhiều đáp án đúng — hãy tick tất cả các đáp án bạn cho là đúng (đã chọn: <strong>{(answers[current.id] || []).length}</strong>).
          </p>
        )}

        {current.image_url && (
          <img src={publicFileUrl(current.image_url)} alt="Minh họa câu hỏi" className="w-full max-h-80 object-contain rounded-lg border bg-gray-50 mb-4" />
        )}

        <div className="space-y-2">
          {(current.options || []).map((opt, oi) => {
            const isMulti = current.type === 'multiple';
            const isSelected = isMulti
              ? (answers[current.id] || []).includes(oi)
              : answers[current.id] === oi;
            const selectedClass = isSelected
              ? (isMulti ? 'border-emerald-500 bg-emerald-50' : 'border-blue-500 bg-blue-50')
              : 'border-gray-100 hover:border-gray-300 bg-gray-50';
            return (
              <label
                key={oi}
                className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer border-2 transition-all ${selectedClass}`}
              >
                <input
                  type={isMulti ? 'checkbox' : 'radio'}
                  name={current.id}
                  checked={isSelected}
                  onChange={() => isMulti ? toggleMultiple(current.id, oi) : setAnswer(current.id, oi)}
                  className={`mt-0.5 w-4 h-4 ${isMulti ? 'accent-emerald-600' : 'accent-blue-600'}`}
                />
                <span className="text-sm text-gray-800 flex-1">{opt}</span>
              </label>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-6 pt-4 border-t">
          <button
            type="button"
            disabled={currentIdx === 0}
            onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40 flex items-center gap-1"
          >
            <ChevronLeft className="h-4 w-4" /> Câu trước
          </button>
          {currentIdx < items.length - 1 ? (
            <button
              type="button"
              onClick={() => setCurrentIdx((i) => i + 1)}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-1"
            >
              Câu tiếp <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={() => onSubmit(answers)}
              className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Nộp bài
            </button>
          )}
        </div>
      </div>

      <aside className="bg-white rounded-2xl border border-gray-200 p-4 h-fit lg:sticky lg:top-4">
        <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Danh sách câu hỏi</p>
        <div className="grid grid-cols-6 lg:grid-cols-4 gap-2">
          {items.map((q, idx) => {
            const a = answers[q.id];
            const isMulti = q.type === 'multiple';
            const isAnswered = isMulti ? Array.isArray(a) && a.length > 0 : a !== undefined && a !== null;
            const isCurrent = idx === currentIdx;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setCurrentIdx(idx)}
                title={isMulti ? 'Câu chọn nhiều đáp án' : 'Câu chọn 1 đáp án'}
                className={`relative h-9 rounded-lg text-sm font-medium border-2 transition-all ${
                  isCurrent
                    ? (isMulti ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-blue-600 text-white border-blue-600')
                    : isAnswered
                    ? (isMulti ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200')
                    : (isMulti ? 'bg-white text-gray-500 border-emerald-200 hover:border-emerald-400' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400')
                }`}
              >
                {idx + 1}
                {isMulti && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-600 text-white text-[8px] font-bold flex items-center justify-center border border-white">
                    +
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-3 space-y-1 text-[11px] text-gray-500">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded bg-blue-100 border border-blue-300"></span>
            Chọn 1 đáp án
          </div>
          <div className="flex items-center gap-1.5">
            <span className="relative inline-block w-3 h-3 rounded bg-emerald-100 border border-emerald-300">
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-600 text-white text-[6px] font-bold flex items-center justify-center">+</span>
            </span>
            Chọn nhiều đáp án
          </div>
        </div>
        <button
          type="button"
          disabled={submitting}
          onClick={() => onSubmit(answers)}
          className="mt-4 w-full px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {submitting ? 'Đang chấm...' : 'Nộp bài ngay'}
        </button>
      </aside>
    </div>
  );
}

function ChecklistPlayer({ exercise, onSubmit, submitting }) {
  const items = exercise.questions?.items || [];
  const [answers, setAnswers] = useState({});
  const done = items.filter((it) => answers[it.id]).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 lg:p-8">
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-500">Tiến độ checklist</span>
          <span className="font-semibold text-blue-600">{done}/{items.length}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="space-y-2">
        {items.map((it) => (
          <label
            key={it.id}
            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border-2 transition-all ${
              answers[it.id] ? 'border-green-500 bg-green-50' : 'border-gray-100 hover:border-gray-300 bg-gray-50'
            }`}
          >
            <input
              type="checkbox"
              checked={!!answers[it.id]}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [it.id]: e.target.checked }))}
            />
            <span className={`text-sm ${answers[it.id] ? 'line-through text-gray-500' : 'text-gray-800'}`}>
              {it.text}
            </span>
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={submitting || done === 0}
        onClick={() => onSubmit(answers)}
        className="mt-6 w-full px-5 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
        Xác nhận hoàn thành ({done}/{items.length})
      </button>
    </div>
  );
}

function EssayPlayer({ exercise, onSubmit, submitting }) {
  const [text, setText] = useState('');
  const prompt = exercise.questions?.prompt || exercise.instructions;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 lg:p-8">
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-4 text-sm text-amber-900">
        <p className="font-medium mb-1">Đề bài</p>
        <p>{prompt || 'Trình bày suy nghĩ của bạn về chủ đề bài học.'}</p>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        className="w-full border border-gray-200 rounded-xl p-4 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        placeholder="Nhập bài làm của bạn..."
      />
      <p className="text-xs text-gray-400 mt-1">{text.length} ký tự · {text.split(/\s+/).filter(Boolean).length} từ</p>
      <button
        type="button"
        disabled={submitting || !text.trim()}
        onClick={() => onSubmit({ essay: text })}
        className="mt-4 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Nộp bài'}
      </button>
    </div>
  );
}

function ResultScreen({ result, exercise, onRetry, onBack, onGoNext }) {
  const passed = result.status === 'passed';
  const score = result.score ?? 0;
  const items = exercise.questions?.items || [];
  const nextLesson = result?.next_lesson || null;
  const nextLocked = nextLesson?.is_locked;

  return (
    <div className="max-w-3xl mx-auto">
      <div className={`bg-white rounded-2xl border-2 ${passed ? 'border-green-300' : 'border-amber-300'} p-8 text-center mb-6`}>
        <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-4 ${passed ? 'bg-green-100' : 'bg-amber-100'}`}>
          {passed ? <PartyPopper className="h-10 w-10 text-green-600" /> : <Award className="h-10 w-10 text-amber-600" />}
        </div>
        <h2 className="text-2xl font-bold" style={{ color: '#000000' }}>
          {passed ? 'Chúc mừng! Bạn đã đạt.' : 'Chưa đạt — hãy thử lại nhé!'}
        </h2>
        {exercise.type !== 'essay' && (
          <>
            <p className="text-5xl font-bold mt-4 mb-2" style={{ color: '#000000' }}>{score}%</p>
            <p className="text-sm text-gray-500">
              Yêu cầu tối thiểu: <strong>{exercise.passing_score ?? 70}%</strong>
            </p>
          </>
        )}
        {exercise.type === 'essay' && (
          <p className="text-gray-600 mt-2">Bài đã được gửi tới quản trị viên để chấm điểm.</p>
        )}
        {result.submitted_late && (
          <p className="mt-3 text-sm text-red-600 font-medium flex items-center justify-center gap-1">
            ⚠ Nộp sau hạn quy định của khoá học
          </p>
        )}
        {result.submitted_late === false && passed && (
          <p className="mt-3 text-sm text-emerald-600 font-medium">✓ Nộp đúng hạn</p>
        )}
      </div>

      {exercise.type === 'simulation' && (result.details || []).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: '#000000' }}>
            <ListChecks className="h-5 w-5 text-blue-600" /> Chi tiết từng bước thao tác
          </h3>
          {result.required_failed && (
            <p className="mb-4 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
              Có bước <strong>bắt buộc</strong> chưa đạt nên bài chưa qua, dù tổng điểm có thể trên {exercise.passing_score ?? 70}%.
              Xem các bước gắn nhãn «bắt buộc» bên dưới rồi làm lại.
            </p>
          )}
          <ul className="space-y-2">
            {(result.details || []).map((d, idx) => (
              <li
                key={d.id}
                className={`flex items-start gap-3 p-3 rounded-lg border ${
                  d.correct ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                }`}
              >
                <span className="mt-0.5 shrink-0">
                  {d.correct ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: '#000000' }}>
                    {idx + 1}. {d.label}
                    {d.required && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold align-middle">
                        bắt buộc
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {d.correct ? `Đạt · +${d.points} điểm` : `Chưa đạt · 0/${d.points} điểm`}
                    {!d.correct && d.hint ? ` — ${d.hint}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {exercise.type === 'quiz' && items.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: '#000000' }}>
            <ListChecks className="h-5 w-5 text-blue-600" /> Chi tiết bài làm
          </h3>
          <ul className="space-y-3">
            {items.map((q, idx) => {
              const userAns = result.answers?.[q.id];
              const isMulti = q.type === 'multiple';
              const userText = isMulti
                ? (Array.isArray(userAns) ? userAns.map((i) => q.options?.[i]).filter(Boolean).join(', ') : '—')
                : (typeof userAns === 'number' ? q.options?.[userAns] : (userAns !== undefined && userAns !== null ? q.options?.[Number(userAns)] : '—'));
              const detail = (result.details || []).find((d) => d.id === q.id);
              const isOk = detail?.correct === true;
              return (
                <li
                  key={q.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    isOk ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                  }`}
                >
                  <span className="mt-0.5 shrink-0">
                    {isOk ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <p className="text-sm font-medium flex-1 min-w-0" style={{ color: '#000000' }}>
                        {idx + 1}. {q.question}
                      </p>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${
                        isMulti ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-blue-100 text-blue-700 border border-blue-300'
                      }`}>
                        {isMulti ? 'Chọn nhiều' : 'Chọn 1'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700 mt-1">
                      Bạn chọn: <span className="font-medium">{userText || '—'}</span>
                    </p>
                    <p className="text-xs text-gray-700 mt-0.5">
                      Đáp án đúng: <span className="font-semibold text-green-800">{formatCorrectAnswer(q)}</span>
                    </p>
                    {q.explanation && (
                      <p className="text-xs text-amber-900 mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                        {q.explanation}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {passed && nextLesson && (
        <div className="mt-6 bg-gradient-to-r from-blue-50 via-sky-50 to-emerald-50 border-2 border-blue-200 rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <BookOpen className="h-6 w-6 text-blue-600" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Bài học tiếp theo</p>
            <p className="text-base font-bold text-gray-900 line-clamp-1">{nextLesson.title}</p>
            {nextLocked && (
              <p className="text-xs text-amber-700 mt-0.5">🔒 {nextLesson.unlock_reason || 'Còn bài tập cần hoàn thành'}</p>
            )}
          </div>
          {!nextLocked ? (
            <button
              type="button"
              onClick={() => onGoNext?.(nextLesson)}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-sky-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-sky-700 shadow flex items-center gap-2 shrink-0"
            >
              Học bài tiếp theo →
            </button>
          ) : (
            <div className="px-4 py-2.5 rounded-xl bg-amber-100 text-amber-700 text-sm font-medium flex items-center gap-2 shrink-0">
              🔒 Đang khoá
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mt-6">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 flex items-center justify-center gap-2"
        >
          <BookOpen className="h-4 w-4" /> Quay lại bài học
        </button>
        {!passed && exercise.type !== 'essay' && (
          <button
            type="button"
            onClick={onRetry}
            className="flex-1 px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center justify-center gap-2"
          >
            <RotateCcw className="h-4 w-4" /> Làm lại
          </button>
        )}
      </div>
    </div>
  );
}

export default function KnowledgeExercisePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const lessonIdFromNav = location.state?.lessonId || null;
  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [started, setStarted] = useState(false);
  const [autoSubmitting, setAutoSubmitting] = useState(false);
  const timerRef = useRef(null);
  const answersRef = useRef({});

  const timeLimitSec = (exercise?.time_limit_minutes || 0) * 60;
  const remaining = timeLimitSec ? Math.max(0, timeLimitSec - elapsed) : null;

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (!started || result) return undefined;
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [started, result]);

  useEffect(() => {
    if (!timeLimitSec || result || !started) return;
    if (remaining === 0 && !autoSubmitting) {
      setAutoSubmitting(true);
      submit(answersRef.current || {});
    }
  }, [remaining, timeLimitSec, result, started]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/knowledge/exercises/${id}`);
      setExercise(data);
    } catch (e) {
      const backLesson = lessonIdFromNav || e.response?.data?.lesson_id || null;
      const goBack = () => {
        if (backLesson) navigate(`/knowledge/lessons/${backLesson}`);
        else navigate('/knowledge');
      };
      if (e.response?.status === 423 && e.response?.data?.locked) {
        const data = e.response.data;
        const msg = data.error || 'Bài tập đang khoá';
        if (data.requires_lesson_view && data.lesson_id) {
          alert(`${msg}.\n\nBạn sẽ được chuyển về trang bài học để đọc trước.`);
          navigate(`/knowledge/lessons/${data.lesson_id}`);
        } else if (data.prev_lesson_id) {
          alert(msg);
          navigate(`/knowledge/lessons/${data.prev_lesson_id}`);
        } else {
          alert(msg);
          goBack();
        }
      } else if (!e.response) {
        console.error(e);
        alert('Không thể tải bài tập. Vui lòng thử lại.');
        goBack();
      } else {
        alert(e.response?.data?.error || 'Không tìm thấy bài tập');
        goBack();
      }
    }
    setLoading(false);
  };

  const submit = async (answers) => {
    setSubmitting(true);
    try {
      const { data } = await api.post(`/knowledge/exercises/${id}/submit`, { answers });
      setResult({ ...data, answers });
      clearInterval(timerRef.current);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi nộp bài');
    }
    setSubmitting(false);
  };

  const closeCertBanner = () => setResult((r) => (r ? { ...r, certificate_issued: null } : r));

  const retry = () => {
    setResult(null);
    setElapsed(0);
    setStarted(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!exercise) return null;

  const lessonId = exercise.lesson_id || exercise.lesson?.id;
  const backUrl = lessonId ? `/knowledge/lessons/${lessonId}` : '/knowledge';

  if (result) {
    return (
      <div className="max-w-5xl mx-auto py-6">
        {result.certificate_issued && (
          <div className="mb-6 relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 text-white p-5 shadow-xl">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
            <div className="relative flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                <Trophy className="h-7 w-7" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold uppercase tracking-widest opacity-90">🎉 Mở khoá chứng nhận</p>
                <h3 className="text-lg font-bold mt-0.5">Bạn vừa hoàn thành toàn bộ khoá học!</h3>
                <p className="text-sm opacity-90 mt-1">
                  Mã chứng nhận: <strong className="font-mono">{result.certificate_issued.certificate_number}</strong>
                </p>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <Link
                  to={`/knowledge/certificates/${result.certificate_issued.id}`}
                  className="px-4 py-2 bg-white text-amber-700 rounded-lg text-sm font-bold hover:bg-amber-50 flex items-center gap-1"
                >
                  <Award className="h-4 w-4" /> Xem
                </Link>
                <button
                  type="button"
                  onClick={closeCertBanner}
                  className="text-xs text-white/80 hover:text-white"
                >
                  Ẩn
                </button>
              </div>
            </div>
          </div>
        )}
        <ResultScreen
          result={result}
          exercise={exercise}
          onRetry={retry}
          onBack={() => navigate(backUrl)}
          onGoNext={(nl) => navigate(`/knowledge/lessons/${nl.id}`)}
        />
      </div>
    );
  }

  if (!started) {
    const items = exercise.questions?.items || [];
    const simSteps = exercise.questions?.steps || [];
    const itemCount = exercise.type === 'essay' ? 1 : exercise.type === 'simulation' ? simSteps.length : items.length;
    const typeLabel = exercise.type === 'quiz' ? 'Trắc nghiệm'
      : exercise.type === 'checklist' ? 'Checklist thực hành'
      : exercise.type === 'simulation' ? 'Mô phỏng thao tác'
      : 'Tự luận';

    return (
      <div className="max-w-2xl mx-auto py-12">
        <Link to={backUrl} className={`${KNOWLEDGE_BACK_LINK_CLASS} mb-6`} style={knowledgeBackLinkStyle}>
          <ChevronLeft className="h-4 w-4" /> Quay lại bài học
        </Link>
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-purple-100 flex items-center justify-center mb-4">
            <ListChecks className="h-10 w-10 text-purple-600" />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#000000' }}>{exercise.title}</h1>
          {exercise.instructions && <p className="text-gray-600 mt-3">{exercise.instructions}</p>}

          <div className="mt-6 text-left">
            <ExerciseMediaHeader exercise={exercise} />
            <KnowledgeMediaGallery items={exercise.attachments} title="Tài liệu tham khảo" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 text-left">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Loại</p>
              <p className="text-sm font-semibold" style={{ color: '#000000' }}>{typeLabel}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">{exercise.type === 'simulation' ? 'Số bước' : 'Số câu'}</p>
              <p className="text-sm font-semibold" style={{ color: '#000000' }}>{itemCount}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Điểm đạt</p>
              <p className="text-sm font-semibold" style={{ color: '#000000' }}>{exercise.passing_score ?? 70}%</p>
            </div>
            <div className={`p-3 rounded-lg ${exercise.time_limit_minutes ? 'bg-red-50' : 'bg-gray-50'}`}>
              <p className={`text-xs ${exercise.time_limit_minutes ? 'text-red-600' : 'text-gray-500'}`}>Thời gian</p>
              <p className="text-sm font-semibold" style={{ color: '#000000' }}>{exercise.time_limit_minutes ? `${exercise.time_limit_minutes} phút` : 'Không giới hạn'}</p>
            </div>
          </div>

          {exercise.time_limit_minutes && (
            <p className="text-xs text-red-600 mt-3 bg-red-50 border border-red-200 rounded-lg p-2">
              ⏱️ Bài này có giới hạn thời gian — hết giờ sẽ tự động nộp bài.
            </p>
          )}

          {exercise.max_attempts && (
            <p className="text-xs text-amber-600 mt-3">
              Bạn đã làm <strong>{exercise.attempt_count || 0}</strong> / {exercise.max_attempts} lượt cho phép.
            </p>
          )}

          <button
            type="button"
            onClick={() => setStarted(true)}
            disabled={exercise.max_attempts && exercise.attempt_count >= exercise.max_attempts}
            className="mt-6 px-8 py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 disabled:opacity-50 inline-flex items-center gap-2"
          >
            Bắt đầu làm bài <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${exercise.type === 'simulation' ? 'max-w-7xl' : 'max-w-5xl'} mx-auto py-4`}>
      <div className="flex items-center justify-between mb-6">
        <Link to={backUrl} className={KNOWLEDGE_BACK_LINK_CLASS} style={knowledgeBackLinkStyle}>
          <ChevronLeft className="h-4 w-4" /> Bài học
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {timeLimitSec ? (
            <span className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border font-mono font-semibold ${
              remaining <= 60 ? 'bg-red-50 border-red-300 text-red-700 animate-pulse' :
              remaining <= 180 ? 'bg-amber-50 border-amber-300 text-amber-700' :
              'bg-white border-gray-200 text-gray-700'
            }`}>
              <Clock className="h-4 w-4" /> Còn lại {formatTimer(remaining)}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-gray-600 bg-white px-3 py-1.5 rounded-lg border">
              <Clock className="h-4 w-4" /> {formatTimer(elapsed)}
            </span>
          )}
        </div>
      </div>

      <h1 className="text-xl font-bold text-gray-900 mb-4">{exercise.title}</h1>

      <ExerciseMediaHeader exercise={exercise} />

      {exercise.type === 'quiz' && <QuizPlayer exercise={exercise} onSubmit={submit} submitting={submitting} onAnswersChange={(a) => { answersRef.current = a; }} />}
      {exercise.type === 'checklist' && <ChecklistPlayer exercise={exercise} onSubmit={submit} submitting={submitting} />}
      {exercise.type === 'essay' && <EssayPlayer exercise={exercise} onSubmit={submit} submitting={submitting} />}
      {exercise.type === 'simulation' && (
        <KnowledgeSimulationPlayer
          exercise={exercise}
          onSubmit={submit}
          submitting={submitting}
          onAnswersChange={(a) => { answersRef.current = a; }}
        />
      )}

      <KnowledgeMediaGallery items={exercise.attachments} title="Tài liệu tham khảo" />
    </div>
  );
}
