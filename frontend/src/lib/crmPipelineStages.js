/**
 * Chuẩn hóa danh sách cột pipeline CRM: dedupe theo id, sort theo order_index.
 * Tránh stepper hiển thị lệch (vd. Thắng trước Đàm phán) khi API trả thứ tự không ổn định.
 */
export function sortAndDedupePipelineStages(stages) {
  const seen = new Set();
  const list = [];
  for (const s of stages || []) {
    const id = String(s?.id || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    list.push(s);
  }
  list.sort((a, b) => {
    const ai = Number(a?.order_index);
    const bi = Number(b?.order_index);
    const oa = Number.isFinite(ai) ? ai : 99999;
    const ob = Number.isFinite(bi) ? bi : 99999;
    if (oa !== ob) return oa - ob;
    return String(a?.name || '').localeCompare(String(b?.name || ''), 'vi');
  });
  return list;
}

/** Thứ tự so sánh cho stepper (ưu tiên order_index, fallback index mảng đã sort). */
export function pipelineStageSortKey(stage, fallbackIndex = 0) {
  const o = Number(stage?.order_index);
  return Number.isFinite(o) ? o : fallbackIndex * 1000 + 500;
}
