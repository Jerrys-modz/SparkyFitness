export function isEmailLoginDisabled(): boolean {
  return (
    process.env.SPARKY_FITNESS_DISABLE_EMAIL_LOGIN === 'true' &&
    process.env.SPARKY_FITNESS_FORCE_EMAIL_LOGIN !== 'true'
  );
}
