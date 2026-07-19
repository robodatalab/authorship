"""Prompts, one per task.

Deliberately simple — these are for getting the loop working end to end, not for
quality. Tuned adapters replace them later.
"""

from dataclasses import dataclass


@dataclass
class Task:
    system: str
    template: str

    def prompt(self, text: str) -> str:
        return self.template.format(text=text)


SCENE_DETECTION = Task(
    system=(
        "You split manuscripts into scenes. "
        "Reply with JSON only, no commentary, no code fences."
    ),
    template=(
        "Split the manuscript below into scenes. Line numbers are given at the "
        "start of each line.\n\n"
        "Reply with:\n"
        '{{"nodes": [{{"id": 1, "title": "short label", "start": 1, "end": 5}}]}}\n\n'
        "start and end are line numbers, inclusive.\n\n"
        "MANUSCRIPT:\n{text}"
    ),
)

TASKS = {
    "scene_detection": SCENE_DETECTION,
}


def numbered(text: str) -> str:
    """Prefix each line with its 1-based number, which the graph format uses."""
    return "\n".join(f"{i}: {line}" for i, line in enumerate(text.splitlines(), 1))
