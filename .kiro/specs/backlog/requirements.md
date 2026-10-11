# Backlog — Requirements

## Purpose

This spec is the single, Kiro-recognized home for pending, deferred, declined,
and wishlist work across the whole vf-cmdb project. It is NOT a single feature
to build end-to-end; it is a standing registry. `SESSION_STATE.md` records
*where we are now*; this spec records *what is intentionally not done yet, and
why*.

It lives under `.kiro/specs/` (instead of a loose `BACKLOG.md` at the repo
root) so Kiro picks it up automatically through the spec system, and so the
repo root carries no backlog file that nothing references. The prose memory
files (`SESSION_STATE.md`, `MEMORY_BANK.md`, `AGENT_ONBOARDING.md`) stay at the
root because `.kiro/steering/memory-protocol.md` already wires them into every
session.

## How to use it

- `tasks.md` is the live checklist. Each `[ ]` item is open; `[x]` is done;
  items under **Won't-do** / **Out of scope** are intentionally not checkboxes
  (they are decisions, not work).
- When a deferred item is picked up and it is more than a one-liner, promote it
  to its own `.kiro/specs/<feature>/` spec and leave a pointer here rather than
  executing a large feature directly from this list.
- When something is finished, check it off here (and record durable decisions
  in `MEMORY_BANK.md` if a hard rule changed).

## Requirements

1. THE SYSTEM SHALL keep every pending / deferred / declined / wishlist item in
   this spec's `tasks.md`, grouped into: Deferred (planned, not yet done),
   Won't-do (decided against, with the reason), Out of scope, Known issues,
   Future enhancements, and Shipped-but-was-untracked.

2. WHEN a new deferred item arises during work, THE SYSTEM SHALL record it as a
   `tasks.md` checkbox here rather than letting it accumulate as prose in
   `SESSION_STATE.md`.

3. WHEN a deferred item is completed, THE SYSTEM SHALL check it off here.

4. THE SYSTEM SHALL remain the target of the pointers in
   `.kiro/steering/memory-protocol.md` and `SESSION_STATE.md`, so a fresh
   session is directed here for open work.

5. THE repo root SHALL NOT contain a free-floating `BACKLOG.md`; the backlog
   content lives only in this spec.
