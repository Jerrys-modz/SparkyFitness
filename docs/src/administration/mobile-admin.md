# Admin in the Mobile App

If you are an administrator of your SparkyFitness server, the mobile app shows an **Admin** row in **Settings**. It is only shown to admins: the app asks the server who is signed in, and the server checks every admin request itself.

## What you can do in the app

- **Sign-in**: turn email and password, passkey, magic link and OIDC sign-in on or off, and require two-factor authentication for everyone. A switch that is set by the server's environment variables (for example `SPARKY_FITNESS_FORCE_EMAIL_LOGIN`) is shown but cannot be changed.
- **Features**: challenges and group leaderboards, Open Food Facts contributions, whether people can add their own AI services, and whether people who are not admins can connect AI services or recipe providers on a private network.
- **Server**: remote MCP sign-in (OAuth), public API documentation, the check for new releases, developer diagnostic tools and provider response capture.
- **Users**: search the accounts on the server, change a name, deactivate or reactivate an account, make someone an admin or remove it, send a password reset email, reset two-factor authentication and delete an account. Your own account cannot be deactivated, demoted or deleted from the app, and the primary admin (`SPARKY_FITNESS_ADMIN_EMAIL`) cannot be changed by anyone.
- **Backups**: start a backup now and see the most recent backups.

## What stays on the website

**Open on the website** at the bottom of the Admin screen opens the web admin page for the rest: OIDC providers, shared AI services and data providers, the MCP OAuth redirect allowlist, the backup schedule, downloading backups and [restoring one](./manual_backup_restore.md).

## Locked out?

If you turn off the sign-in method you use and can no longer sign in, set `SPARKY_FITNESS_FORCE_EMAIL_LOGIN=true` (or `SPARKY_FITNESS_FORCE_PASSKEY_LOGIN=true` / `SPARKY_FITNESS_FORCE_MAGIC_LINK_LOGIN=true`) on the server and restart it.
