"""Relations between the entities of a document, served like every other model.

Adaptive Thresholding and Localized cOntext Pooling, from
https://arxiv.org/abs/2010.11304. An entity is pooled from the mentions it was given,
an ordered pair of entities is read against the part of the document the two attend to
together, and the pair carries whichever relations outscore the threshold it is
classified alongside.

A model kind cannot be declared where it is used: the serving process is spawned rather
than forked, so it re-imports the class by name and would not find one declared in a
notebook or under `__main__`.
"""

from collections import Counter, defaultdict
from collections.abc import Sequence
from functools import partial
from pathlib import Path
import shutil
from urllib.request import urlopen

from roost.resource_manager import ModelKind, ModelNotAvailable
import torch
from torch import nn
from transformers import AutoModel, AutoTokenizer

from server import log

_log = log.logger(__name__)

Span = tuple[int, int]

RELATIONS = 97  # DocRED's 96, and at 0 the threshold a pair is read against
BLOCK = 64  # the width of one bilinear group
# What an entity is narrowed to before it is classified. Its own width, not the
# encoder's: the same 768 was trained over both released encoders, one of which is wider.
EMBEDDING = 768
WINDOW = 512  # as many positions as RoBERTa has
STRIDE = 256
# Every pair is held as the outer product of two grouped vectors, which is far larger
# than the pair itself; a document of any size has too many pairs to hold at once.
PAIRS = 256

# What the paper trained, keyed by what it was trained on: the architecture and the
# weights are one choice, not two.
RELEASED = {
    "roberta-large": "https://github.com/wzhouad/ATLOP/releases/download/1.0/atlop-roberta",
    "bert-base-cased": "https://github.com/wzhouad/ATLOP/releases/download/1.0/atlop-bert-base",
}
CACHE = Path.home() / ".cache" / "atlop"


class _Atlop(nn.Module):
    """One logit per relation for an ordered pair of entities, and one for the threshold.

    The threshold is a class like any other and is learned per pair, which is what lets a
    pair carry as many relations as it carries, or none, without a cutoff set by hand.
    """

    def __init__(
        self,
        encoder,
        relations: int = RELATIONS,
        block: int = BLOCK,
        embedding: int = EMBEDDING,
    ) -> None:
        super().__init__()
        self.block = block
        # `model`, because that is the name the released weights were saved under.
        self.model = encoder
        width = encoder.config.hidden_size
        self.head_extractor = nn.Linear(2 * width, embedding)
        self.tail_extractor = nn.Linear(2 * width, embedding)
        self.bilinear = nn.Linear(embedding * block, relations)

    def forward(
        self, ids: list[int], mentions: Sequence[Sequence[int]]
    ) -> tuple[list[tuple[int, int]], torch.Tensor]:
        """Every ordered pair of entities, and how each of them scores on every relation."""
        hidden, attention = self._read(ids)
        vectors, profiles = self._pooled(hidden, attention, mentions)

        pairs = [
            (head, tail)
            for head in range(len(mentions))
            for tail in range(len(mentions))
            if head != tail
        ]
        if not pairs:
            return [], torch.zeros(0, self.bilinear.out_features, device=hidden.device)

        scored = []
        for first in range(0, len(pairs), PAIRS):
            batch = pairs[first:first + PAIRS]
            head = torch.tensor([h for h, _ in batch], device=hidden.device)
            tail = torch.tensor([t for _, t in batch], device=hidden.device)
            scored.append(
                self._scored(
                    vectors[head], vectors[tail], self._focus(hidden, profiles, head, tail)
                )
            )
        return pairs, torch.cat(scored)

    def _read(self, ids: list[int]) -> tuple[torch.Tensor, torch.Tensor]:
        """Hidden states and last-layer attention for a document longer than the encoder.

        Every window is a document in its own right, with its own `<s>` and `</s>`. Where
        two of them overlap the states are averaged and the attention summed and then
        renormalised, so a row of it is still a distribution over the whole document.
        """
        device = next(self.parameters()).device
        inner, length = WINDOW - 2, len(ids)
        body = ids[1:-1]
        starts = (
            [0] if length <= WINDOW
            else list(range(0, len(body) - inner, STRIDE)) + [len(body) - inner]
        )

        hidden = torch.zeros(length, self.model.config.hidden_size, device=device)
        attention = torch.zeros(
            self.model.config.num_attention_heads, length, length, device=device
        )
        seen = torch.zeros(length, device=device)

        for start in starts:
            window = body[start:start + inner]
            found = self.model(
                input_ids=torch.tensor([[ids[0]] + window + [ids[-1]]], device=device),
                output_attentions=True,
            )
            where = torch.tensor(
                [0] + list(range(1 + start, 1 + start + len(window))) + [length - 1],
                device=device,
            )
            hidden[where] += found.last_hidden_state[0].float()
            attention[:, where[:, None], where[None, :]] += found.attentions[-1][0].float()
            seen[where] += 1

        return (
            hidden / seen.unsqueeze(-1),
            attention / (attention.sum(-1, keepdim=True) + 1e-10),
        )

    def _pooled(
        self, hidden: torch.Tensor, attention: torch.Tensor, mentions: Sequence[Sequence[int]]
    ) -> tuple[torch.Tensor, torch.Tensor]:
        """A vector and an attention profile per entity, gathered over its mentions.

        logsumexp is the smooth maximum: one telling mention carries the entity, where a
        mean would let the rest of them dilute it.
        """
        vectors, profiles = [], []
        for fenced in mentions:
            where = torch.tensor(fenced, device=hidden.device)
            vectors.append(torch.logsumexp(hidden[where], dim=0))
            profiles.append(attention[:, where].mean(1))
        return torch.stack(vectors), torch.stack(profiles)

    def _focus(
        self,
        hidden: torch.Tensor,
        profiles: torch.Tensor,
        head: torch.Tensor,
        tail: torch.Tensor,
    ) -> torch.Tensor:
        """What a pair brings into view — the part of the document both are reading.

        A document holds more than any one pair is about, and the whole of it read into
        every pair is what leaves distant pairs looking alike. The product of the two
        attention profiles keeps only what they attend to together.
        """
        shared = (profiles[head] * profiles[tail]).mean(1)
        return (shared / (shared.sum(-1, keepdim=True) + 1e-5)) @ hidden

    def _scored(
        self, head: torch.Tensor, tail: torch.Tensor, context: torch.Tensor
    ) -> torch.Tensor:
        head = torch.tanh(self.head_extractor(torch.cat([head, context], dim=1)))
        tail = torch.tanh(self.tail_extractor(torch.cat([tail, context], dim=1)))
        # Grouped: the whole outer product of two 768-vectors against 97 relations is
        # fifty million parameters to hold one pair of entities in.
        groups = head.shape[1] // self.block
        paired = (
            head.view(-1, groups, self.block, 1) * tail.view(-1, groups, 1, self.block)
        ).view(-1, groups * self.block * self.block)
        return self.bilinear(paired)


def _weights(model_id: str) -> Path:
    """The trained half of ATLOP, fetched once and kept.

    The encoder arrives through `from_pretrained`, which downloads and caches on its own.
    The part that knows what a relation is was released as a file beside the paper rather
    than to the hub, so it is fetched here — a model kind that leaves it to be put in
    place by hand is not ready to serve when the manager deploys it.
    """
    if model_id not in RELEASED:
        raise ModelNotAvailable(f"no ATLOP weights were released for {model_id}")

    kept = CACHE / model_id
    if kept.exists():
        return kept

    _log.info("fetching ATLOP weights for %s", model_id)
    CACHE.mkdir(parents=True, exist_ok=True)
    # Written beside its destination and moved into place, so a fetch that is interrupted
    # leaves nothing behind that a later load would mistake for a complete download.
    partial = kept.with_suffix(".partial")
    with urlopen(RELEASED[model_id]) as source, partial.open("wb") as sink:
        shutil.copyfileobj(source, sink)
    partial.rename(kept)

    _log.info("kept ATLOP weights for %s at %s", model_id, kept)
    return kept


class AtlopModel(ModelKind):
    """The relations a document holds between the entities it is handed."""

    def load(self):
        encoder = AutoModel.from_pretrained(
            # Localized context pooling reads the attention itself, and eager is the only
            # implementation that hands it back; the faster ones return the values alone.
            self.model_id, attn_implementation="eager", dtype=torch.float32
        )
        model = _Atlop(encoder)
        weights = torch.load(_weights(self.model_id), map_location="cpu")
        # A buffer transformers used to keep in the state dict and no longer does. The
        # checkpoint predates that and carries one; nothing here has it to put back.
        weights.pop("model.embeddings.position_ids", None)
        model.load_state_dict(weights)
        device = "mps" if torch.backends.mps.is_available() else "cpu"
        return model.to(device).eval(), AutoTokenizer.from_pretrained(self.model_id)

    def relations(
        self, text: str, mentions: Sequence[Sequence[Span]]
    ) -> list[tuple[int, int, int]]:
        """What holds between the entities of `text`, as head, tail and relation.

        An entity is given by the character spans it is mentioned at and answered for by
        its place in `mentions`. A pair related in more than one way comes back once for
        each of them, and a pair related in none does not come back at all.
        """
        with self.manager.residency(self) as (requests, replies):
            requests.put(partial(_relate, text, tuple(map(tuple, mentions))))
            error, found = replies.get()
        if error is not None:
            raise ModelNotAvailable(f"{self.model_id} failed to relate: {error}")

        _log.info("related %d entities by %d relations", len(mentions), len(found))
        return found


# Module level for the same reason the class is: the request is pickled onto a queue
# and unpickled on the other side of a process boundary.
def _relate(text, mentions, model, tokenizer):
    ids, fenced = _fences(text, mentions, tokenizer)
    # An entity whose every mention fell outside the tokenised document has nothing to be
    # pooled from, and one the encoder never saw cannot be related to one it did.
    grounded = [(entity, where) for entity, where in enumerate(fenced) if where]

    with torch.no_grad():
        pairs, logits = model(ids, [where for _, where in grounded])

    return [
        (grounded[pairs[pair][0]][0], grounded[pairs[pair][1]][0], relation)
        for pair, relation in (logits > logits[:, :1]).nonzero().tolist()
    ]


def _fences(text, mentions, tokenizer):
    """The document with every mention fenced by `*`, and where each opening fence fell.

    A mention is read off the marker in front of it rather than off the mention itself.
    The markers go in as tokens of their own: written into the text as characters, the
    byte-level merges would be the ones deciding where a mention begins.
    """
    encoded = tokenizer(text, add_special_tokens=False, return_offsets_mapping=True)
    offsets = encoded["offset_mapping"]
    star = tokenizer.convert_tokens_to_ids("*")

    opening, closing = defaultdict(list), Counter()
    for entity, spans in enumerate(mentions):
        for mention, (start, end) in enumerate(spans):
            first = next((i for i, (_, stop) in enumerate(offsets) if stop > start), None)
            last = next(
                (i for i in reversed(range(len(offsets))) if offsets[i][0] < end), None
            )
            if first is None or last is None or last < first:
                continue
            opening[first].append((entity, mention))
            closing[last] += 1

    ids, at = [], {}
    for index, token in enumerate(encoded["input_ids"]):
        for key in opening[index]:
            at[key] = len(ids)
            ids.append(star)
        ids.append(token)
        ids.extend([star] * closing[index])

    # The one place is for the `<s>` the fenced body is about to be wrapped in.
    return (
        [tokenizer.bos_token_id] + ids + [tokenizer.eos_token_id],
        [
            [at[(entity, mention)] + 1
             for mention in range(len(spans)) if (entity, mention) in at]
            for entity, spans in enumerate(mentions)
        ],
    )
