# RFC: Local LLM server

## 1. Framework

MLX, using `mlx_lm` as a library.

The plan is one base model with a small LoRA adapter per task — scene detection, plot
detection, character tracking — rather than one general model prompted three ways. Small
tuned adapters beat a small model's zero-shot output at narrow extraction, and each is
20–100 MB against a 2.5 GB base, so all of them stay in memory and are selected per request.

MLX because the same stack trains the adapters (`mlx_lm.lora`) and serves them, and because
`mlx_lm.tuner.utils` exposes `load_adapters(model, path)` and `remove_lora_layers(model)`,
which is what per-request selection needs.

We do not use `mlx_lm.server`: it binds one adapter from the command line, and it ignores
`response_format`, so schema-constrained output is not available through it.

## 2. Model

`mlx-community/Qwen3.5-4B-4bit` — ~2.5 GB resident, 262k context. Fits 36 GB alongside an
IDE, and a 50k-word manuscript (~65k tokens) fits in one prompt, so no chunking.

Fallback if 4B extracts poorly: `mlx-community/Qwen3.5-9B-4bit`, ~5 GB, same architecture
and context, so it is a config change and an adapter retrain.

Weights are pulled from HuggingFace on first start, after confirmation, into the standard
HuggingFace cache (`~/.cache/huggingface/hub`, or `$HF_HOME/hub`). Adapters we train live
in the repo under `server/adapters/<task>/`.

## 3. Server

Python, FastAPI, in `server/`.

Holds the base model resident and every adapter alongside it, applying the requested task's
adapter per request. One request at a time — generation saturates the GPU — with a queue of
depth one, where a new request replaces a waiting one.

Output is constrained with [Outlines](https://dottxt-ai.github.io/outlines/latest/features/models/mlxlm/),
which compiles the task's JSON schema into a logit processor, so responses parse by
construction.

**Environment.** `uv` creates and owns the virtualenv from `server/pyproject.toml`. The
extension runs `uv sync` on first start, behind a progress notification.

**Start.** On user toggle only, never on extension activation. The extension spawns
`uv run --project server authorship-model`, which runs the FastAPI app inside that venv. The
service binds `127.0.0.1:0` and prints `AUTHORSHIP_PORT=<n>` as its first stdout line; the
extension reads the port from there, then polls `/health` until it reports ready.

**Stop.** On toggle off and on `deactivate`: SIGTERM, then SIGKILL after 2s. An unexpected
exit gets one restart, then stays down and reports.

Status bar: `stopped` / `starting` / `ready` / `working` / `error`.

## 4. API

Loopback, JSON.

**`GET /health`** → `{ status: "loading" | "ready", model, adapters, busy }`

The port listens well before the weights finish loading, so this is what readiness means.

**`POST /run`** — run a task against the manuscript.

```json
{ "id": "b3f1", "task": "scene_detection", "text": "<manuscript>" }
```
```json
{ "id": "b3f1", "output": { … }, "usage": { "prompt_tokens": 64210, "ms": 41300 } }
```

`task` selects the adapter and the schema from a table in `tasks.py`; until a task's adapter
is trained it runs against the bare base with the same schema. `output` is parsed and
conforms to that schema. `usage` is there to measure whether whole-manuscript rebuilds are
affordable.

Errors: `400` unknown task or text over context, `409` cancelled, `503` loading, `500`
generation failed.

**`DELETE /run/{id}`** — cancel a running or queued request. The extension calls this when a
newer save supersedes a rebuild already in flight.

---

What gets sent, when a rebuild fires, and how results reach `*.graph.yaml`:
[story_graph_builder.md](story_graph_builder.md).
