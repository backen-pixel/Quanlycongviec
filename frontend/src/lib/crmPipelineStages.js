import api from './api';

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

/** Lấy stages của 1 pipeline. Nếu GET /pipelines/:id lỗi (embed/schema cache) → fallback GET /pipeline-stages. */
export async function fetchPipelineStagesById(pipelineId) {
  if (!pipelineId) return { stages: [], tableMissing: false };
  try {
    const { data } = await api.get(`/crm/pipelines/${pipelineId}`);
    return {
      stages: Array.isArray(data?.stages) ? data.stages : [],
      tableMissing: false,
    };
  } catch (e) {
    const code = e?.response?.data?.code;
    try {
      const { data: stages } = await api.get('/crm/pipeline-stages', {
        params: { pipeline_id: pipelineId, all: 'true' },
      });
      return {
        stages: Array.isArray(stages) ? stages : [],
        tableMissing: code === 'CRM_PIPELINES_TABLE_MISSING' && !(stages?.length),
      };
    } catch {
      return { stages: [], tableMissing: code === 'CRM_PIPELINES_TABLE_MISSING' };
    }
  }
}
