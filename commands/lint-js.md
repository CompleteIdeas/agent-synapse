---
description: Audit JS/TS files for XSS, fetch errors, DOM leaks, and mobile bugs
---

# JavaScript / TypeScript Lint & Bug Detection

Perform a thorough READ-ONLY audit of all JavaScript and TypeScript files for security vulnerabilities, performance issues, and common bugs. Do NOT modify files — only report findings, grouped by severity.

## What to Check

### Security (Critical)
- **XSS via escapeHtml**: Every HTML escape function must escape all 5 characters: `&`, `<`, `>`, `"`, `'`
- **URL scheme validation**: User-provided URLs must validate scheme. Only `http:`, `https:`, `mailto:` allowed. Block `javascript:`, `data:`, `vbscript:`
- **Raw HTML rendering**: Content injected via `.innerHTML` without escaping
- **DOM-based injection**: `innerHTML = userInput` or template literals interpolating unescaped data into HTML attributes

### Fetch / API Calls (High)
- **Missing `res.ok` checks**: Every `fetch()` that parses response with `.json()` must check `res.ok` first
- **Missing error handling**: Fetch calls should have try/catch. API errors should show user-facing messages
- **Missing `Content-Type` headers**: POST/PUT requests sending JSON must include `Content-Type: application/json`

### DOM & Events (High)
- **Duplicate event listeners**: Render functions called multiple times adding duplicate listeners
- **Memory leaks**: Rich text editors not destroyed before re-creating. Intervals not cleared. Document-level listeners not removed
- **innerHTML += in loops**: Forces re-parse every iteration. Build string first, assign once
- **Select option duplication**: Populate functions called multiple times without clearing existing options

### String & Data (Medium)
- **`.replace('_', ' ')` without global flag**: Only replaces first occurrence. Use `.replace(/_/g, ' ')`
- **Missing null/undefined guards**: Functions called with potentially null values without fallbacks
- **Clipboard fallback**: `el.select()` doesn't work on iOS Safari. Use `el.setSelectionRange(0, el.value.length)`

### UX Patterns (Medium)
- **Modal scroll lock**: Opening modals should set `body.style.overflow = 'hidden'`, closing should restore
- **Double-click protection**: Submit handlers should disable button during async operations
- **Polling visibility**: `setInterval` for polling should pause when `document.hidden` is true

## Output Format

For each file, list issues grouped by severity. Include:
- File path and line number
- Issue category (Security / Fetch / DOM / String / UX)
- Description of the problem
- Suggested fix (code snippet)

End with a summary count: X critical, Y high, Z medium issues found.
