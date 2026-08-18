const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { isAdminLike, isSystemAdmin } = require('../helpers/adminRole');
const { gradeSimulation } = require('../helpers/knowledgeSimulationGrading');

const r = Router();
r.use(auth);

const LESSON_SELECT = `*, category:knowledge_categories(id, name, slug, icon, company_id),
  creator:users!knowledge_lessons_created_by_fkey(id, full_name)`;

function canManage(req) {
  return isAdminLike(req.user);
}

function userRole(req) {
  return String(req.user?.role ?? '').trim().toLowerCase();
}

/** Bỏ qua lỗi khi migration 221 chưa chạy (bảng bookmark/rating chưa tồn tại). */
function isMissingTableError(err) {
  if (!err) return false;
  const msg = String(err.message || err.details || '');
  return err.code === 'PGRST205'
    || err.code === '42P01'
    || msg.includes('schema cache')
    || /relation .* does not exist/i.test(msg);
}

async function safeTableSelect(queryPromise) {
  const { data, error } = await queryPromise;
  if (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
  return data || [];
}

function lessonVisibleToUser(lesson, req) {
  if (!lesson.is_published && !canManage(req)) return false;
  const roles = lesson.target_roles;
  if (!roles || !Array.isArray(roles) || roles.length === 0) return true;
  return roles.map((x) => String(x).toLowerCase()).includes(userRole(req));
}

function categoryVisible(cat, companyId) {
  if (!cat.is_active) return false;
  if (cat.company_id == null) return true;
  if (!companyId) return true;
  return String(cat.company_id) === String(companyId);
}

function buildCategoryTree(flat, parentId = null) {
  return flat
    .filter((c) => (c.parent_id || null) === parentId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({
      ...c,
      children: buildCategoryTree(flat, c.id),
    }));
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'danh-muc';
}

/** Thứ tự bài học ổn định khi sort_order trùng nhau. */
function compareLessonOrder(a, b) {
  const d = (a.sort_order ?? 0) - (b.sort_order ?? 0);
  if (d !== 0) return d;
  return String(a.id).localeCompare(String(b.id));
}

function sortLessonsByOrder(lessons) {
  return [...lessons].sort(compareLessonOrder);
}

function extractYoutubeId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=))([^?&]+)/);
  return m ? m[1] : null;
}

// ════════════════════════════════════════════════════════════════════════
// CERTIFICATE HELPERS
// ════════════════════════════════════════════════════════════════════════

// Lấy danh sách bài học "đủ điều kiện" của 1 danh mục cho 1 user (theo role).
async function getCategoryLessonsForUser(categoryId, userObj) {
  const { data: lessons } = await supabase
    .from('knowledge_lessons')
    .select('id, target_roles, is_published')
    .eq('category_id', categoryId)
    .eq('is_published', true);
  const role = String(userObj?.role ?? '').trim().toLowerCase();
  return (lessons || []).filter((l) => {
    const roles = l.target_roles;
    if (!roles || !Array.isArray(roles) || roles.length === 0) return true;
    return roles.map((x) => String(x).toLowerCase()).includes(role);
  });
}

// ════════════════════════════════════════════════════════════════════════
// DEADLINE — tính hạn chót của 1 khoá học cho 1 user (an toàn nếu DB chưa migrate)
// ════════════════════════════════════════════════════════════════════════
//
// Trả về:
//   {
//     mode: 'none' | 'fixed' | 'relative',
//     started_at: ISO|null,                 // user bắt đầu học từ khi nào
//     deadline_at: ISO|null,                // hạn áp dụng cho user này (đã tính theo mode)
//     duration_days: number|null,           // số ngày cho phép (chỉ với mode=relative)
//     days_remaining: number|null,          // số ngày còn lại tính từ NOW (âm = quá hạn)
//     is_overdue: boolean,
//     supported: boolean,                   // false nếu DB chưa có cột deadline_mode → bỏ qua
//   }
async function computeUserDeadline(categoryId, userId) {
  if (!categoryId) return { mode: 'none', supported: false, started_at: null, deadline_at: null, duration_days: null, days_remaining: null, is_overdue: false };

  let category;
  try {
    const { data, error } = await supabase
      .from('knowledge_categories')
      .select('id, deadline_mode, deadline_at, deadline_duration_days')
      .eq('id', categoryId)
      .maybeSingle();
    if (error && error.code === '42703') {
      return { mode: 'none', supported: false, started_at: null, deadline_at: null, duration_days: null, days_remaining: null, is_overdue: false };
    }
    category = data;
  } catch {
    return { mode: 'none', supported: false, started_at: null, deadline_at: null, duration_days: null, days_remaining: null, is_overdue: false };
  }

  const mode = category?.deadline_mode || 'none';
  const out = { mode, supported: true, started_at: null, deadline_at: null, duration_days: category?.deadline_duration_days ?? null, days_remaining: null, is_overdue: false };
  if (mode === 'none') return out;

  // Tìm thời điểm user bắt đầu khoá (lesson_progress sớm nhất)
  if (userId) {
    const { data: lessons } = await supabase
      .from('knowledge_lessons')
      .select('id')
      .eq('category_id', categoryId);
    const lessonIds = (lessons || []).map((l) => l.id);
    if (lessonIds.length) {
      const { data: firstProgress } = await supabase
        .from('knowledge_lesson_progress')
        .select('started_at')
        .eq('user_id', userId)
        .in('lesson_id', lessonIds)
        .order('started_at', { ascending: true })
        .limit(1);
      out.started_at = firstProgress?.[0]?.started_at || null;
    }
  }

  if (mode === 'fixed') {
    out.deadline_at = category.deadline_at || null;
  } else if (mode === 'relative') {
    const d = Number(category.deadline_duration_days || 0);
    if (out.started_at && d > 0) {
      const base = new Date(out.started_at);
      base.setDate(base.getDate() + d);
      out.deadline_at = base.toISOString();
    }
  }

  if (out.deadline_at) {
    const diffMs = new Date(out.deadline_at).getTime() - Date.now();
    out.days_remaining = Math.ceil(diffMs / 86400000);
    out.is_overdue = diffMs < 0;
  }
  return out;
}

// Cập nhật cờ on_time/late + snapshot deadline khi user hoàn thành bài học
// An toàn nếu DB chưa có cột (try/catch).
async function tagLessonProgressDeadline(userId, lessonId, categoryId) {
  try {
    const dl = await computeUserDeadline(categoryId, userId);
    if (!dl.supported || dl.mode === 'none' || !dl.deadline_at) return;
    const isLate = Date.now() > new Date(dl.deadline_at).getTime();
    await supabase
      .from('knowledge_lesson_progress')
      .update({ completed_late: !!isLate, deadline_snapshot: dl.deadline_at })
      .eq('user_id', userId)
      .eq('lesson_id', lessonId);
  } catch { /* ignore */ }
}

async function tagSubmissionDeadline(submissionId, userId, categoryId) {
  try {
    if (!submissionId) return;
    const dl = await computeUserDeadline(categoryId, userId);
    if (!dl.supported || dl.mode === 'none' || !dl.deadline_at) return;
    const isLate = Date.now() > new Date(dl.deadline_at).getTime();
    await supabase
      .from('knowledge_exercise_submissions')
      .update({ submitted_late: !!isLate, deadline_snapshot: dl.deadline_at })
      .eq('id', submissionId);
  } catch { /* ignore */ }
}

// Tính số bài đã hoàn thành + thống kê bài tập cho 1 user trong 1 danh mục.
async function getCategoryProgressStats(categoryId, userId, userObj) {
  const lessons = await getCategoryLessonsForUser(categoryId, userObj);
  const lessonIds = lessons.map((l) => l.id);
  if (!lessonIds.length) {
    return {
      lessons, lessonIds, completedLessons: 0, totalLessons: 0,
      exerciseStats: { total: 0, passed: 0, avgScore: null, pendingIds: [] },
    };
  }

  const { data: prog } = await supabase
    .from('knowledge_lesson_progress')
    .select('lesson_id, status')
    .eq('user_id', userId)
    .in('lesson_id', lessonIds);
  const completedSet = new Set((prog || []).filter((p) => p.status === 'completed').map((p) => p.lesson_id));

  const { data: exs } = await supabase
    .from('knowledge_exercises')
    .select('id')
    .in('lesson_id', lessonIds);
  const exIds = (exs || []).map((e) => e.id);

  let exerciseStats = { total: exIds.length, passed: 0, avgScore: null, pendingIds: [] };
  if (exIds.length) {
    const { data: subs } = await supabase
      .from('knowledge_exercise_submissions')
      .select('exercise_id, status, score, submitted_at')
      .eq('user_id', userId)
      .in('exercise_id', exIds);
    // best score per exercise
    const best = new Map();
    (subs || []).forEach((s) => {
      const prev = best.get(s.exercise_id);
      if (!prev || (s.score ?? -1) > (prev.score ?? -1)) best.set(s.exercise_id, s);
    });
    const passedSet = new Set();
    [...best.values()].forEach((s) => { if (s.status === 'passed') passedSet.add(s.exercise_id); });
    exerciseStats.passed = passedSet.size;
    exerciseStats.pendingIds = exIds.filter((id) => !passedSet.has(id));
    const withScore = [...best.values()].filter((s) => s.score != null);
    if (withScore.length) {
      exerciseStats.avgScore = Math.round((withScore.reduce((a, b) => a + Number(b.score), 0) / withScore.length) * 100) / 100;
    }
  }

  return {
    lessons,
    lessonIds,
    completedLessons: completedSet.size,
    totalLessons: lessons.length,
    exerciseStats,
  };
}

// Đánh giá khả năng cấp chứng nhận. Trả về { eligible, reason, stats, category }.
// Tách riêng để cả tryIssueCertificate và /progress dùng chung.
async function evaluateCertificateEligibility(userId, categoryId, userObj) {
  const { data: category } = await supabase
    .from('knowledge_categories')
    .select('id, name, icon, badge_image_url, require_all_exercises_passed, certificate_template, company_id')
    .eq('id', categoryId)
    .maybeSingle();
  if (!category) {
    return { eligible: false, reason: 'Khoá học không tồn tại', stats: null, category: null };
  }

  const stats = await getCategoryProgressStats(categoryId, userId, userObj);
  if (stats.totalLessons === 0) {
    return { eligible: false, reason: 'Khoá học chưa có bài học nào', stats, category };
  }
  if (stats.completedLessons < stats.totalLessons) {
    return {
      eligible: false,
      reason: `Bạn mới hoàn thành ${stats.completedLessons}/${stats.totalLessons} bài học`,
      stats, category,
    };
  }
  // Mặc định: yêu cầu đạt hết bài tập trong khoá (cờ require_all_exercises_passed)
  const requireExs = category.require_all_exercises_passed !== false;
  if (requireExs && stats.exerciseStats.total > 0 && stats.exerciseStats.passed < stats.exerciseStats.total) {
    return {
      eligible: false,
      reason: `Bạn cần đạt thêm ${stats.exerciseStats.total - stats.exerciseStats.passed}/${stats.exerciseStats.total} bài tập`,
      stats, category,
    };
  }
  return { eligible: true, reason: null, stats, category };
}

// Kiểm tra & cấp chứng nhận nếu đủ điều kiện.
// Idempotent (UNIQUE user_id, category_id). Trả về certificate vừa cấp hoặc null.
async function tryIssueCertificate(userId, categoryId, userObj) {
  if (!userId || !categoryId) return null;

  const { data: existing } = await supabase
    .from('knowledge_certificates')
    .select('id, status')
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .maybeSingle();
  if (existing) return null;

  const evalResult = await evaluateCertificateEligibility(userId, categoryId, userObj);
  if (!evalResult.eligible) return null;
  const { stats, category: cat } = evalResult;

  const { data: usr } = await supabase
    .from('users')
    .select('id, full_name, email, role, company_id, department_id')
    .eq('id', userId)
    .single();

  const { data: numRow } = await supabase.rpc('knowledge_next_certificate_number');
  const { data: codeRow } = await supabase.rpc('knowledge_random_verify_code');
  const certificate_number = numRow || `CN-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  const verify_code = codeRow || Math.random().toString(36).slice(2, 12).toUpperCase();

  const insert = {
    user_id: userId,
    category_id: categoryId,
    certificate_number,
    verify_code,
    total_lessons: stats.totalLessons,
    completed_lessons: stats.completedLessons,
    avg_exercise_score: stats.exerciseStats.avgScore,
    passed_exercises: stats.exerciseStats.passed,
    total_exercises: stats.exerciseStats.total,
    badge_image_url: cat?.badge_image_url || null,
    metadata: {
      full_name: usr?.full_name || null,
      email: usr?.email || null,
      role: usr?.role || null,
      company_id: usr?.company_id || null,
      department_id: usr?.department_id || null,
      category_name: cat?.name || null,
      category_icon: cat?.icon || null,
      badge_image_url: cat?.badge_image_url || null,
      certificate_template: cat?.certificate_template || null,
    },
  };

  const { data, error } = await supabase
    .from('knowledge_certificates')
    .insert(insert)
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') return null; // race condition — đã có rồi
    // Fallback: nếu DB chưa chạy migration 260 → bỏ cột badge_image_url và thử lại
    if (error.code === '42703' && /badge_image_url/i.test(error.message || '')) {
      const { badge_image_url: _b, ...legacy } = insert;
      const { data: retry, error: retryErr } = await supabase
        .from('knowledge_certificates')
        .insert(legacy)
        .select('*')
        .single();
      if (retryErr) {
        console.error('issue certificate (legacy) error', retryErr);
        return null;
      }
      return retry;
    }
    console.error('issue certificate error', error);
    return null;
  }
  return data;
}

// ════════════════════════════════════════════════════════════════════════
// SEQUENTIAL UNLOCK — chỉ mở bài sau khi bài TRƯỚC ĐÓ đã hoàn thành
// ════════════════════════════════════════════════════════════════════════
//
// Quy tắc khoá:
//   - Bài đầu tiên (sort_order nhỏ nhất) trong danh mục: LUÔN MỞ
//   - Các bài sau: chỉ mở khi bài LIỀN TRƯỚC nó:
//       (a) đã có progress.status = 'completed', VÀ
//       (b) nếu bài liền trước có bài tập → tất cả bài tập đã pass
//   - Admin / manager (canManage) → bỏ qua tất cả khoá để duyệt nội dung
//
// Trả về Map<lessonId, { locked: bool, reason: string|null, prev_lesson_id: string|null }>
async function computeLessonLockMap(categoryId, userId, userObj, lessonsInCategory) {
  if (!categoryId || !userId) return new Map();
  const allLessons = (lessonsInCategory && lessonsInCategory.length)
    ? lessonsInCategory
    : (await supabase
        .from('knowledge_lessons')
        .select('id, sort_order, title, is_published, target_roles, is_final_exam')
        .eq('category_id', categoryId)
        .eq('is_published', true)).data || [];

  const visible = allLessons.filter((l) => {
    const roles = l.target_roles;
    if (!roles || !Array.isArray(roles) || roles.length === 0) return true;
    const role = String(userObj?.role ?? '').trim().toLowerCase();
    return roles.map((x) => String(x).toLowerCase()).includes(role);
  });
  const visibleSorted = sortLessonsByOrder(visible);

  const ids = visibleSorted.map((l) => l.id);
  if (!ids.length) return new Map();

  // Lấy tiến độ học của user cho danh sách bài này
  const { data: progressRows } = await supabase
    .from('knowledge_lesson_progress')
    .select('lesson_id, status')
    .eq('user_id', userId)
    .in('lesson_id', ids);
  const completedSet = new Set((progressRows || []).filter((p) => p.status === 'completed').map((p) => p.lesson_id));

  // Lấy bài tập của các bài và best submission của user
  const { data: exRows } = await supabase
    .from('knowledge_exercises')
    .select('id, lesson_id')
    .in('lesson_id', ids);
  const exByLesson = new Map();
  (exRows || []).forEach((ex) => {
    if (!exByLesson.has(ex.lesson_id)) exByLesson.set(ex.lesson_id, []);
    exByLesson.get(ex.lesson_id).push(ex.id);
  });

  const allExIds = (exRows || []).map((e) => e.id);
  const passedSet = new Set();
  if (allExIds.length) {
    const { data: subs } = await supabase
      .from('knowledge_exercise_submissions')
      .select('exercise_id, status, score')
      .eq('user_id', userId)
      .in('exercise_id', allExIds);
    const best = new Map();
    (subs || []).forEach((s) => {
      const prev = best.get(s.exercise_id);
      if (!prev || (s.score ?? -1) > (prev.score ?? -1)) best.set(s.exercise_id, s);
    });
    [...best.values()].forEach((s) => { if (s.status === 'passed') passedSet.add(s.exercise_id); });
  }

  const isPrevLessonDone = (lesson) => {
    // Đã hoàn thành → coi là xong để mở bài sau (tránh kẹt khi bài tập thêm sau hoặc dữ liệu cũ)
    if (completedSet.has(lesson.id)) return true;
    const exs = exByLesson.get(lesson.id) || [];
    if (!exs.length) return false;
    return exs.every((id) => passedSet.has(id));
  };

  const map = new Map();
  let prev = null;
  for (const l of visibleSorted) {
    let lockInfo;
    if (completedSet.has(l.id)) {
      lockInfo = { locked: false, reason: null, prev_lesson_id: prev?.id ?? null };
    } else if (!prev) {
      lockInfo = { locked: false, reason: null, prev_lesson_id: null };
    } else if (isPrevLessonDone(prev)) {
      lockInfo = { locked: false, reason: null, prev_lesson_id: prev.id };
    } else {
      const exsPrev = exByLesson.get(prev.id) || [];
      const exDone = exsPrev.every((id) => passedSet.has(id));
      const lessonDone = completedSet.has(prev.id);
      let reason;
      if (!lessonDone && exsPrev.length === 0) reason = `Cần hoàn thành "${prev.title}" trước`;
      else if (!lessonDone) reason = `Cần đọc & hoàn thành "${prev.title}" trước`;
      else if (!exDone) reason = `Cần làm đạt bài tập của "${prev.title}" trước`;
      else reason = `Cần hoàn thành "${prev.title}" trước`;
      lockInfo = { locked: true, reason, prev_lesson_id: prev.id };
    }

    // Bài thi tổng kết: chỉ mở khi MỌI bài tập (ngoài bài thi) trong khoá đã đạt
    if (l.is_final_exam && !lockInfo.locked && !completedSet.has(l.id)) {
      const otherExIds = (exRows || [])
        .filter((e) => e.lesson_id !== l.id)
        .map((e) => e.id);
      const missing = otherExIds.filter((id) => !passedSet.has(id));
      if (missing.length > 0) {
        lockInfo = {
          locked: true,
          reason: `Bài thi tổng kết — cần đạt toàn bộ bài tập trong khoá trước (còn ${missing.length} bài tập chưa đạt)`,
          prev_lesson_id: prev?.id || null,
          requires_all_exercises_passed: true,
        };
      }
    }

    map.set(l.id, lockInfo);
    prev = l;
  }

  // Bài đang mở khoá hiện tại trong khoá: bài đầu tiên không bị khoá và chưa hoàn thành.
  // Dùng để khi user bấm vào bài khoá, redirect tới bài cần học.
  let currentOpenId = null;
  let currentOpenTitle = null;
  for (const l of visibleSorted) {
    const lk = map.get(l.id);
    if (!lk || lk.locked) continue;
    const exs = exByLesson.get(l.id) || [];
    const exPending = exs.length > 0 && !exs.every((id) => passedSet.has(id));
    if (!completedSet.has(l.id) || exPending) {
      currentOpenId = l.id;
      currentOpenTitle = l.title || null;
      break;
    }
  }
  if (currentOpenId) {
    for (const lk of map.values()) {
      lk.current_open_lesson_id = currentOpenId;
      lk.current_open_lesson_title = currentOpenTitle;
    }
  }

  return map;
}

/** Trạng thái nộp bài tập tốt nhất của user (passed / score). */
async function getExercisePassMapForUser(userId, exerciseIds) {
  const passedSet = new Set();
  const bestByEx = new Map();
  if (!userId || !exerciseIds?.length) return { passedSet, bestByEx };
  const { data: subs } = await supabase
    .from('knowledge_exercise_submissions')
    .select('exercise_id, status, score, attempt_number')
    .eq('user_id', userId)
    .in('exercise_id', exerciseIds);
  (subs || []).forEach((s) => {
    const prev = bestByEx.get(s.exercise_id);
    if (!prev || (s.score ?? -1) > (prev.score ?? -1)) bestByEx.set(s.exercise_id, s);
  });
  [...bestByEx.values()].forEach((s) => {
    if (s.status === 'passed') passedSet.add(s.exercise_id);
  });
  return { passedSet, bestByEx };
}

/** Tất cả bài tập của một bài học đã đạt (hoặc bài không có bài tập → true). */
async function areAllLessonExercisesPassed(lessonId, userId) {
  if (!lessonId || !userId) return true;
  const { data: exRows } = await supabase
    .from('knowledge_exercises')
    .select('id')
    .eq('lesson_id', lessonId);
  const ids = (exRows || []).map((e) => e.id);
  if (!ids.length) return true;
  const { passedSet } = await getExercisePassMapForUser(userId, ids);
  return ids.every((id) => passedSet.has(id));
}

async function markLessonCompleted(userId, lessonId) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('knowledge_lesson_progress')
    .upsert(
      {
        user_id: userId,
        lesson_id: lessonId,
        status: 'completed',
        completed_at: now,
        last_viewed_at: now,
      },
      { onConflict: 'user_id,lesson_id' },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

function attachExerciseUserProgress(exercises, bestByEx) {
  return (exercises || []).map((ex) => {
    const best = bestByEx.get(ex.id);
    return {
      ...ex,
      user_best_score: best?.score ?? null,
      user_status: best?.status ?? null,
      user_passed: best?.status === 'passed',
    };
  });
}

async function enrichNextLessonWithLock(categoryId, nextLesson, userId, userObj, lockBypass = false) {
  if (!nextLesson || !categoryId) return nextLesson;
  const lockMap = await computeLessonLockMap(categoryId, userId, userObj);
  const lk = lockMap.get(nextLesson.id) || { locked: false, reason: null };
  return {
    ...nextLesson,
    is_locked: !!lk.locked,
    unlock_reason: lk.reason || null,
    lock_bypass: lockBypass,
  };
}

// Bài học tiếp theo trong danh mục (theo sort_order + id, tránh bỏ sót khi sort_order trùng).
async function getNextLessonInCategory(currentLessonId) {
  const { data: cur } = await supabase
    .from('knowledge_lessons')
    .select('category_id')
    .eq('id', currentLessonId)
    .maybeSingle();
  if (!cur?.category_id) return null;
  const { data: all } = await supabase
    .from('knowledge_lessons')
    .select('id, title, sort_order, cover_image_url, summary')
    .eq('category_id', cur.category_id)
    .eq('is_published', true);
  const sorted = sortLessonsByOrder(all || []);
  const idx = sorted.findIndex((l) => l.id === currentLessonId);
  if (idx < 0 || idx >= sorted.length - 1) return null;
  return sorted[idx + 1];
}

// Wrapper an toàn — không bao giờ ném lỗi, dùng trong các route bất kỳ.
async function maybeIssueCertificateForLesson(req, lessonId) {
  try {
    const { data: lesson } = await supabase
      .from('knowledge_lessons')
      .select('category_id')
      .eq('id', lessonId)
      .maybeSingle();
    if (!lesson?.category_id) return null;
    return await tryIssueCertificate(req.user.userId, lesson.category_id, req.user);
  } catch (e) {
    console.error('maybeIssueCertificateForLesson failed', e);
    return null;
  }
}

async function isLessonViewedByUser(userId, lessonId) {
  if (!userId || !lessonId) return false;
  const { data } = await supabase
    .from('knowledge_lesson_progress')
    .select('status')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .maybeSingle();
  if (!data) return false;
  return data.status === 'in_progress' || data.status === 'completed';
}

/** Ghi nhận user đã mở bài học (khi vào bài tập từ bài không bị khoá). */
async function ensureLessonViewedByUser(userId, lessonId, existingProg) {
  if (!userId || !lessonId) return;
  const now = new Date().toISOString();
  const status = existingProg?.status === 'completed' ? 'completed' : 'in_progress';
  await supabase.from('knowledge_lesson_progress').upsert(
    {
      user_id: userId,
      lesson_id: lessonId,
      status,
      started_at: existingProg?.started_at || now,
      last_viewed_at: now,
    },
    { onConflict: 'user_id,lesson_id' },
  );
}

function gradeQuiz(questions, answers) {
  const items = questions?.items || [];
  if (!items.length) return { score: 100, passed: true, details: [] };

  let correct = 0;
  const details = items.map((q) => {
    const userAns = answers?.[q.id];
    const correctAns = q.correct || [];
    let ok = false;
    if (q.type === 'single') {
      ok = userAns === correctAns[0] || userAns === String(correctAns[0]);
    } else if (q.type === 'multiple') {
      const ua = Array.isArray(userAns) ? userAns.map(Number).sort() : [];
      const ca = [...correctAns].map(Number).sort();
      ok = JSON.stringify(ua) === JSON.stringify(ca);
    } else if (q.type === 'checklist') {
      ok = !!userAns;
    }
    if (ok) correct += 1;
    return { id: q.id, correct: ok };
  });

  const score = Math.round((correct / items.length) * 100);
  return { score, passed: score >= 70, details };
}

// GET /knowledge/categories
r.get('/categories', async (req, res) => {
  try {
    const { all } = req.query;
    const companyId = req.user.company_id || null;
    let q = supabase.from('knowledge_categories').select('*').order('sort_order');
    if (!all || !canManage(req)) {
      q = q.eq('is_active', true);
    }
    const { data, error } = await q;
    if (error) throw error;
    const filtered = (data || []).filter((c) => categoryVisible(c, companyId) || (all && canManage(req)));
    res.json({ categories: buildCategoryTree(filtered), flat: filtered });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /knowledge/categories
r.post('/categories', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const {
      name, slug, description, icon, parent_id, sort_order, company_id, is_active,
      badge_image_url, require_all_exercises_passed, certificate_template,
      deadline_mode, deadline_at, deadline_duration_days, deadline_note,
    } = req.body;
    if (!name) return res.status(400).json({ error: 'Tên danh mục là bắt buộc' });
    const insert = {
      name,
      slug: slug || slugify(name),
      description: description || null,
      icon: icon || '📚',
      parent_id: parent_id || null,
      sort_order: sort_order ?? 0,
      company_id: company_id ?? req.user.company_id ?? null,
      is_active: is_active !== false,
      created_by: req.user.userId,
    };
    if (badge_image_url !== undefined) insert.badge_image_url = badge_image_url || null;
    if (require_all_exercises_passed !== undefined) insert.require_all_exercises_passed = !!require_all_exercises_passed;
    if (certificate_template !== undefined) insert.certificate_template = certificate_template || {};
    if (deadline_mode !== undefined) insert.deadline_mode = deadline_mode || 'none';
    if (deadline_at !== undefined) insert.deadline_at = deadline_at || null;
    if (deadline_duration_days !== undefined) insert.deadline_duration_days = deadline_duration_days ? Number(deadline_duration_days) : null;
    if (deadline_note !== undefined) insert.deadline_note = deadline_note || null;
    let { data, error } = await supabase.from('knowledge_categories').insert(insert).select().single();
    if (error && error.code === '42703') {
      ['badge_image_url','require_all_exercises_passed','certificate_template','deadline_mode','deadline_at','deadline_duration_days','deadline_note']
        .forEach((k) => delete insert[k]);
      ({ data, error } = await supabase.from('knowledge_categories').insert(insert).select().single());
    }
    if (error) throw error;

    // Log lịch sử deadline khi tạo mới
    if (data && (insert.deadline_mode && insert.deadline_mode !== 'none')) {
      await supabase.from('knowledge_category_deadline_history').insert({
        category_id: data.id,
        changed_by: req.user.userId,
        prev_mode: 'none',
        new_mode: insert.deadline_mode,
        new_deadline_at: insert.deadline_at || null,
        new_duration_days: insert.deadline_duration_days || null,
        note: deadline_note || 'Tạo khoá học mới với deadline',
      }).then(() => {}, () => {});
    }

    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /knowledge/categories/:id
r.patch('/categories/:id', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const update = { updated_at: new Date().toISOString() };
    [
      'name', 'slug', 'description', 'icon', 'parent_id', 'sort_order', 'company_id', 'is_active',
      'badge_image_url', 'require_all_exercises_passed', 'certificate_template',
      'deadline_mode', 'deadline_at', 'deadline_duration_days', 'deadline_note',
    ].forEach((f) => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    if (update.deadline_duration_days !== undefined && update.deadline_duration_days !== null) {
      update.deadline_duration_days = Number(update.deadline_duration_days) || null;
    }

    // Lấy snapshot trước để log lịch sử nếu deadline thay đổi
    const wantsDeadlineChange = ['deadline_mode','deadline_at','deadline_duration_days'].some((k) => update[k] !== undefined);
    let prev = null;
    if (wantsDeadlineChange) {
      const r2 = await supabase
        .from('knowledge_categories')
        .select('deadline_mode, deadline_at, deadline_duration_days')
        .eq('id', req.params.id)
        .maybeSingle();
      prev = r2.data || null;
    }

    let { data, error } = await supabase.from('knowledge_categories').update(update).eq('id', req.params.id).select().single();
    if (error && error.code === '42703') {
      ['badge_image_url','require_all_exercises_passed','certificate_template','deadline_mode','deadline_at','deadline_duration_days','deadline_note']
        .forEach((k) => delete update[k]);
      ({ data, error } = await supabase.from('knowledge_categories').update(update).eq('id', req.params.id).select().single());
    }
    if (error) throw error;

    if (wantsDeadlineChange && data) {
      const newMode = update.deadline_mode ?? prev?.deadline_mode ?? 'none';
      const newAt = update.deadline_at ?? prev?.deadline_at ?? null;
      const newDays = update.deadline_duration_days ?? prev?.deadline_duration_days ?? null;
      const changed = (
        (prev?.deadline_mode || 'none') !== newMode ||
        (prev?.deadline_at || null) !== (newAt || null) ||
        (prev?.deadline_duration_days || null) !== (newDays || null)
      );
      if (changed) {
        await supabase.from('knowledge_category_deadline_history').insert({
          category_id: req.params.id,
          changed_by: req.user.userId,
          prev_mode: prev?.deadline_mode || 'none',
          prev_deadline_at: prev?.deadline_at || null,
          prev_duration_days: prev?.deadline_duration_days || null,
          new_mode: newMode,
          new_deadline_at: newAt,
          new_duration_days: newDays,
          note: req.body.deadline_note || null,
        }).then(() => {}, () => {});
      }
    }

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /knowledge/categories/:id
r.delete('/categories/:id', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const { error } = await supabase.from('knowledge_categories').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /knowledge/lessons
r.get('/lessons', async (req, res) => {
  try {
    const { category_id, all, q: search, tag, bookmarked, required } = req.query;
    let query = supabase.from('knowledge_lessons').select(LESSON_SELECT, { count: 'exact' });
    if (category_id) query = query.eq('category_id', category_id);
    if (!all || !canManage(req)) query = query.eq('is_published', true);
    if (tag) query = query.contains('tags', [tag]);
    if (required === '1' || required === 'true') query = query.eq('is_required', true);
    query = query.order('sort_order');
    const { data, error, count } = await query;
    if (error) throw error;

    let lessons = (data || []).filter((l) => lessonVisibleToUser(l, req));
    if (search) {
      const s = String(search).toLowerCase();
      lessons = lessons.filter(
        (l) => l.title?.toLowerCase().includes(s) || l.summary?.toLowerCase().includes(s) || (l.tags || []).some((t) => t.toLowerCase().includes(s)),
      );
    }

    const lessonIds = lessons.map((l) => l.id);
    let progressMap = {};
    let bookmarkSet = new Set();
    let ratingMap = {};
    if (lessonIds.length) {
      const { data: prog } = await supabase
        .from('knowledge_lesson_progress')
        .select('lesson_id, status')
        .eq('user_id', req.user.userId)
        .in('lesson_id', lessonIds);
      progressMap = Object.fromEntries((prog || []).map((p) => [p.lesson_id, p.status]));

      const bms = await safeTableSelect(
        supabase
          .from('knowledge_lesson_bookmarks')
          .select('lesson_id')
          .eq('user_id', req.user.userId)
          .in('lesson_id', lessonIds),
      );
      bookmarkSet = new Set(bms.map((b) => b.lesson_id));

      const ratings = await safeTableSelect(
        supabase
          .from('knowledge_lesson_ratings')
          .select('lesson_id, rating')
          .in('lesson_id', lessonIds),
      );
      ratings.forEach((r2) => {
        if (!ratingMap[r2.lesson_id]) ratingMap[r2.lesson_id] = { sum: 0, count: 0 };
        ratingMap[r2.lesson_id].sum += r2.rating;
        ratingMap[r2.lesson_id].count += 1;
      });
    }

    // Trạng thái khoá tuần tự — luôn tính để hiển thị UI (admin vẫn mở được qua lock_bypass)
    const lockMap = new Map();
    const bypassLock = canManage(req);
    if (lessons.length) {
      const catIds = [...new Set(lessons.map((l) => l.category_id).filter(Boolean))];
      for (const catId of catIds) {
        const m = await computeLessonLockMap(catId, req.user.userId, req.user);
        m.forEach((v, k) => lockMap.set(k, v));
      }
    }

    let enriched = lessons.map((l) => {
      const rm = ratingMap[l.id];
      const lock = lockMap.get(l.id) || { locked: false, reason: null, prev_lesson_id: null };
      return {
        ...l,
        progress_status: progressMap[l.id] || 'not_started',
        is_bookmarked: bookmarkSet.has(l.id),
        rating_avg: rm ? Math.round((rm.sum / rm.count) * 10) / 10 : null,
        rating_count: rm ? rm.count : 0,
        is_locked: lock.locked,
        unlock_reason: lock.reason,
        prev_lesson_id: lock.prev_lesson_id,
        current_open_lesson_id: lock.current_open_lesson_id || null,
        current_open_lesson_title: lock.current_open_lesson_title || null,
        lock_bypass: bypassLock,
      };
    });

    if (bookmarked === '1' || bookmarked === 'true') {
      enriched = enriched.filter((l) => l.is_bookmarked);
    }

    res.json({ lessons: enriched, total: count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /knowledge/lessons/:id
r.get('/lessons/:id', async (req, res) => {
  try {
    const { data: lesson, error } = await supabase
      .from('knowledge_lessons')
      .select(LESSON_SELECT)
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!lessonVisibleToUser(lesson, req)) return res.status(404).json({ error: 'Không tìm thấy bài học' });

    // Kiểm tra khoá tuần tự (admin/manager bỏ qua)
    let lockInfo = { locked: false, reason: null, prev_lesson_id: null };
    if (!canManage(req) && lesson.category_id) {
      const lockMap = await computeLessonLockMap(lesson.category_id, req.user.userId, req.user);
      lockInfo = lockMap.get(req.params.id) || lockInfo;
      if (lockInfo.locked) {
        return res.status(423).json({
          error: lockInfo.reason || 'Bài học đang khoá, cần hoàn thành bài học trước đó',
          locked: true,
          prev_lesson_id: lockInfo.prev_lesson_id,
          current_open_lesson_id: lockInfo.current_open_lesson_id || null,
          current_open_lesson_title: lockInfo.current_open_lesson_title || null,
        });
      }
    }

    const { data: exercises } = await supabase
      .from('knowledge_exercises')
      .select('id, title, instructions, type, passing_score, max_attempts, time_limit_minutes, image_url, video_url, video_type, attachments, sort_order')
      .eq('lesson_id', req.params.id)
      .order('sort_order');

    const { data: progress } = await supabase
      .from('knowledge_lesson_progress')
      .select('*')
      .eq('user_id', req.user.userId)
      .eq('lesson_id', req.params.id)
      .maybeSingle();

    await supabase.from('knowledge_lesson_progress').upsert(
      {
        user_id: req.user.userId,
        lesson_id: req.params.id,
        status: progress?.status === 'completed' ? 'completed' : 'in_progress',
        started_at: progress?.started_at || new Date().toISOString(),
        last_viewed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,lesson_id' },
    );

    const deadlineInfo = lesson.category_id
      ? await computeUserDeadline(lesson.category_id, req.user.userId)
      : null;

    const exercisePassMap = await getExercisePassMapForUser(
      req.user.userId,
      (exercises || []).map((e) => e.id),
    );

    const safeExercises = canManage(req)
      ? exercises
      : attachExerciseUserProgress(
          (exercises || []).map(({ id, title, instructions, type, passing_score, max_attempts, time_limit_minutes, image_url, video_url, video_type, attachments, sort_order }) => ({
            id,
            title,
            instructions,
            type,
            passing_score,
            max_attempts,
            time_limit_minutes,
            image_url,
            video_url,
            video_type,
            attachments,
            sort_order,
          })),
          exercisePassMap.bestByEx,
        );

    const allExercisesPassed = canManage(req)
      || await areAllLessonExercisesPassed(req.params.id, req.user.userId);

    let nextLesson = await getNextLessonInCategory(req.params.id);
    if (nextLesson && lesson.category_id) {
      nextLesson = await enrichNextLessonWithLock(
        lesson.category_id,
        nextLesson,
        req.user.userId,
        req.user,
        canManage(req),
      );
    }

    const bookmark = await safeTableSelect(
      supabase
        .from('knowledge_lesson_bookmarks')
        .select('id')
        .eq('user_id', req.user.userId)
        .eq('lesson_id', req.params.id),
    ).then((rows) => rows[0] || null);

    const myRating = await safeTableSelect(
      supabase
        .from('knowledge_lesson_ratings')
        .select('*')
        .eq('user_id', req.user.userId)
        .eq('lesson_id', req.params.id),
    ).then((rows) => rows[0] || null);

    const ratings = await safeTableSelect(
      supabase
        .from('knowledge_lesson_ratings')
        .select('rating, comment, created_at, user:users(id, full_name, avatar)')
        .eq('lesson_id', req.params.id)
        .order('created_at', { ascending: false }),
    );

    const ratingCount = (ratings || []).length;
    const ratingAvg = ratingCount ? Math.round(((ratings.reduce((a, b) => a + b.rating, 0)) / ratingCount) * 10) / 10 : null;

    res.json({
      ...lesson,
      video_embed_id: lesson.video_type === 'youtube' ? extractYoutubeId(lesson.video_url) : null,
      exercises: safeExercises || [],
      progress: progress || { status: 'in_progress' },
      is_bookmarked: !!bookmark,
      my_rating: myRating || null,
      ratings: ratings || [],
      rating_avg: ratingAvg,
      rating_count: ratingCount,
      next_lesson: nextLesson || null,
      all_exercises_passed: allExercisesPassed,
      deadline: deadlineInfo || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /knowledge/lessons
r.post('/lessons', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const b = req.body;
    if (!b.title || !b.category_id) return res.status(400).json({ error: 'Tiêu đề và danh mục là bắt buộc' });
    const insert = {
      category_id: b.category_id,
      title: b.title,
      summary: b.summary || null,
      content_md: b.content_md || null,
      cover_image_url: b.cover_image_url || null,
      video_url: b.video_url || null,
      video_type: b.video_type || null,
      duration_minutes: b.duration_minutes || null,
      attachments: Array.isArray(b.attachments) ? b.attachments : [],
      tags: Array.isArray(b.tags) ? b.tags : [],
      is_required: !!b.is_required,
      sort_order: b.sort_order ?? 0,
      is_published: !!b.is_published,
      target_roles: b.target_roles || [],
      created_by: req.user.userId,
    };
    if (insert.is_published) insert.published_at = new Date().toISOString();
    const { data, error } = await supabase.from('knowledge_lessons').insert(insert).select(LESSON_SELECT).single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /knowledge/lessons/:id
r.patch('/lessons/:id', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const b = req.body;
    const update = { updated_at: new Date().toISOString() };
    [
      'title',
      'summary',
      'content_md',
      'cover_image_url',
      'video_url',
      'video_type',
      'duration_minutes',
      'attachments',
      'tags',
      'is_required',
      'sort_order',
      'is_published',
      'target_roles',
      'category_id',
    ].forEach((f) => {
      if (b[f] !== undefined) update[f] = b[f];
    });
    if (b.is_published === true) {
      const { data: existing } = await supabase
        .from('knowledge_lessons')
        .select('published_at')
        .eq('id', req.params.id)
        .single();
      if (!existing?.published_at) update.published_at = new Date().toISOString();
    }
    const { data, error } = await supabase
      .from('knowledge_lessons')
      .update(update)
      .eq('id', req.params.id)
      .select(LESSON_SELECT)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /knowledge/lessons/:id
r.delete('/lessons/:id', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const { error } = await supabase.from('knowledge_lessons').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /knowledge/lessons/:id/complete
r.post('/lessons/:id/complete', async (req, res) => {
  try {
    const { data: lesson } = await supabase.from('knowledge_lessons').select('is_published, target_roles, category_id, title').eq('id', req.params.id).single();
    if (!lesson || !lessonVisibleToUser(lesson, req)) return res.status(404).json({ error: 'Không tìm thấy' });

    if (!canManage(req) && lesson.category_id) {
      const lockMap = await computeLessonLockMap(lesson.category_id, req.user.userId, req.user);
      const lk = lockMap.get(req.params.id);
      if (lk?.locked) {
        return res.status(423).json({
          error: lk.reason || 'Bài học đang khoá',
          locked: true,
          prev_lesson_id: lk.prev_lesson_id || null,
        });
      }
      const exercisesPassed = await areAllLessonExercisesPassed(req.params.id, req.user.userId);
      if (!exercisesPassed) {
        return res.status(400).json({
          error: 'Cần đạt tất cả bài tập của bài học này trước khi đánh dấu hoàn thành',
          requires_exercises: true,
        });
      }
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('knowledge_lesson_progress')
      .upsert(
        {
          user_id: req.user.userId,
          lesson_id: req.params.id,
          status: 'completed',
          completed_at: now,
          last_viewed_at: now,
        },
        { onConflict: 'user_id,lesson_id' },
      )
      .select()
      .single();
    if (error) throw error;

    if (lesson.category_id) {
      await tagLessonProgressDeadline(req.user.userId, req.params.id, lesson.category_id);
    }

    const newCert = lesson.category_id
      ? await tryIssueCertificate(req.user.userId, lesson.category_id, req.user)
      : null;

    let nextLesson = await getNextLessonInCategory(req.params.id);
    if (nextLesson && lesson.category_id) {
      nextLesson = await enrichNextLessonWithLock(
        lesson.category_id,
        nextLesson,
        req.user.userId,
        req.user,
        canManage(req),
      );
    }

    res.json({
      ...data,
      certificate_issued: newCert || null,
      next_lesson: nextLesson || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /knowledge/my-progress
r.get('/my-progress', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('knowledge_lesson_progress')
      .select('*, lesson:knowledge_lessons(id, title, category_id)')
      .eq('user_id', req.user.userId)
      .order('last_viewed_at', { ascending: false });
    if (error) throw error;
    const completed = (data || []).filter((p) => p.status === 'completed').length;
    res.json({ progress: data || [], completed, total: (data || []).length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /knowledge/exercises/:id
r.get('/exercises/:id', async (req, res) => {
  try {
    const { data: ex, error } = await supabase
      .from('knowledge_exercises')
      .select('*, lesson:knowledge_lessons(id, category_id, is_published, target_roles)')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!lessonVisibleToUser(ex.lesson, req)) return res.status(404).json({ error: 'Không tìm thấy' });

    // Chặn truy cập bài tập của bài học đang khoá
    if (!canManage(req) && ex.lesson?.category_id) {
      const lockMap = await computeLessonLockMap(ex.lesson.category_id, req.user.userId, req.user);
      const lk = lockMap.get(ex.lesson.id);
      if (lk?.locked) {
        return res.status(423).json({
          error: lk.reason || 'Bài học chứa bài tập này đang khoá',
          locked: true,
          prev_lesson_id: lk.prev_lesson_id || null,
        });
      }

      // Bắt buộc đã mở (đọc) bài học trước khi làm bài tập
      let viewed = await isLessonViewedByUser(req.user.userId, ex.lesson.id);
      if (!viewed) {
        const { data: prog } = await supabase
          .from('knowledge_lesson_progress')
          .select('status')
          .eq('user_id', req.user.userId)
          .eq('lesson_id', ex.lesson.id)
          .maybeSingle();
        await ensureLessonViewedByUser(req.user.userId, ex.lesson.id, prog);
        viewed = true;
      }
    }

    const { count } = await supabase
      .from('knowledge_exercise_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('exercise_id', req.params.id)
      .eq('user_id', req.user.userId);

    const payload = { ...ex };
    if (!canManage(req) && ex.type === 'quiz') {
      const items = (ex.questions?.items || []).map(({ id, question, type, options, image_url }) => ({
        id,
        question,
        type,
        options,
        ...(image_url ? { image_url } : {}),
      }));
      payload.questions = { items };
    }
    if (!canManage(req) && ex.type === 'simulation') {
      payload.questions = {
        ...(ex.questions || {}),
        steps: (ex.questions?.steps || []).map(({ id, label, points, hint, required }) => ({
          id, label, points, hint, required: !!required,
        })),
      };
    }
    const ytId = extractYoutubeId(ex.video_url);
    if (ytId) {
      payload.video_embed_id = ytId;
      if (!payload.video_type) payload.video_type = 'youtube';
    }
    payload.attempt_count = count || 0;
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /knowledge/exercises
r.post('/exercises', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const b = req.body;
    if (!b.lesson_id || !b.title) return res.status(400).json({ error: 'lesson_id và title là bắt buộc' });
    const { data, error } = await supabase
      .from('knowledge_exercises')
      .insert({
        lesson_id: b.lesson_id,
        title: b.title,
        instructions: b.instructions || null,
        type: b.type || 'quiz',
        questions: b.questions || { items: [] },
        passing_score: b.passing_score ?? 70,
        max_attempts: b.max_attempts ?? null,
        time_limit_minutes: b.time_limit_minutes ?? null,
        image_url: b.image_url || null,
        video_url: b.video_url || null,
        video_type: b.video_type || null,
        attachments: Array.isArray(b.attachments) ? b.attachments : [],
        sort_order: b.sort_order ?? 0,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /knowledge/exercises/:id
r.patch('/exercises/:id', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const update = { updated_at: new Date().toISOString() };
    ['title', 'instructions', 'type', 'questions', 'passing_score', 'max_attempts', 'time_limit_minutes', 'image_url', 'video_url', 'video_type', 'attachments', 'sort_order'].forEach((f) => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    const { data, error } = await supabase
      .from('knowledge_exercises')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /knowledge/exercises/:id
r.delete('/exercises/:id', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const { error } = await supabase.from('knowledge_exercises').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /knowledge/exercises/:id/submit
r.post('/exercises/:id/submit', async (req, res) => {
  try {
    const { answers } = req.body;
    const { data: ex, error } = await supabase
      .from('knowledge_exercises')
      .select('*, lesson:knowledge_lessons(id, category_id, is_published, target_roles)')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!lessonVisibleToUser(ex.lesson, req)) return res.status(404).json({ error: 'Không tìm thấy' });

    if (!canManage(req) && ex.lesson?.category_id) {
      const lockMap = await computeLessonLockMap(ex.lesson.category_id, req.user.userId, req.user);
      const lk = lockMap.get(ex.lesson.id);
      if (lk?.locked) {
        return res.status(423).json({ error: lk.reason || 'Bài học đang khoá', locked: true });
      }
      let viewed = await isLessonViewedByUser(req.user.userId, ex.lesson.id);
      if (!viewed) {
        const { data: prog } = await supabase
          .from('knowledge_lesson_progress')
          .select('status')
          .eq('user_id', req.user.userId)
          .eq('lesson_id', ex.lesson.id)
          .maybeSingle();
        await ensureLessonViewedByUser(req.user.userId, ex.lesson.id, prog);
        viewed = true;
      }
    }

    const { count } = await supabase
      .from('knowledge_exercise_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('exercise_id', req.params.id)
      .eq('user_id', req.user.userId);
    const attempt = (count || 0) + 1;
    if (ex.max_attempts && attempt > ex.max_attempts) {
      return res.status(400).json({ error: `Đã hết lượt làm bài (tối đa ${ex.max_attempts})` });
    }

    let score = null;
    let status = 'submitted';
    let quizDetails = null;
    let simRequiredFailed = false;
    if (ex.type === 'quiz') {
      const graded = gradeQuiz(ex.questions, answers);
      score = graded.score;
      quizDetails = graded.details;
      const pass = score >= (ex.passing_score ?? 70);
      status = pass ? 'passed' : 'failed';
    } else if (ex.type === 'simulation') {
      const graded = gradeSimulation(ex.questions, answers);
      score = graded.score;
      quizDetails = graded.details;
      simRequiredFailed = graded.requiredFailed;
      status = score >= (ex.passing_score ?? 70) && !graded.requiredFailed ? 'passed' : 'failed';
    } else if (ex.type === 'checklist') {
      const items = ex.questions?.items || [];
      const done = items.filter((it) => answers?.[it.id]).length;
      score = items.length ? Math.round((done / items.length) * 100) : 100;
      status = score >= (ex.passing_score ?? 70) ? 'passed' : 'failed';
    }

    const { data, error: insErr } = await supabase
      .from('knowledge_exercise_submissions')
      .insert({
        exercise_id: req.params.id,
        user_id: req.user.userId,
        answers: answers || {},
        score,
        status,
        attempt_number: attempt,
      })
      .select()
      .single();
    if (insErr) throw insErr;

    let submissionRow = data;
    if (ex.lesson?.category_id) {
      await tagSubmissionDeadline(data.id, req.user.userId, ex.lesson.category_id);
      const { data: refreshed } = await supabase
        .from('knowledge_exercise_submissions')
        .select('submitted_late, deadline_snapshot')
        .eq('id', data.id)
        .maybeSingle();
      if (refreshed) submissionRow = { ...data, ...refreshed };
    }

    let newCert = null;
    if (status === 'passed' && ex.lesson?.id) {
      const allPassed = await areAllLessonExercisesPassed(ex.lesson.id, req.user.userId);
      if (allPassed) {
        try {
          await markLessonCompleted(req.user.userId, ex.lesson.id);
        } catch (e) {
          console.error('auto-complete lesson after exercises', e);
        }
      }
      newCert = await maybeIssueCertificateForLesson(req, ex.lesson.id);
    }

    // Sau khi nộp bài, kiểm tra xem bài học liền sau đã "mở khoá" chưa
    let nextLesson = null;
    if (ex.lesson?.id) {
      nextLesson = await getNextLessonInCategory(ex.lesson.id);
      if (nextLesson) {
        const { data: parentLesson } = await supabase
          .from('knowledge_lessons')
          .select('category_id')
          .eq('id', ex.lesson.id)
          .maybeSingle();
        if (parentLesson?.category_id) {
          nextLesson = await enrichNextLessonWithLock(
            parentLesson.category_id,
            nextLesson,
            req.user.userId,
            req.user,
            canManage(req),
          );
        }
      }
    }

    res.status(201).json({
      ...submissionRow,
      status,
      score,
      details: quizDetails,
      required_failed: simRequiredFailed,
      certificate_issued: newCert || null,
      next_lesson: nextLesson || null,
      current_lesson_id: ex.lesson?.id || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /knowledge/submissions — admin chấm bài essay
r.get('/submissions', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const { status, exercise_id } = req.query;
    let q = supabase
      .from('knowledge_exercise_submissions')
      .select('*, user:users(id, full_name, email), exercise:knowledge_exercises(id, title, type, lesson_id)')
      .order('submitted_at', { ascending: false })
      .limit(100);
    if (status) q = q.eq('status', status);
    if (exercise_id) q = q.eq('exercise_id', exercise_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ submissions: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /knowledge/submissions/:id/grade
r.patch('/submissions/:id/grade', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const { score, feedback, status } = req.body;
    const { data, error } = await supabase
      .from('knowledge_exercise_submissions')
      .update({
        score,
        feedback: feedback || null,
        status: status || (score >= 70 ? 'passed' : 'failed'),
        graded_by: req.user.userId,
        graded_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
// BOOKMARK
// ════════════════════════════════════════════════════════════════════════

// POST /knowledge/lessons/:id/bookmark — toggle
r.post('/lessons/:id/bookmark', async (req, res) => {
  try {
    const { data: existing } = await supabase
      .from('knowledge_lesson_bookmarks')
      .select('id')
      .eq('user_id', req.user.userId)
      .eq('lesson_id', req.params.id)
      .maybeSingle();
    if (existing) {
      await supabase.from('knowledge_lesson_bookmarks').delete().eq('id', existing.id);
      return res.json({ is_bookmarked: false });
    }
    await supabase.from('knowledge_lesson_bookmarks').insert({
      user_id: req.user.userId,
      lesson_id: req.params.id,
    });
    res.json({ is_bookmarked: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /knowledge/bookmarks
r.get('/bookmarks', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('knowledge_lesson_bookmarks')
      .select('created_at, lesson:knowledge_lessons(*, category:knowledge_categories(id, name, icon))')
      .eq('user_id', req.user.userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ bookmarks: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
// RATING
// ════════════════════════════════════════════════════════════════════════

// POST /knowledge/lessons/:id/rate
r.post('/lessons/:id/rate', async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const num = Number(rating);
    if (!num || num < 1 || num > 5) return res.status(400).json({ error: 'Đánh giá 1-5 sao' });
    const { data, error } = await supabase
      .from('knowledge_lesson_ratings')
      .upsert(
        {
          user_id: req.user.userId,
          lesson_id: req.params.id,
          rating: num,
          comment: comment || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,lesson_id' },
      )
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /knowledge/lessons/:id/rate
r.delete('/lessons/:id/rate', async (req, res) => {
  try {
    await supabase
      .from('knowledge_lesson_ratings')
      .delete()
      .eq('user_id', req.user.userId)
      .eq('lesson_id', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
// CERTIFICATES — Chứng nhận hoàn thành khoá (danh mục)
// ════════════════════════════════════════════════════════════════════════

// GET /knowledge/categories/:id/progress — tiến độ chi tiết của user trong 1 khoá
r.get('/categories/:id/progress', async (req, res) => {
  try {
    const evalResult = await evaluateCertificateEligibility(req.user.userId, req.params.id, req.user);
    const { stats, category, eligible, reason } = evalResult;
    const { data: cert } = await supabase
      .from('knowledge_certificates')
      .select('id, certificate_number, verify_code, issued_at, status, badge_image_url')
      .eq('user_id', req.user.userId)
      .eq('category_id', req.params.id)
      .maybeSingle();
    const totalLessons = stats?.totalLessons || 0;
    const completedLessons = stats?.completedLessons || 0;
    const exerciseStats = stats?.exerciseStats || { total: 0, passed: 0, avgScore: null };
    // Phần trăm hoàn thành tính trung bình bài học + bài tập (cân bằng)
    const lessonRate = totalLessons ? completedLessons / totalLessons : 0;
    const exRate = exerciseStats.total ? exerciseStats.passed / exerciseStats.total : 1;
    const overallRate = (exerciseStats.total > 0 && (category?.require_all_exercises_passed !== false))
      ? Math.round(((lessonRate + exRate) / 2) * 100)
      : Math.round(lessonRate * 100);
    const deadline = await computeUserDeadline(req.params.id, req.user.userId);

    res.json({
      category_id: req.params.id,
      total_lessons: totalLessons,
      completed_lessons: completedLessons,
      completion_rate: overallRate,
      lesson_completion_rate: Math.round(lessonRate * 100),
      exercises: exerciseStats,
      certificate: cert || null,
      eligible,
      reason,
      badge_image_url: category?.badge_image_url || null,
      require_all_exercises_passed: category?.require_all_exercises_passed !== false,
      deadline,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /knowledge/categories/:id/deadline-history — lịch sử thay đổi deadline
r.get('/categories/:id/deadline-history', async (req, res) => {
  try {
    let { data, error } = await supabase
      .from('knowledge_category_deadline_history')
      .select('*')
      .eq('category_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error && error.code === '42P01') return res.json({ history: [], supported: false });
    if (error) throw error;
    const userIds = [...new Set((data || []).map((h) => h.changed_by).filter(Boolean))];
    let userMap = {};
    if (userIds.length) {
      const { data: users } = await supabase.from('users').select('id, full_name, avatar').in('id', userIds);
      userMap = Object.fromEntries((users || []).map((u) => [u.id, u]));
    }
    const history = (data || []).map((h) => ({
      ...h,
      changed_by_user: h.changed_by ? userMap[h.changed_by] || null : null,
    }));
    res.json({ history, supported: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /knowledge/categories/:id/learning-timeline — lịch học của user trong khoá
//   Trả về danh sách event (lesson_completed, exercise_submitted) kèm cờ on_time/late
r.get('/categories/:id/learning-timeline', async (req, res) => {
  try {
    const userId = req.query.user_id && canManage(req) ? req.query.user_id : req.user.userId;
    const { data: lessons } = await supabase
      .from('knowledge_lessons')
      .select('id, title, sort_order')
      .eq('category_id', req.params.id)
      .order('sort_order');
    const lessonIds = (lessons || []).map((l) => l.id);
    const lessonMap = new Map((lessons || []).map((l) => [l.id, l]));
    const events = [];

    if (lessonIds.length) {
      const lpSelect = 'lesson_id, status, started_at, completed_at, last_viewed_at, completed_late, deadline_snapshot';
      let { data: prog, error: lpErr } = await supabase
        .from('knowledge_lesson_progress')
        .select(lpSelect)
        .eq('user_id', userId)
        .in('lesson_id', lessonIds);
      // Fallback nếu DB chưa có cột deadline
      if (lpErr && lpErr.code === '42703') {
        const r2 = await supabase
          .from('knowledge_lesson_progress')
          .select('lesson_id, status, started_at, completed_at, last_viewed_at')
          .eq('user_id', userId)
          .in('lesson_id', lessonIds);
        prog = r2.data;
      }
      (prog || []).forEach((p) => {
        const l = lessonMap.get(p.lesson_id);
        if (p.completed_at) {
          events.push({
            type: 'lesson_completed',
            title: l?.title || 'Bài học',
            at: p.completed_at,
            is_late: !!p.completed_late,
            deadline_snapshot: p.deadline_snapshot || null,
            lesson_id: p.lesson_id,
          });
        } else if (p.status === 'in_progress' && p.started_at) {
          events.push({
            type: 'lesson_started',
            title: l?.title || 'Bài học',
            at: p.started_at,
            is_late: false,
            lesson_id: p.lesson_id,
          });
        }
      });

      const { data: exs } = await supabase
        .from('knowledge_exercises')
        .select('id, title, lesson_id')
        .in('lesson_id', lessonIds);
      const exIds = (exs || []).map((e) => e.id);
      const exMap = new Map((exs || []).map((e) => [e.id, e]));
      if (exIds.length) {
        let { data: subs, error: subErr } = await supabase
          .from('knowledge_exercise_submissions')
          .select('id, exercise_id, score, status, submitted_at, attempt_number, submitted_late, deadline_snapshot')
          .eq('user_id', userId)
          .in('exercise_id', exIds)
          .order('submitted_at', { ascending: false });
        if (subErr && subErr.code === '42703') {
          const r2 = await supabase
            .from('knowledge_exercise_submissions')
            .select('id, exercise_id, score, status, submitted_at, attempt_number')
            .eq('user_id', userId)
            .in('exercise_id', exIds)
            .order('submitted_at', { ascending: false });
          subs = r2.data;
        }
        (subs || []).forEach((s) => {
          const ex = exMap.get(s.exercise_id);
          events.push({
            type: 'exercise_submitted',
            title: ex?.title || 'Bài tập',
            at: s.submitted_at,
            is_late: !!s.submitted_late,
            deadline_snapshot: s.deadline_snapshot || null,
            score: s.score,
            status: s.status,
            attempt_number: s.attempt_number,
            exercise_id: s.exercise_id,
            lesson_id: ex?.lesson_id || null,
          });
        });
      }
    }

    events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    const deadline = await computeUserDeadline(req.params.id, userId);
    const lateCount = events.filter((e) => e.is_late).length;
    const onTimeCount = events.filter((e) => !e.is_late && (e.type === 'lesson_completed' || e.type === 'exercise_submitted')).length;

    res.json({
      timeline: events,
      deadline,
      summary: {
        total_events: events.length,
        on_time: onTimeCount,
        late: lateCount,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /knowledge/categories/:id/issue-certificate — kích hoạt cấp thủ công (idempotent)
r.post('/categories/:id/issue-certificate', async (req, res) => {
  try {
    const cert = await tryIssueCertificate(req.user.userId, req.params.id, req.user);
    if (!cert) {
      const { data: existing } = await supabase
        .from('knowledge_certificates')
        .select('*, category:knowledge_categories(id, name, icon, badge_image_url)')
        .eq('user_id', req.user.userId)
        .eq('category_id', req.params.id)
        .maybeSingle();
      if (existing) return res.json({ certificate: existing, already_issued: true });
      const evalResult = await evaluateCertificateEligibility(req.user.userId, req.params.id, req.user);
      return res.status(400).json({
        error: evalResult.reason || 'Chưa đủ điều kiện cấp chứng nhận',
        progress: evalResult.stats,
        eligible: false,
      });
    }
    res.status(201).json({ certificate: cert });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /knowledge/certificates — chứng nhận của tôi
r.get('/certificates', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('knowledge_certificates')
      .select('*, category:knowledge_categories(id, name, slug, icon, badge_image_url)')
      .eq('user_id', req.user.userId)
      .order('issued_at', { ascending: false });
    if (error) throw error;
    res.json({ certificates: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /knowledge/users/:userId/certificates — public xem chứng nhận của 1 user (mạng nội bộ)
r.get('/users/:userId/certificates', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('knowledge_certificates')
      .select('id, certificate_number, verify_code, issued_at, status, total_lessons, completed_lessons, total_exercises, passed_exercises, avg_exercise_score, badge_image_url, category:knowledge_categories(id, name, slug, icon, badge_image_url)')
      .eq('user_id', req.params.userId)
      .eq('status', 'issued')
      .order('issued_at', { ascending: false });
    if (error) throw error;
    res.json({ certificates: data || [], count: (data || []).length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /knowledge/certificates/:id — chi tiết để in/xem
r.get('/certificates/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('knowledge_certificates')
      .select(`*,
        category:knowledge_categories(id, name, slug, icon, description, badge_image_url, certificate_template),
        user:users!knowledge_certificates_user_id_fkey(id, full_name, email, role, avatar)`)
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!canManage(req) && data.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Không có quyền xem chứng nhận này' });
    }
    res.json(data);
  } catch (e) {
    res.status(404).json({ error: 'Không tìm thấy chứng nhận' });
  }
});

// GET /knowledge/certificates/verify/:code — xác minh public (vẫn cần auth do middleware)
r.get('/certificates/verify/:code', async (req, res) => {
  try {
    const { data } = await supabase
      .from('knowledge_certificates')
      .select(`id, certificate_number, verify_code, issued_at, status, total_lessons, completed_lessons, avg_exercise_score, metadata,
        category:knowledge_categories(id, name, icon),
        user:users!knowledge_certificates_user_id_fkey(id, full_name, email)`)
      .eq('verify_code', String(req.params.code).toUpperCase())
      .maybeSingle();
    if (!data) return res.status(404).json({ error: 'Không tìm thấy chứng nhận', valid: false });
    res.json({ valid: data.status === 'issued', certificate: data });
  } catch (e) {
    res.status(500).json({ error: e.message, valid: false });
  }
});

// GET /knowledge/admin/employee-progress
// Trả về danh sách nhân viên + trạng thái khoá học (đạt chứng nhận chưa).
// Query: category_id (bắt buộc), q (tìm tên/email), only=missing|issued
r.get('/admin/employee-progress', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const { category_id, q, only, company_id, department_id, user_id } = req.query;
    if (!category_id) return res.status(400).json({ error: 'Thiếu category_id' });

    const { data: category } = await supabase
      .from('knowledge_categories')
      .select('id, name, icon, company_id, require_all_exercises_passed')
      .eq('id', category_id)
      .maybeSingle();
    if (!category) return res.status(404).json({ error: 'Không tìm thấy khoá' });

    const { data: lessons } = await supabase
      .from('knowledge_lessons')
      .select('id, target_roles, is_published')
      .eq('category_id', category_id)
      .eq('is_published', true);
    const lessonIds = (lessons || []).map((l) => l.id);

    const { data: exercises } = await supabase
      .from('knowledge_exercises')
      .select('id, lesson_id')
      .in('lesson_id', lessonIds.length ? lessonIds : ['00000000-0000-0000-0000-000000000000']);
    const exIds = (exercises || []).map((e) => e.id);

    let userQuery = supabase
      .from('users')
      .select('id, full_name, email, role, avatar, company_id, department_id')
      .order('full_name');

    const sysAdmin = isSystemAdmin(req.user);
    const adminCompanyId = req.user.company_id || null;
    if (!sysAdmin && adminCompanyId) {
      userQuery = userQuery.eq('company_id', adminCompanyId);
    } else if (company_id) {
      userQuery = userQuery.eq('company_id', company_id);
    }
    if (department_id) {
      if (department_id === '__none__') userQuery = userQuery.is('department_id', null);
      else userQuery = userQuery.eq('department_id', department_id);
    }
    if (user_id) userQuery = userQuery.eq('id', user_id);
    const { data: users, error: userErr } = await userQuery;
    if (userErr) throw userErr;

    const companyIds = [...new Set((users || []).map((u) => u.company_id).filter(Boolean))];
    const departmentIds = [...new Set((users || []).map((u) => u.department_id).filter(Boolean))];
    const [{ data: companiesRows }, { data: departmentsRows }] = await Promise.all([
      companyIds.length
        ? supabase.from('companies').select('id, name, short_name').in('id', companyIds)
        : Promise.resolve({ data: [] }),
      departmentIds.length
        ? supabase.from('departments').select('id, name').in('id', departmentIds)
        : Promise.resolve({ data: [] }),
    ]);
    const companyMap = new Map((companiesRows || []).map((c) => [c.id, c]));
    const departmentMap = new Map((departmentsRows || []).map((d) => [d.id, d]));
    (users || []).forEach((u) => {
      u.company = u.company_id ? companyMap.get(u.company_id) || null : null;
      u.department = u.department_id ? departmentMap.get(u.department_id) || null : null;
    });

    const userIds = (users || []).map((u) => u.id);
    if (!userIds.length) return res.json({ category, employees: [], total_lessons: lessonIds.length, total_exercises: exIds.length });

    const [{ data: progress }, { data: submissions }, { data: certs }] = await Promise.all([
      lessonIds.length
        ? supabase
            .from('knowledge_lesson_progress')
            .select('user_id, lesson_id, status, completed_at, last_viewed_at')
            .in('lesson_id', lessonIds)
            .in('user_id', userIds)
        : Promise.resolve({ data: [] }),
      exIds.length
        ? supabase
            .from('knowledge_exercise_submissions')
            .select('user_id, exercise_id, status, score, submitted_at')
            .in('exercise_id', exIds)
            .in('user_id', userIds)
        : Promise.resolve({ data: [] }),
      supabase
        .from('knowledge_certificates')
        .select('id, user_id, certificate_number, verify_code, status, issued_at, revoked_at')
        .eq('category_id', category_id)
        .in('user_id', userIds),
    ]);

    const progByUser = new Map();
    (progress || []).forEach((p) => {
      if (!progByUser.has(p.user_id)) progByUser.set(p.user_id, { completed: 0, in_progress: 0, last_viewed_at: null });
      const it = progByUser.get(p.user_id);
      if (p.status === 'completed') it.completed += 1;
      else it.in_progress += 1;
      if (!it.last_viewed_at || (p.last_viewed_at && p.last_viewed_at > it.last_viewed_at)) it.last_viewed_at = p.last_viewed_at;
    });

    const exBest = new Map();
    (submissions || []).forEach((s) => {
      const key = `${s.user_id}:${s.exercise_id}`;
      const prev = exBest.get(key);
      if (!prev || (s.score ?? -1) > (prev.score ?? -1)) exBest.set(key, s);
    });
    const exByUser = new Map();
    [...exBest.values()].forEach((s) => {
      if (!exByUser.has(s.user_id)) exByUser.set(s.user_id, { passed: 0, attempted: 0, lastAt: null });
      const it = exByUser.get(s.user_id);
      it.attempted += 1;
      if (s.status === 'passed') it.passed += 1;
      if (!it.lastAt || (s.submitted_at && s.submitted_at > it.lastAt)) it.lastAt = s.submitted_at;
    });

    const certByUser = new Map();
    (certs || []).forEach((c) => certByUser.set(c.user_id, c));

    const employees = (users || []).map((u) => {
      const p = progByUser.get(u.id) || { completed: 0, in_progress: 0, last_viewed_at: null };
      const e = exByUser.get(u.id) || { passed: 0, attempted: 0, lastAt: null };
      const cert = certByUser.get(u.id) || null;
      const lessonRate = lessonIds.length ? Math.round((p.completed / lessonIds.length) * 100) : 0;
      const exRate = exIds.length ? Math.round((e.passed / exIds.length) * 100) : 100;
      let state = 'not_started';
      if (cert && cert.status === 'issued') state = 'issued';
      else if (cert && cert.status === 'revoked') state = 'revoked';
      else if (p.completed >= lessonIds.length && e.passed >= exIds.length && lessonIds.length > 0) state = 'eligible';
      else if (p.completed > 0 || e.attempted > 0) state = 'in_progress';
      return {
        user: u,
        completed_lessons: p.completed,
        in_progress_lessons: p.in_progress,
        passed_exercises: e.passed,
        attempted_exercises: e.attempted,
        lesson_rate: lessonRate,
        exercise_rate: exRate,
        last_activity_at: p.last_viewed_at || e.lastAt || null,
        certificate: cert,
        state,
      };
    });

    let filtered = employees;
    if (q) {
      const s = String(q).toLowerCase();
      filtered = filtered.filter((emp) =>
        emp.user.full_name?.toLowerCase().includes(s)
        || emp.user.email?.toLowerCase().includes(s),
      );
    }
    if (only === 'issued') filtered = filtered.filter((e) => e.state === 'issued');
    if (only === 'missing') filtered = filtered.filter((e) => e.state !== 'issued');
    if (only === 'eligible') filtered = filtered.filter((e) => e.state === 'eligible');

    res.json({
      category,
      total_lessons: lessonIds.length,
      total_exercises: exIds.length,
      total_employees: employees.length,
      employees: filtered,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /knowledge/admin/certificates — admin xem tất cả
r.get('/admin/certificates', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const { category_id, user_id, status, q } = req.query;
    let query = supabase
      .from('knowledge_certificates')
      .select(`*,
        category:knowledge_categories(id, name, icon, company_id),
        user:users!knowledge_certificates_user_id_fkey(id, full_name, email, company_id, department_id)`)
      .order('issued_at', { ascending: false })
      .limit(500);
    if (category_id) query = query.eq('category_id', category_id);
    if (user_id) query = query.eq('user_id', user_id);
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;

    let list = data || [];
    const adminCompanyId = req.user.company_id || null;
    const sysAdmin = isSystemAdmin(req.user);
    if (!sysAdmin && adminCompanyId) {
      list = list.filter((c) => String(c.user?.company_id || '') === String(adminCompanyId));
    }
    if (q) {
      const s = String(q).toLowerCase();
      list = list.filter((c) =>
        c.user?.full_name?.toLowerCase().includes(s)
        || c.user?.email?.toLowerCase().includes(s)
        || c.certificate_number?.toLowerCase().includes(s)
        || c.category?.name?.toLowerCase().includes(s),
      );
    }
    res.json({ certificates: list, total: list.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /knowledge/admin/grant-certificate
// Cấp chứng nhận thủ công: hoàn thành mọi bài học + bài tập + cấp chứng nhận.
r.post('/admin/grant-certificate', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const { email, user_id, category_id } = req.body || {};
    if (!category_id) return res.status(400).json({ error: 'Thiếu category_id' });
    if (!email && !user_id) return res.status(400).json({ error: 'Cần email hoặc user_id' });

    let target;
    if (user_id) {
      const { data } = await supabase.from('users').select('id, full_name, email, role, company_id').eq('id', user_id).maybeSingle();
      target = data;
    } else {
      const { data } = await supabase.from('users').select('id, full_name, email, role, company_id').eq('email', email).maybeSingle();
      target = data;
    }
    if (!target) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });

    if (!isSystemAdmin(req.user) && req.user.company_id && String(target.company_id) !== String(req.user.company_id)) {
      return res.status(403).json({ error: 'Không có quyền với nhân viên khác công ty' });
    }

    const { data: lessons } = await supabase
      .from('knowledge_lessons')
      .select('id')
      .eq('category_id', category_id)
      .eq('is_published', true);
    const lessonIds = (lessons || []).map((l) => l.id);

    const now = new Date().toISOString();
    if (lessonIds.length) {
      const rows = lessonIds.map((lid) => ({
        user_id: target.id,
        lesson_id: lid,
        status: 'completed',
        started_at: now,
        completed_at: now,
        last_viewed_at: now,
      }));
      await supabase.from('knowledge_lesson_progress').upsert(rows, { onConflict: 'user_id,lesson_id' });
    }

    const { data: exercises } = await supabase
      .from('knowledge_exercises')
      .select('id, type, passing_score')
      .in('lesson_id', lessonIds.length ? lessonIds : ['00000000-0000-0000-0000-000000000000']);
    const exIds = (exercises || []).map((e) => e.id);

    if (exIds.length) {
      await supabase.from('knowledge_exercise_submissions').delete().eq('user_id', target.id).in('exercise_id', exIds);
      const subRows = (exercises || []).map((e) => ({
        exercise_id: e.id,
        user_id: target.id,
        answers: e.type === 'essay' ? { essay: 'Cấp thủ công bởi admin.' } : e.type === 'checklist' ? { items: {} } : {},
        score: Math.max(Number(e.passing_score) || 70, 100),
        status: 'passed',
        attempt_number: 1,
        submitted_at: now,
      }));
      await supabase.from('knowledge_exercise_submissions').insert(subRows);
    }

    const cert = await tryIssueCertificate(target.id, category_id, target);
    if (cert) return res.status(201).json({ certificate: cert, granted: true });

    const { data: existing } = await supabase
      .from('knowledge_certificates')
      .select('*')
      .eq('user_id', target.id)
      .eq('category_id', category_id)
      .maybeSingle();
    if (existing) {
      // Re-issue nếu đang revoked
      if (existing.status === 'revoked') {
        const { data: reissued } = await supabase
          .from('knowledge_certificates')
          .update({ status: 'issued', revoked_at: null, revoked_by: null, revoked_reason: null })
          .eq('id', existing.id)
          .select()
          .single();
        return res.json({ certificate: reissued, reissued: true });
      }
      return res.json({ certificate: existing, already_issued: true });
    }
    res.status(400).json({ error: 'Không thể cấp chứng nhận (kiểm tra điều kiện khoá học)' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /knowledge/admin/certificates/:id/revoke
r.post('/admin/certificates/:id/revoke', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const { reason } = req.body || {};
    const { data, error } = await supabase
      .from('knowledge_certificates')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by: req.user.userId,
        revoked_reason: reason || null,
      })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
// LỊCH SỬ BÀI LÀM
// ════════════════════════════════════════════════════════════════════════

// GET /knowledge/my-submissions
r.get('/my-submissions', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('knowledge_exercise_submissions')
      .select('*, exercise:knowledge_exercises(id, title, type, passing_score, lesson:knowledge_lessons(id, title))')
      .eq('user_id', req.user.userId)
      .order('submitted_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    res.json({ submissions: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
// ANALYTICS (Admin)
// ════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════
// ADMIN: Quản lý bài tập tập trung
// ════════════════════════════════════════════════════════════════════════

// GET /knowledge/admin/exercises — danh sách tất cả bài tập (admin)
r.get('/admin/exercises', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const { lesson_id, category_id, type, q: search } = req.query;

    let query = supabase
      .from('knowledge_exercises')
      .select(`*, lesson:knowledge_lessons!inner(id, title, category_id, is_published,
        category:knowledge_categories(id, name, icon, company_id))`)
      .order('created_at', { ascending: false });

    if (lesson_id) query = query.eq('lesson_id', lesson_id);
    if (type) query = query.eq('type', type);

    const { data, error } = await query;
    if (error) throw error;

    let exercises = data || [];
    if (category_id) exercises = exercises.filter((e) => e.lesson?.category_id === category_id);
    if (search) {
      const s = String(search).toLowerCase();
      exercises = exercises.filter(
        (e) => e.title?.toLowerCase().includes(s) || e.lesson?.title?.toLowerCase().includes(s),
      );
    }

    const exIds = exercises.map((e) => e.id);
    let submissionStats = {};
    if (exIds.length) {
      const { data: subs } = await supabase
        .from('knowledge_exercise_submissions')
        .select('exercise_id, status, score')
        .in('exercise_id', exIds);
      (subs || []).forEach((s) => {
        if (!submissionStats[s.exercise_id]) submissionStats[s.exercise_id] = { count: 0, passed: 0, totalScore: 0, scoreCount: 0 };
        submissionStats[s.exercise_id].count += 1;
        if (s.status === 'passed') submissionStats[s.exercise_id].passed += 1;
        if (s.score != null) {
          submissionStats[s.exercise_id].totalScore += s.score;
          submissionStats[s.exercise_id].scoreCount += 1;
        }
      });
    }

    const enriched = exercises.map((e) => {
      const stat = submissionStats[e.id];
      return {
        ...e,
        question_count: e.questions?.items?.length
          || e.questions?.steps?.length
          || (e.type === 'essay' ? 1 : 0),
        submission_count: stat?.count || 0,
        passed_count: stat?.passed || 0,
        pass_rate: stat?.count ? Math.round((stat.passed / stat.count) * 100) : null,
        avg_score: stat?.scoreCount ? Math.round((stat.totalScore / stat.scoreCount) * 10) / 10 : null,
      };
    });

    res.json({ exercises: enriched });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
// ADMIN: Bảng điểm công ty (Scoreboard)
// ════════════════════════════════════════════════════════════════════════

// GET /knowledge/admin/scoreboard
//   user_id, exercise_id, lesson_id, category_id (module),
//   company_id, department_id, region_id,
//   status, from (ISO date), to, q (search user name)
r.get('/admin/scoreboard', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const {
      user_id, exercise_id, lesson_id, category_id,
      company_id: companyIdParam, department_id, region_id,
      status, from, to, q,
    } = req.query;

    const adminCompanyId = req.user.company_id || null;
    const sysAdmin = isSystemAdmin(req.user);

    // Nếu lọc theo khu vực: lấy danh sách user_id thuộc khu vực đó (M-N)
    let regionUserSet = null;
    if (region_id) {
      const { data: rUsers } = await supabase
        .from('user_company_regions')
        .select('user_id')
        .eq('region_id', region_id);
      regionUserSet = new Set((rUsers || []).map((r) => r.user_id));
    }

    let query = supabase
      .from('knowledge_exercise_submissions')
      .select(`*,
        user:users!knowledge_exercise_submissions_user_id_fkey(id, full_name, email, avatar, role, company_id, department_id),
        exercise:knowledge_exercises(id, title, type, passing_score, lesson_id,
          lesson:knowledge_lessons(id, title, category_id,
            category:knowledge_categories(id, name, icon)))`)
      .order('submitted_at', { ascending: false })
      .limit(1000);

    if (user_id) query = query.eq('user_id', user_id);
    if (exercise_id) query = query.eq('exercise_id', exercise_id);
    if (status) query = query.eq('status', status);
    if (from) query = query.gte('submitted_at', from);
    if (to) query = query.lte('submitted_at', to);

    const { data, error } = await query;
    if (error) throw error;

    let subs = data || [];

    // Phạm vi công ty: admin có company_id chỉ thấy user trong công ty đó.
    // System admin: thấy tất cả, có thể filter bằng companyIdParam.
    if (!sysAdmin && adminCompanyId) {
      subs = subs.filter((s) => String(s.user?.company_id || '') === String(adminCompanyId));
    } else if (companyIdParam) {
      subs = subs.filter((s) => String(s.user?.company_id || '') === String(companyIdParam));
    }

    if (lesson_id) subs = subs.filter((s) => s.exercise?.lesson_id === lesson_id);
    if (category_id) subs = subs.filter((s) => s.exercise?.lesson?.category_id === category_id);
    if (department_id) subs = subs.filter((s) => String(s.user?.department_id || '') === String(department_id));
    if (regionUserSet) subs = subs.filter((s) => regionUserSet.has(s.user_id));
    if (q) {
      const s = String(q).toLowerCase();
      subs = subs.filter(
        (sub) => sub.user?.full_name?.toLowerCase().includes(s) ||
                 sub.user?.email?.toLowerCase().includes(s),
      );
    }

    // Aggregate stats
    const totals = {
      count: subs.length,
      passed: subs.filter((s) => s.status === 'passed').length,
      failed: subs.filter((s) => s.status === 'failed').length,
      pending: subs.filter((s) => s.status === 'submitted').length,
      avg_score: (() => {
        const withScore = subs.filter((s) => s.score != null);
        if (!withScore.length) return null;
        return Math.round((withScore.reduce((a, b) => a + b.score, 0) / withScore.length) * 10) / 10;
      })(),
      unique_users: new Set(subs.map((s) => s.user_id)).size,
    };

    // Filter dropdowns
    let usersForFilter = [];
    let exercisesForFilter = [];
    let lessonsForFilter = [];
    let companiesForFilter = [];
    let categoriesForFilter = [];
    let departmentsForFilter = [];
    let regionsForFilter = [];

    try {
      let usersQ = supabase.from('users')
        .select('id, full_name, email, company_id, department_id')
        .eq('is_active', true);
      if (!sysAdmin && adminCompanyId) usersQ = usersQ.eq('company_id', adminCompanyId);
      const { data: users } = await usersQ.order('full_name').limit(500);
      usersForFilter = users || [];
    } catch { /* ignore */ }

    try {
      const { data: ex } = await supabase
        .from('knowledge_exercises')
        .select('id, title, lesson:knowledge_lessons(id, title, category_id)')
        .order('title')
        .limit(500);
      exercisesForFilter = ex || [];
    } catch { /* ignore */ }

    try {
      const { data: lsn } = await supabase
        .from('knowledge_lessons')
        .select('id, title, category_id')
        .order('title')
        .limit(500);
      lessonsForFilter = lsn || [];
    } catch { /* ignore */ }

    try {
      const { data: cats } = await supabase
        .from('knowledge_categories')
        .select('id, name, icon, company_id')
        .eq('is_active', true)
        .order('sort_order');
      categoriesForFilter = (cats || []).filter((c) => {
        if (c.company_id == null) return true;
        if (sysAdmin) return true;
        return String(c.company_id) === String(adminCompanyId);
      });
    } catch { /* ignore */ }

    try {
      let depQ = supabase.from('departments').select('id, name, company_id').order('name');
      if (!sysAdmin && adminCompanyId) depQ = depQ.eq('company_id', adminCompanyId);
      const { data: deps } = await depQ;
      departmentsForFilter = deps || [];
    } catch { /* ignore */ }

    try {
      let regQ = supabase.from('company_regions')
        .select('id, name, code, company_id')
        .eq('is_active', true)
        .order('order_index');
      if (!sysAdmin && adminCompanyId) regQ = regQ.eq('company_id', adminCompanyId);
      const { data: regs } = await regQ;
      regionsForFilter = regs || [];
    } catch { /* ignore */ }

    // Fetch tất cả công ty để hiển thị (kể cả khi không phải sysAdmin, dùng cho cột tên công ty)
    let allCompanies = [];
    try {
      const { data: comp } = await supabase.from('companies').select('id, name, short_name').order('name');
      allCompanies = comp || [];
      if (sysAdmin) companiesForFilter = allCompanies;
    } catch { /* ignore */ }

    // Map id → name để ghép vào submission.user.company / department
    const companyMap = new Map(allCompanies.map((c) => [String(c.id), c]));
    const deptMap = new Map(departmentsForFilter.map((d) => [String(d.id), d]));
    subs.forEach((s) => {
      if (s.user) {
        if (s.user.company_id) s.user.company = companyMap.get(String(s.user.company_id)) || null;
        if (s.user.department_id) s.user.department = deptMap.get(String(s.user.department_id)) || null;
      }
    });

    res.json({
      submissions: subs,
      totals,
      filters: {
        users: usersForFilter,
        exercises: exercisesForFilter,
        lessons: lessonsForFilter,
        companies: companiesForFilter,
        categories: categoriesForFilter,
        departments: departmentsForFilter,
        regions: regionsForFilter,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /knowledge/analytics
r.get('/analytics', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });

    const { data: lessons } = await supabase
      .from('knowledge_lessons')
      .select('id, title, category:knowledge_categories(name, icon)')
      .eq('is_published', true);

    const lessonIds = (lessons || []).map((l) => l.id);
    if (!lessonIds.length) return res.json({ stats: [], totals: {} });

    const { data: progress } = await supabase
      .from('knowledge_lesson_progress')
      .select('lesson_id, status')
      .in('lesson_id', lessonIds);

    const { data: ratings } = await supabase
      .from('knowledge_lesson_ratings')
      .select('lesson_id, rating')
      .in('lesson_id', lessonIds);

    const { data: exercises } = await supabase
      .from('knowledge_exercises')
      .select('id, lesson_id')
      .in('lesson_id', lessonIds);
    const exerciseIds = (exercises || []).map((e) => e.id);
    const exToLesson = Object.fromEntries((exercises || []).map((e) => [e.id, e.lesson_id]));

    let submissions = [];
    if (exerciseIds.length) {
      const { data: subs } = await supabase
        .from('knowledge_exercise_submissions')
        .select('exercise_id, status, score')
        .in('exercise_id', exerciseIds);
      submissions = subs || [];
    }

    const stats = (lessons || []).map((l) => {
      const lp = (progress || []).filter((p) => p.lesson_id === l.id);
      const learners = lp.length;
      const completed = lp.filter((p) => p.status === 'completed').length;
      const rs = (ratings || []).filter((r2) => r2.lesson_id === l.id);
      const ratingCount = rs.length;
      const ratingAvg = ratingCount ? Math.round((rs.reduce((a, b) => a + b.rating, 0) / ratingCount) * 10) / 10 : null;
      const lessonExIds = (exercises || []).filter((e) => e.lesson_id === l.id).map((e) => e.id);
      const lessonSubs = submissions.filter((s) => lessonExIds.includes(s.exercise_id));
      const passed = lessonSubs.filter((s) => s.status === 'passed').length;
      return {
        id: l.id,
        title: l.title,
        category: l.category,
        learners,
        completed,
        completion_rate: learners ? Math.round((completed / learners) * 100) : 0,
        rating_avg: ratingAvg,
        rating_count: ratingCount,
        submission_count: lessonSubs.length,
        passed_count: passed,
        pass_rate: lessonSubs.length ? Math.round((passed / lessonSubs.length) * 100) : 0,
      };
    });

    const totals = {
      total_lessons: lessons.length,
      total_learners: new Set((progress || []).map((p) => p.lesson_id)).size,
      total_submissions: submissions.length,
      total_passed: submissions.filter((s) => s.status === 'passed').length,
      total_ratings: ratings?.length || 0,
    };

    res.json({ stats, totals });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
