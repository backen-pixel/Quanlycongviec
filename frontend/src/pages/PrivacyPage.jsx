export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto py-10 px-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Chính sách quyền riêng tư</h1>
      <div className="prose prose-sm text-gray-700 space-y-4">
        <p><strong>TuBep Pro CRM</strong> cam kết bảo vệ quyền riêng tư của người dùng.</p>
        
        <h2 className="text-lg font-semibold mt-6">1. Thông tin thu thập</h2>
        <p>Chúng tôi thu thập thông tin cần thiết để cung cấp dịch vụ quản lý công việc và CRM, bao gồm:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Tên, email, số điện thoại khi đăng ký tài khoản</li>
          <li>Tin nhắn Facebook Messenger khi khách hàng liên hệ qua Page</li>
          <li>Thông tin từ Facebook Lead Ads khi khách hàng submit form</li>
        </ul>

        <h2 className="text-lg font-semibold mt-6">2. Mục đích sử dụng</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Quản lý và theo dõi khách hàng tiềm năng (Lead/Deal)</li>
          <li>Phản hồi tin nhắn và yêu cầu của khách hàng</li>
          <li>Quản lý quy trình công việc nội bộ</li>
        </ul>

        <h2 className="text-lg font-semibold mt-6">3. Bảo mật dữ liệu</h2>
        <p>Dữ liệu được lưu trữ an toàn trên hệ thống Supabase với mã hóa SSL. Chỉ nhân viên được ủy quyền mới có quyền truy cập.</p>

        <h2 className="text-lg font-semibold mt-6">4. Chia sẻ dữ liệu</h2>
        <p>Chúng tôi không bán hoặc chia sẻ dữ liệu cá nhân với bên thứ ba, trừ khi có yêu cầu pháp lý.</p>

        <h2 className="text-lg font-semibold mt-6">5. Quyền của người dùng</h2>
        <p>Bạn có quyền yêu cầu xem, sửa hoặc xóa dữ liệu cá nhân bằng cách liên hệ admin@tubep.vn.</p>

        <h2 className="text-lg font-semibold mt-6">6. Xóa dữ liệu Facebook</h2>
        <p>Để yêu cầu xóa dữ liệu liên quan đến Facebook, vui lòng liên hệ admin@tubep.vn. Chúng tôi sẽ xử lý trong vòng 30 ngày.</p>

        <p className="text-gray-400 text-xs mt-8">Cập nhật lần cuối: 01/04/2026</p>
      </div>
    </div>
  );
}
