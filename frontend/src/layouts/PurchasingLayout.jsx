import { Outlet } from 'react-router-dom';

/** Khung module Mua hàng — tông orange/amber nhẹ. */
export default function PurchasingLayout() {
  return (
    <div className="muahang-module min-h-full">
      <div className="w-full max-w-none py-2" style={{ marginLeft: '-12px', marginRight: '-28px', paddingLeft: 8, paddingRight: 8 }}>
        <Outlet />
      </div>
    </div>
  );
}
