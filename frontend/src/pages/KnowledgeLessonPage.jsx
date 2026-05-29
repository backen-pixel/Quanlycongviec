import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { renderMarkdownLines, youtubeEmbedUrl, estimateReadingTime } from '../lib/knowledgeMarkdown';
import KnowledgeMediaGallery from '../components/KnowledgeMediaGallery';
import { KnowledgeDeadlineBanner } from '../components/KnowledgeDeadline';
import {
  BookOpen, Video, ClipboardList, CheckCircle2, ChevronLeft, ChevronRight,
  PlayCircle, Loader2, Clock, Award, ArrowRight, ListChecks,
  Bookmark, Star, Tag, AlertCircle, MessageSquare, Trophy, X,
} from 'lucide-react';

function StarRow({ value, onClick, size = 'h-5 w-5' }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onClick}
          onClick={() => onClick?.(n)}
          className={onClick ? 'hover:scale-110 transition-transform cursor-pointer' : 'cursor-default'}
        >
          <Star className={`${size} ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
        </button>
      ))}
    </div>
  );
}

function RatingSection({ lesson, onChange }) {
  const [rating, setRating] = useState(lesson.my_rating?.rating || 0);
  const [comment, setComment] = useState(lesson.my_rating?.comment || '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!rating) return;
    setSaving(true);
    try {
      await api.post(`/knowledge/lessons/${lesson.id}/rate`, { rating, comment });
      onChange?.();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
    setSaving(false);
  };

  return (
    <section className="mt-8 bg-white rounded-2xl border border-gray-200 p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-amber-500" /> Đánh giá bài học
      </h2>
      {lesson.rating_count > 0 ? (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <StarRow value={Math.round(lesson.rating_avg || 0)} />
          <span className="font-semibold text-gray-900">{lesson.rating_avg}</span>
          <span className="text-gray-400">({lesson.rating_count} đánh giá)</span>
        </div>
      ) : (
        <p className="text-sm text-gray-400 mb-4">Chưa có đánh giá nào — hãy là người đầu tiên.</p>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-sm font-medium text-amber-900 mb-2">Bạn thấy bài này thế nào?</p>
        <StarRow value={rating} onClick={setRating} size="h-7 w-7" />
        <textarea
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Nhận xét (tùy chọn)..."
          className="mt-3 w-full border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-amber-300"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!rating || saving}
          className="mt-3 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {saving ? 'Đang lưu...' : lesson.my_rating ? 'Cập nhật đánh giá' : 'Gửi đánh giá'}
        </button>
      </div>

      {(lesson.ratings || []).length > 0 && (
        <ul className="mt-5 space-y-3">
          {lesson.ratings.slice(0, 5).map((r2, i) => (
            <li key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-500 text-white flex items-center justify-center text-sm font-bold shrink-0">
                {(r2.user?.full_name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900">{r2.user?.full_name || 'Ẩn danh'}</p>
                  <StarRow value={r2.rating} size="h-3.5 w-3.5" />
                </div>
                {r2.comment && <p className="text-sm text-gray-600 mt-1">{r2.comment}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const TABS = [
  { id: 'text', label: 'Văn bản', icon: BookOpen },
  { id: 'video', label: 'Video', icon: Video },
];

export default function KnowledgeLessonPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('text');
  const [completing, setCompleting] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [siblingLessons, setSiblingLessons] = useState([]);
  const [newCertificate, setNewCertificate] = useState(null);
  const [lockInfo, setLockInfo] = useState(null);
  const contentRef = useRef(null);

  useEffect(() => {
    loadLesson();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [id]);

  useEffect(() => {
    if (lesson?.category_id) loadSiblings(lesson.category_id);
  }, [lesson?.category_id]);

  useEffect(() => {
    const handler = () => {
      const el = contentRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height;
      const seen = Math.max(0, -rect.top + window.innerHeight);
      const pct = Math.min(100, Math.max(0, (seen / total) * 100));
      setScrollProgress(pct);
    };
    window.addEventListener('scroll', handler, { passive: true });
    handler();
    return () => window.removeEventListener('scroll', handler);
  }, [lesson?.id, tab]);

  const loadLesson = async () => {
    setLoading(true);
    setLockInfo(null);
    try {
      const { data } = await api.get(`/knowledge/lessons/${id}`);
      setLesson(data);
      if (data.video_url && !data.content_md) setTab('video');
      else setTab('text');
    } catch (e) {
      if (e.response?.status === 423 && e.response?.data?.locked) {
        setLockInfo({
          reason: e.response.data.error || 'Bài học đang khoá',
          prev_lesson_id: e.response.data.prev_lesson_id || null,
        });
      } else {
        console.error(e);
      }
    }
    setLoading(false);
  };

  const loadSiblings = async (categoryId) => {
    try {
      const { data } = await api.get('/knowledge/lessons', { params: { category_id: categoryId } });
      setSiblingLessons(data.lessons || []);
    } catch {
      setSiblingLessons([]);
    }
  };

  const markComplete = async () => {
    setCompleting(true);
    try {
      const { data } = await api.post(`/knowledge/lessons/${id}/complete`);
      setLesson((l) => ({
        ...l,
        progress: { ...l.progress, status: 'completed' },
        next_lesson: data?.next_lesson || l.next_lesson || null,
      }));
      if (data?.certificate_issued) {
        setNewCertificate(data.certificate_issued);
      }
    } catch {
      alert('Lỗi');
    }
    setCompleting(false);
  };

  const toggleBookmark = async () => {
    try {
      const { data } = await api.post(`/knowledge/lessons/${id}/bookmark`);
      setLesson((l) => ({ ...l, is_bookmarked: data.is_bookmarked }));
    } catch {
      alert('Lỗi lưu bookmark');
    }
  };

  const { prevLesson, nextLesson } = useMemo(() => {
    if (!lesson || !siblingLessons.length) return { prevLesson: null, nextLesson: null };
    const idx = siblingLessons.findIndex((l) => l.id === lesson.id);
    return {
      prevLesson: idx > 0 ? siblingLessons[idx - 1] : null,
      nextLesson: idx < siblingLessons.length - 1 ? siblingLessons[idx + 1] : null,
    };
  }, [lesson, siblingLessons]);

  // Bài kế tiếp theo backend (kèm trạng thái khoá thật)
  const apiNextLesson = lesson?.next_lesson || null;

  const readingTime = useMemo(() => estimateReadingTime(lesson?.content_md), [lesson?.content_md]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (lockInfo) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <div className="rounded-3xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-8 text-center shadow-lg">
          <div className="w-20 h-20 mx-auto rounded-full bg-amber-100 flex items-center justify-center mb-4">
            <AlertCircle className="h-10 w-10 text-amber-500" />
          </div>
          <h2 className="text-2xl font-bold text-amber-900 mb-2">Bài học đang khoá</h2>
          <p className="text-amber-700 mb-6">{lockInfo.reason}</p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            {lockInfo.prev_lesson_id && (
              <Link
                to={`/knowledge/lessons/${lockInfo.prev_lesson_id}`}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl text-sm font-semibold hover:from-amber-600 hover:to-orange-600 shadow"
              >
                <ChevronLeft className="h-4 w-4" /> Đi đến bài học cần hoàn thành
              </Link>
            )}
            <Link
              to="/knowledge"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-amber-200 text-amber-700 rounded-xl text-sm font-medium hover:bg-amber-50"
            >
              ← Thư viện kiến thức
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p>Không tìm thấy bài học</p>
        <Link to="/knowledge" className="text-blue-600 text-sm mt-2 inline-block">← Quay lại thư viện</Link>
      </div>
    );
  }

  const embed = youtubeEmbedUrl(lesson.video_url, lesson.video_embed_id);
  const isCompleted = lesson.progress?.status === 'completed';
  const visibleTabs = TABS.filter((t) => {
    if (t.id === 'text') return !!lesson.content_md;
    if (t.id === 'video') return !!lesson.video_url;
    return false;
  });

  const hasExercises = (lesson.exercises || []).length > 0;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="fixed top-0 left-0 right-0 h-1 z-30 pointer-events-none">
        <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all" style={{ width: `${scrollProgress}%` }} />
      </div>

      {newCertificate && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="relative max-w-md w-full bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 rounded-3xl border-4 border-amber-300 shadow-2xl p-8 text-center">
            <button
              type="button"
              onClick={() => setNewCertificate(null)}
              className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-amber-100 text-amber-700"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shadow-lg animate-bounce">
              <Trophy className="h-10 w-10" />
            </div>
            <p className="mt-4 text-sm font-bold text-amber-700 uppercase tracking-widest">🎉 Chúc mừng!</p>
            <h2 className="mt-1 text-2xl font-bold text-gray-900">Bạn vừa nhận được chứng nhận</h2>
            <p className="mt-2 text-gray-600">
              Hoàn thành khoá học <strong>{lesson.category?.name}</strong>.
            </p>
            <p className="mt-3 font-mono text-sm bg-white border border-amber-200 rounded-lg py-1.5 px-3 inline-block text-amber-800">
              {newCertificate.certificate_number}
            </p>
            <div className="mt-5 flex gap-2 justify-center">
              <Link
                to={`/knowledge/certificates/${newCertificate.id}`}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg font-semibold hover:from-amber-600 hover:to-orange-600 flex items-center gap-2"
              >
                <Award className="h-4 w-4" /> Xem chứng nhận
              </Link>
              <button
                type="button"
                onClick={() => setNewCertificate(null)}
                className="px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Để sau
              </button>
            </div>
          </div>
        </div>
      )}

      <Link to="/knowledge" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-violet-600 mb-4">
        <ChevronLeft className="h-4 w-4" /> Thư viện kiến thức
      </Link>

      {lesson.deadline && <KnowledgeDeadlineBanner deadline={lesson.deadline} />}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <article ref={contentRef} className="min-w-0">
          <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 text-white p-8 mb-6 shadow-lg">
            {lesson.cover_image_url && (
              <>
                <img src={lesson.cover_image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-br from-violet-900/80 via-purple-900/70 to-fuchsia-900/80" />
              </>
            )}
            <div className="absolute -top-10 -right-10 w-60 h-60 bg-white/10 rounded-full blur-3xl" />
            <div className="relative">
              {lesson.category && (
                <Link to="/knowledge" className="inline-flex items-center gap-1 text-xs text-violet-100 hover:text-white bg-white/10 px-2 py-1 rounded-full">
                  {lesson.category.icon} {lesson.category.name}
                </Link>
              )}
              <div className="flex items-start justify-between gap-4 mt-3">
                <h1 className="text-3xl md:text-4xl font-bold flex-1">{lesson.title}</h1>
                <button
                  type="button"
                  onClick={toggleBookmark}
                  className={`shrink-0 p-2.5 rounded-full transition-all ${
                    lesson.is_bookmarked
                      ? 'bg-amber-400 text-white hover:bg-amber-500'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                  title={lesson.is_bookmarked ? 'Bỏ bookmark' : 'Lưu để xem sau'}
                >
                  <Bookmark className={`h-5 w-5 ${lesson.is_bookmarked ? 'fill-current' : ''}`} />
                </button>
              </div>
              {lesson.summary && <p className="text-violet-100 mt-3 text-lg leading-relaxed max-w-2xl">{lesson.summary}</p>}
              {(lesson.tags || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {lesson.tags.map((t) => (
                    <span key={t} className="text-xs px-2 py-0.5 bg-white/15 backdrop-blur-sm rounded-full inline-flex items-center gap-1">
                      <Tag className="h-3 w-3" /> {t}
                    </span>
                  ))}
                </div>
              )}
              {lesson.is_required && (
                <div className="mt-3 inline-flex items-center gap-2 bg-red-500/90 px-3 py-1 rounded-full text-sm font-semibold">
                  <AlertCircle className="h-4 w-4" /> Bài học bắt buộc
                </div>
              )}
              <div className="flex items-center gap-4 mt-4 text-sm flex-wrap">
                {lesson.rating_avg && (
                  <span className="flex items-center gap-1 bg-amber-400 text-amber-900 px-3 py-1 rounded-full font-semibold">
                    <Star className="h-4 w-4 fill-current" /> {lesson.rating_avg} ({lesson.rating_count})
                  </span>
                )}
                {readingTime > 0 && (
                  <span className="flex items-center gap-1 bg-white/10 px-3 py-1 rounded-full">
                    <Clock className="h-4 w-4" />
                    {lesson.duration_minutes || readingTime} phút đọc
                  </span>
                )}
                {hasExercises && (
                  <span className="flex items-center gap-1 bg-white/10 px-3 py-1 rounded-full">
                    <ClipboardList className="h-4 w-4" />
                    {lesson.exercises.length} bài tập
                  </span>
                )}
                {isCompleted && (
                  <span className="flex items-center gap-1 bg-green-500 px-3 py-1 rounded-full font-medium">
                    <CheckCircle2 className="h-4 w-4" /> Đã hoàn thành
                  </span>
                )}
              </div>
            </div>
          </header>

          {visibleTabs.length > 1 && (
            <div className="flex gap-1 border-b border-gray-200 mb-6">
              {visibleTabs.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                      tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          )}

          {tab === 'text' && lesson.content_md && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-none">
              {renderMarkdownLines(lesson.content_md)}
              <KnowledgeMediaGallery items={lesson.attachments} title="Tài liệu & media tham khảo" />
            </div>
          )}

          {tab === 'video' && lesson.video_url && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {embed ? (
                <div className="aspect-video">
                  <iframe
                    title={lesson.title}
                    src={embed}
                    className="w-full h-full"
                    allowFullScreen
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  />
                </div>
              ) : lesson.video_type === 'upload' ? (
                <video controls className="w-full max-h-[60vh] bg-black">
                  <source src={lesson.video_url} />
                </video>
              ) : (
                <div className="p-8 text-center">
                  <a href={lesson.video_url} target="_blank" rel="noreferrer" className="text-blue-600 flex items-center justify-center gap-2">
                    <PlayCircle className="h-6 w-6" /> Mở video
                  </a>
                </div>
              )}
              {lesson.content_md && (
                <div className="p-6 border-t border-gray-100 bg-gray-50">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <BookOpen className="h-4 w-4" /> Tóm tắt văn bản
                  </h3>
                  <div className="prose prose-sm">
                    {renderMarkdownLines(lesson.content_md.slice(0, 500))}
                  </div>
                  <button type="button" onClick={() => setTab('text')} className="text-blue-600 text-sm mt-2 hover:underline">
                    Xem đầy đủ →
                  </button>
                </div>
              )}
              {(lesson.attachments || []).length > 0 && (
                <div className="p-6 border-t border-gray-100">
                  <KnowledgeMediaGallery items={lesson.attachments} title="Tài liệu & media tham khảo" />
                </div>
              )}
            </div>
          )}

          {hasExercises && (
            <section className="mt-8">
              <h2 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-purple-600" />
                Bài tập kiểm tra ({lesson.exercises.length})
              </h2>
              <div className="grid gap-3">
                {lesson.exercises.map((ex, i) => (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => navigate(`/knowledge/exercises/${ex.id}`)}
                    className="text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-purple-300 hover:shadow-md transition-all flex items-start gap-3"
                  >
                    <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-700 font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{ex.title}</p>
                      <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-gray-100 rounded">
                          {ex.type === 'quiz' ? 'Trắc nghiệm' : ex.type === 'checklist' ? 'Checklist' : 'Tự luận'}
                        </span>
                        {ex.passing_score != null && (
                          <span className="flex items-center gap-1"><Award className="h-3 w-3" />Đạt {ex.passing_score}%</span>
                        )}
                        {ex.max_attempts && <span>Tối đa {ex.max_attempts} lượt</span>}
                      </p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-gray-400" />
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-4 bg-gradient-to-r from-blue-50 to-emerald-50 rounded-xl border border-blue-100">
            {isCompleted ? (
              <span className="flex items-center gap-2 text-green-700 font-medium flex-1">
                <CheckCircle2 className="h-5 w-5" /> Bạn đã hoàn thành bài học này.
              </span>
            ) : (
              <button
                type="button"
                onClick={markComplete}
                disabled={completing}
                className="flex-1 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Đánh dấu hoàn thành
              </button>
            )}
            {(() => {
              const target = apiNextLesson || nextLesson;
              if (!target) return null;
              const locked = apiNextLesson ? apiNextLesson.is_locked : (hasExercises && !isCompleted);
              if (locked) {
                return (
                  <div
                    className="px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium flex items-center gap-2 cursor-not-allowed"
                    title={apiNextLesson?.unlock_reason || 'Hãy hoàn thành bài học (và bài tập) trước khi sang bài kế tiếp'}
                  >
                    🔒 Cần hoàn thành bài học hiện tại
                  </div>
                );
              }
              return (
                <Link
                  to={`/knowledge/lessons/${target.id}`}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2"
                >
                  Học bài tiếp theo
                  <ChevronRight className="h-4 w-4" />
                </Link>
              );
            })()}
          </div>

          <RatingSection lesson={lesson} onChange={loadLesson} />

          <nav className="mt-4 flex items-center justify-between text-sm">
            {prevLesson ? (
              <Link to={`/knowledge/lessons/${prevLesson.id}`} className="text-gray-500 hover:text-blue-600 flex items-center gap-1">
                <ChevronLeft className="h-4 w-4" />
                <span className="line-clamp-1 max-w-[200px]">{prevLesson.title}</span>
              </Link>
            ) : <span />}
            {nextLesson && (
              <Link to={`/knowledge/lessons/${nextLesson.id}`} className="text-gray-500 hover:text-blue-600 flex items-center gap-1">
                <span className="line-clamp-1 max-w-[200px]">{nextLesson.title}</span>
                <ChevronRight className="h-4 w-4" />
              </Link>
            )}
          </nav>
        </article>

        <aside className="hidden lg:block">
          <div className="sticky top-4 space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-3">
                Bài học trong chủ đề
              </p>
              {siblingLessons.length === 0 ? (
                <p className="text-xs text-gray-400">Không có bài khác</p>
              ) : (
                <ul className="space-y-1">
                  {siblingLessons.map((l) => {
                    const locked = !!l.is_locked && l.id !== lesson.id;
                    const inner = (
                      <>
                        <span className="mt-0.5 shrink-0">
                          {l.progress_status === 'completed' ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          ) : locked ? (
                            <span className="text-amber-500 text-[12px] leading-none">🔒</span>
                          ) : (
                            <div className={`h-3.5 w-3.5 rounded-full border ${l.id === lesson.id ? 'border-blue-600 bg-blue-100' : 'border-gray-300'}`} />
                          )}
                        </span>
                        <span className={`line-clamp-2 ${locked ? 'text-gray-400' : ''}`}>{l.title}</span>
                      </>
                    );
                    return (
                      <li key={l.id}>
                        {locked ? (
                          <div
                            title={l.unlock_reason || 'Bài học đang khoá'}
                            className="flex items-start gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-400 cursor-not-allowed bg-gray-50"
                          >
                            {inner}
                          </div>
                        ) : (
                          <Link
                            to={`/knowledge/lessons/${l.id}`}
                            className={`flex items-start gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                              l.id === lesson.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {inner}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {hasExercises && (
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border border-purple-100 p-4">
                <p className="text-xs font-semibold text-purple-600 uppercase mb-2 flex items-center gap-1">
                  <ClipboardList className="h-3.5 w-3.5" /> Bài tập
                </p>
                <p className="text-sm text-gray-700 mb-3">Có {lesson.exercises.length} bài tập để kiểm tra kiến thức.</p>
                <button
                  type="button"
                  onClick={() => navigate(`/knowledge/exercises/${lesson.exercises[0].id}`)}
                  className="w-full px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
                >
                  Bắt đầu làm bài
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
