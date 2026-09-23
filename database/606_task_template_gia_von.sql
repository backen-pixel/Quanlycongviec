-- 606: Gia von cua tung NHIEM VU / CONG DOAN trong mau nhiem vu san xuat.
-- DA CHAY TREN PRODUCTION 2026-09-14 theo yeu cau anh B.A.
--
-- Moi dong Excel gia von = mot cong doan (vd «Cat nhom — 120.000d»), nen gia gan thang
-- vao workshop_task_template_items. Thuan bo sung: cot moi deu NULL, khong sua dong nao.
--
-- KHONG dung products.cost_price: bang do la gia von theo MA HANG (702 san pham),
-- khac han gia gia cong theo cong doan. Hai thu khac nhau, khong gop.

alter table workshop_task_template_items
  add column if not exists chi_phi            numeric,
  add column if not exists gia_gia_cong       numeric,
  add column if not exists don_vi_tinh        text,
  add column if not exists ghi_chu_gia        text,
  add column if not exists gia_cap_nhat_luc   timestamptz,
  add column if not exists gia_cap_nhat_boi   uuid references users(id) on delete set null;

comment on column workshop_task_template_items.chi_phi is
  'Chi phi (gia von) cua cong doan nay. NULL = chua nhap.';
comment on column workshop_task_template_items.gia_gia_cong is
  'Gia gia cong cua cong doan nay. NULL = chua nhap.';
comment on column workshop_task_template_items.don_vi_tinh is
  'Don vi tinh cho hai cot gia tren: cai / m / m2 / bo ... Text tu do theo file Excel.';
