"""Integer ranges and what has been laid over them."""

from bisect import bisect_left, bisect_right
from collections.abc import Iterator
from dataclasses import dataclass


@dataclass
class _Span[T]:
    start: int
    end: int
    values: list[T]


class RangeDict[T]:
    """Half-open ranges `[start, end)` holding the values recorded over them.

    Assigning a value to a range adds it to every point of that range. A range
    already there that the new one only partly covers is split where they cross,
    so no range ever carries a value over some of itself and not the rest.

    A range holds everything laid over it rather than the last thing, so a range
    stands in `items()` once for each value it carries.
    """

    def __init__(self) -> None:
        self._spans: list[_Span[T]] = []

    def __setitem__(self, key: tuple[int, int], value: T) -> None:
        start, end = key
        if start >= end:
            raise ValueError(f"Empty range: ({start}, {end})")

        self._split_at(start)
        self._split_at(end)

        # Both ends now fall between spans rather than inside one, so what is
        # left is to walk from `start` to `end` writing on the spans that are
        # there and filling in what nothing covers yet.
        at = start
        index = bisect_left(self._spans, start, key=lambda span: span.start)
        while at < end:
            covering = self._spans[index] if index < len(self._spans) else None
            if covering is not None and covering.start == at:
                covering.values.append(value)
                at = covering.end
            else:
                uncovered_to = min(covering.start, end) if covering else end
                self._spans.insert(index, _Span(at, uncovered_to, [value]))
                at = uncovered_to
            index += 1

    def __getitem__(self, key: tuple[int, int]) -> list[T]:
        """Everything recorded over any part of `key`, first sighting first."""
        found: list[T] = []
        for span in self._spans_over(key):
            for value in span.values:
                if value not in found:
                    found.append(value)
        return found

    def __contains__(self, key: tuple[int, int]) -> bool:
        return next(self._spans_over(key), None) is not None

    def __iter__(self) -> Iterator[tuple[int, int]]:
        return self.keys()

    def __len__(self) -> int:
        return len(self._spans)

    def __repr__(self) -> str:
        return "; ".join(
            f"({span.start}, {span.end}) = {span.values}" for span in self._spans
        )

    def keys(self) -> Iterator[tuple[int, int]]:
        for span in self._spans:
            yield span.start, span.end

    def values(self) -> Iterator[T]:
        for span in self._spans:
            yield from span.values

    def items(self) -> Iterator[tuple[tuple[int, int], T]]:
        """Every value with the range it was found over, a range at a time."""
        for span in self._spans:
            for value in span.values:
                yield (span.start, span.end), value

    def _split_at(self, position: int) -> None:
        index = bisect_right(self._spans, position, key=lambda span: span.start) - 1
        if index < 0:
            return
        span = self._spans[index]
        if not span.start < position < span.end:
            return
        # Each half inherits the whole account of what covered the span, since
        # a value was laid over all of it before the cut was made.
        self._spans[index : index + 1] = [
            _Span(span.start, position, list(span.values)),
            _Span(position, span.end, list(span.values)),
        ]

    def _spans_over(self, key: tuple[int, int]) -> Iterator[_Span[T]]:
        start, end = key
        first = max(bisect_right(self._spans, start, key=lambda span: span.start) - 1, 0)
        for span in self._spans[first:]:
            if span.start >= end:
                return
            if span.end > start:
                yield span
