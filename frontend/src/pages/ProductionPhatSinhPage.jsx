import { useState } from 'react';
import CRMAssignmentsPage from './CRMAssignmentsPage';

/**
 * Quản lý phát sinh — hai luồng việc riêng: không phí và có phí.
 * Sản xuất, CRM, Lắp đặt và module tùy chỉnh dùng cùng một trang, chỉ khác module lọc.
 *
 * Dùng lại nguyên trang Giao việc, chỉ hẹp bộ lọc lại. Không viết Kanban thứ hai:
 * thẻ, kéo thả, bình luận, tệp đính kèm đều đã chạy ổn định ở đó rồi.
 *
 * Một việc phát sinh là một dòng `crm_assignments` có `phat_sinh_kind`. Việc đó
 * thuộc tab nào là do `co_phi` của LOẠI quyết định — khai ở trang Cài đặt không
 * gian chung, mỗi công ty một bộ. Không lưu `co_phi` trên từng việc: hai nơi giữ
 * cùng một sự thật thì sớm muộn cũng lệch nhau.
 */
const TAB = [
  { key: '0', nhan: 'Không phí' },
  { key: '1', nhan: 'Có phí' },
];

export default function ProductionPhatSinhPage({
  companiesModule = 'production',
  assignmentModule = 'production',
  storagePrefix = 'sx_phat_sinh',
  dashboardLink = '/sx/dashboard',
} = {}) {
  const [coPhi, setCoPhi] = useState('0');

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-gray-200 bg-white px-4 pt-3">
        {TAB.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setCoPhi(t.key)}
            className={`-mb-px rounded-t-lg border border-b-0 px-4 py-2 text-[13px] font-semibold cursor-pointer transition
              ${coPhi === t.key
                ? 'border-gray-200 bg-white text-gray-900'
                : 'border-transparent bg-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t.nhan}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        {/*
          `key` ép React dựng lại trang khi đổi tab. Không có nó thì state bộ lọc,
          danh sách thẻ và con trỏ phân trang của tab cũ còn dính sang tab mới.
        */}
        <CRMAssignmentsPage
          key={coPhi}
          apiBase="/crm/assignments"
          pageTitle={`Quản lý phát sinh — ${coPhi === '1' ? 'Có phí' : 'Không phí'}`}
          companiesModule={companiesModule}
          assignmentModule={assignmentModule}
          storagePrefix={`${storagePrefix}_${coPhi}`}
          dashboardLink={dashboardLink}
          phatSinhOnly
          coPhi={coPhi}
        />
      </div>
    </div>
  );
}
