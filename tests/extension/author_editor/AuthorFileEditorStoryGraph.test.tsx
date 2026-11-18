import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { Document } from "authordoc/storydoc";
import { AuthorFileEditorStoryGraph } from "../../../extension/webview/author_editor/AuthorFileEditorStoryGraph";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const THE_STORY = `<!-- cell: character id="v1" title="Varn" -->

<!-- cell: character id="d1" title="Lia" -->

<!-- cell: place id="h1" title="The house" -->

<!-- cell: place id="h2" title="The court" -->

<!-- cell: plot id="p1" title="Love" edges="x1:e1>e2" -->

<ol>
<li id="e1" timestamp="1" place="h1" characters="v1">Varn asks Lia to walk.</li>
<li id="e2" timestamp="2" place="h2" characters="v1, d1">Lia stands before the court.</li>
</ol>
`;

describe("the story graph", () => {
    async function mountTheGraph(): Promise<void> {
        document.body.innerHTML = "";
        const container = document.createElement("div");
        document.body.append(container);
        await act(async () => {
            createRoot(container).render(
                <AuthorFileEditorStoryGraph story={new Document(THE_STORY)} />,
            );
        });
    }

    it.each([
        ["Plots", ["Love"], ["Varn asks Lia to walk.", "Lia stands before the court."]],
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
});
