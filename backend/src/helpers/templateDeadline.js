/**
 * Ngày hẹn trên task/deal: 100% do nhân viên đặt — không tự tính từ bộ mẫu.
 * (deadline_days trên mẫu không còn dùng khi gen nhiệm vụ.)
 */
function templateDeadlineDaysValue() {
  return 0;
}

function deadlineFromTemplateDays() {
  return null;
}

module.exports = {
  templateDeadlineDaysValue,
  deadlineFromTemplateDays,
};
