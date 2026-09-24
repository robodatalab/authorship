from __future__ import annotations

import asyncio
import math
import statistics
import time
from collections.abc import Callable
from dataclasses import dataclass, replace
from typing import Any

import cortexgrid
from cortexgrid_infer import (
    DeployedModel,
    GeminiText2Text,
    Hosted,
    HuggingFaceImporter,
    Text2Text,
    detect_device,
)
from server.models import cluster
from server.storydoc import Document

EVENT_PROMPT = """
Given numbered lines in format <line index>.<line>, return an event that is described in that line.
An event describes something that happens to something or somewhere. 

Examples:

1. The staircase opens to a windowless cavern lit by a set of dimmed fluorescent lights. Their luminosity can be changed from blinding white to pitch black - settings my Owner often explores. I increase the brighness to allow me to see every little detail well, and begin the rounds.  -> 1. He turned up the lights in room
2. I take the broom and begin wiping the floors. The motion kicks up the dust and I begin coughing. -> 2. He cleans the room.
3. Suddenly, I heard footsteps on the staircase - light, calculated. I recognized them immediately. She walked in, holding her head up high. -> 3. She enters the room that he cleans.
"""

def detect_events(document: Document, causal_model: Text2Text) -> list[str]:
    max_chapter_length = max(estimate_num_tokens(chapter) for _, chapter in document.chapters())

    numbered_lines = "\n".join([f"{idx}. {line}" for idx, line in document.story_lines()])

    all_events: list[str] = []
    for _, chapter in document.chapters():
        answer = "\n".join([chunk for chunk in answer_iterator = causal_model.complete(
            [
                {"role": "system", "content": EVENT_PROMPT},
                {"role": "user", "content": chapter},
            ],
            max_new_tokens=max_chapter_length,
            temperature=0.0,
        )])

        events = [line.partition(". ")[2] for line in answer.splitlines()]

        all_events.extend(events)

    return events

