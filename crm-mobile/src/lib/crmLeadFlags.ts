/**
 * Helper API ghim (pin) và tick "đã tương tác" cho lead/deal — mirror web
 * (frontend/src/pages/CRMDashboard.jsx, LeadDetail.jsx).
 *
 * Backend endpoints (xem `backend/src/routes/crm.js`):
 *   POST   /crm/leads/:id/pin
 *   DELETE /crm/leads/:id/pin
 *   POST   /crm/leads/:id/interacted
 *   DELETE /crm/leads/:id/interacted
 */

import { api } from '../api/client';

export async function setLeadPin(leadId: string, pinned: boolean): Promise<void> {
  if (pinned) await api.post(`/crm/leads/${leadId}/pin`);
  else await api.delete(`/crm/leads/${leadId}/pin`);
}

export async function setLeadInteracted(leadId: string, interacted: boolean): Promise<void> {
  if (interacted) await api.post(`/crm/leads/${leadId}/interacted`);
  else await api.delete(`/crm/leads/${leadId}/interacted`);
}
