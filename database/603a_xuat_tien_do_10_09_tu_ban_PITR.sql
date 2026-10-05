-- CHẠY TRÊN BẢN PHỤC HỒI PITR (nhánh/khôi phục về mốc TRƯỚC 2026-09-11 02:46 UTC).
-- Kết quả: các câu INSERT dán thẳng vào production, nạp bảng _restore_hcb_sx_10_09.
--
-- Xuất theo TÊN cột chứ không theo id — vì id cột cũ đã bị 588 xóa, production hiện dùng id mới.

select 'insert into _restore_hcb_sx_10_09 (project_code, ten_cot_ngay_10_09) values ('
       || quote_literal(p.code) || ', ' || quote_literal(s.name)
       || ') on conflict (project_code) do update set ten_cot_ngay_10_09 = excluded.ten_cot_ngay_10_09;'
       as cau_lenh
from projects p
join production_pipeline_stages s on s.id = p.sx_kanban_column_id
where p.company_id = (select id from companies where name ilike '%Hucabi%')
order by p.code;

-- Kiểm tra nhanh trước khi xuất: phân bổ dự án theo cột tại thời điểm 10/09.
-- select coalesce(wt.name,'(khong co board)') as board, s.name as cot, count(*) as so_du_an
--   from projects p
--   join production_pipeline_stages s on s.id = p.sx_kanban_column_id
--   left join workshop_project_types wt on wt.id = s.workshop_type_id
--  where p.company_id = (select id from companies where name ilike '%Hucabi%')
--  group by 1,2 order by 1, min(s.order_index);
