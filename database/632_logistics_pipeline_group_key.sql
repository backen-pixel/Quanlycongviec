-- 632: Kanban gộp cột VC/LĐ — logistics_pipeline_stages.group_key + group_sort
-- Giống production_pipeline_stages (604 + 613). KHÔNG gán sẵn group_key cho công ty nào.
--
-- group_key = cột lớn (giai đoạn NỐI TIẾP) mà cột nhỏ này thuộc về.
-- NULL = cột tự đứng riêng → công ty chưa cấu hình vẫn dùng Kanban phẳng như cũ.
-- group_sort = thứ tự hiển thị cột lớn khi gộp. Cùng giá trị cho mọi cột nhỏ trong nhóm.

alter table logistics_pipeline_stages add column if not exists group_key text;
alter table logistics_pipeline_stages add column if not exists group_sort integer;

comment on column logistics_pipeline_stages.group_key is
  'Cot lon (giai doan noi tiep) ma cot nho nay thuoc ve. NULL = cot dung rieng. Dung cho che do xem Kanban gop VC/LD.';
comment on column logistics_pipeline_stages.group_sort is
  'Thu tu hien thi cot lon (gop cot). Cung gia tri cho moi cot nho trong nhom. NULL = dung mac dinh (min order_index).';

-- HOÀN TÁC:
-- alter table logistics_pipeline_stages drop column if exists group_key;
-- alter table logistics_pipeline_stages drop column if exists group_sort;
