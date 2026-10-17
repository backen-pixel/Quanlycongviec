import WebsiteProductsPanel from '../components/WebsiteProductsPanel';

/**
 * Module Marketing → Sản phẩm website.
 * Quản lý mẫu tủ bếp hiển thị trên website bán hàng (static site riêng, đọc qua
 * /api/public/web/products). Không liên quan trang /products — đó là danh mục
 * thành phẩm nội bộ cho báo giá và sản xuất.
 */
export default function MarketingWebProductsPage() {
  return (
    <div className="p-4 md:p-6">
      <header className="mb-5">
        <h1 className="text-xl font-bold text-gray-900 md:text-2xl">Sản phẩm website</h1>
        <p className="mt-1 text-sm text-gray-600">
          Mẫu tủ bếp hiển thị trên website bán hàng. Tắt "Hiển thị" là ẩn khỏi web mà vẫn giữ lại ở đây.
        </p>
      </header>
      <WebsiteProductsPanel />
    </div>
  );
}
