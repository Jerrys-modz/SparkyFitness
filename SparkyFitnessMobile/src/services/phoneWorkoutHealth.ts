// Android/web no-op. Metro resolves `phoneWorkoutHealth.ios.ts` on iOS.
export interface PhoneWorkoutToSave {
  sessionId: string;
  startedAt: number;
  finishedAt: number;
}

export async function requestPhoneWorkoutHealthAccess(): Promise<boolean> {
  return false;
}

export async function savePhoneWorkoutToHealth(
  _workout: PhoneWorkoutToSave
): Promise<boolean> {
  return false;
}
