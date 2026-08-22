-- Migration 542: ba khối AI mới cho luồng công việc.
--
-- ai_classify: AI đọc dữ liệu phía trước rồi chọn một nhãn trong danh sách đã khai báo.
--              Nhãn trùng với label của cạnh đi ra → luồng chỉ chạy tiếp nhánh đó.
-- ai_extract : AI bóc các trường đã khai báo ra khỏi văn bản, mỗi trường thành một biến
--              để khối sau chèn bằng {{node.ten_truong}}.
-- ai_ask     : AI trả lời một câu hỏi dựa trên dữ liệu phía trước và bài học đã chọn.

ALTER TABLE workflow_flow_steps DROP CONSTRAINT IF EXISTS chk_wfs_node_kind;

ALTER TABLE workflow_flow_steps
  ADD CONSTRAINT chk_wfs_node_kind
  CHECK (node_kind IN (
    'module', 'condition', 'fork', 'join', 'wait', 'approve', 'end',
    'report', 'ai_deadline', 'notify', 'ai_report',
    'ai_classify', 'ai_extract', 'ai_ask'
  ));

ALTER TABLE workflow_flow_action_runs DROP CONSTRAINT IF EXISTS chk_wfar_node_kind;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_flow_action_runs' AND column_name = 'node_kind'
  ) THEN
    ALTER TABLE workflow_flow_action_runs
      ADD CONSTRAINT chk_wfar_node_kind
      CHECK (node_kind IN (
        'report', 'ai_report', 'notify', 'ai_classify', 'ai_extract', 'ai_ask'
      ));
  END IF;
END $$;

COMMENT ON COLUMN workflow_flow_edges.label IS
  'Nhãn cạnh — với nhánh sau khối AI phân loại, nhãn phải trùng nhãn AI chọn thì nhánh mới chạy';
