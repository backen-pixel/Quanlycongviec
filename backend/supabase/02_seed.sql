-- Seed data — Chạy sau 01_migration.sql
-- Tất cả password: admin123

INSERT INTO workflow_stages (name,slug,description,order_index,color,icon) VALUES
('Tư vấn','consulting','Tiếp nhận, khảo sát',1,'#8B5CF6','MessageSquare'),
('Thiết kế','design','Thiết kế 2D/3D',2,'#EC4899','Palette'),
('Báo giá','quotation','Lập báo giá',3,'#F59E0B','Calculator'),
('Hợp đồng','contract','Ký HĐ, thu cọc',4,'#10B981','FileText'),
('Sản xuất','production','CNC, lắp ráp, sơn',5,'#F97316','Hammer'),
('Vận chuyển','shipping','Đóng gói, giao hàng',6,'#06B6D4','Truck'),
('Lắp đặt','installation','Lắp đặt, nghiệm thu',7,'#3B82F6','Wrench'),
('Chăm sóc KH','customer-care','Bảo hành',8,'#EF4444','Heart');

INSERT INTO departments (name,slug,description,color) VALUES
('Ban Giám đốc','management','Quản lý','#6366F1'),
('Phòng Kinh doanh','sales','Bán hàng','#8B5CF6'),
('Phòng Thiết kế','design','Thiết kế','#EC4899'),
('Phòng Sản xuất','production','Sản xuất','#F97316'),
('Đội Lắp đặt','installation','Lắp đặt','#3B82F6'),
('Phòng CSKH','customer-care','Chăm sóc','#EF4444');

INSERT INTO users (email,password,full_name,phone,role) VALUES
('admin@tubep.vn','$2a$12$LQv3c1yqBo9SkvXS7QTJPOoGqKmRP1Y/XMlyrQqAkJyH9.vy5JzHi','Admin','0901234567','admin'),
('sales@tubep.vn','$2a$12$LQv3c1yqBo9SkvXS7QTJPOoGqKmRP1Y/XMlyrQqAkJyH9.vy5JzHi','Nguyễn Văn Bán','0912345001','sales'),
('designer@tubep.vn','$2a$12$LQv3c1yqBo9SkvXS7QTJPOoGqKmRP1Y/XMlyrQqAkJyH9.vy5JzHi','Trần Thị Thiết Kế','0912345002','designer'),
('production@tubep.vn','$2a$12$LQv3c1yqBo9SkvXS7QTJPOoGqKmRP1Y/XMlyrQqAkJyH9.vy5JzHi','Lê Văn Sản Xuất','0912345003','production'),
('installer@tubep.vn','$2a$12$LQv3c1yqBo9SkvXS7QTJPOoGqKmRP1Y/XMlyrQqAkJyH9.vy5JzHi','Hoàng Văn Lắp','0912345005','installer'),
('manager@tubep.vn','$2a$12$LQv3c1yqBo9SkvXS7QTJPOoGqKmRP1Y/XMlyrQqAkJyH9.vy5JzHi','Vũ Văn Quản Lý','0912345007','manager');

INSERT INTO customers (full_name,phone,email,address,city,source) VALUES
('Nguyễn Văn Minh','0901234567','minh@gmail.com','123 Nguyễn Hữu Thọ, Q.7','TP.HCM','facebook'),
('Lê Thị Hương','0912345678','huong@gmail.com','45 Phạm Văn Đồng, Thủ Đức','TP.HCM','zalo'),
('Phạm Văn Tùng','0923456789','tung@gmail.com','67 Trần Não, Q.2','TP.HCM','referral');

INSERT INTO projects (code,name,customer_id,status,kitchen_type,material,estimated_value,priority,consult_date)
SELECT 'TB-2026-001','Tủ bếp chữ L anh Minh',id,'producing','l-shape','acrylic',85000000,'high',now()-interval '16 days' FROM customers WHERE phone='0901234567'
UNION ALL SELECT 'TB-2026-002','Tủ bếp chữ U chị Hương',id,'designing','u-shape','mdf-paint',120000000,'high',now()-interval '10 days' FROM customers WHERE phone='0912345678'
UNION ALL SELECT 'TB-2026-003','Bếp đảo anh Tùng',id,'consulting','island','natural-wood',150000000,'medium',now()-interval '3 days' FROM customers WHERE phone='0923456789';
