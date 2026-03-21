---
description: Audit HTML for accessibility, viewport meta, ARIA, inline styles
---

# HTML Standards & Accessibility Audit

Perform a thorough READ-ONLY audit of all HTML files for accessibility, semantic markup, mobile meta tags, and standards compliance. Do NOT modify files — only report findings.

## What to Check

### Meta & Head (Critical)
- **Viewport meta tag**: Every page must have `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">`
- **Charset**: Must have `<meta charset="UTF-8">` before any content
- **Title**: Every page needs a descriptive `<title>`
- **CSS loading**: Stylesheets in `<head>`, scripts at end of `<body>` or with `defer`

### Accessibility / ARIA (High)
- **Close buttons**: Icon-only buttons must have `aria-label`
- **Form labels**: Every input needs `<label for="id">` or `aria-label`. Check `for` attributes match `id`s
- **Button vs link**: Actions should be `<button>`, navigation should be `<a>`. No `<a>` with `onclick` and no `href`
- **Landmark roles**: Use semantic elements: `<nav>`, `<main>`, `<aside>`, `<header>`, `<footer>`
- **Focus management**: Modal open should move focus to modal. Close should return focus to trigger

### Inline Styles That Break Mobile (High)
- **Fixed widths**: `style="width:600px"` overrides CSS media queries. Use `max-width` + `width:100%`
- **Fixed heights**: `style="height:NNNpx"` can cause overflow on mobile. Use `min-height`
- **Small font sizes**: Inline `font-size` below 14px hard to read on mobile

### Script Loading (Medium)
- **Script order**: Scripts depending on other scripts must load in correct order
- **CDN fallback**: External CDN scripts should have fallback or graceful degradation

### HTML Validity (Medium)
- **Duplicate IDs**: No two elements on same page should have the same `id`
- **Unclosed tags**: Verify all tags properly closed
- **Boolean attributes**: Use `required` not `required="required"`

## Output Format

For each file, list issues with:
- File path and line number
- Category (Meta / ARIA / Inline Style / Script / Validity)
- Problem and impact
- Recommended fix with code

End with compliance summary and prioritized fix list.
