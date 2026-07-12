-- Migration 25: Add position_role to user_permissions
-- Date: 2026-03-06
-- Purpose: Store position-based roles (director, manager, employee...) within ecosystem units

-- Add position_role column
ALTER TABLE user_permissions 
ADD COLUMN IF NOT EXISTS position_role VARCHAR(50);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_permissions_position_role 
ON user_permissions(position_role);

-- Add comment
COMMENT ON COLUMN user_permissions.position_role IS 'Position-based role within ecosystem unit: director, manager, supervisor, leader, employee, support';

-- Sample position roles (for reference, not enforced):
-- - director: Giám đốc (high level, most permissions)
-- - manager: Quản lý (medium level)
-- - supervisor: Giám sát (medium level)
-- - leader: Trưởng nhóm (medium level)
-- - employee: Nhân viên (low level, limited permissions)
-- - support: Hỗ trợ (low level)
