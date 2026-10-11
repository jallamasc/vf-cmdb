# Backlog — Design

This "spec" is a registry, not a buildable feature, so this design file only
records how the backlog is organized and maintained. The actual items live in
`tasks.md`.

## Structure

`tasks.md` is grouped into six sections, in this fixed order:

1. **Deferred (planned, not yet done)** — real work we intend to do, written as
   `[ ]` checkboxes. Each says what and, briefly, why it was deferred.
2. **Won't-do (decided against, with the reason)** — not checkboxes; each is a
   decision with its rationale so a future reader does not re-open it as a bug.
3. **Out of scope** — things whose absence is intentional (e.g. a column a model
   deliberately lacks), noted so nobody treats the absence as a defect.
4. **Known issues** — accepted defects / rough edges that are tolerated for now,
   with the reason they are acceptable and any footgun to watch for.
5. **Future enhancements (wishlist)** — unprioritized ideas; numbered, not
   checkboxes, so picking one up means promoting it to its own spec first.
6. **Shipped but was untracked** — work that was completed but whose tracking
   had drifted, recorded so its now-checked boxes are not mistaken for new work.

## Maintenance rules

- Small items stay here as checkboxes. Anything larger than a one-liner that
  gets picked up becomes its own `.kiro/specs/<feature>/` spec, with a pointer
  left here.
- Keep the group order above stable so diffs are easy to read.
- This spec is referenced (not duplicated) by `SESSION_STATE.md` and
  `.kiro/steering/memory-protocol.md`.

## Why a spec and not a root file

The user's requirement: the repo root should carry no files Kiro does not
recognize automatically. `.kiro/specs/` is a first-class Kiro location, so a
backlog living here is auto-discovered, whereas a root `BACKLOG.md` is only
"seen" because a steering file happens to point at it. Moving the backlog here
removes that fragile dependency and keeps the root clean. The three prose
memory files remain at the root deliberately — they are already wired in via
`.kiro/steering/memory-protocol.md`, and relocating them would risk breaking
the memory protocol for no real gain.
