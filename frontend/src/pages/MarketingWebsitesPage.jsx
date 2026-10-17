import WebsitesPanel from '../components/WebsitesPanel';

/**
 * Module Marketing → Website.
 * Danh sách các website công ty đang vận hành (bepviet, landing chiến dịch…).
 * Sản phẩm của từng site quản lý ở trang "Sản phẩm website".
 */
export default function MarketingWebsitesPage() {
  return (
    <div className="p-4 md:p-6">
      <header className="mb-5">
        <h1 className="text-xl font-bold text-gray-900 md:text-2xl">Website</h1>
        <p className="mt-1 text-sm text-gray-600">
          Mỗi website có một mã site riêng. Site tĩnh đặt <code>VITE_SITE_KEY</code> bằng mã đó để lấy dữ liệu.
        </p>
      </header>
      <WebsitesPanel />
    </div>
  );
}
