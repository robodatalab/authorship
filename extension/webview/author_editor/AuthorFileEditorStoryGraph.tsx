import { useId, useMemo, useState } from "react";
import { CharacterCell } from "authordoc/cells/character_cell";
import { PlaceCell } from "authordoc/cells/place_cell";
import type { Document } from "authordoc/storydoc";
import { StoryGraphLayout, type StoryGraphEvent } from "./StoryGraphLayout";
import "./AuthorFileEditorStoryGraph.css";

const UNTITLED = "Untitled";
const UNTITLED_EVENT = "Untitled event";

interface AuthorFileEditorStoryGraphView {
    name: string;
    railsOf: (story: Document) => (readonly [string, string])[];
    railIdsOf: (event: StoryGraphEvent) => readonly string[];
}

const PLOTS_VIEW: AuthorFileEditorStoryGraphView = {
    name: "Plots",
    railsOf: (story) =>
        story.plots().map((plot) => [plot.uniqueId, plot.title || UNTITLED] as const),
    railIdsOf: (event) => event.plotIds,
};

const CHARACTERS_VIEW: AuthorFileEditorStoryGraphView = {
    name: "Characters",
    railsOf: (story) =>
        story.cells
            .filter((cell) => cell instanceof CharacterCell)
            .map((character) => [character.uniqueId, character.title || UNTITLED] as const),
    railIdsOf: (event) => event.characterIds,
};

const PLACES_VIEW: AuthorFileEditorStoryGraphView = {
    name: "Places",
    railsOf: (story) =>
        story.cells
            .filter((cell) => cell instanceof PlaceCell)
            .map((place) => [place.uniqueId, place.title || UNTITLED] as const),
    railIdsOf: (event) => [event.placeId],
};

const STORY_GRAPH_VIEWS = [PLOTS_VIEW, CHARACTERS_VIEW, PLACES_VIEW];

interface AuthorFileEditorStoryGraphProps {
    story: Document;
}

export function AuthorFileEditorStoryGraph({
    story,
}: AuthorFileEditorStoryGraphProps) {
    const [viewShown, showTheView] = useState(PLOTS_VIEW);
    const arrowheadId = useId();
    const layout = useMemo(() => {
        const rails = viewShown.railsOf(story);
        const laidOut = new StoryGraphLayout(story, rails, viewShown.railIdsOf);
        return laidOut;
    }, [story, viewShown]);

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
                            style={{ top: rail.top, height: rail.height }}
                        >
                            <span
                                className="author-file-editor-story-graph-rail-title"
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
                                viewBox="0 0 10 10"
                                refX="10"
                                refY="5"
                                markerWidth="6"
                                markerHeight="6"
                                orient="auto-start-reverse"
                            >
                                <path d="M 0 0 L 10 5 L 0 10 z" />
                            </marker>
                        </defs>
                        {layout.arrows.map((arrow, drawn) => (
                            <path
                                key={`${arrow.fromEventId}>${arrow.toEventId}#${drawn}`}
                                className="author-file-editor-story-graph-arrow"
                                d={arrow.path}
                                markerEnd={`url(#${arrowheadId})`}
                            />
                        ))}
                    </svg>
                    {layout.boxes.map((box) => (
                        <div
                            key={`${box.eventId}#${box.railId}`}
                            className="author-file-editor-story-graph-event"
                            style={{
                                left: box.left,
                                top: box.top,
                                width: box.width,
                                height: box.height,
                            }}
                            title={box.summary}
                        >
                            {box.summary || UNTITLED_EVENT}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
