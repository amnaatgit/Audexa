# Security Policy

Audexa is a real-time fraud-detection system. This document describes its security model, the controls in place, and how to report vulnerabilities.

## Authentication

- Passwords are hashed with bcrypt (bcryptjs). Plaintext passwords are never stored.
- Sessions use signed JSON Web Tokens (jsonwebtoken). The client sends the token in the Authorization: Bearer header on each request.
- The signing key is read from the JWT_SECRET environment variable. In production the server fails fast on startup if JWT_SECRET is not set, so it can never silently fall back to an insecure default. A development-only default is used solely for local runs.

## Authorization (RBAC)

- authMiddleware authenticates a request and rejects unauthenticated calls with HTTP 401.
- requireAdmin enforces role-based access control and rejects non-admin users with HTTP 403.
- The following admin-only endpoints require the admin role:
  - POST /api/review/:id (submit a human verdict)
  - POST /api/thresholds (retune scoring thresholds)
  - POST /api/retrain (retrain the model)
  - POST /api/evaluate (re-run evaluation)
- GET /api/audit-log requires authentication but not the admin role, so read-only auditors can review the tamper-evident log.

## Brute-force protection

- Login attempts are throttled per identifier. More than 10 attempts within a 15-minute window are rejected with HTTP 429 until the window resets.

## Data integrity

- All database access uses parameterized queries (node-postgres), which prevents SQL injection.
- The audit log is hash-chained with SHA-256: each entry incorporates the previous entry's hash, making the log tamper-evident. verifyAuditChain recomputes the chain to detect any modification.

## Transport and CORS

- CORS is intentionally permissive because the API is deployed same-origin with its frontend and authenticates via the Authorization header rather than cookies. Because no ambient credentials are sent cross-site, there is no CSRF exposure from the open CORS policy.

## Reporting a vulnerability

Please open a private security advisory on this repository, or contact the maintainer directly. Do not disclose vulnerabilities publicly until a fix is released.
