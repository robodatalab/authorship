import random

from server.story_generator.interactive_author_story import InteractiveAuthorStory
from server.story_generator.exposure_tracker import ExposureTracker
from authordoc.cells.plot_cell import PlotEdge
from authordoc.storydoc import Document

STORY_ENDS = "The story ends here."


class StoryPlayer:
    """Plays a story scene by scene, from the beginning of the plot at
    `plot_index` among the story's plots: `get_current_scene` tells the current
    scene and its continuations, and `step` follows one of them."""

    def __init__(self, doc: Document, exposure_tracker: ExposureTracker, plot_index: int) -> None:
        self._doc = doc
        self._exposure_tracker = exposure_tracker
        self._plot_index = plot_index
        self.reset()

    def reset(self) -> None:
        """Start the story over, at the beginning of the plot the play starts from."""
        plots = self._doc.plots()
        self._followed_plot = plots[self._plot_index]
        self._current_node = self._followed_plot.nodes[0]
        # The edges of the continuations the current scene offered, in the order
        # it offered them.
        self._offered_edges: list[PlotEdge] = []

    def step(self, action: int) -> None:
        """Follow the continuation at index `action` among those the current scene
        offered when it was last told."""
        edge = self._offered_edges[action]
        self._followed_plot = self._doc.get_plot_of_edge(edge)
        self._current_node = self._followed_plot.get_node_by_id(edge.to_node_id)

    def get_current_scene(self) -> tuple[str, list[str]]:
        """The current scene as the story tells it, up to the gap its
        continuations fill, and those continuations, one for each edge leaving
        it, in a random order; where the story ends, the scene and no
        continuations. The scene's nodes count as seen by the exposure tracker."""
        story = InteractiveAuthorStory(self._doc)
        scene = story.scene_of(self._current_node)
        current_nodes = story.events_of(scene)
        self._exposure_tracker.see(current_nodes)
        outgoing_edges: list[PlotEdge] = []
        for node in current_nodes:
            plot = self._doc.get_plot_of_node(node)
            outbound = plot.outbound_edges(node)
            outgoing_edges.extend(outbound)
        # Where a continuation stands says nothing of which plot it follows.
        random.shuffle(outgoing_edges)
        self._offered_edges = outgoing_edges
        if not outgoing_edges:
            return (f"{scene.text}\n\n{STORY_ENDS}", [])
        choices = scene.options
        continuations = [choices[edge.edge_id] for edge in outgoing_edges]
        return (scene.text, continuations)

