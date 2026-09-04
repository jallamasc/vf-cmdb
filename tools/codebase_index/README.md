# Codebase Indexing & Vector Search

Semantic search over the Virtualfactor IT CMDB codebase and docs. Ask questions
in natural language and get back the most relevant code chunks — with file paths
and line numbers — instead of grepping or loading the whole repo into an LLM's
context window.

This is one of the three pillars of the project's **cross-session memory system**:

| Pillar | File(s) | Role |
|--------|---------|------|
| Curated long-term memory | `MEMORY_BANK.md` | Hand-written rebuild spec & rules |
| Living state | `SESSION_STATE.md` | Current status, decisions, next steps |
| **Semantic recall** | **this tool** | On-demand, always-fresh code retrieval |

---

## Why these tools?

- **ChromaDB** — embedded, persistent vector database. No server process, no
  external dependency, stores vectors on disk. Ideal for a self-hosted VM.
- **sentence-transformers (`all-MiniLM-L6-v2`)** — local embedding model that
  runs on CPU with no API key. Fully offline once the model is cached — perfect
  for an air-gapped Proxmox VM. 384-dim vectors, fast.
- **OpenAI `text-embedding-3-small`** *(optional)* — higher-quality embeddings
  when a key is available; selectable at build/search time.
- **MCP server** — exposes the index as native tools to MCP-capable assistants
  (Claude Desktop, Cursor, Continue, …).

Everything hits the **same index**, so the CLI, the MCP server, and any agent
that shells out get identical results.

---

## Install (first time)

```bash
# from the repo root
./cbindex setup          # creates tools/codebase_index/.venv and installs deps
```

Or manually:

```bash
python3 -m venv tools/codebase_index/.venv
source tools/codebase_index/.venv/bin/activate
pip install -r tools/codebase_index/requirements.txt
```

---

## Build the index

```bash
./cbindex build          # incremental: only changed/new files are re-embedded,
                         # deleted files are purged (no "rotten memory")
./cbindex build --full   # wipe and rebuild from scratch
```

The index is written to `.codebase_index/` at the repo root (git-ignored). It is
**generated**, not committed — rebuild it on any machine in seconds.

The build set is the **git-tracked** files, minus binaries/generated artifacts
(node_modules, dist, PDFs, lockfiles, the index store itself, …).

---

## Search

```bash
# Human-readable
./cbindex search "how is the next free IP computed for a subnet"

# Narrow by language
./cbindex search "quadlet container unit for the backend" --language systemd

# Machine-readable for agents (JSON: path, line range, score, snippet)
./cbindex search "where naming convention is applied to devices" --json --k 8
```

Scores are cosine similarity (higher = closer). Each hit carries `path`,
`start_line`, `end_line`, `language`, and the snippet — so an agent can jump
straight to the right file/lines.

---

## Status

```bash
./cbindex stats          # backend, model, dims, chunk_count, build time, #files
./cbindex backends       # which embedding backends are usable right now
```

---

## MCP server (for MCP-native assistants)

```bash
./cbindex mcp            # serves over stdio
```

Register it with your client (example — Claude Desktop / Cursor
`mcpServers` block):

```json
{
  "mcpServers": {
    "vf-cmdb-codebase": {
      "command": "/opt/vf-cmdb/tools/codebase_index/.venv/bin/python",
      "args": ["/opt/vf-cmdb/tools/codebase_index/mcp_server.py"],
      "env": { "CBINDEX_REPO": "/opt/vf-cmdb" }
    }
  }
}
```

Tools exposed: `search_codebase(query, k, language)`, `index_stats()`,
`rebuild_index(full)`.

---

## Configuration (environment variables)

| Variable | Default | Meaning |
|----------|---------|---------|
| `CBINDEX_BACKEND` | `local` | `local` or `openai` |
| `CBINDEX_MODEL` | model default | override the embedding model |
| `OPENAI_API_KEY` | — | required for the `openai` backend |
| `CBINDEX_REPO` | git root | repo root override |

Switch to OpenAI embeddings:

```bash
export OPENAI_API_KEY=sk-...
./cbindex build --full --backend openai
./cbindex search "audit logging" --backend openai
```

> The backend/model used at build time is recorded in
> `.codebase_index/meta.json` and reused automatically at search time, so you
> don't have to repeat the flag on every query.

---

## How it works (internals)

1. **Collect** git-tracked text files (skipping binaries/generated).
2. **Chunk** each file into overlapping line windows
   (`CHUNK_LINES=60`, `CHUNK_OVERLAP=12`), each prefixed with its path/lines so
   location is part of the embedded signal.
3. **Embed** chunks with the selected backend.
4. **Store** vectors + metadata in ChromaDB (cosine space).
5. **Incremental refresh**: a SHA-256 manifest (`manifest.json`) tracks every
   file; `build` re-embeds only what changed and deletes vectors for removed
   files — the index never drifts from the code.

---

## Keeping it fresh

Run `./cbindex build` after pulling or making changes — it's incremental and
fast. Optionally wire it into a git `post-merge`/`post-commit` hook, or a
`systemd --user` timer on the VM, so the index tracks the code automatically.
