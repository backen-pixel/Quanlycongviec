const {
  pillarLesson, pillarQuiz, mkLesson, quizEx, checklistEx, finalExamLesson, COVER_DEAL,
} = require('./_helpers');
const { enrichLesson } = require('../screenshots/attach');
const { LESSON_SPECS, FINAL_EXAM, q } = require('./deal-data');

const CAT = {
  id: 'd2000002-0000-0000-0000-000000000001',
  name: 'Deal — Cơ hội bán hàng',
  slug: 'deal-co-hoi-ban-hang',
  description:
    'Khoá đào tạo quản lý Deal sau Lead: pipeline, báo giá, HĐ, Thắng/Thua, bàn giao xưởng. Trật tự 5 trụ — dành người mới, giọng giảng viên.',
  icon: '💼',
  sort_order: 11,
  deadline_mode: 'relative',
  deadline_duration_days: 30,
  deadline_note: 'Hoàn thành khoá Deal trong 30 ngày kể từ bài học đầu tiên',
  require_all_exercises_passed: true,
};

const L = (n) => `b2000002-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
const C = (n) => `c2000002-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
const CL = (n) => `c2000002-0000-0001-0000-0000000000${String(n).padStart(2, '0')}`;

function buildLesson(spec) {
  const { num, title, summary, pillar, quiz, checklist } = spec;
  const lid = L(num);
  const exercises = [
    quizEx({
      id: C(num),
      lesson_id: lid,
      title: `Kiểm tra: ${title.replace(/^Bài \d+: /, '')}`,
      items: pillarQuiz(quiz),
      passing_score: 70,
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
  return enrichLesson('deal', num, mkLesson({
    id: lid,
    sort_order: num,
    title,
    summary,
    content_md: pillarLesson({ title, ...pillar }),
    tags: ['deal', `bai-${num}`, '5-tru'],
    cover: COVER_DEAL,
    exercises,
  }));
}

const lessons = [
  ...LESSON_SPECS.map(buildLesson),
  enrichLesson('deal', 13, finalExamLesson({
    lessonId: L(13),
    exId: 'c2000002-0000-0000-0000-000000000099',
    categoryPrefix: 'deal',
    title: 'Bài 13: Bài thi tổng kết — Deal',
    questions: FINAL_EXAM.map(([question, options, correct, explanation], i) =>
      q(`fq${i + 1}`, question, options, correct, explanation),
    ),
  })),
];

module.exports = {
  title: 'Khoá Deal',
  description: 'Seed Deal — 5 trụ, 12–14 câu/bài',
  category: CAT,
  lessons,
};
