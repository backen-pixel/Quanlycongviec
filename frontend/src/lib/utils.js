export const STATUS_LABELS = { new:'Mới', consulting:'Tư vấn', designing:'Thiết kế', quoting:'Báo giá', contract_signed:'Đã ký HĐ', producing:'Sản xuất', shipping:'Vận chuyển', installing:'Lắp đặt', warranty:'Bảo hành', completed:'Hoàn thành', cancelled:'Đã hủy' };
export const STATUS_COLORS = { new:'bg-gray-100 text-gray-700', consulting:'bg-purple-100 text-purple-700', designing:'bg-pink-100 text-pink-700', quoting:'bg-amber-100 text-amber-700', contract_signed:'bg-green-100 text-green-700', producing:'bg-orange-100 text-orange-700', shipping:'bg-cyan-100 text-cyan-700', installing:'bg-blue-100 text-blue-700', warranty:'bg-red-100 text-red-700', completed:'bg-emerald-100 text-emerald-700', cancelled:'bg-gray-200 text-gray-500' };
export const PRIORITY_LABELS = { low:'Thấp', medium:'TB', high:'Cao', urgent:'Gấp' };
export const PRIORITY_COLORS = { low:'bg-blue-100 text-blue-700', medium:'bg-yellow-100 text-yellow-700', high:'bg-orange-100 text-orange-700', urgent:'bg-red-100 text-red-700' };
export const TASK_STATUS = { todo:'Chờ xử lý', in_progress:'Đang làm', review:'Chờ duyệt', done:'Hoàn thành', blocked:'Bị chặn' };
export const TASK_COLORS = { todo:'bg-gray-500', in_progress:'bg-blue-500', review:'bg-amber-500', done:'bg-emerald-500', blocked:'bg-red-500' };
export const formatVND = (n) => new Intl.NumberFormat('vi-VN').format(n) + 'đ';
export const formatDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '';
