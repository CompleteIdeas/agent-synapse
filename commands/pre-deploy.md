---
description: Pre-deploy checklist — build, git, smoke test, go/no-go
---

# Pre-Deploy Verification

Run a comprehensive pre-deployment check before pushing to production.

## Steps to Execute

### 1. Build Verification
- Run `npm run build` and verify zero errors
- Check for TypeScript compilation warnings
- Verify output exists and contains expected files

### 2. Git Status Check
- Run `git status` to verify all intended changes are staged
- Review `git diff --stat` to confirm scope matches expectations
- Check no sensitive files being committed: `.env`, credentials, API keys, `node_modules/`, database files
- Verify no large binary files being committed

### 3. File-by-File Review
For each changed file, quick sanity check:
- **Server code**: No `console.log` debug statements, no `any` type overuse, no commented-out blocks
- **Client JS**: HTML escaping correct, fetch calls check `res.ok`, modal scroll lock
- **CSS**: No fixed widths without `max-width`, mobile media query exists, touch targets 44px+
- **HTML**: Viewport meta correct, ARIA labels on icon buttons, no inline fixed widths

### 4. Runtime Smoke Test
If the dev server is running:
- Hit health endpoint — should return 200
- Hit main route — should serve or redirect correctly
- Verify static assets load
- Check auth flow works

### 5. Dependency Check
- Run `npm audit` and report any high/critical vulnerabilities
- Check `package.json` and `package-lock.json` in sync
- Verify no dev dependencies imported in production code

### 6. Configuration Check
- Verify no real API keys or secrets in client-side code
- Check environment-specific config uses env variables
- Verify security settings are configurable (secure cookies, CORS origins)

## Output Format

```
[PASS] Build - zero errors
[PASS] Git - no sensitive files staged
[WARN] npm audit - 2 moderate vulnerabilities
[FAIL] app.js line 94 - debug console.log left in
```

End with go/no-go recommendation:
- **GO**: All critical checks pass, warnings are acceptable
- **NO-GO**: Critical issues found, list what must be fixed
