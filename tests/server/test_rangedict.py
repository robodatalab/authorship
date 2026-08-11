import unittest

from parameterized import parameterized  # type: ignore

from server.rangedict import RangeDict


class RangeDictTests(unittest.TestCase):

    def test_a_range_on_an_empty_dict(self):
        ranges = RangeDict()
        ranges[0, 5] = 1
        self.assertEqual(repr(ranges), "(0, 5) = [1]")

    def test_a_range_taken_out_of_the_middle_of_another(self):
        ranges = RangeDict()
        ranges[0, 5] = 1
        ranges[1, 2] = 2
        self.assertEqual(repr(ranges), "(0, 1) = [1]; (1, 2) = [1, 2]; (2, 5) = [1]")

    def test_a_range_that_touches_nothing(self):
        ranges = RangeDict()
        ranges[0, 5] = 1
        ranges[1, 2] = 2
        ranges[7, 8] = 3
        self.assertEqual(
            repr(ranges),
            "(0, 1) = [1]; (1, 2) = [1, 2]; (2, 5) = [1]; (7, 8) = [3]",
        )

    def test_a_range_running_off_the_end_of_another(self):
        ranges = RangeDict()
        ranges[0, 5] = 1
        ranges[4, 8] = 2
        self.assertEqual(repr(ranges), "(0, 4) = [1]; (4, 5) = [1, 2]; (5, 8) = [2]")

    def test_a_range_running_up_to_the_start_of_another(self):
        ranges = RangeDict()
        ranges[4, 8] = 1
        ranges[0, 5] = 2
        self.assertEqual(repr(ranges), "(0, 4) = [2]; (4, 5) = [1, 2]; (5, 8) = [1]")

    def test_a_range_swallowing_another_whole(self):
        ranges = RangeDict()
        ranges[2, 4] = 1
        ranges[0, 6] = 2
        self.assertEqual(repr(ranges), "(0, 2) = [2]; (2, 4) = [1, 2]; (4, 6) = [2]")

    def test_a_range_crossing_several_others_and_the_gaps_between_them(self):
        ranges = RangeDict()
        ranges[0, 2] = 1
        ranges[4, 6] = 2
        ranges[1, 5] = 3
        self.assertEqual(
            repr(ranges),
            "(0, 1) = [1]; (1, 2) = [1, 3]; (2, 4) = [3]; (4, 5) = [2, 3]; (5, 6) = [2]",
        )

    def test_the_same_range_assigned_twice(self):
        ranges = RangeDict()
        ranges[0, 5] = 1
        ranges[0, 5] = 2
        self.assertEqual(repr(ranges), "(0, 5) = [1, 2]")

    def test_the_same_value_laid_over_a_range_twice(self):
        ranges = RangeDict()
        ranges[0, 5] = 1
        ranges[1, 2] = 1
        self.assertEqual(repr(ranges), "(0, 1) = [1]; (1, 2) = [1, 1]; (2, 5) = [1]")

    def test_a_split_of_a_range_that_was_already_split(self):
        ranges = RangeDict()
        ranges[0, 8] = 1
        ranges[2, 6] = 2
        ranges[3, 5] = 3
        self.assertEqual(
            repr(ranges),
            "(0, 2) = [1]; (2, 3) = [1, 2]; (3, 5) = [1, 2, 3]; "
            "(5, 6) = [1, 2]; (6, 8) = [1]",
        )

    @parameterized.expand(
        [
            ("the whole of it", (0, 5), [1, 2]),
            ("one span of it", (1, 2), [1, 2]),
            ("a point inside a span", (3, 4), [1]),
            ("a part reaching past the end", (4, 9), [1]),
            ("nothing recorded there", (7, 9), []),
            ("the edge a range stops at", (5, 6), []),
        ]
    )
    def test_reading_what_covers_a_range(self, _name, key, expected):
        ranges = RangeDict()
        ranges[0, 5] = 1
        ranges[1, 2] = 2
        self.assertEqual(ranges[key], expected)

    @parameterized.expand(
        [
            ("a range that is covered", (0, 5), True),
            ("a range overlapping one that is", (4, 9), True),
            ("a range past everything", (7, 9), False),
            ("the edge a range stops at", (5, 6), False),
        ]
    )
    def test_whether_a_range_is_covered(self, _name, key, expected):
        ranges = RangeDict()
        ranges[0, 5] = 1
        self.assertEqual(key in ranges, expected)

    def test_walking_the_ranges(self):
        ranges = RangeDict()
        ranges[0, 5] = 1
        ranges[1, 2] = 2
        self.assertEqual(
            list(ranges), [((0, 1), [1]), ((1, 2), [1, 2]), ((2, 5), [1])]
        )
        self.assertEqual(len(ranges), 3)

    def test_an_empty_dict(self):
        ranges = RangeDict()
        self.assertEqual(repr(ranges), "")
        self.assertEqual(len(ranges), 0)
        self.assertEqual(list(ranges), [])
        self.assertEqual(ranges[0, 5], [])

    @parameterized.expand(
        [
            ("a range that ends where it starts", (3, 3)),
            ("a range that ends before it starts", (5, 3)),
        ]
    )
    def test_a_range_holding_nothing_is_refused(self, _name, key):
        ranges = RangeDict()
        with self.assertRaises(ValueError):
            ranges[key] = 1

    def test_negative_ranges(self):
        ranges = RangeDict()
        ranges[-5, 0] = 1
        ranges[-3, 3] = 2
        self.assertEqual(
            repr(ranges), "(-5, -3) = [1]; (-3, 0) = [1, 2]; (0, 3) = [2]"
        )


if __name__ == "__main__":
    unittest.main()
