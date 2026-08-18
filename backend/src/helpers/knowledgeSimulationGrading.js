/**
 * Chấm điểm bài tập kiến thức loại 'simulation' (sân tập mô phỏng CRM · SX · VC/LĐ).
 *
 * Cấu hình bài nằm ở knowledge_exercises.questions.steps: mỗi bước có `points` và
 * `check` mô tả điều kiện đạt. Payload học viên gửi lên chỉ là các thao tác đã ghi
 * lại (chọn gì, bấm gì) — mọi so sánh chạy ở server nên client không tự cho điểm.
 */

function todayYmdVn() {
  const vn = new Date(Date.now() + 7 * 3600 * 1000);
  return vn.toISOString().slice(0, 10);
}

function ymdList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String).sort();
  return value ? [String(value)] : [];
}

function daysBetweenYmd(a, b) {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.round((tb - ta) / 86400000);
}

function evalSimulationCheck(check, answers) {
  if (!check || !check.type) return false;
  const val = answers?.[check.field];
  switch (check.type) {
    case 'true':
      return val === true;
    case 'equals':
      return String(val ?? '') === String(check.value ?? '');
    case 'one_of':
      return Array.isArray(check.value) && check.value.map(String).includes(String(val ?? ''));
    case 'min_len':
      return String(val || '').trim().length >= Number(check.value || 1);
    case 'min_lines':
      return String(val || '').split('\n').map((s) => s.trim()).filter(Boolean).length >= Number(check.value || 1);
    case 'count':
      return Array.isArray(val) && val.length >= Number(check.value || 1);
    case 'consecutive_days': {
      const list = ymdList(val);
      const need = Number(check.value || 2);
      if (list.length < need) return false;
      for (let i = 1; i < list.length; i += 1) {
        if (daysBetweenYmd(list[i - 1], list[i]) !== 1) return false;
      }
      return true;
    }
    case 'after_today': {
      const list = ymdList(val);
      if (!list.length) return false;
      const today = todayYmdVn();
      return list.every((d) => d > today);
    }
    case 'not_after_field': {
      const first = ymdList(answers?.[check.other])[0];
      const own = ymdList(val)[0];
      if (!first || !own) return false;
      return own <= first;
    }
    default:
      return false;
  }
}

/**
 * Bước có `required: true` là bước cốt lõi của nghiệp vụ (ví dụ Sale xác nhận lần hai).
 * Trượt một bước bắt buộc thì không đạt, dù tổng điểm vẫn trên ngưỡng.
 */
function gradeSimulation(questions, answers) {
  const steps = questions?.steps || [];
  if (!steps.length) return { score: 100, details: [], earned: 0, total: 0, requiredFailed: false };

  let earned = 0;
  let total = 0;
  const details = steps.map((st) => {
    const points = Number(st.points) || 1;
    total += points;
    const ok = evalSimulationCheck(st.check, answers || {});
    if (ok) earned += points;
    return {
      id: st.id,
      label: st.label,
      points,
      correct: ok,
      ...(st.required ? { required: true } : {}),
      ...(st.hint ? { hint: st.hint } : {}),
    };
  });

  return {
    score: total ? Math.round((earned / total) * 100) : 100,
    details,
    earned,
    total,
    requiredFailed: details.some((d) => d.required && !d.correct),
  };
}

module.exports = { evalSimulationCheck, gradeSimulation };
