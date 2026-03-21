---
description: Review code quality — memory leaks, DRY, error handling, patterns
---

# Code Quality & Performance Review

Perform a thorough READ-ONLY audit of the codebase for code quality, performance bottlenecks, maintainability issues, and adherence to best practices. Covers both server-side and client-side code. Do NOT modify files — only report findings.

## Server-Side

### Architecture & Patterns (High)
- **Route handler size**: Route handlers should delegate to service functions, not contain business logic directly. Handlers over 30 lines likely need extraction
- **Error handling consistency**: All async handlers should have try/catch with consistent error response format. Check for unhandled promise rejections
- **Database query safety**: Verify all queries use parameterized statements. Check for N+1 query patterns (querying in a loop instead of batch)
- **Service layer separation**: Database access should be in service files, not route handlers
- **Configuration management**: Sensitive config should use environment variables

### Type Safety (Medium)
- **Type safety**: Look for `any` types that could be more specific. Check that function return types are explicit
- **Null handling**: Verify that potentially null/undefined values are checked before use
- **Import organization**: Imports should be grouped (node built-ins, third-party, local) and unused imports removed
- **Consistent naming**: Functions, variables, and files should follow consistent naming conventions

### Database (Medium)
- **Schema validation**: Check that schema has appropriate constraints (NOT NULL, UNIQUE, FOREIGN KEY)
- **Index usage**: Frequently queried columns should have indexes
- **Migration strategy**: Schema changes should be versioned
- **Date handling**: Verify consistent date format across all operations

## Client-Side

### Performance (High)
- **DOM manipulation in loops**: `innerHTML +=` in loops forces re-parse on every iteration. Build strings first, assign once
- **Memory leaks**: Rich text editors must be destroyed before re-creating. `setInterval` must be cleared. Event listeners on `document`/`window` must be removed on cleanup
- **Network requests**: Check for duplicate or unnecessary API calls

### Code Organization (Medium)
- **Global scope pollution**: Check for naming conflicts between files
- **Repeated code across files**: Utility functions duplicated in multiple files should be extracted
- **Magic numbers/strings**: API endpoints and status strings should be constants
- **Function length**: Functions over 40 lines should be broken into smaller pieces
- **Dead code**: Functions defined but never called, commented-out code blocks

### Error Handling (Medium)
- **Silent failures**: `catch (err) { console.error(err) }` without user feedback
- **Network error handling**: Fetch calls should handle both network errors and HTTP errors
- **Input validation**: Client-side validation should exist as UX improvement but server must validate too

## Output Format

For each issue, report:
- File path and line number(s)
- Category (Architecture / Performance / Organization / Error Handling / Maintainability)
- Severity (High / Medium / Low)
- Description and impact
- Recommended fix

End with:
- Technical debt summary
- Top 5 improvements by impact
- Refactoring opportunities that would reduce future bug risk
