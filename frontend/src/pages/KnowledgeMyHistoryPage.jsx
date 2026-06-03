import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import {
  ChevronLeft, History, CheckCircle2, XCircle, Award, Clock, ListChecks, Filter,
} from 'lucide-react';
import { KNOWLEDGE_BACK_LINK_CLASS, knowledgeBackLinkStyle } from '../lib/knowledgeNavStyles';

const STATUS_BADGE = {
  passed:   { label: '✓ Đạt',    class: 'bg-green-100 text-green-700 border-green-200' },
  failed:   { label: '✗ Chưa đạt', class: 'bg-red-100 text-red-700 border-red-200' },
  submitted:{ label: 'Chờ chấm', class: 'bg-amber-100 text-amber-700 border-amber-200' },
  graded:   { label: 'Đã chấm',  class: 'bg-blue-100 text-blue-700 border-blue-200' },
};

const TYPE_LABEL = { quiz: 'Trắc nghiệm', checklist: 'Checklist', essay: 'Tự luận' };

export default function KnowledgeMyHistoryPage() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/knowledge/my-submissions');
      setSubmissions(data.submissions || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const filtered = useMemo(() => {
    if (filter === 'all') return submissions;
    return submissions.filter((s) => s.status === filter);
  }, [submissions, filter]);

  const stats = useMemo(() => ({
    total: submissions.length,
    passed: submissions.filter((s) => s.status === 'passed').length,
    failed: submissions.filter((s) => s.status === 'failed').length,
    pending: submissions.filter((s) => s.status === 'submitted').length,
    avgScore: submissions.filter((s) => s.score != null).length
      ? Math.round(submissions.filter((s) => s.score != null).reduce((a, b) => a + (b.score || 0), 0) / submissions.filter((s) => s.score != null).length)
      : null,
  }), [submissions]);

  return (
    <div className="max-w-5xl mx-auto pb-12">
      <Link to="/knowledge" className={`${KNOWLEDGE_BACK_LINK_CLASS} mb-4`} style={knowledgeBackLinkStyle}>
        <ChevronLeft className="h-4 w-4" /> Thư viện kiến thức
      </Link>

      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600 text-white p-8 mb-6 shadow-lg">
        <div className="absolute -top-10 -right-10 w-60 h-60 bg-white/10 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <History className="h-5 w-5" />
            <span className="text-sm opacity-90">Lịch sử học tập</span>
          </div>
          <h1 className="text-3xl font-bold">Bài tập của tôi</h1>
          <p className="text-violet-100 mt-2">Xem lại tất cả các lần bạn làm bài và điểm số.</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
              <p className="text-xs text-violet-100">Tổng lượt làm</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
              <p className="text-xs text-violet-100">Đã đạt</p>
              <p className="text-2xl font-bold text-green-300">{stats.passed}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
              <p className="text-xs text-violet-100">Điểm trung bình</p>
              <p className="text-2xl font-bold">{stats.avgScore != null ? `${stats.avgScore}%` : '—'}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
              <p className="text-xs text-violet-100">Chờ chấm</p>
              <p className="text-2xl font-bold text-amber-200">{stats.pending}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Filter className="h-4 w-4 text-gray-400" />
        {[
          { id: 'all', label: 'Tất cả' },
          { id: 'passed', label: 'Đã đạt' },
          { id: 'failed', label: 'Chưa đạt' },
          { id: 'submitted', label: 'Chờ chấm' },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f.id ? 'bg-violet-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-violet-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin h-8 w-8 border-2 border-violet-600 border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl py-16 text-center">
          <ListChecks className="h-12 w-12 mx-auto text-gray-300 mb-2" />
          <p className="text-gray-500">Chưa có bài làm nào{filter !== 'all' ? ' phù hợp' : ''}.</p>
          <Link to="/knowledge" className="text-violet-600 text-sm mt-3 inline-block hover:underline">
            Tìm bài học mới →
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((s) => {
            const badge = STATUS_BADGE[s.status] || STATUS_BADGE.submitted;
            const passed = s.status === 'passed';
            return (
              <li key={s.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:border-violet-200 transition-colors">
                <div className="flex items-start gap-4 p-4">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${
                    passed ? 'bg-green-100' : s.status === 'failed' ? 'bg-red-100' : 'bg-amber-100'
                  }`}>
                    {passed ? <CheckCircle2 className="h-7 w-7 text-green-600" /> :
                     s.status === 'failed' ? <XCircle className="h-7 w-7 text-red-600" /> :
                     <Clock className="h-7 w-7 text-amber-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${badge.class}`}>{badge.label}</span>
                      <span className="text-xs text-gray-400">{TYPE_LABEL[s.exercise?.type] || s.exercise?.type}</span>
                      <span className="text-xs text-gray-400">· Lần thứ {s.attempt_number}</span>
                    </div>
                    <h3 className="font-semibold mt-1" style={{ color: '#000000' }}>{s.exercise?.title}</h3>
                    {s.exercise?.lesson && (
                      <Link to={`/knowledge/lessons/${s.exercise.lesson.id}`} className="text-xs text-violet-600 hover:underline mt-0.5 inline-block">
                        ← {s.exercise.lesson.title}
                      </Link>
                    )}
                    <p className="text-xs text-gray-400 mt-1">{new Date(s.submitted_at).toLocaleString('vi-VN')}</p>
                    {s.feedback && (
                      <div className="mt-2 p-2 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800">
                        <strong>Nhận xét:</strong> {s.feedback}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {s.score != null ? (
                      <>
                        <p className={`text-3xl font-bold ${passed ? 'text-green-600' : 'text-amber-600'}`}>{s.score}</p>
                        <p className="text-xs text-gray-400">/ 100</p>
                      </>
                    ) : (
                      <Award className="h-6 w-6 text-gray-300" />
                    )}
                  </div>
                </div>
                {s.exercise?.id && (
                  <Link
                    to={`/knowledge/exercises/${s.exercise.id}`}
                    className="block px-4 py-2 bg-gray-50 text-center text-xs text-violet-600 hover:bg-violet-50 border-t"
                  >
                    Làm lại bài tập này →
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
