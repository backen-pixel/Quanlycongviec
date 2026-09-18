/**
 * ĐỒNG BỘ BỘ NHÂN VẬT giữa máy chủ, localStorage và các component đang vẽ.
 *
 * Chia làm hai việc rời nhau, cố ý:
 *
 *  - `loadMascotSet()` hỏi máy chủ MỘT LẦN mỗi phiên. Gọi từ chỗ dựng khung trợ lý, không gọi
 *    trong `useMascotSet()`: nhân vật và thanh hỏi đều dùng hook đó, để hook tự gọi là mỗi lần
 *    một component mới mount lại bắn thêm một request cho cùng một giá trị.
 *  - `useMascotSet()` chỉ NGHE. Nó không fetch, không ghi — chỉ bắt component vẽ lại khi bộ đổi.
 *
 * Vì sao phải vẽ lại thủ công: `spriteFor()` đọc một biến cấp module, không phải state của
 * React. Đổi bộ mà không báo thì ảnh cũ nằm nguyên đó tới lần vẽ lại tiếp theo vì lý do khác —
 * tức là "đổi xong không thấy gì", kiểu lỗi tốn cả buổi để tìm.
 */
import { useEffect, useState } from 'react';
import api from '../../../lib/api';
import { mascotSet, setMascotSet, onMascotSetChange } from './mascotSprite';

let loaded = false;

/** Hỏi máy chủ bộ nào đang bật. Im lặng bỏ qua khi lỗi — bộ đã nhớ ở máy vẫn dùng được. */
export function loadMascotSet() {
  if (loaded) return;
  loaded = true;
  api.get('/copilotkit/ui-settings')
    .then((res) => setMascotSet(res?.data?.mascot_set))
    .catch(() => { /* mất mạng hay 401 thì giữ nguyên bộ đang có, không báo gì cho người dùng */ });
}

/** Mã bộ đang dùng; component gọi nó sẽ vẽ lại mỗi khi bộ đổi. */
export function useMascotSet() {
  const [id, setId] = useState(mascotSet);
  useEffect(() => onMascotSetChange(setId), []);
  return id;
}
