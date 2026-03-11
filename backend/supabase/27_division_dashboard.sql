-- Migration 27: Division Dashboard System
-- Dynamic division management with flexible project/member assignment

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Division-Project Mapping (N-N relationship)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS division_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id UUID REFERENCES ecosystem_units(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  role VARCHAR(50) DEFAULT 'owner', -- 'owner', 'contributor', 'viewer'
  assigned_at TIMESTAMPTZ DEFAULT now(),
  assigned_by UUID REFERENCES users(id),
  UNIQUE(division_id, project_id)
);

CREATE INDEX idx_division_projects_division ON division_projects(division_id);
CREATE INDEX idx_division_projects_project ON division_projects(project_id);

COMMENT ON TABLE division_projects IS 'Maps projects to divisions (N-N)';
COMMENT ON COLUMN division_projects.role IS 'Project role in division: owner (primary), contributor, viewer';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Division-Member Mapping
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS division_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id UUID REFERENCES ecosystem_units(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  role VARCHAR(50) DEFAULT 'member', -- 'manager', 'member', 'viewer'
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(division_id, user_id)
);

CREATE INDEX idx_division_members_division ON division_members(division_id);
CREATE INDEX idx_division_members_user ON division_members(user_id);

COMMENT ON TABLE division_members IS 'Maps users to divisions as members';
COMMENT ON COLUMN division_members.role IS 'User role in division: manager (can manage), member, viewer';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Add division_id to users table (for quick lookup)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_division_id UUID REFERENCES ecosystem_units(id);
CREATE INDEX IF NOT EXISTS idx_users_division ON users(primary_division_id);

COMMENT ON COLUMN users.primary_division_id IS 'User primary division for quick access control';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RLS Policies
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE division_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE division_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_division_projects" ON division_projects;
CREATE POLICY "allow_all_division_projects" ON division_projects FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_division_members" ON division_members;
CREATE POLICY "allow_all_division_members" ON division_members FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Helper Function: Get division projects
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_division_project_ids(div_id UUID)
RETURNS TABLE(project_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT dp.project_id
  FROM division_projects dp
  WHERE dp.division_id = div_id;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Sample Data: Auto-assign existing projects to divisions
-- ═══════════════════════════════════════════════════════════════════════════
-- This will run only if divisions exist and no assignments yet

DO $$
DECLARE
  production_div_id UUID;
  sales_div_id UUID;
  support_div_id UUID;
BEGIN
  -- Get division IDs (if they exist)
  SELECT id INTO production_div_id FROM ecosystem_units WHERE slug = 'production-division' LIMIT 1;
  SELECT id INTO sales_div_id FROM ecosystem_units WHERE slug = 'business-division' LIMIT 1;
  SELECT id INTO support_div_id FROM ecosystem_units WHERE slug = 'support-division' LIMIT 1;

  -- Only proceed if we have divisions
  IF production_div_id IS NOT NULL THEN
    -- Assign production-stage projects to production division
    INSERT INTO division_projects (division_id, project_id, role)
    SELECT production_div_id, p.id, 'owner'
    FROM projects p
    WHERE p.status IN ('producing')
    ON CONFLICT (division_id, project_id) DO NOTHING;

    RAISE NOTICE 'Assigned production projects to production division';
  END IF;

  IF sales_div_id IS NOT NULL THEN
    -- Assign early-stage projects to sales division
    INSERT INTO division_projects (division_id, project_id, role)
    SELECT sales_div_id, p.id, 'owner'
    FROM projects p
    WHERE p.status IN ('consulting', 'designing', 'quoting', 'contract_signed')
    ON CONFLICT (division_id, project_id) DO NOTHING;

    RAISE NOTICE 'Assigned sales projects to sales division';
  END IF;

  IF support_div_id IS NOT NULL THEN
    -- Assign late-stage projects to support division
    INSERT INTO division_projects (division_id, project_id, role)
    SELECT support_div_id, p.id, 'owner'
    FROM projects p
    WHERE p.status IN ('shipping', 'installing', 'warranty')
    ON CONFLICT (division_id, project_id) DO NOTHING;

    RAISE NOTICE 'Assigned support projects to support division';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Verification Query
-- ═══════════════════════════════════════════════════════════════════════════
-- Run this to check assignments:
-- SELECT 
--   eu.name as division_name,
--   COUNT(dp.project_id) as project_count
-- FROM ecosystem_units eu
-- LEFT JOIN division_projects dp ON dp.division_id = eu.id
-- WHERE eu.level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division')
-- GROUP BY eu.id, eu.name;
