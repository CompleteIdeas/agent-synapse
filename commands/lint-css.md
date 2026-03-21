---
description: Audit CSS for mobile responsiveness, touch targets, iOS quirks
---

# CSS & Mobile Responsiveness Audit

Perform a thorough READ-ONLY audit of all CSS files and inline styles for mobile responsiveness, cross-browser compatibility, and best practices. Do NOT modify files — only report findings.

## What to Check

### Layout & Responsive (Critical)
- **Fixed widths breaking mobile**: `width: NNNpx` on containers should use `max-width` + `width: 100%`
- **Missing responsive breakpoint**: Verify `@media (max-width: 768px)` exists with overrides for navigation, modals, forms
- **Flex layouts not wrapping**: Containers with `display: flex` holding variable-width children need `flex-wrap: wrap`
- **Overflow hidden without scroll**: Long content areas need `overflow-x: auto` or `overflow-wrap: break-word`

### Touch & Mobile UX (High)
- **Touch targets too small**: Minimum 44x44px tap targets for all interactive elements (Apple HIG)
- **No active/pressed states**: Touch devices need visual feedback via `:active` pseudo-class
- **Input zoom on iOS**: `<input>`, `<select>`, `<textarea>` with `font-size` below 16px triggers auto-zoom on iOS Safari

### iOS Safari Specific (High)
- **`100vh` bug**: On iOS Safari, `100vh` includes browser chrome. Use `100dvh` as progressive enhancement
- **`position: sticky` vendor prefix**: Include `-webkit-sticky` before `sticky`
- **Modal scroll bleed-through**: Set `overscroll-behavior: contain` on modal overlays
- **Safe area insets**: Fixed/sticky elements should respect `env(safe-area-inset-*)`

### Sticky & Z-Index (Medium)
- **Nav bar z-index**: Sticky nav must have z-index lower than modal backdrop
- **Stacking context conflicts**: `transform`, `filter`, `opacity < 1` create unexpected stacking contexts

### Text & Content (Medium)
- **Long text overflow**: URLs and code snippets need `word-break: break-all` or `overflow-wrap: break-word`
- **Text contrast**: All text must meet WCAG AA (4.5:1 normal, 3:1 large)
- **Consistent spacing**: Mobile padding should reduce proportionally

## Output Format

For each issue:
- CSS file, selector, and line number
- Category (Layout / Touch / iOS / Z-Index / Text)
- Current value and recommended fix
- Code snippet showing the fix

End with a summary and prioritized action list.
