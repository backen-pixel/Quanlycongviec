'use strict';
// Admin of a logistics company is a project viewer, not a production plan manager.
function canManage(user,project) {
  const role=String(user?.role||'').trim().toLowerCase(); const uid=user?.userId;
  if (['platform_admin','ecosystem_admin'].includes(role) || (role==='admin'&&!user.company_id)) return true;
  if (uid && [project.project_manager_id,project.production_person_id].includes(uid)) return true;
  return !!user.company_id && user.company_id===project.company_id && ['admin','sales_admin','production_admin','crm_production_admin','crm_production_staff'].includes(role);
}
module.exports={canManage};
