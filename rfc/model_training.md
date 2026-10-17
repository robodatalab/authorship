# Training models on cortexgrid

The first model to train is the story space model: Qwen3-8B with a rank-1 LoRA
on every linear map plus a head, trained on the annotated story spans
(`rfc/story_space.tex`, 3.4). This document sets out how training should work
across cortexgrid and cortexgrid-train, then maps what each library is missing
to get there.

## What the models do

Two models take a story as input. The first returns the story's salient
concepts. The second takes the story and those concepts and returns the story's
plots:

```python
class TextSpan:
  firstWordIndex: int
  lastWordIndex: int

class SalientConcept:
  name: str
  abstract: str
  references: list[TextSpan]

def salient_concepts(story: str) -> list[SalientConcept]

class Plot:
  name: str
  abstract: str
  causal_events_in_order: list[TextSpan]

def plots(story: str, concepts: list[SalientConcept]) -> list[Plot]
```

- **Input:** a whole story, as text.
- **Output of `salient_concepts`:** one `SalientConcept` per salient idea. Each
  has a name, an abstract that describes the idea, and the spans of the story
  that refer to it.
- **Output of `plots`:** one `Plot` per plot. Each has a name, an abstract, and
  the spans of the story that are its causal events, in story order.
- **A `TextSpan`** is a range of the story's words, the first and the last
  included, numbered as the `.author` files number them.

**They are two models because `plots` depends on `salient_concepts`:** it takes
the concepts as input. It is trained on its own data, and nothing is annotated
for plots yet. This document trains `salient_concepts` only. That model is
`StoryStateExtractionModel`, the story space model.

**The training data is this output, written by the author.** Each annotated
`.author` file is one input story with the output `salient_concepts` should
return for it. Each salient-concept cell is one `SalientConcept`: the cell's
title is the name, its text is the abstract, and its `words` ranges are the
references.

`encode_basis`, `encode_from_state` and `encode_from_text` were an experiment.
They are not the models' API.

The same API is in `rfc/story_space.tex`, section 1.

## How models are defined

Training has to work with models as they are already defined. A model is a
serve-app class, like `CausalEventTrajectoryClassifier` or cortexgrid's
`Linear` example:

- `requirements()` says what one replica needs: hardware, and the served models
  it depends on (`models=[DeploymentConfig(...)]`);
- `__init__(deployment: DeploymentKey)` builds the model:
  - its own weights from `cortexgrid.load_model(deployment.family, deployment.suffix, deployment.run_name)`;
  - its settings from `cortexgrid.model_config(deployment)`;
  - its served dependencies from `cortexgrid.required_models(deployment)[i].client()`;
- `@serve.endpoint` methods serve it;
- a deploy function registers the entry and deploys it.

The story space model is defined the same way, as `StoryStateExtractionModel`.
Training takes the model as defined and trains it. The job does not assemble
the model itself.

## How training works

### The model

`StoryStateExtractionModel` builds its base, the LoRA and the head in
`__init__`, and is a `torch.nn.Module`, so it can be trained:

```python
@serve.ingress
class StoryStateExtractionModel(torch.nn.Module):
    @classmethod
    def requirements(cls) -> cortexgrid.ModelRequirements:
        return cortexgrid.ModelRequirements(num_gpus=1, ram_gb=..., vram_gb=...)

    def __init__(self, deployment: cortexgrid.DeploymentKey) -> None:
        super().__init__()
        qwen_weights = cortexgrid.load_model(
            LONG_CONTEXT_QWEN.family, LONG_CONTEXT_QWEN.suffix, cortexgrid.IMPORTED
        )
        self._tokenizer = AutoTokenizer.from_pretrained(qwen_weights)
        if self._tokenizer.pad_token is None:
            self._tokenizer.pad_token = self._tokenizer.eos_token
        qwen = AutoModelForCausalLM.from_pretrained(qwen_weights, dtype=torch.bfloat16)
        device = detect_device()
        qwen.to(device)
        adapter = LoraConfig(r=ADAPTER_RANK, lora_alpha=ADAPTER_ALPHA, target_modules="all-linear")
        self._adapted_qwen = get_peft_model(qwen, adapter)
        self._head = ...
        entry = cortexgrid.model_registry_status(
            deployment.family, deployment.suffix, deployment.run_name
        )
        if entry.has_weights:
            own_weights = cortexgrid.load_model(
                deployment.family, deployment.suffix, deployment.run_name
            )
            adapter_and_head = torch.load(own_weights / ADAPTER_AND_HEAD_FILE)
            self.load_state_dict(adapter_and_head, strict=False)

    def forward(self, texts: list[str]) -> ...: ...

    def save_weights(self, weights_dir: Path) -> None: ...

    @serve.endpoint
    async def salient_concepts(self, story: str) -> list[SalientConcept]: ...
```

- **The base is part of the model, not a served dependency.** A served
  dependency is reached only through its endpoints, from another process. A LoRA
  changes the base's own layers, and training needs gradients through them. So
  the model loads the base's weights itself, as `Linear` loads its own, and its
  `requirements` ask for a GPU of its own instead of `models=[Qwen]`.
- **The base is loaded by a copy of `Text2Text`'s loading steps:** tokenizer,
  pad token, model in a dtype, move to the device. `Text2Text` stays as it is.
  `forward` tokenizes the texts and runs the adapted Qwen for its hidden states
  itself.
- **The LoRA is attached with peft directly.** `target_modules="all-linear"`
  adapts every linear map in the transformer layers and leaves the output head
  alone. That holds for every architecture, where Qwen's seven projection names
  would not.
- **One class, two entries.**
  - The untrained entry is registered with `register_model` and has no weights
    of its own, so `__init__` builds a fresh LoRA and head.
  - The trained entry is saved by the training run, so `__init__` loads the
    trained adapter and head from it.
- **The class owns its weights both ways.** `save_weights` writes the
  parameters that train (adapter and head) with `torch.save`, and `__init__`
  reads them back. The format never leaves the class.
- **The endpoints run `forward` under `inference_mode`.**

### How `StoryStateExtractionModel` changes

| member | today | after |
|---|---|---|
| base class | none | `torch.nn.Module` |
| `requirements()` | 1 GB of RAM and `models=[LONG_CONTEXT_QWEN_DEPLOYMENT]` | one GPU with the RAM and VRAM for Qwen3-8B, the LoRA and the head; no `models` |
| `__init__` | takes a client of the deployed Qwen from `required_models` | loads Qwen with a copy of `Text2Text`'s loading steps, attaches the LoRA, creates the head; loads the trained adapter and head when its entry has weights |
| `deploy()` | registers the entry and deploys it under `IMPORTED` | the same, plus a `run_name` to deploy a trained entry |
| `forward(texts)` | none | tokenizes the texts, runs the adapted Qwen for its hidden states, and passes them through the head: each text's point in the story space (`rfc/story_space.tex`, 3.6) |
| `save_weights(weights_dir)` | none | writes the adapter and head |
| endpoints | `encode_basis`, `encode_from_state`, `encode_from_text`, an experiment | `salient_concepts(story)` only (open question 1); `plots` belongs to the other model |
| `StoryStateSpaceBasis`, `StoryState` | the experiment's types | removed with its endpoints |
| `SalientConcept` | `name` and `paragraph_idxs` | the API's `SalientConcept`: `name`, `abstract`, `references`; with `TextSpan` beside it |
| `gaussian_weights_of_layers`, `embedding_of_tokens`, `every_layer_idx`, `state_embedding`, `midpoint_and_direction` | the untrained geometry | removed; the head replaces them |

`salient_point_classification_loss` is not part of the model. Like the dataset, it lives with the
training code, in `experiments/story_state_extraction_training/`.

### The flow

1. **Stage the inputs.** The base model is imported into the registry once. The
   untrained story space entry is registered. The training data is saved as a
   dataset, an entry fingerprinted by its content:
   `cortexgrid.save_dataset(stories_dir, "annotated-stories")`.
2. **Submit the training job** with what it needs:
   `cortexgrid.remote(train_story_space, requirements=ModelRequirements(num_gpus=1, ram_gb=..., vram_gb=...), retry=True)`.
   cortexgrid then does three things before it starts the job:
   - deploys any served models the job declares and waits until they are ready;
   - pauses idle served models to make room on the GPU;
   - places the job on a GPU worker with that GPU, RAM and VRAM reserved.
3. **Inside the job**, `train_story_space` holds only these steps:
   1. `cortexgrid.load_dataset("annotated-stories")` gives the stories.
   2. `cortexgrid.instantiate_model("Authorship", "storystateextractionmodel", IMPORTED)`
      builds `StoryStateExtractionModel` in the job from the untrained entry,
      running the same `__init__` a replica runs.
   3. `train_from_model_output(model, AnnotatedStorySpansDataset(stories), salient_point_classification_loss, ...)`.
      It resumes from the job's checkpoint, logs metrics to the run, and
      checkpoints after each epoch only what trains: adapter, head and
      optimizer.
   4. `model.save_weights(weights_dir)` writes the adapter and head.
      `cortexgrid.save_model(weights_dir, StoryStateExtractionModel, ...)` saves
      them as the trained entry, under the run.
4. **The driver waits** with `training.result()`, which returns once the job
   has finished, however many times it was retried. Metrics are on the run.
5. **Serve the result.** `deploy_model` deploys the trained entry. The replica
   runs the same `__init__`, which now finds weights and loads them.
6. **Lineage.** The run records every dataset it loaded and every entry whose
   weights it loaded (here Qwen), and owns the entry it saved. Together these
   say which data and which base produced which model.

### Why a job, and where other components run

A training run is finite, checkpointed and resumed by retry, and that is what a
job is. A serve app is a long-lived request handler that the scheduler pauses
when idle, and a paused trainer would lose its run. So the trainer is a job, and
no serve equivalent for training is needed.

Components that run beside the trainer split into two kinds:

- **A component that only feeds the trainer** (sampling, collating) runs inside
  the job, as DataLoader workers. It needs no lifecycle of its own. Our 6,785
  spans fit in memory.
- **A component that serves traffic the trainer depends on** (a teacher, a judge,
  an evaluator) is a served model. The job declares it in `requirements.models`.
  cortexgrid brings it up before the job, the same way it already brings up a
  serve app's dependencies, and keeps it unpaused while the job runs.

The cluster has one GPU per node, and one GPU holds Qwen3-8B with a LoRA, so
distributed training such as Ray Train is not needed.

## What is missing

| step | today | missing | library |
|---|---|---|---|
| 1 stage data | nothing for datasets | `save_dataset`, `load_dataset`, the run's dataset link | cortexgrid |
| 2 submit | jobs reserve only `GPU`/`CPU`. The scheduler never pauses a model for a job. A job pending past Ray's 900 s start timeout fails. A deployed `Text2Text` holds `num_gpus=1`, so with Qwen deployed the job never starts | `requirements` on jobs; dependencies deployed and kept unpaused; the scheduler counting a pending job as waiting | cortexgrid |
| 3.2 build the model | a model is built only by deploying it. `model_config(key)` needs a deployment record | `instantiate_model`; `model_config` for an instantiated key | cortexgrid |
| | `StoryStateExtractionModel` calls a deployed `Text2Text` and has no layers of its own | base, LoRA and head built in `__init__`; `forward`; `save_weights`; its own GPU | authorship |
| 3.3 train | `train_sft` only: it calls `model(input_ids, attention_mask, labels)` and moves every batch value to the device. Checkpoints pickle the whole `state_dict`, 16 GB for Qwen3-8B | `train_from_model_output`, a peer of `train_sft`; checkpoints of trainable state only | cortexgrid-train |
| | nothing | `salient_point_classification_loss`, as `rfc/story_space.tex` 3.7 defines it; batches of 32 spans from one story | authorship |
| 4 wait | cortexgrid has no way to wait for a `retry=True` job, because a failure that causes a retry immediately shows up in `done()` as the job having finished, and `result()` refuses such a job | `done()` and `result()` that wait until a `retry=True` job has finished, however many times it is retried | cortexgrid |
| 6 lineage | cortexgrid cannot say which data and which base model a trained model came from, because it records only the models a run imports, not the ones it loads, and nothing reads even that record | when a job loads a dataset or a model's weights, cortexgrid records it on the job's run, and can list what a run loaded | cortexgrid |

Step 5, serving the trained entry, needs nothing beyond step 3.2.

### Building a model in the job (cortexgrid)

`cortexgrid.instantiate_model(family, suffix, run_name, config=None)` builds an
entry's serve-app class in the calling process:

1. imports the class from the entry's `class_import_path`;
2. constructs it with the entry's `DeploymentKey`, so its `__init__` runs as it
   does in a replica.

For that `__init__` to run outside a replica, the calls a model makes in it
must work there:

| call | in a replica | in an instantiated model |
|---|---|---|
| `load_model(...)` | downloads the weights | the same; it already works in any process |
| `model_config(key)` | entry config, under the deployment's config | entry config, under `instantiate_model`'s `config` (missing: today it raises without a deployment record) |
| `required_models(key)` | deployments of the served dependencies | the same; the job declares them in its `requirements`, so they are up |

The contract is the one models already follow, so `instantiate_model` holds for
every entry, imported, hosted or saved by a run. The class's module must be
importable in the calling process, as it must be for `Deployment.client()`.

**`instantiate_model` is the counterpart of `deploy_model`.** Both build the
same class from the same key. They differ in where the model runs and what the
caller gets back:

| | where it runs | the caller gets |
|---|---|---|
| `deploy_model` | a replica on the serving cluster, which cortexgrid places, pauses and scales | a client that reaches the replica over HTTP |
| `instantiate_model` | the process that calls it (a job, a notebook) | the model object itself |

`instantiate_model` places nothing. The model runs on whatever hardware the
calling process was given, which for a training job is what its
`requirements` reserved.

### The loop (cortexgrid-train)

cortexgrid-train has one loop, `train_sft`, which fine-tunes a HuggingFace
causal LM on token sequences. Three of the things it does every step stop it
from training `StoryStateExtractionModel`:

| in each step | `train_sft` | why it fails for our model | `train_from_model_output` needs to |
|---|---|---|---|
| moving the batch | moves every value in the batch to the model's device (`v.to(device)`) | our batch holds the span texts, and a list of strings cannot be moved to a device | hand the batch over as it is; the model tokenizes the texts and moves the tokens itself |
| calling the model | `model(input_ids=..., attention_mask=..., labels=...)`, the HuggingFace causal LM signature, with `labels` built from `input_ids` | our `forward` takes texts and has no labels: what it learns is in `salient_concepts`, which only the loss reads | call `model(batch)` and hand the output and the batch to `loss_fn` |
| checkpointing each epoch | `save_training_state(model, ...)` pickles the whole `state_dict` | that includes Qwen's frozen 8B parameters, 16 GB uploaded every epoch, though only the 2.7M LoRA parameters and the head change | checkpoint only the parameters that train, plus the optimizer and scheduler state |

`train_from_model_output` is that loop, a peer of `train_sft` named the same
way:

```python
def train_from_model_output(
    model: torch.nn.Module,
    dataset: Dataset,
    loss_fn: LossFn,
    epochs: int = 3,
    batch_size: int = 2,
    lr: float = 2e-5,
    max_grad_norm: float = 1.0,
    warmup_ratio: float = 0.1,
) -> torch.nn.Module: ...
```

It does everything `train_sft` does, with the same parameters and defaults:

- epochs over a shuffled `DataLoader` of `batch_size`;
- AdamW with weight decay;
- a cosine learning-rate schedule with linear warmup over `warmup_ratio` of
  the steps;
- gradient clipping at `max_grad_norm`;
- resume from the job's checkpoint;
- a heartbeat each epoch;
- `train/loss` and `train/lr` each step, `train/epoch_loss` each epoch;
- a checkpoint each epoch;
- returning the trained model and leaving saving to the caller.

It differs only in the three steps above, and builds its optimizer over the
trainable parameters alone. `loss_fn` is `train_sft`'s `LossFn`: it takes the
model's output and the batch.

It is a new function beside `train_sft`, not a change to it. Building labels
from `input_ids` and calling the model with them is what SFT is, so it holds
only for causal LMs. `train_from_model_output` holds for any module whose
`forward` takes a batch. Once both loops exist, the parts they share (resume,
heartbeat, metrics, checkpoints, optimizer and schedule) can be extracted and
reused.

**The method is supervised learning:** a model, labelled examples, and a loss
over the model's output and the labels. SFT is its special case for a causal LM
with next-token cross-entropy as the loss. What the story space does with it is
classification: the salient point classification loss asks each span's point to
lie inside the caps of the concepts it refers to, and outside the others
(`rfc/story_space.tex`, 3.7). That part lives in
`salient_point_classification_loss`, not in the loop.

### Job requirements (cortexgrid)

- `cortexgrid.remote(fn, *args, requirements=ModelRequirements(...), retry=...)`.
  `num_gpus`, `ram_gb` and `vram_gb` reserve `GPU`, `memory` and `vram_mib` with
  the placement code serve already uses.
- `requirements.models` are deployed with `wait=True` before the job is
  submitted, and stay unpaused while it runs.
- The model scheduler counts a pending job as waiting for room, as it does a
  pending replica.

### Datasets (cortexgrid)

- `save_dataset(local_dir, name) -> SavedDataset` uploads to
  `datasets/<name>/<fingerprint>/`, the fingerprint being a hash of the
  content.
- `load_dataset(name, fingerprint=None) -> Path` downloads inside a job and
  records `(run_id, name, fingerprint)` on the run.
- For the story space, the dataset is the annotated `.author` files, which the
  driver stages under their paths in the stories repository.

## Order of work

1. cortexgrid: `instantiate_model`, `model_config` for an instantiated key,
   `load_model` recording what it loads on the run.
2. cortexgrid-train: `train_from_model_output`, checkpoints of trainable state
   only. The parts it shares with `train_sft` are extracted afterwards.
3. cortexgrid: job requirements, the scheduler pausing models for a pending
   job, and `done()` and `result()` waiting for a `retry=True` job.
4. cortexgrid: datasets.
5. authorship: `StoryStateExtractionModel` as above; `salient_point_classification_loss`.

The driver, `experiments/story_state_extraction_training/training.py`, is
already written against all of these.

## Open questions

1. The story space places a text at a point and says which concepts' caps
   contain it, so it can find a concept's references once the concept is
   known. It does not say how `salient_concepts` finds the concepts of a story
   that has no annotations, or how it writes their names and abstracts, which
   takes a generative model on top of the story space.
