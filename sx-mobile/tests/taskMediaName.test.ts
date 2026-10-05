import { describe, expect, test } from 'vitest';
import { formatMediaStamp, taskMediaFileName, withTaskMediaName } from '../src/lib/taskMediaName';

const NOW = new Date(2026, 9, 5, 10, 8, 23); // 05/10/2026 10:08:23

describe('taskMediaFileName', () => {
  test('ảnh: mã dự án - tên việc - Ảnh <ngày giờ>, giữ đuôi gốc', () => {
    expect(
      taskMediaFileName({ name: 'IMG_7145.jpg', mime: 'image/jpeg' }, { projectCode: 'TB-2026-1008', taskTitle: 'Ngày đặt hàng', now: NOW }),
    ).toBe('TB-2026-1008 - Ngày đặt hàng - Ảnh 05-10 10h08m23s.jpg');
  });

  test('video dùng nhãn Video', () => {
    expect(
      taskMediaFileName({ name: 'abc.mp4', mime: 'video/mp4' }, { projectCode: 'TB-2026-1008', taskTitle: 'Đóng gói', now: NOW }),
    ).toBe('TB-2026-1008 - Đóng gói - Video 05-10 10h08m23s.mp4');
  });

  test('tên máy ảnh dạng UUID không còn trong tên mới', () => {
    const n = taskMediaFileName({ name: '1dee0e96-62e3-463b-961d-79c510c90b50.jpeg', mime: 'image/jpeg' }, { taskTitle: 'Phôi', now: NOW }) as string;
    expect(n).toBe('Phôi - Ảnh 05-10 10h08m23s.jpeg');
    expect(n).not.toContain('1dee0e96');
  });

  test('không có mã dự án thì bỏ phần đầu; không có tên việc cũng được', () => {
    expect(taskMediaFileName({ name: 'a.png', mime: 'image/png' }, { taskTitle: 'Cánh', now: NOW })).toBe('Cánh - Ảnh 05-10 10h08m23s.png');
    expect(taskMediaFileName({ name: 'a.png', mime: 'image/png' }, { projectCode: 'TB-1', now: NOW })).toBe('TB-1 - Ảnh 05-10 10h08m23s.png');
    expect(taskMediaFileName({ name: 'a.png', mime: 'image/png' }, { now: NOW })).toBe('Ảnh 05-10 10h08m23s.png');
  });

  test('thiếu đuôi thì suy ra từ mime', () => {
    expect(taskMediaFileName({ name: 'camera', mime: 'image/png' }, { now: NOW })).toMatch(/\.png$/);
    expect(taskMediaFileName({ name: '', mime: 'video/quicktime' }, { now: NOW })).toMatch(/\.mov$/);
    expect(taskMediaFileName({ name: null, mime: 'video/x-unknown' }, { now: NOW })).toMatch(/\.mp4$/);
  });

  test('bỏ ký tự cấm trong tên file và cắt tên việc quá dài', () => {
    const n = taskMediaFileName(
      { name: 'x.jpg', mime: 'image/jpeg' },
      { projectCode: 'TB/1:2', taskTitle: `Việc "A"?<B>|*${'x'.repeat(100)}`, now: NOW },
    ) as string;
    expect(n).not.toMatch(/[\\/:*?"<>|]/);
    expect(n.length).toBeLessThan(140);
  });

  test('file không phải ảnh/video: trả null, giữ nguyên tên gốc', () => {
    expect(taskMediaFileName({ name: 'bao-gia.pdf', mime: 'application/pdf' }, { taskTitle: 'Báo giá', now: NOW })).toBeNull();
    const f = { name: 'bao-gia.pdf', mime: 'application/pdf', uri: 'file:///x' };
    expect(withTaskMediaName(f, { taskTitle: 'Báo giá', now: NOW })).toBe(f);
  });

  test('withTaskMediaName đổi tên nhưng giữ uri/mime', () => {
    const out = withTaskMediaName({ uri: 'file:///a.jpg', name: 'IMG_1.jpg', mime: 'image/jpeg' }, { taskTitle: 'Phôi', now: NOW });
    expect(out.uri).toBe('file:///a.jpg');
    expect(out.mime).toBe('image/jpeg');
    expect(out.name).toBe('Phôi - Ảnh 05-10 10h08m23s.jpg');
  });

  test('formatMediaStamp đệm số 0', () => {
    expect(formatMediaStamp(new Date(2026, 0, 2, 3, 4, 5))).toBe('02-01 03h04m05s');
  });
});
