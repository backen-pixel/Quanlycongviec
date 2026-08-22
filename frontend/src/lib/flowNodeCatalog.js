/**
 * Catalog loại node trên Setup luồng + hợp đồng dữ liệu mỗi node lấy ra được.
 *
 * module     — bước nghiệp vụ (CRM / Dự án / SX / Lắp đặt / custom)
 * control    — rẽ nhánh, gộp, chờ, duyệt, kết thúc
 * action     — hành động đặc biệt (báo cáo, AI deadline, thông báo)
 *
 * `outputs` là danh sách trường các khối sau có thể đọc khi runtime chạy.
 * Thiết kế trước để cắm AI / báo cáo mà không đổi schema canvas.
 */

export const NODE_KIND = {
  MODULE: 'module',
  CONDITION: 'condition',
  FORK: 'fork',
  JOIN: 'join',
  WAIT: 'wait',
  APPROVE: 'approve',
  END: 'end',
  REPORT: 'report',
  AI_REPORT: 'ai_report',
  AI_DEADLINE: 'ai_deadline',
  NOTIFY: 'notify',
  AI_CLASSIFY: 'ai_classify',
  AI_EXTRACT: 'ai_extract',
  AI_ASK: 'ai_ask',
};

/** Kỳ báo cáo — khớp resolveTimeRange của aiReportTools ở backend. */
export const REPORT_PERIODS = [
  { value: 'today', label: 'Hôm nay' },
  { value: 'yesterday', label: 'Hôm qua' },
  { value: 'last_7d', label: '7 ngày gần nhất' },
  { value: 'last_30d', label: '30 ngày gần nhất' },
  { value: 'this_month', label: 'Tháng này' },
  { value: 'last_month', label: 'Tháng trước' },
];

/**
 * Model cho khối AI. `default` = theo cấu hình chung của hệ thống, đổi ở một chỗ
 * là mọi luồng đang để mặc định đổi theo.
 */
export const AI_MODEL_OPTIONS = [
  { value: 'default', label: 'Theo mặc định hệ thống' },
  { value: 'gpt-4o-mini', label: 'gpt-4o-mini — nhanh, rẻ' },
  { value: 'gpt-4o', label: 'gpt-4o — chất lượng cao' },
  { value: 'custom', label: 'Khác (tự nhập mã model)' },
];

const OUT = (key, label, type, desc, to) => ({ key, label, type, desc, to });
const IN = (key, label, type, from, desc) => ({ key, label, type, from, desc });

/** Nhãn cho badge nguồn / đích của một trường bàn giao. */
export const DATA_SIDE_LABEL = {
  crm: 'CRM',
  production: 'SX',
  logistics: 'VC/LĐ',
  projects: 'Dự án',
  form: 'Form',
  config: 'Cấu hình',
  calc: 'Tự tính',
};

/**
 * Trường một module ĐẨY RA cho bước sau.
 *
 * Không phải clone cả bản ghi: mỗi hướng chỉ chuyển đúng tập trường dưới đây.
 * `desc` ghi ánh xạ cột thật, `to` là module nhận.
 * Nguồn: autoDealWonProject.js, vcHandoverCore.js, workshopKanban.js.
 */
export const MODULE_OUTPUTS = {
  crm: [
    OUT('code', 'Mã deal', 'string', 'crm_leads.code — dùng đặt tên dự án, nhắn tin', 'production'),
    OUT('title', 'Tên deal', 'string', 'crm_leads.title → projects.name (multi-xưởng thêm hậu tố loại xưởng)', 'production'),
    OUT('description', 'Mô tả', 'string', 'crm_leads.description → projects.description', 'production'),
    OUT('customer_id', 'Khách hàng', 'object', 'crm_leads.customer_id → projects.customer_id (kèm tên, SĐT)', 'production'),
    OUT('install_address', 'Địa chỉ lắp', 'string', 'crm_leads.install_address, thiếu thì lấy customers.address → projects.install_address', 'production'),
    OUT('estimated_value', 'Giá trị', 'number', 'crm_leads.estimated_value → projects.estimated_value', 'production'),
    OUT('deposit_amount', 'Tiền cọc', 'number', 'crm_leads.deposit_amount → projects.deposit_amount (chỉ khi > 0)', 'production'),
    OUT('assigned_to', 'Sale phụ trách', 'object', 'crm_leads.assigned_to hoặc lead_owner_id → projects.sales_person_id', 'production'),
    OUT('stage_id', 'Cột CRM hiện tại', 'object', 'crm_leads.stage_id — cờ is_won / show_sx_transfer mở đường sang SX'),
    OUT('tasks', 'Nhiệm vụ CRM', 'list', 'crm_tasks đã xong → tasks với metadata imported_from = crm_deal', 'production'),
    OUT('documents', 'Hồ sơ / báo giá', 'list', 'lead_documents → projects.quotation_files, đồng thời gán project_id', 'production'),
    OUT('orders', 'Đơn hàng', 'list', 'orders của deal được gán orders.project_id', 'production'),
    OUT('project_id', 'Dự án đã tạo', 'object', 'crm_leads.project_id + bản ghi crm_deal_projects (đánh dấu dự án chính)', 'production'),
  ],
  production: [
    OUT('sx_kanban_column_id', 'Cột kanban SX', 'object', 'projects.sx_kanban_column_id → crm_leads.sx_pipeline_stage_id (badge trên deal)', 'crm'),
    OUT('crm_stage_sync', 'Đổi cột CRM', 'enum', 'Cột SX có crm_sync_type = production hoặc cờ is_packaging_done → cột CRM sync_role sx_production / sx_completed', 'crm'),
    OUT('sx_handover_at', 'Mốc vào xưởng', 'date', 'crm_leads.sx_handover_at — ghi lần đầu rời cột chờ SX, mở khoá cho VC đổi cột CRM', 'crm'),
    OUT('order_date', 'Ngày đặt hàng', 'date', 'projects.order_date — lấy lúc deal vào cột CRM «Sản xuất», chỉ ghi nếu đang trống'),
    OUT('logistics_company_id', 'Công ty VC', 'object', 'Chọn trên form bàn giao → projects.logistics_company_id', 'logistics'),
    OUT('vc_people', 'Người VC / lắp đặt', 'object', 'logistics_person_id, installer_person_id, delivery_team_id, installation_team_id', 'logistics'),
    OUT('status', 'Trạng thái dự án', 'enum', "projects.status = 'shipping', current_stage_id về null", 'logistics'),
    OUT('vc_kanban_column_id', 'Cột board VC', 'object', 'Cột intake VC (bucket_slug = delivery_pending) của công ty VC', 'logistics'),
    OUT('vc_handover_status', 'Trạng thái bàn giao', 'enum', 'pending → scheduled (trong app) hoặc external (thuê ngoài) → confirmed', 'logistics'),
    OUT('pickup_at', 'Ngày lấy hàng', 'date', 'projects.pickup_at + pickup_notes do sale nhập khi chọn VC', 'logistics'),
    OUT('install_plan', 'Lịch & địa chỉ lắp', 'object', 'install_date, delivery_date, install_address, vc_notes trên projects', 'logistics'),
    OUT('tasks', 'Nhiệm vụ xưởng', 'list', 'Task mẫu SX theo loại xưởng; bàn giao xong sinh thêm task mẫu VC trên cùng dự án'),
    OUT('documents', 'Hồ sơ dự án', 'list', 'lead_documents được mở thêm module logistics khi bàn giao', 'logistics'),
  ],
  logistics: [
    OUT('vc_kanban_column_id', 'Cột kanban VC', 'object', 'projects.vc_kanban_column_id → crm_leads.vc_pipeline_stage_id (badge trên deal)', 'crm'),
    OUT('crm_stage_sync', 'Đổi cột CRM', 'enum', 'crm_sync_type của cột VC (delivery / installation / customer_care) → cột CRM sync_role vc_delivery / vc_installation / vc_customer_care', 'crm'),
    OUT('child_deal', 'Deal con VC', 'object', 'Khi công ty VC khác công ty deal: tạo crm_leads mới copy title, customer_id, estimated_value, install_address, region_id + parent_lead_id, project_id giữ nguyên', 'crm'),
    OUT('install_address', 'Địa chỉ lắp', 'string', 'projects.install_address → crm_leads.install_address', 'crm'),
    OUT('external_company_name', 'Đơn vị VC ngoài', 'string', 'Tên công ty thuê ngoài → crm_leads.external_company_name', 'crm'),
    OUT('members', 'Người phụ trách VC', 'list', 'logistics_person_id / installer_person_id được thêm vào lead_members của deal', 'crm'),
    OUT('events', 'Sự kiện lịch', 'list', 'crm_events: giao hàng xưởng (pickup), vận chuyển, lắp đặt — tạo khi hai bên xác nhận', 'crm'),
    OUT('schedule', 'Lịch giao / lắp', 'date', 'pickup_at, install_date, install_occurrence_dates trên projects'),
    OUT('tasks', 'Nhiệm vụ lắp', 'list', 'Task mẫu xưởng VC: giao hàng, lắp đặt, nghiệm thu'),
    OUT('documents', 'Hồ sơ hiện trường', 'list', 'Ảnh hiện trường, biên bản nghiệm thu gắn dự án'),
  ],
  projects: [
    OUT('name', 'Tên dự án', 'string', 'projects.name'),
    OUT('code', 'Mã dự án', 'string', 'projects.code — sinh theo năm, dạng TB-…'),
    OUT('tasks', 'Công việc dự án', 'list', 'Task theo bước luồng và bộ mẫu công ty'),
    OUT('members', 'Thành viên', 'list', 'sales_person_id, production_person_id, logistics_person_id, installer_person_id'),
    OUT('progress', 'Tiến độ', 'number', 'Phần trăm hoàn thành theo task / cột hiện tại'),
    OUT('documents', 'Tài liệu dự án', 'list', 'quotation_files, bản vẽ, biên bản'),
  ],
};

/**
 * Trường một module NHẬN VÀO từ bước trước.
 *
 * `from` là nơi dữ liệu tới: module trước, form bàn giao, cấu hình hệ thống,
 * hoặc do hệ thống tự tính.
 */
export const MODULE_INPUTS = {
  crm: [
    IN('project_id', 'Dự án đã tạo', 'object', 'production', 'projects.id → crm_leads.project_id, kèm dòng crm_deal_projects'),
    IN('sx_pipeline_stage_id', 'Badge cột SX', 'object', 'production', 'projects.sx_kanban_column_id → crm_leads.sx_pipeline_stage_id mỗi lần kéo kanban SX'),
    IN('sx_handover_at', 'Mốc vào xưởng', 'date', 'production', 'Ghi lần đầu dự án rời cột chờ SX — điều kiện để VC được đổi cột CRM'),
    IN('vc_pipeline_stage_id', 'Badge cột VC', 'object', 'logistics', 'projects.vc_kanban_column_id → crm_leads.vc_pipeline_stage_id'),
    IN('stage_id', 'Cột CRM', 'object', 'production', 'Cột SX/VC có crm_target_stage_id hoặc crm_sync_type sẽ đẩy deal sang cột CRM cùng sync_role'),
    IN('install_address', 'Địa chỉ lắp', 'string', 'logistics', 'Sale chốt địa chỉ khi chọn VC → ghi ngược về crm_leads.install_address'),
    IN('external_company_name', 'Đơn vị VC ngoài', 'string', 'logistics', 'Chỉ khi thuê vận chuyển ngoài hệ thống'),
    IN('members', 'Thành viên deal', 'list', 'logistics', 'Người phụ trách SX / VC được thêm vào lead_members để thấy deal'),
  ],
  production: [
    IN('name', 'Tên dự án', 'string', 'crm', 'crm_leads.title → projects.name'),
    IN('description', 'Mô tả', 'string', 'crm', 'crm_leads.description → projects.description'),
    IN('customer_id', 'Khách hàng', 'object', 'crm', 'crm_leads.customer_id → projects.customer_id'),
    IN('install_address', 'Địa chỉ lắp', 'string', 'crm', 'crm_leads.install_address, thiếu thì lấy customers.address'),
    IN('estimated_value', 'Giá trị', 'number', 'crm', 'crm_leads.estimated_value; deposit_amount đi kèm nếu > 0'),
    IN('sales_person_id', 'Sale phụ trách', 'object', 'crm', 'crm_leads.assigned_to hoặc lead_owner_id'),
    IN('company_id', 'Công ty SX', 'object', 'form', 'Chọn xưởng khi thắng deal; phải là công ty đang bật module Sản xuất'),
    IN('workshop_type_id', 'Loại xưởng', 'object', 'form', 'Phân loại xưởng — bắt buộc khi một deal chia cho nhiều xưởng'),
    IN('flow_id', 'Luồng áp dụng', 'object', 'config', 'Ưu tiên: chọn tay → auto_project_config.flow_id → luồng mặc định'),
    IN('production_workshop_team_id', 'Team SX', 'object', 'config', 'production_handover_settings.default_production_team_id của xưởng'),
    IN('sx_kanban_column_id', 'Cột kanban SX', 'object', 'config', 'Cột đầu tiên trong pipeline SX của xưởng đó'),
    IN('install_date', 'Ngày lắp / giao', 'date', 'form', 'install_date, delivery_date nhập trên form tạo dự án'),
    IN('production_finish_date', 'Deadline SX', 'date', 'calc', 'Nhập tay, không nhập thì lấy ngày lắp trừ 2 ngày (kèm production_deadline)'),
    IN('sx_reception_date', 'Ngày xưởng nhận', 'date', 'calc', 'Ngày làm việc SX đầu tiên: tạo sau 12h thì tính hôm sau, bỏ Chủ nhật và ngày lễ'),
    IN('order_date', 'Ngày đặt hàng', 'date', 'crm', 'Lấy lúc deal vào cột CRM «Sản xuất», chỉ ghi khi đang trống'),
    IN('quotation_files', 'Hồ sơ / báo giá', 'list', 'crm', 'lead_documents của deal được sao vào projects.quotation_files'),
    IN('tasks', 'Nhiệm vụ đã xong', 'list', 'crm', 'crm_tasks chuyển thành task dự án ở trạng thái done để giữ lịch sử tư vấn'),
  ],
  logistics: [
    IN('logistics_company_id', 'Công ty VC', 'object', 'form', 'Sale chọn khi xưởng gửi yêu cầu bàn giao'),
    IN('logistics_person_id', 'Người VC / lắp đặt', 'object', 'config', 'Trống thì lấy logistics_handover_settings, fallback admin VC của công ty'),
    IN('delivery_team_id', 'Đội giao / lắp', 'object', 'form', 'delivery_team_id, installation_team_id nếu xưởng VC dùng đội'),
    IN('status', 'Trạng thái dự án', 'enum', 'production', "projects.status chuyển 'shipping', current_stage_id về null"),
    IN('vc_kanban_column_id', 'Cột board VC', 'object', 'config', 'Cột intake bucket_slug = delivery_pending của công ty VC'),
    IN('vc_handover_status', 'Trạng thái bàn giao', 'enum', 'production', 'pending khi xưởng gửi, scheduled / external khi sale chọn, confirmed khi hai bên xác nhận'),
    IN('pickup_at', 'Ngày lấy hàng', 'date', 'form', 'pickup_at + pickup_notes trên panel chọn VC'),
    IN('install_date', 'Lịch lắp', 'date', 'form', 'install_date, delivery_date, install_occurrence_dates cho lịch lắp nhiều buổi'),
    IN('install_address', 'Địa chỉ lắp', 'string', 'crm', 'Theo dự án, sale sửa lại được lúc chọn VC'),
    IN('vc_notes', 'Ghi chú VC', 'string', 'form', 'projects.vc_notes — dặn dò cho đội giao hàng'),
    IN('tasks', 'Nhiệm vụ mẫu VC', 'list', 'config', 'Bộ mẫu xưởng khu vực logistics sinh trên chính dự án SX, không tạo dự án mới'),
    IN('documents', 'Quyền xem hồ sơ', 'list', 'production', 'lead_documents đã chia sẻ được mở thêm cho module logistics'),
  ],
  projects: [
    IN('name', 'Tên dự án', 'string', 'crm', 'crm_leads.title → projects.name'),
    IN('customer_id', 'Khách hàng', 'object', 'crm', 'crm_leads.customer_id'),
    IN('flow_id', 'Luồng áp dụng', 'object', 'config', 'Quyết định các bước và bộ task mẫu sinh ra'),
    IN('tasks', 'Task theo bước', 'list', 'config', 'Sinh từ company_template_tasks / company_process_tasks của bước'),
    IN('members', 'Người phụ trách', 'list', 'config', 'Theo setup phân loại xưởng và roster từng công ty'),
  ],
};

const PROP = (key, label, type, desc, role = 'field') => ({ key, label, type, desc, role });

/** Thuộc tính thật đang có trên bản ghi / cột của từng module. */
export const MODULE_PROPERTIES = {
  crm: [
    PROP('code', 'Mã deal', 'string', 'crm_leads.code'),
    PROP('title', 'Tên deal', 'string', 'crm_leads.title'),
    PROP('type', 'Loại', 'enum', 'lead | deal'),
    PROP('estimated_value', 'Giá trị', 'number', 'crm_leads.estimated_value'),
    PROP('phone', 'SĐT khách', 'string', 'crm_leads.phone'),
    PROP('stage_id', 'Cột hiện tại', 'object', 'crm_leads.stage_id → crm_pipeline_stages'),
    PROP('pipeline_id', 'Pipeline', 'object', 'crm_leads.pipeline_id'),
    PROP('lead_owner_id', 'Owner', 'object', 'Người phụ trách deal'),
    PROP('assigned_to', 'Người được giao', 'object', 'crm_leads.assigned_to'),
    PROP('kanban_deadline_at', 'Deadline cột', 'date', 'Hạn trên kanban'),
    PROP('expected_close_date', 'Ngày hẹn chốt', 'date', 'crm_leads.expected_close_date'),
    PROP('project_id', 'Dự án SX', 'object', 'Có khi đã chuyển xưởng'),
    PROP('is_won', 'Cột Thắng', 'flag', 'Gắn trên cột — trigger on_won tạo dự án SX', 'flag'),
    PROP('is_lost', 'Cột Mất', 'flag', 'Deal dừng, không vào SX', 'flag'),
    PROP('show_sx_transfer', 'Cho chuyển Sản xuất', 'flag', 'Cột kiểu «ĐANG SẢN XUẤT» hiện nút chuyển xưởng', 'flag'),
    PROP('allow_revert_to_lead', 'Cho trả về Lead', 'flag', 'Deal quay lại lead', 'flag'),
    PROP('is_revert_to_lead_target', 'Cột nhận Lead trả về', 'flag', 'Cột đích khi trả lead', 'flag'),
    PROP('requires_deadline', 'Bắt buộc deadline', 'flag', 'Không vào cột nếu thiếu hạn', 'flag'),
    PROP('send_zalo_on_enter', 'Gửi Zalo khi vào cột', 'flag', 'Tự gửi Zalo', 'flag'),
    PROP('create_event_on_enter', 'Tạo sự kiện khi vào cột', 'flag', 'Tạo event lịch', 'flag'),
    PROP('counts_as_won_revenue', 'Tính DT thắng', 'flag', 'Doanh thu thắng', 'flag'),
    PROP('counts_as_completed_revenue', 'Tính DT hoàn thành', 'flag', 'Doanh thu hoàn thành', 'flag'),
  ],
  production: [
    PROP('project', 'Dự án xưởng', 'object', 'projects + lệnh SX'),
    PROP('workshop_type', 'Loại xưởng', 'object', 'Loại tủ / công đoạn'),
    PROP('stage', 'Cột kanban SX', 'object', 'production_pipeline_stages'),
    PROP('company_id', 'Công ty SX', 'object', 'Xưởng đang chạy'),
    PROP('is_packaging_done', 'Đóng gói xong', 'flag', 'Mở cột CRM «Đã sản xuất»', 'flag'),
    PROP('is_handover_to_logistics', 'Bàn giao Lắp đặt', 'flag', 'Trigger on_stage_flag → tạo/chuyển VC', 'flag'),
    PROP('converts_workshop_type', 'Chuyển loại xưởng', 'flag', 'Đổi workshop_type khi vào cột', 'flag'),
    PROP('requires_deadline', 'Bắt buộc deadline', 'flag', 'Cột yêu cầu hạn', 'flag'),
    PROP('counts_as_completed_revenue', 'DT hoàn thành', 'flag', 'Cột tính DT hoàn thành', 'flag'),
    PROP('counts_as_collected_revenue', 'DT đã thu', 'flag', 'Cột tính DT đã thu', 'flag'),
  ],
  logistics: [
    PROP('install_job', 'Lệnh lắp / giao', 'object', 'Đơn VC gắn dự án'),
    PROP('stage', 'Cột kanban LĐ', 'object', 'logistics_pipeline_stages'),
    PROP('schedule', 'Lịch giao / lắp', 'date', 'Ngày giờ đội đi'),
    PROP('is_handover_to_install', 'Bàn giao lắp đặt', 'flag', 'Cột chuyển từ giao hàng sang lắp', 'flag'),
    PROP('is_temp_install_staging', 'Dự án sắp tới', 'flag', 'Cột chờ xếp lịch lắp', 'flag'),
    PROP('bucket_slug', 'Nhóm cột', 'enum', 'delivery_pending | delivery | delivered | installation | acceptance | completed'),
  ],
  projects: [
    PROP('name', 'Tên dự án', 'string', 'projects.name'),
    PROP('progress', 'Tiến độ', 'number', 'Phần trăm / cột'),
    PROP('members', 'Thành viên', 'list', 'Người phụ trách'),
  ],
};

/** Điều kiện có sẵn — đúng 3 loại picker + cờ cột từng module. */
export const MODULE_CONDITIONS = {
  crm: [
    { type: 'stage_flag', flag: 'is_won', label: 'Cột Thắng', when: 'Deal thắng → tạo dự án SX (handoff on_won)' },
    { type: 'stage_flag', flag: 'is_lost', label: 'Cột Mất', when: 'Dừng luồng, không vào SX' },
    { type: 'stage_flag', flag: 'show_sx_transfer', label: 'Cho chuyển Sản xuất', when: 'Cột sau thắng hiện nút chuyển xưởng' },
    { type: 'stage_flag', flag: 'allow_revert_to_lead', label: 'Cho trả về Lead', when: 'Deal quay lại lead' },
    { type: 'stage_flag', flag: 'is_revert_to_lead_target', label: 'Cột nhận Lead trả về', when: 'Cột đích trả lead' },
    { type: 'stage_flag', flag: 'requires_deadline', label: 'Bắt buộc deadline', when: 'Chặn vào cột nếu thiếu hạn' },
    { type: 'stage_reached', label: 'Đã tới cột chỉ định', when: 'Deal đã vào một cột cụ thể' },
    { type: 'task_item_done', label: 'Nhiệm vụ mẫu phải xong', when: 'Item template CRM hoàn tất (kèm ảnh/ghi chú nếu cài)' },
  ],
  production: [
    { type: 'stage_flag', flag: 'is_packaging_done', label: 'Đóng gói xong', when: 'Mở cột CRM «Đã sản xuất»' },
    { type: 'stage_flag', flag: 'is_handover_to_logistics', label: 'Cột bàn giao Lắp đặt', when: 'Handoff on_stage_flag → Lắp đặt' },
    { type: 'stage_flag', flag: 'converts_workshop_type', label: 'Chuyển loại xưởng', when: 'Đổi loại xưởng khi vào cột' },
    { type: 'stage_flag', flag: 'requires_deadline', label: 'Bắt buộc deadline', when: 'Cột yêu cầu hạn' },
    { type: 'stage_reached', label: 'Đã tới cột SX', when: 'Lệnh đã vào cột kanban chỉ định' },
    { type: 'task_item_done', label: 'Nhiệm vụ xưởng phải xong', when: 'Item template SX hoàn tất' },
  ],
  logistics: [
    { type: 'stage_flag', flag: 'is_handover_to_install', label: 'Cột bàn giao Lắp đặt', when: 'Từ giao hàng sang lắp' },
    { type: 'stage_flag', flag: 'is_temp_install_staging', label: 'Dự án sắp tới', when: 'Cột chờ xếp lịch lắp' },
    { type: 'stage_reached', label: 'Đã tới cột LĐ', when: 'Đơn đã vào cột kanban chỉ định' },
    { type: 'task_item_done', label: 'Nhiệm vụ lắp phải xong', when: 'Item template LĐ hoàn tất' },
  ],
  projects: [
    { type: 'task_item_done', label: 'Công việc dự án phải xong', when: 'Task dự án hoàn tất' },
  ],
};

const CUSTOM_MODULE_OUTPUTS = [
  OUT('record', 'Bản ghi module', 'object', 'Dữ liệu chính của module tùy chỉnh'),
  OUT('stage', 'Cột / trạng thái', 'object', 'Trạng thái hiện tại nếu module có pipeline'),
  OUT('tasks', 'Nhiệm vụ', 'list', 'Task gắn bước này'),
  OUT('files', 'Tệp', 'list', 'File đính kèm của bước'),
];

const CUSTOM_MODULE_INPUTS = [
  IN('project_id', 'Dự án', 'object', 'projects', 'Module tùy chỉnh chạy trên cùng dự án của bước trước'),
  IN('tasks', 'Nhiệm vụ mẫu', 'list', 'config', 'Bộ task mẫu gắn bước này trong luồng'),
];

/** Bộ đôi chọn model dùng chung cho mọi khối AI. */
const AI_MODEL_FIELDS = [
  {
    key: 'model',
    label: 'Loại model',
    type: 'select',
    options: AI_MODEL_OPTIONS,
    hint: 'Model rẻ đủ dùng cho việc đọc – phân loại; chọn bản mạnh khi cần suy luận sâu.',
  },
  {
    key: 'model_custom',
    label: 'Mã model',
    type: 'text',
    showIf: { model: 'custom' },
    placeholder: 'Ví dụ: gpt-4.1-mini',
  },
];

/** Bộ đôi chọn nguồn dữ liệu phía trước dùng chung cho mọi khối AI. */
const AI_SOURCE_FIELDS = [
  {
    key: 'source',
    label: 'Lấy dữ liệu từ',
    type: 'select',
    options: [
      { value: 'auto', label: 'Mọi khối phía trước' },
      { value: 'pick', label: 'Chọn biến cụ thể' },
    ],
  },
  {
    key: 'source_vars',
    label: 'Biến dữ liệu',
    type: 'variables',
    showIf: { source: 'pick' },
    hint: 'Chọn đúng dữ liệu muốn AI đọc, tránh đưa thừa.',
  },
];

export const SPECIAL_KINDS = [
  {
    kind: NODE_KIND.CONDITION,
    category: 'control',
    label: 'Điều kiện',
    desc: 'Rẽ Có / Không theo điều kiện',
    color: '#d97706',
    outputs: [
      OUT('branch', 'Nhánh đã chọn', 'enum', 'yes | no | else — nhánh luồng đi tiếp'),
      OUT('matched', 'Điều kiện khớp', 'list', 'Các điều kiện đã thoả khi rẽ'),
      OUT('ok', 'Kết quả đúng/sai', 'boolean', 'true nếu đi nhánh Có'),
    ],
    configDefaults: { default_branch: 'else' },
    configFields: [
      { key: 'default_branch', label: 'Nhánh khi không khớp', type: 'select', options: [
        { value: 'else', label: 'Nhánh còn lại (else)' },
        { value: 'stop', label: 'Dừng luồng' },
      ] },
    ],
  },
  {
    kind: NODE_KIND.FORK,
    category: 'control',
    label: 'Tách nhánh',
    desc: 'Mở nhiều nhánh cùng lúc',
    color: '#7c3aed',
    outputs: [
      OUT('opened_branches', 'Nhánh đã mở', 'list', 'Danh sách node được kích hoạt song song'),
    ],
    configDefaults: {},
    configFields: [],
  },
  {
    kind: NODE_KIND.JOIN,
    category: 'control',
    label: 'Gộp nhánh',
    desc: 'Chờ các nhánh vào rồi đi tiếp',
    color: '#6d28d9',
    outputs: [
      OUT('join_result', 'Cách gộp', 'enum', 'all = đủ mọi nhánh · any = nhánh nào xong trước'),
      OUT('completed', 'Nhánh đã xong', 'list', 'Các nhánh vào đã hoàn tất'),
    ],
    configDefaults: {},
    configFields: [],
  },
  {
    kind: NODE_KIND.WAIT,
    category: 'control',
    label: 'Chờ',
    desc: 'Chờ N ngày hoặc một sự kiện',
    color: '#0ea5e9',
    outputs: [
      OUT('wait_until', 'Hết lúc chờ', 'date', 'Mốc thời gian kết thúc chờ'),
      OUT('trigger_event', 'Sự kiện kích hoạt', 'string', 'Sự kiện làm hết chờ (nếu có)'),
    ],
    configDefaults: { wait_type: 'days', days: 1, event: '' },
    configFields: [
      { key: 'wait_type', label: 'Kiểu chờ', type: 'select', options: [
        { value: 'days', label: 'Theo số ngày' },
        { value: 'event', label: 'Theo sự kiện' },
      ] },
      { key: 'days', label: 'Số ngày', type: 'number', min: 1, showIf: { wait_type: 'days' } },
      {
        key: 'event',
        label: 'Sự kiện',
        type: 'event',
        showIf: { wait_type: 'event' },
        hint: 'Danh sách lấy từ các sự kiện hệ thống đang ghi nhận. Chọn «Khác» nếu cần gõ mã sự kiện riêng.',
      },
    ],
  },
  {
    kind: NODE_KIND.APPROVE,
    category: 'control',
    label: 'Phê duyệt',
    desc: 'Chờ quản lý duyệt rồi mới đi tiếp',
    color: '#db2777',
    outputs: [
      OUT('approver', 'Người duyệt', 'object', 'User đã duyệt / từ chối'),
      OUT('decision', 'Kết quả', 'enum', 'approved | rejected'),
      OUT('note', 'Ghi chú duyệt', 'string', 'Lý do / ý kiến người duyệt'),
    ],
    configDefaults: { role: 'sales_admin' },
    configFields: [
      { key: 'role', label: 'Ai được duyệt', type: 'select', options: [
        { value: 'sales_admin', label: 'Sales admin' },
        { value: 'manager', label: 'Quản lý' },
        { value: 'admin', label: 'Admin công ty' },
      ] },
    ],
  },
  {
    kind: NODE_KIND.END,
    category: 'control',
    label: 'Kết thúc',
    desc: 'Điểm dừng của một nhánh',
    color: '#475569',
    outputs: [
      OUT('end_reason', 'Lý do kết thúc', 'enum', 'done | won | lost | cancel'),
    ],
    configDefaults: { reason: 'done' },
    configFields: [
      { key: 'reason', label: 'Lý do', type: 'select', options: [
        { value: 'done', label: 'Hoàn thành' },
        { value: 'won', label: 'Thắng' },
        { value: 'lost', label: 'Mất' },
        { value: 'cancel', label: 'Huỷ' },
      ] },
    ],
  },
  {
    kind: NODE_KIND.REPORT,
    category: 'action',
    label: 'Lấy báo cáo',
    desc: 'Kéo số liệu báo cáo ra để khối sau dùng',
    color: '#2563eb',
    outputs: [
      OUT('data', 'Số liệu', 'object', 'KPI thô dạng JSON — AI đọc được'),
      OUT('text', 'Bản chữ', 'string', 'Báo cáo đã dựng sẵn bằng tiếng Việt'),
      OUT('period', 'Kỳ báo cáo', 'string', 'Nhãn kỳ đã chọn'),
    ],
    configDefaults: { report_type: 'company_leads', period: 'today', company_id: '', department_id: '' },
    configFields: [
      { key: 'report_type', label: 'Loại báo cáo', type: 'select', options: [
        { value: 'company_leads', label: 'KPI lead / deal theo công ty' },
        { value: 'org_overview', label: 'Báo cáo tổ chức' },
        { value: 'deal_risk', label: 'Deal rủi ro & quá hạn' },
        { value: 'employee_activity', label: 'Hoạt động nhân viên' },
      ] },
      { key: 'period', label: 'Kỳ báo cáo', type: 'select', options: REPORT_PERIODS },
      { key: 'company_id', label: 'Công ty', type: 'picker', source: 'company' },
      { key: 'department_id', label: 'Phòng ban (tuỳ chọn)', type: 'picker', source: 'department', allowEmpty: true },
      { key: 'user_id', label: 'Nhân viên', type: 'picker', source: 'user', showIf: { report_type: 'employee_activity' } },
    ],
  },
  {
    kind: NODE_KIND.AI_REPORT,
    category: 'action',
    label: 'AI viết báo cáo',
    desc: 'Đưa số liệu cho AI, nhận lại đoạn báo cáo bằng lời',
    color: '#9333ea',
    outputs: [
      OUT('report_text', 'Báo cáo AI viết', 'string', 'Đoạn chữ để nhắn tin hoặc lưu lại'),
      OUT('used_sources', 'Dữ liệu đã dùng', 'list', 'Các khối phía trước mà AI đã đọc'),
    ],
    configDefaults: {
      mode: 'custom',
      model: 'default',
      source: 'auto',
      instruction: 'Tóm tắt số liệu thành báo cáo ngắn gọn, nêu 3 điểm đáng chú ý và đề xuất hành động.',
      tone: 'concise',
      max_words: 200,
    },
    configFields: [
      {
        key: 'mode',
        label: 'Chế độ viết',
        type: 'select',
        options: [
          { value: 'custom', label: 'Tự viết yêu cầu tại đây' },
          { value: 'playbook', label: 'Dùng mẫu AI đã cài sẵn' },
        ],
      },
      {
        key: 'playbook_id',
        label: 'Mẫu AI',
        type: 'picker',
        source: 'playbook',
        showIf: { mode: 'playbook' },
        hint: 'Lấy từ Cài đặt AI Chat Bot → tab Mẫu nội dung. Prompt, giọng văn và độ dài lấy theo mẫu; dữ liệu vẫn lấy từ các khối phía trước.',
      },
      {
        key: 'model',
        label: 'Loại model',
        type: 'select',
        options: AI_MODEL_OPTIONS,
        hint: 'Model rẻ đủ dùng cho báo cáo số liệu; chọn bản mạnh khi cần phân tích sâu.',
      },
      {
        key: 'model_custom',
        label: 'Mã model',
        type: 'text',
        showIf: { model: 'custom' },
        placeholder: 'Ví dụ: gpt-4.1-mini',
      },
      { key: 'source', label: 'Lấy dữ liệu từ', type: 'select', options: [
        { value: 'auto', label: 'Mọi khối phía trước' },
        { value: 'pick', label: 'Chọn biến cụ thể' },
      ] },
      {
        key: 'source_vars',
        label: 'Biến dữ liệu',
        type: 'variables',
        showIf: { source: 'pick' },
        hint: 'Chọn đúng dữ liệu muốn AI đọc, tránh đưa thừa.',
      },
      {
        key: 'instruction',
        label: 'Yêu cầu cho AI',
        type: 'textarea',
        rows: 4,
        showIf: { mode: 'custom' },
        placeholder: 'Ví dụ: Tóm tắt KPI tuần, nêu deal có nguy cơ trễ và đề xuất việc cần làm.',
      },
      { key: 'tone', label: 'Giọng văn', type: 'select', showIf: { mode: 'custom' }, options: [
        { value: 'concise', label: 'Ngắn gọn, tập trung số liệu' },
        { value: 'detailed', label: 'Chi tiết, có phân tích' },
        { value: 'friendly', label: 'Thân thiện, dễ đọc' },
        { value: 'formal', label: 'Trang trọng, gửi cấp trên' },
      ] },
      { key: 'max_words', label: 'Giới hạn số chữ', type: 'number', min: 50, showIf: { mode: 'custom' } },
    ],
  },
  {
    kind: NODE_KIND.AI_DEADLINE,
    category: 'action',
    label: 'AI nhắc deadline',
    desc: 'AI viết tin nhắc việc sắp/quá hạn',
    color: '#ea580c',
    outputs: [
      OUT('overdue_tasks', 'Việc quá hạn', 'list', 'Task / deal sắp hạn và quá hạn trong cửa sổ'),
      OUT('reminder_text', 'Nội dung nhắc', 'string', 'Đoạn AI viết để gửi thông báo'),
      OUT('recipients', 'Người nhận', 'list', 'User sẽ nhận digest / Zalo'),
      OUT('digest_date', 'Ngày digest', 'date', 'Ngày chạy nhắc'),
    ],
    configDefaults: { window_days: 3, channel: 'in_app' },
    configFields: [
      { key: 'window_days', label: 'Cửa sổ (ngày)', type: 'number', min: 1 },
      { key: 'channel', label: 'Kênh gửi', type: 'select', options: [
        { value: 'in_app', label: 'Thông báo trong app' },
        { value: 'zalo', label: 'Zalo' },
        { value: 'group', label: 'Nhóm chat' },
      ] },
    ],
  },
  {
    kind: NODE_KIND.NOTIFY,
    category: 'action',
    label: 'Nhắn tin',
    desc: 'Đẩy nội dung ra nhóm chat, Zalo hoặc thông báo trong app',
    color: '#0f766e',
    outputs: [
      OUT('channel', 'Kênh đã gửi', 'enum', 'group | department | dm | in_app | zalo'),
      OUT('message', 'Nội dung đã gửi', 'string', 'Tin sau khi thay biến'),
      OUT('sent_to', 'Người nhận', 'list', 'Danh sách đã nhận'),
    ],
    configDefaults: { channel: 'group', target_id: '', title: '', content: '' },
    configFields: [
      { key: 'channel', label: 'Gửi qua', type: 'select', options: [
        { value: 'group', label: 'Nhóm chat' },
        { value: 'department', label: 'Chat phòng ban' },
        { value: 'dm', label: 'Tin nhắn riêng (bot gửi)' },
        { value: 'in_app', label: 'Thông báo trong app' },
      ] },
      { key: 'target_id', label: 'Nhóm nhận', type: 'picker', source: 'group', showIf: { channel: 'group' } },
      { key: 'target_id', label: 'Phòng ban nhận', type: 'picker', source: 'department', showIf: { channel: 'department' } },
      {
        key: 'recipients',
        label: 'Người nhận',
        type: 'people',
        showIf: { channel: 'dm' },
        hint: 'Chọn được nhiều người. «Thành viên hồ sơ» lấy đúng người đang phụ trách deal / dự án lúc chạy.',
      },
      {
        key: 'recipients',
        label: 'Người nhận',
        type: 'people',
        showIf: { channel: 'in_app' },
        hint: 'Chọn được nhiều người. «Thành viên hồ sơ» lấy đúng người đang phụ trách deal / dự án lúc chạy.',
      },
      { key: 'title', label: 'Tiêu đề thông báo', type: 'text', showIf: { channel: 'in_app' } },
      {
        key: 'content',
        label: 'Nội dung tin',
        type: 'textarea',
        rows: 5,
        variables: true,
        placeholder: 'Bấm «Chèn dữ liệu» để lấy kết quả từ khối phía trước.',
        hint: 'Để trống thì lấy nguyên văn kết quả của khối liền trước.',
      },
    ],
  },
  {
    kind: NODE_KIND.AI_CLASSIFY,
    category: 'action',
    label: 'AI phân loại',
    desc: 'AI đọc dữ liệu rồi chọn một nhãn để rẽ nhánh',
    color: '#c026d3',
    outputs: [
      OUT('label', 'Nhãn đã chọn', 'enum', 'Một nhãn trong danh sách khai báo — trùng nhãn cạnh nào thì đi nhánh đó'),
      OUT('reason', 'Lý do', 'string', 'Câu giải thích ngắn vì sao AI chọn nhãn này'),
      OUT('confidence', 'Độ chắc chắn', 'number', 'Từ 0 đến 1 — dưới ngưỡng thì rơi về nhãn dự phòng'),
    ],
    configDefaults: {
      source: 'auto',
      model: 'default',
      labels: ['Gấp', 'Theo dõi', 'Bỏ qua'],
      instruction: 'Đọc tình trạng hồ sơ và chọn mức ưu tiên xử lý.',
      fallback_label: 'Theo dõi',
      min_confidence: 0,
    },
    configFields: [
      ...AI_SOURCE_FIELDS,
      {
        key: 'labels',
        label: 'Danh sách nhãn',
        type: 'labels',
        hint: 'Đặt nhãn cạnh đi ra đúng bằng tên nhãn ở đây thì nhánh đó mới chạy. Cạnh không đặt nhãn luôn chạy.',
      },
      {
        key: 'instruction',
        label: 'Tiêu chí phân loại',
        type: 'textarea',
        rows: 4,
        placeholder: 'Ví dụ: Deal quá hạn hoặc khách hối thì là Gấp; mới liên hệ trong tuần thì Theo dõi.',
      },
      {
        key: 'fallback_label',
        label: 'Nhãn dự phòng',
        type: 'text',
        hint: 'Dùng khi AI trả nhãn lạ hoặc chưa đủ chắc chắn.',
      },
      {
        key: 'min_confidence',
        label: 'Độ chắc tối thiểu',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.1,
        hint: 'Để 0 là luôn lấy nhãn AI chọn. Đặt 0.7 thì dưới mức đó sẽ về nhãn dự phòng.',
      },
      ...AI_MODEL_FIELDS,
    ],
  },
  {
    kind: NODE_KIND.AI_EXTRACT,
    category: 'action',
    label: 'AI bóc dữ liệu',
    desc: 'Rút các trường đã khai báo ra khỏi văn bản thành biến',
    color: '#0891b2',
    outputs: [
      OUT('extracted', 'Toàn bộ kết quả', 'object', 'Tất cả trường đã bóc, dạng JSON'),
      OUT('missing_fields', 'Trường không thấy', 'list', 'Những trường AI không tìm được trong dữ liệu'),
    ],
    configDefaults: {
      source: 'auto',
      model: 'default',
      fields: [{ key: 'dia_chi', label: 'Địa chỉ lắp đặt' }],
      on_missing: 'empty',
    },
    configFields: [
      ...AI_SOURCE_FIELDS,
      {
        key: 'fields',
        label: 'Trường cần bóc',
        type: 'fields',
        hint: 'Mã trường viết không dấu, không khoảng trắng. Khối sau chèn bằng {{khối này.mã trường}}.',
      },
      {
        key: 'on_missing',
        label: 'Khi thiếu dữ liệu',
        type: 'select',
        options: [
          { value: 'empty', label: 'Để trống, vẫn chạy tiếp' },
          { value: 'error', label: 'Báo lỗi, dừng khối' },
        ],
      },
      ...AI_MODEL_FIELDS,
    ],
  },
  {
    kind: NODE_KIND.AI_ASK,
    category: 'action',
    label: 'AI hỏi đáp',
    desc: 'Đặt một câu hỏi, AI trả lời dựa trên dữ liệu và tài liệu đã chọn',
    color: '#4f46e5',
    outputs: [
      OUT('answer', 'Câu trả lời', 'string', 'Đoạn chữ để nhắn tin hoặc đưa vào khối sau'),
      OUT('sources_used', 'Nguồn đã đọc', 'list', 'Khối dữ liệu và bài học AI đã dùng'),
      OUT('not_found', 'Không đủ dữ liệu', 'boolean', 'true khi tài liệu không chứa câu trả lời'),
    ],
    configDefaults: {
      source: 'auto',
      model: 'default',
      question: '',
      lesson_ids: [],
      max_words: 150,
    },
    configFields: [
      {
        key: 'question',
        label: 'Câu hỏi',
        type: 'textarea',
        rows: 3,
        variables: true,
        placeholder: 'Ví dụ: Quy định bảo hành cho tủ bếp acrylic là bao lâu?',
      },
      ...AI_SOURCE_FIELDS,
      {
        key: 'lesson_ids',
        label: 'Tài liệu tham chiếu',
        type: 'lessons',
        hint: 'Lấy từ Kiến thức — AI chỉ được trả lời dựa trên nội dung bài học đã chọn và dữ liệu phía trước.',
      },
      { key: 'max_words', label: 'Giới hạn số chữ', type: 'number', min: 30 },
      ...AI_MODEL_FIELDS,
    ],
  },
];

const SPECIAL_BY_KIND = new Map(SPECIAL_KINDS.map((k) => [k.kind, k]));

export function isSpecialKind(kind) {
  return Boolean(kind && kind !== NODE_KIND.MODULE && SPECIAL_BY_KIND.has(kind));
}

export function specialMeta(kind) {
  return SPECIAL_BY_KIND.get(kind) || null;
}

export function propertiesForNode(data = {}) {
  const kind = data.node_kind || NODE_KIND.MODULE;
  if (isSpecialKind(kind)) {
    return (specialMeta(kind)?.outputs || []).map((o) => ({ ...o, role: 'output' }));
  }
  const key = String(data.module_key || '').toLowerCase();
  return MODULE_PROPERTIES[key] || MODULE_PROPERTIES.projects || [];
}

export function conditionsCatalogForNode(data = {}) {
  const kind = data.node_kind || NODE_KIND.MODULE;
  if (kind === NODE_KIND.CONDITION || kind === NODE_KIND.MODULE) {
    const key = String(data.module_key || '').toLowerCase();
    if (MODULE_CONDITIONS[key]) return MODULE_CONDITIONS[key];
    if (kind === NODE_KIND.CONDITION) {
      return [
        ...MODULE_CONDITIONS.crm,
        ...MODULE_CONDITIONS.production,
        ...MODULE_CONDITIONS.logistics,
      ];
    }
  }
  return [];
}

export function controlKinds() {
  return SPECIAL_KINDS.filter((k) => k.category === 'control');
}

export function actionKinds() {
  return SPECIAL_KINDS.filter((k) => k.category === 'action');
}

export function defaultNodeConfig(kind) {
  const meta = specialMeta(kind);
  return { ...(meta?.configDefaults || {}) };
}

export function rfNodeType(kind) {
  return isSpecialKind(kind) ? 'specialNode' : 'moduleNode';
}

export function outputsForNode(data = {}, customModule = false) {
  const kind = data.node_kind || NODE_KIND.MODULE;
  if (kind === NODE_KIND.AI_EXTRACT) {
    // Trường do người dùng khai báo mới là thứ khối sau chèn — đứng trước cho dễ thấy.
    const declared = (data.node_config?.fields || [])
      .filter((f) => f?.key)
      .map((f) => OUT(String(f.key), f.label || f.key, 'string', 'Giá trị AI bóc được từ dữ liệu phía trước'));
    return [...declared, ...(specialMeta(kind)?.outputs || [])];
  }
  if (isSpecialKind(kind)) return specialMeta(kind)?.outputs || [];
  const key = String(data.module_key || '').toLowerCase();
  if (MODULE_OUTPUTS[key]) return MODULE_OUTPUTS[key];
  if (customModule || data.isCustom) return CUSTOM_MODULE_OUTPUTS;
  return CUSTOM_MODULE_OUTPUTS;
}

/** Trường bước này nhận từ bước trước. Khối điều khiển / hành động không có. */
export function inputsForNode(data = {}, customModule = false) {
  const kind = data.node_kind || NODE_KIND.MODULE;
  if (isSpecialKind(kind)) return [];
  const key = String(data.module_key || '').toLowerCase();
  if (MODULE_INPUTS[key]) return MODULE_INPUTS[key];
  if (customModule || data.isCustom) return CUSTOM_MODULE_INPUTS;
  return CUSTOM_MODULE_INPUTS;
}

export function outputTypeLabel(type) {
  return ({
    object: 'Đối tượng',
    list: 'Danh sách',
    string: 'Chữ',
    number: 'Số',
    date: 'Ngày',
    boolean: 'Đúng/sai',
    enum: 'Lựa chọn',
    file: 'Tệp',
  })[type] || type;
}

/** Payload kéo từ palette — JSON, tương thích chuỗi module_key cũ. */
export function encodePalettePayload(payload) {
  return JSON.stringify(payload);
}

export function decodePalettePayload(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch { /* chuỗi cũ */ }
  return { kind: NODE_KIND.MODULE, moduleKey: raw };
}

export function nodeDisplayLabel(data, moduleLabelFn) {
  if (isSpecialKind(data?.node_kind)) {
    return data.label || specialMeta(data.node_kind)?.label || data.node_kind;
  }
  if (typeof moduleLabelFn === 'function') return moduleLabelFn(data?.module_key);
  return data?.label || data?.module_key || 'Node';
}
