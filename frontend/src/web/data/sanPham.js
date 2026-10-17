// Dữ liệu tĩnh cho website bán hàng. Sửa trực tiếp file này khi cần đổi sản phẩm.

export const DANH_MUC = [
  { id: 'chu-l', ten: 'Tủ bếp chữ L' },
  { id: 'chu-i', ten: 'Tủ bếp chữ I' },
  { id: 'chu-u', ten: 'Tủ bếp chữ U' },
  { id: 'co-dao', ten: 'Bếp có đảo' },
  { id: 'phu-kien', ten: 'Tủ phụ & phụ kiện' },
];

export const VAT_LIEU = [
  { id: 'an-cuong', ten: 'An Cường MDF phủ Melamine' },
  { id: 'acrylic', ten: 'Acrylic bóng gương' },
  { id: 'go-soi', ten: 'Gỗ sồi tự nhiên' },
  { id: 'go-oc-cho', ten: 'Gỗ óc chó tự nhiên' },
  { id: 'laminate', ten: 'Laminate chống ẩm' },
];

export const SAN_PHAM = [
  {
    id: 'tb-l-01',
    ten: 'Tủ bếp chữ L Modena',
    danhMuc: 'chu-l',
    vatLieu: 'an-cuong',
    gia: 18500000,
    donVi: 'm dài',
    kichThuoc: 'Dài 3.2m + 1.8m · Cao 2.4m',
    mau: ['#d6c3a5', '#3f3a35'],
    noiBat: true,
    moTa: 'Bố cục chữ L tận dụng góc bếp, thùng MDF lõi xanh chống ẩm, cánh phủ Melamine vân gỗ ấm.',
    tienIch: ['Ray giảm chấn Blum', 'Kệ góc xoay 180°', 'Bảo hành 5 năm'],
  },
  {
    id: 'tb-i-02',
    ten: 'Tủ bếp chữ I Lumen',
    danhMuc: 'chu-i',
    vatLieu: 'acrylic',
    gia: 22000000,
    donVi: 'm dài',
    kichThuoc: 'Dài 3.6m · Cao 2.4m',
    mau: ['#eef2f6', '#9fb3c8'],
    noiBat: false,
    moTa: 'Một mặt thẳng gọn cho căn hộ, cánh Acrylic bóng gương phản sáng giúp bếp rộng hơn thị giác.',
    tienIch: ['Cánh không tay nắm', 'Đèn LED cảm ứng', 'Chống bám vân tay'],
  },
  {
    id: 'tb-u-03',
    ten: 'Tủ bếp chữ U Harmony',
    danhMuc: 'chu-u',
    vatLieu: 'laminate',
    gia: 20500000,
    donVi: 'm dài',
    kichThuoc: '2.6m + 3.0m + 2.2m · Cao 2.4m',
    mau: ['#cfd8d3', '#4b5d57'],
    noiBat: true,
    moTa: 'Ba mặt bao quanh, tối ưu tam giác bếp cho gia đình nấu nướng nhiều, chứa được trên 40 món đồ bếp.',
    tienIch: ['Thùng gạo âm tủ', 'Ngăn chia dao thớt', 'Mặt đá Granite'],
  },
  {
    id: 'tb-d-04',
    ten: 'Bếp đảo Grand Oak',
    danhMuc: 'co-dao',
    vatLieu: 'go-soi',
    gia: 34000000,
    donVi: 'm dài',
    kichThuoc: 'Bếp 3.4m + đảo 1.8m × 0.9m',
    mau: ['#e2c89b', '#7a5a33'],
    noiBat: true,
    moTa: 'Đảo bếp gỗ sồi tự nhiên kiêm bàn ăn nhanh, phù hợp nhà phố và biệt thự có diện tích bếp từ 18m².',
    tienIch: ['Ổ điện âm đảo', 'Giá rượu tích hợp', 'Sơn PU 7 lớp'],
  },
  {
    id: 'tb-d-05',
    ten: 'Bếp đảo Noir Walnut',
    danhMuc: 'co-dao',
    vatLieu: 'go-oc-cho',
    gia: 48000000,
    donVi: 'm dài',
    kichThuoc: 'Bếp 3.8m + đảo 2.0m × 1.0m',
    mau: ['#8a6246', '#2f241c'],
    noiBat: false,
    moTa: 'Gỗ óc chó Bắc Mỹ vân thẳng, phối mặt đá nhân tạo trắng vân mây cho không gian bếp cao cấp.',
    tienIch: ['Vân gỗ liền mạch', 'Tủ kho cao 2.4m', 'Bảo hành 10 năm'],
  },
  {
    id: 'tb-l-06',
    ten: 'Tủ bếp chữ L Nordic',
    danhMuc: 'chu-l',
    vatLieu: 'laminate',
    gia: 15900000,
    donVi: 'm dài',
    kichThuoc: 'Dài 2.8m + 1.6m · Cao 2.2m',
    mau: ['#f1ece4', '#b9a68c'],
    noiBat: false,
    moTa: 'Phong cách Bắc Âu tối giản, tông sáng, chi phí hợp lý cho căn hộ 2 phòng ngủ.',
    tienIch: ['Thùng chống ẩm', 'Ray âm giảm chấn', 'Lắp đặt 2 ngày'],
  },
  {
    id: 'tb-i-07',
    ten: 'Tủ bếp chữ I Compact',
    danhMuc: 'chu-i',
    vatLieu: 'an-cuong',
    gia: 13500000,
    donVi: 'm dài',
    kichThuoc: 'Dài 2.4m · Cao 2.2m',
    mau: ['#dfd6c6', '#6b6257'],
    noiBat: false,
    moTa: 'Giải pháp cho bếp nhỏ dưới 6m², tủ trên kịch trần giúp tăng 30% sức chứa.',
    tienIch: ['Tủ trên kịch trần', 'Giá bát nâng hạ', 'Giao lắp toàn quốc'],
  },
  {
    id: 'pk-08',
    ten: 'Tủ rượu & tủ kho Aura',
    danhMuc: 'phu-kien',
    vatLieu: 'go-oc-cho',
    gia: 26000000,
    donVi: 'bộ',
    kichThuoc: 'Rộng 1.6m · Cao 2.4m · Sâu 0.4m',
    mau: ['#a97c50', '#3a2b20'],
    noiBat: false,
    moTa: 'Kết hợp tủ rượu kính và tủ kho khô, đặt nối tiếp bếp chính tạo mảng tường liền khối.',
    tienIch: ['Kính cường lực 5mm', 'Đèn hắt chân kệ', 'Khoá từ an toàn'],
  },
  {
    id: 'pk-09',
    ten: 'Combo phụ kiện bếp Blum',
    danhMuc: 'phu-kien',
    vatLieu: 'an-cuong',
    gia: 9800000,
    donVi: 'bộ',
    kichThuoc: 'Phù hợp bếp 3.0m – 4.0m',
    mau: ['#d9dde0', '#555f66'],
    noiBat: false,
    moTa: 'Trọn bộ ray hộp, giá bát nâng hạ, thùng gạo, ngăn chia dao thớt nhập khẩu chính hãng.',
    tienIch: ['Hàng chính hãng', 'Bảo hành 12 năm ray', 'Lắp trong ngày'],
  },
  {
    id: 'tb-u-10',
    ten: 'Tủ bếp chữ U Estate',
    danhMuc: 'chu-u',
    vatLieu: 'go-soi',
    gia: 39500000,
    donVi: 'm dài',
    kichThuoc: '3.0m + 3.4m + 2.4m · Cao 2.5m',
    mau: ['#e6d2ad', '#6a4f2e'],
    noiBat: true,
    moTa: 'Bếp gỗ sồi sơn màu mật ong, cánh soi chỉ tân cổ điển, dành cho biệt thự và nhà vườn.',
    tienIch: ['Cánh soi chỉ thủ công', 'Mặt đá Marble', 'Thiết kế 3D miễn phí'],
  },
];

export const QUY_TRINH = [
  { b: '01', ten: 'Khảo sát & đo đạc', mo: 'Kỹ thuật tới tận nơi đo kích thước, ghi nhận điện nước và thói quen nấu nướng.' },
  { b: '02', ten: 'Thiết kế 3D', mo: 'Dựng phối cảnh 3D, chốt vật liệu và phụ kiện trước khi báo giá chi tiết.' },
  { b: '03', ten: 'Sản xuất tại xưởng', mo: 'Cắt CNC, dán cạnh, lắp ráp và kiểm tra chất lượng từng module.' },
  { b: '04', ten: 'Lắp đặt & bàn giao', mo: 'Thi công 1–3 ngày, vệ sinh sạch, hướng dẫn sử dụng và bảo hành.' },
];

export const CAM_KET = [
  { ten: 'Xưởng sản xuất trực tiếp', mo: 'Không qua trung gian, giá tận xưởng, kiểm soát tiến độ theo ngày.' },
  { ten: 'Vật liệu có nguồn gốc', mo: 'An Cường, Blum, Hafele — đầy đủ chứng từ và tem chính hãng.' },
  { ten: 'Bảo hành 5–10 năm', mo: 'Bảo hành thùng tủ, cánh và phụ kiện theo từng dòng sản phẩm.' },
  { ten: 'Báo giá trong 24 giờ', mo: 'Gửi bản vẽ hoặc kích thước, nhận báo giá chi tiết từng hạng mục.' },
];

export function dinhDangGia(gia) {
  return new Intl.NumberFormat('vi-VN').format(gia) + '₫';
}

export function tenDanhMuc(id) {
  return DANH_MUC.find((d) => d.id === id)?.ten || id;
}

export function tenVatLieu(id) {
  return VAT_LIEU.find((v) => v.id === id)?.ten || id;
}
