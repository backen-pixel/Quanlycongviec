import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * Đính kèm file cho việc lấy từ nguồn gộp `/work-tasks`. Mock toàn bộ mạng — không ghi dữ liệu thật.
 * Việc loại `tasks` chỉ đính kèm được qua nhiệm vụ deal (`crm_task`) tương ứng, vì route
 * `/tasks/:id/attachments` đòi người phụ trách deal. Điểm dễ sai nhất là GHÉP SAI nhiệm vụ → file
 * lên nhầm chỗ, nên chỉ ghép khi chắc chắn và báo lỗi rõ khi không.
 */
const { fetchCrmDealTasks, uploadCrmTaskFiles } = vi.hoisted(() => ({
  fetchCrmDealTasks: vi.fn(),
  uploadCrmTaskFiles: vi.fn(),
}));

vi.mock('../src/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() },
  postMultipart: vi.fn(),
}));
vi.mock('../src/lib/projectDetailApi', () => ({
  isCrmProductionTaskDone: (s: string) => s === 'completed' || s === 'done',
  fetchCrmDealTasks,
  uploadCrmTaskFiles,
  fetchCrmTaskAttachments: vi.fn().mockResolvedValue([]),
}));

import { uploadWorkTaskFile, type WorkTask } from '../src/lib/workTasksApi';

const FILE = { uri: 'file:///x.jpg', name: 'x.jpg', mime: 'image/jpeg' };

function row(over: Partial<WorkTask> = {}): WorkTask {
  return {
    id: 'task:abc',
    source_id: 'real-task',
    source_kind: 'task',
    deal_id: 'deal-1',
    lead_id: 'deal-1',
    title: 'Đóng gói',
    status: 'todo',
    assignee_id: 'me',
    ...over,
  } as WorkTask;
}

const crm = (id: string, title: string, assigneeId = 'me') => ({
  id,
  title,
  status: 'pending',
  assignee: { id: assigneeId },
});

beforeEach(() => {
  fetchCrmDealTasks.mockReset();
  uploadCrmTaskFiles.mockReset();
  uploadCrmTaskFiles.mockResolvedValue(undefined);
});

describe('uploadWorkTaskFile — việc loại tasks', () => {
  test('ghép được duy nhất theo (deal, tên việc) → tải lên nhiệm vụ deal đó', async () => {
    fetchCrmDealTasks.mockResolvedValue([crm('ct-1', 'Đóng gói'), crm('ct-2', 'Vật tư phụ')]);
    await uploadWorkTaskFile(row(), FILE);
    expect(uploadCrmTaskFiles).toHaveBeenCalledWith('deal-1', 'ct-1', [FILE]);
  });

  test('so tên không phân biệt hoa/thường và khoảng trắng thừa', async () => {
    fetchCrmDealTasks.mockResolvedValue([crm('ct-1', '  ĐÓNG GÓI ')]);
    await uploadWorkTaskFile(row(), FILE);
    expect(uploadCrmTaskFiles).toHaveBeenCalledWith('deal-1', 'ct-1', [FILE]);
  });

  test('trùng tên: chọn cái giao cho đúng người nhận của việc', async () => {
    fetchCrmDealTasks.mockResolvedValue([crm('ct-a', 'Đóng gói', 'other'), crm('ct-b', 'Đóng gói', 'me')]);
    await uploadWorkTaskFile(row(), FILE);
    expect(uploadCrmTaskFiles).toHaveBeenCalledWith('deal-1', 'ct-b', [FILE]);
  });

  test('trùng tên mà không phân biệt được → báo lỗi, KHÔNG tải nhầm', async () => {
    fetchCrmDealTasks.mockResolvedValue([crm('ct-a', 'Đóng gói', 'me'), crm('ct-b', 'Đóng gói', 'me')]);
    await expect(uploadWorkTaskFile(row(), FILE)).rejects.toThrow('Chưa tìm thấy nhiệm vụ');
    expect(uploadCrmTaskFiles).not.toHaveBeenCalled();
  });

  test('không có nhiệm vụ cùng tên → báo lỗi', async () => {
    fetchCrmDealTasks.mockResolvedValue([crm('ct-2', 'Vật tư phụ')]);
    await expect(uploadWorkTaskFile(row(), FILE)).rejects.toThrow('Chưa tìm thấy nhiệm vụ');
    expect(uploadCrmTaskFiles).not.toHaveBeenCalled();
  });

  test('việc không có deal → báo lỗi, không gọi nạp danh sách', async () => {
    await expect(uploadWorkTaskFile(row({ deal_id: null }), FILE)).rejects.toThrow('Chưa tìm thấy nhiệm vụ');
    expect(fetchCrmDealTasks).not.toHaveBeenCalled();
  });

  test('dòng vốn là crm_task: dùng thẳng id nguồn, không cần ghép theo tên', async () => {
    await uploadWorkTaskFile(row({ source_kind: 'crm_task', source_id: 'ct-9' }), FILE);
    expect(fetchCrmDealTasks).not.toHaveBeenCalled();
    expect(uploadCrmTaskFiles).toHaveBeenCalledWith('deal-1', 'ct-9', [FILE]);
  });
});
