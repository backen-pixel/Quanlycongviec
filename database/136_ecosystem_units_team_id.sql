-- Add team_id to ecosystem_units for stable Team ↔ Unit mapping
-- This keeps HST as a projection while avoiding name-based matching.

DO $$ BEGIN
  ALTER TABLE ecosystem_units ADD COLUMN team_id UUID REFERENCES teams(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_ecosystem_units_team ON ecosystem_units(team_id);

COMMENT ON COLUMN ecosystem_units.team_id IS 'Liên kết ecosystem_unit cấp Team với teams.id';

