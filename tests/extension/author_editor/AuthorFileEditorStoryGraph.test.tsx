import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { Document } from "authordoc/storydoc";
import { AuthorFileEditorStoryGraph } from "../../../extension/webview/author_editor/AuthorFileEditorStoryGraph";
import type { StoryGraphPlotNode } from "../../../extension/webview/author_editor/StoryGraphLayout";
import { StoryWordRange } from "authordoc/cells/story_word_range";

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

describe("the story graph", () => {
    let chosen: StoryGraphPlotNode[] = [];

    async function mountTheGraph(): Promise<void> {
        chosen = [];
        document.body.innerHTML = "";
        const container = document.createElement("div");
        document.body.append(container);
        await act(async () => {
            createRoot(container).render(
                <AuthorFileEditorStoryGraph
                    story={new Document(THE_STORY)}
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

});
