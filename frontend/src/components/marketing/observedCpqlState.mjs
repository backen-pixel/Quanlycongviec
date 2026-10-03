const count = x => Number.isSafeInteger(x) && x >= 0;
export function observedCpqlResult(report) {
  const x = report?.observedMeasurement;
  if (!x) return null; // Older server: absence is unknown, never zero.
  if (x.policy !== 'OBSERVED_QUALIFIED_PAID_CPQL_V1'
    || !['UNAVAILABLE', 'NO_QUALIFIED_LEADS', 'AVAILABLE_PROVISIONAL'].includes(x.status)
    || x.spendScope !== 'ALL_CONFIGURED_FACEBOOK_ACCOUNTS' || x.leadScope !== 'RECONCILED_OBSERVED_META_LEAD_ADS'
    || x.asOf !== report.asOf || x.sinceAt !== report.period?.sinceAt || x.untilExclusive !== report.period?.untilExclusive
    || !Array.isArray(x.reasons) || !count(x.pendingQualification) || x.pendingQualification !== report.observed?.pending
    || x.targetStatus !== 'NOT_EVALUATED' || x.allowBudgetExecution !== false
    || report.targetMetToDate !== false || report.allowBudgetExecution !== false || report.costPerQualifiedLeadVnd !== null) throw Error('Chưa xác minh được phạm vi chi phí/khách.');
  if (x.status === 'UNAVAILABLE') {
    if (x.costPerQualifiedLeadVnd !== null || x.spendVnd !== null || x.qualifiedLeads !== null || !x.reasons.length) throw Error('Số liệu chưa đủ phải được ẩn.');
  } else {
    if (report.period.status !== 'AVAILABLE' || report.spend?.status !== 'KNOWN_TO_DATE'
      || report.reconciliation?.recordMatchStatus !== 'MATCHED_OBSERVED' || x.reasons.length
      || !count(x.spendVnd) || x.spendVnd !== report.spend.spendVnd
      || !count(x.qualifiedLeads) || x.qualifiedLeads !== report.observed?.qualified) throw Error('Tiền và khách chưa khớp kỳ đối chiếu.');
    if (x.status === 'NO_QUALIFIED_LEADS') {
      if (x.qualifiedLeads !== 0 || x.costPerQualifiedLeadVnd !== null) throw Error('Chưa có khách hợp lệ để tính chi phí/khách.');
    } else if (x.qualifiedLeads < 1 || !Number.isFinite(x.costPerQualifiedLeadVnd)
      || x.costPerQualifiedLeadVnd !== x.spendVnd / x.qualifiedLeads) throw Error('Phép tính chi phí/khách chưa khớp.');
  }
  return x;
}
