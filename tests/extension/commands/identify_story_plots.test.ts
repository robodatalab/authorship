import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IdentifyStoryPlotsCommand } from "../../../extension/vscode_runtime/commands/identify_story_plots";
import {
    forgetWhatTheEditorDid,
    sentToThePage,
    storyOfThreeCells,
} from "./open_story";

const THE_DOOR = {
    cellId: "c2",
    startCharacterOffsetInCell: 0,
    endCharacterOffsetInCell: 17,
    wordsInTheCell: "She saw the door.",
    isVisible: true,
    storyPlotIndices: [0],
};

const THE_QUEST = { title: "The quest", summary: "Someone goes looking." };

beforeEach(forgetWhatTheEditorDid);
afterEach(() => vi.unstubAllGlobals());

describe("IdentifyStoryPlotsCommand — finds the plots the story weaves", () => {
    it("hands the page the plots and the paragraphs that belong to them", async () => {
        const asked: string[] = [];
        vi.stubGlobal("fetch", (url: string) => {
            asked.push(url);
            return Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve(
                        url.includes("status")
                            ? {
                                  running: false,
                                  error: null,
                                  storyPlots: [THE_QUEST],
                                  paragraphsInStoryPlots: [THE_DOOR],
                              }
                            : { id: "job-1" },
                    ),
            });
        });

        await new IdentifyStoryPlotsCommand().invoke(storyOfThreeCells());

        expect(asked[0]).toContain("/analyze/plots");
        expect(asked[1]).toContain("/analyze/plots/status?id=job-1");
        expect(sentToThePage).toEqual([
            {
                type: "storyPlots",
                storyPlotsAreShown: false,
                storyPlots: [THE_QUEST],
                paragraphsInStoryPlots: [THE_DOOR],
            },
        ]);
    });
});
