const {
  pillarLesson, pillarQuiz, mkLesson, quizEx, checklistEx, finalExamLesson, COVER_CRM,
} = require('./_helpers');
const { enrichLesson } = require('../screenshots/attach');
const { LESSON_SPECS, FINAL_EXAM, q } = require('./guide-data');

const CAT = {
  id: 'd2000003-0000-0000-0000-000000000001',
  name: 'Hướng dẫn CRM — Toàn bộ phần mềm',
  slug: 'huong-dan-crm-lead-deal',
  description:
    'Thao tác CRM trên phần mềm: đăng nhập, Lead, Deal, Dashboard, Chat, Mobile. Trật tự 5 trụ — dành người mới non-tech, giọng giảng viên.',
  icon: '🖥️',
  sort_order: 5,
  deadline_mode: 'relative',
  deadline_duration_days: 21,
  deadline_note: 'Hoàn thành hướng dẫn CRM trong 21 ngày',
  require_all_exercises_passed: true,
};

const L = (n) => `b2000003-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
const C = (n) => `c2000003-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
const CL = (n) => `c2000003-0000-0001-0000-0000000000${String(n).padStart(2, '0')}`;

function buildLesson(spec) {
  const { num, title, summary, pillar, quiz, checklist } = spec;
  const lid = L(num);
  const exercises = [
    quizEx({
      id: C(num),
      lesson_id: lid,
      title: `Kiểm tra: ${title.replace(/^HD \d+: /, '')}`,
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
  return enrichLesson('guide', num, mkLesson({
    id: lid,
    sort_order: num,
    title,
    summary,
    content_md: pillarLesson({ title, ...pillar }),
    tags: ['huong-dan', 'phan-mem', '5-tru', `hd-${num}`],
    cover: COVER_CRM,
    duration_minutes: num <= 3 ? 8 : 10,
    exercises,
  }));
}

const lessons = [
  ...LESSON_SPECS.map(buildLesson),
  enrichLesson('guide', 13, finalExamLesson({
    lessonId: L(13),
    exId: 'c2000003-0000-0000-0000-000000000099',
    categoryPrefix: 'guide',
    title: 'HD 13: Bài thi tổng kết — Thao tác CRM',
    questions: FINAL_EXAM.map(([question, options, correct, explanation], i) =>
      q(`fq${i + 1}`, question, options, correct, explanation),
    ),
  })),
];

module.exports = {
  title: 'Hướng dẫn CRM',
  description: 'Seed CRM guide — 5 trụ, 12 câu/bài',
  category: CAT,
  lessons,
};
