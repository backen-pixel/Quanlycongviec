# 🚀 MIGRATION GUIDE - Flow Step Tasks

**Date:** 2026-03-05  
**Migration:** 21_flow_step_tasks.sql  
**Status:** Ready to run

---

## ⚠️ IMPORTANT: RUN MIGRATION FIRST!

Trước khi code frontend có thể hoạt động, bạn **PHẢI chạy migration** này trên Supabase.

---

## 📋 STEP-BY-STEP GUIDE

### **Step 1: Open Supabase Dashboard**

```
URL: https://supabase.com/dashboard/project/kdxypztstbeovyedmvem
```

1. Login to Supabase
2. Select project: `kdxypztstbeovyedmvem`

---

### **Step 2: Open SQL Editor**

1. Click **"SQL Editor"** in left sidebar
2. Click **"+ New query"** button

---

### **Step 3: Copy Migration SQL**

**File:** `backend/migrations/21_flow_step_tasks.sql`

```sql
-- Copy ENTIRE content of this file
-- It's about 200 lines
```

---

### **Step 4: Paste & Run**

1. Paste the SQL into the editor
2. Click **"Run"** button (or press `Ctrl+Enter`)
3. Wait ~5 seconds

---

### **Step 5: Verify Success**

#### **A. Check for success message:**

```
✅ Success. No rows returned
```

OR

```
✅ Success. 2 rows affected
```

#### **B. Verify tables created:**

Run this query:

```sql
-- Check tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('flow_step_tasks', 'flow_step_task_checklists')
ORDER BY table_name;
```

**Expected result:**
```
flow_step_task_checklists
flow_step_tasks
```

#### **C. Verify columns:**

```sql
-- Check flow_step_tasks columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'flow_step_tasks'
ORDER BY ordinal_position;
```

**Expected columns:**
- `id` (uuid)
- `flow_step_id` (uuid)
- `template_task_id` (uuid)
- `title` (text)
- `description` (text)
- `stage_id` (uuid)
- `assigned_user_id` (uuid) ← **KEY!**
- `assigned_company_unit_id` (uuid)
- `assignee_field` (text)
- `estimated_days` (integer)
- `order_index` (integer)
- `is_active` (boolean)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

---

### **Step 6: Test with Sample Data (Optional)**

```sql
-- Insert test task
INSERT INTO flow_step_tasks (
  flow_step_id,
  title,
  description,
  assignee_field,
  estimated_days
) VALUES (
  (SELECT id FROM workflow_flow_steps LIMIT 1), -- Use existing flow step
  'Test Task',
  'This is a test',
  'sales_person',
  3
) RETURNING *;

-- Check it
SELECT id, title, assignee_field, estimated_days 
FROM flow_step_tasks 
WHERE title = 'Test Task';

-- Clean up
DELETE FROM flow_step_tasks WHERE title = 'Test Task';
```

---

## ❌ TROUBLESHOOTING

### **Error: "relation already exists"**

```
ERROR:  relation "flow_step_tasks" already exists
```

**Solution:** Migration đã chạy rồi! Skip.

---

### **Error: "column already exists"**

```
ERROR:  column "assigned_user_id" of relation "task_checklists" already exists
```

**Solution:** OK! Column đã có. Migration safe (dùng IF NOT EXISTS).

---

### **Error: "must be owner of table"**

```
ERROR:  must be owner of table flow_step_tasks
```

**Solution:** Login với account có quyền admin trên Supabase.

---

### **Error: "relation does not exist"**

```
ERROR:  relation "workflow_flow_steps" does not exist
```

**Solution:** Database sai hoặc migration trước chưa chạy. Check:

```sql
SELECT * FROM workflow_flow_steps LIMIT 1;
```

Nếu không có → Chạy migration trước đó.

---

## ✅ POST-MIGRATION CHECKLIST

- [ ] Tables created (`flow_step_tasks`, `flow_step_task_checklists`)
- [ ] Indexes created (check: `\di` or query `pg_indexes`)
- [ ] Trigger created (`trigger_flow_step_task_updated_at`)
- [ ] Column added to `task_checklists.assigned_user_id`
- [ ] No errors in console
- [ ] Test query returns data

---

## 🔄 ROLLBACK (If Needed)

If something goes wrong, rollback:

```sql
-- Drop tables (CASCADE will remove related data)
DROP TABLE IF EXISTS flow_step_task_checklists CASCADE;
DROP TABLE IF EXISTS flow_step_tasks CASCADE;

-- Remove column from task_checklists
ALTER TABLE task_checklists DROP COLUMN IF EXISTS assigned_user_id;

-- Drop trigger
DROP TRIGGER IF EXISTS trigger_flow_step_task_updated_at ON flow_step_tasks;
DROP FUNCTION IF EXISTS update_flow_step_task_updated_at();
```

**⚠️ Warning:** This will delete all flow step tasks data!

---

## 📊 AFTER MIGRATION

### **What's New:**

1. **Flow steps can now have custom tasks**
   - Override template tasks
   - Specific per flow

2. **Tasks can assign specific users**
   - Not just fields (sales_person, designer)
   - Actual user_id from users table

3. **Checklists support user assignment**
   - Each checklist can have different assignee

### **Next Steps:**

1. ✅ Migration done
2. ⏳ Backend API ready (already deployed)
3. ⏳ Wait for frontend components (Phase 2)
4. ⏳ Test full flow

---

## 📞 SUPPORT

**If migration fails:**
1. Screenshot the error
2. Check Supabase logs
3. Verify previous migrations ran
4. Check database permissions

**Success indicators:**
- No error messages
- Tables visible in Supabase Table Editor
- Test query returns expected columns

---

**Migration File:** `backend/migrations/21_flow_step_tasks.sql`  
**Last Updated:** 2026-03-05  
**Status:** ✅ Ready to run

🚀 **Run it now and let me know the result!**
