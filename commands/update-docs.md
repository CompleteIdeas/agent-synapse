---
description: Sync API docs, user guide, and inline comments with current code
---

# Documentation Update

Update project documentation to reflect the current state of the codebase. Audits existing docs for accuracy and applies changes where needed.

## Update Procedure

### 1. API Reference Sync

Read every route/endpoint file and compare against API documentation:

For each handler, verify docs include:
- Correct HTTP method and path
- Required headers (auth mechanism)
- Request body schema (all fields, which are required)
- Response JSON shape (including new/removed fields)
- Error responses (status codes and error message format)
- Query parameters or URL params

**Add** entries for routes missing from docs.
**Remove** entries for routes no longer in code.
**Update** entries where request/response shape has changed.

### 2. User Guide Sync

Read current UI code and compare against the user guide:

For each feature area, verify the guide covers:
- How to access the feature
- What the user sees (matches current layout)
- Step-by-step instructions for key workflows
- UI element names match current labels
- New features added since last update
- Features removed or changed

### 3. Inline Code Documentation

For each route handler, verify or add a brief comment block:
```
// POST /api/resources
// Auth: session or API key
// Body: { name, type }
// Returns: { id, name, ... }
```

Keep inline docs minimal — just enough for a contributor to understand the endpoint.

### 4. README Updates

Check that the project README reflects:
- Current setup/install instructions
- Updated environment variable list
- Current architecture overview
- Deployment instructions

## Arguments

`$ARGUMENTS` — Optional description of what changed:
- `added user roles feature` — Focus updates on roles-related docs
- (no arguments) — Full scan of all docs against all code

## Output

After making changes, report what was added, updated, or verified as current.
