-- TuBep Pro - Chạy trong Supabase SQL Editor
-- Bước 1: Tạo bảng

CREATE TYPE user_role AS ENUM ('admin','manager','designer','sales','production','driver','installer','customer_care','staff');
CREATE TYPE project_status AS ENUM ('new','consulting','designing','quoting','contract_signed','producing','shipping','installing','warranty','completed','cancelled');
CREATE TYPE task_priority AS ENUM ('low','medium','high','urgent');
CREATE TYPE task_status AS ENUM ('todo','in_progress','review','done','blocked');
CREATE TYPE notification_type AS ENUM ('task_assigned','task_updated','task_overdue','comment_added','project_stage_changed','payment_received','deadline_reminder','system');

CREATE TABLE workflow_stages (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(100) NOT NULL, slug VARCHAR(100) NOT NULL UNIQUE, description TEXT, order_index INT NOT NULL DEFAULT 0, color VARCHAR(7) DEFAULT '#3B82F6', icon VARCHAR(50), is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE departments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(100) NOT NULL, slug VARCHAR(100) NOT NULL UNIQUE, description TEXT, color VARCHAR(7) DEFAULT '#6366F1', created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email VARCHAR(255) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL, full_name VARCHAR(255) NOT NULL, phone VARCHAR(20), avatar VARCHAR(500), role user_role NOT NULL DEFAULT 'staff', department_id UUID REFERENCES departments(id), is_active BOOLEAN DEFAULT true, last_login_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE customers (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), full_name VARCHAR(255) NOT NULL, phone VARCHAR(20) NOT NULL, email VARCHAR(255), address TEXT, district VARCHAR(100), city VARCHAR(100), notes TEXT, source VARCHAR(50), created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE projects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code VARCHAR(20) NOT NULL UNIQUE, name VARCHAR(255) NOT NULL, description TEXT, customer_id UUID REFERENCES customers(id) NOT NULL, status project_status NOT NULL DEFAULT 'new', current_stage_id UUID REFERENCES workflow_stages(id), kitchen_type VARCHAR(50), material VARCHAR(100), dimensions JSONB, install_address TEXT, estimated_value NUMERIC(15,0), final_value NUMERIC(15,0), consult_date TIMESTAMPTZ, design_deadline TIMESTAMPTZ, production_start_date TIMESTAMPTZ, install_date TIMESTAMPTZ, completed_date TIMESTAMPTZ, sales_person_id UUID REFERENCES users(id), designer_id UUID REFERENCES users(id), project_manager_id UUID REFERENCES users(id), priority task_priority DEFAULT 'medium', tags JSONB DEFAULT '[]', created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE tasks (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID REFERENCES projects(id) NOT NULL, stage_id UUID REFERENCES workflow_stages(id), title VARCHAR(500) NOT NULL, description TEXT, status task_status NOT NULL DEFAULT 'todo', priority task_priority DEFAULT 'medium', assignee_id UUID REFERENCES users(id), created_by_id UUID REFERENCES users(id), due_date TIMESTAMPTZ, start_date TIMESTAMPTZ, completed_at TIMESTAMPTZ, estimated_hours NUMERIC(5,1), actual_hours NUMERIC(5,1), order_index INT DEFAULT 0, metadata JSONB, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE notifications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id) NOT NULL, type notification_type NOT NULL, title VARCHAR(255) NOT NULL, message TEXT, entity_type VARCHAR(30), entity_id UUID, is_read BOOLEAN DEFAULT false, read_at TIMESTAMPTZ, metadata JSONB, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE activity_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id), action VARCHAR(50) NOT NULL, entity_type VARCHAR(30) NOT NULL, entity_id UUID NOT NULL, old_values JSONB, new_values JSONB, description TEXT, created_at TIMESTAMPTZ DEFAULT now());

CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);

ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE projects;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON notifications FOR ALL USING (true) WITH CHECK (true);
