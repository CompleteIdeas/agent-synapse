---
name: ask-coworker
description: Ask a different LLM for a fresh perspective when stuck or looping
argument-hint: "[question or 'help me with...']"
---

# Ask a Co-Worker

Get a fresh perspective from a different AI model when you're stuck, looping, or want to validate an approach. Sometimes all it takes is a different way of looking at the problem.

## When to Use This Skill

### Auto-invoke (Claude should proactively use this when):
- You've attempted the **same approach 3+ times** and it keeps failing
- You're going in circles — reverting changes, re-trying the same fix
- An error message is opaque and your debugging isn't converging
- You need a fundamentally **different architectural perspective**
- You've exhausted your ideas and are about to tell the user "I'm stuck"

### Manual invoke (user triggers with `/ask-coworker`):
- User explicitly wants a second opinion
- User wants to compare approaches across models
- Brainstorming — getting multiple angles on a design decision

## Available Co-Workers

**Always use the best coding models.** The point is expert-level second opinions, not saving tokens.

### Codex Models (Responses API) — Best for Code
These are OpenAI's dedicated coding models. Use `ask-codex.py` (they require the Responses API, not Chat Completions).

| Model | Best For |
|-------|----------|
| `gpt-5.2-codex` | **Default.** Best coding model with project access. Strong at debugging, code gen, and architecture. |
| `gpt-5.3-codex` | Latest codex model (enable in OpenAI project if needed). |

**Note:** The `llm` CLI key is scoped to OpenAI project `proj_mqVbns7pYlLG75p4xo8dFIy4`. Only models enabled in that project will work. If a model returns 403, it needs to be enabled in the project settings at platform.openai.com.

### Chat Models (llm CLI)
General-purpose models available via `llm`. Use for architecture, design, and non-code questions.
**Important:** The `llm` CLI uses the same project-scoped key. Most chat models (o3, o4-mini, gpt-4.1) return 403. Use `ask-codex.py` for all queries until the project is updated or the key is changed.

### Model Selection
- **All questions → `gpt-5.2-codex`** via ask-codex.py (default, confirmed working)
- If project access is expanded, `gpt-5.3-codex` and `llm` chat models become available

## How to Ask

### Primary tool: `ask-codex.py`

```bash
# Default (gpt-5.2-codex)
python C:/Users/robert/project/ask-coworker/ask-codex.py "Your question here"

# With system prompt
python C:/Users/robert/project/ask-coworker/ask-codex.py -s "You are a TypeScript expert" "Your question here"

# Explicit model (if project has access)
python C:/Users/robert/project/ask-coworker/ask-codex.py -m gpt-5.3-codex "Your question here"
```

### Fallback: `llm` CLI (if project-scoped key is updated)
```bash
llm -m o3 "Your question here"
llm -m gpt-4.1 "Your question here"
```

## Rules for Asking Good Questions

### DO:
1. **Include the error message** — paste the exact error, not a summary
2. **Include the relevant code snippet** — 10-30 lines of context, not entire files
3. **State what you've tried** — "I tried X and Y, both failed because Z"
4. **Ask a specific question** — "Why might this deadlock?" not "Help"
5. **Include the tech stack** — "Node 20, TypeScript, PostgreSQL 16, Express"

### DON'T:
- Paste entire files (token waste, dilutes the question)
- Ask vague questions ("What's wrong with this code?")
- Use this as a first resort — try solving it yourself first
- Blindly trust the response — validate before applying

## Question Templates

### Debugging a persistent error
```bash
python C:/Users/robert/project/ask-coworker/ask-codex.py -s "You are a debugging expert. Be concise and specific." "
I'm getting this error repeatedly and can't figure out why:

ERROR: [paste exact error]

Relevant code:
[10-30 lines of relevant code]

What I've tried:
- [approach 1 and why it failed]
- [approach 2 and why it failed]

Tech stack: [languages, frameworks, versions]
What am I missing?
"
```

### Architecture/design decision
```bash
python C:/Users/robert/project/ask-coworker/ask-codex.py -s "You are a senior software architect. Give pros/cons and a clear recommendation." "
I need to decide between these approaches for [problem]:

Option A: [description]
Option B: [description]

Context: [constraints, scale, team size, timeline]
"
```

### Alternative approach brainstorm
```bash
python C:/Users/robert/project/ask-coworker/ask-codex.py -s "Suggest 3 completely different approaches. Be creative." "
Current approach: [what you're doing]
Problem: [why it's not working]
Constraints: [what must be preserved]
"
```

## Interpreting Responses

After receiving a co-worker's response:

1. **Don't blindly apply suggestions** — evaluate them critically
2. **Look for the insight, not the exact code** — the value is the different perspective
3. **If the suggestion doesn't work**, that's fine — it may still have shifted your thinking
4. **Report back to the user** — summarize what the co-worker suggested and your assessment:
   - "I asked Codex about the deadlock. It suggested [X]. I think that's worth trying because [Y]."
   - "o3 suggested [approach], but I don't think it applies here because [reason]. However, it did make me realize [insight]."

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "API key not found" | Run `llm keys path` to find keys.json, verify keys exist |
| "model does not exist" (400) | Model name is wrong — check current model IDs at platform.openai.com/docs/models |
| "does not have access" (403) | Model not enabled in OpenAI project — enable it at platform.openai.com |
| Timeout on long responses | Increase timeout in ask-codex.py (default 120s) |
| Want to review past queries | `llm logs list` shows history (llm only, not codex) |
