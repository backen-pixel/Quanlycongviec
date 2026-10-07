-- Non-destructive release rollback. Does not erase objectives, approvals, receipts or audit.
-- Set FOUNDER_CONTROL_ENABLED=0 and FOUNDER_CONTROL_WRITES_ENABLED=0 first.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.founder_control_command_v1(uuid,uuid,uuid,uuid,text,text,jsonb) FROM service_role;
COMMIT;
-- Restoring execute permission is a separate reviewed release step after the backend gates pass.
