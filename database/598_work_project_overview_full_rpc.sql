-- 598 — «Tổng quan nhiệm vụ»: SQL làm hết, backend chỉ còn sắp xếp và đếm
--
-- ĐÃ CHẠY TRÊN PRODUCTION (2026-09-11). Chạy lại vẫn an toàn. Cần 597 chạy trước
-- (dùng chung hai hàm phụ wpo_try_uuid / wpo_humanize).
--
-- ══ TIẾP NỐI 597 ══
-- 597 đã đưa việc gom nhóm vào SQL: 4,0s → 2,5s. Đo tiếp thì phần còn lại KHÔNG nằm ở
-- truyền dữ liệu (phản hồi đã nén Brotli sẵn) mà ở 4 lượt đọc nối tiếp còn lại của
-- backend: projects → crm_leads → project_production_staff → users, rồi companies +
-- company_regions.
--
-- Hàm này giải luôn:
--   • người phụ trách module (ownerIdFor: 3 làn, mỗi làn 4–5 mức fallback)
--   • tên người nhận / người phụ trách (users)
--   • region_id theo lead, tên công ty + tên khu vực
--   • danh mục lọc (companies, regions) đi kèm
-- → backend không còn phải đọc gì thêm. Chi phí SQL chỉ tăng ~50ms (810 → 859ms)
--   nhưng bỏ được 4 lượt round-trip.
--
-- Trả về OBJECT { groups, companies, regions } thay vì mảng: bản code cũ kiểm tra
-- Array.isArray() nên sẽ tự bỏ qua và rơi về đường cũ — thứ tự deploy không quan trọng.
--
-- ══ ĐỐI CHIẾU ══
-- So với đường JS thuần trên dữ liệu thật: 2.470/2.470 nhóm, 26/26 trường, 0 dòng khác
-- giá trị, thứ tự danh sách trùng khớp, `stats` trùng khớp. Chạy hai lần liên tiếp cho
-- kết quả giống nhau từng byte.
-- (Thứ tự KHOÁ bên trong mỗi object có khác — đó là đặc tính của kiểu jsonb, Postgres
--  luôn sắp lại khoá theo độ dài rồi byte. Không ảnh hưởng vì client đọc theo tên khoá.)

create or replace function public.work_project_overview_full(
  p_company_id uuid default null,   -- null = không khoá công ty (admin hệ thống)
  p_module     text default null,   -- 'crm' | 'sx' | 'vc' | null = tất cả
  p_user_id    uuid default null,   -- chỉ dùng khi p_manager = false
  p_manager    boolean default true
)
returns jsonb language plpgsql stable security invoker set search_path = public as $fn$
declare
  c_from constant text := 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿāăąćĉċčďēĕėęěĝğġģĥĩīĭįĵķĺļľńņňōŏőŕŗřśŝşšţťũūŭůűųŵŷźżžơưǎǐǒǔǖǘǚǜǟǡǧǩǫǭǰǵǹǻȁȃȅȇȉȋȍȏȑȓȕȗșțȟȧȩȫȭȯȱȳḁḃḅḇḉḋḍḏḑḓḕḗḙḛḝḟḡḣḥḧḩḫḭḯḱḳḵḷḹḻḽḿṁṃṅṇṉṋṍṏṑṓṕṗṙṛṝṟṡṣṥṧṩṫṭṯṱṳṵṷṹṻṽṿẁẃẅẇẉẋẍẏẑẓẕẖẗẘẙạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹđ';
  c_to   constant text := 'aaaaaaceeeeiiiinooooouuuuyyaaaccccdeeeeegggghiiiijklllnnnooorrrssssttuuuuuuwyzzzouaiouuuuuaagkoojgnaaaeeiioorruusthaeooooyabbbcdddddeeeeefghhhhhiikkkllllmmmnnnnoooopprrrrsssssttttuuuuuvvwwwwwxxyzzzhtwyaaaaaaaaaaaaeeeeeeeeiioooooooooooouuuuuuuyyyyd';
  v_active uuid[]; v_prod uuid[]; v_log uuid[]; v_leads uuid[];
  v_all boolean := p_module is null or p_module = '';
  v_out jsonb;
begin
  select array_agg(p.id) into v_active from projects p
  where lower(coalesce(p.status::text,'')) not in ('completed','cancelled','canceled')
    and (p_company_id is null or p.company_id = p_company_id);
  if v_active is null then
    return jsonb_build_object('groups','[]'::jsonb,'companies','[]'::jsonb,'regions','[]'::jsonb);
  end if;

  -- isProductionTaskTerminalStage()
  select array_agg(p.id) into v_prod from projects p
  where p.id = any(v_active) and (p.sx_kanban_column_id is null or p.sx_kanban_column_id not in (
    select s.id from production_pipeline_stages s
    where s.is_handover_to_logistics or s.counts_as_completed_revenue or s.counts_as_collected_revenue
       or lower(btrim(coalesce(s.bucket_slug,''))) in ('delivered','completed','done','collected')
       or btrim(lower(translate(coalesce(s.name,''), c_from, c_to))) like '%da giao hang%'
       or btrim(lower(translate(coalesce(s.name,''), c_from, c_to))) = 'da giao'
       or btrim(lower(translate(coalesce(s.name,''), c_from, c_to))) like 'hoan thanh%'
       or btrim(lower(translate(coalesce(s.name,''), c_from, c_to))) like 'da thu%'));

  -- isLogisticsCompletedColumn()
  select array_agg(p.id) into v_log from projects p
  where p.id = any(v_active) and (p.vc_kanban_column_id is null or p.vc_kanban_column_id not in (
    select s.id from logistics_pipeline_stages s
    where lower(btrim(coalesce(s.bucket_slug,''))) in ('completed','done','install_completed')
       or btrim(lower(translate(coalesce(s.name,''), c_from, c_to))) in ('hoan thanh','hoan thien')
       or btrim(lower(translate(coalesce(s.name,''), c_from, c_to))) like 'hoan thanh %'
       or btrim(lower(translate(coalesce(s.name,''), c_from, c_to))) like 'hoan thien %'));

  -- Lead còn mở
  select array_agg(l.id) into v_leads from crm_leads l
  left join crm_pipeline_stages cs on cs.id = l.stage_id
  where l.project_id = any(v_active)
    and coalesce(cs.is_won,false) = false and coalesce(cs.is_lost,false) = false
    and not (coalesce(cs.counts_as_completed_revenue,false)
      or lower(btrim(coalesce(cs.canonical_slug,''))) in ('completed','done')
      or btrim(lower(translate(coalesce(cs.name,''), c_from, c_to))) = 'hoan thanh'
      or btrim(lower(translate(coalesce(cs.name,''), c_from, c_to))) like 'hoan thanh %');

  with base as (
    select u.unified_id, u.source, u.source_id, u.project_id, u.lead_id, u.company_id,
           u.task_kind, u.project_code, u.project_name, u.lead_title, u.deadline, u.assignee_id, u.status
    from unified_tasks_v u
    where v_leads is not null and (v_all or p_module='crm')
      and u.source='crm_task' and u.lead_id = any(v_leads)
      and (p_company_id is null or u.company_id = p_company_id)
      and (p_manager or p_user_id is null or u.assignee_id = p_user_id or u.created_by_id = p_user_id)
    union all
    select u.unified_id, u.source, u.source_id, u.project_id, u.lead_id, u.company_id,
           u.task_kind, u.project_code, u.project_name, u.lead_title, u.deadline, u.assignee_id, u.status
    from unified_tasks_v u
    where v_prod is not null and (v_all or p_module='sx')
      and u.source='task' and u.is_primary_lead and u.project_id = any(v_prod) and u.task_kind in ('SX','Dự án')
      and (p_company_id is null or u.company_id = p_company_id)
      and (p_manager or p_user_id is null or u.assignee_id = p_user_id or u.created_by_id = p_user_id)
    union all
    select u.unified_id, u.source, u.source_id, u.project_id, u.lead_id, u.company_id,
           u.task_kind, u.project_code, u.project_name, u.lead_title, u.deadline, u.assignee_id, u.status
    from unified_tasks_v u
    where v_log is not null and (v_all or p_module='vc')
      and u.source='task' and u.is_primary_lead and u.project_id = any(v_log) and u.task_kind = 'VC'
      and (p_company_id is null or u.company_id = p_company_id)
      and (p_manager or p_user_id is null or u.assignee_id = p_user_id or u.created_by_id = p_user_id)
  ),
  uniq as (select distinct on (unified_id) * from base order by unified_id),
  det as (
    select t.*,
      case when t.task_kind in ('SX','Dự án') then 'production'
           when t.task_kind = 'VC' then 'logistics'
           when t.task_kind in ('CRM-Deal','CRM-Lead','Giao việc') then 'sales'
           when t.source in ('crm_task','crm_assignment') then 'sales'
           else 'production' end as lane,
      coalesce(t.project_id::text, t.lead_id::text, 'none') as owner_key,
      lower(coalesce(t.status,'')) in ('done','completed','cancelled','canceled') as is_done,
      case when t.source='crm_task'
        then coalesce(nullif(ct.pipeline_stage_id::text,''), nullif(ct.production_pipeline_stage_id::text,''), nullif(ct.stage_slug,''), 'crm-general')
        else coalesce(nullif(tk.metadata->>'workshop_template_id',''), nullif(tk.production_stage_id::text,''),
                      nullif(tk.metadata->>'logistics_pipeline_stage_id',''), nullif(tk.metadata->>'guessed_stage_slug',''),
                      nullif(tk.stage_id::text,''), 'project-general') end as category_id,
      case when t.source='crm_task'
        then coalesce(nullif(cps.name,''), nullif(pps_c.name,''), nullif(public.wpo_humanize(ct.stage_slug),''), 'Nhiệm vụ CRM')
        else coalesce(nullif(wtt.name,''), nullif(pps_t.name,''), nullif(lps.name,''),
                      nullif(public.wpo_humanize(tk.metadata->>'guessed_stage_slug'),''), 'Nhiệm vụ dự án') end as category_title,
      case when t.source='crm_task' then coalesce(cps.order_index, pps_c.order_index, 999)
           else coalesce(wtt.order_index, pps_t.order_index, lps.order_index, 999) end as category_order
    from uniq t
    left join crm_tasks ct on t.source='crm_task' and ct.id = public.wpo_try_uuid(t.source_id)
    left join tasks tk on t.source='task' and tk.id = public.wpo_try_uuid(t.source_id)
    left join crm_pipeline_stages cps on cps.id = ct.pipeline_stage_id
    left join production_pipeline_stages pps_c on pps_c.id = ct.production_pipeline_stage_id
    left join workshop_task_templates wtt on wtt.id = public.wpo_try_uuid(tk.metadata->>'workshop_template_id')
    left join production_pipeline_stages pps_t on pps_t.id = tk.production_stage_id
    left join logistics_pipeline_stages lps on lps.id = public.wpo_try_uuid(tk.metadata->>'logistics_pipeline_stage_id')
  ),
  agg as (
    select lane, owner_key, category_id,
      (array_agg(category_title order by unified_id))[1] as category_title,
      (array_agg(category_order order by unified_id))[1] as category_order,
      count(*) as child_total,
      count(*) filter (where is_done) as child_completed,
      count(*) filter (where not is_done) as open_total,
      min(deadline) filter (where not is_done and deadline is not null) as deadline,
      (array_agg(assignee_id order by unified_id) filter (where not is_done and assignee_id is not null))[1] as assignee_id
    from det group by lane, owner_key, category_id
  ),
  -- `first` bên JS = nhiệm vụ MỞ đầu tiên, không có thì nhiệm vụ đầu tiên.
  rep as (
    select distinct on (lane, owner_key, category_id)
      lane, owner_key, category_id, source, source_id, project_id, lead_id, company_id,
      task_kind, project_code, project_name, lead_title
    from det order by lane, owner_key, category_id, is_done, unified_id
  ),
  -- Nhân sự SX chính: is_primary trước, rồi order_index, rồi user_id — đúng thứ tự
  -- mà sort ổn định bên JS tạo ra.
  staff_primary as (
    select distinct on (project_id) project_id, user_id
    from project_production_staff where project_id = any(v_active)
    order by project_id, (is_primary is true) desc, coalesce(order_index, 0), user_id
  ),
  -- ownerIdFor(): 3 làn, mỗi làn một chuỗi fallback riêng.
  own as (
    select a.*, r.source, r.source_id, r.project_id, r.lead_id, r.company_id,
      r.task_kind, r.project_code, r.project_name, r.lead_title, l.region_id,
      case a.lane
        when 'production' then coalesce(p.production_person_id, sp.user_id, p.project_manager_id, p.responsible_person_id)
        when 'logistics'  then coalesce(p.logistics_person_id, p.installer_person_id, p.installation_person_id, p.production_person_id, sp.user_id)
        else coalesce(p.project_manager_id, p.sales_person_id, p.responsible_person_id, l.assigned_to, l.lead_owner_id)
      end as module_owner_id
    from agg a
    join rep r on r.lane=a.lane and r.owner_key=a.owner_key and r.category_id=a.category_id
    left join crm_leads l on l.id = r.lead_id
    left join projects p on p.id = coalesce(r.project_id, l.project_id)
    left join staff_primary sp on sp.project_id = coalesce(r.project_id, l.project_id)
    where a.open_total > 0        -- nhóm đã xong hết thì bỏ, giống JS
  ),
  fin as (
    select o.*, ua.full_name as assignee_name, uo.full_name as module_owner_name,
      coalesce(c.short_name, c.name) as company_name, cr.name as region_name
    from own o
    left join users ua on ua.id = o.assignee_id
    left join users uo on uo.id = o.module_owner_id
    left join companies c on c.id = o.company_id
    left join company_regions cr on cr.id = o.region_id
  )
  select jsonb_build_object(
    'groups', coalesce((select jsonb_agg(jsonb_build_object(
        'unified_id', 'group:' || lane || ':' || owner_key || ':' || category_id,
        'source', source, 'source_id', source_id, 'project_id', project_id,
        'lead_id', lead_id, 'company_id', company_id, 'region_id', region_id,
        'task_kind', task_kind, 'title', category_title, 'category_id', category_id,
        'owner_lane', lane, 'category_order', category_order,
        'project_code', project_code, 'project_name', project_name, 'lead_title', lead_title,
        'deadline', deadline, 'child_completed', child_completed, 'child_total', child_total,
        'assignee_id', assignee_id, 'assignee_name', assignee_name,
        'module_owner_id', module_owner_id, 'module_owner_name', module_owner_name,
        'effective_assignee_id', coalesce(assignee_id, module_owner_id),
        'effective_assignee_name', coalesce(assignee_name, module_owner_name),
        'company_name', company_name, 'region_name', region_name)) from fin), '[]'::jsonb),
    'companies', coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'short_name',short_name) order by id)
        from companies where id in (select distinct company_id from fin where company_id is not null)), '[]'::jsonb),
    'regions', coalesce((select jsonb_agg(jsonb_build_object('id',id,'company_id',company_id,'name',name,'code',code) order by id)
        from company_regions where id in (select distinct region_id from fin where region_id is not null)), '[]'::jsonb)
  ) into v_out;

  return v_out;
end; $fn$;

comment on function public.work_project_overview_full(uuid, text, uuid, boolean) is
  'Tổng quan nhiệm vụ: chọn phạm vi + gom nhóm + giải người phụ trách + danh mục lọc, tất cả trong một lượt gọi.';

grant execute on function public.work_project_overview_full(uuid, text, uuid, boolean) to authenticated, service_role;
