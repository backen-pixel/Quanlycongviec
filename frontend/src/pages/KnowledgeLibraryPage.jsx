import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import {
  BookOpen, Search, CheckCircle2, Clock, PlayCircle, Settings,
  Sparkles, TrendingUp, Award, ArrowRight, Flame, Library,
  Bookmark, Star, AlertCircle, History, Tag,
} from 'lucide-react';

const CATEGORY_COLORS = [
  { bg: 'from-blue-500 to-cyan-500', text: 'text-blue-700', ring: 'ring-blue-100', soft: 'bg-blue-50' },
  { bg: 'from-emerald-500 to-teal-500', text: 'text-emerald-700', ring: 'ring-emerald-100', soft: 'bg-emerald-50' },
  { bg: 'from-amber-500 to-orange-500', text: 'text-amber-700', ring: 'ring-amber-100', soft: 'bg-amber-50' },
  { bg: 'from-violet-500 to-purple-500', text: 'text-violet-700', ring: 'ring-violet-100', soft: 'bg-violet-50' },
  { bg: 'from-pink-500 to-rose-500', text: 'text-pink-700', ring: 'ring-pink-100', soft: 'bg-pink-50' },
  { bg: 'from-indigo-500 to-blue-500', text: 'text-indigo-700', ring: 'ring-indigo-100', soft: 'bg-indigo-50' },
];

function pickColor(idx) {
  return CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
}

function HeroBanner({ completedCount, inProgressCount, totalLessons }) {
  const pct = totalLessons ? Math.round((completedCount / totalLessons) * 100) : 0;
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 text-white p-8 mb-8 shadow-xl">
      <div className="absolute -top-20 -right-20 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
      <div className="absolute -bottom-32 -left-20 w-96 h-96 bg-fuchsia-400/20 rounded-full blur-3xl" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-5 w-5" />
          <span className="text-sm font-medium opacity-90">Học hỏi mỗi ngày</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold mb-2">Thư viện kiến thức</h1>
        <p className="text-violet-100 text-lg max-w-2xl">
          Bài học, video và bài tập thực hành để bạn nâng cao kỹ năng mỗi ngày.
        </p>

        <div className="mt-6 grid grid-cols-3 gap-3 max-w-2xl">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 ring-1 ring-white/20">
            <div className="flex items-center gap-2 text-violet-100 text-xs uppercase tracking-wide mb-1">
              <CheckCircle2 className="h-4 w-4" /> Hoàn thành
            </div>
            <p className="text-2xl font-bold">{completedCount}</p>
            <p className="text-xs text-violet-200">/ {totalLessons || 0} bài</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 ring-1 ring-white/20">
            <div className="flex items-center gap-2 text-violet-100 text-xs uppercase tracking-wide mb-1">
              <Flame className="h-4 w-4" /> Đang học
            </div>
            <p className="text-2xl font-bold">{inProgressCount}</p>
            <p className="text-xs text-violet-200">bài chưa xong</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 ring-1 ring-white/20">
            <div className="flex items-center gap-2 text-violet-100 text-xs uppercase tracking-wide mb-1">
              <TrendingUp className="h-4 w-4" /> Tiến độ
            </div>
            <p className="text-2xl font-bold">{pct}%</p>
            <div className="mt-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ContinueLearning({ lessons }) {
  if (!lessons.length) return null;
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" /> Tiếp tục học
        </h2>
        <span className="text-xs text-gray-400">{lessons.length} bài đang dang dở</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {lessons.slice(0, 3).map((l, idx) => {
          const color = pickColor(idx);
          return (
            <Link
              key={l.lesson_id}
              to={`/knowledge/lessons/${l.lesson_id}`}
              className={`group relative overflow-hidden rounded-2xl bg-white border-2 border-transparent hover:border-orange-200 shadow-sm hover:shadow-md transition-all p-4 ${color.ring}`}
            >
              <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${color.bg}`} />
              <div className="flex items-start gap-3 mt-1">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color.bg} text-white flex items-center justify-center shrink-0`}>
                  <BookOpen className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-orange-600 font-semibold mb-1">Tiếp tục đọc</p>
                  <h3 className="font-semibold text-gray-900 line-clamp-2 group-hover:text-violet-600 transition-colors">
                    {l.lesson?.title || 'Bài học'}
                  </h3>
                  <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Mở gần đây
                    <ArrowRight className="h-3 w-3 ml-auto group-hover:translate-x-1 transition-transform" />
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function CategoryGrid({ categories, selectedId, onSelect }) {
  if (!categories.length) return null;
  return (
    <section className="mb-8">
      <h2 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
        <Library className="h-5 w-5 text-violet-600" /> Danh mục
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`group rounded-2xl p-4 text-left border-2 transition-all ${
            !selectedId ? 'border-violet-500 bg-violet-50' : 'border-gray-100 bg-white hover:border-violet-200'
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 text-white flex items-center justify-center text-2xl mb-3">
            📚
          </div>
          <p className="font-semibold text-gray-900">Tất cả</p>
          <p className="text-xs text-gray-500 mt-0.5">Mọi chủ đề</p>
        </button>
        {categories.map((cat, idx) => {
          const color = pickColor(idx);
          const isSelected = selectedId === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelect(cat.id)}
              className={`group rounded-2xl p-4 text-left border-2 transition-all ${
                isSelected ? `border-violet-500 ${color.soft}` : 'border-gray-100 bg-white hover:border-gray-200'
              }`}
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color.bg} text-white flex items-center justify-center text-2xl mb-3 group-hover:scale-110 transition-transform`}>
                {cat.icon || '📚'}
              </div>
              <p className="font-semibold text-gray-900">{cat.name}</p>
              {cat.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{cat.description}</p>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function LessonCard({ lesson, idx }) {
  const status = lesson.progress_status;
  const color = pickColor(idx);
  const hasVideo = !!lesson.video_url;
  return (
    <Link
      to={`/knowledge/lessons/${lesson.id}`}
      className="group bg-white rounded-2xl border border-gray-200 overflow-hidden hover:border-violet-300 hover:shadow-lg transition-all flex flex-col"
    >
      <div className={`relative h-32 bg-gradient-to-br ${color.bg} flex items-center justify-center overflow-hidden`}>
        {lesson.cover_image_url ? (
          <img src={lesson.cover_image_url} alt={lesson.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
        ) : (
          <span className="text-5xl opacity-30 group-hover:scale-125 transition-transform">
            {lesson.category?.icon || '📖'}
          </span>
        )}
        {hasVideo && (
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <PlayCircle className="h-12 w-12 text-white" />
          </div>
        )}

        <div className="absolute top-2 left-2 flex gap-1 flex-wrap max-w-[60%]">
          {lesson.is_required && (
            <span className="px-2 py-1 bg-red-500 text-white rounded-full text-[10px] font-bold flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Bắt buộc
            </span>
          )}
        </div>

        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
          {status === 'completed' && (
            <span className="px-2 py-1 bg-green-500 text-white rounded-full text-[10px] font-bold flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Đã học
            </span>
          )}
          {status === 'in_progress' && (
            <span className="px-2 py-1 bg-amber-400 text-amber-900 rounded-full text-[10px] font-bold">
              Đang học
            </span>
          )}
          {lesson.is_bookmarked && (
            <span className="p-1 bg-amber-500 text-white rounded-full">
              <Bookmark className="h-3 w-3 fill-current" />
            </span>
          )}
        </div>
      </div>
      <div className="p-4 flex-1 flex flex-col">
        {lesson.category?.name && (
          <p className={`text-xs font-semibold ${color.text} mb-1`}>
            {lesson.category.icon} {lesson.category.name}
          </p>
        )}
        <h3 className="font-bold text-gray-900 line-clamp-2 group-hover:text-violet-600 transition-colors">
          {lesson.title}
        </h3>
        {lesson.summary && <p className="text-sm text-gray-500 mt-1 line-clamp-2 flex-1">{lesson.summary}</p>}

        {(lesson.tags || []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {lesson.tags.slice(0, 3).map((t) => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                #{t}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
          {lesson.duration_minutes && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {lesson.duration_minutes} phút
            </span>
          )}
          {hasVideo && (
            <span className="flex items-center gap-1">
              <PlayCircle className="h-3 w-3" /> Video
            </span>
          )}
          {lesson.rating_avg && (
            <span className="flex items-center gap-1 text-amber-500">
              <Star className="h-3 w-3 fill-current" /> {lesson.rating_avg}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function KnowledgeLibraryPage() {
  const [categoriesFlat, setCategoriesFlat] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | bookmarked | required
  const [progress, setProgress] = useState({ progress: [], completed: 0, total: 0 });
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = ['admin', 'sales_admin', 'manager'].includes(currentUser.role);

  useEffect(() => {
    loadCategories();
    loadProgress();
  }, []);

  useEffect(() => {
    loadLessons();
  }, [selectedCategory, search, filter]);

  const loadCategories = async () => {
    try {
      const { data } = await api.get('/knowledge/categories');
      setCategoriesFlat((data.flat || []).filter((c) => !c.parent_id));
    } catch (e) {
      console.error(e);
    }
  };

  const loadProgress = async () => {
    try {
      const { data } = await api.get('/knowledge/my-progress');
      setProgress(data);
    } catch {
      setProgress({ progress: [], completed: 0, total: 0 });
    }
  };

  const loadLessons = async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedCategory) params.category_id = selectedCategory;
      if (search.trim()) params.q = search.trim();
      if (filter === 'bookmarked') params.bookmarked = 1;
      if (filter === 'required') params.required = 1;
      const { data } = await api.get('/knowledge/lessons', { params });
      setLessons(data.lessons || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const inProgressLessons = useMemo(
    () => (progress.progress || []).filter((p) => p.status === 'in_progress'),
    [progress],
  );

  const filteredLessons = useMemo(() => {
    if (!search.trim()) return lessons;
    const s = search.toLowerCase();
    return lessons.filter(
      (l) => l.title?.toLowerCase().includes(s) || l.summary?.toLowerCase().includes(s),
    );
  }, [lessons, search]);

  return (
    <div className="max-w-7xl mx-auto pb-12">
      <HeroBanner
        completedCount={progress.completed || 0}
        inProgressCount={inProgressLessons.length}
        totalLessons={lessons.length}
      />

      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          {[
            { id: 'all', label: 'Tất cả', icon: BookOpen },
            { id: 'bookmarked', label: 'Đã lưu', icon: Bookmark },
            { id: 'required', label: 'Bắt buộc', icon: AlertCircle },
          ].map((f) => {
            const Icon = f.icon;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  filter === f.id ? 'bg-violet-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-violet-300'
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {f.label}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Link
            to="/knowledge/my-history"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:border-violet-300 hover:text-violet-700 text-sm shadow-sm"
          >
            <History className="h-4 w-4" />
            Lịch sử bài làm
          </Link>
          {isAdmin && (
            <Link
              to="/knowledge/admin"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:border-violet-300 hover:text-violet-700 text-sm shadow-sm"
            >
              <Settings className="h-4 w-4" />
              Quản lý
            </Link>
          )}
        </div>
      </div>

      <ContinueLearning lessons={inProgressLessons} />

      <CategoryGrid
        categories={categoriesFlat}
        selectedId={selectedCategory}
        onSelect={setSelectedCategory}
      />

      <section>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Award className="h-5 w-5 text-violet-600" />
            {selectedCategory
              ? `Bài học: ${categoriesFlat.find((c) => c.id === selectedCategory)?.name || ''}`
              : 'Tất cả bài học'}
            <span className="text-sm text-gray-400 font-normal">({filteredLessons.length})</span>
          </h2>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              placeholder="Tìm bài học..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-200 overflow-hidden animate-pulse">
                <div className="h-32 bg-gray-100" />
                <div className="p-4 space-y-2">
                  <div className="h-3 bg-gray-100 rounded w-1/3" />
                  <div className="h-4 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredLessons.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 py-16 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-violet-50 flex items-center justify-center mb-3">
              <BookOpen className="h-8 w-8 text-violet-400" />
            </div>
            <p className="text-gray-500">Chưa có bài học nào trong mục này.</p>
            {isAdmin && (
              <Link
                to="/knowledge/admin"
                className="inline-flex items-center gap-1 text-violet-600 text-sm mt-3 hover:underline"
              >
                <Settings className="h-4 w-4" /> Thêm bài học đầu tiên
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredLessons.map((l, idx) => (
              <LessonCard key={l.id} lesson={l} idx={idx} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
