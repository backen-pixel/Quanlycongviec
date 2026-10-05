#!/usr/bin/env node
'use strict';

// Retired before loading credentials or touching either DB. The old public-only
// clone dropped schemas, reset passwords and widened ACLs; it is not a restore plan.
console.error('BACKUP_CLONE_REMEDIATION_REQUIRED: Clone toàn bộ kiểu cũ đã bị khóa. Cần gói khôi phục có schema, quyền và Storage được kiểm thử, duyệt riêng.');
process.exitCode = 1;
