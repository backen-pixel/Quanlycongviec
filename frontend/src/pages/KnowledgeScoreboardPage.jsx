import { useState, useEffect, useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import api from '../lib/api';
import { isAdminLike } from '../lib/adminRole';
import {
  ChevronLeft, BarChart3, Search, Users, CheckCircle2, XCircle, Clock,
  Filter, Download, TrendingUp, Loader2, Building2, RotateCcw,
} from 'lucide-react';

const STATUS_BADGE = {
  passed:    { label: 'Đạt',     class: 'bg-green-100 text-green-700 border-green-200' },
  failed:    { label: 'Chưa đạt', class: 'bg-red-100 text-red-700 border-red-200' },
  submitted: { label: 'Chờ chấm', class: 'bg-amber-100 text-amber-700 border-amber-200' },
  graded:    { label: 'Đã chấm',  class: 'bg-blue-100 text-blue-700 border-blue-200' },
};

const TYPE_LABEL = { quiz: 'Trắc nghiệm', checklist: 'Checklist', essay: 'Tự luận' };

function StatCard({ icon: Icon, label, value, sub, color = 'gray' }) {
  const colors = {
    gray: 'text-gray-700',
    green: 'text-green-600',
    red: 'text-red-600',
    amber: 'text-amber-600',
    blue: 'text-blue-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-wide mb-1">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <p className={`text-3xl font-bold ${colors[color]}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function downloadCSV(rows, filename) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function KnowledgeScoreboardPage() {
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  if (!isAdminLike(currentUser)) return <Navigate to="/knowledge" replace />;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    q: '',
    user_id: '',
    exercise_id: '',
    lesson_id: '',
    category_id: '',
    company_id: '',
    department_id: '',
    region_id: '',
    status: '',
    from: '',
    to: '',
  });
  const [grading, setGrading] = useState({});

  useEffect(() => {
    load();
  }, []);

  const load = async (override) => {
    setLoading(true);
    try {
      const params = {};
      const f = override || filters;
      Object.keys(f).forEach((k) => { if (f[k]) params[k] = f[k]; });
      const { data: res } = await api.get('/knowledge/admin/scoreboard', { params });
      setData(res);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const applyFilters = () => load();

  const resetFilters = () => {
    const blank = {
      q: '', user_id: '', exercise_id: '', lesson_id: '', category_id: '',
      company_id: '', department_id: '', region_id: '',
      status: '', from: '', to: '',
    };
    setFilters(blank);
    load(blank);
  };

  const activeFilterCount = Object.entries(filters).filter(([_, v]) => v).length;

  const gradeOne = async (subId) => {
    const score = grading[subId]?.score;
    const feedback = grading[subId]?.feedback;
    if (score == null || score === '') return alert('Nhập điểm');
    try {
      await api.patch(`/knowledge/submissions/${subId}/grade`, {
        score: Number(score),
        feedback,
        status: Number(score) >= 70 ? 'passed' : 'failed',
      });
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi chấm bài');
    }
  };

  const exportCSV = () => {
    if (!data?.submissions?.length) return;
    const rows = data.submissions.map((s) => ({
      'Nhân viên': s.user?.full_name || '',
      'Email': s.user?.email || '',
      'Công ty': s.user?.company?.name || '',
      'Phòng ban': s.user?.department?.name || '',
      'Module': s.exercise?.lesson?.category?.name || '',
      'Bài học': s.exercise?.lesson?.title || '',
      'Bài tập': s.exercise?.title || '',
      'Loại': TYPE_LABEL[s.exercise?.type] || s.exercise?.type,
      'Điểm': s.score ?? '',
      'Trạng thái': STATUS_BADGE[s.status]?.label || s.status,
      'Lần thử': s.attempt_number,
      'Ngày nộp': new Date(s.submitted_at).toLocaleString('vi-VN'),
      'Nhận xét': s.feedback || '',
    }));
    downloadCSV(rows, `bang-diem-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const filtersAvailable = data?.filters || {
    users: [], exercises: [], lessons: [], companies: [],
    categories: [], departments: [], regions: [],
  };

  const isSysAdmin = (filtersAvailable.companies || []).length > 0;

  const filteredLessons = useMemo(() => {
    if (!filters.category_id) return filtersAvailable.lessons;
    return (filtersAvailable.lessons || []).filter((l) => l.category_id === filters.category_id);
  }, [filtersAvailable.lessons, filters.category_id]);

  const filteredExercises = useMemo(() => {
    let list = filtersAvailable.exercises || [];
    if (filters.lesson_id) list = list.filter((e) => e.lesson?.id === filters.lesson_id);
    if (filters.category_id) list = list.filter((e) => e.lesson?.category_id === filters.category_id);
    return list;
  }, [filtersAvailable.exercises, filters.lesson_id, filters.category_id]);

  const filteredUsers = useMemo(() => {
    if (!filters.department_id) return filtersAvailable.users;
    return (filtersAvailable.users || []).filter((u) => u.department_id === filters.department_id);
  }, [filtersAvailable.users, filters.department_id]);

  return (
    <div className="max-w-7xl mx-auto pb-12">
      <Link to="/knowledge/admin" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-violet-600 mb-4">
        <ChevronLeft className="h-4 w-4" /> Quản trị kiến thức
      </Link>

      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 via-violet-700 to-purple-700 text-white p-6 mb-6 shadow-lg">
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-white/10 rounded-full blur-3xl" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="h-5 w-5" />
              <span className="text-sm opacity-90">Quản trị</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold">Bảng điểm công ty</h1>
            <p className="text-violet-100 mt-1 text-sm">Theo dõi kết quả học tập của toàn bộ nhân viên</p>
          </div>
          <button
            type="button"
            onClick={exportCSV}
            disabled={!data?.submissions?.length}
            className="flex items-center gap-2 px-4 py-2.5 bg-white text-violet-700 rounded-xl font-medium hover:bg-violet-50 disabled:opacity-50 shadow"
          >
            <Download className="h-4 w-4" /> Xuất CSV
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard icon={Users} label="Tổng lượt nộp" value={data?.totals?.count || 0} color="gray" />
        <StatCard icon={CheckCircle2} label="Đạt" value={data?.totals?.passed || 0} color="green" />
        <StatCard icon={XCircle} label="Chưa đạt" value={data?.totals?.failed || 0} color="red" />
        <StatCard icon={Clock} label="Chờ chấm" value={data?.totals?.pending || 0} color="amber" />
        <StatCard icon={TrendingUp} label="Điểm TB" value={data?.totals?.avg_score != null ? `${data.totals.avg_score}` : '—'} sub={`${data?.totals?.unique_users || 0} nhân viên`} color="blue" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-violet-600" />
          <h3 className="font-semibold text-gray-900">Bộ lọc</h3>
          {activeFilterCount > 0 && (
            <span className="text-xs px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full">
              {activeFilterCount} đang áp dụng
            </span>
          )}
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="search"
            placeholder="Tìm tên nhân viên hoặc email..."
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Nội dung kiến thức
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <select
                value={filters.category_id}
                onChange={(e) => setFilters({ ...filters, category_id: e.target.value, lesson_id: '', exercise_id: '' })}
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white"
              >
                <option value="">— Tất cả module —</option>
                {filtersAvailable.categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
              <select
                value={filters.lesson_id}
                onChange={(e) => setFilters({ ...filters, lesson_id: e.target.value, exercise_id: '' })}
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white"
              >
                <option value="">— Tất cả bài học —</option>
                {filteredLessons.map((l) => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
              <select
                value={filters.exercise_id}
                onChange={(e) => setFilters({ ...filters, exercise_id: e.target.value })}
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white"
              >
                <option value="">— Tất cả bài tập —</option>
                {filteredExercises.map((e) => (
                  <option key={e.id} value={e.id}>{e.title}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Phạm vi tổ chức
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              {isSysAdmin ? (
                <select
                  value={filters.company_id}
                  onChange={(e) => setFilters({ ...filters, company_id: e.target.value })}
                  className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white"
                >
                  <option value="">— Tất cả công ty —</option>
                  {filtersAvailable.companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              ) : <div className="hidden md:block" />}
              <select
                value={filters.region_id}
                onChange={(e) => setFilters({ ...filters, region_id: e.target.value })}
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white"
              >
                <option value="">— Tất cả khu vực —</option>
                {filtersAvailable.regions.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}{r.code ? ` (${r.code})` : ''}</option>
                ))}
              </select>
              <select
                value={filters.department_id}
                onChange={(e) => setFilters({ ...filters, department_id: e.target.value, user_id: '' })}
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white"
              >
                <option value="">— Tất cả phòng ban —</option>
                {filtersAvailable.departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <select
                value={filters.user_id}
                onChange={(e) => setFilters({ ...filters, user_id: e.target.value })}
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white"
              >
                <option value="">— Tất cả nhân viên —</option>
                {filteredUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Trạng thái & thời gian
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white"
              >
                <option value="">— Mọi trạng thái —</option>
                <option value="passed">✅ Đạt</option>
                <option value="failed">❌ Chưa đạt</option>
                <option value="submitted">⏳ Chờ chấm</option>
                <option value="graded">📝 Đã chấm</option>
              </select>
              <div className="flex items-center gap-2 md:col-span-2">
                <span className="text-xs text-gray-500 shrink-0">Từ</span>
                <input
                  type="date"
                  value={filters.from}
                  onChange={(e) => setFilters({ ...filters, from: e.target.value })}
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-sm"
                />
                <span className="text-xs text-gray-500 shrink-0">đến</span>
                <input
                  type="date"
                  value={filters.to}
                  onChange={(e) => setFilters({ ...filters, to: e.target.value })}
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={applyFilters}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5"
          >
            <Filter className="h-4 w-4" /> Áp dụng bộ lọc
          </button>
          <button
            type="button"
            onClick={resetFilters}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm flex items-center gap-1.5"
          >
            <RotateCcw className="h-4 w-4" /> Đặt lại
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
        </div>
      ) : !data?.submissions?.length ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl py-16 text-center">
          <BarChart3 className="h-12 w-12 mx-auto text-gray-300 mb-2" />
          <p className="text-gray-500">Không có bài làm nào phù hợp bộ lọc.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-3 py-3">Nhân viên</th>
                  <th className="text-left px-3 py-3">Bài tập</th>
                  <th className="text-left px-3 py-3">Bài học</th>
                  <th className="text-center px-2 py-3">Loại</th>
                  <th className="text-center px-2 py-3">Điểm</th>
                  <th className="text-center px-2 py-3">Trạng thái</th>
                  <th className="text-center px-2 py-3">Lần</th>
                  <th className="text-left px-2 py-3">Ngày nộp</th>
                  <th className="text-right px-3 py-3">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {data.submissions.map((s) => {
                  const badge = STATUS_BADGE[s.status] || STATUS_BADGE.submitted;
                  const isEssayPending = s.exercise?.type === 'essay' && s.status === 'submitted';
                  const passing = s.exercise?.passing_score ?? 70;
                  return (
                    <tr key={s.id} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
                            {(s.user?.full_name || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">{s.user?.full_name || '—'}</p>
                            <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                              {s.user?.company?.name && (
                                <><Building2 className="h-3 w-3" />{s.user.company.name}</>
                              )}
                              {s.user?.department?.name && ` · ${s.user.department.name}`}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-800">{s.exercise?.title || '—'}</p>
                      </td>
                      <td className="px-3 py-2">
                        {s.exercise?.lesson && (
                          <Link to={`/knowledge/lessons/${s.exercise.lesson.id}`} className="text-xs text-violet-600 hover:underline">
                            {s.exercise.lesson.category?.icon} {s.exercise.lesson.title}
                          </Link>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center text-xs text-gray-500">
                        {TYPE_LABEL[s.exercise?.type] || s.exercise?.type}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {s.score != null ? (
                          <span className={`font-bold ${s.score >= passing ? 'text-green-600' : 'text-amber-600'}`}>
                            {s.score}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${badge.class}`}>{badge.label}</span>
                      </td>
                      <td className="px-2 py-2 text-center text-xs text-gray-500">{s.attempt_number}</td>
                      <td className="px-2 py-2 text-xs text-gray-500">
                        {new Date(s.submitted_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {isEssayPending ? (
                          <details>
                            <summary className="cursor-pointer text-xs text-violet-600 hover:underline">Chấm</summary>
                            <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs space-y-1 text-left">
                              <p className="text-gray-600 max-h-20 overflow-y-auto whitespace-pre-wrap">
                                <strong>Bài làm:</strong> {s.answers?.essay || '—'}
                              </p>
                              <input
                                type="number"
                                placeholder="Điểm"
                                className="w-full border rounded px-2 py-1"
                                value={grading[s.id]?.score || ''}
                                onChange={(e) => setGrading({ ...grading, [s.id]: { ...grading[s.id], score: e.target.value } })}
                              />
                              <input
                                placeholder="Nhận xét"
                                className="w-full border rounded px-2 py-1"
                                value={grading[s.id]?.feedback || ''}
                                onChange={(e) => setGrading({ ...grading, [s.id]: { ...grading[s.id], feedback: e.target.value } })}
                              />
                              <button
                                type="button"
                                onClick={() => gradeOne(s.id)}
                                className="w-full px-2 py-1 bg-green-600 text-white rounded text-xs"
                              >
                                Lưu điểm
                              </button>
                            </div>
                          </details>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 bg-gray-50 text-xs text-gray-500 text-center border-t">
            Hiển thị {data.submissions.length} bản ghi (tối đa 1000).
          </div>
        </div>
      )}
    </div>
  );
}
