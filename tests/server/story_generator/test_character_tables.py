import unittest

from server.story_generator.character_tables import CharacterTable, CharacterTables

WESTERN = CharacterTable(
    given_names=["Wade"],
    family_names=["Colter"],
    motivations=["owes a debt that can never be repaid"],
    traits={"temperament": ["quiet"], "quirk": ["whittles"], "flaw": ["drinks"]},
    background={"upbringing": ["grew up on a ranch"], "family": ["an orphan"], "occupation": ["a drover"], "turning point": ["on the run"]},
    looks={"build": ["lean"], "features": ["a broken nose"], "style": ["a dusty hat"]},
)

HORROR = CharacterTable(
    given_names=["Mara"],
    family_names=["Colter"],
    motivations=["haunted by a sibling's death"],
    traits={"temperament": ["quiet"], "quirk": ["counts steps"], "flaw": ["lies"]},
    background={"upbringing": ["grew up in a funeral home"], "family": ["an orphan"], "occupation": ["a nurse"], "turning point": ["inherited a house"]},
    looks={"build": ["gaunt"], "features": ["pale eyes"], "style": ["a black coat"]},
)


class CharacterTablesPooled(unittest.TestCase):
    def test_pools_the_entries_of_every_genre_once_each(self) -> None:
        tables = CharacterTables({"western": WESTERN, "horror": HORROR})

        pooled = tables.pooled(["western", "horror"])

        self.assertEqual(
            pooled,
            CharacterTable(
                given_names=["Wade", "Mara"],
                family_names=["Colter"],
                motivations=["owes a debt that can never be repaid", "haunted by a sibling's death"],
                traits={"temperament": ["quiet"], "quirk": ["whittles", "counts steps"], "flaw": ["drinks", "lies"]},
                background={
                    "upbringing": ["grew up on a ranch", "grew up in a funeral home"],
                    "family": ["an orphan"],
                    "occupation": ["a drover", "a nurse"],
                    "turning point": ["on the run", "inherited a house"],
                },
                looks={"build": ["lean", "gaunt"], "features": ["a broken nose", "pale eyes"], "style": ["a dusty hat", "a black coat"]},
            ),
        )


class CharacterTablesLoaded(unittest.TestCase):
    def test_has_the_tables_of_every_genre(self) -> None:
        tables = CharacterTables.loaded()

        self.assertEqual(
            tables.genres,
            [
                "contemporary",
                "cyberpunk",
                "fantasy",
                "high school drama",
                "historical",
                "horror",
                "mystery",
                "post-apocalyptic",
                "romance",
                "space opera",
                "thriller",
                "western",
            ],
        )
