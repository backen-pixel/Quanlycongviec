import { Outlet } from 'react-router-dom';

/**
 * Khung module Sản xuất — tông màu teal (CRM dùng emerald/xanh khác).
 */
export default function ProductionLayout() {
  return (
    <div className="sx-module min-h-full">
      <div className="w-full max-w-none py-2" style={{ marginLeft: '-12px', marginRight: '-28px', paddingLeft: 8, paddingRight: 8 }}>
        <Outlet />
      </div>
    </div>
  );
}
