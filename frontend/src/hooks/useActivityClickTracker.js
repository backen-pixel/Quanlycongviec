/**
 * Theo dõi click & submit form TOÀN CỤC qua event delegation — không cần gắn onClick thủ công
 * ở từng nút trong từng trang. Chỉ ghi phần tử có đánh dấu `data-track` (tránh log mọi pixel
 * click, giữ log sạch cho AI đọc).
 *
 * Cách dùng — đánh dấu 1 nút:
 *   <button data-track="Chuyển sang Vận chuyển" data-track-module="crm" data-track-feature="deal_pipeline">
 *
 * Đánh dấu 1 form (log lúc submit, không log giá trị từng field):
 *   <form data-track="Tạo Lead mới" data-track-module="crm" data-track-feature="lead_create">
 *
 * Dùng capture phase cho cả 2 listener: nhiều component gọi stopPropagation() ở bubble phase khi
 * click lồng nhau (card trong card), bắt ở capture để không bỏ sót.
 *
 * Đặt 1 lần trong ProtectedLayout (sau khi đã login), cùng chỗ với useActivityRouteTracker.
 */

import { useEffect } from 'react';
import { logClick, logSubmitForm } from '../lib/activityLogger';

function readTrackAttrs(el) {
  return {
    label: el.dataset.track,
    module: el.dataset.trackModule || null,
    feature: el.dataset.trackFeature || null,
    entity_type: el.dataset.trackEntityType || null,
    entity_id: el.dataset.trackEntityId || null,
  };
}

export function useActivityClickTracker(enabled) {
  useEffect(() => {
    if (!enabled) return;

    function onClick(e) {
      const el = e.target.closest?.('[data-track]');
      if (!el || el.tagName === 'FORM') return;
      logClick(readTrackAttrs(el));
    }

    function onSubmit(e) {
      const form = e.target.closest?.('[data-track]');
      if (!form || form.tagName !== 'FORM') return;
      const { label, module, feature, entity_type, entity_id } = readTrackAttrs(form);
      logSubmitForm({ label, module, feature, entity_type, entity_id });
    }

    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('submit', onSubmit, true);
    };
  }, [enabled]);
}
