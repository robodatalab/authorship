import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { AuthorshipPanelStoryPlots } from "../../../extension/webview/panel/AuthorshipPanelStoryPlots";
import type {
    StoryPlot,
    StoryScene,
} from "../../../extension/vscode_runtime/commands/identify_story_plots";
import type { WorkProgress } from "../../../extension/vscode_runtime/server/jobs";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe("the plots tab", () => {
    let posted: unknown[] = [];

    async function mountStoryPlots(options: {
        storyScenes: StoryScene[] | null;
        storyPlots: StoryPlot[] | null;
        storyPlotsProgress?: WorkProgress | null;
    }): Promise<void> {
        posted = [];
        document.body.innerHTML = "";
        const container = document.createElement("div");
        document.body.append(container);
        await act(async () => {
            createRoot(container).render(
                <AuthorshipPanelStoryPlots
                    storyScenes={options.storyScenes}
                    storyPlots={options.storyPlots}
                    storyPlotsProgress={options.storyPlotsProgress ?? null}
                    sendMessagesToVscode={(message) => posted.push(message)}
                />,
            );
        });
    }

    it("says so when no manuscript is open", async () => {
        await mountStoryPlots({ storyScenes: null, storyPlots: null });

        expect(document.body.textContent).toBe("No manuscript open");
    });

    it("lists every plot with its summary", async () => {
        await mountStoryPlots({
            storyScenes: [],
            storyPlots: [
                {
                    title: "The quest",
                    characters: ["Bob", "Alice"],
                    origin: "Bob loses his ring",
                    goal: "Bob finds his ring",
                    keyEvents: ["Bob asked Alice for help"],
                },
            ],
        });

        expect(
            document.querySelector(".authorship-panel-story-plot summary")
                ?.textContent,
        ).toBe("The quest");
        expect(
            [
                ...document.querySelectorAll(".authorship-panel-story-plot dd"),
            ].map((said) => said.textContent),
        ).toEqual([
            "Bob, Alice",
            "Bob loses his ring",
            "Bob finds his ring",
            "Bob asked Alice for help",
        ]);
    });

    it("lists every scene by the lines it spans, with what holds in it", async () => {
        await mountStoryPlots({
            storyScenes: [
                {
                    firstLine: 0,
                    lastLine: 1,
                    openingLine: "She moves like a cat on the prowl.",
                    storyState: {
                        madeTrue: [
                            {
                                subject: "Kaitlyn",
                                relation: "is in",
                                object: "the dressing room",
                            },
                            {
                                subject: "Frank",
                                relation: "is doing",
                                object: "assisting Kaitlyn",
                            },
                        ],
                        madeFalse: [
                            {
                                subject: "Frank",
                                relation: "is in",
                                object: "the office",
                            },
                        ],
                    },
                    events: ["She touches the fabric."],
                },
            ],
            storyPlots: [],
        });

        expect(
            document.querySelector(".authorship-panel-story-scene summary")
                ?.textContent,
        ).toBe("Lines 1–2: She moves like a cat on the prowl.");
        expect(
            [
                ...document.querySelectorAll(
                    ".authorship-panel-story-scene dd",
                ),
            ].map((said) => said.textContent),
        ).toEqual([
            "Kaitlyn is in the dressing roomFrank is doing assisting Kaitlyn",
            "Frank is in the office",
        ]);
    });

    it("keeps the plots above the progress, each in its own drawer", async () => {
        await mountStoryPlots({
            storyScenes: [],
            storyPlots: [],
            storyPlotsProgress: {
                doing: "identify plots",
                done: 0,
                of: null,
                seconds: 20,
                secondsPerItem: null,
                state: "running",
                steps: [
                    {
                        doing: "asking whether the events share a plot",
                        done: 3,
                        of: 24,
                        seconds: 20,
                        secondsPerItem: null,
                        state: "running",
                        steps: [],
                    },
                ],
            },
        });

        expect(
            [
                ...document.querySelectorAll(
                    ".authorship-panel-story-plots-drawer > summary",
                ),
            ].map((drawer) => drawer.textContent),
        ).toEqual(["Plots", "Scenes", "Progress"]);
    });

    it("draws no progress drawer when nothing is running", async () => {
        await mountStoryPlots({ storyScenes: [], storyPlots: [] });

        expect(
            [
                ...document.querySelectorAll(
                    ".authorship-panel-story-plots-drawer > summary",
                ),
            ].map((drawer) => drawer.textContent),
        ).toEqual(["Plots", "Scenes"]);
    });

    it("asks for the plots to be identified", async () => {
        await mountStoryPlots({ storyScenes: [], storyPlots: [] });

        await act(async () => {
            document
                .querySelector(".authorship-panel-story-plots-identify")!
                .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "identifyStoryPlots",
                commandArguments: {},
            },
        ]);
    });
});
