import { Outlet } from 'react-router-dom';

/**
 * Khung module Sản xuất — tông màu teal (CRM dùng emerald/xanh khác).
 */
export default function ProductionLayout() {
  return (
    <div className="sx-module min-h-full">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 bg-white">
        <Outlet />
      </div>
    </div>
  );
}
