# 📊 Dashboard Tab "Theo Khối" - Design

## 🎯 Mục đích

Thêm tab mới trong Dashboard chính để hiển thị **tổng quan theo từng Khối**:
- Mỗi Khối hiển thị dạng card
- Stats: Số dự án, tasks, completion rate
- Click card → Xem chi tiết dự án của Khối đó

---

## 🏗️ Cấu trúc

### Backend API (ĐÃ XONG ✅)

#### 1. `GET /api/dashboard/by-division`
**Lấy tổng quan tất cả Khối**

**Response:**
```json
{
  "divisions": [
    {
      "id": "uuid-kd",
      "code": "KD",
      "name": "Khối Kinh doanh",
      "icon": "💼",
      "color": "#3B82F6",
      "stats": {
        "total_projects": 25,
        "active_projects": 15,
        "completed_projects": 10,
        "planning_projects": 5,
        "in_progress_projects": 10,
        "total_tasks": 120,
        "completed_tasks": 80,
        "in_progress_tasks": 30,
        "overdue_tasks": 5,
        "completion_rate": 67
      }
    },
    {
      "id": "uuid-sx",
      "code": "SX",
      "name": "Khối Sản xuất",
      "icon": "🏭",
      "color": "#F59E0B",
      "stats": { ... }
    }
  ]
}
```

#### 2. `GET /api/dashboard/division/:id/projects`
**Lấy danh sách dự án của 1 Khối**

**Query params:**
- `status` (optional): `planning`, `in-progress`, `done`, `cancelled`

**Response:**
```json
{
  "projects": [
    {
      "id": "...",
      "name": "Dự án Tủ bếp A",
      "code": "DA001",
      "status": "in-progress",
      "customer_name": "Ông Nguyễn",
      "flow": {
        "id": "...",
        "name": "Luồng Tủ Bếp Chuẩn"
      }
    }
  ]
}
```

---

## 🎨 Frontend Design (CẦN TẠO)

### Component: DivisionsDashboardTab.jsx

```jsx
import { useState, useEffect } from 'react';
import api from '../lib/api';

export default function DivisionsDashboardTab() {
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDivisions();
  }, []);

  const loadDivisions = async () => {
    setLoading(true);
    try {
      const res = await api.get('/dashboard/by-division');
      setDivisions(res.data.divisions || []);
    } catch (error) {
      console.error('Load divisions error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">Tổng quan theo Khối</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {divisions.map(division => (
          <DivisionCard key={division.id} division={division} />
        ))}
      </div>
    </div>
  );
}

function DivisionCard({ division }) {
  const { stats } = division;

  return (
    <div 
      className="bg-white rounded-xl border-2 hover:border-purple-300 p-6 cursor-pointer transition-all hover:shadow-lg"
      style={{ borderColor: division.color || '#ccc' }}
      onClick={() => navigate(`/divisions/${division.id}`)}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-4xl">{division.icon || '🏢'}</span>
        <div>
          <h3 className="font-bold text-gray-900">{division.name}</h3>
          <p className="text-xs text-gray-500">{division.code}</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatItem 
          label="Dự án" 
          value={stats.total_projects}
          color="blue"
        />
        <StatItem 
          label="Đang làm" 
          value={stats.in_progress_projects}
          color="yellow"
        />
        <StatItem 
          label="Nhiệm vụ" 
          value={stats.total_tasks}
          color="purple"
        />
        <StatItem 
          label="Hoàn thành" 
          value={stats.completed_tasks}
          color="green"
        />
      </div>

      {/* Progress Bar */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-gray-600">Tiến độ</span>
          <span className="font-semibold text-gray-900">{stats.completion_rate}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="h-2 rounded-full transition-all"
            style={{
              width: `${stats.completion_rate}%`,
              backgroundColor: division.color
            }}
          />
        </div>
      </div>

      {/* Overdue Badge */}
      {stats.overdue_tasks > 0 && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
          <span className="text-xs text-red-700 font-medium">
            ⚠️ {stats.overdue_tasks} nhiệm vụ quá hạn
          </span>
        </div>
      )}
    </div>
  );
}

function StatItem({ label, value, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700',
    yellow: 'bg-yellow-50 text-yellow-700',
    purple: 'bg-purple-50 text-purple-700',
    green: 'bg-green-50 text-green-700'
  };

  return (
    <div className={`${colors[color]} rounded-lg p-2 text-center`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-[10px] font-medium">{label}</p>
    </div>
  );
}
```

---

## 📋 Integration vào Dashboard Chính

### File: pages/DashboardNew.jsx (hoặc DashboardMain.jsx)

```jsx
import { useState } from 'react';
import DivisionsDashboardTab from '../components/DivisionsDashboardTab';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="p-6">
      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        <TabButton 
          active={activeTab === 'overview'}
          onClick={() => setActiveTab('overview')}
        >
          📊 Tổng quan
        </TabButton>
        <TabButton 
          active={activeTab === 'divisions'}
          onClick={() => setActiveTab('divisions')}
        >
          🏢 Theo Khối
        </TabButton>
        <TabButton 
          active={activeTab === 'my-projects'}
          onClick={() => setActiveTab('my-projects')}
        >
          📁 Dự án của tôi
        </TabButton>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'divisions' && <DivisionsDashboardTab />}
      {activeTab === 'my-projects' && <MyProjectsTab />}
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 font-medium text-sm transition-colors ${
        active
          ? 'text-purple-600 border-b-2 border-purple-600'
          : 'text-gray-600 hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  );
}
```

---

## 🎯 User Flow

```
1. User vào Dashboard → Tab "Theo Khối"
2. Hiển thị 4 cards: KD, SX, VC, LD
3. Mỗi card hiển thị:
   - Icon + Tên khối
   - Số dự án (total, đang làm)
   - Số nhiệm vụ (total, hoàn thành)
   - Progress bar (% completion)
   - Badge quá hạn (nếu có)
4. Click card → Navigate /divisions/:id → Xem chi tiết
```

---

## 📊 Ví dụ UI

```
┌─────────────────────────────────────────────────────────┐
│ 📊 Tổng quan  │  🏢 Theo Khối  │  📁 Dự án của tôi      │
└─────────────────────────────────────────────────────────┘

┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ 💼 Kinh doanh│  │ 🏭 Sản xuất   │  │ 🚛 Vận chuyển│  │ 🔧 Lắp đặt   │
│ KD           │  │ SX           │  │ VC           │  │ LD           │
├──────────────┤  ├──────────────┤  ├──────────────┤  ├──────────────┤
│ 📁 25  📝 10 │  │ 📁 18  📝 8  │  │ 📁 12  📝 5  │  │ 📁 15  📝 7  │
│ Dự án Đang   │  │ Dự án Đang   │  │ Dự án Đang   │  │ Dự án Đang   │
│              │  │              │  │              │  │              │
│ ✅ 120 🔄 30│  │ ✅ 95  🔄 25 │  │ ✅ 60  🔄 15 │  │ ✅ 80  🔄 20 │
│ NV    NV     │  │ NV    NV     │  │ NV    NV     │  │ NV    NV     │
│              │  │              │  │              │  │              │
│ Tiến độ 67% │  │ Tiến độ 79% │  │ Tiến độ 80% │  │ Tiến độ 75% │
│ ▓▓▓▓▓▓▓░░░   │  │ ▓▓▓▓▓▓▓▓░░   │  │ ▓▓▓▓▓▓▓▓░░   │  │ ▓▓▓▓▓▓▓▓░░   │
│              │  │              │  │              │  │              │
│ ⚠️ 5 quá hạn│  │              │  │ ⚠️ 2 quá hạn│  │              │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
   (Hover → Border purple, Shadow)
```

---

## ✅ Checklist Implementation

### Backend (DONE ✅)
- [x] API `/dashboard/by-division` - Lấy tất cả divisions với stats
- [x] API `/dashboard/division/:id/projects` - Lấy projects của 1 division
- [x] Logic đếm projects qua workflow_flow_steps
- [x] Calculate stats: projects, tasks, completion rate

### Frontend (TODO)
- [ ] Component `DivisionsDashboardTab.jsx`
- [ ] Component `DivisionCard.jsx`
- [ ] Integrate vào Dashboard chính (add tab)
- [ ] Style với Tailwind
- [ ] Loading state
- [ ] Click card → Navigate

### Test
- [ ] API trả về đúng data
- [ ] Stats tính đúng
- [ ] UI responsive (mobile/tablet/desktop)
- [ ] Click card hoạt động

---

## 🚀 Next Steps

1. **Backend đã xong** → Đợi deploy
2. **Tạo frontend component** → `DivisionsDashboardTab.jsx`
3. **Thêm tab vào Dashboard** → Edit `DashboardNew.jsx`
4. **Style và test**

---

**API Endpoint:** `/api/dashboard/by-division`  
**Logic:** Projects → flow_id → workflow_flow_steps → division_unit_id → Count & Stats
