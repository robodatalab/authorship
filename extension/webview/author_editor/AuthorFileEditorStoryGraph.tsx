import { useId, useMemo, useState } from "react";
import { CharacterCell } from "authordoc/cells/character_cell";
import { DepthFirstPlacesIterator } from "authordoc/iterators/depth_first_places_iterator";
import type { Document } from "authordoc/storydoc";
import type { StoryAnnotationSelected } from "../../vscode_runtime/story_annotation_selection";
import {
    StoryGraphLayout,
    type StoryGraphBox,
    type StoryGraphEvent,
    type StoryGraphPlotNode,
} from "./StoryGraphLayout";
import "./AuthorFileEditorStoryGraph.css";

const UNTITLED = "Untitled";
const UNTITLED_EVENT = "Untitled event";

interface AuthorFileEditorStoryGraphView {
    name: string;
    railsOf: (story: Document) => (readonly [string, string, number])[];
    railIdsOf: (event: StoryGraphEvent) => readonly string[];
}

const PLOTS_VIEW: AuthorFileEditorStoryGraphView = {
    name: "Plots",
    railsOf: (story) =>
        story.plots().map((plot) => [plot.uniqueId, plot.title || UNTITLED, 0] as const),
    railIdsOf: (event) => event.plotIds,
};

const CHARACTERS_VIEW: AuthorFileEditorStoryGraphView = {
    name: "Characters",
    railsOf: (story) =>
        story.cells
            .filter((cell) => cell instanceof CharacterCell)
            .map((character) => [character.uniqueId, character.title || UNTITLED, 0] as const),
    railIdsOf: (event) => event.characterIds,
};

function railsOfTheNestedPlaces(story: Document): (readonly [string, string, number])[] {
    const topLevelPlaces = story.places();
    const rails: (readonly [string, string, number])[] = [];
    for (const place of topLevelPlaces) {
        rails.push([place.uniqueId, place.title || UNTITLED, 0]);
        const placesWithin = new DepthFirstPlacesIterator(story, place);
        for (const nested of placesWithin) {
            const depth = nested.ancestors(story).length;
            rails.push([nested.uniqueId, nested.title || UNTITLED, depth]);
        }
    }
    return rails;
}

const PLACES_VIEW: AuthorFileEditorStoryGraphView = {
    name: "Places",
    railsOf: railsOfTheNestedPlaces,
    railIdsOf: (event) => [event.placeId],
};

const STORY_GRAPH_VIEWS = [PLOTS_VIEW, CHARACTERS_VIEW, PLACES_VIEW];

interface AuthorFileEditorStoryGraphProps {
    story: Document;
    plotEventSelected: StoryAnnotationSelected;
    onEventChosen: (plotNode: StoryGraphPlotNode) => void;
}

export function AuthorFileEditorStoryGraph({
    story,
    plotEventSelected,
    onEventChosen,
}: AuthorFileEditorStoryGraphProps) {
    const [viewShown, showTheView] = useState(PLOTS_VIEW);
    const arrowheadId = useId();
    const arrowheadOfTheSelectedEventId = useId();
    const layout = useMemo(() => {
        const rails = viewShown.railsOf(story);
        const laidOut = new StoryGraphLayout(story, rails, viewShown.railIdsOf);
        return laidOut;
    }, [story, viewShown]);
    const eventSelected = layout.events.find((event) =>
        event.plotNodes.some(
            (plotNode) =>
                plotNode.plotId === plotEventSelected.annotationCellId &&
                plotNode.nodeId === plotEventSelected.passageId,
        ),
    );
    const eventIdSelected = eventSelected?.eventId ?? null;
    const arrowsOfTheSelectedEvent = layout.arrows.filter(
        (arrow) =>
            arrow.fromEventId === eventIdSelected || arrow.toEventId === eventIdSelected,
    );
    const arrowsOfOtherEvents = layout.arrows.filter(
        (arrow) => !arrowsOfTheSelectedEvent.includes(arrow),
    );

    function chooseTheEvent(box: StoryGraphBox): void {
        const event = layout.events.find((laidOut) => laidOut.eventId === box.eventId)!;
        const [firstPlotNode] = event.plotNodes;
        const plotNodeOfTheRail = event.plotNodes.find(
            (plotNode) => plotNode.plotId === box.railId,
        );
        onEventChosen(plotNodeOfTheRail ?? firstPlotNode);
    }

    return (
        <div className="author-file-editor-story-graph">
            <div className="author-file-editor-story-graph-views" role="tablist">
                {STORY_GRAPH_VIEWS.map((view) => (
                    <button
                        key={view.name}
                        type="button"
                        role="tab"
                        className="author-file-editor-story-graph-view"
                        aria-selected={view === viewShown}
                        onClick={() => showTheView(view)}
                    >
                        {view.name}
                    </button>
                ))}
            </div>
            <div className="author-file-editor-story-graph-chart">
                <div
                    className="author-file-editor-story-graph-drawn"
                    style={{ width: layout.width, height: layout.height }}
                >
                    {layout.columns.map((column) => (
                        <span
                            key={column.middle}
                            className="author-file-editor-story-graph-moment"
                            style={{ left: column.middle }}
                        >
                            {column.momentWritten}
                        </span>
                    ))}
                    {layout.rails.map((rail) => (
                        <div
                            key={rail.railId}
                            className="author-file-editor-story-graph-rail"
                            style={{
                                left: rail.left,
                                top: rail.top,
                                height: rail.enclosedHeight,
                            }}
                        >
                            <span
                                className="author-file-editor-story-graph-rail-title"
                                style={{
                                    top: rail.height / 2,
                                    width: rail.titleWidth,
                                }}
                                title={rail.title}
                            >
                                {rail.title}
                            </span>
                        </div>
                    ))}
                    <svg
                        className="author-file-editor-story-graph-arrows"
                        width={layout.width}
                        height={layout.height}
                    >
                        <defs>
                            <marker
                                id={arrowheadId}
                                className="author-file-editor-story-graph-arrowhead"
                                viewBox="0 0 10 10"
                                refX="10"
                                refY="5"
                                markerWidth="6"
                                markerHeight="6"
                                orient="auto-start-reverse"
                            >
                                <path d="M 0 0 L 10 5 L 0 10 z" />
                            </marker>
                            <marker
                                id={arrowheadOfTheSelectedEventId}
                                className="author-file-editor-story-graph-arrowhead-of-the-selected-event"
                                viewBox="0 0 10 10"
                                refX="10"
                                refY="5"
                                markerWidth="4"
                                markerHeight="4"
                                orient="auto-start-reverse"
                            >
                                <path d="M 0 0 L 10 5 L 0 10 z" />
                            </marker>
                        </defs>
                        {arrowsOfOtherEvents.map((arrow, drawn) => (
                            <path
                                key={`${arrow.fromEventId}>${arrow.toEventId}#${drawn}`}
                                className="author-file-editor-story-graph-arrow"
                                d={arrow.path}
                                markerEnd={`url(#${arrowheadId})`}
                            />
                        ))}
                        {arrowsOfTheSelectedEvent.map((arrow, drawn) => (
                            <path
                                key={`${arrow.fromEventId}>${arrow.toEventId}#${drawn}`}
                                className="author-file-editor-story-graph-arrow author-file-editor-story-graph-arrow-of-the-selected-event"
                                d={arrow.path}
                                markerEnd={`url(#${arrowheadOfTheSelectedEventId})`}
                            />
                        ))}
                    </svg>
                    {layout.boxes.map((box) => (
                        <button
                            key={`${box.eventId}#${box.railId}`}
                            type="button"
                            className={
                                box.eventId === eventIdSelected
                                    ? "author-file-editor-story-graph-event author-file-editor-story-graph-event-selected"
                                    : "author-file-editor-story-graph-event"
                            }
                            style={{
                                left: box.left,
                                top: box.top,
                                width: box.width,
                                height: box.height,
                            }}
                            title={box.summary}
                            onClick={() => chooseTheEvent(box)}
                        >
                            {box.summary || UNTITLED_EVENT}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
