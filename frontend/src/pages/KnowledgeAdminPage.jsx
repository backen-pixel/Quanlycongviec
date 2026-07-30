import { useState, useEffect, useRef } from 'react';
import { Link, Navigate } from 'react-router-dom';
import api from '../lib/api';
import { isAdminLike } from '../lib/adminRole';
import KnowledgeAttachmentEditor from '../components/KnowledgeAttachmentEditor';
import { ChevronLeft, Plus, Trash2, Save, Loader2, Image as ImageIcon, BarChart3, AlertCircle, Tag, TrendingUp, Star, Users, ListChecks, Edit3, Search, Filter, ExternalLink, Award, ShieldCheck, Upload, X } from 'lucide-react';
import { KNOWLEDGE_BACK_LINK_CLASS, knowledgeBackLinkStyle } from '../lib/knowledgeNavStyles';

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

const ROLES = ['admin', 'sales_admin', 'manager', 'sales', 'designer', 'production', 'logistics', 'accounting', 'staff'];

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

  const [catForm, setCatForm] = useState({
    name: '', slug: '', icon: '📚', description: '', parent_id: '', sort_order: 0,
    badge_image_url: '', require_all_exercises_passed: true,
    certificate_template: { signature_name: '', signature_title: '', footer_note: '', accent_color: '' },
    deadline_mode: 'none', deadline_at: '', deadline_duration_days: '', deadline_note: '',
  });
  const [deadlineHistory, setDeadlineHistory] = useState([]);
  const [showDeadlineHistory, setShowDeadlineHistory] = useState(false);
  const [badgeUploading, setBadgeUploading] = useState(false);
  const badgeInputRef = useRef(null);

  const handleBadgeUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn file ảnh (PNG, JPG, WEBP, ...)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      if (!confirm(`File ${(file.size / 1024 / 1024).toFixed(1)}MB khá lớn. Khuyên dùng ảnh < 1MB cho tốc độ tải. Vẫn upload?`)) return;
    }
    setBadgeUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('entity_type', 'knowledge_badges');
      if (catForm.id) fd.append('entity_id', catForm.id);
      const { data } = await api.post('/upload/single', fd, { timeout: 120000 });
      if (!data?.file_url) throw new Error('Không nhận được URL');
      setCatForm((prev) => ({ ...prev, badge_image_url: data.file_url }));
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Lỗi upload');
    } finally {
      setBadgeUploading(false);
      if (badgeInputRef.current) badgeInputRef.current.value = '';
    }
  };
  const [lessonForm, setLessonForm] = useState(null);
  const [exForm, setExForm] = useState(null);
  const [exerciseFilters, setExerciseFilters] = useState({ q: '', lesson_id: '', category_id: '', type: '' });

  const [empCategoryId, setEmpCategoryId] = useState('');
  const [empFilter, setEmpFilter] = useState({ q: '', only: '', company_id: '', department_id: '', user_id: '' });
  const [empData, setEmpData] = useState(null);
  const [empLoading, setEmpLoading] = useState(false);
  const [empCompanies, setEmpCompanies] = useState([]);
  const [empDepartments, setEmpDepartments] = useState([]);
  const [empUsers, setEmpUsers] = useState([]);
  const [empUserSearch, setEmpUserSearch] = useState('');
  const isSysAdmin = !currentUser?.company_id && String(currentUser?.role || '').toLowerCase() === 'admin';
  const userCompanyName = (() => {
    if (!currentUser?.company_id) return '';
    const co = empCompanies.find((c) => String(c.id) === String(currentUser.company_id));
    return co?.short_name || co?.name || '';
  })();

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (tab === 'analytics' && !analytics) loadAnalytics();
    if (tab === 'exercises') loadExercises();
    if (tab === 'employees' && empCategoryId) loadEmployees();
  }, [tab, exerciseFilters, empCategoryId, empFilter]);

  useEffect(() => {
    if (tab !== 'employees') return;
    loadEmpFilterOptions();
  }, [tab, empFilter.company_id, empFilter.department_id]);

  const loadEmpFilterOptions = async () => {
    try {
      const reqs = [];
      if (empCompanies.length === 0) {
        reqs.push(api.get('/companies').then((r) => setEmpCompanies(r.data?.companies || r.data || [])).catch(() => {}));
      }
      const deptParams = {};
      const effectiveCompany = isSysAdmin ? empFilter.company_id : (currentUser?.company_id || '');
      if (effectiveCompany) deptParams.company_id = effectiveCompany;
      reqs.push(
        api.get('/users/departments', { params: deptParams })
          .then((r) => {
            let depts = r.data?.departments || [];
            if (effectiveCompany) depts = depts.filter((d) => !d.company_id || d.company_id === effectiveCompany);
            setEmpDepartments(depts);
          })
          .catch(() => setEmpDepartments([]))
      );
      const userParams = { include_inactive: 'false' };
      if (effectiveCompany) userParams.company_id = effectiveCompany;
      if (empFilter.department_id) userParams.department_id = empFilter.department_id;
      reqs.push(
        api.get('/users', { params: userParams })
          .then((r) => setEmpUsers(r.data?.users || r.data || []))
          .catch(() => setEmpUsers([]))
      );
      await Promise.all(reqs);
    } catch (e) {
      // ignore
    }
  };

  const loadEmployees = async () => {
    if (!empCategoryId) return;
    setEmpLoading(true);
    try {
      const params = { category_id: empCategoryId };
      if (empFilter.q) params.q = empFilter.q;
      if (empFilter.only) params.only = empFilter.only;
      if (empFilter.company_id) params.company_id = empFilter.company_id;
      if (empFilter.department_id) params.department_id = empFilter.department_id;
      if (empFilter.user_id) params.user_id = empFilter.user_id;
      const { data } = await api.get('/knowledge/admin/employee-progress', { params });
      setEmpData(data);
    } catch (e) {
      alert(e.response?.data?.error || 'Không tải được danh sách nhân viên');
      setEmpData(null);
    }
    setEmpLoading(false);
  };

  const grantCertificate = async (userEmail) => {
    if (!confirm(`Cấp chứng nhận thủ công cho ${userEmail}?\n(hoàn thành tất cả bài học + bài tập + cấp chứng nhận)`)) return;
    try {
      await api.post('/knowledge/admin/grant-certificate', { email: userEmail, category_id: empCategoryId });
      loadEmployees();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cấp chứng nhận');
    }
  };

  const revokeCertificate = async (certId) => {
    const reason = prompt('Lý do thu hồi chứng nhận?');
    if (reason === null) return;
    try {
      await api.post(`/knowledge/admin/certificates/${certId}/revoke`, { reason });
      loadEmployees();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi thu hồi');
    }
  };

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

  const loadDeadlineHistory = async (categoryId) => {
    if (!categoryId) { setDeadlineHistory([]); return; }
    try {
      const { data } = await api.get(`/knowledge/categories/${categoryId}/deadline-history`);
      setDeadlineHistory(data.history || []);
    } catch {
      setDeadlineHistory([]);
    }
  };

  const saveCategory = async () => {
    if (!catForm.name.trim()) return alert('Nhập tên danh mục');
    if (catForm.deadline_mode === 'fixed' && !catForm.deadline_at) return alert('Vui lòng chọn ngày hết hạn');
    if (catForm.deadline_mode === 'relative' && (!catForm.deadline_duration_days || Number(catForm.deadline_duration_days) <= 0)) {
      return alert('Vui lòng nhập số ngày hợp lệ (> 0)');
    }
    setSaving(true);
    try {
      const body = {
        ...catForm,
        parent_id: catForm.parent_id || null,
        badge_image_url: catForm.badge_image_url || null,
        require_all_exercises_passed: catForm.require_all_exercises_passed !== false,
        certificate_template: catForm.certificate_template || {},
        deadline_mode: catForm.deadline_mode || 'none',
        deadline_at: catForm.deadline_mode === 'fixed' ? (catForm.deadline_at ? new Date(catForm.deadline_at).toISOString() : null) : null,
        deadline_duration_days: catForm.deadline_mode === 'relative' ? Number(catForm.deadline_duration_days) || null : null,
        deadline_note: catForm.deadline_note || null,
      };
      if (catForm.id) await api.patch(`/knowledge/categories/${catForm.id}`, body);
      else await api.post('/knowledge/categories', body);
      setCatForm({
        name: '', slug: '', icon: '📚', description: '', parent_id: '', sort_order: 0,
        badge_image_url: '', require_all_exercises_passed: true,
        certificate_template: { signature_name: '', signature_title: '', footer_note: '', accent_color: '' },
        deadline_mode: 'none', deadline_at: '', deadline_duration_days: '', deadline_note: '',
      });
      setDeadlineHistory([]);
      setShowDeadlineHistory(false);
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
      <Link to="/knowledge" className={`${KNOWLEDGE_BACK_LINK_CLASS} mb-4`} style={knowledgeBackLinkStyle}>
        <ChevronLeft className="h-4 w-4" /> Thư viện
      </Link>
      <h1 className="text-2xl font-bold mb-4">Quản lý kiến thức</h1>

      <div className="flex gap-2 border-b mb-6 overflow-x-auto">
        {[
          { id: 'categories', label: 'Danh mục' },
          { id: 'lessons', label: 'Bài học' },
          { id: 'exercises', label: 'Bài tập' },
          { id: 'employees', label: 'Chứng nhận NV' },
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
            <h2 className="font-semibold" style={{ color: '#000000' }}>{catForm.id ? 'Sửa danh mục' : 'Thêm danh mục'}</h2>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Tên *" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} />
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Slug (tự sinh nếu trống)" value={catForm.slug} onChange={(e) => setCatForm({ ...catForm, slug: e.target.value })} />
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Icon emoji" value={catForm.icon} onChange={(e) => setCatForm({ ...catForm, icon: e.target.value })} />
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={catForm.parent_id || ''} onChange={(e) => setCatForm({ ...catForm, parent_id: e.target.value })}>
              <option value="">— Không cha —</option>
              {categories.filter((c) => c.id !== catForm.id).map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} placeholder="Mô tả" value={catForm.description || ''} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} />

            {/* ─── Khu vực HUY CHƯƠNG + CHỨNG NHẬN ───────────────────────── */}
            <div className="pt-3 mt-2 border-t border-amber-200">
              <div className="flex items-center gap-2 mb-2">
                <Award className="h-4 w-4 text-amber-600" />
                <h3 className="text-sm font-semibold" style={{ color: '#000000' }}>Huy chương & chứng nhận</h3>
              </div>

              <label className="text-[11px] text-gray-500 uppercase font-semibold tracking-wide flex items-center gap-1">
                <ImageIcon className="h-3 w-3" /> Ảnh huy chương
              </label>

              <input
                ref={badgeInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml"
                className="hidden"
                onChange={handleBadgeUpload}
              />

              <div className="mt-1 grid grid-cols-[1fr_auto] gap-2">
                <input
                  type="url"
                  className="border rounded-lg px-3 py-2 text-sm"
                  placeholder="Dán URL ảnh huy chương (https://...)"
                  value={catForm.badge_image_url || ''}
                  onChange={(e) => setCatForm({ ...catForm, badge_image_url: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => badgeInputRef.current?.click()}
                  disabled={badgeUploading}
                  className="px-3 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                  title="Upload file từ máy"
                >
                  {badgeUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {badgeUploading ? 'Đang tải...' : 'Upload file'}
                </button>
              </div>

              {catForm.badge_image_url ? (
                <div className="mt-2 p-3 bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg border border-amber-200 flex items-center gap-3 relative">
                  <img src={catForm.badge_image_url} alt="Huy chương" className="w-20 h-20 object-contain drop-shadow shrink-0" />
                  <div className="text-xs text-amber-800 flex-1 min-w-0">
                    <p className="font-semibold">Xem trước huy chương</p>
                    <p className="text-amber-700 mt-0.5">Hiển thị trên thẻ chứng nhận và bộ sưu tập.</p>
                    <p className="text-[10px] text-gray-500 truncate mt-1" title={catForm.badge_image_url}>
                      🔗 {catForm.badge_image_url}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCatForm({ ...catForm, badge_image_url: '' })}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-300 flex items-center justify-center"
                    title="Xoá ảnh"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => badgeInputRef.current?.click()}
                  disabled={badgeUploading}
                  className="mt-2 w-full p-4 bg-gray-50 hover:bg-amber-50 rounded-lg border-2 border-dashed border-gray-300 hover:border-amber-400 text-center text-xs text-gray-500 hover:text-amber-700 transition-all flex flex-col items-center gap-1.5"
                >
                  <Upload className="h-5 w-5" />
                  <span><strong>Bấm để chọn file</strong> hoặc kéo thả ảnh từ máy</span>
                  <span className="text-[10px] text-gray-400">PNG nền trong suốt, vuông 1:1, &lt; 1 MB (chấp nhận đến 5 MB)</span>
                </button>
              )}

              <label className="mt-3 flex items-center gap-2 text-sm bg-amber-50 border border-amber-200 rounded-lg p-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={catForm.require_all_exercises_passed !== false}
                  onChange={(e) => setCatForm({ ...catForm, require_all_exercises_passed: e.target.checked })}
                />
                <ShieldCheck className="h-4 w-4 text-amber-700" />
                <span className="text-amber-900 font-medium">
                  Bắt buộc đạt tất cả bài tập mới cấp chứng nhận
                </span>
              </label>
              <p className="text-[11px] text-gray-500 -mt-1">
                Bật: học viên phải hoàn thành 100% bài học VÀ 100% bài tập đạt điểm. Tắt: chỉ cần đủ bài học.
              </p>

              <details className="mt-2">
                <summary className="text-xs text-amber-700 cursor-pointer font-medium">⚙️ Tuỳ biến mẫu chứng nhận</summary>
                <div className="mt-2 space-y-2 p-3 bg-amber-50/50 rounded-lg border border-amber-100">
                  <input
                    className="w-full border rounded-lg px-3 py-1.5 text-sm"
                    placeholder="Tên người ký (vd: Nguyễn Văn A)"
                    value={catForm.certificate_template?.signature_name || ''}
                    onChange={(e) => setCatForm({ ...catForm, certificate_template: { ...catForm.certificate_template, signature_name: e.target.value } })}
                  />
                  <input
                    className="w-full border rounded-lg px-3 py-1.5 text-sm"
                    placeholder="Chức vụ người ký (vd: Giám đốc đào tạo)"
                    value={catForm.certificate_template?.signature_title || ''}
                    onChange={(e) => setCatForm({ ...catForm, certificate_template: { ...catForm.certificate_template, signature_title: e.target.value } })}
                  />
                  <input
                    className="w-full border rounded-lg px-3 py-1.5 text-sm"
                    placeholder="Ghi chú dưới chứng nhận (footer note)"
                    value={catForm.certificate_template?.footer_note || ''}
                    onChange={(e) => setCatForm({ ...catForm, certificate_template: { ...catForm.certificate_template, footer_note: e.target.value } })}
                  />
                </div>
              </details>
            </div>

            {/* ─── Deadline khoá học ─── */}
            <div className="bg-gradient-to-br from-rose-50 to-orange-50 border-2 border-rose-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-bold text-rose-900 flex items-center gap-2">⏰ Hạn hoàn thành khoá học</p>
                  <p className="text-xs text-rose-700/80">Áp deadline để học viên hoàn thành đúng thời gian quy định.</p>
                </div>
                {catForm.id && (
                  <button
                    type="button"
                    onClick={() => { if (!showDeadlineHistory) loadDeadlineHistory(catForm.id); setShowDeadlineHistory(!showDeadlineHistory); }}
                    className="text-xs px-3 py-1.5 bg-white border border-rose-300 text-rose-700 rounded-lg hover:bg-rose-50"
                  >
                    📜 Lịch sử ({deadlineHistory.length})
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer ${catForm.deadline_mode === 'none' ? 'bg-white border-rose-400 ring-2 ring-rose-200' : 'bg-white/60 border-gray-200'}`}>
                  <input type="radio" name="deadline_mode" checked={catForm.deadline_mode === 'none'} onChange={() => setCatForm({ ...catForm, deadline_mode: 'none' })} className="mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold">Không hạn</p>
                    <p className="text-[10px] text-gray-500">Học viên tự sắp xếp</p>
                  </div>
                </label>
                <label className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer ${catForm.deadline_mode === 'fixed' ? 'bg-white border-rose-400 ring-2 ring-rose-200' : 'bg-white/60 border-gray-200'}`}>
                  <input type="radio" name="deadline_mode" checked={catForm.deadline_mode === 'fixed'} onChange={() => setCatForm({ ...catForm, deadline_mode: 'fixed' })} className="mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold">Cố định ngày</p>
                    <p className="text-[10px] text-gray-500">Cùng deadline cho mọi học viên</p>
                  </div>
                </label>
                <label className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer ${catForm.deadline_mode === 'relative' ? 'bg-white border-rose-400 ring-2 ring-rose-200' : 'bg-white/60 border-gray-200'}`}>
                  <input type="radio" name="deadline_mode" checked={catForm.deadline_mode === 'relative'} onChange={() => setCatForm({ ...catForm, deadline_mode: 'relative' })} className="mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold">N ngày từ lúc bắt đầu</p>
                    <p className="text-[10px] text-gray-500">Mỗi học viên có hạn riêng</p>
                  </div>
                </label>
              </div>

              {catForm.deadline_mode === 'fixed' && (
                <div className="mt-3">
                  <label className="text-[11px] font-medium text-rose-800">Hạn chót *</label>
                  <input
                    type="datetime-local"
                    className="w-full border border-rose-300 rounded-lg px-3 py-2 text-sm bg-white"
                    value={catForm.deadline_at || ''}
                    onChange={(e) => setCatForm({ ...catForm, deadline_at: e.target.value })}
                  />
                </div>
              )}

              {catForm.deadline_mode === 'relative' && (
                <div className="mt-3">
                  <label className="text-[11px] font-medium text-rose-800">Số ngày kể từ khi bắt đầu *</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      className="w-32 border border-rose-300 rounded-lg px-3 py-2 text-sm bg-white"
                      value={catForm.deadline_duration_days || ''}
                      onChange={(e) => setCatForm({ ...catForm, deadline_duration_days: e.target.value })}
                    />
                    <span className="text-xs text-gray-600">ngày</span>
                  </div>
                </div>
              )}

              {catForm.deadline_mode !== 'none' && (
                <div className="mt-3">
                  <label className="text-[11px] font-medium text-rose-800">Ghi chú (lý do thay đổi…)</label>
                  <input
                    type="text"
                    className="w-full border border-rose-200 rounded-lg px-3 py-2 text-sm bg-white"
                    placeholder="VD: Gia hạn thêm 7 ngày do …"
                    value={catForm.deadline_note || ''}
                    onChange={(e) => setCatForm({ ...catForm, deadline_note: e.target.value })}
                  />
                </div>
              )}

              {showDeadlineHistory && (
                <div className="mt-3 bg-white rounded-lg border border-rose-200 max-h-60 overflow-y-auto">
                  <div className="px-3 py-2 border-b text-[11px] uppercase tracking-wider text-rose-700 font-bold">Lịch sử thay đổi deadline</div>
                  {deadlineHistory.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-gray-400 text-center">Chưa có thay đổi nào</p>
                  ) : (
                    <ul className="divide-y divide-rose-100">
                      {deadlineHistory.map((h) => (
                        <li key={h.id} className="px-3 py-2 text-xs">
                          <div className="flex items-center justify-between text-[11px] text-gray-500">
                            <span>{new Date(h.created_at).toLocaleString('vi-VN')}</span>
                            <span className="font-medium">{h.changed_by_user?.full_name || '—'}</span>
                          </div>
                          <div className="mt-1 text-gray-800">
                            <span className="line-through opacity-60">
                              {h.prev_mode || 'none'}{h.prev_deadline_at ? ` → ${new Date(h.prev_deadline_at).toLocaleDateString('vi-VN')}` : ''}{h.prev_duration_days ? ` (${h.prev_duration_days}d)` : ''}
                            </span>
                            <span className="mx-2 text-rose-500">➜</span>
                            <span className="font-semibold text-rose-700">
                              {h.new_mode || 'none'}{h.new_deadline_at ? ` → ${new Date(h.new_deadline_at).toLocaleDateString('vi-VN')}` : ''}{h.new_duration_days ? ` (${h.new_duration_days}d)` : ''}
                            </span>
                          </div>
                          {h.note && <p className="mt-0.5 text-[11px] text-gray-600 italic">"{h.note}"</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2 border-t">
              <button type="button" onClick={saveCategory} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">
                <Save className="h-4 w-4" /> Lưu
              </button>
              {catForm.id && (
                <button type="button" onClick={() => { setCatForm({
                  name: '', slug: '', icon: '📚', description: '', parent_id: '', sort_order: 0,
                  badge_image_url: '', require_all_exercises_passed: true,
                  certificate_template: { signature_name: '', signature_title: '', footer_note: '', accent_color: '' },
                  deadline_mode: 'none', deadline_at: '', deadline_duration_days: '', deadline_note: '',
                }); setDeadlineHistory([]); setShowDeadlineHistory(false); }} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm">
                  Huỷ sửa
                </button>
              )}
            </div>
          </div>

          <ul className="space-y-2">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between bg-white border rounded-lg px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  {c.badge_image_url ? (
                    <img src={c.badge_image_url} alt="" className="w-8 h-8 object-contain shrink-0" />
                  ) : (
                    <span className="text-lg">{c.icon}</span>
                  )}
                  <span>{c.name}</span>
                  {c.require_all_exercises_passed && (
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium" title="Bắt buộc đạt tất cả bài tập">
                      🏅 Chứng nhận
                    </span>
                  )}
                  {c.deadline_mode && c.deadline_mode !== 'none' && (
                    <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full font-medium" title="Có deadline">
                      ⏰ {c.deadline_mode === 'fixed' && c.deadline_at
                        ? new Date(c.deadline_at).toLocaleDateString('vi-VN')
                        : c.deadline_mode === 'relative' && c.deadline_duration_days
                          ? `${c.deadline_duration_days} ngày`
                          : 'Deadline'}
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <button type="button" className="text-blue-600 text-xs" onClick={() => {
                    setCatForm({
                      ...c,
                      certificate_template: c.certificate_template || { signature_name: '', signature_title: '', footer_note: '', accent_color: '' },
                      deadline_mode: c.deadline_mode || 'none',
                      deadline_at: c.deadline_at ? new Date(c.deadline_at).toISOString().slice(0, 16) : '',
                      deadline_duration_days: c.deadline_duration_days || '',
                      deadline_note: c.deadline_note || '',
                    });
                    loadDeadlineHistory(c.id);
                  }}>Sửa</button>
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
                      <p className="font-medium" style={{ color: '#000000' }}>{l.title}</p>
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
              style={{ color: '#000000' }}
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
              style={{ color: '#000000' }}
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
              style={{ color: '#000000' }}
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
                <thead className="bg-gray-50 text-xs uppercase" style={{ color: '#000000' }}>
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
                    <tr key={ex.id} className="border-t hover:bg-slate-200/70 transition-colors">
                      <td className="px-3 py-2 font-medium" style={{ color: '#000000' }}>{ex.title}</td>
                      <td className="px-3 py-2 text-xs">
                        <p style={{ color: '#000000' }}>{ex.lesson?.title}</p>
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

      {tab === 'employees' && !loading && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
            {/* Bước 1: Khoá học */}
            <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3">
              <div className="text-[11px] font-bold text-violet-700 uppercase tracking-wide mb-2">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-violet-600 text-white text-[9px] mr-1">1</span>
                Chọn khoá học để xem chứng nhận
              </div>
              <select
                className="h-9 w-full md:w-96 px-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer"
                value={empCategoryId}
                onChange={(e) => setEmpCategoryId(e.target.value)}
              >
                <option value="">— Chọn khoá để xem —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>

            {/* Bước 2–4: Công ty → Phòng ban → NV (theo CRM Dashboard) */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-3 space-y-3">
              <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                Lọc nhân viên (công ty → phòng ban → NV)
              </div>
              <div className="flex flex-wrap items-end gap-3">
                {/* 2. Công ty */}
                {isSysAdmin ? (
                  <div className="flex flex-col gap-0.5 min-w-[10rem]">
                    <label className="text-[10px] text-slate-600 font-semibold">
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-600 text-white text-[9px] mr-1">2</span>
                      Công ty
                    </label>
                    <select
                      value={empFilter.company_id}
                      onChange={(e) => {
                        setEmpFilter({ ...empFilter, company_id: e.target.value, department_id: '', user_id: '' });
                        setEmpUserSearch('');
                      }}
                      className="h-9 w-44 px-2 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="">Tất cả công ty</option>
                      {empCompanies.map((c) => (
                        <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                      ))}
                    </select>
                  </div>
                ) : currentUser?.company_id && (
                  <span
                    className="h-9 inline-flex items-center px-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-900 self-end"
                    title="Admin phạm vi một công ty"
                  >
                    <span className="font-semibold text-[10px] mr-1.5">2</span>
                    🏢 {userCompanyName || 'Công ty của bạn'}
                  </span>
                )}

                {/* 3. Phòng ban */}
                <div className="flex flex-col gap-0.5 min-w-[10rem]">
                  <label className="text-[10px] text-slate-600 font-semibold">
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-600 text-white text-[9px] mr-1">3</span>
                    Phòng ban
                  </label>
                  <select
                    value={empFilter.department_id}
                    onChange={(e) => {
                      setEmpFilter({ ...empFilter, department_id: e.target.value, user_id: '' });
                      setEmpUserSearch('');
                    }}
                    title="Lọc theo phòng ban (đã giới hạn theo công ty đã chọn)"
                    className="h-9 w-44 px-2 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="">Tất cả phòng ban</option>
                    <option value="__none__">Chưa gán phòng ban</option>
                    {empDepartments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                {/* 4. NV */}
                <div className="flex flex-wrap items-end gap-2 border-t border-slate-200/80 pt-3 mt-1 w-full sm:border-t-0 sm:pt-0 sm:mt-0 sm:w-auto sm:border-l sm:pl-3 sm:ml-0">
                  <span className="text-[10px] font-bold text-slate-500 uppercase self-center mr-1 hidden sm:inline">4</span>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] text-slate-600 font-semibold">Tìm NV</label>
                    <input
                      type="search"
                      value={empUserSearch}
                      onChange={(e) => setEmpUserSearch(e.target.value)}
                      placeholder="Tên, email…"
                      className="h-9 w-36 px-2 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-[11rem] flex-1 sm:flex-initial sm:min-w-[12rem]">
                    <label className="text-[10px] text-slate-600 font-semibold">Chọn NV</label>
                    {(() => {
                      const term = empUserSearch.trim().toLowerCase();
                      const filtered = !term ? empUsers : empUsers.filter((u) => {
                        const name = (u.full_name || '').toLowerCase();
                        const email = (u.email || '').toLowerCase();
                        const pos = (u.position || '').toLowerCase();
                        return name.includes(term) || email.includes(term) || pos.includes(term);
                      });
                      const grouped = empDepartments
                        .map((d) => ({ dept: d, users: filtered.filter((u) => u.department_id === d.id) }))
                        .filter((g) => g.users.length > 0);
                      const orphan = filtered.filter((u) => !u.department_id);
                      return (
                        <select
                          value={empFilter.user_id}
                          onChange={(e) => setEmpFilter({ ...empFilter, user_id: e.target.value })}
                          title="Chỉ hiện NV thuộc công ty & phòng ban đã chọn (khi có)"
                          className="h-9 w-full min-w-0 px-2 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                        >
                          <option value="">Tất cả nhân viên</option>
                          {grouped.length > 0 ? (
                            <>
                              {grouped.map(({ dept, users }) => (
                                <optgroup key={dept.id} label={`📁 ${dept.name}`}>
                                  {users.map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.full_name || u.email}
                                      {u.position ? ` (${u.position})` : ''}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                              {orphan.length > 0 && (
                                <optgroup label="📁 Chưa gán phòng ban">
                                  {orphan.map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.full_name || u.email}
                                      {u.position ? ` (${u.position})` : ''}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </>
                          ) : (
                            filtered.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.full_name || u.email}
                                {u.position ? ` (${u.position})` : ''}
                              </option>
                            ))
                          )}
                        </select>
                      );
                    })()}
                  </div>
                  {empUsers.length > 0 && (
                    <span
                      className="text-[10px] text-emerald-800 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100 self-end whitespace-nowrap"
                      title="Số NV sau bước công ty + phòng ban (trước ô tìm kiếm)"
                    >
                      {empUsers.length} NV
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Bộ lọc phụ: Tìm nhanh + Trạng thái */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-0.5 flex-1 min-w-[14rem]">
                <label className="text-[10px] text-gray-500 font-semibold">Tìm nhanh trong bảng kết quả</label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    className="w-full h-9 border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-xs bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="Tên hoặc email"
                    value={empFilter.q}
                    onChange={(e) => setEmpFilter({ ...empFilter, q: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-gray-500 font-semibold">Trạng thái</label>
                <select
                  className="h-9 w-44 px-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer"
                  value={empFilter.only}
                  onChange={(e) => setEmpFilter({ ...empFilter, only: e.target.value })}
                >
                  <option value="">Tất cả</option>
                  <option value="issued">Đã có chứng nhận</option>
                  <option value="missing">Chưa có chứng nhận</option>
                  <option value="eligible">Đã đủ điều kiện (chưa cấp)</option>
                </select>
              </div>
              {(empFilter.company_id || empFilter.department_id || empFilter.user_id || empFilter.q || empFilter.only || empUserSearch) && (
                <button
                  type="button"
                  onClick={() => {
                    setEmpFilter({ q: '', only: '', company_id: '', department_id: '', user_id: '' });
                    setEmpUserSearch('');
                  }}
                  className="h-9 inline-flex items-center gap-1 px-3 text-xs text-gray-600 hover:text-violet-700 border border-gray-200 hover:border-violet-300 rounded-lg bg-white"
                >
                  <X className="h-3.5 w-3.5" />
                  Xoá bộ lọc
                </button>
              )}
            </div>
          </div>

          {!empCategoryId ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center text-sm text-amber-800">
              Hãy chọn một khoá học để xem danh sách nhân viên và trạng thái chứng nhận.
            </div>
          ) : empLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-violet-600" /></div>
          ) : !empData ? null : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white border rounded-2xl p-4">
                  <p className="text-xs text-gray-500 uppercase">Tổng nhân viên</p>
                  <p className="text-2xl font-bold">{empData.total_employees || 0}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                  <p className="text-xs text-emerald-700 uppercase">Đã có chứng nhận</p>
                  <p className="text-2xl font-bold text-emerald-700">
                    {empData.employees.filter((e) => e.state === 'issued').length}
                  </p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <p className="text-xs text-amber-700 uppercase">Đủ điều kiện</p>
                  <p className="text-2xl font-bold text-amber-700">
                    {empData.employees.filter((e) => e.state === 'eligible').length}
                  </p>
                </div>
                <div className="bg-gray-50 border rounded-2xl p-4">
                  <p className="text-xs text-gray-500 uppercase">Bài học / Bài tập</p>
                  <p className="text-2xl font-bold">{empData.total_lessons} / {empData.total_exercises}</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Nhân viên</th>
                      <th className="px-4 py-3 text-left">Vai trò</th>
                      <th className="px-4 py-3 text-left">Bài học</th>
                      <th className="px-4 py-3 text-left">Bài tập</th>
                      <th className="px-4 py-3 text-left">Hoạt động cuối</th>
                      <th className="px-4 py-3 text-left">Chứng nhận</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {empData.employees.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-gray-400">Không có nhân viên phù hợp</td>
                      </tr>
                    ) : empData.employees.map((emp) => (
                      <tr key={emp.user.id} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{emp.user.full_name}</div>
                          <div className="text-xs text-gray-500">{emp.user.email}</div>
                          {(emp.user.company?.short_name || emp.user.company?.name || emp.user.department?.name) && (
                            <div className="text-[11px] text-gray-400 mt-0.5">
                              {emp.user.company?.short_name || emp.user.company?.name || ''}
                              {emp.user.company && emp.user.department ? ' · ' : ''}
                              {emp.user.department?.name || ''}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <span className="px-2 py-1 bg-gray-100 rounded">{emp.user.role}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500" style={{ width: `${emp.lesson_rate}%` }} />
                            </div>
                            <span className="text-xs font-medium">{emp.completed_lessons}/{empData.total_lessons}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-purple-500" style={{ width: `${emp.exercise_rate}%` }} />
                            </div>
                            <span className="text-xs font-medium">{emp.passed_exercises}/{empData.total_exercises}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {emp.last_activity_at ? new Date(emp.last_activity_at).toLocaleDateString('vi-VN') : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {emp.state === 'issued' && emp.certificate ? (
                            <Link
                              to={`/knowledge/certificates/${emp.certificate.id}`}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-800 rounded text-xs font-medium"
                            >
                              <Award className="h-3 w-3" />
                              {emp.certificate.certificate_number}
                            </Link>
                          ) : emp.state === 'revoked' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs">
                              Đã thu hồi
                            </span>
                          ) : emp.state === 'eligible' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs">
                              Đủ điều kiện
                            </span>
                          ) : emp.state === 'in_progress' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs">
                              Đang học
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">Chưa bắt đầu</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {emp.state === 'issued' && emp.certificate ? (
                            <button
                              type="button"
                              onClick={() => revokeCertificate(emp.certificate.id)}
                              className="text-xs text-red-600 hover:underline"
                            >
                              Thu hồi
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => grantCertificate(emp.user.email)}
                              className="text-xs text-violet-600 hover:underline"
                              title="Hoàn thành tất cả bài học + bài tập + cấp chứng nhận"
                            >
                              Cấp thủ công
                            </button>
                          )}
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
