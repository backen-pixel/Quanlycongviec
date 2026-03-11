# Kế Hoạch: Dashboard Động Theo Khối (Dynamic Division Dashboard)

## 🎯 Nguyên Tắc Thiết Kế

### **KHÔNG fix cứng số khối**
- ✅ Tạo/xóa khối tùy ý từ database
- ✅ Mỗi khối tự động có dashboard riêng
- ✅ Widgets hiển thị theo cấu hình khối
- ✅ Trực quan, dễ hiểu, focus vào dự án & công việc

### **Core Concept:**
```
Khối (Division) → Dự Án (Projects) → Công Việc (Tasks)
       ↓
   Dashboard tự động tạo theo template
```

---

## 📊 Kiến Trúc Động (Dynamic Architecture)

### **1. Database Schema - Linh Hoạt**

```sql
-- ecosystem_units table (đã có)
CREATE TABLE ecosystem_units (
  id UUID PRIMARY KEY,
  name VARCHAR(200),              -- "Khối Sản xuất", "Khối Kinh doanh"
  slug VARCHAR(100),              -- "production", "sales"
  level_id UUID,                  -- FK to ecosystem_levels
  parent_id UUID,                 -- NULL cho khối (top level)
  color VARCHAR(20),              -- "#F59E0B" cho màu sắc
  icon VARCHAR(50),               -- "🏭" emoji icon
  
  -- NEW: Dashboard config (JSON)
  dashboard_config JSONB DEFAULT '{
    "kpi_cards": ["projects", "tasks", "team", "progress"],
    "widgets": ["project_list", "task_kanban", "timeline", "alerts"],
    "metrics": {
      "projects": {"label": "Dự án", "icon": "📁"},
      "tasks": {"label": "Công việc", "icon": "✅"}
    }
  }'
);

-- Division-Project mapping (quan hệ N-N)
CREATE TABLE division_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id UUID REFERENCES ecosystem_units(id),
  project_id UUID REFERENCES projects(id),
  role VARCHAR(50),               -- "owner", "contributor", "viewer"
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(division_id, project_id)
);

-- Division-User mapping
CREATE TABLE division_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id UUID REFERENCES ecosystem_units(id),
  user_id UUID REFERENCES users(id),
  role VARCHAR(50),               -- "manager", "member", "viewer"
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(division_id, user_id)
);

CREATE INDEX idx_division_projects_division ON division_projects(division_id);
CREATE INDEX idx_division_members_division ON division_members(division_id);
```

---

## 🎨 Dashboard Template - Đồng Nhất

**MỌI KHỐI dùng CHUNG template, dữ liệu tự động filter theo khối**

### **Layout Chuẩn:**

```
┌────────────────────────────────────────────────────────────┐
│ 🏢 [Tên Khối]                    👤 [Giám đốc khối]       │
│ ← Quay lại Dashboard Tổng                                  │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┬──────────┬──────────┬──────────┐            │
│  │ 📁 DỰ ÁN │ ✅ CÔNG  │ 👥 NHÂN  │ 📊 TIẾN  │  ← KPI      │
│  │          │    VIỆC  │    SỰ    │    ĐỘ    │            │
│  └──────────┴──────────┴──────────┴──────────┘            │
│                                                             │
│  ┌─────────────────────────────────────────────┐           │
│  │ 📋 DANH SÁCH DỰ ÁN CỦA KHỐI                │  ← Main   │
│  │ [Filter: Trạng thái ▼] [Ưu tiên ▼] [🔍]   │    Focus  │
│  │                                              │           │
│  │ TB-045 │ Tủ bếp Vinhomes │ Sản xuất │ 75%  │           │
│  │ TB-046 │ Nhà bếp Golden  │ Hoàn thiện│ 66% │           │
│  │ ...                                          │           │
│  └─────────────────────────────────────────────┘           │
│                                                             │
│  ┌───────────────────────┬───────────────────────┐         │
│  │ ✅ CÔNG VIỆC (KANBAN) │ ⚠️ CẢNH BÁO          │         │
│  │ Todo │ Doing │ Done   │ • 5 dự án quá hạn    │         │
│  │  12  │  25   │  156   │ • 8 tasks chưa giao  │         │
│  └───────────────────────┴───────────────────────┘         │
│                                                             │
│  ┌─────────────────────────────────────────────┐           │
│  │ 📊 BIỂU ĐỒ TIẾN ĐỘ                         │  ← Charts │
│  │ [Line chart: Progress theo tuần]            │           │
│  └─────────────────────────────────────────────┘           │
└────────────────────────────────────────────────────────────┘
```

---

## 🔧 Implementation - Dynamic System

### **Backend API - Generic cho mọi khối**

```javascript
// routes/divisions.js

// GET /api/divisions
// Lấy danh sách TẤT CẢ khối (dynamic)
router.get('/', auth, async (req, res) => {
  // Lấy khối từ ecosystem_units (level = 'Khối')
  const { data: divisions } = await supabase
    .from('ecosystem_units')
    .select('*')
    .eq('level_id', (await supabase.from('ecosystem_levels')
      .select('id').eq('name', 'Khối').single()).data.id)
    .order('name');
  
  // Đếm dự án & tasks cho mỗi khối
  const divisionsWithStats = await Promise.all(
    divisions.map(async (div) => {
      const { count: projectCount } = await supabase
        .from('division_projects')
        .select('*', { count: 'exact', head: true })
        .eq('division_id', div.id);
      
      const { count: taskCount } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .in('project_id', (await supabase
          .from('division_projects')
          .select('project_id')
          .eq('division_id', div.id)).data.map(p => p.project_id));
      
      return {
        ...div,
        project_count: projectCount || 0,
        task_count: taskCount || 0,
      };
    })
  );
  
  res.json({ divisions: divisionsWithStats });
});

// GET /api/divisions/:divisionId/dashboard
// Dashboard cho BẤT KỲ khối nào (generic)
router.get('/:divisionId/dashboard', auth, checkAccess, async (req, res) => {
  const { divisionId } = req.params;
  
  // 1. Lấy thông tin khối
  const { data: division } = await supabase
    .from('ecosystem_units')
    .select('*')
    .eq('id', divisionId)
    .single();
  
  // 2. KPIs
  const kpis = await calculateDivisionKPIs(divisionId);
  
  // 3. Danh sách dự án
  const { data: projectIds } = await supabase
    .from('division_projects')
    .select('project_id')
    .eq('division_id', divisionId);
  
  const { data: projects } = await supabase
    .from('projects')
    .select('*, current_stage:workflow_stages(name, color)')
    .in('id', projectIds.map(p => p.project_id));
  
  // 4. Công việc (tasks) theo dự án
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .in('project_id', projectIds.map(p => p.project_id));
  
  // 5. Nhân sự
  const { data: members } = await supabase
    .from('division_members')
    .select('*, user:users(id, full_name, email, avatar)')
    .eq('division_id', divisionId);
  
  // 6. Cảnh báo
  const alerts = await calculateAlerts(divisionId);
  
  res.json({
    division,
    kpis,
    projects,
    tasks,
    members,
    alerts,
  });
});

// Helper: Calculate KPIs
async function calculateDivisionKPIs(divisionId) {
  const projectIds = (await supabase
    .from('division_projects')
    .select('project_id')
    .eq('division_id', divisionId)).data.map(p => p.project_id);
  
  // Dự án
  const { count: totalProjects } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .in('id', projectIds);
  
  const { count: activeProjects } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .in('id', projectIds)
    .neq('status', 'completed');
  
  const { count: completedProjects } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .in('id', projectIds)
    .eq('status', 'completed');
  
  // Công việc
  const { count: totalTasks } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .in('project_id', projectIds);
  
  const { count: completedTasks } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .in('project_id', projectIds)
    .eq('status', 'done');
  
  // Nhân sự
  const { count: totalMembers } = await supabase
    .from('division_members')
    .select('*', { count: 'exact', head: true })
    .eq('division_id', divisionId);
  
  // Tiến độ
  const progress = totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(1) : 0;
  
  return {
    projects: {
      total: totalProjects || 0,
      active: activeProjects || 0,
      completed: completedProjects || 0,
    },
    tasks: {
      total: totalTasks || 0,
      completed: completedTasks || 0,
      completion_rate: parseFloat(progress),
    },
    members: {
      total: totalMembers || 0,
    },
    progress: parseFloat(progress),
  };
}
```

---

## 🎨 Frontend - Single Component cho Mọi Khối

```javascript
// pages/DivisionDashboard.jsx

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../lib/api';

export default function DivisionDashboard() {
  const { divisionId } = useParams();
  const [division, setDivision] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDivisionDashboard();
  }, [divisionId]);

  const loadDivisionDashboard = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/divisions/${divisionId}/dashboard`);
      setDivision(data.division);
      setKpis(data.kpis);
      setProjects(data.projects);
      setTasks(data.tasks);
    } catch (err) {
      console.error('Failed to load division dashboard:', err);
    }
    setLoading(false);
  };

  if (loading || !division) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <span className="text-4xl">{division.icon}</span>
          <h1 className="text-3xl font-bold text-gray-900">{division.name}</h1>
        </div>
        <p className="text-gray-600 mt-1">{division.description}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <KPICard
          title="Dự Án"
          value={kpis.projects.total}
          subtitle={`${kpis.projects.active} đang làm`}
          icon="📁"
          color="blue"
        />
        <KPICard
          title="Công Việc"
          value={`${kpis.tasks.completion_rate}%`}
          subtitle={`${kpis.tasks.completed}/${kpis.tasks.total}`}
          icon="✅"
          color="emerald"
        />
        <KPICard
          title="Nhân Sự"
          value={kpis.members.total}
          subtitle="thành viên"
          icon="👥"
          color="purple"
        />
        <KPICard
          title="Tiến Độ"
          value={`${kpis.progress}%`}
          subtitle="hoàn thành"
          icon="📊"
          color="amber"
        />
      </div>

      {/* Project List */}
      <ProjectList projects={projects} divisionName={division.name} />

      {/* Task Kanban + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2">
          <TaskKanban tasks={tasks} />
        </div>
        <div>
          <AlertsWidget divisionId={divisionId} />
        </div>
      </div>
    </div>
  );
}

// KPI Card Component
function KPICard({ title, value, subtitle, icon, color }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    purple: 'bg-purple-50 text-purple-600',
    amber: 'bg-amber-50 text-amber-600',
  };

  return (
    <div className="bg-white rounded-xl border p-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-3xl">{icon}</span>
        <span className="text-xs font-semibold text-gray-500 uppercase">{title}</span>
      </div>
      <div className="text-3xl font-bold text-gray-900 mb-1">{value}</div>
      <div className="text-sm text-gray-600">{subtitle}</div>
    </div>
  );
}

// Project List Component
function ProjectList({ projects, divisionName }) {
  const [filter, setFilter] = useState('all');

  const filteredProjects = projects.filter(p => {
    if (filter === 'all') return true;
    return p.status === filter;
  });

  return (
    <div className="bg-white rounded-xl border p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">
          📋 Dự Án Của {divisionName}
        </h2>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-4 py-2 border rounded-lg text-sm"
        >
          <option value="all">Tất cả</option>
          <option value="consulting">Tư vấn</option>
          <option value="designing">Thiết kế</option>
          <option value="producing">Sản xuất</option>
          <option value="completed">Hoàn thành</option>
        </select>
      </div>

      <div className="space-y-3">
        {filteredProjects.map(project => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </div>
  );
}

// Project Card
function ProjectCard({ project }) {
  const progress = project.tasks_completed && project.tasks_total
    ? (project.tasks_completed / project.tasks_total) * 100
    : 0;

  return (
    <div className="border rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="font-semibold text-gray-900">{project.name}</h3>
          <p className="text-xs text-gray-500">{project.code}</p>
        </div>
        <span
          className="px-3 py-1 rounded-full text-xs font-medium"
          style={{
            backgroundColor: project.current_stage?.color + '20',
            color: project.current_stage?.color,
          }}
        >
          {project.current_stage?.name}
        </span>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2 mt-3">
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs font-medium text-gray-600">
          {Math.round(progress)}%
        </span>
      </div>

      <div className="flex items-center gap-4 mt-3 text-xs text-gray-600">
        <span>✅ {project.tasks_completed || 0}/{project.tasks_total || 0} tasks</span>
        <span>📅 {new Date(project.deadline).toLocaleDateString('vi-VN')}</span>
        <span className={project.priority === 'high' ? 'text-red-600' : ''}>
          {project.priority === 'high' ? '🔴 Cao' : '🟡 TB'}
        </span>
      </div>
    </div>
  );
}

// Task Kanban
function TaskKanban({ tasks }) {
  const columns = {
    todo: tasks.filter(t => t.status === 'pending'),
    doing: tasks.filter(t => ['in_progress', 'review'].includes(t.status)),
    done: tasks.filter(t => t.status === 'done'),
  };

  return (
    <div className="bg-white rounded-xl border p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-6">
        ✅ Công Việc (Kanban)
      </h2>
      <div className="grid grid-cols-3 gap-4">
        <KanbanColumn title="Todo" count={columns.todo.length} tasks={columns.todo} color="gray" />
        <KanbanColumn title="Doing" count={columns.doing.length} tasks={columns.doing} color="blue" />
        <KanbanColumn title="Done" count={columns.done.length} tasks={columns.done} color="emerald" />
      </div>
    </div>
  );
}

function KanbanColumn({ title, count, tasks, color }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-700">{title}</h3>
        <span className={`px-2 py-1 rounded text-xs font-bold bg-${color}-100 text-${color}-700`}>
          {count}
        </span>
      </div>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {tasks.slice(0, 5).map(task => (
          <div key={task.id} className="bg-white rounded p-3 text-sm border">
            <p className="font-medium text-gray-900">{task.title}</p>
            <p className="text-xs text-gray-500 mt-1">{task.assignee?.full_name}</p>
          </div>
        ))}
        {tasks.length > 5 && (
          <p className="text-xs text-gray-500 text-center">+{tasks.length - 5} more</p>
        )}
      </div>
    </div>
  );
}
```

---

## 🚀 Cách Thêm/Bớt Khối

### **1. Thêm khối mới (từ UI Admin)**

```javascript
// POST /api/divisions
async function createDivision(req, res) {
  const { name, slug, icon, color, description } = req.body;
  
  const khoiLevelId = (await supabase
    .from('ecosystem_levels')
    .select('id')
    .eq('name', 'Khối')
    .single()).data.id;
  
  const { data, error } = await supabase
    .from('ecosystem_units')
    .insert({
      name,
      slug,
      icon,
      color,
      description,
      level_id: khoiLevelId,
      parent_id: null, // Top level
    })
    .select()
    .single();
  
  res.json({ division: data });
}
```

**Example:**
```bash
POST /api/divisions
{
  "name": "Khối Logistics",
  "slug": "logistics",
  "icon": "🚚",
  "color": "#10B981",
  "description": "Vận chuyển và kho bãi"
}
```

→ **Tự động có dashboard tại** `/divisions/logistics`

### **2. Gán dự án vào khối**

```javascript
// POST /api/divisions/:divisionId/projects
async function assignProject(req, res) {
  const { divisionId } = req.params;
  const { project_id, role } = req.body;
  
  await supabase.from('division_projects').insert({
    division_id: divisionId,
    project_id,
    role: role || 'owner',
  });
  
  res.json({ success: true });
}
```

### **3. Gán nhân viên vào khối**

```javascript
// POST /api/divisions/:divisionId/members
async function addMember(req, res) {
  const { divisionId } = req.params;
  const { user_id, role } = req.body;
  
  await supabase.from('division_members').insert({
    division_id: divisionId,
    user_id,
    role: role || 'member',
  });
  
  res.json({ success: true });
}
```

---

## 🎯 Luồng Sử Dụng (User Flow)

### **1. CEO/COO login → Dashboard Tổng**
```
/dashboard
  │
  ├─ Thấy: Overview cards của TẤT CẢ khối (động)
  │         [🏭 Sản xuất] [💼 Kinh doanh] [🛠️ Hỗ trợ] [🚚 Logistics]
  │
  └─ Click card → `/divisions/:id`
```

### **2. Giám đốc Khối login → Dashboard khối mình**
```
Auto redirect → /divisions/{user.division_id}
  │
  ├─ KPI: Dự án, Công việc, Nhân sự, Tiến độ
  ├─ Danh sách dự án (chỉ dự án của khối mình)
  ├─ Kanban tasks (chỉ tasks của khối mình)
  └─ Cảnh báo
```

### **3. Click vào dự án → Chi tiết**
```
/projects/{projectId}
  │
  ├─ Tasks breakdown
  ├─ Timeline Gantt
  ├─ Team members
  └─ Documents
```

---

## 📊 Ví Dụ Thực Tế

### **Công ty có 4 khối:**

```sql
INSERT INTO ecosystem_units (name, slug, icon, color, level_id) VALUES
  ('Khối Sản xuất', 'production', '🏭', '#F59E0B', ...),
  ('Khối Kinh doanh', 'sales', '💼', '#3B82F6', ...),
  ('Khối Hỗ trợ', 'support', '🛠️', '#10B981', ...),
  ('Khối Logistics', 'logistics', '🚚', '#8B5CF6', ...);
```

**Dashboard Tổng tự động hiển thị:**
```
┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│🏭 Sản xuất │ │💼 Kinh DN  │ │🛠️ Hỗ trợ   │ │🚚 Logistics│
│28 dự án    │ │45 leads    │ │35 đơn      │ │50 chuyến   │
│[Chi tiết→] │ │[Chi tiết→] │ │[Chi tiết→] │ │[Chi tiết→] │
└────────────┘ └────────────┘ └────────────┘ └────────────┘
```

**Mỗi khối có dashboard riêng, layout giống nhau!**

---

## 🎨 Responsive & Mobile

```
Desktop (3 columns):
[KPI] [KPI] [KPI] [KPI]
[Project List.............]
[Kanban......] [Alerts...]

Tablet (2 columns):
[KPI] [KPI]
[KPI] [KPI]
[Project List.............]
[Kanban......] [Alerts...]

Mobile (1 column):
[KPI]
[KPI]
[KPI]
[KPI]
[Project List]
[Kanban]
[Alerts]
```

---

## ✅ Checklist Implementation

### **Week 1: Database**
- [ ] Migration: division_projects table
- [ ] Migration: division_members table
- [ ] Seed: 3-4 khối mẫu
- [ ] Script: Assign projects to divisions

### **Week 2: Backend**
- [ ] GET /api/divisions (list all)
- [ ] GET /api/divisions/:id/dashboard
- [ ] POST /api/divisions (create new)
- [ ] POST /api/divisions/:id/projects (assign)
- [ ] POST /api/divisions/:id/members (assign)

### **Week 3: Frontend**
- [ ] DivisionsListPage.jsx (list cards)
- [ ] DivisionDashboard.jsx (single template)
- [ ] ProjectList component
- [ ] TaskKanban component
- [ ] AlertsWidget component

### **Week 4: Admin UI**
- [ ] Create/edit division form
- [ ] Assign projects to division
- [ ] Assign members to division
- [ ] Division settings page

---

## 🎉 Kết Quả

**✅ Linh hoạt:** Thêm/bớt khối bao nhiêu cũng được  
**✅ Đồng nhất:** Mọi khối dùng chung layout  
**✅ Đơn giản:** Focus vào Dự án → Công việc  
**✅ Trực quan:** KPI + Project list + Kanban + Alerts  
**✅ Phân quyền:** User chỉ thấy khối mình quản lý  

**Dashboard động, không fix cứng!** 🚀
