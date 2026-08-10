from itertools import combinations
from pathlib import Path
import string
import unittest

from roost import (
    InferenceModelResourceManager,
    EncoderModel,
    coedit_prompt, machine_memory, qwen_chat_prompt
)
from server.manuscript import Manuscript, StoryLines
import torch

# Merged pieces carry the punctuation they were written with, and "blazer," is
# the same word as "blazer" when the query_embeds_in_output_space is which sentences share it.
EDGES = string.punctuation + "—“”‘’…"


def attribution(
    passage: str, query: str, model, tokenizer
) -> tuple[list[str], list[float], float]:
    embeddings = model.get_input_embeddings()

    passage_input_ids = tokenizer(passage, return_tensors="pt").to(model.device)["input_ids"]
    query_input_ids=tokenizer(query, return_tensors="pt").to(model.device)["input_ids"]
    passage_mask = torch.ones_like(passage_input_ids)
    passage_embeds_in_input_space = embeddings(passage_input_ids).detach().requires_grad_(True)

    with torch.no_grad():
        query_pooled_in_output_space = model(input_ids=query_input_ids).last_hidden_state[:, -1]
    query_pooled_in_output_space_unitvec = torch.nn.functional.normalize(query_pooled_in_output_space.float(), p=2, dim=1)

    hidden = model(inputs_embeds=passage_embeds_in_input_space, attention_mask=passage_mask).last_hidden_state[:, -1]
    unit = torch.nn.functional.normalize(hidden.float(), p=2, dim=1)
    alignment = (unit * query_pooled_in_output_space_unitvec).sum()
    gradient = torch.autograd.grad(alignment, passage_embeds_in_input_space)[0].float()

    contributions = (passage_embeds_in_input_space.detach().float() * gradient).sum(dim=-1)[0]

    pieces: list[list[str]] = []
    totals: list[float] = []
    for piece, contribution in zip(
        tokenizer.convert_ids_to_tokens(passage_input_ids[0]), contributions.tolist()
    ):
        opens = piece.startswith("Ġ") or piece in tokenizer.all_special_tokens
        if pieces and not opens:
            pieces[-1].append(piece)
            totals[-1] += contribution
        else:
            pieces.append([piece])
            totals.append(contribution)

    words = [tokenizer.convert_tokens_to_string(piece).strip() for piece in pieces]
    return words, totals, float(alignment)


def display(words: list[str], totals: list[float], scored: float) -> None:
    widest = max(len(word) for word in words)
    scale = max(map(abs, totals))
    for word, total in sorted(zip(words, totals), key=lambda pair: pair[1], reverse=True):
        bar = "█" * round(abs(total) / scale * 10)
        left = bar if total < 0 else ""
        right = bar if total >= 0 else ""
        print(f"{total:+.4f}  {word:<{widest}}  {left:>10}{right:<10}")

    print(f"sum {sum(totals):+.4f}, scored {scored:+.4f}")


def compare(passages: dict[str, tuple[list[str], list[float]]]) -> None:
    tallies: dict[str, dict[str, float]] = {}
    for name, (words, totals) in passages.items():
        for word, total in zip(words, totals):
            key = word.strip(EDGES).lower()
            if key:
                # A word said twice in one sentence is worth what both times
                # were worth together.
                scores = tallies.setdefault(key, {})
                scores[name] = scores.get(name, 0.0) + total

    names = list(passages)
    widest = max(len(word) for word in tallies)

    print("\nshared")
    print(f"{'':<{widest}}" + "".join(f"{name:>12}" for name in names))
    shared = {word: scores for word, scores in tallies.items() if len(scores) > 1}
    for word, scores in sorted(shared.items(), key=lambda pair: -sum(pair[1].values())):
        cells = "".join(
            f"{scores[name]:>+12.4f}" if name in scores else f"{'·':>12}"
            for name in names
        )
        print(f"{word:<{widest}}{cells}")

    for name in names:
        print(f"\nonly in {name}")
        owned = {
            word: scores[name]
            for word, scores in tallies.items()
            if len(scores) == 1 and name in scores
        }
        for word, total in sorted(owned.items(), key=lambda pair: -pair[1]):
            print(f"{total:+.4f}  {word}")


class GraphBasedSearchTest(unittest.TestCase):

    resource_manager: InferenceModelResourceManager
    model: EncoderModel
    manuscript: Manuscript
    story_lines: list[str]
    story_line_indices: list[int]

    @classmethod
    def setUpClass(cls) -> None:
        cls.resource_manager = InferenceModelResourceManager(quota_gb=4)
        cls.model = EncoderModel(model_id="Qwen/Qwen3-Embedding-0.6B", manager=cls.resource_manager, mem_required_gb=1)
        cls.manuscript = Manuscript.load(Path("./data/story_2.md"))
        indices, lines = zip(*StoryLines(cls.manuscript, start=19, end=49))  # chapter one only
        cls.story_line_indices = list(indices)
        cls.story_lines = list(lines)

        return super().setUpClass()

    def test_simple(self):
        query = "What did Anabelle wear?"
        vectors = self.model.encode(self.story_lines)
        query_pooled_in_output_space_unitvec = self.model.encode([query])[0]

        similarities = [
            sum(q * v for q, v in zip(query_pooled_in_output_space_unitvec, vector)) for vector in vectors
        ]
        ranking = sorted(range(len(similarities)), key=similarities.__getitem__, reverse=True)

        for index in ranking:
            print(f"{similarities[index]:.3f} line {self.story_line_indices[index]}: {self.story_lines[index]}")

        best = ranking[0]
        self.assertIn("dress", self.story_lines[best].lower())

  
    def test_attribution(self):
        first = "Anabelle ran a slow finger along his hip, smiling as a delicious shiver passed through his skin under her touch. She loved having that absolute effect on him. Taking another bite, she washed the pastry down with a solid swig of juice, entirely in no hurry."
        second = "Anabelle awoke to warm sunlight flooding her room and the scent of fresh juice and pastries. She stretched her arms wide, sitting up in bed."
        third = "Finding nothing suitable—which was the entire excuse for the shopping trip—she finally selected an outfit for the morning: a form-fitting black sequined dress that highlighted her legs, a matching blazer, and a jade necklace on a fine gold chain to draw Sophia's gaze exactly where she wanted it."
        query = "What did Anabelle wear?"

        model, tokenizer = self.model.load()
        passages = {}
        for name, sentence in [("first", first), ("second", second), ("third", third)]:
            words, totals, scored = attribution(sentence, query, model, tokenizer)
            print(f"\n{name}")
            display(words, totals, scored)
            passages[name] = (words, totals)

        compare(passages)


if __name__ == "__main__":
    unittest.main()
