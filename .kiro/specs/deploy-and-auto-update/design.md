# Design — Deploy Anywhere + In-App Version Awareness & One-Click Update

## Overview

This feature gives the Virtualfactor IT CMDB a real, inspectable version; a
quiet in-app "update available" indicator; a one-click "Update now" button; a
pull-not-build host update path driven by `podman auto-update` against
`ghcr.io`; and the CI/registry/Quadlet plumbing that produces and follows the
images. It is designed for a single-user, no-auth, private-network deployment
on Podman Quadlet (rootless), and it preserves every hard rule of the fixed
stack (FastAPI/async SQLAlchemy/Postgres on the backend; React 18 + Vite 5 +
AG Grid on the frontend; Podman + Quadlet as the only production deploy path).

The central architectural constraint is the **container/host trust boundary**:
the backend container runs rootless and MUST NEVER call `podman`, `systemctl`,
or touch the host. Instead the container and host communicate only through a
**shared bind-mounted directory** (`/var/lib/vf-cmdb/` in the container ⇄ a host
path). The browser → backend path triggers an update by *writing a marker file*;
a **host-side systemd `.path` unit** watches that file and runs the update
script, which writes a **status file** the backend reads back. This keeps the
privileged action entirely on the host while the no-auth container only ever
reads and writes files inside its own mount.

The second constraint, stated once here and repeated in every relevant section,
is the **migration-rollback caveat**: `backend/entrypoint.sh` runs
`alembic upgrade head` on every container start, so re-pulling an older image
does **not** undo a migration that already ran. Schema rollback is possible only
by restoring the pre-update database backup (`deploy/scripts/vf-cmdb-backup.sh`
→ `deploy/scripts/vf-cmdb-restore.sh`). The design takes a pre-update backup
before every applied update and documents this caveat at the code, script, and
docs layers.

The third constraint is **silent-on-failure networking**: every outbound call
to `api.github.com` or `ghcr.io` has a bounded timeout, is caught, and degrades
to "no update info" — it never raises to the UI, never blocks a request beyond
the timeout, and never crashes the app. An offline host runs the CMDB normally
and simply shows no update notice.

The work maps onto implementation tasks as follows:

- **Task A** → `.kiro` steering/skills/hooks alignment (no code here; design in §8).
- **Task B** → `BACKLOG.md` + spec skeleton + `SESSION_STATE.md` (no code; §8).
- **Task C** → PART 1 + the detection half of PART 2 (`backend/app/version.py`,
  `GET /api/v1/meta/version`).
- **Task D** → PART 2 frontend (footer version string + update badge).
- **Task E** → PART 2 apply plumbing (`/api/v1/admin/update` + status) and the
  host-side marker/path/service wiring in PART 3.
- **Task F** → PART 4 (CI workflows, ghcr.io, Quadlet repoint, Containerfile
  build args).
- **Task G** → docs + finalize (§8).

The technology stack is **locked** by this design: Python 3.11 / FastAPI /
`httpx` (already a backend dependency, used by `special.py`) for the backend;
React 18 + TanStack Query 5 + the existing `fetch`-based `api.ts` client for the
frontend; GitHub Actions + `docker/build-push-action` + GHCR for CI; Podman
Quadlet + systemd `.path`/`.service` units + Bash for host update. No new
framework, runtime, or library is introduced beyond GitHub Actions marketplace
actions used only inside CI.

---

## PART 1 — Version awareness (Task C)

### `backend/app/version.py` — the single source of truth

A new module `backend/app/version.py` resolves the running version from the
environment with safe fallbacks, so the version is baked into the image at build
time and never duplicated as a literal across files:

```python
# backend/app/version.py
from __future__ import annotations
import os
from functools import lru_cache
from dataclasses import dataclass

@dataclass(frozen=True)
class VersionInfo:
    version: str      # e.g. "1.5.0" or "dev"
    git_sha: str      # e.g. "a1b2c3d" or "unknown"
    built_at: str     # ISO-8601 or "unknown"

@lru_cache
def get_version_info() -> VersionInfo:
    return VersionInfo(
        version=os.getenv("VF_VERSION", "dev").strip() or "dev",
        git_sha=os.getenv("VF_GIT_SHA", "unknown").strip() or "unknown",
        built_at=os.getenv("VF_BUILT_AT", "unknown").strip() or "unknown",
    )
```

Resolution rules and defaults:
- `VF_VERSION` → `version`. Fallback `"dev"`. Any leading `v` is stripped later
  by the semver parser (see §C.semver); it is stored here verbatim.
- `VF_GIT_SHA` → `git_sha`. Fallback `"unknown"`.
- `VF_BUILT_AT` → `built_at`. Fallback `"unknown"`.
- Empty-string env values are treated as unset (the `or "dev"` guard), so a
  Containerfile `ENV VF_VERSION=""` does not produce an empty version.

`get_version_info()` is `lru_cache`d: the values are immutable for the life of
the process (they come from the image), so this is read once.

### FastAPI title version sourced from `version.py`

`backend/app/main.py` currently hard-codes `version="1.0.0"`. Change to:

```python
from .version import get_version_info
app = FastAPI(title=settings.app_name, version=get_version_info().version)
```

This removes the duplicated literal (Task C.1) and keeps the OpenAPI docs
version in sync with the baked value automatically.

### `GET /api/v1/meta/version`

The endpoint lives in `backend/app/routers/special.py` alongside the existing
`/meta/entities`-style routes, registered via `app.include_router(special.router,
prefix=settings.api_prefix)` **before** the generic catch-all (Task C.7 — this
ordering already holds in `main.py`; the new route inherits it because it is in
`special.router`). Placing it in `special.py` means it is reachable through
nginx's `/api/` proxy in both dev and prod (Task C: the frontend only sees the
backend through `/api/`).

Response shape (Task C.2):

```json
{
  "version": "1.5.0",
  "gitSha": "a1b2c3d",
  "builtAt": "2026-01-10T04:00:00Z",
  "latest": "1.6.0",
  "latestTag": "v1.6.0",
  "updateAvailable": true
}
```

`latest` is `null` and `updateAvailable` is `false` whenever the GitHub lookup
is unavailable (see error handling). Field names are camelCase to match the
frontend convention; the frontend reads them directly.

Handler sketch:

```python
@router.get("/meta/version")
async def meta_version() -> dict:
    info = get_version_info()
    latest_tag = await _latest_release_tag()   # cached, bounded, never raises
    latest = _normalize_tag(latest_tag)         # "v1.6.0" -> "1.6.0" or None
    update = is_newer(latest, info.version) if latest else False
    return {
        "version": info.version,
        "gitSha": info.git_sha,
        "builtAt": info.built_at,
        "latest": latest,
        "latestTag": latest_tag,
        "updateAvailable": update,
    }
```

### GitHub Releases lookup — `_latest_release_tag()`

A module-level async helper in `special.py` (or a small `backend/app/github.py`
to keep `special.py` lean — **chosen: `backend/app/updates.py`**, a new module
that also owns the admin-update file I/O in PART 2, so all update concerns sit
together and `special.py` only imports from it).

```python
# backend/app/updates.py
GITHUB_LATEST = "https://api.github.com/repos/jallamasc/vf-cmdb/releases/latest"
_CACHE_TTL = 600  # seconds (10 min) — Task C.6
_cache: tuple[float, str | None] = (0.0, None)   # (fetched_at, tag_or_None)

async def latest_release_tag() -> str | None:
    now = time.monotonic()
    fetched_at, cached = _cache
    if now - fetched_at < _CACHE_TTL:
        return cached
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(
                GITHUB_LATEST,
                headers={"Accept": "application/vnd.github+json"},
            )
            resp.raise_for_status()
            tag = resp.json().get("tag_name")
            tag = tag if isinstance(tag, str) and tag else None
    except Exception:
        # Any failure (network, timeout, 403 rate-limit, 404 no release,
        # bad JSON) -> return the last successful value WITHOUT refreshing the
        # cache window. A failure does not advance `fetched_at`, so the value
        # falls back to the last successful fetch and we retry on the next poll
        # once that previous success ages past the TTL (not "sooner because of
        # the failure"). Before any success the initial (0.0, None) means every
        # poll retries.
        return cached
    _cache = (now, tag)
    return tag
```

Caching (Task C.6): a 10-minute TTL means frequent frontend polls (every ~60 s)
hit the cache ~90% of the time; a transient GitHub outage tolerates up to the
TTL on the last known good value. On any failure the cache timestamp is **not**
advanced and the last successful value is returned, so a transient outage never
replaces a good value with "null"; the next real lookup happens on the first
poll after the previous *success* ages past the TTL (and before any success,
every poll retries). The cache is a process-global tuple guarded by the GIL for the
simple read/write here; no lock is needed because a lost update at worst causes
one extra GitHub call. (If this ever needs strictness, an `asyncio.Lock` can be
added, but it is unnecessary for a single-user app.)

Anonymous (Task C.3): no `Authorization` header, no token. The public repo
allows 60 unauthenticated requests/hour per IP from `api.github.com`; the
10-minute backend cache keeps a single host at ~6 requests/hour regardless of
how many browser tabs poll.

### Semver comparison — `is_newer()` (Task C.4, NFR 6, unit-testable)

A pure function in `backend/app/updates.py`, no network:

```python
_SEMVER = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)")

def parse_semver(s: str | None) -> tuple[int, int, int] | None:
    if not s:
        return None
    m = _SEMVER.match(s.strip())
    if not m:
        return None
    return int(m.group(1)), int(m.group(2)), int(m.group(3))

def is_newer(candidate: str | None, running: str | None) -> bool:
    c, r = parse_semver(candidate), parse_semver(running)
    if c is None or r is None:
        return False      # unknown/malformed/"dev" -> never "update available"
    return c > r          # strictly newer only (Task C.4)
```

Behavior table (matches end-to-end AC 10):
- `is_newer("1.5.0", "1.4.0")` → `True`
- `is_newer("1.5.0", "1.5.0")` → `False`
- `is_newer("1.5.0", "1.6.0")` → `False`
- `is_newer(None, "1.4.0")` / malformed → `False`
- running `"dev"` (unparseable) → always `False`, so a dev build never nags.

A trailing pre-release suffix (`v1.5.0-rc1`) is ignored by the regex (it matches
the `X.Y.Z` prefix only); this is acceptable because the release gate in PART 4
only ever publishes clean `vX.Y.Z` tags.

### Error handling — PART 1

| Operation | Failure | Recoverable? | Caller sees | Logged |
|---|---|---|---|---|
| `get_version_info()` | env unset | yes (fallbacks) | `"dev"`/`"unknown"` | no |
| GitHub GET | timeout/network | yes | `latest=null, updateAvailable=false` | DEBUG once, not per-call |
| GitHub GET | 403 rate-limit | yes | last-known-good or null | DEBUG |
| GitHub GET | 404 (no release yet) | yes | null | DEBUG |
| GitHub GET | bad/unparseable JSON | yes | null | DEBUG |
| `is_newer` | malformed input | yes | `False` | no |

The endpoint itself never returns a non-200 for an upstream failure — it always
returns the running version with `latest=null`. This satisfies NFR 1 and
end-to-end AC 3. Logging is at DEBUG so an offline host does not spam logs; the
app never treats an unreachable GitHub as an error condition.

### Frontend running-version source (Vite `define`)

The frontend learns its *own* build-time version from a Vite `define`, falling
back to `package.json` version then `"dev"`.

**`define` is ADDED as a new top-level key alongside the existing `plugins`,
`server`, and `test` keys — none of those blocks is removed or altered.** The
live `frontend/vite.config.ts` already contains a `server.proxy` block (the dev
`/api` → `127.0.0.1:8000` proxy) and a `test:` block (`environment: "happy-dom"`,
`globals: true`, `setupFiles: ["./src/test/setup.ts"]`, `css: false`) plus the
`/// <reference types="vitest" />` header line; the Vitest suite this feature
adds (`VersionFooter.test.tsx`, NFR 6) and the dev proxy both depend on those
staying intact. The edit therefore keeps every existing block verbatim and only
inserts the new `define` key and the `import pkg` line:

```ts
/// <reference types="vitest" />                 // PRESERVED (do not drop)
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";                // ADDED

export default defineConfig({
  plugins: [react()],                            // PRESERVED
  define: {                                       // ADDED (new top-level key)
    __APP_VERSION__: JSON.stringify(
      process.env.VF_VERSION || pkg.version || "dev"
    ),
    __APP_GIT_SHA__: JSON.stringify(process.env.VF_GIT_SHA || "unknown"),
  },
  server: { /* PRESERVED verbatim — host/port + /api, /health proxy */ },
  test:   { /* PRESERVED verbatim — happy-dom, globals, setupFiles, css:false */ },
});
```

A `frontend/src/vite-env.d.ts` (the existing env d.ts) declares
`declare const __APP_VERSION__: string;` (and `__APP_GIT_SHA__`) so TypeScript
compiles. **`npm run build` runs `tsc -b` before `vite build` and fails the
build on any type error**, so the `import pkg from "./package.json"` must also
compile under `tsc -b`, not only resolve at Vite bundle time: ensure
`resolveJsonModule: true` (and `esModuleInterop`/`allowSyntheticDefaultImports`
as the tsconfig already uses) is set in the tsconfig that `tsc -b` applies to
`vite.config.ts`. Vite resolves the JSON import at build time regardless; the
explicit `resolveJsonModule` requirement is purely so the `tsc -b` type pass
does not reject the default JSON import. Note: the
frontend's build-time version is informational; the authoritative "what is
running / is an update available" answer always comes from the backend
`/api/v1/meta/version` (which is what the badge logic keys off), because the
backend is the component that actually queries GitHub. The Vite define exists so
the footer can show a version even before the first successful API call.

---

## PART 2 — Update-available detection + one-click apply (Task D + Task E frontend/backend)

### Frontend: footer version string + update badge (Task D)

`frontend/src/components/Layout.tsx` footer div (currently the
`"Single-user · No auth · Home network"` line, ~lines 134-136) becomes the host
for the version string and the update affordance. A new component
`frontend/src/components/VersionFooter.tsx` encapsulates the logic so `Layout`
stays declarative and the component is Vitest-testable in isolation.

**QueryClientProvider ancestor — verified, no change needed.** `VersionFooter`'s
`useQuery` (and `UpdateBadge`'s `useMutation`) require a TanStack Query
`QueryClientProvider` ancestor. This holds in the live tree and was verified:
`frontend/src/main.tsx` creates the `QueryClient` and renders
`<QueryClientProvider client={queryClient}><BrowserRouter><App/></BrowserRouter></QueryClientProvider>`,
and `frontend/src/App.tsx` renders `Layout` as a routed element
(`<Route element={<Layout/>}>`). Because `App` — and therefore `Layout` and its
sidebar footer — is rendered *inside* `QueryClientProvider`, `VersionFooter` has
a client in scope; the provider wraps the whole shell, not just the routed
`<Outlet/>` page content. **The implementer MUST NOT move the provider down to
wrap only page content**; doing so would make `useQuery` throw "No QueryClient
set" and crash the entire shell, violating the silent-degrade requirements
(Task D.5, NFR 1). No provider hoisting is required by this design — the current
boundary already covers the footer; adding the hook is safe as-is. (The grid
pages already use TanStack Query, but the authoritative proof here is the
`main.tsx` boundary wrapping `App`, not inference from the pages.)

The component shape:

```tsx
// VersionFooter.tsx (shape)
export default function VersionFooter() {
  const { data } = useQuery({
    queryKey: ["meta-version"],
    queryFn: api.metaVersion,
    refetchInterval: 60_000,            // Task D.6: modest poll
    refetchOnWindowFocus: true,          // + on focus
    retry: false,                        // Task D.5: fail silent, no retry storm
    staleTime: 55_000,
  });
  const running = data?.version ?? __APP_VERSION__;   // fallback to build-time
  return (
    <div className="px-4 py-3 text-[11px] text-slate-500 border-t border-slate-700">
      <div>Single-user · No auth · Home network</div>
      <div className="mt-1 flex items-center gap-2">
        <span>v{running}</span>
        {data?.updateAvailable && data.latest && (
          <UpdateBadge latest={data.latest} />
        )}
      </div>
    </div>
  );
}
```

`UpdateBadge` renders a small non-modal pill ("Update available → v1.6.0") plus
an "Update now" button (PART 2 apply). It is unobtrusive and never a modal
(Task D.2, D.7, NFR 7). When `updateAvailable` is false, only `v{running}`
shows (Task D.3). On any query failure `data` is `undefined`, so the component
shows `v{__APP_VERSION__}` and no badge — a silent degrade (Task D.5, NFR 1).

Data flows through the existing typed client (`frontend/src/api.ts`) and the
existing `/api/` nginx proxy (Task D.4). The browser **never** calls
`api.github.com` directly — only the backend does — so there is no new proxy
rule and no cross-origin call from the browser.

New `api.ts` methods:

```ts
export interface MetaVersion {
  version: string; gitSha: string; builtAt: string;
  latest: string | null; latestTag: string | null; updateAvailable: boolean;
}
export interface UpdateStatus {
  state: "idle" | "requested" | "running" | "succeeded" | "failed";
  message: string; requestedVersion: string | null;
  startedAt: string | null; finishedAt: string | null;
}
// added to the `api` object:
metaVersion: (): Promise<MetaVersion> => fetch(`${BASE}/meta/version`).then(handle),
requestUpdate: (): Promise<UpdateStatus> =>
  fetch(`${BASE}/admin/update`, { method: "POST" }).then(handle),
updateStatus: (): Promise<UpdateStatus> =>
  fetch(`${BASE}/admin/update/status`).then(handle),
```

**Error routing — same `handle()`, two opposite behaviors, no global handler.**
All three methods reuse the existing shared `handle(res)` helper, which throws on
`!res.ok` (building a `detail` from the body). The two surfaces then diverge
deliberately, and **no global fetch/query error handler, error boundary, or
toast is introduced** by this feature:

- `metaVersion` failures are **swallowed at the component**: the `useQuery` uses
  `retry: false`, so a thrown `handle` error leaves `data === undefined`, which
  the component renders as "running version only, no badge" — a silent degrade
  (Task D.5, NFR 1). The thrown error is caught by TanStack Query internally and
  never reaches a toast or boundary, because none is added. An implementer MUST
  NOT add a global `QueryCache.onError`/boundary that would surface
  `metaVersion` failures as an error UI.
- `requestUpdate` / `updateStatus` failures are **shown locally in the badge**:
  the `useMutation` for `requestUpdate` surfaces its error (e.g. the 503 "Update
  dir not available" message) inline in `UpdateBadge`, and the status poll shows
  `state:"failed"` text in the same pill. This is intentional and opposite to
  `metaVersion` — the operator asked for an action, so its failure is visible;
  the background version poll is informational, so its failure is invisible.
  Routing both through the same `handle` without a global interceptor is what
  lets these two behaviors coexist.

### "Update now" click → progress UX (Task E.4)

`UpdateBadge` holds the apply flow with TanStack Query:
1. Click → `useMutation(api.requestUpdate)` POSTs `/api/v1/admin/update`.
2. On success → start polling `api.updateStatus` every 3 s (`refetchInterval`),
   showing a spinner + the `state`/`message` ("Taking backup…", "Pulling
   images…", "Restarting…", "Succeeded", "Failed: …").
3. Polling stops when `state` is `succeeded` or `failed`. On `succeeded`, the
   component invalidates the `meta-version` query so the footer re-reads the new
   version (which, after the backend container restart, reflects the new image).
   Because the backend restarts mid-update, the status poll must tolerate a
   window where the backend is briefly unreachable (treated as "still running",
   not "failed"). That unreachable window can last the full backend start path
   — DB-wait + `alembic upgrade head` + seed, which the host script's health
   check budgets at 180s (see PART 3 step 5) — so the frontend poll keeps
   showing "running" for at least that long before an operator should suspect a
   real failure; the authoritative verdict is the status file the host script
   writes, not the frontend's inability to reach the backend during restart.
4. The UI remains usable throughout; the badge is the only thing that changes
   (Task E.4). If the backend never comes back (hard failure) the poll keeps
   showing "running" and the operator consults host logs — documented in the
   update doc as the manual-recovery path.

### Backend: `POST /api/v1/admin/update` + `GET /api/v1/admin/update/status`

Both live in `backend/app/routers/special.py` (same first-registered ordering as
`/meta/version`: `special.router` is registered before the generic
`/{resource}/{item_id}` catch-all in `main.py`, so the concrete `/admin/update`
and `/admin/update/status` paths win and `admin` is never read as a `{resource}`),
backed by `backend/app/updates.py`.
**The container NEVER calls podman or systemctl.** The only thing the POST does
is write a *marker file*; the only thing the status GET does is *read a status
file*. Both files live in a shared directory the host also mounts.

```python
UPDATE_DIR = Path(os.getenv("VF_UPDATE_DIR", "/var/lib/vf-cmdb"))
MARKER = UPDATE_DIR / "update.request"
STATUS = UPDATE_DIR / "update.status"      # JSON written by the host script

@router.post("/admin/update")
async def request_update() -> dict:
    info = get_version_info()
    latest = await latest_release_tag()
    try:
        UPDATE_DIR.mkdir(parents=True, exist_ok=True)
        MARKER.write_text(json.dumps({
            "requested_at": datetime.now(timezone.utc).isoformat(),
            "from_version": info.version,
            "to_tag": latest,
        }))
    except OSError as e:
        raise HTTPException(503, "Update directory not writable; "
                                 "is /var/lib/vf-cmdb mounted?")
    return _read_status(default_state="requested")
```

**`to_tag` is advisory only.** `request_update` calls `await latest_release_tag()`
to populate `to_tag` in the marker, but the host script **always follows
`:latest`** regardless of this value (it never parses `to_tag` to decide what to
pull). So if GitHub is unreachable at click time (allowed by silent-on-failure),
`to_tag` is `null` and the behavior is still correct — the host pulls `:latest`
and the health check validates whatever version that resolves to. The marker's
`to_tag` is informational for the status/UI, not an instruction, and it is never
reconciled against what was actually pulled. Consequently, when `to_tag` (and
therefore the status file's `requestedVersion`) is `null`, **the UI MUST render
a non-empty fallback** — the badge shows "Updating → latest" rather than a blank
or "Updating → null". The frontend `UpdateBadge` applies `requestedVersion ??
"latest"` wherever it displays the requested target.

```python

@router.get("/admin/update/status")
async def update_status() -> dict:
    return _read_status(default_state="idle")

def _read_status(default_state: str) -> dict:
    try:
        return json.loads(STATUS.read_text())
    except (OSError, ValueError):
        return {"state": default_state, "message": "", "requestedVersion": None,
                "startedAt": None, "finishedAt": None}
```

**Trust boundary (Task E.6 — exactly one mechanism chosen):** the backend only
writes/reads files inside its bind-mounted `/var/lib/vf-cmdb/`. A **host-side
systemd user `.path` unit watches `update.request`** and runs the update
`.service`, which runs the reworked `vf-cmdb-update.sh`. This is the single
chosen mechanism — not "a script OR auto-update OR a socket". Rationale: it needs
no privileged daemon inside the container, no SSH, no Podman socket exposed to
the container (which would be a far larger blast radius), and it reuses the
systemd user session that already owns the Quadlet services. The trust model is
explicitly the single-user private network (NFR 2, Task E.7): anyone who can
reach the UI can request an update, and that is acceptable because the host has
one user on a private LAN and no auth by design. This is stated in the docs.

The shared directory is wired in Quadlet (PART 3/4): the backend `.container`
gains `Volume=%h/vf-cmdb/state:/var/lib/vf-cmdb:Z` and the host `.path`/`.service`
units watch `%h/vf-cmdb/state/update.request`.

### Error handling — PART 2

| Operation | Failure | Recoverable? | Caller sees | Logged |
|---|---|---|---|---|
| POST marker write | dir not mounted/not writable | fatal for action | 503 + "is /var/lib/vf-cmdb mounted?" | WARNING |
| POST read status | status file absent | yes | `state:"requested"` | no |
| GET status | file absent/garbage | yes | `state:"idle"` | no |
| frontend poll during restart | backend 5xx/unreachable | yes | treated as "running" | no |
| frontend requestUpdate | 503 | yes | "Update dir not available" message | no |

Validation of inputs: both endpoints take **no body and no query params**, so
there is no user input to validate — this removes injection surface and is
intentional. The POST is idempotent-ish: a second click simply rewrites the
marker (the host `.path` unit coalesces rapid triggers; re-running the script
while one is in flight is guarded by a lock in PART 3).

---

## PART 3 — Pull-not-build host update (Task E host side)

### Reworked `deploy/scripts/vf-cmdb-update.sh`

The legacy git-pull-and-rebuild logic is **replaced** for the UI-wired path with
a pull-not-build flow. (The requirements keep the legacy git flow valid for
source hosts; this design reworks `vf-cmdb-update.sh` to the pull path because
that is the path the marker/`.path` unit invokes, and the out-of-scope note says
the legacy flow "is not the path this feature wires into the UI." The git flow,
if still wanted for source hosts, is preserved as a clearly-labeled branch gated
by an env var `VF_UPDATE_MODE=source`; default is `registry`.)

The new `registry`-mode flow:

```
0a. Preflight: require `jq` and `curl` on PATH. `curl` is already used by the
    legacy script, but `jq` is a NEW host dependency for the camelCase status
    writer and the version-advanced health check; if `jq` is missing the script
    writes `state:"failed"` with message "jq not installed on host" and exits
    non-zero rather than silently emitting malformed status.
0b. Acquire a flock on $STATE_DIR/update.lock (fail fast if an update is running).
1. write_status "running" "Taking pre-update database backup"
   -> run deploy/scripts/vf-cmdb-backup.sh  (Task E.3; keep backup on failure)
2. Capture CURRENT_VERSION via: curl -fsS --max-time 3 \
      http://localhost:8000/api/v1/meta/version | jq -r .version
3. write_status "running" "Pulling new images"
   -> podman auto-update            # ghcr.io-backed backend+frontend units
      (db + pgadmin already AutoUpdate=registry; now backend+frontend too)
4. write_status "running" "Restarting services"
   -> systemctl --user daemon-reload
   -> systemctl --user restart vf-cmdb-db vf-cmdb-backend vf-cmdb-frontend vf-cmdb-pgadmin
5. Health-check the NEW version (Task PART 3 core requirement):
   - poll http://localhost:8000/api/v1/meta/version for up to 180s
     (60 tries × 3s). This budget is pinned to comfortably exceed the backend's
     own worst-case start path, NOT a round "~30": the backend Quadlet unit has
     TimeoutStartSec=300, and on a cold start `entrypoint.sh` waits for the DB
     (up to 60×2s = 120s) then runs `alembic upgrade head` + `python -m app.seed`
     before uvicorn binds. A 90s (30×3s) budget could expire while the new
     backend is still legitimately migrating, producing a false `failed`. 180s
     exceeds the DB-wait + migrate + seed worst case before uvicorn answers.
   - the pass condition is HTTP 200 AND a parseable `.version` within that 180s
     budget -- NOT merely /health 200, because /health returns 200 on the OLD
     image too. Capture NEW_VERSION = .version from the first 200 response.
   - also curl the frontend root for 200
   - a `failed` verdict only after the full 180s budget is exhausted means a
     GENUINE failure (image broken, DB unreachable, migration crashed), not a
     slow migration — the budget already absorbs the slow-migration case.
6. Decide the outcome by comparing NEW_VERSION to CURRENT_VERSION (see the
   outcome table below), then write the status and remove the marker. The
   pre-update backup is kept in every case.
```

#### Health-check outcome rule (resolves the "digest changed, same version" case)

`podman auto-update` restarts a unit whenever the image **digest** changed, even
if the baked `VF_VERSION` string did not (for example a `:latest` re-tagged from
a `master` hotfix, or an edge/latest mix-up). The version string advancing and
the digest changing are therefore two independent facts, and the health check
must not conflate them. The explicit rule:

| After the retry budget | Version string | Outcome |
|---|---|---|
| HTTP 200, `.version` parses, `NEW_VERSION > CURRENT_VERSION` | advanced | `state:"succeeded"`, message `Updated <old> -> <new>` |
| HTTP 200, `.version` parses, `NEW_VERSION == CURRENT_VERSION`, **digest changed** (auto-update restarted a unit) | unchanged | `state:"succeeded"`, message `Refreshed (same version <v>)` |
| HTTP 200, `.version` parses, `NEW_VERSION == CURRENT_VERSION`, **no unit restarted** (auto-update found nothing new) | unchanged | `state:"succeeded"`, message `Already up to date (<v>)` |
| no HTTP 200 within the retry budget | n/a | `state:"failed"`, message points to logs + the restore script |

The decisive rule: **success is HTTP 200 with a parseable version after the
retry budget.** Both "version advanced" and "digest refreshed but version
unchanged" are non-failure `state:"succeeded"` outcomes — they differ only in
the human-readable message. **Only** failing to get a healthy 200 within the
budget is `state:"failed"`. The script distinguishes "refreshed" from "already
up to date" by inspecting `podman auto-update`'s own report (it prints which
units it restarted; a non-empty restart set with an unchanged version string is
"refreshed", an empty set is "already up to date"). This removes the ambiguity
the review flagged: the implementer is never left guessing whether a digest-only
swap is success or failure — it is success.

On `state:"failed"`: write the failure reason, keep the marker removed to avoid a
restart loop on the `.path` unit, and **do not delete the pre-update backup**.

Key points:
- **No `podman build`, no `git pull`** in registry mode — images come from
  `ghcr.io` via `podman auto-update`, which only restarts units whose image
  digest actually changed.
- **Health check asserts a healthy new boot**, not just liveness: it requires an
  HTTP 200 with a parseable `.version` from `/api/v1/meta/version` (not merely
  `/health` 200, which the OLD image also returns). It then classifies the
  outcome per the outcome table above — "updated" when the version advanced,
  "refreshed" when only the digest changed, "already up to date" when
  `auto-update` found nothing new — all three being `succeeded`; only a failure
  to reach a healthy 200 within the retry budget is `failed`.
- **Progress/result written to the status file** (`$STATE_DIR/update.status`,
  the same file the backend reads) at each step, so the UI reflects live
  progress.
- **flock** on `update.lock` prevents overlapping runs if the operator
  double-clicks or the daily timer fires mid-click.
- `write_status()` is a small helper that writes the JSON shape the backend's
  `_read_status` expects. **The status-file contract is camelCase and is defined
  once, authoritatively, here** — both the Python default in `_read_status`
  (PART 2) and this Bash writer MUST use these exact keys, because a shell author
  would otherwise naturally reach for snake_case and a casing mismatch would make
  the status poll silently show stale/default fields:

  ```jsonc
  // the one true status-file shape (camelCase keys)
  {
    "state": "idle|requested|running|succeeded|failed",
    "message": "human-readable progress line",
    "requestedVersion": "1.6.0 | latest | null",
    "startedAt": "ISO-8601 | null",
    "finishedAt": "ISO-8601 | null"
  }
  ```

  The Bash writer emits exactly those keys with `jq -n` (never hand-rolled
  string interpolation, which risks unescaped messages and wrong casing):

  ```bash
  write_status() {    # args: state message [requestedVersion]
    jq -n \
      --arg state "$1" \
      --arg message "$2" \
      --arg requestedVersion "${3:-latest}" \
      --arg startedAt "${STARTED_AT:-}" \
      --arg finishedAt "${FINISHED_AT:-}" \
      '{state:$state, message:$message,
        requestedVersion:(if $requestedVersion=="" then null else $requestedVersion end),
        startedAt:(if $startedAt=="" then null else $startedAt end),
        finishedAt:(if $finishedAt=="" then null else $finishedAt end)}' \
      > "$STATE_DIR/update.status.tmp" && mv "$STATE_DIR/update.status.tmp" "$STATE_DIR/update.status"
  }
  ```

  The write-then-`mv` makes each status update atomic so a concurrent backend
  read never sees a half-written file. `requestedVersion` defaults to the string
  `"latest"` (never blank), matching the PART 2 UI fallback for a null `to_tag`.

### Migration-cannot-be-rolled-back (stated explicitly)

On update failure the script logs, and the docs state, that **image rollback
cannot undo a migration**: because `entrypoint.sh` runs `alembic upgrade head`
on every start, the new schema is already live the moment the new backend
container boots — even if the health check then fails. Re-pulling the previous
image and restarting re-runs `alembic upgrade head` against the *already-migrated*
database (a no-op, since it is already at the newer head) and does **not** bring
the schema back down. The only true rollback is restoring the pre-update DB
backup via `deploy/scripts/vf-cmdb-restore.sh`. The script therefore:
- always takes the backup first (step 1) and never deletes it on failure;
- on health-check failure, writes `state:"failed"` with a message pointing to
  the restore script and the migration caveat;
- does **not** attempt an automatic image downgrade (it would be a false
  comfort — the schema would not roll back with it).

### Host-side systemd units under `deploy/systemd/`

New `vf-cmdb-update.path` (user unit) watches the marker:

```ini
# deploy/systemd/vf-cmdb-update.path
[Unit]
Description=Virtualfactor CMDB — watch for in-app update request
[Path]
PathChanged=%h/vf-cmdb/state/update.request
Unit=vf-cmdb-update.service
[Install]
WantedBy=default.target
```

The existing `vf-cmdb-update.service` is retargeted to run the reworked script
in registry mode and to point at the shared state dir:

```ini
# deploy/systemd/vf-cmdb-update.service (reworked)
[Service]
Type=oneshot
Environment=VF_UPDATE_MODE=registry
Environment=STATE_DIR=%h/vf-cmdb/state
ExecStart=%h/vf-cmdb/deploy/scripts/vf-cmdb-update.sh
TimeoutStartSec=1800
Nice=10
```

The existing **daily `vf-cmdb-update.timer` is kept** (unattended base-image
refresh), but the **marker + `.path` unit is the one-click path**. Both invoke
the same service; the flock serializes them. The timer continuing to run is
acceptable and is called out in docs as "scheduled refresh in addition to the
one-click button."

Note this is a behavior change for existing source-based hosts: because the
reworked service sets `VF_UPDATE_MODE=registry` and the nightly timer triggers
that same service, the nightly job that today does git-fetch + `podman build`
will now do `podman auto-update` pull-not-build instead. That is the intended
default for pre-built-image hosts. A source-based host that still wants the
legacy git-rebuild on the nightly timer sets `VF_UPDATE_MODE=source` (via a
systemd drop-in, or by keeping the pre-feature service), which the script's
mode branch honors. This trade-off is documented in Task G ops docs.

### Testability — PART 3

The script is integration-tested by hand on a host (it drives podman/systemd and
cannot be unit-tested in CI). The pieces that *can* be unit-tested are the
backend's `_read_status`/marker-write (pytest with a `tmp_path` for
`VF_UPDATE_DIR`) and the status JSON contract. The script includes a
`--dry-run` flag that writes statuses and skips `podman`/`systemctl` for manual
smoke-testing on a dev host.

---

## PART 4 — CI + registry + Quadlet (Task F)

### `.github/workflows/build.yml` (push to master → edge/sha)

```yaml
name: build
on:
  push:
    branches: [master]
permissions:
  contents: read
  packages: write
jobs:
  images:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        component: [backend, frontend]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: vars
        run: echo "sha=${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"
      - uses: docker/build-push-action@v6
        with:
          context: ./${{ matrix.component }}
          file: ./${{ matrix.component }}/Containerfile
          push: true
          tags: |
            ghcr.io/jallamasc/vf-cmdb-${{ matrix.component }}:edge
            ghcr.io/jallamasc/vf-cmdb-${{ matrix.component }}:sha-${{ steps.vars.outputs.sha }}
          build-args: |
            VF_VERSION=0.0.0-edge
            VF_GIT_SHA=${{ steps.vars.outputs.sha }}
            VF_BUILT_AT=${{ github.event.head_commit.timestamp }}
```

Produces `:edge` and `:sha-<shortsha>` only — **no `:latest`, no Release**
(Task F.2, end-to-end AC 5). `GITHUB_TOKEN` with `packages: write`; images are
published to the PUBLIC repo's package namespace so hosts pull anonymously.
`VF_VERSION=0.0.0-edge` makes an edge build's `is_newer` comparison always
`False` against any real release — an edge host never nags itself.

### `.github/workflows/release.yml` (tag v* OR dispatch → latest/vX.Y.Z + Release)

```yaml
name: release
on:
  push:
    tags: ["v*"]
  workflow_dispatch:
    inputs:
      version:
        description: "Release version, e.g. 1.6.0 (no leading v)"
        required: true
permissions:
  contents: write      # create the GitHub Release
  packages: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - id: ver
        run: |
          if [ "${{ github.event_name }}" = "push" ]; then
            V="${GITHUB_REF_NAME#v}"
          else
            V="${{ inputs.version }}"
          fi
          echo "version=$V" >> "$GITHUB_OUTPUT"
          echo "sha=${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
      # build+push backend and frontend with :latest and :v<version>
      - uses: docker/build-push-action@v6
        with:
          context: ./backend
          file: ./backend/Containerfile
          push: true
          tags: |
            ghcr.io/jallamasc/vf-cmdb-backend:latest
            ghcr.io/jallamasc/vf-cmdb-backend:v${{ steps.ver.outputs.version }}
          build-args: |
            VF_VERSION=${{ steps.ver.outputs.version }}
            VF_GIT_SHA=${{ steps.ver.outputs.sha }}
            VF_BUILT_AT=${{ github.event.repository.updated_at }}
      # ...identical step for frontend...
      - uses: softprops/action-gh-release@v2
        with:
          tag_name: v${{ steps.ver.outputs.version }}
          target_commitish: ${{ github.sha }}   # dispatch has no tag ref yet; push already has one at this sha
          make_latest: true
          generate_release_notes: true
```

The release step runs on **both** trigger paths — there is no
`if: github.event_name == 'push'` guard — so a `workflow_dispatch` run and a
`v*` tag push both create the GitHub Release and publish `:latest` + `:vX.Y.Z`
(Task F.3, end-to-end AC 6). The single `softprops/action-gh-release@v2` step
does double duty: on the `push` path the tag `vX.Y.Z` already exists at
`github.sha`, so the action just creates the Release against it; on the
`workflow_dispatch` path no tag exists yet, so the action **creates and pushes**
`tag_name: v<version>` at `target_commitish: github.sha` and then creates the
Release. `make_latest: true` marks it the "latest" release on both paths, which
is exactly the tag the backend's `latest_release_tag()` reads. One concrete
mechanism is chosen here — the action creates the tag on dispatch — with no
"A or B" left to the implementer.

Note on release notes for a brand-new tag: `generate_release_notes: true` diffs
against the previous tag; on the very **first** release there is no prior tag to
diff against, so GitHub produces minimal/empty auto-notes. This is acceptable
(the maintainer can edit the Release body afterward) and does not block the
release or the image push.

Note on a `workflow_dispatch` for an already-existing tag: `softprops/action-gh-
release@v2` creates the tag at `target_commitish` only when it does not yet
exist; **if `v<version>` already exists** (e.g. the maintainer runs dispatch for
a version that was already tag-pushed), the action does **not** move or
re-point the existing tag — it updates the Release *in place* against the tag's
original commit, and the image build still re-pushes `:latest` + `:v<version>`
from the dispatch commit. The practical effect is a no-op on the tag (and a
possibly surprising `:v<version>` image rebuilt from a different commit than the
tag points to). The maintainer guidance (Task G docs): **use a fresh, unused
version for each new release**; dispatching an existing version is only for
re-cutting the Release body/images against that same version, not for moving the
tag.

The human git-tag or dispatch is the **sole release gate** (Task F.4): nothing
auto-promotes `:edge`/`:sha-*` to `:latest`.

The baked `VF_VERSION=<X.Y.Z>` means a pulled `:vX.Y.Z` (or `:latest`) backend
reports `X.Y.Z` at `/api/v1/meta/version` (Task F.8, feeds Task C.1).

### Containerfile build args

**backend/Containerfile** — add near the end, after `COPY . .`:

```dockerfile
ARG VF_VERSION=dev
ARG VF_GIT_SHA=unknown
ARG VF_BUILT_AT=unknown
ENV VF_VERSION=${VF_VERSION} \
    VF_GIT_SHA=${VF_GIT_SHA} \
    VF_BUILT_AT=${VF_BUILT_AT}
```

`version.py` reads these at runtime from env; the fallbacks in `get_version_info`
mean a plain `podman build` with no args still yields `"dev"`/`"unknown"`.

**frontend/Containerfile** — the version must reach Vite at *build* time (it is
baked into the JS bundle), so pass build args into the build stage:

```dockerfile
FROM node:20-alpine AS build
ARG VF_VERSION=dev
ARG VF_GIT_SHA=unknown
ENV VF_VERSION=${VF_VERSION} VF_GIT_SHA=${VF_GIT_SHA}
WORKDIR /app
# ...npm install, COPY, npm run build (vite.config reads process.env.VF_VERSION
#    into the __APP_VERSION__ define)...
```

The serve (nginx) stage needs nothing — the version is already compiled into
`dist/`. Fallback to `pkg.version` then `"dev"` is in `vite.config.ts`.

### Quadlet repoint (Task F.6)

**This is a targeted edit of the two existing files, not a rewrite.** Change
only the `Image=` line (to `ghcr.io/...:latest`), **add** an `AutoUpdate=registry`
line, and (backend only) **add** the shared-state `Volume=` line. Every other
section — `[Unit]` (`Wants=`/`After=` ordering), `ContainerName=`, the backend's
`Network=vf-cmdb.network:alias=backend` alias (nginx proxies to
`http://backend:8000`, so the `alias=backend` MUST be preserved), `[Service]`
`Restart=always`, and `[Install]` — stays exactly as it is today. The full files
after the edit:

`deploy/quadlet/vf-cmdb-backend.container`:

```ini
[Unit]
Description=Virtualfactor CMDB FastAPI backend
Wants=vf-cmdb-db.service
After=vf-cmdb-db.service

[Container]
ContainerName=vf_cmdb_backend
Image=ghcr.io/jallamasc/vf-cmdb-backend:latest        # CHANGED from localhost/...
AutoUpdate=registry                                   # ADDED
# alias "backend" so the frontend nginx proxy_pass http://backend:8000 resolves
Network=vf-cmdb.network:alias=backend                 # PRESERVED (do not drop the alias)
Volume=%h/vf-cmdb/state:/var/lib/vf-cmdb:Z            # ADDED: shared marker/status dir (PART 2)
EnvironmentFile=%h/vf-cmdb/.env
Environment=POSTGRES_HOST=vf_cmdb_db
Environment=POSTGRES_PORT=5432
PublishPort=8000:8000

[Service]
Restart=always
TimeoutStartSec=300

[Install]
WantedBy=default.target
```

`deploy/quadlet/vf-cmdb-frontend.container`:

```ini
[Unit]
Description=Virtualfactor CMDB React/Nginx frontend
Wants=vf-cmdb-backend.service
After=vf-cmdb-backend.service

[Container]
ContainerName=vf_cmdb_frontend
Image=ghcr.io/jallamasc/vf-cmdb-frontend:latest       # CHANGED from localhost/...
AutoUpdate=registry                                   # ADDED
Network=vf-cmdb.network
PublishPort=8080:8080

[Service]
Restart=always
TimeoutStartSec=120

[Install]
WantedBy=default.target
```

This matches the existing db/pgadmin `AutoUpdate=registry` pattern, so
`podman auto-update` now manages all four units uniformly. The backend gains the
shared state volume; the frontend does not need it. Compose
(`podman-compose.yml`, `deploy-podman.sh`) stays a local-dev convenience and is
**not** promoted to a production path; Docker is not reintroduced (Task F.7,
hard rule). For local-dev compose, the shared dir can be a named volume or bind
and the host `.path` unit is simply not used (the one-click button returns the
503 "not mounted" message, which is correct for dev).

### Retire `deploy/ci-templates/github-workflows`

Mark `deploy/ci-templates/README.md` as **superseded** by the active
`.github/workflows/` and leave the template files in place with a header comment
noting they are historical examples, not active CI. (Deleting them is not
required and keeps the git history/examples; a one-line "SUPERSEDED — see
`.github/workflows/`" banner is enough and is reversible.)

### Error handling — PART 4

CI failures are surfaced by GitHub Actions itself (red check, logs). The design
adds no custom error handling in CI beyond `set -e` default step behavior.
A push build that fails to push `:edge` leaves the previously-published `:edge`
untouched (hosts never follow `:edge` anyway). A release build that fails before
tagging leaves no `:latest`/Release, so a host simply never sees the half-baked
version — the release gate is atomic from the host's point of view because the
host follows `:latest`, which only advances on a fully successful release job.

---

## Cross-cutting: no-auth constraint and silent-on-failure (restated)

- **No auth anywhere.** No login, token, session, or credential is added to the
  version endpoint, the update endpoints, the update trigger, or host image
  pulls. CI's push to GHCR uses the Actions-provided `GITHUB_TOKEN` only inside
  the workflow, never on a host. The trust model is the single-user private
  network, stated in the update docs (Task E.7, NFR 2).
- **No credentials in the DB.** This feature persists no secret in Postgres
  (NFR 3). The only new persisted artifacts are two plain files
  (`update.request`, `update.status`) in a host-mounted dir — neither holds a
  secret.
- **Silent on failure.** Every GitHub/ghcr call has a bounded timeout, is
  caught, and degrades to "no update info"; the UI never shows an error toast or
  breaks render on a failed version poll (NFR 1, Task D.5).
- **No schema change expected** (NFR 5). This feature needs no migration; the
  Alembic head stays `0037_physical_asset_theme_names`. If one were ever needed
  it would chain `down_revision` to that head and be guarded/idempotent.

---

## Testability summary (NFR 6)

- **Unit (backend pytest, no network):** `parse_semver` / `is_newer` across the
  AC-10 table, plus two cases that pin the `re.match` semantics of
  `^v?(\d+)\.(\d+)\.(\d+)`: `parse_semver("1.2") == None` (too short → rejected)
  and `parse_semver("v1.2.3.4") == (1, 2, 3)` (trailing `.4` ignored, like a
  pre-release suffix). This documents that the regex tolerates trailing garbage
  but requires three numeric components, which is safe given the release gate
  only ever emits clean `vX.Y.Z`. `get_version_info` with env set/unset/empty;
  `_read_status` and
  marker-write against a `tmp_path` `VF_UPDATE_DIR`. The GitHub lookup is tested
  with `httpx.MockTransport` (or monkeypatching `latest_release_tag`) for
  success, timeout, 403, 404, and bad-JSON → each yields `latest=null`,
  `updateAvailable=false`. New file: `backend/tests/test_version_updates.py`.
- **Unit (frontend Vitest + happy-dom, API stubbed):** `VersionFooter` /
  `UpdateBadge` for available / not-available / request-failed; assert the badge
  renders only when `updateAvailable` and shows nothing (just the version) on a
  rejected query. New file: `frontend/src/components/VersionFooter.test.tsx`.
- **Integration (manual, on a host):** the reworked `vf-cmdb-update.sh` end to
  end (and `--dry-run` for a safe smoke test), the `.path` unit firing on marker
  write, and the version-advanced health check.
- A design that forced the container to call podman would be nearly impossible
  to test safely; the file-marker boundary makes the backend half fully
  unit-testable and isolates the un-unit-testable podman/systemd parts into one
  shell script.

---

## §8 — Non-code tasks (A, B, G) covered by this design

**Task A (Kiro alignment):** `.kiro/steering/tech.md` is corrected — Alembic
head `0037_physical_asset_theme_names` (not `0005`), test frameworks described
as present (backend pytest vs `vfcmdb_test` on `127.0.0.1:55432`; frontend
Vitest + happy-dom) with their single-run commands; and a note that the deployed
backend self-migrates + self-seeds on start via `entrypoint.sh`.
`.kiro/skills/add-entity/SKILL.md`'s migration step is changed to discover the
current head from `backend/alembic/versions/` instead of hard-coding `0005`.
Any stale path/port/head/command in steering/skills/hooks is corrected to the
authoritative values (`/Volumes/development/vf-cmdb`; ports 8080/8000/5432/5050).
Hard-rule content (no auth, no DB credentials, generic-CRUD write path,
inet/cidr/jsonb, naming conventions) is left unchanged.

**Task B (backlog + spec skeleton):** `BACKLOG.md` at repo root with checkbox
entries for small deferred items, and the still-open "Next" items from
`SESSION_STATE.md` (the `PortConfigView`/`owner_device_*` polymorphism gap, the
Ansible/Semaphore ad-hoc-run limitation) migrated into it. Multi-subsystem
features get their own `.kiro/specs/<name>/` dir; this feature already has
`.kiro/specs/deploy-and-auto-update/`. `SESSION_STATE.md` stale specifics are
corrected in place, not deleted wholesale.

**Task G (docs + finalize):** the deploy docs gain a from-scratch "deploy
anywhere with Podman Quadlet from pre-built ghcr.io images" procedure (including
the one-time "flip the GHCR package to PUBLIC after the first release" step from
Assumption 6, since the first `release.yml` run creates the package private); the
maintainer release workflow (push master → edge/sha; tag `vX.Y.Z` or dispatch →
latest + Release); the in-app update experience (notify-and-apply, never
auto-apply); the migration-rollback caveat prominently in the
update/operations docs with the backup/restore scripts named; and the no-auth
trust model. `SESSION_STATE.md` (and `MEMORY_BANK.md` only if a hard rule
changed) and the codebase index are refreshed per the memory protocol on
finalize.

---

## Open assumptions

1. The GHCR package namespace is `ghcr.io/jallamasc/vf-cmdb-{backend,frontend}`
   and the repo stays PUBLIC so hosts pull anonymously (from requirements).
2. The shared host↔container state dir is `%h/vf-cmdb/state` on the host,
   mounted at `/var/lib/vf-cmdb` in the backend container. The design uses
   `VF_UPDATE_DIR` so this is configurable if a deployer prefers another path.
   **Host deploy layout vs dev checkout:** on a deploy host the convention is
   `%h/vf-cmdb/{deploy,state,.env}` (i.e. `$HOME/vf-cmdb/...` for the systemd
   user session that owns the Quadlet services). This is distinct from the
   developer checkout path, which steering records as `/Volumes/development/vf-cmdb`
   (and which some stale memory files still call `/home/ubuntu/vf_cmdb`). The two
   must not be conflated during Task A alignment: `%h/vf-cmdb` is the host-runtime
   deploy root, not the source checkout.
3. The GitHub Releases "latest" tag is the single source of truth for "newest
   version"; pre-release tags are not published by the release gate, so the
   semver parser's prefix-match behavior is sufficient.
4. The daily `vf-cmdb-update.timer` is retained as a scheduled refresh in
   addition to the one-click marker path; if the maintainer prefers one-click
   only, disabling the timer is a documented host choice, not a code change.
5. `jq` and `curl` are available on the host (used by the reworked script for
   the version-advanced health check); both are already assumed by the existing
   deploy scripts.
6. **GHCR package visibility is a one-time human step, not a code fact.** The
   first `release.yml` run creates the `ghcr.io/jallamasc/vf-cmdb-{backend,frontend}`
   packages **private by default**; a human must flip each package to PUBLIC
   once in the GitHub package settings so hosts pull anonymously. This is an
   operational dependency the Task G deploy docs MUST call out explicitly (it
   cannot be asserted from the checkout). Until flipped, anonymous host pulls
   fail — which degrades silently per NFR 1 (the UI simply shows no update
   applied), but the one-click update will report `failed` with an image-pull
   error until the package is public.
7. GitHub's unauthenticated rate limit (cited as 60 requests/hour per IP to
   justify the 10-minute cache) is an external-service property, correct at time
   of writing but not verifiable from the repo; the cache design is sound
   regardless of the exact number.

---

## Responses to design review findings

### Second review iteration

Review: `/.agents/tasks/deploy-and-auto-update/design-review.md`
(verdict CHANGES_REQUESTED: 0 HIGH, 2 MEDIUM, 5 NIT). All 7 findings are resolved
in this revision; none is backlogged or ignored. The review's "Directed
verification" (7 points) and 17 "Verified Assumptions" all HOLD and required no
change; the 4 "Unverified / External" assumptions were already correctly routed
to docs/ops in this design and remain so.

1. **MEDIUM — `vite.config.ts` `define` snippet omitted existing `test`/`server`
   blocks.** Resolved. PART 1's "Frontend running-version source" now states that
   `define` is ADDED as a new top-level key alongside the preserved
   `plugins`/`server`/`test` keys and the `/// <reference types="vitest" />`
   header, shows all four keys with the untouched ones marked PRESERVED, and adds
   the requirement that the `import pkg from "./package.json"` compile under
   `tsc -b` (`resolveJsonModule: true`) because `npm run build` runs `tsc -b`
   first and fails on type errors. Verified against the live
   `frontend/vite.config.ts` (happy-dom, `globals`, `setupFiles:
   ["./src/test/setup.ts"]`, `css:false`; `/api` + `/health` dev proxy).

2. **MEDIUM — `VersionFooter` `useQuery` assumed an unconfirmed
   `QueryClientProvider` ancestor over `Layout.tsx`.** Resolved and verified
   against live source. PART 2 now states the verified ancestor relationship:
   `frontend/src/main.tsx` renders
   `<QueryClientProvider><BrowserRouter><App/></BrowserRouter></QueryClientProvider>`
   and `frontend/src/App.tsx` renders `Layout` as a routed element, so the
   provider wraps the whole shell (sidebar footer included) — `VersionFooter` has
   a client in scope with no hoisting needed. The design also forbids moving the
   provider down to wrap only page content (which would crash the shell and
   violate Task D.5 / NFR 1).

3. **NIT — health-check retry budget not tied to the backend restart/migrate/seed
   window.** Resolved. PART 3 step 5 pins a single 180s budget (60×3s) instead of
   "~30", tied explicitly to the backend's `TimeoutStartSec=300` and
   `entrypoint.sh` worst case (DB-wait up to 120s + `alembic upgrade head` +
   seed before uvicorn binds), and states that a `failed` verdict only after the
   full 180s is a genuine failure, not a slow migration. The PART 2 status-poll
   note is updated to match.

4. **NIT — status-file camelCase JSON contract asserted but host Bash
   `write_status` never shown.** Resolved. PART 3 now defines the status-file
   contract once, authoritatively, in camelCase (`state`, `message`,
   `requestedVersion`, `startedAt`, `finishedAt`), shows a `jq -n`-based
   `write_status()` (atomic write-then-`mv`), and states both the Python default
   and the Bash writer MUST use these exact keys.

5. **NIT — `request_update` writes `to_tag:null` on a GitHub-unreachable click
   without reconciliation; UI `requestedVersion` could be blank.** Resolved.
   PART 2 now states `to_tag` is advisory only (the host always follows
   `:latest`) and that the UI renders a non-empty fallback — `UpdateBadge`
   applies `requestedVersion ?? "latest"` — so a null tag shows "Updating →
   latest", never blank/null. The Bash `write_status` defaults `requestedVersion`
   to `"latest"` to match.

6. **NIT — opposite error behaviors for `metaVersion` (silent) vs
   `requestUpdate` (shown) through the same `handle()` need a no-global-handler
   note.** Resolved. PART 2's "Error routing" paragraph states that no global
   fetch/query error handler, boundary, or toast is introduced; `metaVersion`
   failures are swallowed at the component (`retry:false` → `data===undefined` →
   no badge) while `requestUpdate`/`updateStatus` failures are shown locally in
   the badge.

7. **NIT — `workflow_dispatch` release path no-op when the target tag already
   exists.** Resolved. PART 4 `release.yml` now notes that
   `softprops/action-gh-release@v2` creates the tag only when it does not exist;
   for an already-existing `v<version>` the tag is not moved (the Release is
   updated in place), and the Task G maintainer guidance is to use a fresh,
   unused version per release.

Additionally, the review's "Unverified / External" assumption 3 (that `jq` is a
NEW host dependency not used by the legacy script) is now hardened: PART 3 step
0a makes the reworked script fail fast with a clear "jq not installed on host"
status if `jq` is missing.

### First review iteration (prior round — retained for history)

Prior review (verdict CHANGES_REQUESTED: 0 HIGH, 2 MEDIUM, 6 NIT). Every finding
was resolved in the preceding revision; none backlogged or ignored.

1. **MEDIUM — `workflow_dispatch` release path unresolved / contradicts YAML.**
   Resolved. The `release.yml` release step no longer carries
   `if: github.event_name == 'push'`; it is a single
   `softprops/action-gh-release@v2` step with `tag_name`, `target_commitish:
   github.sha`, and `make_latest: true` that creates the tag on the dispatch
   path and the Release on both paths, so Task F.3 / AC 6 hold for dispatch. The
   first-release empty-notes caveat is stated. (PART 4 `release.yml`.)

2. **MEDIUM — "digest changed, same version" health-check outcome ambiguous.**
   Resolved. PART 3 now carries an explicit outcome table: success is
   `HTTP 200 + parseable version after the retry budget`; "version advanced",
   "digest refreshed, same version", and "already up to date" are all
   `state:"succeeded"` (differing only in message), and only failing to reach a
   healthy 200 within the budget is `state:"failed"`. The script distinguishes
   "refreshed" from "already up to date" via `podman auto-update`'s restart
   report. (PART 3 health-check outcome rule.)

3. **NIT — Quadlet repoint snippets dropped required sections.** Resolved. PART 4
   now labels the change as a targeted edit (only `Image=`, add `AutoUpdate=`,
   add backend `Volume=`) and shows the **full** backend and frontend files with
   `[Unit]`/`ContainerName`/`[Service]`/`[Install]` preserved and the backend's
   `Network=vf-cmdb.network:alias=backend` alias explicitly called out as
   MUST-preserve.

4. **NIT — daily timer silently changes git-rebuild → registry-pull.** Resolved.
   PART 3 now states the behavior change explicitly and documents the
   `VF_UPDATE_MODE=source` escape hatch for source-based hosts.

5. **NIT — host deploy path vs dev checkout path not disambiguated.** Resolved.
   Assumption 2 now states the host layout is `%h/vf-cmdb/{deploy,state,.env}`,
   distinct from the `/Volumes/development/vf-cmdb` dev checkout (and the stale
   `/home/ubuntu/vf_cmdb`), and warns against conflating them in Task A.

6. **NIT — cache retry-on-failure rationale imprecise.** Resolved. The
   `latest_release_tag()` comment and the surrounding prose are reworded: a
   failure does not refresh the cache window; the value falls back to the last
   successful fetch and retries on the next poll once that success ages past the
   TTL.

7. **NIT — catch-all ordering not restated for `/admin/update` routes.**
   Resolved. PART 2 now states the two `/admin/update*` routes inherit the same
   first-registered-before-catch-all ordering as `/meta/version`.

8. **NIT — semver match semantics should be pinned by tests.** Resolved. The
   testability section adds `parse_semver("1.2") == None` and
   `parse_semver("v1.2.3.4") == (1, 2, 3)` to the backend unit cases.
