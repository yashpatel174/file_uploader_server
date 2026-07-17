export const unitComparison = (
  before: number,
  after: number,
): { isMail: boolean; value?: number } => {
  const thresholds = [100, 90, 80, 70, 60];
  const threshold = thresholds.find((t) => before < t && after >= t);
  return threshold ? { value: threshold, isMail: true } : { isMail: false };
};
