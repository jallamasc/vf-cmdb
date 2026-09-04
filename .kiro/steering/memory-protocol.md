---
inclusion: always
---

# Memory Protocol — Read to Avoid Memory Rot

This project maintains memory across sessions through four artifacts in the
repo. Honor this protocol so context stays fresh and decisions are never lost.

## The four memory artifacts
1. `AGENT_ONBOARDING.md` — how to boot a session + the cbindex tool workflow.
2. `SESSION_STATE.md` — where we are right now: status, open decisions, next
   steps. Highest-churn; treat as the current-state source of truth.
3. `MEMORY_BANK.md` — full rebuild spec, architecture rationale, hard rules,
   and the "what NOT to change" list.
4. Codebase index (`tools/codebase_index/` + `./cbindex`) — semantic recall of
   the live code, regenerated on demand so it never goes stale.

## At the START of meaningful work
- Skim `SESSION_STATE.md` for current status and open items, then consult
  `MEMORY_BANK.md` for hard rules before changing architecture.
- To locate code, prefer `./cbindex search "<question>" --json` (optionally
  `--language python|tsx|sql|yaml`) over broad grep. The index is already built
  on this machine.

## While working
- After editing source under `backend/**` or `frontend/**`, refresh the index:
  `./cbindex build` (fast, incremental). A PostFileSave hook may do this
  automatically; running it manually is still correct.

## At the END of a phase / before ending a session
- Update `SESSION_STATE.md` (status, decisions made, next steps, current HEAD).
- Update `MEMORY_BANK.md` only if an architectural decision or hard rule changed.
- Run `./cbindex build` so the index matches the new code.
- Commit with a Conventional Commit message. Only commit when the user asks.

## Correcting stale memory
The prose files predate this local checkout. If you find a contradiction
(e.g. an old path like /home/ubuntu/vf_cmdb, or ports 3001/5433), trust the
steering files and the live code, and update the prose file in the same change
rather than propagating the stale value.

## Phase-by-phase iteration (current working mode)
The user iterates and tests locally one phase at a time. After each phase:
verify the build (`npm run build` / backend import), update SESSION_STATE.md,
refresh the index, and pause for the user to test before starting the next
phase.
