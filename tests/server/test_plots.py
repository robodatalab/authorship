import math
import unittest

from server.story_analysis.plots import story_plot_pass_level


class StoryPlotPassLevel(unittest.TestCase):
    def test_cuts_between_the_paragraphs_that_belong_and_the_ones_that_do_not(
        self,
    ) -> None:
        scores = [0.02, 0.03, 0.05, 0.04, 0.9, 0.95]

        pass_level = story_plot_pass_level(scores)

        self.assertEqual(
            [pass_level.admits(score) for score in scores],
            [False, False, False, False, True, True],
        )

    def test_a_plot_scored_low_everywhere_claims_nothing(self) -> None:
        scores = [0.01, 0.02, 0.2, 0.3]

        pass_level = story_plot_pass_level(scores)

        self.assertFalse(any(pass_level.admits(score) for score in scores))

    def test_two_clear_masses_are_better_separated_than_one_spread_out(
        self,
    ) -> None:
        two_masses = story_plot_pass_level([0.02, 0.03, 0.04, 0.05, 0.9, 0.95])
        one_mass = story_plot_pass_level([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8])

        self.assertGreater(two_masses.separation, 2 * one_mass.separation)

    def test_a_plot_every_paragraph_scores_the_same_on_claims_nothing(
        self,
    ) -> None:
        pass_level = story_plot_pass_level([0.7] * 5)

        self.assertFalse(pass_level.admits(0.7))
        self.assertEqual(pass_level.separation, 0.0)
        self.assertEqual(pass_level.log_odds, math.inf)


if __name__ == "__main__":
    unittest.main()
