# BUILD_FREEZE — Git Operations Protocol

**Rule (2026-07-03, from the 2026-07-02 freeze/merge incident): during an
active BUILD_FREEZE, ALL git operations are COORDINATOR-ONLY.**

## What this means

While `GET /command` (or the `commands` array in `POST /next`) reports an
active `BUILD_FREEZE`:

- **Workers and dev-lead MUST NOT run any git command** — no `checkout`,
  `commit`, `branch`, `merge`, `rebase`, `push`, `stash`, `reset`. Not even
  "safe-looking" ones. Reading state (`git status`, `git log`) is allowed.
- The **coordinator** is the only agent that may mutate git state during the
  freeze. The whole point of the freeze is to give it an exclusive window to
  sync, merge and push without racing worker commits.
- Workers' freeze response is unchanged: finish/commit current work **at
  freeze START when instructed**, release locks, heartbeat idle, and wait
  for `RESUME`.

## Why

During the 2026-07-02 sync, the coordinator checked out `main` and merged
branches while worker sessions were still live. Any worker commit, branch
switch, or stash in that window would have landed on the wrong branch or
corrupted the merge in progress. The freeze addendum ("Do NOT run any git
commands — coordinator is performing the git sync/merge NOW") is now the
standing rule, not a one-off.

## Sequence

1. Coordinator issues `BUILD_FREEZE` (`POST /command`).
2. Workers: commit current work if instructed in the freeze reason, release
   locks (`DELETE /lock`), heartbeat idle. After that: **zero git mutations**.
3. Coordinator performs the git sync/merge/push.
4. Coordinator issues `RESUME` (or clears the command).
5. Workers re-sync (`git fetch` / fresh `git status`) before their next
   mutation, since branches may have moved under them.

## Server-restart caveat

`cleanSlate()` clears all active commands on AWM startup — **a freeze does
not survive an AWM restart**. If AWM is restarted mid-freeze, the coordinator
must re-issue `BUILD_FREEZE` immediately, and workers should treat an
unexplained freeze disappearance right after a restart as *still frozen*
until the coordinator confirms otherwise (see 2026-07-03 hang/restart
incident where the freeze silently vanished).
