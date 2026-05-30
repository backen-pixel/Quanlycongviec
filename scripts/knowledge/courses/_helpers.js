const { quizItem, lessonMd } = require('../lib');

const COVER_CRM = 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80';
const COVER_LEAD = 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80';
const COVER_DEAL = 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80';

function sections(...parts) {
  return lessonMd(parts);
}

function mkLesson({ id, sort_order, title, summary, parts, content_md, tags, exercises, duration_minutes, is_required, cover }) {
  const body =
    content_md
    ?? (typeof parts === 'string' ? parts : Array.isArray(parts) ? sections(...parts) : '');
  return {
    id,
    sort_order,
    title,
    summary,
    content_md: body,
    tags: tags || [],
    is_required: is_required !== false,
    duration_minutes: duration_minutes ?? 8,
    cover_image_url: cover,
    attachments: [],
    exercises: exercises || [],
  };
}

function quizEx({ id, lesson_id, title, items, passing_score = 70, max_attempts = 3, time_limit_minutes = null, instructions }) {
  return {
    id,
    lesson_id,
    title,
    instructions: instructions || `${items.length} câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.`,
    type: 'quiz',
    passing_score,
    max_attempts,
    time_limit_minutes,
    sort_order: 1,
    questions: { items },
  };
}

function checklistEx({ id, lesson_id, title, texts, passing_score = 80 }) {
  return {
    id,
    lesson_id,
    title,
    instructions: 'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
    type: 'checklist',
    passing_score,
    max_attempts: null,
    time_limit_minutes: null,
    sort_order: 1,
    questions: {
      items: texts.map((text, i) => ({ id: `c${i + 1}`, text })),
    },
  };
}

function essayEx({ id, lesson_id, title, prompt, max_attempts = 2 }) {
  return {
    id,
    lesson_id,
    title,
    instructions: 'Bài tự luận — trình bày trung thực, tối thiểu 200 từ.',
    type: 'essay',
    passing_score: null,
    max_attempts,
    time_limit_minutes: null,
    sort_order: 1,
    questions: { prompt },
  };
}

function finalExamLesson({ lessonId, exId, categoryPrefix, title, questions, passing_score = 80 }) {
  const lesson = mkLesson({
    id: lessonId,
    sort_order: 99,
    title,
    summary: 'Bài thi tổng kết khoá — đạt yêu cầu để nhận chứng nhận.',
    content_md: sections(
      `# ${title}`,
      '## Mục đích',
      'Kiểm tra tổng hợp kiến thức toàn khoá. Đọc kỹ từng câu; sau khi nộp, xem **giải thích** cho câu sai.',
      '## Quy định',
      `- **${questions.length} câu** trắc nghiệm`,
      '- Điểm đạt: **80%**',
      '- Thời gian: **30 phút**',
      '- Tối đa **3 lượt**',
      '- **Điều kiện mở:** đạt **toàn bộ bài tập** trong khoá',
      '## Trước khi thi',
      'Ôn lại các bài học bắt buộc và làm lại bài tập chưa đạt.',
    ),
    tags: ['thi-cuoi', 'chung-nhan'],
    duration_minutes: 30,
    exercises: [
      quizEx({
        id: exId,
        lesson_id: lessonId,
        title: 'Bài thi tổng kết khoá',
        items: questions,
        passing_score,
        max_attempts: 3,
        time_limit_minutes: 30,
        instructions: `${questions.length} câu — 30 phút — đạt 80% — tối đa 3 lượt.`,
      }),
    ],
    cover: categoryPrefix === 'lead' ? COVER_LEAD : categoryPrefix === 'deal' ? COVER_DEAL : COVER_CRM,
  });
  lesson.is_final_exam = true;
  return lesson;
}

module.exports = {
  quizItem,
  mkLesson,
  quizEx,
  checklistEx,
  essayEx,
  finalExamLesson,
  COVER_CRM,
  COVER_LEAD,
  COVER_DEAL,
  sections,
};
