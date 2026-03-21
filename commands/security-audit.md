---
description: Full security audit — XSS, injection, auth, access control
---

# Security Audit

Perform a comprehensive READ-ONLY security audit of the entire application — both server-side and client-side. Do NOT modify files — only report findings.

## Server-Side Checks

### Authentication & Session (Critical)
- **Session token entropy**: Verify tokens are generated with cryptographically secure randomness, not `Math.random()` or UUIDs v4
- **Session expiration**: Sessions must have a configurable max age. Check expired sessions are properly rejected
- **Cookie security flags**: Session cookies must have: `httpOnly: true`, `secure: true` in production, `sameSite: 'lax'` or `'strict'`
- **Authorization checks**: Every API route must verify authentication AND authorization (ownership, membership, roles)

### Input Validation & Injection (Critical)
- **SQL injection**: Verify NO raw string concatenation in SQL queries. All queries must use parameterized statements
- **JSON injection**: User input must be validated before being stored or parsed
- **Path traversal**: File operations must validate paths. User input should never reach `fs.readFile` unsanitized
- **Command injection**: No user input should reach `child_process.exec()`, `eval()`, or `Function()`

### API Security (High)
- **Rate limiting**: Login and sensitive endpoints should have rate limiting
- **API key handling**: API keys should use constant-time comparison (`crypto.timingSafeEqual`)
- **CORS configuration**: Allowed origins should be restricted (not `*` in production)
- **Error information leakage**: No stack traces, database details, or internal paths in production errors
- **Request size limits**: Body parser should have size limits to prevent DoS

### Data Access Control (High)
- **Tenant isolation**: Users can only access data within their scope. Cross-tenant data leakage is critical
- **Role-based access**: Role checks enforced server-side, not just in the UI

## Client-Side Checks

### XSS Prevention (Critical)
- **Output encoding**: Dynamic data rendered into HTML must use proper escaping (& < > " ')
- **innerHTML usage**: Content injected via `.innerHTML` must be escaped first
- **Template literal injection**: Values interpolated into HTML attributes must be escaped
- **DOM-based XSS**: Check for `document.location`, `document.URL` used in `innerHTML` or `eval()`

### URL Validation (High)
- **Link insertion**: User-provided URLs must validate scheme. Block `javascript:`, `data:`, `vbscript:`
- **Redirect validation**: Post-login redirects should only allow relative paths or same-origin URLs

### Data Exposure (Medium)
- **Console logging**: No sensitive data (tokens, passwords, API keys) logged to console in production
- **Local storage**: No sensitive data stored in `localStorage` or non-httpOnly cookies

## Output Format

For each finding, report:
- **Severity**: Critical / High / Medium / Low
- **Location**: File path and line number
- **Category**: Auth / Injection / XSS / API / Access Control / Data Exposure
- **Description**: What the vulnerability is
- **Impact**: What an attacker could do
- **Recommendation**: How to fix it, with code example

End with an executive summary: overall security posture, critical findings count, and prioritized remediation plan.
