---
name: security-audit
description: >
  Use when: reviewing code for security vulnerabilities, auditing for OWASP Top 10
  risks, checking for exposed secrets, validating input handling, assessing dependency
  vulnerabilities, or reviewing authentication and authorisation logic. Load this skill
  when any agent performs a security-focused review.
---

# Security Audit Skill

Provides a systematic security review checklist grounded in industry standards. Load
this skill when the code-reviewer, architect, or any agent needs to assess security
concerns.

---

## OWASP Top 10 (2021) checklist

Review each category for every file in scope. Tag findings with the OWASP category ID.

### A01 — Broken Access Control

- [ ] Are all endpoints and resources protected by authorisation checks?
- [ ] Is authorisation enforced server-side (not just hidden in the UI)?
- [ ] Can a user access another user's data by manipulating IDs (IDOR)?
- [ ] Are directory listings disabled? Are sensitive files unreachable via direct URL?
- [ ] Do admin-only routes reject non-admin requests explicitly?
- [ ] Is the principle of least privilege applied (users have only the permissions they need)?

### A02 — Cryptographic Failures

- [ ] Is sensitive data (passwords, tokens, PII) encrypted at rest?
- [ ] Is HTTPS enforced for all data in transit? Are there any HTTP fallbacks?
- [ ] Are passwords hashed with a modern algorithm (bcrypt, Argon2, scrypt)? Not MD5/SHA-1.
- [ ] Are cryptographic keys and secrets stored in environment variables, not source code?
- [ ] Are session cookies marked `Secure`, `HttpOnly`, and `SameSite=Strict` (or `Lax`)?

### A03 — Injection

- [ ] Is all user input sanitised or validated before use in SQL, NoSQL, LDAP, or OS commands?
- [ ] Are parameterised queries or prepared statements used for all database access?
- [ ] Is template rendering safe from Server-Side Template Injection (SSTI)?
- [ ] Are XML parsers configured to disable external entity (XXE) processing?
- [ ] Is HTML output escaped when rendering user-supplied content?

### A04 — Insecure Design

- [ ] Are rate limits in place on authentication, password-reset, and API endpoints?
- [ ] Are failed login attempts limited or throttled to prevent brute-force attacks?
- [ ] Are password-reset flows resistant to enumeration attacks (same response for
      known and unknown emails)?
- [ ] Are business logic constraints enforced server-side (prices, quantities, roles)?

### A05 — Security Misconfiguration

- [ ] Are error messages generic (no stack traces or internal paths in production responses)?
- [ ] Are default credentials changed?
- [ ] Are unnecessary services, ports, or features disabled?
- [ ] Are security headers present? At minimum: `X-Content-Type-Options`, `X-Frame-Options`
      (or CSP `frame-ancestors`), `Content-Security-Policy`, `Strict-Transport-Security`.
- [ ] Are CORS policies restrictive (not `Access-Control-Allow-Origin: *` for authenticated endpoints)?
- [ ] Is directory indexing disabled on the web server?

### A06 — Vulnerable and Outdated Components

- [ ] Are all dependencies up to date? Run the project's dependency audit tool:
  - Node.js: `npm audit` or `yarn audit`
  - Python: `pip-audit` or `safety check`
  - Rust: `cargo audit`
  - Ruby: `bundle audit`
  - Go: `govulncheck ./...`
- [ ] Are there dependencies with known CVEs in the audit output?
- [ ] Are any dependencies abandoned (no commits in 2+ years, no security policy)?
- [ ] Is there a process for receiving and acting on dependency vulnerability alerts?

### A07 — Identification and Authentication Failures

- [ ] Are passwords validated for minimum complexity before storage?
- [ ] Is multi-factor authentication (MFA) supported for privileged accounts?
- [ ] Are session tokens long, random, and invalidated on logout?
- [ ] Is there protection against session fixation attacks (new session ID on login)?
- [ ] Are JWT tokens validated for signature, expiry, and issuer on every request?
- [ ] Are API keys rotatable and scoped to the minimum required permissions?

### A08 — Software and Data Integrity Failures

- [ ] Are CI/CD pipelines protected from injection via untrusted inputs (e.g. PR titles, issue
      comments used in workflow expressions)?
- [ ] Are third-party scripts loaded from trusted CDNs with [Subresource Integrity (SRI)](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity) hashes?
- [ ] Are serialised objects validated before deserialisation?

### A09 — Security Logging and Monitoring Failures

- [ ] Are authentication events (login, logout, failed login) logged?
- [ ] Are authorisation failures (403s) logged?
- [ ] Are logs written to a location that the application cannot modify or delete?
- [ ] Are logs free of sensitive data (passwords, tokens, PII must not appear in logs)?

### A10 — Server-Side Request Forgery (SSRF)

- [ ] Does the application fetch remote URLs based on user input?
- [ ] If yes: is the URL validated against an allowlist of safe hosts/protocols?
- [ ] Are internal/metadata URLs (e.g. `169.254.169.254` for cloud metadata) blocked?

---

## Secret detection

Scan every file in scope for accidentally committed secrets. Common patterns:

| Pattern | What to look for |
|---------|-----------------|
| API keys | Long alphanumeric strings directly assigned: `apiKey = "sk-..."` |
| Passwords in source | `password = "..."` or `passwd = "..."` in non-test code |
| Tokens | `token = "eyJ..."` (Base64 JWT prefix) or `ghp_...` (GitHub PAT) |
| Connection strings | `mongodb://user:pass@...`, `postgresql://user:pass@...` |
| Private keys | `-----BEGIN RSA PRIVATE KEY-----` or `-----BEGIN EC PRIVATE KEY-----` |
| `.env` files committed | Any `.env` or `.env.local` file in version control |
| AWS credentials | `AKIA...` (access key ID pattern) |

If any are found: flag as 🔴 Critical. Advise immediate rotation of the exposed credential.

---

## Input validation checklist

For every function or endpoint that accepts external input (user forms, API requests,
file uploads, URL parameters):

- [ ] Is the input type validated (string, number, boolean, array)?
- [ ] Is the input length bounded?
- [ ] Are allowed characters or values explicitly whitelisted (not just blacklisted)?
- [ ] Is numeric input range-checked (min/max)?
- [ ] Are file uploads validated for type, size, and content (not just extension)?
- [ ] Is HTML/script content stripped or escaped if the input will be rendered?

---

## Authentication & authorisation patterns to flag

| Anti-pattern | Risk | Fix |
|---|---|---|
| Trusting the `X-User-Id` or `X-Role` header directly | Auth bypass — any client can set this header | Derive identity from a verified session token, not arbitrary headers |
| Using GET requests for state-changing operations | CSRF risk | Use POST/PUT/DELETE with CSRF token |
| Storing sensitive data in `localStorage` | XSS can read localStorage | Use `HttpOnly` cookies for auth tokens |
| JWTs with `alg: none` | Signature verification bypass | Reject tokens that specify `none` as algorithm |
| Comparing secrets with `==` | Timing attack risk | Use a constant-time comparison function |
| `eval()` or `Function()` with user input | Remote code execution | Never pass user input to eval |

---

## Dependency vulnerability triage

When a dependency audit reports vulnerabilities, classify by exploitability:

| Severity | Action |
|----------|--------|
| Critical / High — exploitable in this project's usage | Flag as 🔴 Critical finding. Upgrade immediately. |
| Critical / High — transitive dependency, not directly exploitable | Flag as 🟡 Warning. Upgrade when possible. |
| Medium | Flag as 🔵 Suggestion. Upgrade in the next maintenance window. |
| Low | Note in report. No urgent action required. |

Do not auto-upgrade major versions without confirming there are no breaking changes.
Flag major-version upgrades for human review.

---

## Reporting format

Tag every security finding with:
- The OWASP category (e.g. `[A03-Injection]`)
- Severity: 🔴 Critical, 🟡 Warning, or 🔵 Suggestion
- File and line range
- Specific risk description
- Concrete remediation step

Example:
```
🔴 Critical [A03-Injection]
File: src/api/search.ts (line 42)
Risk: User-supplied `query` parameter is interpolated directly into a SQL string,
      allowing SQL injection.
Fix: Replace with a parameterised query:
     `db.query('SELECT * FROM products WHERE name = $1', [query])`
```
