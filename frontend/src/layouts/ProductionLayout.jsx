import { Outlet } from 'react-router-dom';

/**
 * Khung module Sản xuất — tông màu teal (CRM dùng emerald/xanh khác).
 */
export default function ProductionLayout() {
  return (
    <div className="sx-module min-h-full">
      {/* pb-0: tránh padding đáy đẩy Kanban vượt main → thanh cuộn trang + khoảng trống dưới board */}
      <div className="w-full max-w-none pt-2 pb-0" style={{ marginLeft: '-12px', marginRight: '-28px', paddingLeft: 8, paddingRight: 8 }}>
        <Outlet />
      </div>
    </div>
  );
}
