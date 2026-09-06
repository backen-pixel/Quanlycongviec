function finiteMetric(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Marks a loaded-subset fallback as incomplete in Founder-local mode.
 * Standard runtime keeps its existing presentation unchanged.
 */
export function presentCrmPostDerivedMetric({
  founderLocal = false,
  exactValue,
  partialValue,
  partialEvidenceCount = 0,
  serverIncomplete = false,
  formatValue = (value) => String(value),
} = {}) {
  const exact = finiteMetric(exactValue);
  const partial = finiteMetric(partialValue);
  const founderFallback = founderLocal && exact === null;
  const incomplete = serverIncomplete === true || founderFallback;
  const hasEvidence = exact !== null
    || (partial !== null && Number(partialEvidenceCount) > 0);
  const selected = exact !== null ? exact : partial;

  if (incomplete) {
    return {
      displayValue: hasEvidence ? `≥ ${formatValue(selected)}` : '—',
      founderFallback,
      hasEvidence,
      incomplete: true,
      value: selected,
    };
  }

  return {
    displayValue: formatValue(selected),
    founderFallback: false,
    hasEvidence: selected !== null,
    incomplete: false,
    value: selected,
  };
}
