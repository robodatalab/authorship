from __future__ import annotations

from server.story_analysis.story_plot import StoryPlot

FAKE_STORY_PLOTS = [
    (
        "The fall of the numbers",
        ["Diane", "Josh"],
        "A decline nobody wants to own",
        "Someone is made to answer for it",
    ),
    (
        "The rivalry at the top",
        ["Diane", "Geoffrey"],
        "Two people who need each other",
        "One of them is left holding the company",
    ),
    (
        "The thing in the servers",
        ["Josh", "Mara"],
        "Something is changing the platform",
        "The people nobody listens to are believed",
    ),
    (
        "The way home",
        ["Diane"],
        "A private life kept at arm's length",
        "It stops being kept there",
    ),
    (
        "The bill and the Senate",
        ["Geoffrey", "Carlile"],
        "A law written for one company",
        "It passes, or the man who wrote it falls",
    ),
    (
        "The week the world changed",
        ["The narrator"],
        "Seven days nobody can account for",
        "The story of them is written down",
    ),
]

FAKE_KEY_EVENTS = [
    "Fake data. The meeting where it was first said out loud",
    "Fake data. The night it could no longer be explained away",
    "Fake data. The call that made it somebody's fault",
]


def found_in_a_chapter(plots: list[StoryPlot], read: int) -> None:
    if read % 2 == 1 and len(plots) < len(FAKE_STORY_PLOTS):
        title, characters, origin, goal = FAKE_STORY_PLOTS[len(plots)]
        plots.append(StoryPlot(title, list(characters), f"Fake data. {origin}", goal))
        return
    changed = plots[(read - 1) % len(plots)]
    changed.characters.append(f"Someone met in chapter {read}")
    changed.goal = f"{changed.goal}, as chapter {read} has it"


def attributed(plots: list[StoryPlot], line: int, read: int) -> None:
    if not plots or read % 7 == 0:
        return
    plots[(read // 5) % len(plots)].attributed(line)
    if read % 11 == 0:
        plots[(read // 5 + 1) % len(plots)].attributed(line)


def key_event(passes: int) -> str:
    return FAKE_KEY_EVENTS[(passes - 1) % len(FAKE_KEY_EVENTS)]
