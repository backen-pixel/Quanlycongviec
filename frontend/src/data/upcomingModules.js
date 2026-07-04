import {
  Megaphone, Globe, Smartphone, Package, Plug, Bot,
} from 'lucide-react';
import {
  CRM_MODULE_ICON,
  WORK_MODULE_ICON,
  SX_MODULE_ICON,
  VC_MODULE_ICON,
  KETOAN_MODULE_ICON,
  CALC_MODULE_ICON,
  KNOWLEDGE_MODULE_ICON,
} from '../lib/appSwitcherModules';

/** Icon 3D PNG dùng chung cho hero và thẻ modun */
export const MODULE_3D_ICONS = {
  crm: CRM_MODULE_ICON,
  work: WORK_MODULE_ICON,
  sx: SX_MODULE_ICON,
  vc: VC_MODULE_ICON,
  ketoan: KETOAN_MODULE_ICON,
  calc: CALC_MODULE_ICON,
  knowledge: KNOWLEDGE_MODULE_ICON,
};

/** @typedef {'all'|'production'|'sales'|'management'|'marketing'|'tech'} ModuleCategory */

export const MODULE_CATEGORIES = [
  { id: 'all', label: 'Tất cả' },
  { id: 'production', label: 'Sản xuất' },
  { id: 'sales', label: 'Kinh doanh' },
  { id: 'management', label: 'Quản lý' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'tech', label: 'Công nghệ' },
];

export const UPCOMING_MODULES = [
  {
    id: 'production',
    title: 'Xưởng Sản Xuất',
    description: 'Quản lý sản xuất, lệnh sản xuất và tiến độ xưởng trực quan.',
    features: ['Lệnh sản xuất', 'Kanban xưởng', 'Theo dõi tiến độ', 'Báo cáo năng suất', 'Phân công nhân sự'],
    price: '799.000',
    category: 'production',
    color: '#f97316',
    iconUrl: MODULE_3D_ICONS.sx,
    badge: 'bestSeller',
    featured: 1,
  },
  {
    id: 'crm',
    title: 'CRM',
    description: 'Quản lý khách hàng và quy trình bán hàng chuyên nghiệp.',
    features: ['Quản lý khách hàng 360°', 'Quy trình bán hàng', 'Chăm sóc khách hàng', 'Báo cáo doanh số'],
    price: '499.000',
    category: 'sales',
    color: '#3b82f6',
    iconUrl: MODULE_3D_ICONS.crm,
    badge: 'comingSoon',
    featured: 2,
  },
  {
    id: 'marketing',
    title: 'Marketing',
    description: 'Quản lý chiến dịch và leads hiệu quả.',
    features: ['Email / SMS marketing', 'Tự động hoá chiến dịch', 'Phân khúc khách hàng', 'Phân tích hiệu quả'],
    price: '399.000',
    category: 'marketing',
    color: '#ec4899',
    Icon: Megaphone,
    badge: 'comingSoon',
    featured: 3,
  },
  {
    id: 'website',
    title: 'Website',
    description: 'Xây dựng website chuyên nghiệp cho doanh nghiệp.',
    features: ['Chuẩn SEO', 'Giỏ hàng trực tuyến', 'Quản lý nội dung', 'Theo dõi lượt truy cập'],
    price: '699.000',
    category: 'marketing',
    color: '#22c55e',
    Icon: Globe,
    badge: 'comingSoon',
    featured: 4,
  },
  {
    id: 'mobile',
    title: 'Mobile App',
    description: 'Quản lý mọi lúc mọi nơi trên thiết bị di động.',
    features: ['iOS & Android', 'Thông báo đẩy', 'Quản lý đơn hàng', 'Báo cáo di động'],
    price: '299.000',
    category: 'tech',
    color: '#6366f1',
    iconUrl: MODULE_3D_ICONS.vc,
    badge: 'comingSoon',
    featured: 5,
  },
  {
    id: 'warehouse',
    title: 'Kho nâng cao',
    description: 'Quản lý kho hàng đa chi nhánh, đa vị trí.',
    features: ['Đa kho, đa chi nhánh', 'Quản lý vị trí kho', 'Tồn kho thông minh', 'Cảnh báo tồn kho'],
    price: '299.000',
    category: 'management',
    color: '#8b5cf6',
    iconUrl: MODULE_3D_ICONS.work,
    badge: 'comingSoon',
    featured: 6,
  },
  {
    id: 'accounting',
    title: 'Kế toán',
    description: 'Kế toán và báo cáo tài chính tích hợp.',
    features: ['Thu chi, công nợ', 'Quản lý công nợ', 'Báo cáo tài chính', 'Hoá đơn điện tử'],
    price: '599.000',
    category: 'management',
    color: '#14b8a6',
    iconUrl: MODULE_3D_ICONS.ketoan,
    badge: 'comingSoon',
    featured: 7,
  },
  {
    id: 'reports',
    title: 'Báo cáo nâng cao',
    description: 'Phân tích dữ liệu và báo cáo tuỳ biến.',
    features: ['Dashboard tuỳ chỉnh', 'Báo cáo đa chiều', 'Phân tích xu hướng', 'Xuất PDF / Excel'],
    price: '399.000',
    category: 'management',
    color: '#ef4444',
    iconUrl: MODULE_3D_ICONS.calc,
    badge: 'comingSoon',
    featured: 8,
  },
  {
    id: 'api',
    title: 'Tích hợp API',
    description: 'Kết nối hệ thống với bên thứ ba.',
    features: ['RESTful API', 'Webhook', 'Tích hợp bên thứ 3', 'Tài liệu API đầy đủ'],
    price: '499.000',
    category: 'tech',
    color: '#eab308',
    Icon: Plug,
    badge: 'comingSoon',
    featured: 9,
  },
  {
    id: 'ai',
    title: 'AI Trợ lý',
    description: 'Trợ lý thông minh hỗ trợ vận hành và ra quyết định.',
    features: ['Chat nội bộ AI', 'Gợi ý tác vụ', 'Phân tích nhanh', 'Tóm tắt báo cáo'],
    price: '899.000',
    category: 'tech',
    color: '#10b981',
    iconUrl: MODULE_3D_ICONS.knowledge,
    badge: 'new',
    featured: 10,
  },
];

/** Icon quanh dashboard — tọa độ % trong vùng orbit (giống ảnh mẫu 3D) */
export const HERO_SCENE_ICONS = [
  /* Căn theo 5 hex trên ảnh mẫu isometric — trái / phải quanh dashboard */
  { src: MODULE_3D_ICONS.sx, size: 72, x: '11%', y: '47%', glow: '#f97316', delay: 0, z: 14 },
  { src: MODULE_3D_ICONS.calc, size: 64, x: '21%', y: '21%', glow: '#a855f7', delay: 0.35, z: 12 },
  { src: MODULE_3D_ICONS.ketoan, size: 62, x: '15%', y: '67%', glow: '#3b82f6', delay: 0.7, z: 13 },
  { src: MODULE_3D_ICONS.work, size: 58, x: '74%', y: '17%', glow: '#c084fc', delay: 0.2, z: 11 },
  { src: MODULE_3D_ICONS.crm, size: 68, x: '89%', y: '45%', glow: '#4ade80', delay: 0.55, z: 15 },
  { src: MODULE_3D_ICONS.knowledge, size: 54, x: '69%', y: '71%', glow: '#2dd4bf', delay: 0.85, z: 10 },
];

/** @deprecated dùng HERO_SCENE_ICONS */
export const HERO_FLOATING_3D_ICONS = HERO_SCENE_ICONS;

export const MODULE_FAQ = [
  {
    q: 'Có dùng thử miễn phí không?',
    a: 'Mỗi modun sẽ có gói dùng thử 14 ngày khi ra mắt chính thức.',
  },
  {
    q: 'Nâng cấp modun thế nào?',
    a: 'Bạn có thể bật/tắt modun theo nhu cầu, chỉ trả phí modun đang dùng.',
  },
  {
    q: 'Dữ liệu có an toàn không?',
    a: 'Dữ liệu mã hoá, sao lưu định kỳ và phân quyền chi tiết theo vai trò.',
  },
  {
    q: 'Dùng trên mobile được không?',
    a: 'Hầu hết modun hỗ trợ web responsive và app di động riêng.',
  },
];

export function filterModules(modules, category, sort) {
  let list = category === 'all' ? modules : modules.filter((m) => m.category === category);
  if (sort === 'featured') {
    list = [...list].sort((a, b) => a.featured - b.featured);
  } else if (sort === 'price-asc') {
    list = [...list].sort((a, b) => parseInt(a.price.replace(/\./g, ''), 10) - parseInt(b.price.replace(/\./g, ''), 10));
  } else if (sort === 'price-desc') {
    list = [...list].sort((a, b) => parseInt(b.price.replace(/\./g, ''), 10) - parseInt(a.price.replace(/\./g, ''), 10));
  } else if (sort === 'name') {
    list = [...list].sort((a, b) => a.title.localeCompare(b.title, 'vi'));
  }
  return list;
}
