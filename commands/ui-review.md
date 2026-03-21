---
description: Review UI contrast, spacing, consistency, and mobile UX
---

# UI/UX Standards Review

Perform a thorough READ-ONLY review of the application's visual design, interaction patterns, and user experience. Do NOT modify files — only report findings.

## What to Check

### Color & Contrast (Critical)
- **WCAG AA compliance**: Normal text 4.5:1, large text 3:1, UI components 3:1
- **Consistent color palette**: Verify consistent use of CSS custom properties or design tokens
- **Focus indicators**: Interactive elements must have visible focus outlines for keyboard navigation

### Typography & Spacing (High)
- **Font size hierarchy**: Consistent heading sizes, body text, caption text across pages
- **Consistent padding/margins**: Similar elements should have matching spacing
- **Line height**: Body text `line-height: 1.5` or higher

### Component Consistency (High)
- **Button styles**: All buttons use defined classes, no inline style overrides
- **Modal design**: Consistent structure across all modals (header, body, footer)
- **Form design**: Inputs, selects, textareas with consistent borders, padding, focus states
- **Empty states**: Pages with no data show helpful messages

### Mobile UX (High)
- **Navigation**: Nav works at 375px width without horizontal overflow
- **Touch spacing**: Minimum 8px gap between tappable elements
- **Modals on mobile**: Nearly full-width (95vw max), with reduced padding, scrollable
- **Text readability**: No text smaller than 13px on mobile. Inputs >= 16px

### Interaction Patterns (Medium)
- **Loading states**: Async operations show loading indicators
- **Error feedback**: Failed operations show clear error messages
- **Confirmation dialogs**: Destructive actions require confirmation
- **Keyboard navigation**: Tab order follows visual layout, Enter submits forms, Escape closes modals

## Output Format

For each issue:
- Page/component affected
- Category (Color / Typography / Consistency / Mobile / Interaction)
- Current state and recommended fix

End with:
- Overall design consistency score (1-10)
- Top 5 most impactful improvements
- Quick wins vs. larger efforts
