// Ảnh minh hoạ dạng SVG sinh từ 2 mã màu của sản phẩm.
// Khi có ảnh thật, thêm trường `anh` vào data/sanPham.js — component tự ưu tiên ảnh đó.
export default function AnhSanPham({ sp, className = '', tyLe = 'aspect-[4/3]' }) {
  const [sang, dam] = sp.mau || ['#e2d6c3', '#5b4a36'];
  if (sp.anh) {
    return (
      <div className={`${tyLe} overflow-hidden ${className}`}>
        <img src={sp.anh} alt={sp.ten} loading="lazy" className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div className={`${tyLe} overflow-hidden ${className}`}>
      <svg viewBox="0 0 400 300" className="h-full w-full" role="img" aria-label={sp.ten}>
        <defs>
          <linearGradient id={`g-${sp.id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={sang} />
            <stop offset="100%" stopColor={dam} />
          </linearGradient>
        </defs>
        <rect width="400" height="300" fill={`url(#g-${sp.id})`} />
        {/* mặt bàn bếp */}
        <rect x="24" y="170" width="352" height="14" rx="4" fill="#ffffff" opacity="0.85" />
        {/* tủ dưới */}
        <g fill={dam} opacity="0.35">
          <rect x="30" y="188" width="104" height="86" rx="6" />
          <rect x="148" y="188" width="104" height="86" rx="6" />
          <rect x="266" y="188" width="104" height="86" rx="6" />
        </g>
        {/* tủ trên */}
        <g fill="#ffffff" opacity="0.28">
          <rect x="30" y="40" width="150" height="104" rx="6" />
          <rect x="196" y="40" width="174" height="60" rx="6" />
        </g>
        <g stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity="0.6">
          <line x1="70" y1="214" x2="94" y2="214" />
          <line x1="188" y1="214" x2="212" y2="214" />
          <line x1="306" y1="214" x2="330" y2="214" />
          <line x1="96" y1="120" x2="120" y2="120" />
        </g>
      </svg>
    </div>
  );
}
