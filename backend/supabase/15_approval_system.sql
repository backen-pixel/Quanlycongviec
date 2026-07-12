-- Migration 15: Approval System — Quy tắc duyệt tự động + Duyệt dự án
-- Bảng quy tắc duyệt cho từng quy trình + bảng lệnh duyệt dự án

-- ═══ BẢNG QUY TẮC DUYỆT ═══
-- Mỗi workflow_stage có 1 quy tắc duyệt
CREATE TABLE IF NOT EXISTS approval_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID REFERENCES workflow_stages(id) ON DELETE CASCADE NOT NULL,
  -- 'auto' = tự động duyệt khi điều kiện thỏa mãn
  -- 'manual' = bắt buộc chờ người chịu trách nhiệm duyệt
  approval_mode VARCHAR(20) NOT NULL DEFAULT 'manual',
  -- Điều kiện tự động duyệt (chỉ áp dụng khi mode = 'auto')
  -- 'checklist_complete' = tất cả checklist đã tick
  -- 'checklist_has_files' = tất cả checklist có file đính kèm
  -- 'checklist_has_notes' = tất cả checklist có ghi chú
  -- 'checklist_has_files_or_notes' = checklist có file HOẶC ghi chú
  -- 'all_tasks_done' = tất cả tasks done (default behavior)
  auto_condition VARCHAR(50) DEFAULT 'all_tasks_done',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(stage_id)
);

-- ═══ BẢNG DUYỆT DỰ ÁN ═══
-- Mỗi lệnh chờ duyệt / đã duyệt / từ chối
CREATE TABLE IF NOT EXISTS project_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  stage_id UUID REFERENCES workflow_stages(id) NOT NULL,
  -- Người yêu cầu duyệt
  requested_by UUID REFERENCES users(id) NOT NULL,
  -- Người duyệt / từ chối
  decided_by UUID REFERENCES users(id),
  -- 'pending' | 'approved' | 'rejected' | 'auto_approved'
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- Ghi chú từ người yêu cầu
  notes TEXT,
  -- File đính kèm từ người yêu cầu
  attachments JSONB DEFAULT '[]'::jsonb,
  -- Lý do từ chối (khi status = 'rejected')
  reject_reason TEXT,
  -- Ghi chú khi duyệt
  approve_notes TEXT,
  -- Giai đoạn tiếp theo sau khi duyệt
  next_stage_slug VARCHAR(100),
  next_status VARCHAR(50),
  -- Timestamps
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_approvals_project ON project_approvals(project_id);
CREATE INDEX IF NOT EXISTS idx_project_approvals_status ON project_approvals(status);
CREATE INDEX IF NOT EXISTS idx_project_approvals_stage ON project_approvals(stage_id);
CREATE INDEX IF NOT EXISTS idx_project_approvals_requested_by ON project_approvals(requested_by);

-- RLS
ALTER TABLE approval_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON approval_rules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON project_approvals FOR ALL USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE project_approvals;

-- ═══ Seed default rules: tất cả quy trình mặc định là manual ═══
INSERT INTO approval_rules (stage_id, approval_mode, auto_condition, description)
SELECT id, 'manual', 'all_tasks_done', 'Bắt buộc chờ duyệt từ quản lý'
FROM workflow_stages
ON CONFLICT (stage_id) DO NOTHING;
