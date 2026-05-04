-- Chi phí ghi nhận trên dự án (bổ sung cho lịch sử thu chi — không thay thế kế toán)

CREATE TABLE IF NOT EXISTS project_expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  expense_date DATE DEFAULT CURRENT_DATE,
  category TEXT,
  description TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_expenses_project ON project_expenses(project_id);
CREATE INDEX IF NOT EXISTS idx_project_expenses_date ON project_expenses(expense_date);

ALTER TABLE project_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_project_expenses" ON project_expenses FOR ALL USING (true);

COMMENT ON TABLE project_expenses IS 'Chi phí gắn dự án (vật tư phát sinh, ngoài HĐ...) — hiển thị trong Thu chi dự án';
