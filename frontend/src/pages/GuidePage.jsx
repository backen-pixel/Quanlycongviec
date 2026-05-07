import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronDown, ChevronRight, ExternalLink, Zap, Target, FileText, ShoppingCart, Receipt, FolderKanban, Users, Settings, ArrowRight, CheckCircle2, Star, Lightbulb } from 'lucide-react';

const GUIDES = [
  {
    id: 'start',
    icon: '🚀',
    title: 'Bắt đầu nhanh',
    desc: 'Đăng nhập, làm quen giao diện, chuyển giữa Công việc & CRM',
    color: 'from-blue-500 to-cyan-500',
    steps: [
      {
        title: 'Đăng nhập hệ thống',
        content: 'Truy cập địa chỉ website → Nhập email và mật khẩu → Bấm "Đăng nhập".',
        tip: 'Tài khoản demo: admin@tubep.vn / admin123',
      },
      {
        title: 'Thanh menu bên trái (Sidebar)',
        content: 'Sidebar hiển thị tất cả chức năng, chia thành các nhóm:\n• 📊 Tổng quan: Dashboard, Việc của tôi\n• 🏢 Không gian làm việc: Dự án, Khách hàng, Sản phẩm\n• 🏗️ Hệ thống: Cấu trúc công ty, Nhân viên\n• ⚙️ Cài đặt: Phân quyền, Quy trình',
      },
      {
        title: 'Chuyển giữa Công việc & CRM',
        content: 'Góc trên trái sidebar có nút chuyển đổi (icon ô vuông 3x3):\n• Bấm → Hiện 2 app: "Công việc" và "CRM"\n• Chọn "CRM" → Sidebar đổi sang menu CRM\n• Chọn "Công việc" → Quay lại menu quản lý dự án',
        tip: 'CRM = Quản lý bán hàng. Công việc = Quản lý dự án & sản xuất.',
      },
      {
        title: 'Dashboard chính',
        content: 'Trang chủ hiển thị:\n• Tổng quan dự án đang chạy\n• Tabs theo Khối (Tư vấn, Thiết kế, Sản xuất...)\n• KPI: Sắp tới / Đang làm / Hoàn thành / Trễ hạn\n• Bộ lọc theo nhân viên, quy trình, thời gian',
        link: { to: '/', label: 'Vào Dashboard' },
      },
    ],
  },
  {
    id: 'crm-lead',
    icon: '💼',
    title: 'CRM: Tạo Lead → Chuyển Deal',
    desc: 'Tiếp nhận khách hàng mới, tư vấn, chuyển đổi thành Deal khi chốt',
    color: 'from-emerald-500 to-teal-500',
    steps: [
      {
        title: 'Bước 1: Vào CRM Dashboard',
        content: 'Chuyển sang app CRM (nút chuyển đổi trên sidebar) → Trang Dashboard CRM hiện ra với Kanban board.',
        link: { to: '/crm', label: 'Vào CRM' },
      },
      {
        title: 'Bước 2: Tạo Lead mới',
        content: 'Bấm nút "+ Thêm Lead" (góc trên phải) → Điền:\n• Tiêu đề: VD "Tủ bếp chữ L - Anh Minh"\n• Khách hàng: Chọn có sẵn hoặc tạo mới\n• Giá trị ước tính: VD 150,000,000\n• Nguồn: Zalo / Facebook / Website / Giới thiệu\n• Mức ưu tiên: Cao / Trung bình / Thấp\n→ Bấm "Lưu" → Lead xuất hiện ở cột đầu trên Kanban.',
      },
      {
        title: 'Bước 3: Di chuyển Lead qua các giai đoạn',
        content: 'Trên Kanban board: KÉO THẢ card lead sang cột tiếp theo.\nHoặc: Click vào lead → Trang chi tiết → Click vào bước trên thanh Pipeline Progress.\n\nCác giai đoạn Lead:\n  Mới → Liên hệ → Khảo sát → Đề xuất → Chuyển Deal ✅',
      },
      {
        title: 'Bước 4: Ghi hoạt động & tài liệu',
        content: 'Trong trang chi tiết Lead:\n• Tab "✅ Công việc": Xem tasks tự tạo theo giai đoạn\n• Tab "📋 Tài liệu": Upload file (bản vẽ, hình ảnh) hoặc nhập văn bản (yêu cầu KH, số đo)\n• Tab "💬 Hoạt động": Ghi lại gọi điện, gặp mặt, email, Zalo — chọn loại, nhập tiêu đề + nội dung + kết quả',
      },
      {
        title: 'Bước 5: Chuyển Lead → Deal ⚡',
        content: 'Khi khách hàng có nhu cầu rõ ràng, sẵn sàng báo giá:\n1. Vào trang chi tiết Lead\n2. Bấm nút "⚡ Chuyển Deal" (xanh lá, góc trên phải)\n3. Hệ thống kiểm tra: KH phải có TÊN + SĐT\n4. Bấm "🚀 Chuyển sang Deal" → Xác nhận\n\nKết quả:\n• Lead biến thành Deal (badge "🎯 DEAL")\n• Chuyển sang pipeline Deal mới\n• Tất cả tài liệu, hoạt động được giữ lại',
        tip: '⚠️ Chuyển đổi MỘT CHIỀU — không quay lại Lead được!',
      },
      {
        title: 'Bước 6: Quản lý Deal',
        content: 'Deal có pipeline riêng:\n  Tư vấn → Thiết kế → Báo giá → Hợp đồng → Thắng ✅ / Thua ❌\n\nKhi chuyển giai đoạn → hệ thống TỰ ĐỘNG tạo công việc phù hợp.\nVD: Chuyển sang "Thiết kế" → Tạo task "Khảo sát thực tế", "Lên bản vẽ 2D/3D"...',
      },
    ],
  },
  {
    id: 'crm-quotation',
    icon: '📄',
    title: 'CRM: Tạo Báo giá & Tìm sản phẩm',
    desc: 'Lập báo giá cho khách, tìm sản phẩm, xuất PDF',
    color: 'from-amber-500 to-orange-500',
    steps: [
      {
        title: 'Bước 1: Mở form tạo báo giá',
        content: 'Có 2 cách:\n• Cách 1 (từ Lead/Deal): Trong trang chi tiết → Bấm nút "📄 Báo giá" → Tự điền thông tin KH\n• Cách 2 (trực tiếp): Menu CRM → "Báo giá" → Bấm "+ Tạo báo giá"',
        link: { to: '/crm/quotations/new', label: 'Tạo báo giá mới' },
      },
      {
        title: 'Bước 2: Điền thông tin khách hàng',
        content: '• Chọn khách hàng từ danh sách (hoặc tạo mới)\n• Nhập tiêu đề báo giá: VD "Báo giá tủ bếp chữ L gỗ sồi"\n• Tên KH, SĐT, địa chỉ tự điền nếu chọn từ danh sách',
      },
      {
        title: 'Bước 3: Thêm sản phẩm — 3 CÁCH',
        content: '🔍 Cách 1 — Gõ trực tiếp:\nGõ tên SP vào ô "Tên hàng hóa" → Dropdown gợi ý hiện ra → Click chọn → Tự điền mã, giá, ĐVT\n\n🔍 Cách 2 — Tìm nâng cao:\nBấm nút "Tìm & thêm sản phẩm" → Modal popup hiện ra → Lọc theo nhóm ngành (Tủ bếp, Phụ kiện...) → Chọn nhiều SP → Bấm "Thêm"\n\n📝 Cách 3 — Nhập tay:\nBấm "Thêm dòng trống" → Nhập tên, giá, số lượng thủ công',
        tip: 'Cách 1 nhanh nhất — gõ 2-3 ký tự là thấy gợi ý!',
      },
      {
        title: 'Bước 4: Điền số lượng, giá, chiết khấu',
        content: 'Mỗi dòng sản phẩm điền:\n• SL (số lượng), Đơn giá → Thành tiền tự tính\n• CK% (chiết khấu dòng), %VAT (thuế)\n• Cao × Rộng × Dài (kích thước nếu cần)\n\nCuối bảng:\n• Chiết khấu tổng (% hoặc VNĐ)\n• Tổng cộng tự tính = Tiền hàng - CK + VAT',
      },
      {
        title: 'Bước 5: Điều khoản & Lưu',
        content: '• Hiệu lực đến: Ngày hết hạn báo giá\n• Điều khoản TT: Chọn có sẵn hoặc nhập tùy chỉnh\n  VD: "TT 50% ký HĐ, 50% bàn giao"\n• Ghi chú\n→ Bấm "💾 Lưu"',
      },
      {
        title: 'Bước 6: Gửi KH & Xuất PDF',
        content: '• Đổi trạng thái: 📝 Nháp → 📤 Đã gửi KH\n• Bấm "Xuất PDF" → Download file PDF gửi cho khách\n• Khi KH đồng ý: Đổi trạng thái → ✅ KH chấp nhận\n  → Hệ thống TỰ ĐỘNG tạo Đơn hàng + Dự án! 🚀',
        tip: 'Khi BG được chấp nhận, Auto-Flow tự tạo ĐH + Project — không cần làm thủ công!',
      },
    ],
  },
  {
    id: 'crm-order',
    icon: '💰',
    title: 'CRM: Đơn hàng → Hóa đơn → Thu tiền',
    desc: 'Quản lý đơn hàng, xuất hóa đơn, ghi nhận thanh toán',
    color: 'from-purple-500 to-pink-500',
    steps: [
      {
        title: 'Đơn hàng (dữ liệu cũ / luồng khác)',
        content: 'Tạo đơn hàng mới từ giao diện đã tắt.\nKhi báo giá được chấp nhận → hệ thống có thể tạo dự án (nếu deal chưa có dự án), không tạo đơn hàng tự động.\nXem và sửa đơn đã tồn tại tại menu Đơn hàng.',
        link: { to: '/crm/orders', label: 'Xem đơn hàng' },
      },
      {
        title: 'Cập nhật trạng thái đơn hàng',
        content: 'Vào chi tiết ĐH → Đổi trạng thái:\n• 📋 Mới → ✅ Xác nhận → 🏭 Đang SX → 🚚 Đang giao → ✅ Đã giao → ❌ Hủy\n\nKhi xác nhận ĐH → Auto-Flow tự tạo Dự án + Tasks (nếu chưa có).',
      },
      {
        title: 'Tạo Hóa đơn từ Đơn hàng',
        content: 'Trong chi tiết ĐH → Bấm nút "🧾 Tạo hóa đơn"\n→ Hóa đơn tạo tự động, copy toàn bộ SP + KH từ ĐH\n\nHoặc tạo thủ công: Menu CRM → "Hóa đơn" → "+ Tạo hóa đơn"',
        link: { to: '/crm/invoices', label: 'Xem hóa đơn' },
      },
      {
        title: 'Thu tiền — Ghi nhận thanh toán',
        content: 'Vào chi tiết Hóa đơn → Bấm "💵 Thu tiền":\n• Số tiền: Mặc định = số còn nợ\n• Hình thức: Chuyển khoản / Tiền mặt\n• Mã giao dịch / Ghi chú\n→ Bấm "Xác nhận thu"\n\nTiến độ thanh toán cập nhật:\n🔴 Chưa TT (0%) → 🟡 Một phần (1-99%) → 🟢 Đã TT đủ (100%)',
      },
      {
        title: 'Xuất PDF / In hóa đơn',
        content: '• Bấm "📥 Xuất PDF" → Download file PDF\n• Bấm "🖨️ In" → Mở cửa sổ in\n• Hóa đơn hiển thị: Thông tin công ty, KH, bảng SP, tổng tiền, đã thanh toán, còn nợ',
      },
    ],
  },
  {
    id: 'project',
    icon: '📁',
    title: 'Quản lý Dự án & Công việc',
    desc: 'Tạo dự án, phân công, theo dõi tiến độ qua Kanban',
    color: 'from-indigo-500 to-blue-500',
    steps: [
      {
        title: 'Dự án được tạo từ đâu?',
        content: 'TỰ ĐỘNG:\n• Báo giá chấp nhận → Auto tạo dự án\n• Đơn hàng xác nhận → Auto tạo dự án\n\nTHỦ CÔNG:\n• Deal đạt "Thắng" → Bấm "📁 Tạo dự án" trong chi tiết Deal\n• Menu Công việc → "Dự án" → "+ Tạo dự án"',
        link: { to: '/projects', label: 'Xem dự án' },
      },
      {
        title: 'Form tạo dự án',
        content: '1. Thông tin cơ bản:\n   • Tên dự án, Khách hàng, Địa chỉ lắp đặt\n   • Giá trị ước tính, Deadline, Mức ưu tiên\n\n2. Chọn Luồng công việc (Workflow):\n   • Chọn flow → Hiển thị các Khối (Tư vấn, Thiết kế, SX...)\n\n3. Chọn Template cho mỗi Khối:\n   • Mỗi Khối có bộ tasks mẫu → Chọn → Tasks sẽ được gen tự động\n\n4. Phân công nhân viên cho từng task',
        link: { to: '/projects/create', label: 'Tạo dự án mới' },
      },
      {
        title: 'Xem dự án — 3 chế độ hiển thị',
        content: '• 📋 Kanban: Cột theo trạng thái (Chờ / Đang làm / Xong)\n• 📃 Danh sách: Bảng dọc, dễ lọc\n• 📅 Kế hoạch: Kanban theo deadline (Quá hạn / Hôm nay / Tuần này / Tuần sau)',
      },
      {
        title: 'Chi tiết dự án — Các tab',
        content: 'Click vào dự án → Trang chi tiết với nhiều tab:\n• ✅ Nhiệm vụ: Xem tất cả tasks, cập nhật trạng thái\n• 🔄 Luồng: Timeline các Khối, phân công công ty\n• 📋 Tài liệu: Upload file, bản vẽ\n• ✅ Duyệt: Yêu cầu phê duyệt\n• 💬 Chat: Trao đổi theo phòng ban\n• 💰 Bán hàng: Liên kết CRM (BG, ĐH, HĐ)\n• 📜 Lịch sử: Log mọi thay đổi',
      },
      {
        title: 'Cập nhật task & chuyển giai đoạn',
        content: 'Mỗi task có:\n• Trạng thái: Chờ → Đang làm → Xong\n• Người phụ trách, Deadline, Mức ưu tiên\n• Checklist, ghi chú, đính kèm file\n\nKhi tasks của 1 Khối hoàn thành → Hệ thống gợi ý chuyển sang Khối tiếp theo.',
      },
      {
        title: 'Dashboard theo Khối',
        content: 'Menu → "Dashboard Khối" → Xem tổng quan theo từng Khối:\n• 4 KPI: Sắp tới / Đang thực hiện / Hoàn thành / Trễ hạn\n• Chi tiết theo Công ty\n• Chi tiết nhân viên theo quy trình\n• Bộ lọc: tìm kiếm, quy trình, nhân viên, thời gian',
        link: { to: '/dashboard/divisions', label: 'Dashboard Khối' },
      },
    ],
  },
];

function StepCard({ step, index, isLast }) {
  return (
    <div className="flex gap-4">
      {/* Timeline */}
      <div className="flex flex-col items-center shrink-0">
        <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shadow-md">
          {index + 1}
        </div>
        {!isLast && <div className="w-0.5 flex-1 bg-blue-200 mt-1" />}
      </div>
      {/* Content */}
      <div className={`flex-1 ${!isLast ? 'pb-6' : 'pb-2'}`}>
        <h4 className="text-sm font-bold text-gray-900 mb-2">{step.title}</h4>
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{step.content}</p>
          {step.tip && (
            <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">{step.tip}</p>
            </div>
          )}
          {step.link && (
            <Link to={step.link.to} className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">
              <ExternalLink className="h-3.5 w-3.5" /> {step.link.label}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function GuideSection({ guide, isOpen, onToggle }) {
  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-4 p-5 hover:bg-gray-50 transition-colors cursor-pointer text-left">
        <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${guide.color} flex items-center justify-center text-2xl shadow-md shrink-0`}>
          {guide.icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-gray-900">{guide.title}</h3>
          <p className="text-sm text-gray-500 mt-0.5">{guide.desc}</p>
          <p className="text-xs text-gray-400 mt-1">{guide.steps.length} bước</p>
        </div>
        {isOpen ? <ChevronDown className="h-5 w-5 text-gray-400 shrink-0" /> : <ChevronRight className="h-5 w-5 text-gray-400 shrink-0" />}
      </button>
      {isOpen && (
        <div className="px-5 pb-6 pt-0 border-t bg-gradient-to-b from-gray-50 to-white">
          <div className="mt-5">
            {guide.steps.map((step, i) => (
              <StepCard key={i} step={step} index={i} isLast={i === guide.steps.length - 1} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function GuidePage() {
  const [openId, setOpenId] = useState(null);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center py-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg mb-4">
          <BookOpen className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Hướng dẫn sử dụng</h1>
        <p className="text-sm text-gray-500 mt-2 max-w-lg mx-auto">
          Hướng dẫn từng bước sử dụng hệ thống TuBep Pro — từ tiếp nhận khách hàng đến hoàn thành dự án và thu tiền.
        </p>
      </div>

      {/* Flow Overview */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 p-6">
        <h2 className="text-sm font-bold text-blue-900 mb-4 flex items-center gap-2"><Zap className="h-4 w-4" /> LUỒNG TỔNG QUAN</h2>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {[
            { icon: '💼', label: 'Lead', sub: 'Cơ hội' },
            { icon: '🎯', label: 'Deal', sub: 'Đã chốt' },
            { icon: '📄', label: 'Báo giá', sub: 'Gửi KH' },
            { icon: '🛒', label: 'Đơn hàng', sub: 'Xác nhận' },
            { icon: '📁', label: 'Dự án', sub: 'Sản xuất' },
            { icon: '🧾', label: 'Hóa đơn', sub: 'Thanh toán' },
          ].map((item, i, arr) => (
            <div key={i} className="flex items-center gap-2">
              <div className="bg-white rounded-xl border shadow-sm p-3 text-center min-w-[80px]">
                <span className="text-xl">{item.icon}</span>
                <p className="text-xs font-bold text-gray-900 mt-1">{item.label}</p>
                <p className="text-[10px] text-gray-400">{item.sub}</p>
              </div>
              {i < arr.length - 1 && <ArrowRight className="h-4 w-4 text-blue-400 shrink-0" />}
            </div>
          ))}
        </div>
        <p className="text-xs text-blue-700 text-center mt-4 flex items-center justify-center gap-1">
          <Zap className="h-3 w-3" /> Nhiều bước được <strong>tự động hóa</strong> — BG chấp nhận → auto tạo ĐH + Dự án + Tasks
        </p>
      </div>

      {/* Guide Sections */}
      <div className="space-y-3">
        {GUIDES.map(guide => (
          <GuideSection
            key={guide.id}
            guide={guide}
            isOpen={openId === guide.id}
            onToggle={() => setOpenId(openId === guide.id ? null : guide.id)}
          />
        ))}
      </div>

      {/* Quick Links */}
      <div className="bg-white rounded-2xl border p-6">
        <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2"><Star className="h-4 w-4 text-amber-500" /> TRUY CẬP NHANH</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { to: '/crm', icon: Target, label: 'CRM Dashboard', color: 'text-emerald-600 bg-emerald-50' },
            { to: '/crm/quotations/new', icon: FileText, label: 'Tạo báo giá', color: 'text-amber-600 bg-amber-50' },
            { to: '/crm/orders', icon: ShoppingCart, label: 'Đơn hàng', color: 'text-blue-600 bg-blue-50' },
            { to: '/crm/invoices/new', icon: Receipt, label: 'Tạo hóa đơn', color: 'text-purple-600 bg-purple-50' },
            { to: '/projects', icon: FolderKanban, label: 'Dự án', color: 'text-indigo-600 bg-indigo-50' },
            { to: '/projects/create', icon: FolderKanban, label: 'Tạo dự án', color: 'text-teal-600 bg-teal-50' },
            { to: '/users', icon: Users, label: 'Nhân viên', color: 'text-gray-600 bg-gray-50' },
            { to: '/crm/pipeline-settings', icon: Settings, label: 'Cài đặt Pipeline', color: 'text-rose-600 bg-rose-50' },
          ].map(item => (
            <Link key={item.to} to={item.to} className={`flex items-center gap-2.5 p-3 rounded-xl border hover:shadow-md transition-all ${item.color}`}>
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center py-4">
        <p className="text-xs text-gray-400">TuBep Pro — Hệ thống quản lý công việc & bán hàng cho ngành tủ bếp</p>
      </div>
    </div>
  );
}
