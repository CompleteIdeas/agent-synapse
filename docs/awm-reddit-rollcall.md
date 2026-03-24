# Reddit Comment — Roll Call Thread

**Replying to:** "ROLL CALL - For anyone working on agent memory in production systems. How do you enforce getting the agent to look back at its memory?"

---

This was the exact problem that drove me to build lifecycle hooks into my setup. The memory system itself doesn't matter if the agent never bothers to check it.

What worked for me: I have a set of instructions in CLAUDE.md (the file Claude Code reads every session) that tell it *when* to use memory — not just that memory exists, but specific triggers. Session start? Call `memory_restore` to recover previous context. Starting a task? Call `memory_task_begin`, which auto-checkpoints your state and recalls relevant memories. After a failed attempt? Check if there's prior knowledge before trying again. Before refactoring? Recall what you know about that area first. The agent follows these because they're in its system instructions, not because it decides to on its own.

The actual memory layer is an MCP server called [AgentWorkingMemory](https://github.com/CompleteIdeas/agent-working-memory) that handles storage, retrieval, salience filtering, and consolidation. But the enforcement piece is just clear instructions about lifecycle moments: session start, task begin, task end, after failures, before architectural changes, after context compaction. Once you frame it as "here are the 6 moments you MUST check memory," the agent actually does it consistently. No magic — just explicit rules at the right abstraction level.
