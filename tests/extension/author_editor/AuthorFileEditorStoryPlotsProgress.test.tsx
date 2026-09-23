import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { AuthorFileEditorStoryPlotsProgress } from "../../../extension/webview/author_editor/AuthorFileEditorStoryPlotsProgress";
import type { StoryPlotsStep } from "../../../extension/vscode_runtime/commands/identify_story_plots";

function scoring(done: number, seconds: number): StoryPlotsStep {
    return {
        passes: 1,
        doing: "paragraphs",
        done,
        of: 400,
        seconds,
        state: "running",
    };
}

async function drawn(root: Root, steps: StoryPlotsStep[]): Promise<void> {
    await act(async () => {
        root.render(<AuthorFileEditorStoryPlotsProgress steps={steps} />);
    });
}

function timesShown(): (string | null)[] {
    return [
        ...document.querySelectorAll(
            ".author-file-editor-story-plots-step-took",
        ),
    ].map((took) => took.textContent);
}

describe("how far along the plot identification is", () => {
    it("says nothing about the time left until it has seen the work move", async () => {
        document.body.innerHTML = "";
        const container = document.createElement("div");
        document.body.append(container);
        const root = createRoot(container);

        await drawn(root, [scoring(100, 80)]);

        expect(timesShown()).toEqual(["1:20", "", "1:20", ""]);
    });

    it("reckons the time left from the rate since the work first moved", async () => {
        document.body.innerHTML = "";
        const container = document.createElement("div");
        document.body.append(container);
        const root = createRoot(container);

        await drawn(root, [scoring(100, 80)]);
        await drawn(root, [scoring(200, 160)]);

        expect(timesShown()).toEqual(["2:40", "", "2:40 / 5:20", ""]);
    });
});
