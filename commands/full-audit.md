---
description: Run ALL audits (JS, CSS, HTML, security, quality, UI) in one pass
---

# Full Codebase Audit

Run ALL audit checks across the entire codebase. Launch each audit domain as a parallel subagent for speed, then compile results into a single prioritized report.

## Execution Plan

Run these audits in parallel using subagents, then compile results:

### Phase 1: Code Audits (run in parallel)

**JavaScript Lint** — Scan all JS/TS files for:
- XSS: proper HTML escaping, URL scheme validation
- Fetch: every fetch().json() must check res.ok first
- DOM: no innerHTML += in loops, no duplicate event listeners, editors destroyed before re-create
- UX: modal scroll lock, polling pauses on hidden tab, clipboard fallbacks

**CSS & Mobile** — Scan all CSS files and inline styles for:
- No fixed `width:NNNpx` on containers (use max-width + width:100%)
- Touch targets >= 44px on mobile
- iOS: 100dvh fallback, -webkit-sticky, input font-size >= 16px
- Responsive: media queries cover nav, toolbar, editor, modals, cards

**HTML Standards** — Scan all HTML files for:
- viewport-fit=cover on all pages
- aria-label on icon-only buttons
- Form labels match input IDs
- No inline fixed widths on modal-content divs

**Security** — Scan both server and client code for:
- Server: parameterized SQL, session cookie flags, token security, tenant isolation
- Client: XSS vectors, URL validation, raw HTML rendering
- Auth: rate limiting, API key timing-safe comparison, role-based access

**Code Quality** — Scan entire codebase for:
- Memory leaks (editors, intervals, document listeners)
- Duplicated utility functions across files
- Error handling gaps (silent catches, missing user feedback)
- Type safety issues, unused imports, inconsistent naming

**UI Review** — Check design consistency:
- WCAG AA contrast on all text
- Consistent component styles across pages
- Mobile UX (nav wrapping, modal sizing, touch spacing)
- Loading states, error feedback, confirmation dialogs

### Phase 2: Build Verification

After audits complete:
- Run `npm run build` — must have zero errors
- Run `npm audit` — report any high/critical vulnerabilities
- Check git status for uncommitted changes

## Output Format

Compile all findings into a single report:

```
=== FULL AUDIT REPORT ===

CRITICAL (must fix before deploy):
  [SEC] src/routes/api.ts:45 — Missing tenant isolation check
  [XSS] public/js/app.js:94 — escapeHtml missing single quote escape

HIGH (should fix):
  [CSS] style.css — .btn-sm touch target only 28px on mobile
  [JS]  editor.js:280 — Editors not destroyed on reload

MEDIUM (improve when possible):
  [DRY] escapeHtml duplicated in 4 files — extract to utils
  [A11Y] page.html:47 — label missing for= attribute

LOW (nice to have):
  [STYLE] app.js — mixing var and const declarations

=== SUMMARY ===
X critical, Y high, Z medium, W low issues
GO / NO-GO recommendation
```

Prioritize findings by impact. Group related issues. Provide fix suggestions for all critical and high items.
