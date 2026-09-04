#!/usr/bin/env python3
"""
Virtualfactor IT CMDB - Codebase Search MCP Server
==================================================

Exposes the vector index (built by `indexer.py`) to any MCP-capable LLM client
(Claude Desktop, Cursor, Continue, etc.) as native tools over stdio.

Tools provided
--------------
* search_codebase(query, k=6, language=None)  -> ranked code chunks
* index_stats()                               -> current index metadata
* rebuild_index(full=False)                   -> refresh the index on demand

Why MCP *and* a CLI?
--------------------
The CLI (`indexer.py search ... --json`) works for any agent that can run a
shell command. The MCP server is for MCP-native assistants that prefer to call
tools directly. Both hit the exact same index, so results are identical.

Version tolerance
-----------------
The `mcp` Python SDK renamed `FastMCP` (v1) to `MCPServer` (v2). This module
imports whichever is available, so it runs on both.

Run
---
    python mcp_server.py            # serves over stdio (how MCP clients launch it)

MCP client config (example - Claude Desktop / Cursor):
    {
      "mcpServers": {
        "vf-cmdb-codebase": {
          "command": "python",
          "args": ["/opt/vf-cmdb/tools/codebase_index/mcp_server.py"],
          "env": { "CBINDEX_REPO": "/opt/vf-cmdb" }
        }
      }
    }
"""
from __future__ import annotations

import argparse
import sys
from typing import Optional

# Reuse all the indexing/search logic - no duplication.
from indexer import (  # type: ignore
    IndexPaths,
    _get_collection,
    _load_json,
    _repo_root,
    cmd_build,
    make_embedder,
)

# --- import the MCP server class regardless of SDK version -------------------
_MCP = None
try:  # mcp v1
    from mcp.server.fastmcp import FastMCP as _MCP  # type: ignore
except Exception:
    try:  # mcp v2
        from mcp.server.mcpserver import MCPServer as _MCP  # type: ignore
    except Exception as exc:  # pragma: no cover
        print(
            "ERROR: the 'mcp' package is not installed or unsupported.\n"
            "Install it with:  pip install 'mcp[cli]'\n"
            f"(import error: {exc})",
            file=sys.stderr,
        )
        raise SystemExit(1)

server = _MCP("vf-cmdb-codebase")


def _do_search(query: str, k: int = 6, language: Optional[str] = None) -> dict:
    root = _repo_root()
    paths = IndexPaths(root)
    if not paths.chroma.exists():
        return {"error": "No index found. Run rebuild_index or 'indexer.py build' first."}
    meta = _load_json(paths.meta, {})
    embedder = make_embedder(meta.get("backend", "local"), meta.get("model"))
    _, coll = _get_collection(paths)
    qvec = embedder.embed([query])[0]
    where = {"language": language} if language else None
    res = coll.query(query_embeddings=[qvec], n_results=k, where=where)
    docs = res.get("documents", [[]])[0]
    metas = res.get("metadatas", [[]])[0]
    dists = res.get("distances", [[]])[0]
    results = [
        {
            "path": m.get("path"),
            "start_line": m.get("start_line"),
            "end_line": m.get("end_line"),
            "language": m.get("language"),
            "score": round(1.0 - float(dist), 4),
            "snippet": doc,
        }
        for doc, m, dist in zip(docs, metas, dists)
    ]
    return {"query": query, "count": len(results), "results": results}


@server.tool()
def search_codebase(query: str, k: int = 6, language: str | None = None) -> dict:
    """Semantic search over the VF CMDB codebase and docs.

    Args:
        query: Natural-language description of what you're looking for.
        k: Number of results to return (default 6).
        language: Optional filter, e.g. 'python', 'tsx', 'systemd', 'markdown'.

    Returns:
        A dict with the ranked matches, each including file path, line range,
        cosine-similarity score, and the code snippet.
    """
    return _do_search(query, k=k, language=language)


@server.tool()
def index_stats() -> dict:
    """Return current codebase-index metadata (backend, model, chunk count, build time)."""
    root = _repo_root()
    paths = IndexPaths(root)
    meta = _load_json(paths.meta, {})
    manifest = _load_json(paths.manifest, {})
    meta["files"] = len(manifest)
    meta["store"] = str(paths.base)
    return meta or {"error": "No index found."}


@server.tool()
def rebuild_index(full: bool = False) -> dict:
    """Refresh the codebase index (incremental by default).

    Args:
        full: If true, wipe and rebuild from scratch. Otherwise only changed
              files are re-embedded and deleted files purged.
    """
    ns = argparse.Namespace(full=full, backend=None, model=None)
    code = cmd_build(ns)
    return index_stats() | {"exit_code": code}


if __name__ == "__main__":
    # MCP clients launch this over stdio.
    server.run()
