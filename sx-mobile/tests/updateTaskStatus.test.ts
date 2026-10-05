import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * Đổi trạng thái việc lấy từ nguồn gộp `/work-tasks`. Mock `api` — không gọi mạng, không ghi dữ liệu thật.
 * Chốt hai điều dễ sai: (1) việc loại `tasks` phải đi qua `PATCH /tasks/:id/status` (route có kiểm
 * tra quyền) với trạng thái của cột `tasks.status`; (2) id gửi lên là id THẬT, không phải `unified_id`.
 */
const { patch, put } = vi.hoisted(() => ({ patch: vi.fn(), put: vi.fn() }));
vi.mock('../src/api/client', () => ({ api: { patch, put, get: vi.fn() } }));

import { updateUnifiedTaskStatus, updateWorkTaskStatus, type WorkTask } from '../src/lib/workTasksApi';

function task(over: Partial<WorkTask> = {}): WorkTask {
  return {
    id: 'task:abc', // unified_id
    source_id: 'real-uuid',
    source_kind: 'task',
    lead_id: 'lead-1',
    title: 'Đóng gói',
    status: 'todo',
    ...over,
  } as WorkTask;
}

beforeEach(() => {
  patch.mockReset();
  put.mockReset();
});

describe('updateWorkTaskStatus — nguồn «task» (bảng tasks)', () => {
  test.each([
    ['in_progress', 'in_progress'],
    ['completed', 'done'],
    ['done', 'done'],
    ['pending', 'todo'],
  ])('trạng thái app %s → cột tasks.status %s', async (appStatus, dbStatus) => {
    patch.mockResolvedValue({ data: { task: { title: 'X', status: dbStatus } } });
    const out = await updateWorkTaskStatus('lead-1', 'real-uuid', appStatus, 'task');
    expect(patch).toHaveBeenCalledWith('/tasks/real-uuid/status', { status: dbStatus });
    expect(out.status).toBe(dbStatus);
  });

  test('không đụng API Giao việc', async () => {
    patch.mockResolvedValue({ data: { task: { status: 'done' } } });
    await updateWorkTaskStatus('lead-1', 'real-uuid', 'completed', 'task');
    expect(put).not.toHaveBeenCalled();
  });
});

describe('updateUnifiedTaskStatus — chọn API theo nguồn của dòng', () => {
  test('việc loại tasks: dùng id THẬT, giữ id gộp để khớp danh sách', async () => {
    patch.mockResolvedValue({ data: { task: { title: 'Đóng gói', status: 'in_progress' } } });
    const out = await updateUnifiedTaskStatus(task(), 'in_progress');
    expect(patch).toHaveBeenCalledWith('/tasks/real-uuid/status', { status: 'in_progress' });
    expect(out.id).toBe('task:abc');
    expect(out.status).toBe('in_progress');
  });

  test('việc crm_task: PUT vào nhiệm vụ của deal, bỏ qua minh chứng như luồng cũ', async () => {
    put.mockResolvedValue({ data: {} });
    await updateUnifiedTaskStatus(task({ source_kind: 'crm_task', source_id: 'ct-1' }), 'completed');
    expect(put).toHaveBeenCalledWith('/crm/leads/lead-1/tasks/ct-1', {
      status: 'completed',
      skip_completion_evidence: true,
    });
    expect(patch).not.toHaveBeenCalled();
  });

  test('việc crm_assignment: PUT vào /crm/assignments', async () => {
    put.mockResolvedValue({ data: { assignment: {} } });
    await updateUnifiedTaskStatus(task({ source_kind: 'crm_assignment', source_id: 'as-1' }), 'in_progress');
    expect(put).toHaveBeenCalledWith('/crm/assignments/as-1', { status: 'in_progress' });
  });

  test('lỗi từ BE (vd. cần file chi phí) được ném lên để màn hình hiện nguyên thông báo', async () => {
    patch.mockRejectedValue(new Error('cost_excel_required'));
    await expect(updateUnifiedTaskStatus(task(), 'completed')).rejects.toThrow('cost_excel_required');
  });
});
