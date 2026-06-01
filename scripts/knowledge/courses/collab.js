const {
  pillarLesson, pillarQuiz, mkLesson, quizEx, checklistEx, finalExamLesson, COVER_CRM,
} = require('./_helpers');
const { enrichLesson } = require('../screenshots/attach');
const { LESSON_SPECS, FINAL_EXAM, q } = require('./collab-data');

const CAT = {
  id: 'd2000004-0000-0000-0000-000000000001',
  name: 'Hướng dẫn — Sự kiện, Chat, Bảng tin & Ghi âm',
  slug: 'huong-dan-su-kien-chat-bang-tin',
  description:
    'Thao tác 4 kênh nội bộ: Sự kiện, Nhóm chat (trang đầy đủ & bong bóng), Bảng tin nội bộ, Cuộc gọi & ghi âm. Khung 5 trụ — giọng giảng viên, có ảnh minh họa.',
  icon: '💬',
  sort_order: 8,
  deadline_mode: 'relative',
  deadline_duration_days: 14,
  deadline_note: 'Hoàn thành khoá trong 14 ngày',
  require_all_exercises_passed: true,
};

const L = (n) => `b2000004-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
const C = (n) => `c2000004-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
const CL = (n) => `c2000004-0000-0001-0000-0000000000${String(n).padStart(2, '0')}`;

function buildLesson(spec) {
  const { num, title, summary, pillar, quiz, checklist } = spec;
  const lid = L(num);
  const exercises = [
    quizEx({
      id: C(num),
      lesson_id: lid,
      title: `Kiểm tra: ${title.replace(/^TT \d+: /, '')}`,
      items: pillarQuiz(quiz),
    }),
  ];
  if (checklist) {
    exercises.push(
      checklistEx({
        id: CL(num),
        lesson_id: lid,
        title: 'Thực hành trên phần mềm',
        texts: checklist,
      }),
    );
  }
  return enrichLesson('collab', num, mkLesson({
    id: lid,
    sort_order: num,
    title,
    summary,
    content_md: pillarLesson({ title, ...pillar }),
    tags: ['collab', 'noi-bo', '5-tru', `tt-${num}`],
    cover: COVER_CRM,
    duration_minutes: num <= 2 ? 8 : 10,
    exercises,
  }));
}

const lessons = [
  ...LESSON_SPECS.map(buildLesson),
  enrichLesson('collab', 13, finalExamLesson({
    lessonId: L(13),
    exId: 'c2000004-0000-0000-0000-000000000099',
    categoryPrefix: 'guide',
    title: 'TT 13: Bài thi tổng kết — Kênh nội bộ',
    questions: FINAL_EXAM.map(([question, options, correct, explanation], i) =>
      q(`fq${i + 1}`, question, options, correct, explanation),
    ),
  })),
];

module.exports = {
  title: 'Hướng dẫn kênh nội bộ',
  description: 'Seed collab guide — Sự kiện, Chat, Bảng tin, Ghi âm',
  category: CAT,
  lessons,
};
