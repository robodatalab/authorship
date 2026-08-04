from itertools import combinations
from pathlib import Path
import unittest

from server.inference import (
    InferenceModelResourceManager,
    EncoderModel,
    coedit_prompt, machine_memory, qwen_chat_prompt
)
from server.manuscript import Manuscript, StoryLines


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
        question = self.model.encode([query])[0]

        similarities = [
            sum(q * v for q, v in zip(question, vector)) for vector in vectors
        ]
        ranking = sorted(range(len(similarities)), key=similarities.__getitem__, reverse=True)

        for index in ranking:
            print(f"{similarities[index]:.3f} line {self.story_line_indices[index]}: {self.story_lines[index]}")

        best = ranking[0]
        self.assertIn("dress", self.story_lines[best].lower())

    def test_variations(self):
        first = "Anabelle ran a slow finger along his hip, smiling as a delicious shiver passed through his skin under her touch. She loved having that absolute effect on him. Taking another bite, she washed the pastry down with a solid swig of juice, entirely in no hurry."
        second = "Anabelle awoke to warm sunlight flooding her room and the scent of fresh juice and pastries. She stretched her arms wide, sitting up in bed."
        third = "Finding nothing suitable—which was the entire excuse for the shopping trip—she finally selected an outfit for the morning: a form-fitting black sequined dress that highlighted her legs, a matching blazer, and a jade necklace on a fine gold chain to draw Sophia's gaze exactly where she wanted it."

        words = first.split()
        first_complement = []
        for size in range(len(words) + 1):
            for kept in combinations(words, size):
                first_complement.append(" ".join(kept))

        query = "What did Anabelle wear?"

        vectors = self.model.encode(first_complement)
        question = self.model.encode([query])[0]
        similarities = [
            sum(q * v for q, v in zip(question, vector)) for vector in vectors
        ]
        ranking = sorted(range(len(similarities)), key=similarities.__getitem__, reverse=True)



if __name__ == "__main__":
    unittest.main()
