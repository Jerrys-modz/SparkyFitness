/** Whether passkey sign-in and new passkey registration are turned off. */
export function isPasskeyLoginDisabled(): boolean {
  return process.env.SPARKY_FITNESS_DISABLE_PASSKEY_LOGIN === 'true';
}
