const { quizItem, lessonMd } = require('../lib');

const COVER_CRM = 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80';
const COVER_LEAD = 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80';
const COVER_DEAL = 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80';

const PILLAR = {
  TT: 'Tư tưởng',
  TD: 'Tư duy',
  NL: 'Nguồn lực',
  VH: 'Vận hành',
  BC: 'Báo cáo & Sửa chữa',
};

/**
 * Khung 5 trụ — chuẩn cho mọi bài học.
 * Trật tự: Tư tưởng (vì sao) → Tư duy (cách nghĩ) → Nguồn lực (có gì) →
 * Vận hành (làm) → Báo cáo & Sửa chữa (kiểm và sửa).
 *
 * Cách dùng:
 *   pillarLesson({
 *     title, hook,                              // mở bài kể chuyện
 *     tuTuong:  { vaiTro, ynghia },             // Trụ 1
 *     tuDuy:    { phanBiet, mentalModel },      // Trụ 2
 *     nguonLuc: { manHinh, congCu, duLieu },    // Trụ 3
 *     vanHanh:  { steps, mentor },              // Trụ 4 (steps là string hoặc mảng)
 *     baoCaoSua:{ tuKiem, loiHay, kpi },        // Trụ 5
 *     tomTat                                    // 1 câu chốt 30 giây
 *   })
 */
function pillarLesson({ title, hook, tuTuong, tuDuy, nguonLuc, vanHanh, baoCaoSua, tomTat }) {
  const list = (arr) =>
    Array.isArray(arr)
      ? arr.map((s) => (s.startsWith('- ') || /^\d+\./.test(s) ? s : `- ${s}`)).join('\n')
      : arr || '';
  const numbered = (arr) =>
    Array.isArray(arr) ? arr.map((s, i) => `${i + 1}. ${s}`).join('\n') : arr || '';

  const parts = [
    `# ${title}`,
    hook ? `> _${hook}_` : '',

    '## 1. Tư tưởng — Vì sao bài này quan trọng',
    tuTuong?.vaiTro ? `**Vai trò của bạn:** ${tuTuong.vaiTro}` : '',
    tuTuong?.ynghia ? list(tuTuong.ynghia) : '',
    tuTuong?.note ? `> ${tuTuong.note}` : '',

    '## 2. Tư duy — Cách nghĩ trước khi làm',
    tuDuy?.phanBiet ? list(tuDuy.phanBiet) : '',
    tuDuy?.mentalModel ? `**Mental model:** ${tuDuy.mentalModel}` : '',
    tuDuy?.bang ? tuDuy.bang : '',

    '## 3. Nguồn lực — Bạn có sẵn gì trong tay',
    nguonLuc?.manHinh ? `**Màn hình chính:** ${nguonLuc.manHinh}` : '',
    nguonLuc?.congCu ? list(nguonLuc.congCu) : '',
    nguonLuc?.duLieu ? `**Dữ liệu cần đủ:** ${nguonLuc.duLieu}` : '',
    nguonLuc?.hoTro ? `**Ai hỗ trợ bạn:** ${nguonLuc.hoTro}` : '',

    '## 4. Vận hành — Làm theo từng bước',
    Array.isArray(vanHanh?.steps) ? numbered(vanHanh.steps) : vanHanh?.steps || '',
    vanHanh?.mentor ? `\n> **Mẹo của mentor:** ${vanHanh.mentor}` : '',
    vanHanh?.luuY ? `\n**Lưu ý:** ${vanHanh.luuY}` : '',

    '## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi',
    baoCaoSua?.tuKiem ? `**Tự kiểm sau khi làm:**\n${list(baoCaoSua.tuKiem)}` : '',
    baoCaoSua?.loiHay ? `\n**Lỗi thường gặp:**\n${list(baoCaoSua.loiHay)}` : '',
    baoCaoSua?.suaSao ? `\n**Sửa thế nào:**\n${list(baoCaoSua.suaSao)}` : '',
    baoCaoSua?.kpi ? `\n**Tín hiệu KPI bạn theo dõi:** ${baoCaoSua.kpi}` : '',

    '## Tóm tắt 30 giây',
    tomTat || '',
  ];

  return lessonMd(parts);
}

/**
 * Build quiz cân bằng 5 trụ (mặc định 12 câu).
 * Mỗi nhóm là mảng [question, options[], correct[], explanation].
 *   pillarQuiz({ tt:[...], td:[...], nl:[...], vh:[...], bc:[...] })
 */
function pillarQuiz({ tt = [], td = [], nl = [], vh = [], bc = [] }) {
  const all = [
    ...tt.map((x) => ['tt', ...x]),
    ...td.map((x) => ['td', ...x]),
    ...nl.map((x) => ['nl', ...x]),
    ...vh.map((x) => ['vh', ...x]),
    ...bc.map((x) => ['bc', ...x]),
  ];
  return all.map(([prefix, q, opts, cor, exp], i) =>
    quizItem(`${prefix}${i + 1}`, q, opts, cor, exp),
  );
}

function sections(...parts) {
  return lessonMd(parts);
}

function mkLesson({
  id, sort_order, title, summary, parts, content_md, tags, exercises,
  duration_minutes, is_required, cover,
}) {
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
    duration_minutes: duration_minutes ?? 10,
    cover_image_url: cover,
    attachments: [],
    exercises: exercises || [],
  };
}

function quizEx({
  id, lesson_id, title, items,
  passing_score = 70, max_attempts = 3, time_limit_minutes = null, instructions,
}) {
  return {
    id,
    lesson_id,
    title,
    instructions: instructions || `${items.length} câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.`,
    type: 'quiz',
    passing_score,
    max_attempts,
    time_limit_minutes,
    sort_order: 1,
    questions: { items },
  };
}

function checklistEx({ id, lesson_id, title, texts, passing_score = 80, instructions }) {
  return {
    id,
    lesson_id,
    title,
    instructions: instructions || 'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
    type: 'checklist',
    passing_score,
    max_attempts: null,
    time_limit_minutes: null,
    sort_order: 2,
    questions: {
      items: texts.map((text, i) => ({ id: `c${i + 1}`, text })),
    },
  };
}

function essayEx({ id, lesson_id, title, prompt, max_attempts = 2, instructions }) {
  return {
    id,
    lesson_id,
    title,
    instructions: instructions || 'Bài tự luận — trình bày trung thực, tối thiểu 200 từ.',
    type: 'essay',
    passing_score: null,
    max_attempts,
    time_limit_minutes: null,
    sort_order: 3,
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
      '> _Bài thi tổng kết — đo lại toàn bộ 5 trụ: Tư tưởng, Tư duy, Nguồn lực, Vận hành, Báo cáo & Sửa chữa._',
      '## 1. Mục đích',
      'Đo tổng hợp 5 trụ. Sau khi nộp, hệ thống mở phần **giải thích** cho câu sai — đọc kỹ trước khi thi lại.',
      '## 2. Quy định',
      `- **${questions.length} câu** trắc nghiệm — phủ đủ 5 trụ`,
      '- Điểm đạt: **80%**',
      '- Thời gian: **30 phút**',
      '- Tối đa **3 lượt**',
      '- **Điều kiện mở:** đạt **toàn bộ bài tập** trong khoá',
      '## 3. Trước khi thi',
      'Ôn lại các bài học bắt buộc và làm lại bài tập chưa đạt. Đặc biệt 2 trụ hay sai: **Vận hành** (thao tác phần mềm) và **Báo cáo & Sửa chữa** (KPI / lỗi thường gặp).',
      '## 4. Sau khi thi',
      'Nếu đạt — bạn nhận **chứng nhận** điện tử. Nếu chưa đạt — đọc giải thích, ôn lại và thi lại.',
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
        instructions: `${questions.length} câu — 30 phút — đạt 80% — tối đa 3 lượt. Phủ đủ 5 trụ.`,
      }),
    ],
    cover: categoryPrefix === 'lead' ? COVER_LEAD : categoryPrefix === 'deal' ? COVER_DEAL : COVER_CRM,
  });
  lesson.is_final_exam = true;
  return lesson;
}

module.exports = {
  PILLAR,
  pillarLesson,
  pillarQuiz,
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
