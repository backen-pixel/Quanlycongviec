/** Helpers for generating knowledge seed SQL */

function escSql(str) {
  if (str == null) return 'NULL';
  return "'" + String(str).replace(/'/g, "''") + "'";
}

function dollarTag(tag, body) {
  return `$${tag}$${body}$${tag}$`;
}

function jsonDollar(tag, obj) {
  return dollarTag(tag, JSON.stringify(obj, null, 0));
}

function arraySql(arr) {
  if (!arr?.length) return "ARRAY[]::text[]";
  return `ARRAY[${arr.map((t) => escSql(t)).join(', ')}]`;
}

function lessonInsert(lesson, categoryId) {
  const md = dollarTag(`md_${lesson.id.replace(/-/g, '_')}`, lesson.content_md);
  const attachments = lesson.attachments
    ? jsonDollar(`att_${lesson.id.replace(/-/g, '_')}`, lesson.attachments) + '::jsonb'
    : "'[]'::jsonb";
  const cover = lesson.cover_image_url ? escSql(lesson.cover_image_url) : 'NULL';
  const videoUrl = lesson.video_url ? escSql(lesson.video_url) : 'NULL';
  const videoType = lesson.video_type ? escSql(lesson.video_type) : 'NULL';

  const finalExamUpdate = lesson.is_final_exam
    ? `\n\nUPDATE knowledge_lessons SET is_final_exam = true WHERE id = ${escSql(lesson.id)};`
    : '';

  return `INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  video_url, video_type, cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  ${escSql(lesson.id)},
  ${escSql(categoryId)},
  ${escSql(lesson.title)},
  ${escSql(lesson.summary)},
  ${md},
  ${videoUrl},
  ${videoType},
  ${cover},
  ${attachments},
  ${lesson.duration_minutes ?? 8},
  ${arraySql(lesson.tags)},
  ${lesson.is_required !== false},
  ${lesson.sort_order},
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  video_url = EXCLUDED.video_url, video_type = EXCLUDED.video_type,
  cover_image_url = EXCLUDED.cover_image_url, attachments = EXCLUDED.attachments,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();${finalExamUpdate}`;
}

function exerciseInsert(ex) {
  const tag = `j_${ex.id.replace(/-/g, '_')}`;
  const qJson = jsonDollar(tag, ex.questions) + '::jsonb';
  const timeLimit = ex.time_limit_minutes != null ? ex.time_limit_minutes : 'NULL';
  const maxAttempts = ex.max_attempts != null ? ex.max_attempts : 'NULL';
  const passing = ex.passing_score ?? 70;
  const imageUrl = ex.image_url ? escSql(ex.image_url) : 'NULL';
  const attachments = ex.attachments?.length
    ? jsonDollar(`eax_${ex.id.replace(/-/g, '_')}`, ex.attachments) + '::jsonb'
    : "'[]'::jsonb";

  return `INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  ${escSql(ex.id)},
  ${escSql(ex.lesson_id)},
  ${escSql(ex.title)},
  ${ex.instructions ? escSql(ex.instructions) : 'NULL'},
  ${escSql(ex.type)},
  ${qJson},
  ${passing},
  ${maxAttempts},
  ${timeLimit},
  ${ex.sort_order ?? 1},
  ${imageUrl},
  ${attachments}
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();`;
}

function quizItem(id, question, options, correct, explanation, type = 'single') {
  return { id, question, type, options, correct, explanation };
}

function lessonMd(sections) {
  return sections.filter(Boolean).join('\n\n');
}

module.exports = {
  escSql, dollarTag, jsonDollar, arraySql, lessonInsert, exerciseInsert, quizItem, lessonMd,
};
