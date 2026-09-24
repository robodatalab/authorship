import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IdentifyStoryPlotsCommand } from "../../../extension/vscode_runtime/commands/identify_story_plots";
import { shownMessages } from "../vscode";
import {
    forgetWhatTheEditorDid,
    sentToThePage,
    storyOfThreeCells,
    STORY_FILE,
} from "./open_story";

const THE_DOOR = {
    cellId: "c2",
    startCharacterOffsetInCell: 0,
    endCharacterOffsetInCell: 17,
    wordsInTheCell: "She saw the door.",
    isVisible: true,
    storyPlotIndices: [0],
};

const THE_QUEST = {
    title: "The quest",
    characters: ["Bob"],
    origin: "Bob loses his ring",
    goal: "Bob finds his ring",
    keyEvents: [],
};

function serverAnswers(...jobs: Record<string, unknown>[]): {
    url: string;
    body: unknown;
}[] {
    const asked: { url: string; body: unknown }[] = [];
    const answers = [...jobs];
    vi.stubGlobal("fetch", (url: string, sent?: { body: string }) => {
        asked.push({ url, body: sent?.body && JSON.parse(sent.body) });
        return Promise.resolve({
            ok: true,
            json: () =>
                Promise.resolve(
                    url.includes("status")
                        ? {
                              running: false,
                              error: null,
                              unauthorized: false,
                              noQuota: false,
                              storyPlots: [],
                              paragraphsInStoryPlots: [],
                              ...(answers.length > 1
                                  ? answers.shift()
                                  : answers[0]),
                          }
                        : { id: "job-1" },
                ),
        });
    });
    return asked;
}

beforeEach(forgetWhatTheEditorDid);
afterEach(() => vi.unstubAllGlobals());

describe("IdentifyStoryPlotsCommand — finds the plots the story weaves", () => {
    it("sends the document with the key and hands the page what came back", async () => {
        const asked = serverAnswers({
            storyPlots: [THE_QUEST],
            paragraphsInStoryPlots: [THE_DOOR],
        });
        const session = storyOfThreeCells();

        await new IdentifyStoryPlotsCommand().invoke(session);

        expect(asked[0].url).toContain("/analyze/plots");
        expect(asked[0].body).toEqual({
            path: STORY_FILE,
            text: session.document.text,
        });
        expect(asked[1].url).toContain("/analyze/plots/status?id=job-1");
        expect(sentToThePage).toEqual([
            expect.objectContaining({
                type: "storyPlots",
                storyPlotsAreShown: false,
                storyPlots: [],
                paragraphsInStoryPlots: [],
            }),
            expect.objectContaining({
                type: "storyPlots",
                storyPlotsAreShown: false,
                storyPlots: [THE_QUEST],
                paragraphsInStoryPlots: [THE_DOOR],
            }),
            expect.objectContaining({
                type: "storyPlots",
                storyPlotsAreShown: false,
                storyPlots: [THE_QUEST],
                paragraphsInStoryPlots: [THE_DOOR],
            }),
        ]);
    });

    it("says why it could not identify the plots", async () => {
        serverAnswers({ error: "the model is not serving" });

        await new IdentifyStoryPlotsCommand().invoke(storyOfThreeCells());

        expect(shownMessages.at(-1)).toContain("Cannot identify the plots");
    });
});
