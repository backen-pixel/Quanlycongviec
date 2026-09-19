-- 613: Thứ tự hiển thị cột lớn (Kanban gộp) — độc lập order_index cột nhỏ
-- group_sort cùng giá trị cho mọi cột nhỏ trong một cột lớn.
-- NULL = chưa tùy chỉnh → FE xếp theo min(order_index), Đóng gói sau Hoàn thiện.

alter table production_pipeline_stages add column if not exists group_sort integer;

comment on column production_pipeline_stages.group_sort is
  'Thu tu hien thi cot lon (gop cot). Cung gia tri cho moi cot nho trong nhom. NULL = dung mac dinh.';

-- HOÀN TÁC:
-- alter table production_pipeline_stages drop column if exists group_sort;
