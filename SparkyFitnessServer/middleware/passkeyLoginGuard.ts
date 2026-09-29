import type { Request, Response, NextFunction } from 'express';
import { isPasskeyLoginDisabled } from '../utils/passkeyLogin.js';

// Listing, renaming and deleting passkeys stay available so users can still
// clean up credentials while passkey login is off.
const PASSKEY_LOGIN_ROUTES = new Set([
  '/api/auth/passkey/generate-authenticate-options',
  '/api/auth/passkey/verify-authentication',
  '/api/auth/passkey/generate-register-options',
  '/api/auth/passkey/verify-registration',
]);

/** Block passkey sign-in and new passkey registration when passkey login is off. */
export function passkeyLoginGuard(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (
    isPasskeyLoginDisabled() &&
    PASSKEY_LOGIN_ROUTES.has(req.path.replace(/\/$/, ''))
  ) {
    return res.status(400).json({
      message: 'Passkey login is not enabled',
      code: 'PASSKEY_LOGIN_DISABLED',
    });
  }
  next();
}
