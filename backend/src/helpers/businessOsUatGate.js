function validIsoDate(value) {
  return typeof value === 'string'
    && value.trim().length > 0
    && Number.isFinite(Date.parse(value));
}

function evaluateBusinessOsUatGate({ allApplied, backup, requiredBackupAfter }) {
  if (!validIsoDate(requiredBackupAfter)) {
    throw new Error(`Mốc backup bắt buộc không hợp lệ: ${requiredBackupAfter}`);
  }

  const latestBackupAt = backup?.latest_completed_backup_at || null;
  const migrationsReady = allApplied === true;
  const backupVerified = backup?.verified === true;
  const backupFresh = validIsoDate(latestBackupAt)
    && Date.parse(latestBackupAt) > Date.parse(requiredBackupAfter);
  const ready = migrationsReady && backupVerified && backupFresh;

  return {
    required_backup_after: requiredBackupAfter,
    latest_completed_backup_at: latestBackupAt,
    migrations_ready: migrationsReady,
    backup_verified: backupVerified,
    backup_fresh: backupFresh,
    ready,
    status: ready ? 'READY' : 'BLOCKED',
  };
}

module.exports = {
  evaluateBusinessOsUatGate,
  validIsoDate,
};
