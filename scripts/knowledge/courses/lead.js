const {
  pillarLesson, pillarQuiz, mkLesson, quizEx, checklistEx, essayEx, finalExamLesson, COVER_LEAD,
} = require('./_helpers');
const { enrichLesson } = require('../screenshots/attach');
const { LESSON_SPECS, FINAL_EXAM, q } = require('./lead-data');

const CAT = {
  id: 'd2000001-0000-0000-0000-000000000001',
  name: 'Lead — Khách hàng tiềm năng',
  slug: 'lead-khach-hang-tiem-nang',
  description:
    'Khoá đào tạo chuẩn cho nhân viên kinh doanh ngành tủ bếp nhôm và cửa nhôm. Trật tự tâm lý: Tư tưởng → Tư duy → Nguồn lực → Vận hành → Báo cáo & Sửa chữa. Dành cho người mới — không cần kiến thức kỹ thuật.',
  icon: '🎯',
  sort_order: 10,
  deadline_mode: 'relative',
  deadline_duration_days: 30,
  deadline_note: 'Hoàn thành toàn bộ khoá trong 30 ngày kể từ bài học đầu tiên',
  require_all_exercises_passed: true,
};

const L = (n) => `b2000001-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
const C = (n) => `c2000001-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
const CL = (n) => `c2000001-0000-0001-0000-0000000000${String(n).padStart(2, '0')}`;
const ES = (n) => `c2000001-0000-0002-0000-0000000000${String(n).padStart(2, '0')}`;

function buildLesson(spec) {
  const { num, title, summary, pillar, quiz, checklist, essay, quizStrict } = spec;
  const lid = L(num);
  const exercises = [];

  exercises.push(
    quizEx({
      id: C(num),
      lesson_id: lid,
      title: `Kiểm tra: ${title.replace(/^Bài \d+: /, '')}`,
      items: pillarQuiz(quiz),
      passing_score: quizStrict ? 80 : 70,
      time_limit_minutes: quizStrict ? 15 : null,
    }),
  );

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

  if (essay) {
    exercises.push(
      essayEx({
        id: ES(num),
        lesson_id: lid,
        title: 'Tự luận: Áp dụng và cam kết',
        prompt: typeof essay === 'string' ? essay : essay,
      }),
    );
  }

  return enrichLesson('lead', num, mkLesson({
    id: lid,
    sort_order: num,
    title,
    summary,
    content_md: pillarLesson({ title, ...pillar }),
    tags: ['lead', `bai-${num}`, '5-tru'],
    cover: COVER_LEAD,
    duration_minutes: num <= 2 ? 12 : 10,
    exercises,
  }));
}

const lessons = [
  ...LESSON_SPECS.map(buildLesson),
  enrichLesson('lead', 13, finalExamLesson({
    lessonId: L(13),
    exId: 'c2000001-0000-0000-0000-000000000099',
    categoryPrefix: 'lead',
    title: 'Bài 13: Bài thi tổng kết — Lead',
    questions: FINAL_EXAM.map(([question, options, correct, explanation], i) =>
      q(`fq${i + 1}`, question, options, correct, explanation),
    ),
    passing_score: 80,
  })),
];

module.exports = {
  title: 'Khoá Lead — Quản lý Khách hàng Tiềm năng',
  description: 'Seed Lead — 5 trụ, giọng giảng viên, 10–20 câu/bài',
  category: CAT,
  lessons,
};
