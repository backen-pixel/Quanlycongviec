-- ═══════════════════════════════════════════════════════════════════════
-- SEED: Phụ kiện tủ bếp & tủ áo — 8 nhóm phân loại + ~120 sản phẩm
-- Chạy SAU khi đã chạy 21_product_categories.sql
-- ═══════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════
-- BƯỚC 1: Tạo sub-categories cho Phụ kiện
-- ══════════════════════════════════════

-- Lấy ID của category cha "Phụ kiện bếp"
DO $$ DECLARE parent_cat UUID; BEGIN
  SELECT id INTO parent_cat FROM product_categories WHERE slug = 'phu-kien-bep' LIMIT 1;
  IF parent_cat IS NULL THEN
    INSERT INTO product_categories (name, slug, order_index) VALUES ('Phụ kiện bếp', 'phu-kien-bep', 2) RETURNING id INTO parent_cat;
  END IF;
END $$;

-- Thêm sub-category "Phụ kiện tủ áo" nếu chưa có
INSERT INTO product_categories (name, slug, order_index)
VALUES ('Phụ kiện tủ áo', 'phu-kien-tu-ao', 8)
ON CONFLICT DO NOTHING;

-- Tạo 8 nhóm phân loại phụ kiện (dùng parent_id liên kết)
INSERT INTO product_categories (name, slug, description, parent_id, order_index) VALUES
  ('Giá nâng hạ & Điện thông minh', 'gia-nang-ha-dien', 'Giá nâng hạ điện ESP, ESL, giá gia vị điện', (SELECT id FROM product_categories WHERE slug='phu-kien-bep'), 1),
  ('Giá bát đĩa (Tủ trên)', 'gia-bat-dia', 'Di động, cố định, nan oval, nan dẹt, nan tròn, nhôm anode', (SELECT id FROM product_categories WHERE slug='phu-kien-bep'), 2),
  ('Giá xoong nồi, dao thớt, gia vị', 'gia-xoong-noi', 'Inox nan oval/dẹt/vuông/tròn 304, nhôm anode', (SELECT id FROM product_categories WHERE slug='phu-kien-bep'), 3),
  ('Tủ kho, mâm xoay, giá góc', 'tu-kho-mam-xoay', 'Tủ kho 4-6 tầng, mâm xoay 180-360°, giá liên hoàn', (SELECT id FROM product_categories WHERE slug='phu-kien-bep'), 4),
  ('Thùng gạo, rác & khay chia', 'thung-gao-rac', 'Thùng gạo thông minh, thùng rác âm tủ, khay chia thìa nĩa', (SELECT id FROM product_categories WHERE slug='phu-kien-bep'), 5),
  ('Chậu rửa & vòi rửa', 'chau-rua-voi', 'Chậu rửa bát, phụ kiện chậu, vòi rửa bát', (SELECT id FROM product_categories WHERE slug='phu-kien-bep'), 6),
  ('Phụ kiện tủ áo (Premium)', 'pk-tu-ao-premium', 'Giá trang sức, vắt quần, giày, gương, cầu là', (SELECT id FROM product_categories WHERE slug='phu-kien-tu-ao'), 7),
  ('Phụ kiện cơ bản', 'pk-co-ban', 'Bản lề, ray trượt, pittong, bánh xe', (SELECT id FROM product_categories WHERE slug='phu-kien-bep'), 8)
ON CONFLICT DO NOTHING;


-- ══════════════════════════════════════
-- BƯỚC 2: INSERT SẢN PHẨM
-- ══════════════════════════════════════

-- ─── 1. Giá Nâng Hạ & Điện Thông Minh ───
INSERT INTO products (code, name, unit, selling_price, base_price, dimensions, material, category_id, status, description) VALUES
-- Giá nâng hạ điện ESP (Pro)
('ESP9970Pro', 'Giá nâng hạ điện ESP Pro - 700mm', 'bộ', 24270000, 22060000, '700mm', 'Inox 304 + Điện', (SELECT id FROM product_categories WHERE slug='gia-nang-ha-dien'), 'active', 'Giá nâng hạ điện cao cấp ESP Pro, tải trọng lớn, vận hành êm'),
('ESP9980Pro', 'Giá nâng hạ điện ESP Pro - 800mm', 'bộ', 25570000, 23240000, '800mm', 'Inox 304 + Điện', (SELECT id FROM product_categories WHERE slug='gia-nang-ha-dien'), 'active', 'Giá nâng hạ điện cao cấp ESP Pro 800mm'),
('ESP9990Pro', 'Giá nâng hạ điện ESP Pro - 900mm', 'bộ', 26860000, 24420000, '900mm', 'Inox 304 + Điện', (SELECT id FROM product_categories WHERE slug='gia-nang-ha-dien'), 'active', 'Giá nâng hạ điện cao cấp ESP Pro 900mm'),
-- Giá nâng hạ điện ESL
('ESL9870', 'Giá nâng hạ điện ESL - 700mm', 'bộ', 19580000, 17800000, '700mm', 'Inox 304 + Điện', (SELECT id FROM product_categories WHERE slug='gia-nang-ha-dien'), 'active', 'Giá nâng hạ điện ESL tiêu chuẩn 700mm'),
('ESL9880', 'Giá nâng hạ điện ESL - 800mm', 'bộ', 20620000, 18740000, '800mm', 'Inox 304 + Điện', (SELECT id FROM product_categories WHERE slug='gia-nang-ha-dien'), 'active', 'Giá nâng hạ điện ESL tiêu chuẩn 800mm'),
('ESL9890', 'Giá nâng hạ điện ESL - 900mm', 'bộ', 21650000, 19680000, '900mm', 'Inox 304 + Điện', (SELECT id FROM product_categories WHERE slug='gia-nang-ha-dien'), 'active', 'Giá nâng hạ điện ESL tiêu chuẩn 900mm'),
-- Giá gia vị điện
('ESV8960Pro', 'Giá gia vị điện Pro - 600mm', 'bộ', 23460000, 21330000, '600mm', 'Inox 304 + Điện', (SELECT id FROM product_categories WHERE slug='gia-nang-ha-dien'), 'active', 'Giá gia vị điện Pro cao cấp 600mm'),
('ESV8970Pro', 'Giá gia vị điện Pro - 700mm', 'bộ', 21500000, 19540000, '700mm', 'Inox 304 + Điện', (SELECT id FROM product_categories WHERE slug='gia-nang-ha-dien'), 'active', 'Giá gia vị điện Pro cao cấp 700mm'),
('ESL8890', 'Giá gia vị điện tiêu chuẩn - 900mm', 'bộ', 16330000, 14840000, '900mm', 'Inox 304 + Điện', (SELECT id FROM product_categories WHERE slug='gia-nang-ha-dien'), 'active', 'Giá gia vị điện tiêu chuẩn 900mm'),
('ESL8870', 'Giá gia vị điện tiêu chuẩn - 700mm', 'bộ', 17500000, 15900000, '700mm', 'Inox 304 + Điện', (SELECT id FROM product_categories WHERE slug='gia-nang-ha-dien'), 'active', 'Giá gia vị điện tiêu chuẩn 700mm')
ON CONFLICT (code) DO NOTHING;

-- ─── 2. Giá Bát Đĩa (Tủ Trên) ───
INSERT INTO products (code, name, unit, selling_price, base_price, dimensions, material, category_id, status, description) VALUES
-- Di động / Cố định Nan Oval
('EPO9360LX', 'Giá bát di động nan oval LX - 900mm', 'bộ', 11800000, 10720000, '900mm', 'Inox Nan Oval', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active', 'Giá bát đĩa di động nan oval cao cấp LX 900mm'),
('EPO8360VX', 'Giá bát cố định nan oval VX - 800mm', 'bộ', 9500000, 8630000, '800mm', 'Inox Nan Oval', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active', 'Giá bát đĩa cố định nan oval VX 800mm'),
('EPO7360LX', 'Giá bát di động nan oval LX - 700mm', 'bộ', 7200000, 6540000, '700mm', 'Inox Nan Oval', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active', 'Giá bát đĩa di động nan oval LX 700mm'),
('EPO6360LX', 'Giá bát di động nan oval LX - 600mm', 'bộ', 3090000, 2810000, '600mm', 'Inox Nan Oval', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active', 'Giá bát đĩa di động nan oval LX 600mm'),
-- Di động / Cố định Nan Dẹt
('EV1960LG', 'Giá bát di động nan dẹt LG - 900mm', 'bộ', 10860000, 9870000, '900mm', 'Inox Nan Dẹt', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active', 'Giá bát đĩa di động nan dẹt LG 900mm'),
('EPD8260VX', 'Giá bát cố định nan dẹt VX - 800mm', 'bộ', 8500000, 7720000, '800mm', 'Inox Nan Dẹt', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active', 'Giá bát đĩa cố định nan dẹt VX 800mm'),
('EPD7260VX', 'Giá bát cố định nan dẹt VX - 700mm', 'bộ', 5800000, 5270000, '700mm', 'Inox Nan Dẹt', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active', 'Giá bát cố định nan dẹt VX 700mm'),
('EPD6260VX', 'Giá bát cố định nan dẹt VX - 600mm', 'bộ', 2440000, 2220000, '600mm', 'Inox Nan Dẹt', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active', 'Giá bát cố định nan dẹt VX 600mm'),
-- Di động Nan Tròn / Chữ V
('EUT9160VX', 'Giá bát di động nan tròn VX - 900mm', 'bộ', 9150000, 8320000, '900mm', 'Inox Nan Tròn', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active', 'Giá bát đĩa di động nan tròn VX 900mm'),
('EUV8560', 'Giá bát di động nan chữ V - 800mm', 'bộ', 7600000, 6900000, '800mm', 'Inox Nan Chữ V', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active', 'Giá bát đĩa di động nan chữ V 800mm'),
('EUT7160VX', 'Giá bát di động nan tròn VX - 700mm', 'bộ', 4200000, 3820000, '700mm', 'Inox Nan Tròn', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active', 'Giá bát di động nan tròn VX 700mm'),
('EUT6160VX', 'Giá bát di động nan tròn VX - 600mm', 'bộ', 860000, 780000, '600mm', 'Inox Nan Tròn', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active', 'Giá bát di động nan tròn VX 600mm'),
-- Nâng hạ / Cố định Nhôm Anode
('EUM9060', 'Giá bát nâng hạ nhôm anode - 900mm', 'bộ', 8530000, 7750000, '900mm', 'Nhôm Anode', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active', 'Giá bát đĩa nâng hạ nhôm anode 900mm'),
('EUM6060', 'Giá bát cố định nhôm anode - 600mm', 'bộ', 7390000, 6710000, '600mm', 'Nhôm Anode', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active', 'Giá bát đĩa cố định nhôm anode 600mm'),
('EUM7060', 'Giá bát nâng hạ nhôm anode - 700mm', 'bộ', 7860000, 7140000, '700mm', 'Nhôm Anode', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active', 'Giá bát nâng hạ nhôm anode 700mm'),
-- Giá bát cố định hộp / Để bàn
('EUB6560', 'Giá bát cố định hộp - 600mm', 'bộ', 3500000, 3180000, '600mm', 'Inox Hộp', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active', 'Giá bát cố định hộp inox 600mm'),
('EUB450', 'Giá bát để bàn - 500mm', 'bộ', 2720000, 2470000, '500mm', 'Inox Hộp', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active', 'Giá bát để bàn inox 500mm'),
('EUB9560', 'Giá bát cố định hộp - 900mm', 'bộ', 3200000, 2910000, '900mm', 'Inox Hộp', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active', 'Giá bát cố định hộp inox 900mm')
ON CONFLICT (code) DO NOTHING;

-- ─── 3. Giá Xoong Nồi, Dao Thớt, Gia Vị ───
INSERT INTO products (code, name, unit, selling_price, base_price, dimensions, material, category_id, status, description) VALUES
-- Inox Nan Oval 304
('EPO4325VX', 'Giá xoong nồi nan oval 304 - 250mm', 'bộ', 4540000, 4130000, '250mm', 'Inox 304 Nan Oval', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active', 'Giá xoong nồi inox nan oval 304 tủ dưới 250mm'),
('EPO6360VX', 'Giá xoong nồi nan oval 304 - 600mm', 'bộ', 5420000, 4930000, '600mm', 'Inox 304 Nan Oval', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active', 'Giá xoong nồi inox nan oval 304 tủ dưới 600mm'),
('EPO5340VX', 'Giá dao thớt nan oval 304 - 400mm', 'bộ', 4980000, 4530000, '400mm', 'Inox 304 Nan Oval', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active', 'Giá dao thớt inox nan oval 304 tủ dưới 400mm'),
-- Inox Nan Dẹt 304
('EPD5220VX', 'Giá xoong nồi nan dẹt 304 - 200mm', 'bộ', 3190000, 2900000, '200mm', 'Inox 304 Nan Dẹt', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active', 'Giá xoong nồi inox nan dẹt 304 200mm'),
('EPD6260VX', 'Giá xoong nồi nan dẹt 304 - 600mm', 'bộ', 4430000, 4030000, '600mm', 'Inox 304 Nan Dẹt', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active', 'Giá xoong nồi inox nan dẹt 304 600mm'),
('EPD9280VX', 'Giá gia vị nan dẹt 304 - 900mm', 'bộ', 3800000, 3450000, '900mm', 'Inox 304 Nan Dẹt', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active', 'Giá gia vị inox nan dẹt 304 900mm'),
('EPD4240VX', 'Giá dao thớt nan dẹt 304 - 400mm', 'bộ', 3550000, 3230000, '400mm', 'Inox 304 Nan Dẹt', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active', 'Giá dao thớt nan dẹt 304 400mm'),
-- Inox Nan Vuông / Nan Tròn
('ERV4420VX', 'Giá xoong nan vuông 304 - 400mm', 'bộ', 3320000, 3020000, '400mm', 'Inox 304 Nan Vuông', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active', 'Giá xoong nồi inox nan vuông 304 400mm'),
('EGT6160VX', 'Giá gia vị nan tròn 304 - 600mm', 'bộ', 2460000, 2240000, '600mm', 'Inox 304 Nan Tròn', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active', 'Giá gia vị inox nan tròn 304 600mm'),
('ERV9420VX', 'Giá xoong nan vuông 304 - 900mm', 'bộ', 2890000, 2630000, '900mm', 'Inox 304 Nan Vuông', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active', 'Giá xoong nồi inox nan vuông 304 900mm'),
-- Nhôm Anode / Inox Hộp
('EUM2030', 'Giá gia vị nhôm anode - 200mm', 'bộ', 2230000, 2030000, '200mm', 'Nhôm Anode', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active', 'Giá gia vị nhôm anode 200mm'),
('EUB5520', 'Giá xoong inox hộp - 500mm', 'bộ', 4650000, 4230000, '500mm', 'Inox Hộp', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active', 'Giá xoong nồi inox hộp 500mm'),
('EUB7560', 'Giá xoong inox hộp - 700mm', 'bộ', 6300000, 5730000, '700mm', 'Inox Hộp', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active', 'Giá xoong nồi inox hộp 700mm'),
-- Giá để tẩy rửa / Khay gầm chậu
('ETR2625', 'Giá để tẩy rửa - 250mm', 'bộ', 1760000, 1600000, '250mm', 'Inox 304', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active', 'Giá để tẩy rửa dưới chậu 250mm'),
('EGSL300', 'Khay gầm chậu - 300mm', 'bộ', 2180000, 1980000, '300mm', 'Inox 304', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active', 'Khay gầm chậu rửa 300mm'),
('ETR2880', 'Giá để tẩy rửa - 800mm', 'bộ', 3580000, 3250000, '800mm', 'Inox 304', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active', 'Giá để tẩy rửa dưới chậu 800mm')
ON CONFLICT (code) DO NOTHING;

-- ─── 4. Tủ Kho, Mâm Xoay, Giá Góc ───
INSERT INTO products (code, name, unit, selling_price, base_price, dimensions, material, category_id, status, description) VALUES
-- Tủ kho 4-6 tầng
('EKO13445', 'Tủ kho 6 tầng đa năng - 450mm', 'bộ', 20610000, 18740000, '450mm', 'Inox + Nhôm', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active', 'Tủ kho 6 tầng đa năng, ray giảm chấn 450mm'),
('EKD12445', 'Tủ kho 5 tầng inox - 450mm', 'bộ', 17500000, 15910000, '450mm', 'Inox 304', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active', 'Tủ kho 5 tầng inox 304 450mm'),
('EUM6L450', 'Tủ kho 4 tầng nhôm anode - 450mm', 'bộ', 14200000, 12910000, '450mm', 'Nhôm Anode', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active', 'Tủ kho 4 tầng nhôm anode 450mm'),
('EKO10445', 'Tủ kho 4 tầng đa năng - 400mm', 'bộ', 8240000, 7490000, '400mm', 'Inox + Nhôm', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active', 'Tủ kho 4 tầng đa năng 400mm'),
('EKD10600', 'Tủ kho 5 tầng inox - 600mm', 'bộ', 19200000, 17450000, '600mm', 'Inox 304', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active', 'Tủ kho 5 tầng inox 304 600mm'),
-- Tủ kho kéo độc lập / Cánh rút
('EKL23160', 'Tủ kho kéo liên hoàn 3 tầng - 600mm', 'bộ', 17190000, 15630000, '600mm', 'Inox 304', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active', 'Tủ kho kéo liên hoàn 3 tầng 600mm'),
('EKR15440', 'Tủ kho cánh rút 5 tầng - 400mm', 'bộ', 12500000, 11360000, '400mm', 'Inox + Nhựa', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active', 'Tủ kho cánh rút 5 tầng 400mm'),
('EKX10640', 'Tủ kho kéo độc lập - 400mm', 'bộ', 2200000, 2000000, '400mm', 'Inox', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active', 'Tủ kho kéo độc lập đơn 400mm'),
-- Giá liên hoàn góc
('ELO101L', 'Giá liên hoàn góc nan oval - 900mm', 'bộ', 12830000, 11660000, '900mm', 'Inox Nan Oval', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active', 'Giá liên hoàn góc L nan oval 900mm'),
('ELD101L', 'Giá liên hoàn góc nan dẹt - 1000mm', 'bộ', 11430000, 10390000, '1000mm', 'Inox Nan Dẹt', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active', 'Giá liên hoàn góc nan dẹt 1000mm'),
('EUM101', 'Giá liên hoàn góc nhôm anode - 900mm', 'bộ', 12100000, 11000000, '900mm', 'Nhôm Anode', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active', 'Giá liên hoàn góc nhôm anode 900mm'),
-- Mâm xoay
('EXL18080', 'Mâm xoay 180° - 800mm', 'bộ', 5200000, 4730000, '800mm', 'Inox + Nhựa', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active', 'Mâm xoay 180 độ tủ dưới 800mm'),
('EXT27080', 'Mâm xoay 270° - 800mm', 'bộ', 7800000, 7090000, '800mm', 'Inox + Nhựa', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active', 'Mâm xoay 270 độ tủ dưới 800mm'),
('EXL36090', 'Mâm xoay 360° - 900mm', 'bộ', 9460000, 8600000, '900mm', 'Inox + Nhựa', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active', 'Mâm xoay 360 độ tủ dưới 900mm'),
('EXL202L', 'Mâm xoay hình lá - 700mm', 'bộ', 2900000, 2640000, '700mm', 'Inox + Nhựa', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active', 'Mâm xoay hình lá tủ góc 700mm')
ON CONFLICT (code) DO NOTHING;

-- ─── 5. Thùng Gạo, Rác & Khay Chia ───
INSERT INTO products (code, name, unit, selling_price, base_price, dimensions, material, category_id, status, description) VALUES
-- Thùng gạo
('S300T', 'Thùng gạo thông minh 1 ngăn - 300mm', 'cái', 2390000, 2170000, '300mm', 'Nhựa + Inox', (SELECT id FROM product_categories WHERE slug='thung-gao-rac'), 'active', 'Thùng gạo thông minh 1 ngăn tự động mở 300mm'),
('GC300B', 'Thùng gạo gương 2 ngăn - 300mm', 'cái', 5800000, 5270000, '300mm', 'Kính + Inox', (SELECT id FROM product_categories WHERE slug='thung-gao-rac'), 'active', 'Thùng gạo gương cao cấp 2 ngăn 300mm'),
('GB250W', 'Thùng gạo âm tủ 1 ngăn - 250mm', 'cái', 3500000, 3180000, '250mm', 'Nhựa + Inox', (SELECT id FROM product_categories WHERE slug='thung-gao-rac'), 'active', 'Thùng gạo âm tủ 1 ngăn 250mm'),
('S450T', 'Thùng gạo thông minh 2 ngăn - 450mm', 'cái', 9460000, 8600000, '450mm', 'Nhựa + Inox', (SELECT id FROM product_categories WHERE slug='thung-gao-rac'), 'active', 'Thùng gạo thông minh 2 ngăn 450mm'),
-- Thùng rác
('EBL300', 'Thùng rác gắn cánh 1 ngăn - 300mm', 'cái', 960000, 870000, '300mm', 'Nhựa', (SELECT id FROM product_categories WHERE slug='thung-gao-rac'), 'active', 'Thùng rác gắn cánh tủ 1 ngăn 300mm'),
('ERT101', 'Thùng rác âm tủ 2 ngăn - 350mm', 'cái', 2800000, 2540000, '350mm', 'Nhựa + Inox', (SELECT id FROM product_categories WHERE slug='thung-gao-rac'), 'active', 'Thùng rác âm tủ 2 ngăn phân loại 350mm'),
('ERA300', 'Thùng rác âm tủ 1 ngăn - 300mm', 'cái', 1500000, 1360000, '300mm', 'Nhựa', (SELECT id FROM product_categories WHERE slug='thung-gao-rac'), 'active', 'Thùng rác âm tủ 1 ngăn 300mm'),
('EA450', 'Thùng rác âm tủ 3 ngăn - 450mm', 'cái', 6350000, 5770000, '450mm', 'Nhựa + Inox', (SELECT id FROM product_categories WHERE slug='thung-gao-rac'), 'active', 'Thùng rác âm tủ 3 ngăn phân loại 450mm'),
-- Khay chia thìa nĩa
('ETC450G', 'Khay chia thìa nĩa nhựa - 450mm', 'cái', 550000, 500000, '450mm', 'Nhựa ABS', (SELECT id FROM product_categories WHERE slug='thung-gao-rac'), 'active', 'Khay chia thìa nĩa nhựa cao cấp 450mm'),
('ETC410A', 'Khay chia thìa nĩa nhôm - 400mm', 'cái', 1800000, 1640000, '400mm', 'Nhôm Anode', (SELECT id FROM product_categories WHERE slug='thung-gao-rac'), 'active', 'Khay chia thìa nĩa nhôm anode 400mm'),
('ETC645A', 'Khay chia thìa nĩa inox - 600mm', 'cái', 2500000, 2270000, '600mm', 'Inox 304', (SELECT id FROM product_categories WHERE slug='thung-gao-rac'), 'active', 'Khay chia thìa nĩa inox 304 600mm'),
('ETC1000A', 'Khay chia thìa nĩa inox - 1000mm', 'cái', 4230000, 3840000, '1000mm', 'Inox 304', (SELECT id FROM product_categories WHERE slug='thung-gao-rac'), 'active', 'Khay chia thìa nĩa inox 304 1000mm')
ON CONFLICT (code) DO NOTHING;

-- ─── 6. Chậu Rửa & Vòi Rửa ───
INSERT INTO products (code, name, unit, selling_price, base_price, dimensions, material, category_id, status, description) VALUES
-- Chậu rửa bát
('EUC15848EA', 'Chậu rửa 1 hộc chống xước - 580x480', 'cái', 6270000, 5700000, '580x480mm', 'Inox 304 Chống Xước', (SELECT id FROM product_categories WHERE slug='chau-rua-voi'), 'active', 'Chậu rửa bát 1 hộc inox 304 chống xước 580x480mm'),
('EUD27848GA', 'Chậu rửa 2 hộc liền khối - 780x480', 'cái', 8500000, 7730000, '780x480mm', 'Inox 304 Liền Khối', (SELECT id FROM product_categories WHERE slug='chau-rua-voi'), 'active', 'Chậu rửa bát 2 hộc liền khối inox 304 780x480mm'),
('EUP39850', 'Chậu rửa 2 hộc cao cấp - 980x500', 'cái', 9980000, 9070000, '980x500mm', 'Inox 304 Premium', (SELECT id FROM product_categories WHERE slug='chau-rua-voi'), 'active', 'Chậu rửa bát 2 hộc cao cấp inox 304 980x500mm'),
('EUC18060', 'Chậu rửa 1 hộc + bàn - 800x500', 'cái', 7500000, 6820000, '800x500mm', 'Inox 304', (SELECT id FROM product_categories WHERE slug='chau-rua-voi'), 'active', 'Chậu rửa bát 1 hộc + bàn rửa inox 304 800x500mm'),
-- Phụ kiện chậu
('BR114', 'Bát rác chậu rửa Ø114', 'cái', 130000, 118000, 'Ø114mm', 'Inox 304', (SELECT id FROM product_categories WHERE slug='chau-rua-voi'), 'active', 'Bát rác chậu rửa đường kính 114mm'),
('ESA11', 'Xi phông chậu rửa', 'cái', 350000, 318000, 'Tiêu chuẩn', 'Nhựa + Inox', (SELECT id FROM product_categories WHERE slug='chau-rua-voi'), 'active', 'Xi phông thoát nước chậu rửa bát'),
('ETHOATNUOC', 'Bộ thoát nước chậu đôi', 'bộ', 860000, 780000, 'Đa dạng', 'Inox 304', (SELECT id FROM product_categories WHERE slug='chau-rua-voi'), 'active', 'Bộ thoát nước cho chậu rửa đôi'),
-- Vòi rửa bát
('EVF016M', 'Vòi rửa bát cố định - 1 đường nước', 'cái', 1890000, 1720000, '1 Nóng-Lạnh', 'Đồng mạ Chrome', (SELECT id FROM product_categories WHERE slug='chau-rua-voi'), 'active', 'Vòi rửa bát cố định 1 đường nước nóng lạnh'),
('EUF120BR', 'Vòi rửa bát dây rút - 2 chế độ', 'cái', 3200000, 2910000, '1 Nóng-Lạnh', 'Đồng mạ Chrome', (SELECT id FROM product_categories WHERE slug='chau-rua-voi'), 'active', 'Vòi rửa bát dây rút 2 chế độ phun'),
('EUF515DR', 'Vòi rửa bát đồng cao cấp dây rút', 'cái', 5550000, 5040000, '1 Nóng-Lạnh', 'Đồng nguyên chất', (SELECT id FROM product_categories WHERE slug='chau-rua-voi'), 'active', 'Vòi rửa bát đồng nguyên chất cao cấp dây rút'),
('EUF310M', 'Vòi rửa bát inox cố định', 'cái', 2500000, 2270000, '1 Nóng-Lạnh', 'Inox 304', (SELECT id FROM product_categories WHERE slug='chau-rua-voi'), 'active', 'Vòi rửa bát inox 304 cố định')
ON CONFLICT (code) DO NOTHING;

-- ─── 7. Phụ Kiện Tủ Áo (Premium) ───
INSERT INTO products (code, name, unit, selling_price, base_price, dimensions, material, category_id, status, description) VALUES
-- Giá trang sức, vắt quần, đồ gấp, giày
('EUA22160', 'Giá để giày tủ áo - 600mm', 'bộ', 3500000, 3180000, '600mm', 'Nhôm + Inox', (SELECT id FROM product_categories WHERE slug='pk-tu-ao-premium'), 'active', 'Giá để giày tủ quần áo 600mm'),
('EUA22460', 'Giá vắt quần tủ áo - 600mm', 'bộ', 4200000, 3820000, '600mm', 'Nhôm + Inox', (SELECT id FROM product_categories WHERE slug='pk-tu-ao-premium'), 'active', 'Giá vắt quần kéo tủ quần áo 600mm'),
('EUA22260', 'Giá gấp đồ tủ áo - 600mm', 'bộ', 1950000, 1770000, '600mm', 'Nhôm', (SELECT id FROM product_categories WHERE slug='pk-tu-ao-premium'), 'active', 'Giá gấp đồ tủ quần áo 600mm'),
('EUA22360', 'Giá trang sức tủ áo - 600mm', 'bộ', 5800000, 5270000, '600mm', 'Nhôm + Kính', (SELECT id FROM product_categories WHERE slug='pk-tu-ao-premium'), 'active', 'Giá trang sức kèm gương tủ áo 600mm'),
('EUA22960', 'Giá để giày tủ áo - 900mm', 'bộ', 9010000, 8190000, '900mm', 'Nhôm + Inox', (SELECT id FROM product_categories WHERE slug='pk-tu-ao-premium'), 'active', 'Giá để giày cao cấp tủ quần áo 900mm'),
-- Giá treo góc, nâng hạ, di động
('EUA228270', 'Giá treo góc tủ áo - 270°', 'bộ', 7500000, 6820000, '800mm', 'Nhôm + Inox', (SELECT id FROM product_categories WHERE slug='pk-tu-ao-premium'), 'active', 'Giá treo góc xoay 270 độ tủ áo'),
('EAS1200G', 'Giá nâng hạ quần áo - 1200mm', 'bộ', 17550000, 15950000, '1200mm', 'Nhôm + Inox', (SELECT id FROM product_categories WHERE slug='pk-tu-ao-premium'), 'active', 'Giá nâng hạ quần áo cao cấp 1200mm'),
('EAG1080', 'Giá di động tủ áo - 1000mm', 'bộ', 2980000, 2710000, '1000mm', 'Nhôm', (SELECT id FROM product_categories WHERE slug='pk-tu-ao-premium'), 'active', 'Giá di động tủ quần áo 1000mm'),
('EAS900G', 'Giá nâng hạ quần áo - 900mm', 'bộ', 12500000, 11360000, '900mm', 'Nhôm + Inox', (SELECT id FROM product_categories WHERE slug='pk-tu-ao-premium'), 'active', 'Giá nâng hạ quần áo cao cấp 900mm'),
-- Gương, cầu là, thang, thanh treo
('EAB1440', 'Bàn là (cầu là) âm tủ', 'bộ', 24180000, 21980000, 'Đa dạng', 'Nhôm + Vải', (SELECT id FROM product_categories WHERE slug='pk-tu-ao-premium'), 'active', 'Cầu là / bàn là âm tủ quần áo cao cấp'),
('ECA2219', 'Gương xoay tủ áo', 'cái', 3200000, 2910000, 'Đa dạng', 'Kính + Nhôm', (SELECT id FROM product_categories WHERE slug='pk-tu-ao-premium'), 'active', 'Gương xoay gắn bên trong tủ quần áo'),
('EUT102', 'Thang đa năng tủ áo', 'cái', 5500000, 5000000, 'Đa dạng', 'Nhôm', (SELECT id FROM product_categories WHERE slug='pk-tu-ao-premium'), 'active', 'Thang đa năng gấp gọn tủ quần áo'),
('ETT01B', 'Thanh treo quần áo - Oval', 'cái', 52000, 47000, 'Đa dạng', 'Inox Oval', (SELECT id FROM product_categories WHERE slug='pk-tu-ao-premium'), 'active', 'Thanh treo quần áo oval inox')
ON CONFLICT (code) DO NOTHING;

-- ─── 8. Phụ Kiện Cơ Bản ───
INSERT INTO products (code, name, unit, selling_price, base_price, dimensions, material, category_id, status, description) VALUES
('EWP101', 'Bản lề giảm chấn tiêu chuẩn', 'cái', 35000, 32000, 'Tải 40kg', 'Thép mạ Niken', (SELECT id FROM product_categories WHERE slug='pk-co-ban'), 'active', 'Bản lề giảm chấn tiêu chuẩn tải 40kg'),
('EWP201', 'Bản lề giảm chấn cao cấp', 'cái', 65000, 59000, 'Tải 40kg', 'Thép mạ Niken', (SELECT id FROM product_categories WHERE slug='pk-co-ban'), 'active', 'Bản lề giảm chấn cao cấp tải 40kg'),
('EWP301', 'Bản lề góc 165° giảm chấn', 'cái', 85000, 77000, 'Tải 40kg', 'Thép mạ Niken', (SELECT id FROM product_categories WHERE slug='pk-co-ban'), 'active', 'Bản lề góc mở 165 độ giảm chấn'),
('ESD125', 'Ray trượt bi giảm chấn - 250mm', 'đôi', 120000, 109000, '250mm', 'Thép mạ kẽm', (SELECT id FROM product_categories WHERE slug='pk-co-ban'), 'active', 'Ray trượt bi giảm chấn 3 tầng 250mm'),
('ESD145', 'Ray trượt bi giảm chấn - 450mm', 'đôi', 180000, 164000, '450mm', 'Thép mạ kẽm', (SELECT id FROM product_categories WHERE slug='pk-co-ban'), 'active', 'Ray trượt bi giảm chấn 3 tầng 450mm'),
('ESD155', 'Ray trượt bi giảm chấn - 550mm', 'đôi', 220000, 200000, '550mm', 'Thép mạ kẽm', (SELECT id FROM product_categories WHERE slug='pk-co-ban'), 'active', 'Ray trượt bi giảm chấn 3 tầng 550mm'),
('PT80N', 'Pittong giảm chấn 80N', 'cái', 45000, 41000, '265mm', 'Thép + Khí nén', (SELECT id FROM product_categories WHERE slug='pk-co-ban'), 'active', 'Pittong hơi giảm chấn lực 80N'),
('PT100N', 'Pittong giảm chấn 100N', 'cái', 55000, 50000, '265mm', 'Thép + Khí nén', (SELECT id FROM product_categories WHERE slug='pk-co-ban'), 'active', 'Pittong hơi giảm chấn lực 100N'),
('PT120N', 'Pittong giảm chấn 120N', 'cái', 65000, 59000, '265mm', 'Thép + Khí nén', (SELECT id FROM product_categories WHERE slug='pk-co-ban'), 'active', 'Pittong hơi giảm chấn lực 120N'),
('A332', 'Bánh xe tủ ngăn kéo', 'cái', 10000, 9000, 'Đa dạng', 'Nhựa + Thép', (SELECT id FROM product_categories WHERE slug='pk-co-ban'), 'active', 'Bánh xe nhỏ cho ngăn kéo tủ bếp'),
('A440', 'Bánh xe tủ lớn có khóa', 'cái', 35000, 32000, 'Đa dạng', 'Cao su + Thép', (SELECT id FROM product_categories WHERE slug='pk-co-ban'), 'active', 'Bánh xe lớn có khóa cho tủ di động'),
('ETY100', 'Tay nắm tủ inox 100mm', 'cái', 25000, 23000, '100mm', 'Inox 304', (SELECT id FROM product_categories WHERE slug='pk-co-ban'), 'active', 'Tay nắm tủ inox 304 chiều dài 100mm'),
('ETY200', 'Tay nắm tủ inox 200mm', 'cái', 45000, 41000, '200mm', 'Inox 304', (SELECT id FROM product_categories WHERE slug='pk-co-ban'), 'active', 'Tay nắm tủ inox 304 chiều dài 200mm'),
('ETY300', 'Tay nắm tủ nhôm 300mm', 'cái', 65000, 59000, '300mm', 'Nhôm Anode', (SELECT id FROM product_categories WHERE slug='pk-co-ban'), 'active', 'Tay nắm tủ nhôm anode chiều dài 300mm'),
('ECD450', 'Chân đế tủ bếp - 450mm', 'cái', 85000, 77000, '450mm', 'Nhựa + Nhôm', (SELECT id FROM product_categories WHERE slug='pk-co-ban'), 'active', 'Chân đế tủ bếp điều chỉnh được 450mm'),
('EGK100', 'Gioăng kính tủ - 1m', 'mét', 15000, 14000, '1000mm', 'Silicone', (SELECT id FROM product_categories WHERE slug='pk-co-ban'), 'active', 'Gioăng kính cánh tủ bếp silicone'),
('ERH350', 'Ray hộp giảm chấn 350mm', 'đôi', 350000, 318000, '350mm', 'Thép mạ kẽm', (SELECT id FROM product_categories WHERE slug='pk-co-ban'), 'active', 'Ray hộp giảm chấn cao cấp 350mm'),
('ERH500', 'Ray hộp giảm chấn 500mm', 'đôi', 440000, 400000, '500mm', 'Thép mạ kẽm', (SELECT id FROM product_categories WHERE slug='pk-co-ban'), 'active', 'Ray hộp giảm chấn cao cấp 500mm')
ON CONFLICT (code) DO NOTHING;


-- ══════════════════════════════════════
-- THỐNG KÊ: Kiểm tra kết quả
-- ══════════════════════════════════════
-- Chạy riêng sau khi insert:
-- SELECT c.name AS "Nhóm", COUNT(p.id) AS "Số SP" 
-- FROM product_categories c 
-- LEFT JOIN products p ON p.category_id = c.id 
-- WHERE c.parent_id IS NOT NULL 
-- GROUP BY c.name ORDER BY c.order_index;
