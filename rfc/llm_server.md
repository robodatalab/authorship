# RFC: Local LLM server

## 1. Framework

`transformers` + `torch` on Metal (MPS). Weights come from HuggingFace, run locally, and the
manuscript never leaves the machine.

Not MLX: it has no FlashAttention and its prefill degrades quadratically at long context,
which is the binding cost here — not generation speed.

## 2. Model

`Qwen/Qwen3.5-4B` in bf16, ~8 GB resident on a 36 GB machine.

Downloaded to the standard HuggingFace cache (`~/.cache/huggingface/hub`, or `$HF_HOME/hub`).
`huggingface_hub.snapshot_download(model_id, local_files_only=True)` decides whether a
download is needed; a partially fetched model raises `IncompleteSnapshotError`, which derives
from `LocalEntryNotFoundError`, so an interrupted download is correctly treated as missing.

The checkpoint declares `Qwen3_5ForConditionalGeneration` (multimodal), while
`AutoModelForCausalLM` maps `qwen3_5` to `Qwen3_5ForCausalLM`. The loader and the checkpoint
therefore disagree, and the vision weights are unused.

## 3. Server

Two processes.

**Parent** — FastAPI, in `server/api.py`. Holds no weights and never loads a model, so its
event loop always answers `/health` immediately. This is the whole reason for the split: a
load on the parent's threads starves the loop and the status bar reports a live server as
offline.

**Worker** — `server/worker.py`, a `spawn` child. Checks the cache, downloads if needed,
loads the model onto MPS, then serves inference from a queue for the life of the server.
`spawn` rather than `fork` because forking a process that has imported torch is unsafe.

Three queues connect them: `status` (child → parent), `requests` and `responses`. The parent
runs one small thread draining `status`; inference is serialised behind a lock, since there
is one model on one GPU.

**Start.** `python -m server --port 8765`, or the `Extension + Server` compound in
`.vscode/launch.json`, which also attaches the debugger. Dependencies come from the root
`pyproject.toml` via `uv sync` (`package = false` — it is an app, nothing to build).

**Stop.** FastAPI's lifespan shutdown sends a sentinel, `join(30s)`, then `terminate()`,
`join(5s)`, then `kill()`. The child is `daemon=True`, so it cannot outlive the parent.

**Status** progresses `starting` → `downloading` → `loading` → `ready`, and `stopped` on
shutdown.

## 4. API

Loopback, JSON, port 8765.

**`GET /health`** → `{ "status": "…", "model": "Qwen/Qwen3.5-4B" }`

Answers instantly in every state, including mid-download. This is what the frontend polls.

**`POST /run`**

```json
{ "prompt": "…", "max_new_tokens": 1024 }
```
```json
{ "output": "…" }
```

Synchronous — the reply carries the complete generation. `503` with the current status when
the model is not `ready`.

## 5. Frontend

`src/llm/health.ts` polls `/health` every 2s and mirrors it into the status bar via the pure
mapping in `src/llm/state.ts`:

| server | status bar |
|---|---|
| `ready` | `Authorship: ok` |
| `downloading` | `Authorship: downloading` |
| `starting`, `loading` | `Authorship: loading` |
| no answer, `stopped` | `Authorship: offline` |

A request timeout holds the previous state rather than reporting `offline` — during a load
the server can be slow without being gone. Only a refused connection means offline.

The extension observes and never starts, stops, or spawns the server.

## 6. Extending it

**A new endpoint that needs no model** — add a route to `server/api.py`.

**A new endpoint that needs the model** — the request queue carries a `dict`, so add a field
naming the operation, branch on it in `worker.run`'s loop, and add the matching route. The
parent must stay free of transformers imports.

**Tasks** — there is no task mechanism. The caller supplies the prompt string and gets raw
text back; no prompt table, no output schema, no parsing. Adding tasks means deciding where
prompts live and what the response shape is, and belongs to
[story_graph_builder.md](story_graph_builder.md).

**Adapters** — none. No LoRA is trained, loaded, or served.

---

What gets sent, when a rebuild fires, and how results reach `*.graph.yaml`:
[story_graph_builder.md](story_graph_builder.md).
