import unittest

from server.writing_tools import grammar_check


class Typography(unittest.TestCase):
    def test_a_spaced_dash_closed_up_is_not_a_correction(self) -> None:
        self.assertEqual(
            grammar_check._apart_from_typography("after - complete"),
            grammar_check._apart_from_typography("after-complete"),
        )

    def test_an_em_dash_turned_into_a_hyphen_is_not_a_correction(self) -> None:
        self.assertEqual(
            grammar_check._apart_from_typography("after — complete"),
            grammar_check._apart_from_typography("after-complete"),
        )

    def test_a_space_put_in_front_of_a_bracket_is_not_a_correction(self) -> None:
        self.assertEqual(
            grammar_check._apart_from_typography("crossed)."),
            grammar_check._apart_from_typography("crossed )."),
        )

    def test_a_deleted_quotation_mark_is_not_a_correction(self) -> None:
        self.assertEqual(
            grammar_check._apart_from_typography('"Hello'),
            grammar_check._apart_from_typography("Hello"),
        )

    def test_a_missing_comma_is_a_correction(self) -> None:
        self.assertNotEqual(
            grammar_check._apart_from_typography("well then"),
            grammar_check._apart_from_typography("well, then"),
        )

    def test_a_missing_apostrophe_is_a_correction(self) -> None:
        # Apostrophes are left out of the set on purpose: they are quotation
        # marks only some of the time, and a missing one is a real fault.
        self.assertNotEqual(
            grammar_check._apart_from_typography("dont"),
            grammar_check._apart_from_typography("don't"),
        )


if __name__ == "__main__":
    unittest.main()
