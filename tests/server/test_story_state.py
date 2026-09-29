import unittest

from parameterized import parameterized  # type: ignore

from server.models.story_state import StoryFact, StoryState


class StoryStatesAlgebra(unittest.TestCase):

    @parameterized.expand([
        (
            "nothing_to_nothing",
            StoryState(),
            StoryState(),
            StoryState(),
        ),
        (
            "a_change_to_nothing",
            StoryState(),
            StoryState(
                made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")}),
                made_false=frozenset({StoryFact("frank", "works for", "kaitlyn")}),
            ),
            StoryState(
                made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")}),
                made_false=frozenset({StoryFact("frank", "works for", "kaitlyn")}),
            ),
        ),
        (
            "nothing_to_a_change",
            StoryState(
                made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")}),
                made_false=frozenset({StoryFact("frank", "works for", "kaitlyn")}),
            ),
            StoryState(),
            StoryState(
                made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")}),
                made_false=frozenset({StoryFact("frank", "works for", "kaitlyn")}),
            ),
        ),
        (
            "unrelated_facts_made_true",
            StoryState(made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")})),
            StoryState(made_true=frozenset({StoryFact("frank", "holds", "bottle")})),
            StoryState(
                made_true=frozenset(
                    {
                        StoryFact("frank", "has met", "kaitlyn"),
                        StoryFact("frank", "holds", "bottle"),
                    }
                )
            ),
        ),
        (
            "unrelated_facts_made_false",
            StoryState(made_false=frozenset({StoryFact("frank", "candidate of", "kaitlyn")})),
            StoryState(made_false=frozenset({StoryFact("kaitlyn", "owns", "frank")})),
            StoryState(
                made_false=frozenset(
                    {
                        StoryFact("frank", "candidate of", "kaitlyn"),
                        StoryFact("kaitlyn", "owns", "frank"),
                    }
                )
            ),
        ),
        (
            "the_later_ends_what_the_earlier_made_true",
            StoryState(made_true=frozenset({StoryFact("frank", "candidate of", "kaitlyn")})),
            StoryState(made_false=frozenset({StoryFact("frank", "candidate of", "kaitlyn")})),
            StoryState(made_false=frozenset({StoryFact("frank", "candidate of", "kaitlyn")})),
        ),
        (
            "the_later_restores_what_the_earlier_ended",
            StoryState(made_false=frozenset({StoryFact("frank", "works for", "kaitlyn")})),
            StoryState(made_true=frozenset({StoryFact("frank", "works for", "kaitlyn")})),
            StoryState(made_true=frozenset({StoryFact("frank", "works for", "kaitlyn")})),
        ),
        (
            "the_later_repeats_what_the_earlier_made_true",
            StoryState(made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")})),
            StoryState(made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")})),
            StoryState(made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")})),
        ),
        (
            "the_later_repeats_what_the_earlier_ended",
            StoryState(made_false=frozenset({StoryFact("frank", "works for", "kaitlyn")})),
            StoryState(made_false=frozenset({StoryFact("frank", "works for", "kaitlyn")})),
            StoryState(made_false=frozenset({StoryFact("frank", "works for", "kaitlyn")})),
        ),
        (
            "facts_differing_only_in_subject_stay_apart",
            StoryState(made_true=frozenset({StoryFact("frank", "holds", "bottle")})),
            StoryState(made_false=frozenset({StoryFact("the maitress", "holds", "bottle")})),
            StoryState(
                made_true=frozenset({StoryFact("frank", "holds", "bottle")}),
                made_false=frozenset({StoryFact("the maitress", "holds", "bottle")}),
            ),
        ),
        (
            "facts_differing_only_in_relation_stay_apart",
            StoryState(made_true=frozenset({StoryFact("frank", "works for", "kaitlyn")})),
            StoryState(made_false=frozenset({StoryFact("frank", "has met", "kaitlyn")})),
            StoryState(
                made_true=frozenset({StoryFact("frank", "works for", "kaitlyn")}),
                made_false=frozenset({StoryFact("frank", "has met", "kaitlyn")}),
            ),
        ),
        (
            "facts_differing_only_in_object_stay_apart",
            StoryState(made_true=frozenset({StoryFact("frank", "works for", "kaitlyn")})),
            StoryState(made_false=frozenset({StoryFact("frank", "works for", "the firm")})),
            StoryState(
                made_true=frozenset({StoryFact("frank", "works for", "kaitlyn")}),
                made_false=frozenset({StoryFact("frank", "works for", "the firm")}),
            ),
        ),
        (
            "the_later_swaps_what_is_true_and_false",
            StoryState(
                made_true=frozenset({StoryFact("frank", "works for", "kaitlyn")}),
                made_false=frozenset({StoryFact("frank", "candidate of", "kaitlyn")}),
            ),
            StoryState(
                made_true=frozenset({StoryFact("frank", "candidate of", "kaitlyn")}),
                made_false=frozenset({StoryFact("frank", "works for", "kaitlyn")}),
            ),
            StoryState(
                made_true=frozenset({StoryFact("frank", "candidate of", "kaitlyn")}),
                made_false=frozenset({StoryFact("frank", "works for", "kaitlyn")}),
            ),
        ),
        (
            "hiring_after_the_interview",
            StoryState(
                made_true=frozenset(
                    {
                        StoryFact("frank", "has met", "kaitlyn"),
                        StoryFact("frank", "candidate of", "kaitlyn"),
                    }
                )
            ),
            StoryState(
                made_true=frozenset({StoryFact("frank", "works for", "kaitlyn")}),
                made_false=frozenset({StoryFact("frank", "candidate of", "kaitlyn")}),
            ),
            StoryState(
                made_true=frozenset(
                    {
                        StoryFact("frank", "has met", "kaitlyn"),
                        StoryFact("frank", "works for", "kaitlyn"),
                    }
                ),
                made_false=frozenset({StoryFact("frank", "candidate of", "kaitlyn")}),
            ),
        ),
        (
            "some_facts_kept_some_ended_some_restored_some_new",
            StoryState(
                made_true=frozenset(
                    {
                        StoryFact("frank", "has met", "kaitlyn"),
                        StoryFact("frank", "works for", "kaitlyn"),
                        StoryFact("frank", "holds", "bottle"),
                    }
                ),
                made_false=frozenset({StoryFact("frank", "candidate of", "kaitlyn")}),
            ),
            StoryState(
                made_true=frozenset(
                    {
                        StoryFact("kaitlyn", "owns", "frank"),
                        StoryFact("frank", "candidate of", "kaitlyn"),
                    }
                ),
                made_false=frozenset(
                    {
                        StoryFact("frank", "holds", "bottle"),
                        StoryFact("frank", "works for", "the firm"),
                    }
                ),
            ),
            StoryState(
                made_true=frozenset(
                    {
                        StoryFact("frank", "has met", "kaitlyn"),
                        StoryFact("frank", "works for", "kaitlyn"),
                        StoryFact("kaitlyn", "owns", "frank"),
                        StoryFact("frank", "candidate of", "kaitlyn"),
                    }
                ),
                made_false=frozenset(
                    {
                        StoryFact("frank", "holds", "bottle"),
                        StoryFact("frank", "works for", "the firm"),
                    }
                ),
            ),
        ),
    ])
    def test_adds_the_later_change_on_top_of_the_earlier(
        self, _, earlier, later, expected_state
    ) -> None:
        self.assertEqual(earlier + later, expected_state)

    @parameterized.expand([
        (
            "interview_hiring_shopping",
            StoryState(
                made_true=frozenset(
                    {
                        StoryFact("frank", "has met", "kaitlyn"),
                        StoryFact("frank", "candidate of", "kaitlyn"),
                    }
                )
            ),
            StoryState(
                made_true=frozenset({StoryFact("frank", "works for", "kaitlyn")}),
                made_false=frozenset({StoryFact("frank", "candidate of", "kaitlyn")}),
            ),
            StoryState(made_true=frozenset({StoryFact("frank", "holds", "bottle")})),
            StoryState(
                made_true=frozenset(
                    {
                        StoryFact("frank", "has met", "kaitlyn"),
                        StoryFact("frank", "works for", "kaitlyn"),
                        StoryFact("frank", "holds", "bottle"),
                    }
                ),
                made_false=frozenset({StoryFact("frank", "candidate of", "kaitlyn")}),
            ),
        ),
        (
            "made_true_ended_restored",
            StoryState(made_true=frozenset({StoryFact("frank", "works for", "kaitlyn")})),
            StoryState(made_false=frozenset({StoryFact("frank", "works for", "kaitlyn")})),
            StoryState(made_true=frozenset({StoryFact("frank", "works for", "kaitlyn")})),
            StoryState(made_true=frozenset({StoryFact("frank", "works for", "kaitlyn")})),
        ),
        (
            "ended_restored_ended",
            StoryState(made_false=frozenset({StoryFact("frank", "works for", "kaitlyn")})),
            StoryState(made_true=frozenset({StoryFact("frank", "works for", "kaitlyn")})),
            StoryState(made_false=frozenset({StoryFact("frank", "works for", "kaitlyn")})),
            StoryState(made_false=frozenset({StoryFact("frank", "works for", "kaitlyn")})),
        ),
        (
            "a_change_between_nothings",
            StoryState(),
            StoryState(made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")})),
            StoryState(),
            StoryState(made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")})),
        ),
        (
            "each_change_undoes_part_of_the_previous_one",
            StoryState(
                made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")}),
                made_false=frozenset({StoryFact("kaitlyn", "owns", "frank")}),
            ),
            StoryState(
                made_true=frozenset({StoryFact("kaitlyn", "owns", "frank")}),
                made_false=frozenset({StoryFact("frank", "has met", "kaitlyn")}),
            ),
            StoryState(
                made_true=frozenset(
                    {
                        StoryFact("frank", "has met", "kaitlyn"),
                        StoryFact("frank", "holds", "bottle"),
                    }
                )
            ),
            StoryState(
                made_true=frozenset(
                    {
                        StoryFact("kaitlyn", "owns", "frank"),
                        StoryFact("frank", "has met", "kaitlyn"),
                        StoryFact("frank", "holds", "bottle"),
                    }
                )
            ),
        ),
    ])
    def test_the_sum_is_the_same_however_the_changes_are_grouped(
        self, _, first, second, third, expected_state
    ) -> None:
        self.assertEqual((first + second) + third, expected_state)
        self.assertEqual(first + (second + third), expected_state)


    @parameterized.expand([
        (
            "nothing_from_nothing",
            StoryState(),
            StoryState(),
            StoryState(),
        ),
        (
            "nothing_from_a_story",
            StoryState(
                made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")}),
                made_false=frozenset({StoryFact("frank", "works for", "kaitlyn")}),
            ),
            StoryState(),
            StoryState(
                made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")}),
                made_false=frozenset({StoryFact("frank", "works for", "kaitlyn")}),
            ),
        ),
        (
            "a_story_from_itself",
            StoryState(
                made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")}),
                made_false=frozenset({StoryFact("frank", "works for", "kaitlyn")}),
            ),
            StoryState(
                made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")}),
                made_false=frozenset({StoryFact("frank", "works for", "kaitlyn")}),
            ),
            StoryState(),
        ),
        (
            "the_added_text_makes_a_new_fact_true",
            StoryState(
                made_true=frozenset(
                    {
                        StoryFact("frank", "has met", "kaitlyn"),
                        StoryFact("frank", "holds", "bottle"),
                    }
                )
            ),
            StoryState(made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")})),
            StoryState(made_true=frozenset({StoryFact("frank", "holds", "bottle")})),
        ),
        (
            "the_added_text_ends_a_fact",
            StoryState(
                made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")}),
                made_false=frozenset({StoryFact("frank", "candidate of", "kaitlyn")}),
            ),
            StoryState(
                made_true=frozenset(
                    {
                        StoryFact("frank", "has met", "kaitlyn"),
                        StoryFact("frank", "candidate of", "kaitlyn"),
                    }
                )
            ),
            StoryState(made_false=frozenset({StoryFact("frank", "candidate of", "kaitlyn")})),
        ),
        (
            "the_added_text_restores_an_ended_fact",
            StoryState(made_true=frozenset({StoryFact("frank", "works for", "kaitlyn")})),
            StoryState(made_false=frozenset({StoryFact("frank", "works for", "kaitlyn")})),
            StoryState(made_true=frozenset({StoryFact("frank", "works for", "kaitlyn")})),
        ),
        (
            "the_added_text_ends_a_fact_never_mentioned",
            StoryState(
                made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")}),
                made_false=frozenset({StoryFact("kaitlyn", "owns", "frank")}),
            ),
            StoryState(made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")})),
            StoryState(made_false=frozenset({StoryFact("kaitlyn", "owns", "frank")})),
        ),
        (
            "the_hiring_added_to_the_interview",
            StoryState(
                made_true=frozenset(
                    {
                        StoryFact("frank", "has met", "kaitlyn"),
                        StoryFact("frank", "works for", "kaitlyn"),
                    }
                ),
                made_false=frozenset({StoryFact("frank", "candidate of", "kaitlyn")}),
            ),
            StoryState(
                made_true=frozenset(
                    {
                        StoryFact("frank", "has met", "kaitlyn"),
                        StoryFact("frank", "candidate of", "kaitlyn"),
                    }
                )
            ),
            StoryState(
                made_true=frozenset({StoryFact("frank", "works for", "kaitlyn")}),
                made_false=frozenset({StoryFact("frank", "candidate of", "kaitlyn")}),
            ),
        ),
        (
            "some_facts_kept_some_ended_some_restored_some_new",
            StoryState(
                made_true=frozenset(
                    {
                        StoryFact("frank", "has met", "kaitlyn"),
                        StoryFact("frank", "works for", "kaitlyn"),
                        StoryFact("kaitlyn", "owns", "frank"),
                        StoryFact("frank", "candidate of", "kaitlyn"),
                    }
                ),
                made_false=frozenset(
                    {
                        StoryFact("frank", "holds", "bottle"),
                        StoryFact("frank", "works for", "the firm"),
                    }
                ),
            ),
            StoryState(
                made_true=frozenset(
                    {
                        StoryFact("frank", "has met", "kaitlyn"),
                        StoryFact("frank", "works for", "kaitlyn"),
                        StoryFact("frank", "holds", "bottle"),
                    }
                ),
                made_false=frozenset({StoryFact("frank", "candidate of", "kaitlyn")}),
            ),
            StoryState(
                made_true=frozenset(
                    {
                        StoryFact("kaitlyn", "owns", "frank"),
                        StoryFact("frank", "candidate of", "kaitlyn"),
                    }
                ),
                made_false=frozenset(
                    {
                        StoryFact("frank", "holds", "bottle"),
                        StoryFact("frank", "works for", "the firm"),
                    }
                ),
            ),
        ),
    ])
    def test_leaves_what_the_longer_story_changed_beyond_the_shorter(
        self, _, longer, shorter, expected_change
    ) -> None:
        self.assertEqual(longer - shorter, expected_change)

    @parameterized.expand([
        (
            "nothing_added",
            StoryState(made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")})),
            StoryState(made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")})),
        ),
        (
            "a_new_fact_made_true",
            StoryState(made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")})),
            StoryState(
                made_true=frozenset(
                    {
                        StoryFact("frank", "has met", "kaitlyn"),
                        StoryFact("frank", "holds", "bottle"),
                    }
                )
            ),
        ),
        (
            "a_fact_ended",
            StoryState(
                made_true=frozenset(
                    {
                        StoryFact("frank", "has met", "kaitlyn"),
                        StoryFact("frank", "candidate of", "kaitlyn"),
                    }
                )
            ),
            StoryState(
                made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")}),
                made_false=frozenset({StoryFact("frank", "candidate of", "kaitlyn")}),
            ),
        ),
        (
            "an_ended_fact_restored",
            StoryState(made_false=frozenset({StoryFact("frank", "works for", "kaitlyn")})),
            StoryState(made_true=frozenset({StoryFact("frank", "works for", "kaitlyn")})),
        ),
        (
            "a_fact_never_mentioned_ended",
            StoryState(made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")})),
            StoryState(
                made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")}),
                made_false=frozenset({StoryFact("kaitlyn", "owns", "frank")}),
            ),
        ),
        (
            "some_facts_kept_some_ended_some_restored_some_new",
            StoryState(
                made_true=frozenset(
                    {
                        StoryFact("frank", "has met", "kaitlyn"),
                        StoryFact("frank", "works for", "kaitlyn"),
                        StoryFact("frank", "holds", "bottle"),
                    }
                ),
                made_false=frozenset({StoryFact("frank", "candidate of", "kaitlyn")}),
            ),
            StoryState(
                made_true=frozenset(
                    {
                        StoryFact("frank", "has met", "kaitlyn"),
                        StoryFact("frank", "works for", "kaitlyn"),
                        StoryFact("kaitlyn", "owns", "frank"),
                        StoryFact("frank", "candidate of", "kaitlyn"),
                    }
                ),
                made_false=frozenset(
                    {
                        StoryFact("frank", "holds", "bottle"),
                        StoryFact("frank", "works for", "the firm"),
                    }
                ),
            ),
        ),
    ])
    def test_adding_the_difference_to_the_shorter_story_gives_the_longer(
        self, _, shorter, longer
    ) -> None:
        self.assertEqual(shorter + (longer - shorter), longer)


if __name__ == "__main__":
    unittest.main()
