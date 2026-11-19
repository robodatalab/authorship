from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from random import Random

import yaml

CHARACTER_TABLES = Path(__file__).parent / "character_tables"


@dataclass(frozen=True)
class RolledCharacter:
    given_name: str
    family_name: str
    motivations: list[str]
    traits: list[str]
    background: list[str]
    looks: list[str]


def _pooled(lists: Sequence[list[str]]) -> list[str]:
    entries = [entry for entries in lists for entry in entries]
    pooled = list(dict.fromkeys(entries))
    return pooled


def _pooled_slots(slots_of_each_table: Sequence[dict[str, list[str]]]) -> dict[str, list[str]]:
    slots = slots_of_each_table[0]
    pooled = {slot: _pooled([table_slots[slot] for table_slots in slots_of_each_table]) for slot in slots}
    return pooled


@dataclass(frozen=True)
class CharacterTable:
    given_names: list[str]
    family_names: list[str]
    motivations: list[str]
    traits: dict[str, list[str]]
    background: dict[str, list[str]]
    looks: dict[str, list[str]]

    def roll(self, random: Random, motivations: int) -> RolledCharacter:
        given_name = random.choice(self.given_names)
        family_name = random.choice(self.family_names)
        motivations_rolled = random.sample(self.motivations, motivations)
        traits = [random.choice(entries) for entries in self.traits.values()]
        background = [random.choice(entries) for entries in self.background.values()]
        looks = [random.choice(entries) for entries in self.looks.values()]
        rolled = RolledCharacter(given_name, family_name, motivations_rolled, traits, background, looks)
        return rolled


class CharacterTables:

    def __init__(self, table_of_each_genre: dict[str, CharacterTable]) -> None:
        self._table_of_each_genre = table_of_each_genre

    @classmethod
    def loaded(cls) -> CharacterTables:
        table_of_each_genre: dict[str, CharacterTable] = {}
        paths = CHARACTER_TABLES.glob("*.yaml")
        paths_in_order = sorted(paths)
        for path in paths_in_order:
            text = path.read_text()
            written = yaml.safe_load(text)
            table = CharacterTable(
                given_names=written["names"]["given"],
                family_names=written["names"]["family"],
                motivations=written["motivation"],
                traits=written["traits"],
                background=written["background"],
                looks=written["looks"],
            )
            table_of_each_genre[written["genre"]] = table
        tables = cls(table_of_each_genre)
        return tables

    @property
    def genres(self) -> list[str]:
        genres = list(self._table_of_each_genre)
        return genres

    def pooled(self, genres: Sequence[str]) -> CharacterTable:
        tables = [self._table_of_each_genre[genre] for genre in genres]
        given_names = _pooled([table.given_names for table in tables])
        family_names = _pooled([table.family_names for table in tables])
        motivations = _pooled([table.motivations for table in tables])
        traits = _pooled_slots([table.traits for table in tables])
        background = _pooled_slots([table.background for table in tables])
        looks = _pooled_slots([table.looks for table in tables])
        pooled = CharacterTable(given_names, family_names, motivations, traits, background, looks)
        return pooled
