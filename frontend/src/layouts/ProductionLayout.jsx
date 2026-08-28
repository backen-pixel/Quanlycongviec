import { Outlet } from 'react-router-dom';

/**
 * Khung module Sản xuất — tông màu teal (CRM dùng emerald/xanh khác).
 */
export default function ProductionLayout() {
  return (
    <div className="sx-module min-h-full">
      {/* pb-0: tránh padding đáy đẩy Kanban vượt main → thanh cuộn trang + khoảng trống dưới board
          Margin âm để phá padding của khung ngoài. Desktop giữ nguyên -12/-28 (đã tinh chỉnh cho lg:px-6).
          Mobile: khung ngoài chỉ px-3 nên -28px thừa; kèm w-full (chiều rộng khoá 100% cha) thì margin
          âm phải chỉ dịch chứ không nới → khối 346px nằm ở l=0, hở 29px bên phải. Dùng w-auto + -mr-3
          để nới đúng ra mép, Kanban 330px → 354px. */}
      <div className="w-auto lg:w-full max-w-none pt-2 pb-0 -ml-3 -mr-3 lg:mr-[-28px] px-2">
        <Outlet />
      </div>
    </div>
  );
}
