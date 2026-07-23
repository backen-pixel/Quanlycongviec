import { isNextGoCompany } from '../lib/sxCompanySuggestFromLeadType';

/** Bullet hướng dẫn chọn xưởng — NextGo bao bì vs quy ước tủ bếp/cửa. */
export default function SxPickGuideList({ company, className = 'space-y-1 list-disc pl-4' }) {
  if (isNextGoCompany(company)) {
    return (
      <ul className={className}>
        <li><strong>NextGo</strong> là xưởng bao bì — chọn công ty SX NextGo.</li>
        <li>Chọn phân loại khớp loại CRM (Túi giấy, Hộp cứng, Thùng carton…).</li>
        <li><span className="text-red-600 font-bold">★</span> = gợi ý theo cấu hình loại CRM trên Cài đặt Pipeline.</li>
      </ul>
    );
  }
  return (
    <ul className={className}>
      <li><strong>Phúc Đạt</strong> chỉ làm cửa</li>
      <li>Làm tủ bếp (Sang thiết kế) → chọn <strong>HCB</strong></li>
      <li>Làm tủ bếp inox → chọn <strong>Tủ bếp</strong> của <strong>Metalla</strong></li>
    </ul>
  );
}
