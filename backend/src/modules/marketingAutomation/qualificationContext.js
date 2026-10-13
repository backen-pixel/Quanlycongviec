'use strict';

const { createHash } = require('node:crypto');

// Versioning makes old states require an explicit re-verification. Customer phone
// is read through the authorized lead, since the CRM commonly stores no lead.phone.
function qualificationContext(lead, customer) {
  return createHash('sha256').update(JSON.stringify([
    'qualification-context-v2', lead.id, lead.company_id, lead.customer_id,
    lead.phone, customer?.id ?? null, customer?.phone ?? null,
  ])).digest('hex');
}

module.exports = { qualificationContext };
