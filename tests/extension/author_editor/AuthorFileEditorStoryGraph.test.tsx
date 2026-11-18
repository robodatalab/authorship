import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { Document } from "authordoc/storydoc";
import { AuthorFileEditorStoryGraph } from "../../../extension/webview/author_editor/AuthorFileEditorStoryGraph";
import type { StoryGraphPlotNode } from "../../../extension/webview/author_editor/StoryGraphLayout";
import { StoryWordRange } from "authordoc/cells/story_word_range";
import { NO_STORY_ANNOTATION_SELECTED } from "../../../extension/vscode_runtime/story_annotation_selection";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const THE_STORY = `<!-- cell: character id="v1" title="Varn" -->

<!-- cell: character id="d1" title="Lia" -->

<!-- cell: place id="h1" title="The house" -->

<!-- cell: place id="h2" title="The court" -->

<!-- cell: plot id="p1" title="Love" edges="x1:e1>e2" -->

<ol>
<li id="e1" timestamp="1" place="h1" characters="v1" words="0-3">Varn asks Lia to walk.</li>
<li id="e2" timestamp="2" place="h2" characters="v1, d1">Lia stands before the court.</li>
</ol>

<!-- cell: plot id="p2" title="Injustice" -->

<ol>
<li id="f1" timestamp="2" place="h2" characters="d1">Lia pleads for the weavers.</li>
</ol>
`;

const THE_LOVE_LEADING_ON = `<!-- cell: plot id="p1" title="Love" edges="x1:e1>e2, x2:e2>e3" -->

<ol>
<li id="e1" timestamp="1">Varn asks Lia to walk.</li>
<li id="e2" timestamp="2">Lia stands before the court.</li>
<li id="e3" timestamp="3">Varn leaves the town.</li>
</ol>
`;

describe("the story graph", () => {
    let chosen: StoryGraphPlotNode[] = [];

    async function mountTheGraph(
        story = THE_STORY,
        plotEventSelected = NO_STORY_ANNOTATION_SELECTED,
    ): Promise<void> {
        chosen = [];
        document.body.innerHTML = "";
        const container = document.createElement("div");
        document.body.append(container);
        await act(async () => {
            createRoot(container).render(
                <AuthorFileEditorStoryGraph
                    story={new Document(story)}
                    plotEventSelected={plotEventSelected}
                    onEventChosen={(plotNode) => chosen.push(plotNode)}
                />,
            );
        });
    }

    async function click(element: Element): Promise<void> {
        await act(async () => {
            element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
    }

    it.each([
        ["Plots", ["Love", "Injustice"], ["Varn asks Lia to walk.", "Lia stands before the court.", "Lia stands before the court."]],
        ["Characters", ["Varn", "Lia"], ["Varn asks Lia to walk.", "Lia stands before the court.", "Lia stands before the court."]],
        ["Places", ["The house", "The court"], ["Varn asks Lia to walk.", "Lia stands before the court."]],
    ])("lays the events out on the rails of the %s once they are chosen", async (chosen, railsShown, eventsShown) => {
        await mountTheGraph();
        const view = [...document.querySelectorAll('[role="tab"]')].find(
            (tab) => tab.textContent === chosen,
        )!;

        await act(async () => {
            view.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const rails = [
            ...document.querySelectorAll(".author-file-editor-story-graph-rail-title"),
        ].map((rail) => rail.textContent);
        const events = [
            ...document.querySelectorAll(".author-file-editor-story-graph-event"),
        ].map((event) => event.textContent);
        expect([rails, events]).toEqual([railsShown, eventsShown]);
    });

    it("shows the plots first, with the moments along the top", async () => {
        await mountTheGraph();

        const chosen = document.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
        const moments = [
            ...document.querySelectorAll(".author-file-editor-story-graph-moment"),
        ].map((moment) => moment.textContent);
        expect([chosen, moments]).toEqual(["Plots", ["1", "2"]]);
    });

    it("draws an arrow for every way the plot leads from one event to the next", async () => {
        await mountTheGraph();

        const arrows = [
            ...document.querySelectorAll(".author-file-editor-story-graph-arrow"),
        ].map((arrow) => arrow.getAttribute("d"));
        expect(arrows).toEqual(["M 308 54 H 320 V 54 H 332"]);
    });

    it.each([
        ["the event of the plot whose rail it is on", "Plots", 2, [{ plotId: "p2", nodeId: "f1", storyWordRange: null }]],
        ["the event of the first plot that has it, off the plots' rails", "Characters", 2, [{ plotId: "p1", nodeId: "e2", storyWordRange: null }]],
        ["the words that tell it, once there are any", "Plots", 0, [{ plotId: "p1", nodeId: "e1", storyWordRange: new StoryWordRange(0, 3) }]],
    ])("chooses, once an event is clicked, %s", async (_, view, boxClicked, expected) => {
        await mountTheGraph();
        const tab = [...document.querySelectorAll('[role="tab"]')].find(
            (drawn) => drawn.textContent === view,
        )!;
        await click(tab);
        const box = document.querySelectorAll(".author-file-editor-story-graph-event")[boxClicked];

        await click(box);

        expect(chosen).toEqual(expected);
    });


    it.each([
        ["the event leading on and both arrows", "e2", ["Lia stands before the court."], ["M 308 54 H 320 V 54 H 332", "M 488 54 H 500 V 54 H 512"]],
        ["the last event and the arrow leading to it", "e3", ["Varn leaves the town."], ["M 488 54 H 500 V 54 H 512"]],
        ["nothing, once the event chosen is not in the story", "e9", [], []],
    ])("highlights, once an event of a plot is chosen, %s", async (_, nodeId, eventsHighlighted, arrowsHighlighted) => {
        await mountTheGraph(THE_LOVE_LEADING_ON, { annotationCellId: "p1", passageId: nodeId });

        const events = [
            ...document.querySelectorAll(".author-file-editor-story-graph-event-selected"),
        ].map((event) => event.textContent);
        const arrows = [
            ...document.querySelectorAll(".author-file-editor-story-graph-arrow-of-the-selected-event"),
        ].map((arrow) => arrow.getAttribute("d"));
        expect([events, arrows]).toEqual([eventsHighlighted, arrowsHighlighted]);
    });

    it("highlights an event shared by plots on the rail of each of them", async () => {
        await mountTheGraph(THE_STORY, { annotationCellId: "p2", passageId: "f1" });

        const events = [
            ...document.querySelectorAll(".author-file-editor-story-graph-event-selected"),
        ].map((event) => event.textContent);
        expect(events).toEqual(["Lia stands before the court.", "Lia stands before the court."]);
    });

    it("lays the places out as rails nested in the rails of the places they lie within", async () => {
        await mountTheGraph(
            [
                '<!-- cell: place id="hv" title="Hollowmere" parent="en" -->',
                '<!-- cell: place id="hg" title="Harrowgate" -->',
                '<!-- cell: place id="en" title="England" -->',
                '<!-- cell: place id="ln" title="The lane" parent="hv" -->',
                "",
            ].join("\n"),
        );
        await click([...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === "Places")!);

        const rails = [...document.querySelectorAll<HTMLElement>(".author-file-editor-story-graph-rail")].map(
            (rail) => [rail.textContent, rail.style.left],
        );
        expect(rails).toEqual([
            ["Harrowgate", "0px"],
            ["England", "0px"],
            ["Hollowmere", "12px"],
            ["The lane", "24px"],
        ]);
    });

});
