/**
 * The pace a treadmill belt was set to, typed as "12:00" (minutes and seconds
 * per mile or km) or as plain minutes ("12", "12.5"), as a speed in metres
 * per second. Null for anything else, a pace slower than a walk or faster than
 * a person could hold.
 */
export function beltSpeedFromPaceText(
  text: string,
  unitMeters: number
): number | null {
  const value = text.trim().replace(',', '.');
  if (value === '') return null;
  let seconds: number;
  const clock = /^(\d{1,2}):([0-5]?\d)$/.exec(value);
  if (clock) {
    seconds = Number(clock[1]) * 60 + Number(clock[2]);
  } else if (/^\d{1,2}(\.\d+)?$/.test(value)) {
    seconds = Number(value) * 60;
  } else {
    return null;
  }
  if (!(seconds > 0)) return null;
  const speed = unitMeters / seconds;
  // 1.7 m/s is a brisk walk or the slowest jog; 10 m/s is faster than anyone runs.
  return speed >= 1.7 && speed <= 10 ? speed : null;
}
