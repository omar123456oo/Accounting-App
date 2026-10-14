# Security

## Controls in place (Phase 1)

| Control | Where |
|---|---|
| Tenant isolation: forced row-level security, fail-closed, transaction-local tenant | `AppServiceProvider` (`tenantPolicy`), `TenantContext`, every tenant migration; guard test `AllTablesHaveRlsTest` |
| App connects as a role without `BYPASSRLS` that owns no tables | `docker/postgres/init/01-roles.sql`, `RlsTest` |
| Login lookup before the tenant is known goes through two narrow SECURITY DEFINER functions | migration `..._000004_auth_lookup_functions.php` |
| Cookie session with CSRF (Sanctum SPA), no tokens in browser storage | `bootstrap/app.php`, frontend `AuthService` |
| Lockout after 5 failures, rate limit 6/min per e-mail and address, same message for unknown user and wrong password, constant-work dummy hash | `LoginService`, `AppServiceProvider` |
| Two-step verification (TOTP); secret encrypted at rest | `MfaController`, `User` cast |
| Passwords: 12+ characters, breach check, bcrypt | `PasswordPolicy` |
| Server-side RBAC through policies and `can:` middleware; payroll limited to two roles; access matrix test | `RolesAndPermissionsSeeder`, `AccessMatrixTest` |
| Append-only audit log with a per-organization hash chain computed in the database, tamper detection, nightly verification | migration `..._000009_create_audit_events.php`, `AuditLogger`, `audit:verify` |
| Office registration: one transaction for office, owner, roles and audit event; rate limited (5/hour per address); can be closed with `REGISTRATION_OPEN=false` | `RegistrationService`, `RegisterController`, `RegisterTest` |
| E-mail verification: signed, expiring link tied to the current address; sign-in blocked until verified (checked after the password, so it reveals nothing); resend always answers 202 and is rate limited | `EmailVerification`, `VerificationController`, `LoginService`, `VerificationTest` |
| Idempotent state-changing requests | `IdempotencyMiddleware` |
| Staff and client sessions kept on separate route groups | `EnsureUserType` |
| No secrets in source control; `.env` ignored; dev passwords are placeholders | `.gitignore`, `backend/.env.example` |

## Known limits and open items

- Registration answers "an account with this email already exists" (the Angular form shows it under the field). That lets someone test whether an address has an account; the rate limit slows it down but does not stop it. Switch to a neutral answer plus an e-mail if that matters to the office.
- Registration is open to anyone who finds the endpoint. After the office has its accounts, set `REGISTRATION_OPEN=false`.

- **Not yet run.** The backend was written without Docker available, so none of these tests have executed. Treat every row above as "implemented, unverified" until `pest` is green. See `docs/setup.md`.
- `acct_owner` has `BYPASSRLS` so migrations and seeders can write across tenants. It must never be used by the running application, and in production its credentials belong in the deployment pipeline only.
- A used TOTP code can be replayed inside its validity window. Add last-used-step tracking before production.
- Unknown e-mails cannot be audited per organization (there is no organization to attribute them to); only the rate limiter sees them.
- The audit chain proves tampering inside the database. A person with database owner access could rewrite history and recompute hashes; anchoring digests outside the database is planned for Phase 7.
- Key rotation for field encryption is designed before Phase 2 stores client tax IDs. Phase 1 encrypts only the MFA secret, with Laravel's application key.
- Backup RPO/RTO targets are unconfirmed (`docs/runbooks/backup-restore.md`).
- The Arabic PDF renderer choice awaits a native-reader review (`docs/decisions/ADR-0001-arabic-pdf-renderer.md`).
- Password-reset and invitation e-mails are not built.
