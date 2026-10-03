const DEFAULT_MAX_HEART_RATE = 190;

/**
 * Age-based estimate of maximum heart rate (Nes et al. 2013). Mirrors the
 * server's `estimateMaxHrFromAge` so the watch bar and the saved workout agree.
 */
export function estimateMaxHeartRate(
  dateOfBirth: string | null | undefined,
  now: Date = new Date()
): number {
  if (!dateOfBirth) return DEFAULT_MAX_HEART_RATE;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return DEFAULT_MAX_HEART_RATE;
  let age = now.getFullYear() - dob.getFullYear();
  const hadBirthday =
    now.getMonth() > dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate());
  if (!hadBirthday) age -= 1;
  if (age < 5 || age > 110) return DEFAULT_MAX_HEART_RATE;
  return Math.round(211 - 0.64 * age);
}
