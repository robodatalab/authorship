from collections.abc import Sequence

from authordoc.cells.plot_cell import PlotNode
from authordoc.cells.salient_concept_cell import SalientConceptCell
from authordoc.storydoc import Document
from server.story_generator.interactive_author_story import InteractiveAuthorStory


class ExposureTracker:
    """What the player was shown: every event, in the order it was shown, and so
    which salient concepts it saw. A concept is shown by the events of every plot
    that references it, in the scenes those events point at."""

    def __init__(self, doc: Document) -> None:
        self._story = InteractiveAuthorStory(doc)
        self.concepts = doc.salient_concepts()
        self.events_seen: list[PlotNode] = []

    def see(self, nodes: Sequence[PlotNode]) -> None:
        self.events_seen.extend(nodes)

    def get_events(self, concept: SalientConceptCell) -> list[PlotNode]:
        """The events that show the concept: those of every plot that references it."""
        plots = self._story.plots_of(concept)
        events = [event for plot in plots for event in plot.nodes]
        return events

    def get_seen_events(self, concept: SalientConceptCell) -> list[PlotNode]:
        """The events that show the concept and were seen."""
        seen_ids = {event.node_id for event in self.events_seen}
        events = self.get_events(concept)
        seen = [event for event in events if event.node_id in seen_ids]
        return seen

    def get_exposure(self, concept: SalientConceptCell) -> float:
        """The share of the events that show the concept that were seen; 0 for a
        concept no plot shows."""
        events = self.get_events(concept)
        if not events:
            return 0.0
        seen = self.get_seen_events(concept)
        seen_count = len(seen)
        event_count = len(events)
        exposure = seen_count / event_count
        return exposure
