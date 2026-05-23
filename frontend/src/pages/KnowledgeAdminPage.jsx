import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import api from '../lib/api';
import { isAdminLike } from '../lib/adminRole';
import KnowledgeAttachmentEditor from '../components/KnowledgeAttachmentEditor';
import { ChevronLeft, Plus, Trash2, Save, Loader2, Image as ImageIcon, BarChart3, AlertCircle, Tag, TrendingUp, Star, Users, ListChecks, Edit3, Search, Filter, ExternalLink } from 'lucide-react';

const VIDEO_TYPES = [
  { value: '', label: 'Không video' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'vimeo', label: 'Vimeo' },
  { value: 'upload', label: 'Upload / link trực tiếp' },
];

const EX_TYPES = [
  { value: 'quiz', label: 'Trắc nghiệm' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'essay', label: 'Tự luận' },
];

const ROLES = ['admin', 'sales_admin', 'manager', 'sales', 'designer', 'production', 'logistics', 'staff'];

function emptyQuizQuestion() {
  return { id: `q${Date.now()}`, question: '', type: 'single', options: ['', '', ''], correct: [0] };
}

export default function KnowledgeAdminPage() {
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  if (!isAdminLike(currentUser)) return <Navigate to="/knowledge" replace />;

  const [tab, setTab] = useState('categories');
  const [categories, setCategories] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [allExercises, setAllExercises] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [catForm, setCatForm] = useState({ name: '', slug: '', icon: '📚', description: '', parent_id: '', sort_order: 0 });
  const [lessonForm, setLessonForm] = useState(null);
  const [exForm, setExForm] = useState(null);
  const [exerciseFilters, setExerciseFilters] = useState({ q: '', lesson_id: '', category_id: '', type: '' });

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (tab === 'analytics' && !analytics) loadAnalytics();
    if (tab === 'exercises') loadExercises();
  }, [tab, exerciseFilters]);

  const loadExercises = async () => {
    try {
      const params = {};
      if (exerciseFilters.q) params.q = exerciseFilters.q;
      if (exerciseFilters.lesson_id) params.lesson_id = exerciseFilters.lesson_id;
      if (exerciseFilters.category_id) params.category_id = exerciseFilters.category_id;
      if (exerciseFilters.type) params.type = exerciseFilters.type;
      const { data } = await api.get('/knowledge/admin/exercises', { params });
      setAllExercises(data.exercises || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [catRes, lesRes, subRes] = await Promise.all([
        api.get('/knowledge/categories', { params: { all: true } }),
        api.get('/knowledge/lessons', { params: { all: true } }),
        api.get('/knowledge/submissions', { params: { status: 'submitted' } }).catch(() => ({ data: { submissions: [] } })),
      ]);
      setCategories(catRes.data.flat || []);
      setLessons(lesRes.data.lessons || []);
      setSubmissions(subRes.data.submissions || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const loadAnalytics = async () => {
    try {
      const { data } = await api.get('/knowledge/analytics');
      setAnalytics(data);
    } catch (e) {
      console.error(e);
    }
  };

  const saveCategory = async () => {
    if (!catForm.name.trim()) return alert('Nhập tên danh mục');
    setSaving(true);
    try {
      const body = { ...catForm, parent_id: catForm.parent_id || null };
      if (catForm.id) await api.patch(`/knowledge/categories/${catForm.id}`, body);
      else await api.post('/knowledge/categories', body);
      setCatForm({ name: '', slug: '', icon: '📚', description: '', parent_id: '', sort_order: 0 });
      loadAll();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
    setSaving(false);
  };

  const deleteCategory = async (id) => {
    if (!confirm('Xóa danh mục? Các bài học con cũng bị xóa.')) return;
    await api.delete(`/knowledge/categories/${id}`);
    loadAll();
  };

  const startNewLesson = () => {
    setLessonForm({
      title: '',
      summary: '',
      content_md: '',
      cover_image_url: '',
      video_url: '',
      video_type: '',
      duration_minutes: '',
      attachments: [],
      tags: [],
      is_required: false,
      category_id: categories[0]?.id || '',
      sort_order: 0,
      is_published: false,
      target_roles: [],
    });
  };

  const saveLesson = async () => {
    if (!lessonForm?.title || !lessonForm?.category_id) return alert('Tiêu đề và danh mục bắt buộc');
    setSaving(true);
    try {
      const body = {
        ...lessonForm,
        duration_minutes: lessonForm.duration_minutes ? Number(lessonForm.duration_minutes) : null,
        video_type: lessonForm.video_type || null,
        video_url: lessonForm.video_url || null,
        cover_image_url: lessonForm.cover_image_url || null,
        attachments: Array.isArray(lessonForm.attachments) ? lessonForm.attachments : [],
        tags: Array.isArray(lessonForm.tags) ? lessonForm.tags : [],
        is_required: !!lessonForm.is_required,
      };
      if (lessonForm.id) await api.patch(`/knowledge/lessons/${lessonForm.id}`, body);
      else await api.post('/knowledge/lessons', body);
      setLessonForm(null);
      loadAll();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
    setSaving(false);
  };

  const deleteLesson = async (id) => {
    if (!confirm('Xóa bài học?')) return;
    await api.delete(`/knowledge/lessons/${id}`);
    loadAll();
  };

  const startNewExercise = (lessonId) => {
    setExForm({
      lesson_id: lessonId,
      title: '',
      instructions: '',
      type: 'quiz',
      passing_score: 70,
      max_attempts: null,
      time_limit_minutes: null,
      sort_order: 0,
      image_url: '',
      video_url: '',
      video_type: '',
      attachments: [],
      questions: { items: [emptyQuizQuestion()] },
    });
  };

  const saveExercise = async () => {
    if (!exForm?.title || !exForm?.lesson_id) return alert('Thiếu thông tin');
    setSaving(true);
    try {
      if (exForm.id) await api.patch(`/knowledge/exercises/${exForm.id}`, exForm);
      else await api.post('/knowledge/exercises', exForm);
      setExForm(null);
      loadAll();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
    setSaving(false);
  };

  const gradeSubmission = async (subId, score, feedback) => {
    await api.patch(`/knowledge/submissions/${subId}/grade`, {
      score: Number(score),
      feedback,
      status: Number(score) >= 70 ? 'passed' : 'failed',
    });
    loadAll();
  };

  const updateQuizItem = (idx, field, value) => {
    const items = [...(exForm.questions?.items || [])];
    items[idx] = { ...items[idx], [field]: value };
    setExForm({ ...exForm, questions: { items } });
  };

  return (
    <div className="max-w-5xl mx-auto">
      <Link to="/knowledge" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 mb-4">
        <ChevronLeft className="h-4 w-4" /> Thư viện
      </Link>
      <h1 className="text-2xl font-bold mb-4">Quản lý kiến thức</h1>

      <div className="flex gap-2 border-b mb-6 overflow-x-auto">
        {[
          { id: 'categories', label: 'Danh mục' },
          { id: 'lessons', label: 'Bài học' },
          { id: 'exercises', label: 'Bài tập' },
          { id: 'scoreboard', label: 'Bảng điểm', external: '/knowledge/scoreboard' },
          { id: 'submissions', label: `Chấm essay (${submissions.length})` },
          { id: 'analytics', label: 'Thống kê' },
        ].map((t) => t.external ? (
          <Link
            key={t.id}
            to={t.external}
            className="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-violet-600 whitespace-nowrap flex items-center gap-1"
          >
            {t.label} <ExternalLink className="h-3 w-3" />
          </Link>
        ) : (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
              tab === t.id ? 'border-violet-600 text-violet-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
      )}

      {tab === 'categories' && !loading && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <h2 className="font-semibold">{catForm.id ? 'Sửa danh mục' : 'Thêm danh mục'}</h2>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Tên *" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} />
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Slug (tự sinh nếu trống)" value={catForm.slug} onChange={(e) => setCatForm({ ...catForm, slug: e.target.value })} />
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Icon emoji" value={catForm.icon} onChange={(e) => setCatForm({ ...catForm, icon: e.target.value })} />
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={catForm.parent_id} onChange={(e) => setCatForm({ ...catForm, parent_id: e.target.value })}>
              <option value="">— Không cha —</option>
              {categories.filter((c) => c.id !== catForm.id).map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} placeholder="Mô tả" value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} />
            <button type="button" onClick={saveCategory} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">
              <Save className="h-4 w-4" /> Lưu
            </button>
          </div>
          <ul className="space-y-2">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between bg-white border rounded-lg px-3 py-2 text-sm">
                <span>{c.icon} {c.name}</span>
                <div className="flex gap-1">
                  <button type="button" className="text-blue-600 text-xs" onClick={() => setCatForm(c)}>Sửa</button>
                  <button type="button" className="text-red-600" onClick={() => deleteCategory(c.id)}><Trash2 className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'lessons' && !loading && (
        <div className="space-y-6">
          {!lessonForm ? (
            <>
              <button type="button" onClick={startNewLesson} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm" disabled={!categories.length}>
                <Plus className="h-4 w-4" /> Bài học mới
              </button>
              {!categories.length && <p className="text-sm text-amber-600">Tạo danh mục trước khi thêm bài học.</p>}
              <ul className="space-y-2">
                {lessons.map((l) => (
                  <li key={l.id} className="bg-white border rounded-lg p-3 flex justify-between items-start gap-2">
                    <div>
                      <p className="font-medium">{l.title}</p>
                      <p className="text-xs text-gray-500">{l.category?.name} · {l.is_published ? 'Đã xuất bản' : 'Nháp'}</p>
                      <div className="flex gap-2 mt-2">
                        <button type="button" className="text-xs text-blue-600" onClick={() => setLessonForm({ ...l, target_roles: l.target_roles || [] })}>Sửa</button>
                        <button type="button" className="text-xs text-purple-600" onClick={() => startNewExercise(l.id)}>+ Bài tập</button>
                        <Link to={`/knowledge/lessons/${l.id}`} className="text-xs text-gray-500">Xem</Link>
                      </div>
                    </div>
                    <button type="button" onClick={() => deleteLesson(l.id)} className="text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="bg-white border rounded-xl p-4 space-y-3">
              <h2 className="font-semibold">{lessonForm.id ? 'Sửa bài học' : 'Bài học mới'}</h2>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Tiêu đề *" value={lessonForm.title} onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })} />
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={lessonForm.category_id} onChange={(e) => setLessonForm({ ...lessonForm, category_id: e.target.value })}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Tóm tắt" value={lessonForm.summary || ''} onChange={(e) => setLessonForm({ ...lessonForm, summary: e.target.value })} />

              <div className="space-y-1.5">
                <label className="text-xs text-gray-500 uppercase tracking-wide font-semibold flex items-center gap-1">
                  <ImageIcon className="h-3 w-3" /> Ảnh bìa (URL)
                </label>
                <input
                  type="url"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="https://images.unsplash.com/..."
                  value={lessonForm.cover_image_url || ''}
                  onChange={(e) => setLessonForm({ ...lessonForm, cover_image_url: e.target.value })}
                />
                {lessonForm.cover_image_url && (
                  <img src={lessonForm.cover_image_url} alt="Preview" className="w-full max-h-40 object-cover rounded-lg border" />
                )}
              </div>

              <textarea className="w-full border rounded-lg px-3 py-2 text-sm font-mono" rows={8} placeholder="Nội dung Markdown" value={lessonForm.content_md || ''} onChange={(e) => setLessonForm({ ...lessonForm, content_md: e.target.value })} />

              <div className="grid grid-cols-2 gap-2">
                <select className="border rounded-lg px-3 py-2 text-sm" value={lessonForm.video_type || ''} onChange={(e) => setLessonForm({ ...lessonForm, video_type: e.target.value })}>
                  {VIDEO_TYPES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                </select>
                <input className="border rounded-lg px-3 py-2 text-sm" placeholder="URL video chính (YouTube/MP4)" value={lessonForm.video_url || ''} onChange={(e) => setLessonForm({ ...lessonForm, video_url: e.target.value })} />
              </div>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" type="number" placeholder="Thời lượng (phút)" value={lessonForm.duration_minutes || ''} onChange={(e) => setLessonForm({ ...lessonForm, duration_minutes: e.target.value })} />

              <KnowledgeAttachmentEditor
                value={lessonForm.attachments || []}
                onChange={(att) => setLessonForm({ ...lessonForm, attachments: att })}
                label="Media bổ sung (ảnh, video, YouTube, tệp)"
              />
              <div>
                <p className="text-xs text-gray-500 mb-1">Vai trò được xem (trống = tất cả)</p>
                <div className="flex flex-wrap gap-2">
                  {ROLES.map((role) => (
                    <label key={role} className="text-xs flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={(lessonForm.target_roles || []).includes(role)}
                        onChange={(e) => {
                          const prev = lessonForm.target_roles || [];
                          const next = e.target.checked ? [...prev, role] : prev.filter((r) => r !== role);
                          setLessonForm({ ...lessonForm, target_roles: next });
                        }}
                      />
                      {role}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide font-semibold flex items-center gap-1 mb-1">
                  <Tag className="h-3 w-3" /> Tags (phân tách dấu phẩy)
                </label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="vd: kpi, sales, dashboard"
                  value={(lessonForm.tags || []).join(', ')}
                  onChange={(e) => setLessonForm({
                    ...lessonForm,
                    tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                  })}
                />
              </div>

              <label className="flex items-center gap-2 text-sm bg-red-50 border border-red-200 rounded-lg p-2 cursor-pointer">
                <input type="checkbox" checked={!!lessonForm.is_required} onChange={(e) => setLessonForm({ ...lessonForm, is_required: e.target.checked })} />
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-red-700 font-medium">Bài học bắt buộc</span>
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!lessonForm.is_published} onChange={(e) => setLessonForm({ ...lessonForm, is_published: e.target.checked })} />
                Xuất bản
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={saveLesson} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Lưu</button>
                <button type="button" onClick={() => setLessonForm(null)} className="px-4 py-2 bg-gray-100 rounded-lg text-sm">Hủy</button>
              </div>
            </div>
          )}

          {exForm && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
              <h2 className="font-semibold text-purple-900">Bài tập</h2>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Tiêu đề bài tập" value={exForm.title} onChange={(e) => setExForm({ ...exForm, title: e.target.value })} />
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={exForm.type} onChange={(e) => {
                const type = e.target.value;
                let questions = exForm.questions;
                if (type === 'essay') questions = { prompt: '' };
                if (type === 'checklist') questions = { items: [{ id: 'c1', text: 'Bước 1' }] };
                if (type === 'quiz') questions = { items: [emptyQuizQuestion()] };
                setExForm({ ...exForm, type, questions });
              }}>
                {EX_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>

              {exForm.type === 'quiz' && (exForm.questions?.items || []).map((q, qi) => (
                <div key={q.id} className="bg-white p-3 rounded-lg border text-sm space-y-2">
                  <input className="w-full border rounded px-2 py-1" placeholder={`Câu ${qi + 1} — nội dung câu hỏi`} value={q.question} onChange={(e) => updateQuizItem(qi, 'question', e.target.value)} />
                  <input
                    type="url"
                    className="w-full border rounded px-2 py-1 text-xs"
                    placeholder="🖼️ URL ảnh minh họa cho câu hỏi (tùy chọn)"
                    value={q.image_url || ''}
                    onChange={(e) => updateQuizItem(qi, 'image_url', e.target.value)}
                  />
                  {q.image_url && (
                    <img src={q.image_url} alt="Câu hỏi" className="max-h-32 rounded border" />
                  )}
                  {(q.options || []).map((opt, oi) => (
                    <div key={oi} className="flex gap-2 items-center">
                      <input type="radio" name={`correct-${qi}`} checked={(q.correct || [])[0] === oi} onChange={() => updateQuizItem(qi, 'correct', [oi])} />
                      <input className="flex-1 border rounded px-2 py-1" placeholder={`Đáp án ${String.fromCharCode(65 + oi)}`} value={opt} onChange={(e) => {
                        const opts = [...q.options];
                        opts[oi] = e.target.value;
                        updateQuizItem(qi, 'options', opts);
                      }} />
                    </div>
                  ))}
                </div>
              ))}

              {exForm.type === 'essay' && (
                <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} placeholder="Đề bài tự luận" value={exForm.questions?.prompt || ''} onChange={(e) => setExForm({ ...exForm, questions: { prompt: e.target.value } })} />
              )}

              {exForm.type === 'checklist' && (exForm.questions?.items || []).map((it, ii) => (
                <input key={it.id} className="w-full border rounded-lg px-3 py-2 text-sm" value={it.text} onChange={(e) => {
                  const items = [...exForm.questions.items];
                  items[ii] = { ...it, text: e.target.value };
                  setExForm({ ...exForm, questions: { items } });
                }} />
              ))}

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-gray-500 uppercase">Điểm đạt %</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" type="number" value={exForm.passing_score} onChange={(e) => setExForm({ ...exForm, passing_score: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase">Tối đa lượt</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" type="number" placeholder="∞" value={exForm.max_attempts ?? ''} onChange={(e) => setExForm({ ...exForm, max_attempts: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase">⏱️ Thời gian (phút)</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" type="number" placeholder="∞" value={exForm.time_limit_minutes ?? ''} onChange={(e) => setExForm({ ...exForm, time_limit_minutes: e.target.value ? Number(e.target.value) : null })} />
                </div>
              </div>

              <div className="pt-2 border-t space-y-2">
                <p className="text-xs font-semibold text-purple-700 uppercase">Media bài tập</p>
                <input
                  type="url"
                  className="w-full border rounded-lg px-3 py-2 text-xs"
                  placeholder="🖼️ URL ảnh minh họa bài tập"
                  value={exForm.image_url || ''}
                  onChange={(e) => setExForm({ ...exForm, image_url: e.target.value })}
                />
                <input
                  type="url"
                  className="w-full border rounded-lg px-3 py-2 text-xs"
                  placeholder="▶️ URL video hướng dẫn (YouTube/MP4)"
                  value={exForm.video_url || ''}
                  onChange={(e) => setExForm({ ...exForm, video_url: e.target.value, video_type: e.target.value.includes('youtu') ? 'youtube' : '' })}
                />
                <KnowledgeAttachmentEditor
                  value={exForm.attachments || []}
                  onChange={(att) => setExForm({ ...exForm, attachments: att })}
                  label="Tệp đính kèm khác"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={saveExercise} disabled={saving} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm">Lưu bài tập</button>
                <button type="button" onClick={() => setExForm(null)} className="px-4 py-2 bg-gray-100 rounded-lg text-sm">Hủy</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'exercises' && !loading && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-purple-600" /> Tất cả bài tập
              <span className="text-sm text-gray-400 font-normal">({allExercises.length})</span>
            </h2>
            <button
              type="button"
              onClick={() => {
                if (!lessons.length) return alert('Tạo bài học trước');
                startNewExercise(lessons[0].id);
              }}
              disabled={!lessons.length}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Tạo bài tập mới
            </button>
          </div>

          <div className="bg-white border rounded-xl p-3 grid grid-cols-1 md:grid-cols-4 gap-2">
            <div className="relative md:col-span-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="search"
                placeholder="Tìm tên bài tập..."
                value={exerciseFilters.q}
                onChange={(e) => setExerciseFilters({ ...exerciseFilters, q: e.target.value })}
                className="w-full pl-8 pr-2 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <select
              value={exerciseFilters.category_id}
              onChange={(e) => setExerciseFilters({ ...exerciseFilters, category_id: e.target.value })}
              className="border border-gray-200 rounded-lg px-2 py-2 text-sm"
            >
              <option value="">— Mọi danh mục —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
            <select
              value={exerciseFilters.lesson_id}
              onChange={(e) => setExerciseFilters({ ...exerciseFilters, lesson_id: e.target.value })}
              className="border border-gray-200 rounded-lg px-2 py-2 text-sm"
            >
              <option value="">— Mọi bài học —</option>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>{l.title}</option>
              ))}
            </select>
            <select
              value={exerciseFilters.type}
              onChange={(e) => setExerciseFilters({ ...exerciseFilters, type: e.target.value })}
              className="border border-gray-200 rounded-lg px-2 py-2 text-sm"
            >
              <option value="">— Mọi loại —</option>
              <option value="quiz">Trắc nghiệm</option>
              <option value="checklist">Checklist</option>
              <option value="essay">Tự luận</option>
            </select>
          </div>

          {allExercises.length === 0 ? (
            <div className="bg-white border border-dashed rounded-xl py-12 text-center text-gray-400">
              <ListChecks className="h-10 w-10 mx-auto mb-2 text-gray-300" />
              <p>Chưa có bài tập nào{exerciseFilters.q || exerciseFilters.lesson_id ? ' phù hợp bộ lọc' : ''}.</p>
            </div>
          ) : (
            <div className="bg-white border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="text-left px-3 py-2">Bài tập</th>
                    <th className="text-left px-3 py-2">Bài học</th>
                    <th className="text-center px-2 py-2">Loại</th>
                    <th className="text-center px-2 py-2">Câu</th>
                    <th className="text-center px-2 py-2">Lượt</th>
                    <th className="text-center px-2 py-2">% Đạt</th>
                    <th className="text-center px-2 py-2">Điểm TB</th>
                    <th className="text-right px-3 py-2">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {allExercises.map((ex) => (
                    <tr key={ex.id} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{ex.title}</td>
                      <td className="px-3 py-2 text-xs">
                        <p className="text-gray-700">{ex.lesson?.title}</p>
                        <p className="text-gray-400">{ex.lesson?.category?.icon} {ex.lesson?.category?.name}</p>
                      </td>
                      <td className="px-2 py-2 text-center text-xs">
                        <span className="px-2 py-0.5 bg-gray-100 rounded-full">
                          {ex.type === 'quiz' ? 'Trắc nghiệm' : ex.type === 'checklist' ? 'Checklist' : 'Tự luận'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center">{ex.question_count}</td>
                      <td className="px-2 py-2 text-center">{ex.submission_count}</td>
                      <td className="px-2 py-2 text-center">
                        {ex.pass_rate != null ? (
                          <span className={`text-xs font-medium ${ex.pass_rate >= 70 ? 'text-green-600' : 'text-amber-600'}`}>
                            {ex.pass_rate}%
                          </span>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {ex.avg_score != null ? <span className="text-xs">{ex.avg_score}</span> : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex gap-1 justify-end">
                          <button
                            type="button"
                            onClick={() => setExForm({
                              ...ex,
                              attachments: ex.attachments || [],
                              questions: ex.questions || { items: [] },
                            })}
                            className="p-1.5 rounded hover:bg-blue-50 text-blue-600"
                            title="Sửa"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!confirm(`Xóa bài tập "${ex.title}"?`)) return;
                              try {
                                await api.delete(`/knowledge/exercises/${ex.id}`);
                                loadExercises();
                              } catch (err) { alert(err.response?.data?.error || 'Lỗi'); }
                            }}
                            className="p-1.5 rounded hover:bg-red-50 text-red-600"
                            title="Xóa"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {exForm && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-purple-900">{exForm.id ? 'Sửa bài tập' : 'Bài tập mới'}</h2>
                <button type="button" onClick={() => setExForm(null)} className="text-xs text-gray-500 hover:text-gray-700">Đóng</button>
              </div>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={exForm.lesson_id || ''}
                onChange={(e) => setExForm({ ...exForm, lesson_id: e.target.value })}
              >
                <option value="">— Chọn bài học —</option>
                {lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
              </select>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Tiêu đề bài tập" value={exForm.title} onChange={(e) => setExForm({ ...exForm, title: e.target.value })} />
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={exForm.type} onChange={(e) => {
                const type = e.target.value;
                let questions = exForm.questions;
                if (type === 'essay') questions = { prompt: '' };
                if (type === 'checklist') questions = { items: [{ id: 'c1', text: 'Bước 1' }] };
                if (type === 'quiz') questions = { items: [emptyQuizQuestion()] };
                setExForm({ ...exForm, type, questions });
              }}>
                {EX_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>

              {exForm.type === 'quiz' && (
                <div className="space-y-2">
                  {(exForm.questions?.items || []).map((q, qi) => (
                    <div key={q.id} className="bg-white p-3 rounded-lg border text-sm space-y-2">
                      <input className="w-full border rounded px-2 py-1" placeholder={`Câu ${qi + 1}`} value={q.question} onChange={(e) => updateQuizItem(qi, 'question', e.target.value)} />
                      <input type="url" className="w-full border rounded px-2 py-1 text-xs" placeholder="🖼️ URL ảnh minh họa" value={q.image_url || ''} onChange={(e) => updateQuizItem(qi, 'image_url', e.target.value)} />
                      {q.image_url && <img src={q.image_url} alt="" className="max-h-32 rounded border" />}
                      {(q.options || []).map((opt, oi) => (
                        <div key={oi} className="flex gap-2 items-center">
                          <input type="radio" name={`correct-${qi}`} checked={(q.correct || [])[0] === oi} onChange={() => updateQuizItem(qi, 'correct', [oi])} />
                          <input className="flex-1 border rounded px-2 py-1" placeholder={`Đáp án ${String.fromCharCode(65 + oi)}`} value={opt} onChange={(e) => {
                            const opts = [...q.options];
                            opts[oi] = e.target.value;
                            updateQuizItem(qi, 'options', opts);
                          }} />
                        </div>
                      ))}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const items = [...(exForm.questions?.items || []), emptyQuizQuestion()];
                      setExForm({ ...exForm, questions: { items } });
                    }}
                    className="w-full py-2 border-2 border-dashed border-purple-200 rounded-lg text-xs text-purple-600 hover:bg-purple-50"
                  >
                    + Thêm câu hỏi
                  </button>
                </div>
              )}

              {exForm.type === 'essay' && (
                <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} placeholder="Đề bài tự luận" value={exForm.questions?.prompt || ''} onChange={(e) => setExForm({ ...exForm, questions: { prompt: e.target.value } })} />
              )}

              {exForm.type === 'checklist' && (
                <div className="space-y-2">
                  {(exForm.questions?.items || []).map((it, ii) => (
                    <div key={it.id} className="flex gap-2">
                      <input className="flex-1 border rounded-lg px-3 py-2 text-sm" value={it.text} onChange={(e) => {
                        const items = [...exForm.questions.items];
                        items[ii] = { ...it, text: e.target.value };
                        setExForm({ ...exForm, questions: { items } });
                      }} />
                      <button type="button" onClick={() => {
                        const items = exForm.questions.items.filter((_, j) => j !== ii);
                        setExForm({ ...exForm, questions: { items } });
                      }} className="text-red-500"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => {
                    const items = [...(exForm.questions?.items || []), { id: `c${Date.now()}`, text: '' }];
                    setExForm({ ...exForm, questions: { items } });
                  }} className="w-full py-2 border-2 border-dashed border-purple-200 rounded-lg text-xs text-purple-600">+ Thêm bước</button>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-gray-500 uppercase">Điểm đạt %</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" type="number" value={exForm.passing_score ?? 70} onChange={(e) => setExForm({ ...exForm, passing_score: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase">Tối đa lượt</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" type="number" placeholder="∞" value={exForm.max_attempts ?? ''} onChange={(e) => setExForm({ ...exForm, max_attempts: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase">⏱️ Thời gian (phút)</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" type="number" placeholder="∞" value={exForm.time_limit_minutes ?? ''} onChange={(e) => setExForm({ ...exForm, time_limit_minutes: e.target.value ? Number(e.target.value) : null })} />
                </div>
              </div>

              <div className="pt-2 border-t space-y-2">
                <p className="text-xs font-semibold text-purple-700 uppercase">Media bài tập</p>
                <input type="url" className="w-full border rounded-lg px-3 py-2 text-xs" placeholder="🖼️ URL ảnh minh họa" value={exForm.image_url || ''} onChange={(e) => setExForm({ ...exForm, image_url: e.target.value })} />
                <input type="url" className="w-full border rounded-lg px-3 py-2 text-xs" placeholder="▶️ URL video (YouTube/MP4)" value={exForm.video_url || ''} onChange={(e) => setExForm({ ...exForm, video_url: e.target.value, video_type: e.target.value.includes('youtu') ? 'youtube' : '' })} />
                <KnowledgeAttachmentEditor
                  value={exForm.attachments || []}
                  onChange={(att) => setExForm({ ...exForm, attachments: att })}
                  label="Tệp đính kèm"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={async () => {
                  await saveExercise();
                  loadExercises();
                }} disabled={saving} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm">Lưu bài tập</button>
                <button type="button" onClick={() => setExForm(null)} className="px-4 py-2 bg-gray-100 rounded-lg text-sm">Hủy</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'analytics' && (
        <div className="space-y-6">
          {!analytics ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white border rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-gray-500 text-xs uppercase mb-1">
                    <Users className="h-4 w-4" /> Học viên tham gia
                  </div>
                  <p className="text-3xl font-bold">{analytics.totals?.total_learners || 0}</p>
                </div>
                <div className="bg-white border rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-gray-500 text-xs uppercase mb-1">
                    <BarChart3 className="h-4 w-4" /> Bài đã xuất bản
                  </div>
                  <p className="text-3xl font-bold">{analytics.totals?.total_lessons || 0}</p>
                </div>
                <div className="bg-white border rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-gray-500 text-xs uppercase mb-1">
                    <TrendingUp className="h-4 w-4" /> Lượt nộp bài
                  </div>
                  <p className="text-3xl font-bold">{analytics.totals?.total_submissions || 0}</p>
                  <p className="text-xs text-gray-400">Đã đạt: {analytics.totals?.total_passed || 0}</p>
                </div>
                <div className="bg-white border rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-gray-500 text-xs uppercase mb-1">
                    <Star className="h-4 w-4" /> Tổng đánh giá
                  </div>
                  <p className="text-3xl font-bold">{analytics.totals?.total_ratings || 0}</p>
                </div>
              </div>

              <div className="bg-white border rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-violet-600" /> Chi tiết theo bài học
                  </h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="text-left px-4 py-2">Bài học</th>
                      <th className="text-right px-3 py-2">Học</th>
                      <th className="text-right px-3 py-2">Hoàn thành</th>
                      <th className="text-right px-3 py-2">% Hoàn thành</th>
                      <th className="text-right px-3 py-2">% Đạt</th>
                      <th className="text-right px-3 py-2">⭐</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(analytics.stats || []).sort((a, b) => b.learners - a.learners).map((s) => (
                      <tr key={s.id} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-2">
                          <p className="font-medium">{s.title}</p>
                          <p className="text-xs text-gray-400">{s.category?.icon} {s.category?.name}</p>
                        </td>
                        <td className="px-3 py-2 text-right">{s.learners}</td>
                        <td className="px-3 py-2 text-right">{s.completed}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            s.completion_rate >= 70 ? 'bg-green-100 text-green-700' :
                            s.completion_rate >= 40 ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {s.completion_rate}%
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {s.submission_count > 0 ? (
                            <span className={`text-xs ${s.pass_rate >= 70 ? 'text-green-600' : 'text-amber-600'}`}>
                              {s.pass_rate}% ({s.passed_count}/{s.submission_count})
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {s.rating_avg ? (
                            <span className="text-amber-500 font-medium">{s.rating_avg} ({s.rating_count})</span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'submissions' && !loading && (
        <ul className="space-y-3">
          {submissions.length === 0 ? (
            <p className="text-gray-500 text-sm">Không có bài tự luận chờ chấm.</p>
          ) : submissions.map((s) => (
            <li key={s.id} className="bg-white border rounded-lg p-4 text-sm">
              <p className="font-medium">{s.user?.full_name} — {s.exercise?.title}</p>
              <p className="text-gray-600 mt-2 whitespace-pre-wrap">{s.answers?.essay || JSON.stringify(s.answers)}</p>
              <div className="flex gap-2 mt-3 items-center">
                <input type="number" id={`score-${s.id}`} placeholder="Điểm" className="border rounded px-2 py-1 w-20" defaultValue={70} />
                <button
                  type="button"
                  className="px-3 py-1 bg-green-600 text-white rounded text-xs"
                  onClick={() => {
                    const score = document.getElementById(`score-${s.id}`)?.value;
                    gradeSubmission(s.id, score, '');
                  }}
                >
                  Chấm xong
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
