import type { Request, Response, NextFunction } from 'express';
import { isEmailLoginDisabled } from '../utils/emailLogin.js';

export function emailLoginGuard(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Demo login needs the credential backend, but public password routes still
  // follow the environment policy.
  if (
    isEmailLoginDisabled() &&
    (req.path.startsWith('/api/auth/sign-in/email') ||
      req.path.startsWith('/api/auth/sign-up/email'))
  ) {
    return res.status(400).json({
      message: 'Email and password is not enabled',
      code: 'EMAIL_PASSWORD_DISABLED',
    });
  }
  next();
}
