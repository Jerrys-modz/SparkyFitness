// Stand hours come from Apple Health only (Health Connect has no equivalent). This is the
// Android-resolved stub; Metro picks the `.ios.ts` sibling on iOS automatically.
export async function requestStandHoursAccess(): Promise<boolean> {
  return false;
}

export async function readStandHours(_day: string): Promise<number> {
  return 0;
}
