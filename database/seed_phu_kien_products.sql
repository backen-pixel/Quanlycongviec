-- ═══════════════════════════════════════════════════════════════════════
-- SEED: Phụ kiện tủ bếp & tủ áo — 8 nhóm phân loại
-- CHỈ các mã sản phẩm từ danh mục gốc, KHÔNG thêm dữ liệu ảo
-- ═══════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════
-- BƯỚC 1: Tạo sub-categories cho Phụ kiện
-- ══════════════════════════════════════

INSERT INTO product_categories (name, slug, order_index)
VALUES ('Phụ kiện bếp', 'phu-kien-bep', 2)
ON CONFLICT DO NOTHING;

INSERT INTO product_categories (name, slug, order_index)
VALUES ('Phụ kiện tủ áo', 'phu-kien-tu-ao', 8)
ON CONFLICT DO NOTHING;

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
-- BƯỚC 2: INSERT SẢN PHẨM (chỉ mã gốc)
-- ══════════════════════════════════════

-- ─── 1. Giá Nâng Hạ & Điện Thông Minh ───
INSERT INTO products (code, name, unit, selling_price, base_price, dimensions, material, category_id, status) VALUES
('ESP9970Pro', 'Giá nâng hạ điện ESP Pro - tủ 700', 'bộ', 24270000, 22060000, '"700"', 'Inox 304 + Điện', (SELECT id FROM product_categories WHERE slug='gia-nang-ha-dien'), 'active'),
('ESP9990Pro', 'Giá nâng hạ điện ESP Pro - tủ 900', 'bộ', 26860000, 24420000, '"900"', 'Inox 304 + Điện', (SELECT id FROM product_categories WHERE slug='gia-nang-ha-dien'), 'active'),
('ESL9870', 'Giá nâng hạ điện ESL - tủ 700', 'bộ', 19580000, 17800000, '"700"', 'Inox 304 + Điện', (SELECT id FROM product_categories WHERE slug='gia-nang-ha-dien'), 'active'),
('ESL9890', 'Giá nâng hạ điện ESL - tủ 900', 'bộ', 21650000, 19680000, '"900"', 'Inox 304 + Điện', (SELECT id FROM product_categories WHERE slug='gia-nang-ha-dien'), 'active'),
('ESV8960Pro', 'Giá gia vị điện Pro - tủ 600', 'bộ', 23460000, 21330000, '"600"', 'Inox 304 + Điện', (SELECT id FROM product_categories WHERE slug='gia-nang-ha-dien'), 'active'),
('ESL8890', 'Giá gia vị điện tiêu chuẩn - tủ 900', 'bộ', 16330000, 14840000, '"900"', 'Inox 304 + Điện', (SELECT id FROM product_categories WHERE slug='gia-nang-ha-dien'), 'active')
ON CONFLICT (code) DO NOTHING;

-- ─── 2. Giá Bát Đĩa (Tủ Trên) ───
INSERT INTO products (code, name, unit, selling_price, base_price, dimensions, material, category_id, status) VALUES
('EPO9360LX', 'Giá bát di động nan oval LX - tủ 900', 'bộ', 11800000, 10730000, '"900"', 'Inox Nan Oval', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active'),
('EPO8360VX', 'Giá bát cố định nan oval VX - tủ 800', 'bộ', 3090000, 2810000, '"800"', 'Inox Nan Oval', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active'),
('EV1960LG', 'Giá bát di động nan dẹt LG - tủ 900', 'bộ', 10860000, 9870000, '"900"', 'Inox Nan Dẹt', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active'),
('EPD8260VX', 'Giá bát cố định nan dẹt VX - tủ 800', 'bộ', 2440000, 2220000, '"800"', 'Inox Nan Dẹt', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active'),
('EUT9160VX', 'Giá bát di động nan tròn VX - tủ 900', 'bộ', 9150000, 8320000, '"900"', 'Inox Nan Tròn', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active'),
('EUV8560', 'Giá bát di động nan chữ V - tủ 800', 'bộ', 860000, 780000, '"800"', 'Inox Nan Chữ V', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active'),
('EUM9060', 'Giá bát nâng hạ nhôm anode - tủ 900', 'bộ', 8530000, 7750000, '"900"', 'Nhôm Anode', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active'),
('EUM6060', 'Giá bát cố định nhôm anode - tủ 600', 'bộ', 7390000, 6720000, '"600"', 'Nhôm Anode', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active'),
('EUB6560', 'Giá bát cố định hộp - tủ 600', 'bộ', 3500000, 3180000, '"600"', 'Inox Hộp', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active'),
('EUB450', 'Giá bát để bàn - tủ 500', 'bộ', 2720000, 2470000, '"500"', 'Inox Hộp', (SELECT id FROM product_categories WHERE slug='gia-bat-dia'), 'active')
ON CONFLICT (code) DO NOTHING;

-- ─── 3. Giá Xoong Nồi, Dao Thớt, Gia Vị ───
INSERT INTO products (code, name, unit, selling_price, base_price, dimensions, material, category_id, status) VALUES
('EPO4325VX', 'Giá xoong nồi nan oval 304 - tủ 250', 'bộ', 4540000, 4130000, '"250"', 'Inox 304 Nan Oval', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active'),
('EPO6360VX', 'Giá xoong nồi nan oval 304 - tủ 600', 'bộ', 5420000, 4930000, '"600"', 'Inox 304 Nan Oval', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active'),
('EPD5220VX', 'Giá xoong nồi nan dẹt 304 - tủ 200', 'bộ', 3190000, 2900000, '"200"', 'Inox 304 Nan Dẹt', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active'),
('EPD6260VX', 'Giá xoong nồi nan dẹt 304 - tủ 600', 'bộ', 4430000, 4030000, '"600"', 'Inox 304 Nan Dẹt', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active'),
('ERV4420VX', 'Giá xoong nan vuông 304 - tủ 400', 'bộ', 3320000, 3020000, '"400"', 'Inox 304 Nan Vuông', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active'),
('EGT6160VX', 'Giá gia vị nan tròn 304 - tủ 600', 'bộ', 2460000, 2240000, '"600"', 'Inox 304 Nan Tròn', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active'),
('EUM2030', 'Giá gia vị nhôm anode - tủ 200', 'bộ', 2230000, 2030000, '"200"', 'Nhôm Anode', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active'),
('EUB5520', 'Giá xoong inox hộp - tủ 500', 'bộ', 4650000, 4230000, '"500"', 'Inox Hộp', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active'),
('EUB7560', 'Giá xoong inox hộp - tủ 700', 'bộ', 6300000, 5730000, '"700"', 'Inox Hộp', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active'),
('ETR2625', 'Giá để tẩy rửa - tủ 250', 'bộ', 1760000, 1600000, '"250"', 'Inox 304', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active'),
('EGSL300', 'Khay gầm chậu - tủ 300', 'bộ', 2180000, 1980000, '"300"', 'Inox 304', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active'),
('ETR2880', 'Giá để tẩy rửa - tủ 800', 'bộ', 3580000, 3260000, '"800"', 'Inox 304', (SELECT id FROM product_categories WHERE slug='gia-xoong-noi'), 'active')
ON CONFLICT (code) DO NOTHING;

-- ─── 4. Tủ Kho, Mâm Xoay, Giá Góc ───
INSERT INTO products (code, name, unit, selling_price, base_price, dimensions, material, category_id, status) VALUES
('EKO13445', 'Tủ kho đa chất liệu - tủ 450', 'bộ', 20610000, 18740000, '"450"', 'Inox + Nhôm', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active'),
('EKD12445', 'Tủ kho đa chất liệu - tủ 450', 'bộ', 8240000, 7490000, '"450"', 'Inox 304', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active'),
('EUM6L450', 'Tủ kho nhôm anode - tủ 450', 'bộ', 14200000, 12910000, '"450"', 'Nhôm Anode', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active'),
('EKL23160', 'Tủ kho kéo liên hoàn - tủ 600', 'bộ', 17190000, 15630000, '"600"', 'Inox 304', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active'),
('EKR15440', 'Tủ kho cánh rút - tủ 400', 'bộ', 12500000, 11360000, '"400"', 'Inox + Nhựa', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active'),
('EKX10640', 'Tủ kho kéo độc lập - tủ 400', 'bộ', 2200000, 2000000, '"400"', 'Inox', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active'),
('ELO101L', 'Giá liên hoàn góc - tủ 900', 'bộ', 12830000, 11660000, '"900"', 'Inox Nan Oval', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active'),
('ELD101L', 'Giá liên hoàn góc - tủ 1000', 'bộ', 11430000, 10390000, '"1000"', 'Inox Nan Dẹt', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active'),
('EUM101', 'Giá liên hoàn góc nhôm - tủ 900', 'bộ', 12100000, 11000000, '"900"', 'Nhôm Anode', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active'),
('EXL18080', 'Mâm xoay 180° - tủ 800', 'bộ', 2900000, 2640000, '"800"', 'Inox + Nhựa', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active'),
('EXT27080', 'Mâm xoay 270° - tủ 800', 'bộ', 7800000, 7090000, '"800"', 'Inox + Nhựa', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active'),
('EXL202L', 'Mâm xoay hình lá - tủ 700', 'bộ', 9460000, 8600000, '"700"', 'Inox + Nhựa', (SELECT id FROM product_categories WHERE slug='tu-kho-mam-xoay'), 'active')
ON CONFLICT (code) DO NOTHING;

-- ─── 5. Thùng Gạo, Rác & Khay Chia ───
INSERT INTO products (code, name, unit, selling_price, base_price, dimensions, material, category_id, status) VALUES
('S300T', 'Thùng gạo thông minh', 'cái', 2390000, 2170000, '"300"', 'Nhựa + Inox', (SELECT id FROM product_categories WHERE slug='thung-gao-rac'), 'active'),
('GC300B', 'Thùng gạo gương', 'cái', 5800000, 5270000, '"300"', 'Kính + Inox', (SELECT id FROM product_categories WHERE slug='thung-gao-rac'), 'active'),
('GB250W', 'Thùng gạo âm tủ', 'cái', 9460000, 8600000, '"250"', 'Nhựa + Inox', (SELECT id FROM product_categories WHERE slug='thung-gao-rac'), 'active'),
('EBL300', 'Thùng rác gắn cánh - tủ 300', 'cái', 960000, 870000, '"300"', 'Nhựa', (SELECT id FROM product_categories WHERE slug='thung-gao-rac'), 'active'),
('ERT101', 'Thùng rác âm tủ', 'cái', 2800000, 2540000, '"350"', 'Nhựa + Inox', (SELECT id FROM product_categories WHERE slug='thung-gao-rac'), 'active'),
('ERA300', 'Thùng rác âm tủ - tủ 300', 'cái', 1500000, 1360000, '"300"', 'Nhựa', (SELECT id FROM product_categories WHERE slug='thung-gao-rac'), 'active'),
('EA450', 'Thùng rác âm tủ - tủ 450', 'cái', 6350000, 5770000, '"450"', 'Nhựa + Inox', (SELECT id FROM product_categories WHERE slug='thung-gao-rac'), 'active'),
('ETC450G', 'Khay chia thìa nĩa nhựa - tủ 450', 'cái', 550000, 500000, '"450"', 'Nhựa', (SELECT id FROM product_categories WHERE slug='thung-gao-rac'), 'active'),
('ETC410A', 'Khay chia thìa nĩa nhôm - tủ 400', 'cái', 1800000, 1640000, '"400"', 'Nhôm', (SELECT id FROM product_categories WHERE slug='thung-gao-rac'), 'active'),
('ETC645A', 'Khay chia thìa nĩa inox - tủ 600', 'cái', 4230000, 3840000, '"600"', 'Inox 304', (SELECT id FROM product_categories WHERE slug='thung-gao-rac'), 'active')
ON CONFLICT (code) DO NOTHING;

-- ─── 6. Chậu Rửa & Vòi Rửa ───
INSERT INTO products (code, name, unit, selling_price, base_price, dimensions, material, category_id, status) VALUES
('EUC15848EA', 'Chậu rửa bát chống xước - 580x480', 'cái', 6270000, 5700000, '"580x480"', 'Inox 304 Chống Xước', (SELECT id FROM product_categories WHERE slug='chau-rua-voi'), 'active'),
('EUD27848GA', 'Chậu rửa bát liền khối - 780x480', 'cái', 8500000, 7730000, '"780x480"', 'Inox 304 Liền Khối', (SELECT id FROM product_categories WHERE slug='chau-rua-voi'), 'active'),
('EUP39850', 'Chậu rửa bát cao cấp - 980x500', 'cái', 9980000, 9070000, '"980x500"', 'Inox 304 Premium', (SELECT id FROM product_categories WHERE slug='chau-rua-voi'), 'active'),
('BR114', 'Bát rác chậu rửa Ø114', 'cái', 130000, 118000, '"Ø114"', 'Inox 304', (SELECT id FROM product_categories WHERE slug='chau-rua-voi'), 'active'),
('ESA11', 'Xi phông chậu rửa', 'cái', 350000, 318000, '"Tiêu chuẩn"', 'Nhựa + Inox', (SELECT id FROM product_categories WHERE slug='chau-rua-voi'), 'active'),
('EVF016M', 'Vòi rửa bát cố định', 'cái', 1890000, 1720000, '"1 Nóng-Lạnh"', 'Đồng mạ Chrome', (SELECT id FROM product_categories WHERE slug='chau-rua-voi'), 'active'),
('EUF120BR', 'Vòi rửa bát dây rút', 'cái', 3200000, 2910000, '"1 Nóng-Lạnh"', 'Đồng mạ Chrome', (SELECT id FROM product_categories WHERE slug='chau-rua-voi'), 'active'),
('EUF515DR', 'Vòi rửa bát đồng cao cấp dây rút', 'cái', 5550000, 5040000, '"1 Nóng-Lạnh"', 'Đồng nguyên chất', (SELECT id FROM product_categories WHERE slug='chau-rua-voi'), 'active')
ON CONFLICT (code) DO NOTHING;

-- ─── 7. Phụ Kiện Tủ Áo (Premium) ───
INSERT INTO products (code, name, unit, selling_price, base_price, dimensions, material, category_id, status) VALUES
('EUA22160', 'Giá trang sức tủ áo - 600', 'bộ', 1950000, 1770000, '"600"', 'Nhôm + Inox', (SELECT id FROM product_categories WHERE slug='pk-tu-ao-premium'), 'active'),
('EUA22460', 'Giá vắt quần tủ áo - 600', 'bộ', 4200000, 3820000, '"600"', 'Nhôm + Inox', (SELECT id FROM product_categories WHERE slug='pk-tu-ao-premium'), 'active'),
('EUA22260', 'Giá đồ gấp tủ áo - 600', 'bộ', 9010000, 8190000, '"600"', 'Nhôm', (SELECT id FROM product_categories WHERE slug='pk-tu-ao-premium'), 'active'),
('EUA228270', 'Giá treo góc tủ áo - 800', 'bộ', 2980000, 2710000, '"800"', 'Nhôm + Inox', (SELECT id FROM product_categories WHERE slug='pk-tu-ao-premium'), 'active'),
('EAS1200G', 'Giá nâng hạ quần áo - 1200', 'bộ', 17550000, 15950000, '"1200"', 'Nhôm + Inox', (SELECT id FROM product_categories WHERE slug='pk-tu-ao-premium'), 'active'),
('EAG1080', 'Giá di động tủ áo - 1000', 'bộ', 5500000, 5000000, '"1000"', 'Nhôm', (SELECT id FROM product_categories WHERE slug='pk-tu-ao-premium'), 'active'),
('EAB1440', 'Cầu là âm tủ áo', 'bộ', 24180000, 21980000, '"Đa dạng"', 'Nhôm + Vải', (SELECT id FROM product_categories WHERE slug='pk-tu-ao-premium'), 'active'),
('ECA2219', 'Gương xoay tủ áo', 'cái', 3200000, 2910000, '"Đa dạng"', 'Kính + Nhôm', (SELECT id FROM product_categories WHERE slug='pk-tu-ao-premium'), 'active'),
('EUT102', 'Thang đa năng tủ áo', 'cái', 5500000, 5000000, '"Đa dạng"', 'Nhôm', (SELECT id FROM product_categories WHERE slug='pk-tu-ao-premium'), 'active'),
('ETT01B', 'Thanh treo quần áo oval', 'cái', 52000, 47000, '"Đa dạng"', 'Inox Oval', (SELECT id FROM product_categories WHERE slug='pk-tu-ao-premium'), 'active')
ON CONFLICT (code) DO NOTHING;

-- ─── 8. Phụ Kiện Cơ Bản ───
INSERT INTO products (code, name, unit, selling_price, base_price, dimensions, material, category_id, status) VALUES
('EWP101', 'Bản lề giảm chấn', 'cái', 35000, 32000, '"Tải 40kg"', 'Thép mạ Niken', (SELECT id FROM product_categories WHERE slug='pk-co-ban'), 'active'),
('ESD125', 'Ray trượt bi giảm chấn', 'đôi', 120000, 109000, '265mm', 'Thép mạ kẽm', (SELECT id FROM product_categories WHERE slug='pk-co-ban'), 'active'),
('PT80N', 'Pittông giảm chấn 80N', 'cái', 45000, 41000, '265mm', 'Thép + Khí nén', (SELECT id FROM product_categories WHERE slug='pk-co-ban'), 'active'),
('A332', 'Bánh xe tủ ngăn kéo', 'cái', 10000, 9000, '"Đa dạng"', 'Nhựa + Thép', (SELECT id FROM product_categories WHERE slug='pk-co-ban'), 'active')
ON CONFLICT (code) DO NOTHING;
