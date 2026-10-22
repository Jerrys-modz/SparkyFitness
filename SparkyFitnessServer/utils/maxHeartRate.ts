import { estimateMaxHeartRate } from '@workspace/shared';
import userRepository from '../models/userRepository.js';
import { userAge } from './dateHelpers.js';

/** Max heart rate from the profile's age (220 − age, kept believable), or the default without a birth date. */
export async function loadMaxHeartRate(
  userId: string,
  timezone: string
): Promise<number> {
  const profile = await userRepository.getUserProfile(userId);
  const dateOfBirth: unknown = profile?.date_of_birth;
  const age =
    typeof dateOfBirth === 'string' && dateOfBirth !== ''
      ? userAge(dateOfBirth, timezone)
      : null;
  return estimateMaxHeartRate(age);
}
