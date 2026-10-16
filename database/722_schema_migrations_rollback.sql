-- Rollback 722: xoá sổ theo dõi migration (mất lịch sử đã ghi — chỉ dùng khi chắc chắn).
DROP TABLE IF EXISTS public.schema_migrations;
