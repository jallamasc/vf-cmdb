# Agent Onboarding — Provisioning Context for a New Session

**Read this file FIRST at the start of every new session on the VF CMDB project.**
It tells an LLM agent (or a human) exactly how to load the project's memory and
tools so work continues seamlessly, with fresh (non-rotten) context.

> TL;DR — paste the **Bootstrap Prompt** (bottom of this file) into a fresh
> agent, or run the **Bootstrap Commands** in a terminal. Everything else here
> explains what those do and why.

> **Local checkout (this machine):** `/Volumes/development/vf-cmdb` (macOS).
> Authoritative dev ports: frontend **8080**, backend **8000**, postgres
> **5432**, pgAdmin **5050**. See `.kiro/steering/tech.md`.

---

## The memory system at a glance

This project carries its own memory across sessions through **four artifacts**,
all living in the repo (so cloning the repo = restoring the memory):

| # | Artifact | What it gives a new session | Freshness |
|---|----------|-----------------------------|-----------|
| 1 | `AGENT_ONBOARDING.md` (this file) | How to boot a session | Static-ish |
| 2 | `SESSION_STATE.md` | Where we are *right now*: status, open decisions, next steps | Updated every session |
| 3 | `MEMORY_BANK.md` | Full rebuild spec: architecture, data model, rules, "what NOT to change" | Updated on big decisions |
| 4 | **Codebase index** (`tools/codebase_index/` + `./cbindex`) | On-demand semantic recall of any code/doc — always regenerated from the live code, so it can't go stale | Rebuilt on demand |

Artifacts 2–3 are **curated prose** (durable decisions, the "why"). Artifact 4
is **generated recall** (the "where/how" in the actual code). Together they beat
"rotten memory": prose captures intent that code can't, while the index always
reflects the current code rather than a stale snapshot.

---

## Order of operations for a new session

1. **Clone / pull** the repo (GitHub is the source of truth):
   ```bash
   git clone https://github.com/jallamasc/vf-cmdb.git   # first time
   # or
   cd vf-cmdb && git pull --rebase
   ```

2. **Read the prose memory**, in this order:
   - `SESSION_STATE.md`  ← start here (current state + open items)
   - `MEMORY_BANK.md`    ← full context and hard rules
   - `AGENT_ONBOARDING.md` (this file) for the tooling

3. **Provision the semantic search tool** (one-time per machine):
   ```bash
   ./cbindex setup      # creates venv, installs chromadb + sentence-transformers
   ```

4. **Build/refresh the codebase index** (fast, incremental):
   ```bash
   ./cbindex build
   ```

5. **Verify** everything is live:
   ```bash
   ./cbindex stats
   ./cbindex search "how is the next free IP computed" --k 3
   ```

6. **Work.** Use `./cbindex search "..."` (or the MCP tools) to locate code
   instead of loading the whole repo into context.

7. **Before ending the session**, keep memory fresh:
   - Update `SESSION_STATE.md` (status, decisions, next steps).
   - Update `MEMORY_BANK.md` if an architectural decision or rule changed.
   - `./cbindex build` (so the index matches the new code).
   - Commit & push.

---

## How the agent should USE the tools during work

- **Finding code**: prefer `./cbindex search "natural language question" --json`
  over blind grep. It returns file + line ranges ranked by relevance.
- **Narrowing**: add `--language python|tsx|systemd|markdown|sql|yaml`.
- **MCP-native clients** (Claude Desktop, Cursor, Continue): register the MCP
  server (see `tools/codebase_index/README.md`) and call `search_codebase`,
  `index_stats`, `rebuild_index` as tools.
- **After editing code**: run `./cbindex build` so future searches see it.

---

## Provisioning options by environment

### A. Any terminal-capable agent (Claude Code, Cursor agent, this assistant, …)
The CLI is the universal interface. Provision = clone + `./cbindex setup` +
`./cbindex build`. The agent then shells out to `./cbindex search`.

### B. MCP-native desktop assistant (Claude Desktop, Cursor, Continue)
Add the MCP server block from `tools/codebase_index/README.md` to the client's
config. The three tools appear natively. Point `CBINDEX_REPO` at the repo path.

### C. Offline / air-gapped Proxmox VM
The default `local` backend needs the embedding model cached. Two choices:
- Let `./cbindex setup && ./cbindex build` download the model once while the VM
  still has internet, **or**
- Pre-seed the HuggingFace cache: copy `~/.cache/huggingface/` from a machine
  that has already run a build.
No API keys, no external calls at query time.

### D. Higher-quality embeddings (optional)
```bash
export OPENAI_API_KEY=sk-...
./cbindex build --full --backend openai
```

---

## What is committed vs generated

- **Committed** (travels with the repo): the memory prose (`SESSION_STATE.md`,
  `MEMORY_BANK.md`, this file), the indexer source (`tools/codebase_index/`),
  and the `cbindex` wrapper.
- **Generated** (git-ignored, rebuild anywhere): the vector store
  (`.codebase_index/`) and the tool venv (`tools/codebase_index/.venv/`).

This is deliberate: never commit embeddings (they bloat git and go stale).
Rebuilding from the live code takes seconds and guarantees freshness.

---

## Bootstrap Commands (copy-paste)

```bash
# 1. Get the code + prose memory
git clone https://github.com/jallamasc/vf-cmdb.git && cd vf-cmdb
# (or: cd vf-cmdb && git pull --rebase)

# 2. Provision + build the semantic index
./cbindex setup       # one-time per machine
./cbindex build       # fast, incremental

# 3. Sanity check
./cbindex stats
./cbindex search "where are device names auto-generated" --k 3
```

---

## Bootstrap Prompt (paste into a fresh LLM agent)

> You are resuming work on the **Virtualfactor IT CMDB** project (repo:
> https://github.com/jallamasc/vf-cmdb, local path `<PATH>`).
>
> Before doing anything else:
> 1. Read `SESSION_STATE.md`, then `MEMORY_BANK.md`, then `AGENT_ONBOARDING.md`.
> 2. Ensure the codebase index is ready: run `./cbindex setup` (first time) and
>    `./cbindex build`. Confirm with `./cbindex stats`.
> 3. To find code, use `./cbindex search "<question>" --json` (optionally
>    `--language ...`) instead of loading the whole repo.
>
> Hard rules to respect (see MEMORY_BANK.md for the full list): container stack
> is **Podman, not Docker**; **no credentials in the DB** (Bitwarden references
> only); kebab-case API slugs, snake_case DB, camelCase frontend; keep the audit
> changelog and the auto-naming engine intact; design for multi-site even though
> only the "Home" site exists today.
>
> **WLAN Addressing** (RESOLVED 2026-09-04): WLAN ranges start at 192.168.100.0/24
> and continue sequentially (100-103, 104-107, 108-111, 112-115 for 4 subnets).
> Applied in `backend/app/seed_subnets.json`.
>
> When you finish: update `SESSION_STATE.md` (and `MEMORY_BANK.md` if a decision
> changed), run `./cbindex build`, then commit and push.

---

**Keeping this file honest:** if the provisioning steps or tool interface
change, update this file and the Bootstrap sections in the same commit — this is
the one document a brand-new session is guaranteed to read first.
