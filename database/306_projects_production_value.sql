-- Add independent production value field for Production module
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS production_value numeric(18,2);

-- Backfill existing records so current Production dashboards keep numbers
UPDATE projects
SET production_value = estimated_value
WHERE production_value IS NULL
  AND estimated_value IS NOT NULL;

