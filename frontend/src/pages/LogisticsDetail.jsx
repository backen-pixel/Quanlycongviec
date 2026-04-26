import ProductionDetail from './ProductionDetail';

/**
 * Trang chi tiết dự án Vận chuyển & Lắp đặt — cùng luồng UI với chi tiết Sản xuất
 * (pipeline VC, đội VC, tab CRM, Đơn hàng đã bàn giao, …) qua ProductionDetail với moduleKey="vc".
 */
export default function LogisticsDetail() {
  return <ProductionDetail moduleKey="vc" />;
}
