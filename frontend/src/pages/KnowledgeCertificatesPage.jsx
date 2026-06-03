import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import {
  Award, ChevronLeft, Loader2, Search, Calendar, Hash,
  ShieldCheck, Sparkles, Trophy, FileBadge2, ExternalLink, Filter, ChevronDown,
} from 'lucide-react';
import { KnowledgeDeadlineBanner, KnowledgeLearningTimeline } from '../components/KnowledgeDeadline';
import { KNOWLEDGE_BACK_LINK_CLASS, knowledgeBackLinkStyle } from '../lib/knowledgeNavStyles';

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}

function CertificateCard({ cert }) {
  const isRevoked = cert.status === 'revoked';
  const cat = cert.category;
  const badgeUrl = cert.badge_image_url || cat?.badge_image_url;
  return (
    <Link
      to={`/knowledge/certificates/${cert.id}`}
      className={`group block relative overflow-hidden rounded-3xl border-2 transition-all hover:shadow-xl ${
        isRevoked
          ? 'border-gray-300 bg-gray-50 opacity-70'
          : 'border-amber-200 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 hover:border-amber-400'
      }`}
    >
      <div className="absolute -top-12 -right-12 w-40 h-40 bg-amber-200/40 rounded-full blur-3xl" />
      <div className="absolute -bottom-16 -left-12 w-48 h-48 bg-orange-200/30 rounded-full blur-3xl" />

      <div className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          {badgeUrl ? (
            <img
              src={badgeUrl}
              alt="Huy chương"
              className={`w-16 h-16 object-contain drop-shadow-lg ${isRevoked ? 'grayscale opacity-60' : 'group-hover:scale-110 transition-transform'}`}
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shadow-lg">
              <Award className="h-7 w-7" />
            </div>
          )}
          {isRevoked ? (
            <span className="px-2.5 py-1 rounded-full bg-gray-200 text-gray-600 text-[11px] font-semibold uppercase">Đã thu hồi</span>
          ) : (
            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-semibold uppercase flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" /> Có hiệu lực
            </span>
          )}
        </div>

        <p className="mt-4 text-xs font-bold text-amber-700 uppercase tracking-wider">Chứng nhận hoàn thành</p>
        <h3 className="text-lg font-bold text-gray-900 mt-1 line-clamp-2">
          {!badgeUrl && cat?.icon} {cat?.name || 'Khoá học'}
        </h3>

        <dl className="grid grid-cols-2 gap-3 mt-4 text-xs">
          <div>
            <dt className="text-gray-400 flex items-center gap-1"><Hash className="h-3 w-3" /> Số CN</dt>
            <dd className="font-mono font-semibold text-gray-700">{cert.certificate_number}</dd>
          </div>
          <div>
            <dt className="text-gray-400 flex items-center gap-1"><Calendar className="h-3 w-3" /> Ngày cấp</dt>
            <dd className="font-semibold text-gray-700">{formatDate(cert.issued_at)}</dd>
          </div>
          <div>
            <dt className="text-gray-400">Bài đã học</dt>
            <dd className="font-semibold text-gray-700">{cert.completed_lessons}/{cert.total_lessons}</dd>
          </div>
          {cert.avg_exercise_score != null && (
            <div>
              <dt className="text-gray-400">Điểm TB bài tập</dt>
              <dd className="font-semibold text-emerald-700">{cert.avg_exercise_score}</dd>
            </div>
          )}
        </dl>

        <div className="mt-4 pt-3 border-t border-amber-200/60 flex items-center justify-between text-xs">
          <span className="text-gray-400 font-mono">Verify: {cert.verify_code}</span>
          <span className="text-amber-700 font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
            Xem & in <ExternalLink className="h-3 w-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function ProgressTowardsCertificate({ progress, onIssue, issuing, timelineCategoryId, onToggleTimeline }) {
  if (!progress.length) return null;
  return (
    <section className="mb-8">
      <h2 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-violet-600" /> Khoá đang học
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {progress.map((p) => {
          const pct = p.completion_rate || 0;
          const canIssue = p.eligible === true && !p.certificate;
          const exDone = p.exercises?.total ? p.exercises.passed === p.exercises.total : true;
          const lessonsDone = p.total_lessons ? p.completed_lessons === p.total_lessons : false;
          const requireExs = p.require_all_exercises_passed !== false;
          return (
            <div
              key={p.category_id}
              className={`relative rounded-2xl border-2 p-4 transition-all ${
                canIssue
                  ? 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-300 shadow-lg'
                  : p.certificate
                    ? 'bg-emerald-50/30 border-emerald-200'
                    : 'bg-white border-gray-200 hover:border-violet-300'
              }`}
            >
              {canIssue && (
                <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold uppercase rounded-full shadow-md animate-pulse">
                  🎉 Đủ điều kiện!
                </div>
              )}
              <div className="flex items-start gap-3">
                {p.badge_image_url ? (
                  <img
                    src={p.badge_image_url}
                    alt="Huy chương"
                    className={`w-14 h-14 object-contain shrink-0 ${canIssue ? '' : 'opacity-50 grayscale'} transition-all`}
                  />
                ) : (
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0 ${
                    canIssue
                      ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white'
                      : 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white'
                  }`}>
                    {p.icon || '🏅'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold line-clamp-1" style={{ color: '#000000' }}>{p.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className={lessonsDone ? 'text-emerald-600 font-medium' : ''}>
                      {lessonsDone ? '✓' : '•'} {p.completed_lessons}/{p.total_lessons} bài học
                    </span>
                    {p.exercises?.total > 0 && (
                      <span className={exDone ? 'text-emerald-600 font-medium' : (requireExs ? 'text-amber-600 font-medium' : '')}>
                        {exDone ? '✓' : '•'} {p.exercises.passed}/{p.exercises.total} bài tập đạt
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-500">Tổng tiến độ</span>
                  <span className={`font-semibold ${pct >= 100 ? 'text-emerald-600' : 'text-violet-600'}`}>{pct}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${pct >= 100 ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-violet-500 to-fuchsia-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {p.deadline?.supported && p.deadline.mode !== 'none' && (
                <div className="mt-3">
                  <KnowledgeDeadlineBanner deadline={p.deadline} compact />
                </div>
              )}

              <button
                type="button"
                onClick={() => onToggleTimeline(timelineCategoryId === p.category_id ? null : p.category_id)}
                className="mt-3 w-full px-3 py-2 text-xs font-medium text-violet-700 bg-violet-50 rounded-lg hover:bg-violet-100 flex items-center justify-center gap-1"
              >
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${timelineCategoryId === p.category_id ? 'rotate-180' : ''}`} />
                {timelineCategoryId === p.category_id ? 'Ẩn lịch học' : 'Xem lịch học & bài tập'}
              </button>

              {canIssue && (
                <button
                  type="button"
                  onClick={() => onIssue(p.category_id)}
                  disabled={issuing === p.category_id}
                  className="mt-3 w-full px-3 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg text-sm font-bold hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
                >
                  {issuing === p.category_id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Trophy className="h-4 w-4" />}
                  Nhận chứng nhận ngay
                </button>
              )}
              {p.certificate && (
                <Link
                  to={`/knowledge/certificates/${p.certificate.id}`}
                  className="mt-3 block w-full px-3 py-2 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-semibold text-center hover:bg-emerald-200 flex items-center justify-center gap-1.5"
                >
                  <ShieldCheck className="h-4 w-4" /> Đã có chứng nhận → Xem
                </Link>
              )}
              {!canIssue && !p.certificate && (
                <div className="mt-3 px-3 py-2 bg-gray-50 rounded-lg text-xs text-gray-600 text-center">
                  {p.reason || 'Tiếp tục hoàn thành bài học và bài tập để nhận chứng nhận'}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {timelineCategoryId && (
        <div className="mt-4">
          <KnowledgeLearningTimeline
            categoryId={timelineCategoryId}
            title={`Lịch học — ${progress.find((x) => x.category_id === timelineCategoryId)?.name || ''}`}
          />
        </div>
      )}
    </section>
  );
}

export default function KnowledgeCertificatesPage() {
  const [certificates, setCertificates] = useState([]);
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | issued | revoked
  const [issuing, setIssuing] = useState(null);
  const [timelineCategoryId, setTimelineCategoryId] = useState(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [cRes, catsRes] = await Promise.all([
        api.get('/knowledge/certificates'),
        api.get('/knowledge/categories'),
      ]);
      setCertificates(cRes.data.certificates || []);

      const flatCats = (catsRes.data.flat || []).filter((c) => !c.parent_id);
      const progResults = await Promise.all(
        flatCats.map((c) =>
          api.get(`/knowledge/categories/${c.id}/progress`)
            .then((r) => ({
              category_id: c.id,
              name: c.name,
              icon: c.icon,
              badge_image_url: c.badge_image_url || null,
              ...r.data,
            }))
            .catch(() => null),
        ),
      );
      const validProg = progResults.filter((p) => p && p.total_lessons > 0);
      setProgress(validProg);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleIssue = async (categoryId) => {
    setIssuing(categoryId);
    try {
      const { data } = await api.post(`/knowledge/categories/${categoryId}/issue-certificate`);
      if (data.certificate) {
        await loadAll();
        if (!data.already_issued) {
          alert(`🎉 Chúc mừng! Chứng nhận ${data.certificate.certificate_number} đã được cấp.`);
        }
      }
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cấp chứng nhận');
    }
    setIssuing(null);
  };

  const filtered = useMemo(() => {
    let list = certificates;
    if (filter !== 'all') list = list.filter((c) => c.status === filter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((c) =>
        c.category?.name?.toLowerCase().includes(s)
        || c.certificate_number?.toLowerCase().includes(s)
        || c.verify_code?.toLowerCase().includes(s),
      );
    }
    return list;
  }, [certificates, filter, search]);

  const stats = useMemo(() => ({
    total: certificates.length,
    issued: certificates.filter((c) => c.status === 'issued').length,
    revoked: certificates.filter((c) => c.status === 'revoked').length,
    inProgress: progress.filter((p) => p.completion_rate > 0 && p.completion_rate < 100).length,
  }), [certificates, progress]);

  return (
    <div className="max-w-7xl mx-auto pb-12">
      <Link to="/knowledge" className={`${KNOWLEDGE_BACK_LINK_CLASS} mb-4`} style={knowledgeBackLinkStyle}>
        <ChevronLeft className="h-4 w-4" /> Thư viện kiến thức
      </Link>

      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 text-white p-8 mb-8 shadow-xl">
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-20 w-96 h-96 bg-yellow-300/20 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="h-5 w-5" />
            <span className="text-sm font-medium opacity-90">Chứng nhận của bạn</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Bộ sưu tập chứng nhận</h1>
          <p className="text-amber-100 text-lg max-w-2xl">
            Mỗi chứng nhận xác nhận bạn đã hoàn thành trọn vẹn một khoá học (danh mục) — có thể in, chia sẻ và xác minh.
          </p>

          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 ring-1 ring-white/20">
              <div className="flex items-center gap-2 text-amber-100 text-xs uppercase tracking-wide mb-1">
                <FileBadge2 className="h-4 w-4" /> Tổng cộng
              </div>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 ring-1 ring-white/20">
              <div className="flex items-center gap-2 text-amber-100 text-xs uppercase tracking-wide mb-1">
                <ShieldCheck className="h-4 w-4" /> Có hiệu lực
              </div>
              <p className="text-2xl font-bold">{stats.issued}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 ring-1 ring-white/20">
              <div className="flex items-center gap-2 text-amber-100 text-xs uppercase tracking-wide mb-1">
                <Sparkles className="h-4 w-4" /> Đang học
              </div>
              <p className="text-2xl font-bold">{stats.inProgress}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 ring-1 ring-white/20">
              <div className="flex items-center gap-2 text-amber-100 text-xs uppercase tracking-wide mb-1">
                <Award className="h-4 w-4" /> Đã thu hồi
              </div>
              <p className="text-2xl font-bold">{stats.revoked}</p>
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
        </div>
      ) : (
        <>
          <ProgressTowardsCertificate
            progress={progress}
            onIssue={handleIssue}
            issuing={issuing}
            timelineCategoryId={timelineCategoryId}
            onToggleTimeline={setTimelineCategoryId}
          />

          <section>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Award className="h-5 w-5 text-amber-600" />
                Chứng nhận đã cấp
                <span className="text-sm text-gray-400 font-normal">({filtered.length})</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'all', label: 'Tất cả' },
                  { id: 'issued', label: 'Có hiệu lực' },
                  { id: 'revoked', label: 'Đã thu hồi' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-1 ${
                      filter === f.id ? 'bg-amber-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-amber-300'
                    }`}
                  >
                    <Filter className="h-3 w-3" /> {f.label}
                  </button>
                ))}
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="search"
                    placeholder="Tìm số CN, khoá học..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-1.5 bg-white border border-gray-200 rounded-full text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-gray-300 py-16 text-center">
                <div className="w-16 h-16 mx-auto rounded-full bg-amber-50 flex items-center justify-center mb-3">
                  <Award className="h-8 w-8 text-amber-400" />
                </div>
                <p className="text-gray-600 font-medium">Bạn chưa có chứng nhận nào.</p>
                <p className="text-sm text-gray-400 mt-1">Hoàn thành tất cả bài học trong một danh mục để được cấp chứng nhận.</p>
                <Link
                  to="/knowledge"
                  className="inline-flex items-center gap-1 text-amber-600 text-sm mt-3 hover:underline"
                >
                  <Sparkles className="h-4 w-4" /> Đi học ngay
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((c) => <CertificateCard key={c.id} cert={c} />)}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
