#!/usr/bin/env python3
"""
Virtualfactor IT CMDB - Codebase Indexing & Vector Search
=========================================================

Builds a semantic (vector) index of the project's source code and docs so that
an LLM agent (or a human) can ask natural-language questions and get back the
most relevant code chunks - across session boundaries and without loading the
whole repository into context.

Design goals
------------
* Self-hosted / offline-first: default embedding model runs locally on CPU
  (sentence-transformers `all-MiniLM-L6-v2`), no API key required. Works on the
  air-gapped Proxmox VM once the model is cached.
* Optional OpenAI backend (`text-embedding-3-small`) when a key is present and
  higher quality is wanted.
* Incremental & fresh (no "rotten memory"): a manifest of file SHA-256 hashes is
  kept. `build` re-embeds only changed/new files and purges deleted ones, so the
  index tracks the codebase as it evolves.
* Zero coupling to the running app: reads files straight from disk (git-tracked
  set), never needs the DB or the API up.

Storage
-------
Everything lives under `<repo>/.codebase_index/` (git-ignored):
    chroma/       -> ChromaDB persistent store (the vectors)
    manifest.json -> {relative_path: sha256} for incremental builds
    meta.json     -> index metadata (backend, model, dims, built_at, counts)

CLI
---
    python indexer.py build            # build/refresh the index (incremental)
    python indexer.py build --full     # wipe and rebuild from scratch
    python indexer.py search "query"   # semantic search, human-readable
    python indexer.py search "q" --json --k 8   # machine-readable for agents
    python indexer.py stats            # show index status
    python indexer.py backends         # show which embedding backends are usable

Environment variables
---------------------
    CBINDEX_BACKEND   local | openai            (default: local)
    CBINDEX_MODEL     model name override
    OPENAI_API_KEY    required for the openai backend
    CBINDEX_REPO      repo root override (default: auto-detected via git)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

LOCAL_MODEL_DEFAULT = "sentence-transformers/all-MiniLM-L6-v2"
OPENAI_MODEL_DEFAULT = "text-embedding-3-small"

COLLECTION_NAME = "vf_cmdb_code"
INDEX_DIRNAME = ".codebase_index"

# Files we never want in a *code* index (binaries / generated / noise).
SKIP_SUFFIXES = {
    ".pdf", ".docx", ".xlsx", ".xls", ".png", ".jpg", ".jpeg", ".gif", ".ico",
    ".svg", ".webp", ".woff", ".woff2", ".ttf", ".eot", ".lock", ".map",
    ".tsbuildinfo", ".pyc", ".zip", ".tar", ".gz", ".dump", ".sql.gz",
}
SKIP_DIR_PARTS = {
    "node_modules", "dist", ".vite", "__pycache__", ".venv", "venv",
    INDEX_DIRNAME, ".git", "pgdata",
}
SKIP_EXACT_NAMES = {"package-lock.json", "pnpm-lock.yaml", "yarn.lock"}

# Chunking (line-based with overlap - language-agnostic, robust, no parser deps).
CHUNK_LINES = 60
CHUNK_OVERLAP = 12
MAX_FILE_BYTES = 1_000_000  # skip anything bigger than ~1 MB (likely generated)

LANG_BY_SUFFIX = {
    ".py": "python", ".ts": "typescript", ".tsx": "tsx", ".js": "javascript",
    ".jsx": "jsx", ".sql": "sql", ".sh": "bash", ".yaml": "yaml", ".yml": "yaml",
    ".toml": "toml", ".ini": "ini", ".cfg": "ini", ".md": "markdown",
    ".json": "json", ".conf": "nginx", ".mako": "mako", ".ps1": "powershell",
    ".env": "dotenv", ".volume": "systemd", ".container": "systemd",
    ".network": "systemd", ".service": "systemd", ".timer": "systemd",
    "Containerfile": "containerfile", "Dockerfile": "dockerfile",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _repo_root() -> Path:
    env = os.environ.get("CBINDEX_REPO")
    if env:
        return Path(env).resolve()
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--show-toplevel"],
            stderr=subprocess.DEVNULL,
        )
        return Path(out.decode().strip())
    except Exception:
        # Fall back to two levels up from this file (tools/codebase_index/..)
        return Path(__file__).resolve().parents[2]


def _language_for(path: Path) -> str:
    if path.name in LANG_BY_SUFFIX:
        return LANG_BY_SUFFIX[path.name]
    return LANG_BY_SUFFIX.get(path.suffix, "text")


def _should_index(rel: str) -> bool:
    p = Path(rel)
    if any(part in SKIP_DIR_PARTS for part in p.parts):
        return False
    if p.name in SKIP_EXACT_NAMES:
        return False
    if p.suffix.lower() in SKIP_SUFFIXES:
        return False
    return True


def _tracked_files(root: Path) -> list[str]:
    """Return repo-relative paths of git-tracked files worth indexing."""
    try:
        out = subprocess.check_output(
            ["git", "ls-files"], cwd=str(root), stderr=subprocess.DEVNULL
        )
        files = out.decode().splitlines()
    except Exception:
        files = [
            str(p.relative_to(root))
            for p in root.rglob("*")
            if p.is_file()
        ]
    return sorted(f for f in files if _should_index(f))


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(65536), b""):
            h.update(block)
    return h.hexdigest()


def _read_text(path: Path) -> str | None:
    try:
        if path.stat().st_size > MAX_FILE_BYTES:
            return None
        return path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return None


@dataclass
class Chunk:
    chunk_id: str
    text: str
    path: str
    language: str
    start_line: int
    end_line: int


def _chunk_file(rel: str, text: str) -> list[Chunk]:
    lines = text.splitlines()
    if not lines:
        return []
    lang = _language_for(Path(rel))
    chunks: list[Chunk] = []
    step = max(1, CHUNK_LINES - CHUNK_OVERLAP)
    idx = 0
    start = 0
    n = len(lines)
    while start < n:
        end = min(start + CHUNK_LINES, n)
        body = "\n".join(lines[start:end]).strip()
        if body:
            # Prefix with path so the embedding carries locational meaning.
            header = f"# file: {rel} (lines {start + 1}-{end}) [{lang}]"
            chunks.append(
                Chunk(
                    chunk_id=f"{rel}::{idx}",
                    text=f"{header}\n{body}",
                    path=rel,
                    language=lang,
                    start_line=start + 1,
                    end_line=end,
                )
            )
            idx += 1
        if end >= n:
            break
        start += step
    return chunks


# ---------------------------------------------------------------------------
# Embedding backends
# ---------------------------------------------------------------------------

class LocalEmbedder:
    name = "local"

    def __init__(self, model: str | None = None):
        from sentence_transformers import SentenceTransformer

        self.model_name = model or os.environ.get("CBINDEX_MODEL", LOCAL_MODEL_DEFAULT)
        self._model = SentenceTransformer(self.model_name)
        # Method was renamed across versions; support both.
        if hasattr(self._model, "get_embedding_dimension"):
            self.dims = self._model.get_embedding_dimension()
        else:  # pragma: no cover - older sentence-transformers
            self.dims = self._model.get_sentence_embedding_dimension()

    def embed(self, texts: list[str]) -> list[list[float]]:
        vecs = self._model.encode(
            texts, batch_size=32, show_progress_bar=False, normalize_embeddings=True
        )
        return [v.tolist() for v in vecs]


class OpenAIEmbedder:
    name = "openai"

    def __init__(self, model: str | None = None):
        from openai import OpenAI

        if not os.environ.get("OPENAI_API_KEY"):
            raise RuntimeError("OPENAI_API_KEY is not set")
        self.model_name = model or os.environ.get("CBINDEX_MODEL", OPENAI_MODEL_DEFAULT)
        self._client = OpenAI()
        self.dims = 1536 if "small" in self.model_name else 3072

    def embed(self, texts: list[str]) -> list[list[float]]:
        # OpenAI allows batches; keep them modest to stay under token limits.
        out: list[list[float]] = []
        for i in range(0, len(texts), 128):
            batch = texts[i : i + 128]
            resp = self._client.embeddings.create(model=self.model_name, input=batch)
            out.extend(d.embedding for d in resp.data)
        return out


def make_embedder(backend: str, model: str | None = None):
    backend = (backend or "local").lower()
    if backend == "openai":
        return OpenAIEmbedder(model)
    return LocalEmbedder(model)


def probe_backends() -> dict[str, str]:
    status: dict[str, str] = {}
    try:
        import sentence_transformers  # noqa: F401

        status["local"] = "available (sentence-transformers installed)"
    except Exception as exc:  # pragma: no cover
        status["local"] = f"unavailable: {exc}"
    try:
        import openai  # noqa: F401

        if os.environ.get("OPENAI_API_KEY"):
            status["openai"] = "available (openai installed, OPENAI_API_KEY set)"
        else:
            status["openai"] = "installed but OPENAI_API_KEY not set"
    except Exception as exc:  # pragma: no cover
        status["openai"] = f"unavailable: {exc}"
    return status


# ---------------------------------------------------------------------------
# Index store
# ---------------------------------------------------------------------------

@dataclass
class IndexPaths:
    root: Path
    base: Path = field(init=False)
    chroma: Path = field(init=False)
    manifest: Path = field(init=False)
    meta: Path = field(init=False)

    def __post_init__(self):
        self.base = self.root / INDEX_DIRNAME
        self.chroma = self.base / "chroma"
        self.manifest = self.base / "manifest.json"
        self.meta = self.base / "meta.json"


def _get_collection(paths: IndexPaths):
    import chromadb

    paths.chroma.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(paths.chroma))
    return client, client.get_or_create_collection(
        name=COLLECTION_NAME, metadata={"hnsw:space": "cosine"}
    )


def _load_json(path: Path, default):
    if path.exists():
        try:
            return json.loads(path.read_text())
        except Exception:
            return default
    return default


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_build(args) -> int:
    root = _repo_root()
    paths = IndexPaths(root)
    backend = args.backend or os.environ.get("CBINDEX_BACKEND", "local")

    print(f"[cbindex] repo:    {root}")
    print(f"[cbindex] backend: {backend}")
    try:
        embedder = make_embedder(backend, args.model)
    except Exception as exc:
        print(f"[cbindex] ERROR initialising '{backend}' backend: {exc}", file=sys.stderr)
        return 2
    print(f"[cbindex] model:   {embedder.model_name} (dims={embedder.dims})")

    client, coll = _get_collection(paths)
    old_manifest: dict[str, str] = _load_json(paths.manifest, {})

    if args.full:
        try:
            client.delete_collection(COLLECTION_NAME)
        except Exception:
            pass
        client, coll = _get_collection(paths)
        old_manifest = {}
        print("[cbindex] full rebuild: existing vectors cleared")

    files = _tracked_files(root)
    new_manifest: dict[str, str] = {}
    changed: list[str] = []
    for rel in files:
        abspath = root / rel
        if not abspath.is_file():
            continue
        digest = _sha256(abspath)
        new_manifest[rel] = digest
        if old_manifest.get(rel) != digest:
            changed.append(rel)

    removed = [rel for rel in old_manifest if rel not in new_manifest]

    if not changed and not removed:
        print("[cbindex] index already up to date - nothing to do.")
        _write_meta(paths, embedder, coll)
        return 0

    # Purge chunks for changed + removed files (delete-then-insert = fresh memory).
    stale = set(changed) | set(removed)
    if stale:
        for rel in stale:
            try:
                coll.delete(where={"path": rel})
            except Exception:
                pass
        print(f"[cbindex] purged stale chunks for {len(stale)} file(s)")

    # Build chunks for changed files.
    all_chunks: list[Chunk] = []
    for rel in changed:
        text = _read_text(root / rel)
        if text is None:
            continue
        all_chunks.extend(_chunk_file(rel, text))

    if all_chunks:
        print(f"[cbindex] embedding {len(all_chunks)} chunks from {len(changed)} file(s)...")
        batch = 256
        for i in range(0, len(all_chunks), batch):
            part = all_chunks[i : i + batch]
            embeddings = embedder.embed([c.text for c in part])
            coll.add(
                ids=[c.chunk_id for c in part],
                embeddings=embeddings,
                documents=[c.text for c in part],
                metadatas=[
                    {
                        "path": c.path,
                        "language": c.language,
                        "start_line": c.start_line,
                        "end_line": c.end_line,
                    }
                    for c in part
                ],
            )
            print(f"[cbindex]   ...{min(i + batch, len(all_chunks))}/{len(all_chunks)}")

    paths.manifest.write_text(json.dumps(new_manifest, indent=2, sort_keys=True))
    _write_meta(paths, embedder, coll)

    print(
        f"[cbindex] DONE. files_indexed={len(changed)} removed={len(removed)} "
        f"total_chunks={coll.count()}"
    )
    return 0


def _write_meta(paths: IndexPaths, embedder, coll) -> None:
    meta = {
        "backend": embedder.name,
        "model": embedder.model_name,
        "dims": embedder.dims,
        "collection": COLLECTION_NAME,
        "chunk_lines": CHUNK_LINES,
        "chunk_overlap": CHUNK_OVERLAP,
        "chunk_count": coll.count(),
        "built_at": datetime.now(timezone.utc).isoformat(),
    }
    paths.meta.write_text(json.dumps(meta, indent=2))


def cmd_search(args) -> int:
    root = _repo_root()
    paths = IndexPaths(root)
    if not paths.chroma.exists():
        print("[cbindex] no index found - run 'build' first.", file=sys.stderr)
        return 1

    meta = _load_json(paths.meta, {})
    backend = args.backend or meta.get("backend") or os.environ.get("CBINDEX_BACKEND", "local")
    model = args.model or meta.get("model")
    try:
        embedder = make_embedder(backend, model)
    except Exception as exc:
        print(f"[cbindex] ERROR initialising '{backend}' backend: {exc}", file=sys.stderr)
        return 2

    _, coll = _get_collection(paths)
    qvec = embedder.embed([args.query])[0]
    where = {"language": args.language} if args.language else None
    res = coll.query(query_embeddings=[qvec], n_results=args.k, where=where)

    docs = res.get("documents", [[]])[0]
    metas = res.get("metadatas", [[]])[0]
    dists = res.get("distances", [[]])[0]

    results = []
    for doc, m, dist in zip(docs, metas, dists):
        results.append(
            {
                "path": m.get("path"),
                "start_line": m.get("start_line"),
                "end_line": m.get("end_line"),
                "language": m.get("language"),
                "score": round(1.0 - float(dist), 4),  # cosine similarity
                "snippet": doc,
            }
        )

    if args.json:
        print(json.dumps({"query": args.query, "results": results}, indent=2))
        return 0

    if not results:
        print("[cbindex] no matches.")
        return 0

    print(f"\nTop {len(results)} matches for: {args.query!r}\n" + "=" * 72)
    for i, r in enumerate(results, 1):
        loc = f"{r['path']}:{r['start_line']}-{r['end_line']}"
        print(f"\n[{i}] {loc}  (score={r['score']}, {r['language']})")
        print("-" * 72)
        body = r["snippet"].split("\n", 1)[-1] if not args.full_snippet else r["snippet"]
        preview = body if args.full_snippet else "\n".join(body.splitlines()[:12])
        print(preview)
    print()
    return 0


def cmd_stats(args) -> int:
    root = _repo_root()
    paths = IndexPaths(root)
    if not paths.meta.exists():
        print("[cbindex] no index found - run 'build' first.")
        return 1
    meta = _load_json(paths.meta, {})
    manifest = _load_json(paths.manifest, {})
    print("Codebase Index status")
    print("=" * 40)
    for key in ("backend", "model", "dims", "chunk_count", "built_at"):
        print(f"  {key:12}: {meta.get(key)}")
    print(f"  {'files':12}: {len(manifest)}")
    print(f"  {'store':12}: {paths.base}")
    return 0


def cmd_backends(args) -> int:
    print("Embedding backend availability")
    print("=" * 40)
    for name, status in probe_backends().items():
        print(f"  {name:8}: {status}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="indexer.py",
        description="Codebase indexing & semantic (vector) search for VF CMDB.",
    )
    sub = p.add_subparsers(dest="command", required=True)

    b = sub.add_parser("build", help="build/refresh the index (incremental)")
    b.add_argument("--full", action="store_true", help="wipe and rebuild from scratch")
    b.add_argument("--backend", help="local | openai (default: env or local)")
    b.add_argument("--model", help="embedding model override")
    b.set_defaults(func=cmd_build)

    s = sub.add_parser("search", help="semantic search over the index")
    s.add_argument("query", help="natural-language query")
    s.add_argument("--k", type=int, default=6, help="number of results (default 6)")
    s.add_argument("--json", action="store_true", help="machine-readable JSON output")
    s.add_argument("--language", help="filter by language (e.g. python, tsx)")
    s.add_argument("--full-snippet", action="store_true", help="print full chunk")
    s.add_argument("--backend", help="override embedding backend")
    s.add_argument("--model", help="override embedding model")
    s.set_defaults(func=cmd_search)

    st = sub.add_parser("stats", help="show index status")
    st.set_defaults(func=cmd_stats)

    bk = sub.add_parser("backends", help="show usable embedding backends")
    bk.set_defaults(func=cmd_backends)

    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
