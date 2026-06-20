import { Outlet } from 'react-router-dom';

/** Khung module Kế toán — tông teal/indigo nhẹ. */
export default function AccountingLayout() {
  return (
    <div className="ketoan-module min-h-full">
      <div className="w-full max-w-none py-2" style={{ marginLeft: '-12px', marginRight: '-28px', paddingLeft: 8, paddingRight: 8 }}>
        <Outlet />
      </div>
    </div>
  );
}
