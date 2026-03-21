---
name: user-docs-from-code
description: Reverse-engineer end-user documentation from code and UX. Analyzes routes, components, APIs, models, and UI text to produce product overviews, user guides, feature briefs, how-tos, FAQs, and troubleshooting docs — all grounded in code evidence.
---

# Reverse-Engineer End-User Documentation From Code + UX

**Activate when:** The user asks for end-user documentation, user guides, feature docs, product documentation, or wants to understand what an app does from a user's perspective. Also useful when onboarding non-technical stakeholders to an existing codebase.

---

## Core Principle

Write documentation from the **user's perspective**, but prove every behavior by referencing the code artifacts that implement it (routes, handlers, UI components, feature flags, permissions, validation, error messages). If the code cannot confirm something, do not invent it — capture it in "Unknowns / Needs Confirmation".

---

## Workflow

### Phase 1 — Product Intent & Audience (Evidence-Based)

Determine what the app is intended for by analyzing:
- README(s), package metadata, app titles, marketing strings
- UI navigation labels, page titles, empty states
- Domain models/entities and primary workflows

Produce **docs/product-overview.md** containing:
- What this app is (1-2 paragraphs)
- Who it's for (roles/personas you can justify)
- Core jobs-to-be-done (top 5)
- Glossary of domain terms (based on model/entity naming)
- **Evidence** subsection listing key files that informed each conclusion

### Phase 2 — UX Surface Area Map (Feature Inventory)

Create a complete inventory of user-visible surfaces:
- Pages/screens/routes
- Primary navigation items
- Key dialogs/modals/wizards
- Forms and major inputs
- Notifications/toasts
- Settings/preferences
- Import/export, files, integrations
- Admin-only views (if any)

Output **docs/ux-map.md**:
- Table: Screen -> Purpose -> Primary actions -> Who can access -> Code references

Rules:
- Screens must be tied to actual routes (frontend routing) or server endpoints (if server-rendered)
- For each screen, cite the component(s) and the API calls it relies on

### Phase 3 — Behavior Extraction (Function -> User-Facing Effect)

For each user-facing feature, trace:
- UI entry point (button/menu/route)
- Frontend handler/function(s)
- API endpoint(s) or service function(s)
- Domain operation(s) (create/update/delete/process)
- Validation rules
- Permissions/roles/feature flags
- Error states & user-visible messages
- Side effects (emails, background jobs, files, webhooks)

Create a "Feature Brief" for every feature:
- Feature name (user language, not code language)
- When you'd use it (user goal)
- Steps (happy path)
- What happens behind the scenes (brief, user-safe)
- Requirements/permissions
- Limits/constraints (file size, rate limits, required fields, etc.)
- Troubleshooting (common errors + what the user can do)

Output: One Markdown file per feature under **docs/features/**
- Example: `docs/features/create-event.md`
- Naming should match user terminology
- Every claim must include a **Code References** block listing file paths + symbols

### Phase 4 — Assemble End-User Docs Set

Create the following Markdown files:

#### docs/user-guide.md
Narrative guide walking a new user through:
- Getting started / first-run flow
- Core workflows in recommended order
- How to accomplish the top jobs-to-be-done
- Write "(Screenshot placeholder)" lines where visuals would help

#### docs/how-to.md
Task-oriented "recipes" (at least 10):
- "How to create X"
- "How to edit Y"
- "How to export Z"
Each recipe references the relevant feature briefs.

#### docs/reference.md
Reference-style section:
- All settings with meanings + defaults (if discoverable)
- Field-by-field explanation of key forms
- Statuses/state machine meanings (based on enums/constants)
- Keyboard shortcuts (if present)

#### docs/faq.md
FAQ sourced from:
- Error messages in code
- Edge-case handling
- "Empty state" guidance text
- Validation failures

#### docs/roles-permissions.md (if applicable)
Roles, permissions, and what each role can do — grounded in auth/ACL code.

#### docs/troubleshooting.md
- Common problems and fixes
- Interpreting error messages users actually see
- Connectivity/auth issues
- Data import failures
- Performance/timeouts (if surfaced)

#### docs/known-limitations.md
Only limitations provable from code.

#### docs/unknowns.md
Anything not confirmable from code:
- Required environment assumptions
- Missing product decisions
- UI intentions not implemented
- Questions to ask the product owner

### Phase 5 — Tone & Usability Requirements

- Write for non-technical users unless the UI clearly targets technical admins
- Use user language from the UI text wherever possible (labels, button names)
- Use consistent terminology (maintain the glossary)
- Avoid internal code names unless visible in the UX
- Short paragraphs, numbered steps, clear headings
- Include "What you'll see" and "What to do next" in workflows

### Phase 6 — Validation Pass

Before finalizing docs:
1. Cross-check every step with code reality (buttons exist, routes exist, commands are reachable, validation rules match)
2. Create **docs/traceability.md** mapping: Feature doc -> UI components -> APIs -> domain functions
3. If a behavior is likely but not provable, mark it as **Unverified** and move to docs/unknowns.md

---

## Platform-Specific Add-ons

### Web/API Apps
In each feature brief, also include:
- "Data saved/changed" — what gets persisted
- "Audit trail" — if logging/history exists
- In troubleshooting, translate HTTP error codes into user language
- Identify which actions are instantaneous vs queued background jobs

### Desktop/Mobile Apps
Also include:
- OS-specific notes (file picker, permissions, offline mode)
- Onboarding + account/login flows with all states
- Where data is stored locally (only if provable from code)

---

## Deliverables Checklist

| File | Required |
|------|----------|
| `docs/product-overview.md` | Always |
| `docs/ux-map.md` | Always |
| `docs/user-guide.md` | Always |
| `docs/how-to.md` | Always |
| `docs/reference.md` | Always |
| `docs/faq.md` | Always |
| `docs/troubleshooting.md` | Always |
| `docs/known-limitations.md` | Always |
| `docs/unknowns.md` | Always |
| `docs/traceability.md` | Always |
| `docs/roles-permissions.md` | If auth/roles exist |
| `docs/features/*.md` | One per user-facing feature |

---

## How to Use

When invoked:
1. Ask the user which repo to analyze (or use current working directory)
2. Start with Phase 1 (product overview) and Phase 2 (UX map) in parallel
3. Present the UX map to the user for validation before proceeding
4. Work through Phase 3 feature-by-feature
5. Assemble Phase 4 docs
6. Run Phase 6 validation pass
7. Present final summary of all docs created

For large apps, offer to focus on specific feature areas first rather than documenting everything at once.
